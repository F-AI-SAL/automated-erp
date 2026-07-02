import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { handleUpdate } from "@/modules/messaging/telegram.handler";
import type { TelegramUpdate } from "@/modules/messaging/telegram.service";

/**
 * Telegram webhook. Register with:
 *   setWebhook(https://<host>/api/telegram/webhook)  (secret_token = TELEGRAM_WEBHOOK_SECRET)
 * Telegram sends the secret in the X-Telegram-Bot-Api-Secret-Token header.
 */
export async function POST(req: Request) {
  if (
    env.TELEGRAM_WEBHOOK_SECRET &&
    req.headers.get("x-telegram-bot-api-secret-token") !== env.TELEGRAM_WEBHOOK_SECRET
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const update = (await req.json()) as TelegramUpdate;
  await handleUpdate(update);
  return NextResponse.json({ ok: true }); // always 200 so Telegram doesn't retry
}
