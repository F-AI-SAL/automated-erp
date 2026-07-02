import { workerPool } from "@/lib/db/client";
import {
  sendMessage,
  downloadPhoto,
  type TelegramUpdate,
} from "./telegram.service";
import { getBranchByTelegramChat, linkTelegramChat } from "./link.service";
import { ingestSellSheet } from "./ingest.service";

const bdt = (n: number) => `৳${n.toLocaleString("en-US")}`;

const WELCOME =
  "👋 <b>Food Engineering ERP</b>\n\n" +
  "Send a photo of your daily sell-sheet and I'll record the sales and reply with today's profit.\n\n" +
  "First, link this chat to your branch:\n<code>/link YOUR-CODE</code>\n(find the code in your dashboard)\n\n" +
  "Commands: /profit — today's profit";

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
  await sendMessage(chatId, "📸 Reading your sell-sheet…");
  const { base64, mediaType } = await downloadPhoto(largest.file_id);

  const result = await ingestSellSheet({
    companyId: branch.company_id,
    branchId: branch.id,
    imageBase64: base64,
    mediaType,
    sourceHash: `tg-${largest.file_unique_id}`,
    sourceMsg: `telegram:${chatId}`,
  });

  if (result.duplicate) {
    await sendMessage(chatId, "✅ This sell-sheet was already recorded.");
    return;
  }
  if (!result.ok) {
    await sendMessage(
      chatId,
      "⚠️ I couldn't match any items to your menu.\n" +
        (result.itemsUnmatched.length
          ? `Unknown items: ${result.itemsUnmatched.join(", ")}\n`
          : "") +
        "Add these products in your dashboard, then resend.",
    );
    return;
  }

  const lines = [
    "✅ <b>Sell-sheet recorded!</b>",
    `🧾 ${result.itemsMatched} item(s) posted · ${bdt(result.matchedTotal)}`,
    result.profit !== null ? `📊 Today's profit: <b>${bdt(result.profit)}</b>` : "",
    result.itemsUnmatched.length
      ? `⚠️ ${result.itemsUnmatched.length} item(s) skipped (not on your menu): ${result.itemsUnmatched.join(", ")}`
      : "",
    `🤖 confidence ${(result.confidence * 100).toFixed(0)}%`,
  ].filter(Boolean);
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
