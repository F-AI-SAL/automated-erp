/**
 * AI module — Claude-powered OCR + extraction for the WhatsApp sell-sheet pipeline.
 * Default model claude-opus-4-8 (override via AI_MODEL). Emits sale data that the
 * sales module posts through the same `postSale` path the manual API uses.
 */
export { extractSellSheet, SellSheetSchema } from "./ocr.service";
export type { SellSheet, OcrResult, ImageMediaType } from "./ocr.service";
