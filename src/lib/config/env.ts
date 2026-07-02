import { z } from "zod";

/**
 * Central, validated environment config. Fail fast at boot if something is missing.
 * Import `env` everywhere instead of reading process.env directly.
 */
const schema = z.object({
  DATABASE_URL: z.string().url(),
  // The dispatcher must read outbox rows across ALL tenants, so it connects with a
  // role that bypasses RLS (Supabase `service_role`, or a BYPASSRLS Postgres role).
  // Falls back to DATABASE_URL for local dev where the default role is superuser.
  DISPATCHER_DATABASE_URL: z.string().url().optional(),

  JWT_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),

  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(), // OCR model; default claude-opus-4-8 (see ocr.service.ts)

  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  N8N_WEBHOOK_URL: z.string().url().optional(),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  DISPATCHER_POLL_INTERVAL_MS: z.coerce.number().default(2000),
  DISPATCHER_BATCH_SIZE: z.coerce.number().default(25),
  DISPATCHER_MAX_RETRIES: z.coerce.number().default(5),

  SENTRY_DSN: z.string().optional(),
});

export const env = schema.parse(process.env);
export type Env = z.infer<typeof schema>;
