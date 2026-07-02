import { env } from "@/lib/config/env";
import type { ImageMediaType } from "@/modules/ai/ocr.service";

/**
 * Thin Telegram Bot API client (fetch only, no SDK). Used by the webhook route
 * and the local long-polling dev script.
 */
const API = "https://api.telegram.org";

function token(): string {
  const t = env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN not set");
  return t;
}

export async function sendMessage(chatId: string | number, text: string): Promise<void> {
  await fetch(`${API}/bot${token()}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

/** Download a Telegram photo by file_id → base64 (Telegram photos are JPEG). */
export async function downloadPhoto(
  fileId: string,
): Promise<{ base64: string; mediaType: ImageMediaType }> {
  const meta = await fetch(`${API}/bot${token()}/getFile?file_id=${fileId}`).then((r) => r.json());
  const filePath = meta?.result?.file_path;
  if (!filePath) throw new Error("could not resolve Telegram file path");
  const bytes = await fetch(`${API}/file/bot${token()}/${filePath}`).then((r) => r.arrayBuffer());
  return { base64: Buffer.from(bytes).toString("base64"), mediaType: "image/jpeg" };
}

/** Long-poll for updates (local dev only; production uses the webhook). */
export async function getUpdates(offset: number): Promise<TelegramUpdate[]> {
  const res = await fetch(
    `${API}/bot${token()}/getUpdates?timeout=25&offset=${offset}`,
  ).then((r) => r.json());
  return (res?.result ?? []) as TelegramUpdate[];
}

/** Register the webhook URL with Telegram (call once after deploy). */
export async function setWebhook(url: string): Promise<unknown> {
  return fetch(`${API}/bot${token()}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, secret_token: env.TELEGRAM_WEBHOOK_SECRET }),
  }).then((r) => r.json());
}

// ── Minimal Telegram types (only what we use) ──
export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
}
export interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string; title?: string; first_name?: string };
  text?: string;
  photo?: TelegramPhotoSize[];
}
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}
