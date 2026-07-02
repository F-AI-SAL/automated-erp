import { extractDailyClosing } from "@/modules/ai/daily-closing.service";
import { recordDailyClosing, type RecordedClosing } from "@/modules/finance/daily-closing.service";
import type { ImageMediaType } from "@/modules/ai/ocr.service";

export interface DailyIngestResult extends RecordedClosing {
  saleTotal: number;
  saleCard: number;
  saleBkash: number;
  saleDue: number;
  openingCash: number;
  cashInHand: number;
  expenseCount: number;
  statedShortage: number;
  confidence: number;
}

/**
 * Channel-agnostic daily-closing ingestion: sheet image → OCR → reconcile → store.
 * Telegram (and later WhatsApp) call this with the photo + a dedup hash.
 */
export async function ingestDailyClosing(input: {
  companyId: string;
  branchId: string;
  imageBase64: string;
  mediaType: ImageMediaType;
  sourceHash: string;
  sourceMsg?: string;
}): Promise<DailyIngestResult> {
  const ocr = await extractDailyClosing({
    imageBase64: input.imageBase64,
    mediaType: input.mediaType,
    companyId: input.companyId,
    sourceMsg: input.sourceMsg,
  });

  const rec = await recordDailyClosing({
    companyId: input.companyId,
    branchId: input.branchId,
    data: ocr.data,
    source: "telegram_ai",
    sourceHash: input.sourceHash,
    raw: ocr.data,
  });

  return {
    ...rec,
    saleTotal: ocr.data.saleTotal,
    saleCard: ocr.data.saleCard,
    saleBkash: ocr.data.saleBkash,
    saleDue: ocr.data.saleDue,
    openingCash: ocr.data.openingCash,
    cashInHand: ocr.data.cashInHand,
    expenseCount: ocr.data.expenses.length,
    statedShortage: ocr.data.statedShortage,
    confidence: ocr.data.confidence,
  };
}
