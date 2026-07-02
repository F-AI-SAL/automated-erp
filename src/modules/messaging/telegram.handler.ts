import { workerPool } from "@/lib/db/client";
import {
  sendMessage,
  downloadPhoto,
  type TelegramUpdate,
} from "./telegram.service";
import { getBranchByTelegramChat, linkTelegramChat } from "./link.service";
import { ingestDailyClosing } from "./daily-ingest.service";
import { parseClosingText, CLOSING_TEMPLATE } from "./closing-parser";
import { recordDailyClosing } from "@/modules/finance/daily-closing.service";

const bdt = (n: number) => `৳${n.toLocaleString("en-US")}`;

const WELCOME =
  "👋 <b>Food Engineering ERP</b>\n\n" +
  "Record your daily cash closing two ways:\n" +
  "• <b>Type it</b> (100% accurate) — send <code>/format</code> to get the template\n" +
  "• <b>Photo</b> — snap your sheet, I'll read it (best-effort)\n\n" +
  "First link this chat:\n<code>/link YOUR-CODE</code>\n\n" +
  "Commands: /format · /profit";

/**
 * Single entry point for a Telegram update — used by both the webhook route and
 * the local long-polling dev script. Always replies to the user.
 */
export async function handleUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg) return;
  const chatId = String(msg.chat.id);

  try {
    if (msg.photo && msg.photo.length > 0) {
      await handlePhoto(chatId, msg.photo);
    } else if (msg.text?.startsWith("/link ")) {
      await handleLink(chatId, msg.text.slice(6));
    } else if (msg.text === "/format") {
      await sendMessage(
        chatId,
        "Copy this, fill your numbers, send it back:\n\n" +
          `<code>${CLOSING_TEMPLATE}</code>\n\n` +
          "ℹ️ Fields <b>sale, card, bkash, due, opening, cash in hand</b> are the totals. " +
          "Every other <code>name amount</code> line is an expense — add as many as you like.",
      );
    } else if (/^\/(closing|entry)\b/i.test(msg.text ?? "")) {
      await handleClosingText(chatId, msg.text!);
    } else if (msg.text === "/profit" || /লাভ|profit/i.test(msg.text ?? "")) {
      await handleProfit(chatId);
    } else {
      await sendMessage(chatId, WELCOME);
    }
  } catch (err) {
    await sendMessage(chatId, `⚠️ ${err instanceof Error ? err.message : "something went wrong"}`);
  }
}

async function handleLink(chatId: string, code: string): Promise<void> {
  const branch = await linkTelegramChat(code, chatId);
  if (!branch) {
    await sendMessage(chatId, "❌ Invalid link code. Check your dashboard and try again.");
    return;
  }
  await sendMessage(
    chatId,
    `✅ Linked to <b>${branch.name}</b>.\nNow send a sell-sheet photo any time to record sales.`,
  );
}

async function handlePhoto(
  chatId: string,
  photos: { file_id: string; file_unique_id: string }[],
): Promise<void> {
  const branch = await getBranchByTelegramChat(chatId);
  if (!branch) {
    await sendMessage(chatId, "This chat isn't linked yet. Use <code>/link YOUR-CODE</code> first.");
    return;
  }

  const largest = photos[photos.length - 1]!; // Telegram sorts smallest→largest
  await sendMessage(chatId, "📸 Reading your daily sheet…");
  const { base64, mediaType } = await downloadPhoto(largest.file_id);

  const r = await ingestDailyClosing({
    companyId: branch.company_id,
    branchId: branch.id,
    imageBase64: base64,
    mediaType,
    sourceHash: `tg-${largest.file_unique_id}`,
    sourceMsg: `telegram:${chatId}`,
  });

  if (r.duplicate) {
    await sendMessage(chatId, "✅ This sheet was already recorded today.");
    return;
  }

  const shortLine =
    r.status === "short"
      ? `⚠️ <b>Short: ${bdt(r.shortage)}</b>`
      : r.status === "surplus"
        ? `💚 Surplus: ${bdt(-r.shortage)}`
        : "✅ Cash matched";

  const lines = [
    "✅ <b>Daily closing recorded!</b>",
    `💰 Sale: <b>${bdt(r.saleTotal)}</b>  (Cash ${bdt(r.saleCash)} · Card ${bdt(r.saleCard)} · bKash ${bdt(r.saleBkash)} · Panda ${bdt(r.salePanda)} · Due ${bdt(r.saleDue)})`,
    `🛒 Expenses: ${bdt(r.expensesTotal)}  (${r.expenseCount} items)`,
    `🏦 Opening ${bdt(r.openingCash)} · Add cash ${bdt(r.addedCash)} · Cash in hand ${bdt(r.cashInHand)}`,
    `🧮 Expected ${bdt(r.expectedCash)} → ${shortLine}`,
    r.statedShortage ? `📝 Sheet says short: ${bdt(r.statedShortage)}` : "",
    `🤖 confidence ${(r.confidence * 100).toFixed(0)}%`,
  ].filter(Boolean);
  await sendMessage(chatId, lines.join("\n"));
}

