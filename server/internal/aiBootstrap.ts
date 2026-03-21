import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { logger } from "../lib/logger";

type AiRuleSeed = {
  key: string;
  terms: string[];
  fields: string[];
  matchMode?: string;
  enabled?: boolean;
};

export class AiBootstrap {
  private aiReady = false;
  private aiInitPromise: Promise<void> | null = null;
  private categoryStatsReady = false;
  private categoryStatsInitPromise: Promise<void> | null = null;
  private categoryRulesReady = false;
  private categoryRulesInitPromise: Promise<void> | null = null;

  async ensureAiTables(): Promise<void> {
    if (this.aiReady) return;
    if (this.aiInitPromise) {
      await this.aiInitPromise;
      return;
    }

    this.aiInitPromise = (async () => {
      try {
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
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_id ON public.ai_messages(conversation_id)`);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_created_at
          ON public.ai_messages(conversation_id, created_at)
        `);

        this.aiReady = true;
      } catch (err: any) {
        logger.error("Failed to ensure AI tables", { error: err });
      }
    })();

    try {
      await this.aiInitPromise;
    } finally {
      this.aiInitPromise = null;
    }
  }

  async ensureCategoryStatsTable(): Promise<void> {
    if (this.categoryStatsReady) return;
    if (this.categoryStatsInitPromise) {
      await this.categoryStatsInitPromise;
      return;
    }

    this.categoryStatsInitPromise = (async () => {
      try {
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

        this.categoryStatsReady = true;
      } catch (err: any) {
        logger.error("Failed to ensure AI category stats table", { error: err });
      }
    })();

    try {
      await this.categoryStatsInitPromise;
    } finally {
      this.categoryStatsInitPromise = null;
    }
  }

  async ensureCategoryRulesTable(): Promise<void> {
    if (this.categoryRulesReady) return;
    if (this.categoryRulesInitPromise) {
      await this.categoryRulesInitPromise;
      return;
    }

    this.categoryRulesInitPromise = (async () => {
      try {
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

        const defaultFields = [
          "NOB",
          "NATURE OF BUSINESS",
          "Nature of Business",
          "EMPLOYER NAME",
          "EmployerName",
          "Company",
          "Nama Majikan",
          "Majikan",
          "Department",
          "Agensi",
        ];

        const defaults: AiRuleSeed[] = [
          {
            key: "kerajaan",
            terms: [
              "GOVERNMENT",
              "KERAJAAN",
              "PUBLIC SECTOR",
              "SECTOR AWAM",
              "KEMENTERIAN",
              "JABATAN",
              "AGENSI",
              "PERSEKUTUAN",
              "NEGERI",
              "MAJLIS",
              "KKM",
              "KPM",
              "KPT",
              "MOE",
              "MOH",
              "SEKOLAH",
              "GURU",
              "TEACHER",
              "CIKGU",
              "PENDIDIKAN",
            ],
            fields: defaultFields,
            matchMode: "contains",
            enabled: true,
          },
          {
            key: "hospital",
            terms: [
              "HEALTHCARE",
              "HOSPITAL",
              "CLINIC",
              "KLINIK",
              "KESIHATAN",
              "MEDICAL",
              "HEALTH",
            ],
            fields: defaultFields,
            matchMode: "contains",
            enabled: true,
          },
          {
            key: "hotel",
            terms: [
              "HOTEL",
              "HOSPITALITY",
              "RESORT",
              "INN",
              "MOTEL",
              "RESTAURANT",
              "SERVICE LINE",
              "HOTEL,RESTAURANT",
              "HOTEL & RESTAURANT",
            ],
            fields: defaultFields,
            matchMode: "contains",
            enabled: true,
          },
          {
            key: "polis",
            terms: ["POLIS", "POLICE", "PDRM", "IPD", "IPK", "ROYAL MALAYSIA POLICE"],
            fields: defaultFields,
            matchMode: "contains",
            enabled: true,
          },
          {
            key: "tentera",
            terms: [
              "TENTERA",
              "ARMY",
              "MILITARY",
              "ARMED FORCES",
              "ATM",
              "TUDM",
              "TLDM",
              "TENTERA DARAT",
              "TENTERA LAUT",
              "TENTERA UDARA",
              "ANGKATAN TENTERA",
              "ANGKATAN TENTERA MALAYSIA",
              "MINDEF",
              "MINISTRY OF DEFENCE",
              "KEMENTERIAN PERTAHANAN",
              "DEFENCE",
              "PERTAHANAN",
            ],
            fields: defaultFields,
            matchMode: "contains",
            enabled: true,
          },
          {
            key: "swasta",
            terms: ["SWASTA", "PRIVATE", "SDN BHD", "BHD", "ENTERPRISE", "TRADING", "LTD", "PLC"],
            fields: defaultFields,
            matchMode: "complement",
            enabled: true,
          },
        ];

        const toTextArray = (values: string[]) => {
          if (!values.length) return sql`'{}'::text[]`;
          const joined = sql.join(values.map((value) => sql`${value}`), sql`, `);
          return sql`ARRAY[${joined}]::text[]`;
        };

        for (const rule of defaults) {
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

        this.categoryRulesReady = true;
      } catch (err: any) {
        logger.error("Failed to ensure AI category rules table", { error: err });
      }
    })();

    try {
      await this.categoryRulesInitPromise;
    } finally {
      this.categoryRulesInitPromise = null;
    }
  }
}
