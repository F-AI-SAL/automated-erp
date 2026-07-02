/**
 * Messaging module — channel-agnostic sell-sheet ingestion.
 * Telegram is the first channel; WhatsApp plugs into the same `ingestSellSheet`.
 */
export { handleUpdate } from "./telegram.handler";
export { ingestSellSheet } from "./ingest.service";
export type { IngestResult } from "./ingest.service";
export { getBranchByTelegramChat, linkTelegramChat } from "./link.service";
export { sendMessage, setWebhook } from "./telegram.service";
