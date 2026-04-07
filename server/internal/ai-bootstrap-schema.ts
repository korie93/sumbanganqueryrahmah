import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { logger } from "../lib/logger";
import { defaultAiCategoryRules, toTextArray } from "./ai-bootstrap-rule-seeds";

export async function ensureAiCoreTables(): Promise<void> {
  await db.execute(sql`SET search_path TO public`);
  let vectorAvailable = true;
  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  } catch {
    vectorAvailable = false;
    logger.warn("pgvector extension is not available; embeddings are disabled until it is installed");
  }

  if (vectorAvailable) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS public.data_embeddings (
        id text PRIMARY KEY,
        import_id text NOT NULL,
        row_id text NOT NULL UNIQUE,
        content text NOT NULL,
        embedding vector(768) NOT NULL,
        created_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`
      DELETE FROM public.data_embeddings embedding
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.imports imp
        WHERE imp.id = embedding.import_id
      )
      OR NOT EXISTS (
        SELECT 1
        FROM public.data_rows row_data
        WHERE row_data.id = embedding.row_id
      )
    `);
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_data_embeddings_import_id'
        ) THEN
          ALTER TABLE public.data_embeddings
          ADD CONSTRAINT fk_data_embeddings_import_id
          FOREIGN KEY (import_id)
          REFERENCES public.imports(id)
          ON UPDATE CASCADE
          ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_data_embeddings_row_id'
        ) THEN
          ALTER TABLE public.data_embeddings
          ADD CONSTRAINT fk_data_embeddings_row_id
          FOREIGN KEY (row_id)
          REFERENCES public.data_rows(id)
          ON UPDATE CASCADE
          ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_data_embeddings_import_id ON public.data_embeddings(import_id)`);
    try {
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_data_embeddings_vector
        ON public.data_embeddings
        USING ivfflat (embedding vector_cosine_ops)
      `);
    } catch (err: any) {
      logger.warn("Failed to create ivfflat index", { error: err });
    }
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.ai_conversations (
      id text PRIMARY KEY,
      created_by text NOT NULL,
      created_at timestamp DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.ai_messages (
      id text PRIMARY KEY,
      conversation_id text NOT NULL,
      role text NOT NULL,
      content text NOT NULL,
      created_at timestamp DEFAULT now()
    )
  `);
  await db.execute(sql`
    DELETE FROM public.ai_messages msg
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.ai_conversations convo
      WHERE convo.id = msg.conversation_id
    )
  `);
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_ai_messages_conversation_id'
      ) THEN
        ALTER TABLE public.ai_messages
        ADD CONSTRAINT fk_ai_messages_conversation_id
        FOREIGN KEY (conversation_id)
        REFERENCES public.ai_conversations(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE;
      END IF;
    END $$;
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_id ON public.ai_messages(conversation_id)`);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_created_at
    ON public.ai_messages(conversation_id, created_at)
  `);
}

export async function ensureAiCategoryStatsSchema(): Promise<void> {
  await db.execute(sql`SET search_path TO public`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.ai_category_stats (
      key text PRIMARY KEY,
      total integer NOT NULL,
      samples jsonb,
      updated_at timestamp DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ai_category_stats_updated_at ON public.ai_category_stats(updated_at)`);
}

export async function ensureAiCategoryRulesSchema(): Promise<void> {
  await db.execute(sql`SET search_path TO public`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.ai_category_rules (
      key text PRIMARY KEY,
      terms text[] NOT NULL DEFAULT '{}',
      fields text[] NOT NULL DEFAULT '{}',
      match_mode text NOT NULL DEFAULT 'contains',
      enabled boolean NOT NULL DEFAULT true,
      updated_at timestamp DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ai_category_rules_updated_at ON public.ai_category_rules(updated_at)`);

  for (const rule of defaultAiCategoryRules) {
    const termsSql = toTextArray(rule.terms || []);
    const fieldsSql = toTextArray(rule.fields || []);
    await db.execute(sql`
      INSERT INTO public.ai_category_rules (key, terms, fields, match_mode, enabled, updated_at)
      VALUES (${rule.key}, ${termsSql}, ${fieldsSql}, ${rule.matchMode ?? "contains"}, ${rule.enabled ?? true}, now())
      ON CONFLICT (key) DO UPDATE SET
        terms = EXCLUDED.terms,
        fields = EXCLUDED.fields,
        match_mode = EXCLUDED.match_mode,
        enabled = EXCLUDED.enabled,
        updated_at = now()
    `);
  }
}
