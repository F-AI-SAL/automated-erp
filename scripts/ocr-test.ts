import { readFileSync } from "node:fs";
import { extractSellSheet, type ImageMediaType } from "@/modules/ai/ocr.service";

/**
 * Manual OCR check (NOT in CI — needs ANTHROPIC_API_KEY and costs money).
 * Usage: npm run test:ocr -- path/to/sellsheet.png
 */
async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("usage: npm run test:ocr -- <image path>");

  const media: ImageMediaType = path.endsWith(".png")
    ? "image/png"
    : path.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";

  const b64 = readFileSync(path).toString("base64");
  const t0 = Date.now();
  const res = await extractSellSheet({ imageBase64: b64, mediaType: media });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  console.log("=== EXTRACTED ===");
  console.log(JSON.stringify(res.data, null, 2));
  const computed = res.data.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  console.log("=== META ===");
  console.log(`model=${res.model}  ${secs}s  tokens=${res.tokens.input}in/${res.tokens.output}out  cost=$${res.costUsd.toFixed(4)}`);
  console.log(`confidence=${res.data.confidence}  stated total=${res.data.total}  computed line-sum=${computed}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌", err instanceof Error ? err.message : err);
    process.exit(1);
  });
