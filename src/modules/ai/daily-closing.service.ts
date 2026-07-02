import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "@/lib/config/env";
import { workerPool } from "@/lib/db/client";
import type { ImageMediaType } from "./ocr.service";

/**
 * Vision extraction for a handwritten DAILY CASH-CLOSING sheet (the real workflow):
 * total sale + payment-mode split, opening/closing cash, and every expense line.
 */
const MODEL = process.env.AI_MODEL ?? "claude-opus-4-8";

export const DailyClosingSchema = z.object({
  date: z.string().describe("Sheet date as YYYY-MM-DD if readable, else empty string"),
  saleTotal: z.number().describe("Total sale for the day"),
  saleCard: z.number().describe("Sale received by card (0 if none)"),
  saleBkash: z.number().describe("Sale received by bKash/mobile (0 if none)"),
  saleDue: z.number().describe("Sale on credit / due / বাকি (0 if none)"),
  openingCash: z.number().describe("Opening or petty cash at the start of the day (0 if not shown)"),
  addedCash: z.number().describe("Extra cash added into the drawer during the day (0 if not shown)"),
  cashInHand: z.number().describe("Actual cash counted at the end of day (0 if not shown)"),
  expenses: z
    .array(z.object({ name: z.string(), amount: z.number() }))
    .describe("Every expense / purchase / khoroch line: description + amount"),
  statedShortage: z
    .number()
    .describe("Shortage the sheet itself writes (e.g. 'short 126'); 0 if none"),
  confidence: z.number().describe("0 (guessing) to 1 (certain)"),
});
export type DailyClosing = z.infer<typeof DailyClosingSchema>;

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "date", "saleTotal", "saleCard", "saleBkash", "saleDue",
    "openingCash", "addedCash", "cashInHand", "expenses", "statedShortage", "confidence",
  ],
  properties: {
    date: { type: "string" },
    saleTotal: { type: "number" },
    saleCard: { type: "number" },
    saleBkash: { type: "number" },
    saleDue: { type: "number" },
    openingCash: { type: "number" },
    addedCash: { type: "number" },
    cashInHand: { type: "number" },
    expenses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "amount"],
        properties: { name: { type: "string" }, amount: { type: "number" } },
      },
    },
    statedShortage: { type: "number" },
    confidence: { type: "number" },
  },
} as const;

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const SYSTEM = [
  "You read handwritten daily CASH-CLOSING sheets from a Bangladeshi shop/restaurant.",
  "The sheet records the day's total sale, how it was received (cash / card / bKash / due=বাকি),",
  "the opening or petty cash, every expense/purchase line (name + amount, e.g. bazar, print, vendor bills),",
  "the cash counted in hand at day end, and sometimes a written shortage ('short').",
  "Amounts are Bangladeshi Taka. Read numbers exactly; if illegible, estimate and lower the confidence.",
].join(" ");

export interface DailyOcrResult {
  data: DailyClosing;
  model: string;
  tokens: { input: number; output: number };
  costUsd: number;
}

const PRICING: Record<string, { in: number; out: number }> = {
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};

export async function extractDailyClosing(input: {
  imageBase64: string;
  mediaType: ImageMediaType;
  companyId?: string;
  sourceMsg?: string;
}): Promise<DailyOcrResult> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
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
            text: "Extract this daily cash-closing sheet into structured data (sales split, opening/closing cash, all expense lines, stated shortage, confidence).",
          },
        ],
      },
    ],
    output_config: { format: { type: "json_schema", schema: JSON_SCHEMA } },
  });

  if (response.stop_reason === "refusal") throw new Error("extraction refused");
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`no text returned (stop_reason=${response.stop_reason})`);
  }
  const data = DailyClosingSchema.parse(JSON.parse(textBlock.text));

  const price = PRICING[MODEL] ?? PRICING["claude-opus-4-8"]!;
  const inTok = response.usage.input_tokens;
  const outTok = response.usage.output_tokens;
  const costUsd = (inTok * price.in + outTok * price.out) / 1_000_000;

  if (input.companyId) {
    await workerPool.query(
      `INSERT INTO ai_logs (company_id, source_msg, model, tokens, extracted, confidence, cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [input.companyId, input.sourceMsg ?? null, MODEL, inTok + outTok, JSON.stringify(data), data.confidence, costUsd],
    );
  }

  return { data, model: MODEL, tokens: { input: inTok, output: outTok }, costUsd };
}
