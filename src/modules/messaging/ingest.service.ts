import { extractSellSheet, type ImageMediaType } from "@/modules/ai/ocr.service";
import { findProductByName } from "@/modules/sales/products.service";
import { postSale } from "@/modules/sales/sales.service";
import { workerPool } from "@/lib/db/client";
import { registerAllHandlers } from "@/modules/bootstrap";
import { dispatchOnce } from "@/workers/dispatcher/dispatcher";

export interface IngestResult {
  ok: boolean;
  duplicate: boolean;
  itemsMatched: number;
  itemsUnmatched: string[];
  matchedTotal: number; // value of the items actually posted
  sheetTotal: number; // OCR grand total of the whole sheet (for reference)
  profit: number | null;
  confidence: number;
}

/**
 * The wow-loop core (channel-agnostic): sell-sheet image → OCR → map line items
 * to menu products → postSale (telegram_ai) → drain events (stock + P&L) → summary.
 * WhatsApp will call this exact function with its own image + sourceHash.
 */
export async function ingestSellSheet(input: {
  companyId: string;
  branchId: string;
  imageBase64: string;
  mediaType: ImageMediaType;
  sourceHash: string;
  sourceMsg?: string;
}): Promise<IngestResult> {
  registerAllHandlers();
  const ocr = await extractSellSheet({
    imageBase64: input.imageBase64,
    mediaType: input.mediaType,
    companyId: input.companyId,
    sourceMsg: input.sourceMsg,
  });

  const matched: Array<{ productId: string; qty: number; unitPrice: number }> = [];
  const unmatched: string[] = [];
  for (const item of ocr.data.items) {
    const product = await findProductByName(input.companyId, item.name);
    if (product) matched.push({ productId: product.id, qty: item.qty, unitPrice: item.unitPrice });
    else unmatched.push(item.name);
  }

  const sheetTotal = ocr.data.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const matchedTotal = matched.reduce((s, i) => s + i.qty * i.unitPrice, 0);

  if (matched.length === 0) {
    return {
      ok: false,
      duplicate: false,
      itemsMatched: 0,
      itemsUnmatched: unmatched,
      matchedTotal: 0,
      sheetTotal,
      profit: null,
      confidence: ocr.data.confidence,
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const { saleId } = await postSale({
    companyId: input.companyId,
    branchId: input.branchId,
    saleDate: ocr.data.saleDate?.match(/^\d{4}-\d{2}-\d{2}$/) ? ocr.data.saleDate : today,
    source: "telegram_ai",
    sourceHash: input.sourceHash,
    items: matched,
  });

  // Drain the outbox inline so we can reply with today's profit immediately.
  for (let i = 0; i < 5; i++) await dispatchOnce();

  const pnl = await workerPool.query<{ net_profit: string }>(
    `SELECT net_profit FROM profit_loss WHERE branch_id = $1 AND period = current_date`,
    [input.branchId],
  );
  const profit = pnl.rows[0] ? Number(pnl.rows[0].net_profit) : null;

  return {
    ok: true,
    duplicate: saleId === null, // idempotent: re-sent photo
    itemsMatched: matched.length,
    itemsUnmatched: unmatched,
    matchedTotal,
    sheetTotal,
    profit,
    confidence: ocr.data.confidence,
  };
}