async function handleClosingText(chatId: string, text: string): Promise<void> {
  const branch = await getBranchByTelegramChat(chatId);
  if (!branch) {
    await sendMessage(chatId, "This chat isn't linked yet. Use <code>/link YOUR-CODE</code> first.");
    return;
  }

  const data = parseClosingText(text);
  if (data.saleTotal === 0 && data.cashInHand === 0 && data.expenses.length === 0) {
    await sendMessage(chatId, "⚠️ I couldn't read any numbers. Send <code>/format</code> for the template.");
    return;
  }

  // Idempotent on the exact content — resending the same text won't double-record.
  const { createHash } = await import("node:crypto");
  const sourceHash = `entry-${createHash("sha1").update(text.trim()).digest("hex").slice(0, 16)}`;

  const rec = await recordDailyClosing({
    companyId: branch.company_id,
    branchId: branch.id,
    data,
    source: "manual",
    sourceHash,
  });

  if (rec.duplicate) {
    await sendMessage(chatId, "✅ This entry was already recorded.");
    return;
  }

  const shortLine =
    rec.status === "short"
      ? `⚠️ <b>Short: ${bdt(rec.shortage)}</b>`
      : rec.status === "surplus"
        ? `💚 Surplus: ${bdt(-rec.shortage)}`
        : "✅ Cash matched";

  const lines = [
    "✅ <b>Daily closing recorded!</b> (typed — 100% accurate)",
    `💰 Sale: <b>${bdt(data.saleTotal)}</b>  (Cash ${bdt(rec.saleCash)} · Card ${bdt(data.saleCard)} · bKash ${bdt(data.saleBkash)} · Panda ${bdt(data.salePanda)} · Due ${bdt(data.saleDue)})`,
    `🛒 Expenses: ${bdt(rec.expensesTotal)}  (${data.expenses.length} items)`,
    `🏦 Opening ${bdt(data.openingCash)} · Add cash ${bdt(data.addedCash)} · Cash in hand ${bdt(data.cashInHand)}`,
    `🧮 Expected ${bdt(rec.expectedCash)} → ${shortLine}`,
  ];
  await sendMessage(chatId, lines.join("\n"));
}

async function handleProfit(chatId: string): Promise<void> {
  const branch = await getBranchByTelegramChat(chatId);
  if (!branch) {
    await sendMessage(chatId, "This chat isn't linked yet. Use <code>/link YOUR-CODE</code> first.");
    return;
  }
  const pnl = await workerPool.query<{ revenue: string; net_profit: string }>(
    `SELECT revenue, net_profit FROM profit_loss WHERE branch_id = $1 AND period = current_date`,
    [branch.id],
  );
  if (!pnl.rows[0]) {
    await sendMessage(chatId, `No sales recorded today for <b>${branch.name}</b> yet.`);
    return;
  }
  await sendMessage(
    chatId,
    `📊 <b>${branch.name}</b> — today\nRevenue: ${bdt(Number(pnl.rows[0].revenue))}\nProfit: <b>${bdt(Number(pnl.rows[0].net_profit))}</b>`,
  );
}
