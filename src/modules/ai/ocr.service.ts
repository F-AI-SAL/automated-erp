import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "@/lib/config/env";
import { workerPool } from "@/lib/db/client";

/**
 * Vision OCR + extraction for restaurant daily sell-sheets, powered by Claude.
 * Default model is claude-opus-4-8 (best accuracy on handwriting/photos); override
 * with AI_MODEL=claude-sonnet-5 or claude-haiku-4-5 to trade accuracy for cost.
 */
const MODEL = process.env.AI_MODEL ?? "claude-opus-4-8";

/** Structured shape the model must return. */
export const SellSheetSchema = z.object({
  saleDate: z
    .string()
    .describe("Sale date as YYYY-MM-DD if visible on the sheet, else an empty string"),
  items: z
    .array(
      z.object({
        name: z.string().describe("Menu item name exactly as written"),
        qty: z.number().describe("Quantity sold"),
        unitPrice: z.number().describe("Price per unit"),
      }),
    )
    .describe("Every line item on the sheet"),
  total: z.number().describe("Grand total as written on the sheet"),
  confidence: z
    .number()
    .describe("Your confidence in this extraction, 0 (guessing) to 1 (certain)"),
});
export type SellSheet = z.infer<typeof SellSheetSchema>;

/**
 * JSON Schema sent to the model for structured outputs (constrains the response).
 * additionalProperties:false + required on every object is mandatory for strict mode.
 */
const SELL_SHEET_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["saleDate", "items", "total", "confidence"],
  properties: {
    saleDate: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "qty", "unitPrice"],
        properties: {
          name: { type: "string" },
          qty: { type: "number" },
          unitPrice: { type: "number" },
        },
      },
    },
    total: { type: "number" },
    confidence: { type: "number" },
  },
} as const;

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp";

export interface OcrResult {
  data: SellSheet;
  model: string;
  tokens: { input: number; output: number };
  costUsd: number;
}

// $ per 1M tokens (input, output). Keep in sync with the model you run.
const PRICING: Record<string, { in: number; out: number }> = {
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const SYSTEM = [
  "You are an OCR and data-extraction engine for restaurant daily sell-sheets.",
  "The image is a photo or scan of a handwritten or printed sheet listing items sold today.",
  "Read every line item (name, quantity, unit price) and the grand total.",
  "Numbers must be exact. If a value is illegible, make your best estimate and lower the confidence.",
].join(" ");

/**
 * Extract structured sales data from a sell-sheet image. Optionally logs the call
 * to `ai_logs` for the tenant (cost/token/audit trail).
 */
export async function extractSellSheet(input: {
  imageBase64: string;
  mediaType: ImageMediaType;
  companyId?: string;
  sourceMsg?: string;
  imageUrl?: string;
}): Promise<OcrResult> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: input.mediaType, data: input.imageBase64 },
          },
          {
            type: "text",
            text: "Extract the sell-sheet into structured data (date, line items, grand total, confidence).",
          },
        ],
      },
    ],
    output_config: { format: { type: "json_schema", schema: SELL_SHEET_JSON_SCHEMA } },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("OCR extraction refused by safety classifier");
  }
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`OCR extraction returned no text (stop_reason=${response.stop_reason})`);
  }
  // Structured outputs guarantees schema-valid JSON; validate again with Zod for safety.
  const data = SellSheetSchema.parse(JSON.parse(textBlock.text));

  const price = PRICING[MODEL] ?? PRICING["claude-opus-4-8"]!;
  const inTok = response.usage.input_tokens;
  const outTok = response.usage.output_tokens;
  const costUsd = (inTok * price.in + outTok * price.out) / 1_000_000;

  if (input.companyId) {
    await workerPool.query(
      `INSERT INTO ai_logs (company_id, source_msg, image_url, model, tokens, extracted, confidence, cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.companyId,
        input.sourceMsg ?? null,
        input.imageUrl ?? null,
        MODEL,
        inTok + outTok,
        JSON.stringify(data),
        data.confidence,
        costUsd,
      ],
    );
  }

  return { data, model: MODEL, tokens: { input: inTok, output: outTok }, costUsd };
}
