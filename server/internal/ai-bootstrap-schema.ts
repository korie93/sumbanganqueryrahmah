import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { logger } from "../lib/logger";
import { defaultAiCategoryRules, toTextArray } from "./ai-bootstrap-rule-seeds";

type AiBootstrapDatabase = Pick<typeof db, "execute">;

export async function ensureAiCoreTables(database: AiBootstrapDatabase = db): Promise<void> {
  await database.execute(sql`SET search_path TO public`);
  let pgcryptoAvailable = true;
  try {
    await database.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  } catch (error) {
    pgcryptoAvailable = false;
    logger.warn("pgcrypto extension is not available; AI text id defaults remain application-generated until it is installed", {
      error,
    });
  }

  let vectorAvailable = true;
  try {
    await database.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  } catch {
    vectorAvailable = false;
    logger.warn("pgvector extension is not available; embeddings are disabled until it is installed");
  }

  if (vectorAvailable) {
    await database.execute(sql`
      CREATE TABLE IF NOT EXISTS public.data_embeddings (
        id text PRIMARY KEY,
        import_id text NOT NULL,
        row_id text NOT NULL UNIQUE,
        content text NOT NULL,
        embedding vector(768) NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    if (pgcryptoAvailable) {
      await database.execute(sql`
        ALTER TABLE public.data_embeddings
        ALTER COLUMN id SET DEFAULT gen_random_uuid()::text
      `);
    }
    await database.execute(sql`ALTER TABLE public.data_embeddings ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now()`);
    await database.execute(sql`
      UPDATE public.data_embeddings
      SET created_at = COALESCE(created_at, now())
    `);
    await database.execute(sql`ALTER TABLE public.data_embeddings ALTER COLUMN created_at SET NOT NULL`);
    await database.execute(sql`
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
    await database.execute(sql`
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
    await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_data_embeddings_import_id ON public.data_embeddings(import_id)`);
    try {
      await database.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_data_embeddings_vector
        ON public.data_embeddings
        USING ivfflat (embedding vector_cosine_ops)
      `);
    } catch (err) {
      logger.warn("Failed to create ivfflat index", { error: err });
    }
  }

  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.ai_conversations (
      id text PRIMARY KEY,
      created_by text NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
  if (pgcryptoAvailable) {
    await database.execute(sql`
      ALTER TABLE public.ai_conversations
      ALTER COLUMN id SET DEFAULT gen_random_uuid()::text
    `);
  }
  await database.execute(sql`ALTER TABLE public.ai_conversations ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now()`);
  await database.execute(sql`
    UPDATE public.ai_conversations
    SET created_at = COALESCE(created_at, now())
  `);
  await database.execute(sql`ALTER TABLE public.ai_conversations ALTER COLUMN created_at SET NOT NULL`);
  await database.execute(sql`
    UPDATE public.ai_conversations conversation
    SET created_by = 'system'
    WHERE btrim(COALESCE(created_by, '')) = ''
      OR NOT EXISTS (
        SELECT 1
        FROM public.users app_user
        WHERE app_user.username = conversation.created_by
      )
  `);
  await database.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_ai_conversations_created_by_username'
      ) THEN
        ALTER TABLE public.ai_conversations
        ADD CONSTRAINT fk_ai_conversations_created_by_username
        FOREIGN KEY (created_by)
        REFERENCES public.users(username)
        ON UPDATE CASCADE
        ON DELETE CASCADE;
      END IF;
    END $$;
  `);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_ai_conversations_created_by ON public.ai_conversations(created_by)`);
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.ai_messages (
      id text PRIMARY KEY,
      conversation_id text NOT NULL,
      role text NOT NULL,
      content text NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
  if (pgcryptoAvailable) {
    await database.execute(sql`
      ALTER TABLE public.ai_messages
      ALTER COLUMN id SET DEFAULT gen_random_uuid()::text
    `);
  }
  await database.execute(sql`ALTER TABLE public.ai_messages ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now()`);
  await database.execute(sql`
    UPDATE public.ai_messages
    SET created_at = COALESCE(created_at, now())
  `);
  await database.execute(sql`ALTER TABLE public.ai_messages ALTER COLUMN created_at SET NOT NULL`);
  await database.execute(sql`
    DELETE FROM public.ai_messages msg
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.ai_conversations convo
      WHERE convo.id = msg.conversation_id
    )
  `);
  await database.execute(sql`
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
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_id ON public.ai_messages(conversation_id)`);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_created_at
    ON public.ai_messages(conversation_id, created_at)
  `);
}

export async function ensureAiCategoryStatsSchema(database: AiBootstrapDatabase = db): Promise<void> {
  await database.execute(sql`SET search_path TO public`);
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.ai_category_stats (
      key text PRIMARY KEY,
      total integer NOT NULL,
      samples jsonb,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
  await database.execute(sql`ALTER TABLE public.ai_category_stats ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now()`);
  await database.execute(sql`
    UPDATE public.ai_category_stats
    SET updated_at = COALESCE(updated_at, now())
  `);
  await database.execute(sql`ALTER TABLE public.ai_category_stats ALTER COLUMN updated_at SET NOT NULL`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_ai_category_stats_updated_at ON public.ai_category_stats(updated_at)`);
}

export async function ensureAiCategoryRulesSchema(database: AiBootstrapDatabase = db): Promise<void> {
  await database.execute(sql`SET search_path TO public`);
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.ai_category_rules (
      key text PRIMARY KEY,
      terms text[] NOT NULL DEFAULT '{}',
      fields text[] NOT NULL DEFAULT '{}',
      match_mode text NOT NULL DEFAULT 'contains',
      enabled boolean NOT NULL DEFAULT true,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
  await database.execute(sql`ALTER TABLE public.ai_category_rules ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now()`);
  await database.execute(sql`
    UPDATE public.ai_category_rules
    SET updated_at = COALESCE(updated_at, now())
  `);
  await database.execute(sql`ALTER TABLE public.ai_category_rules ALTER COLUMN updated_at SET NOT NULL`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_ai_category_rules_updated_at ON public.ai_category_rules(updated_at)`);

  for (const rule of defaultAiCategoryRules) {
    const termsSql = toTextArray(rule.terms || []);
    const fieldsSql = toTextArray(rule.fields || []);
    await database.execute(sql`
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
