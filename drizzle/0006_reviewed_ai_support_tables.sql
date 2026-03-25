CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id text PRIMARY KEY,
  created_by text NOT NULL,
  created_at timestamp DEFAULT now()
);

ALTER TABLE public.ai_conversations ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.ai_conversations ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();

UPDATE public.ai_conversations
SET created_at = COALESCE(created_at, now());

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamp DEFAULT now()
);

ALTER TABLE public.ai_messages ADD COLUMN IF NOT EXISTS conversation_id text;
ALTER TABLE public.ai_messages ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.ai_messages ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE public.ai_messages ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();

UPDATE public.ai_messages
SET created_at = COALESCE(created_at, now());

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_id
ON public.ai_messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_created_at
ON public.ai_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS public.ai_category_stats (
  key text PRIMARY KEY,
  total integer NOT NULL,
  samples jsonb,
  updated_at timestamp DEFAULT now()
);

ALTER TABLE public.ai_category_stats ADD COLUMN IF NOT EXISTS total integer;
ALTER TABLE public.ai_category_stats ADD COLUMN IF NOT EXISTS samples jsonb;
ALTER TABLE public.ai_category_stats ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();

UPDATE public.ai_category_stats
SET
  total = COALESCE(total, 0),
  updated_at = COALESCE(updated_at, now());

CREATE INDEX IF NOT EXISTS idx_ai_category_stats_updated_at
ON public.ai_category_stats(updated_at);

CREATE TABLE IF NOT EXISTS public.ai_category_rules (
  key text PRIMARY KEY,
  terms text[] NOT NULL DEFAULT '{}'::text[],
  fields text[] NOT NULL DEFAULT '{}'::text[],
  match_mode text NOT NULL DEFAULT 'contains',
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamp DEFAULT now()
);

ALTER TABLE public.ai_category_rules ADD COLUMN IF NOT EXISTS terms text[] DEFAULT '{}'::text[];
ALTER TABLE public.ai_category_rules ADD COLUMN IF NOT EXISTS fields text[] DEFAULT '{}'::text[];
ALTER TABLE public.ai_category_rules ADD COLUMN IF NOT EXISTS match_mode text DEFAULT 'contains';
ALTER TABLE public.ai_category_rules ADD COLUMN IF NOT EXISTS enabled boolean DEFAULT true;
ALTER TABLE public.ai_category_rules ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();

UPDATE public.ai_category_rules
SET
  terms = COALESCE(terms, '{}'::text[]),
  fields = COALESCE(fields, '{}'::text[]),
  match_mode = COALESCE(NULLIF(trim(COALESCE(match_mode, '')), ''), 'contains'),
  enabled = COALESCE(enabled, true),
  updated_at = COALESCE(updated_at, now());

CREATE INDEX IF NOT EXISTS idx_ai_category_rules_updated_at
ON public.ai_category_rules(updated_at);

INSERT INTO public.ai_category_rules (key, terms, fields, match_mode, enabled, updated_at)
VALUES
  (
    'kerajaan',
    ARRAY[
      'GOVERNMENT',
      'KERAJAAN',
      'PUBLIC SECTOR',
      'SECTOR AWAM',
      'KEMENTERIAN',
      'JABATAN',
      'AGENSI',
      'PERSEKUTUAN',
      'NEGERI',
      'MAJLIS',
      'KKM',
      'KPM',
      'KPT',
      'MOE',
      'MOH',
      'SEKOLAH',
      'GURU',
      'TEACHER',
      'CIKGU',
      'PENDIDIKAN'
    ]::text[],
    ARRAY[
      'NOB',
      'NATURE OF BUSINESS',
      'Nature of Business',
      'EMPLOYER NAME',
      'EmployerName',
      'Company',
      'Nama Majikan',
      'Majikan',
      'Department',
      'Agensi'
    ]::text[],
    'contains',
    true,
    now()
  ),
  (
    'hospital',
    ARRAY[
      'HEALTHCARE',
      'HOSPITAL',
      'CLINIC',
      'KLINIK',
      'KESIHATAN',
      'MEDICAL',
      'HEALTH'
    ]::text[],
    ARRAY[
      'NOB',
      'NATURE OF BUSINESS',
      'Nature of Business',
      'EMPLOYER NAME',
      'EmployerName',
      'Company',
      'Nama Majikan',
      'Majikan',
      'Department',
      'Agensi'
    ]::text[],
    'contains',
    true,
    now()
  ),
  (
    'hotel',
    ARRAY[
      'HOTEL',
      'HOSPITALITY',
      'RESORT',
      'INN',
      'MOTEL',
      'RESTAURANT',
      'SERVICE LINE',
      'HOTEL,RESTAURANT',
      'HOTEL & RESTAURANT'
    ]::text[],
    ARRAY[
      'NOB',
      'NATURE OF BUSINESS',
      'Nature of Business',
      'EMPLOYER NAME',
      'EmployerName',
      'Company',
      'Nama Majikan',
      'Majikan',
      'Department',
      'Agensi'
    ]::text[],
    'contains',
    true,
    now()
  ),
  (
    'polis',
    ARRAY[
      'POLIS',
      'POLICE',
      'PDRM',
      'IPD',
      'IPK',
      'ROYAL MALAYSIA POLICE'
    ]::text[],
    ARRAY[
      'NOB',
      'NATURE OF BUSINESS',
      'Nature of Business',
      'EMPLOYER NAME',
      'EmployerName',
      'Company',
      'Nama Majikan',
      'Majikan',
      'Department',
      'Agensi'
    ]::text[],
    'contains',
    true,
    now()
  ),
  (
    'tentera',
    ARRAY[
      'TENTERA',
      'ARMY',
      'MILITARY',
      'ARMED FORCES',
      'ATM',
      'TUDM',
      'TLDM',
      'TENTERA DARAT',
      'TENTERA LAUT',
      'TENTERA UDARA',
      'ANGKATAN TENTERA',
      'ANGKATAN TENTERA MALAYSIA',
      'MINDEF',
      'MINISTRY OF DEFENCE',
      'KEMENTERIAN PERTAHANAN',
      'DEFENCE',
      'PERTAHANAN'
    ]::text[],
    ARRAY[
      'NOB',
      'NATURE OF BUSINESS',
      'Nature of Business',
      'EMPLOYER NAME',
      'EmployerName',
      'Company',
      'Nama Majikan',
      'Majikan',
      'Department',
      'Agensi'
    ]::text[],
    'contains',
    true,
    now()
  ),
  (
    'swasta',
    ARRAY[
      'SWASTA',
      'PRIVATE',
      'SDN BHD',
      'BHD',
      'ENTERPRISE',
      'TRADING',
      'LTD',
      'PLC'
    ]::text[],
    ARRAY[
      'NOB',
      'NATURE OF BUSINESS',
      'Nature of Business',
      'EMPLOYER NAME',
      'EmployerName',
      'Company',
      'Nama Majikan',
      'Majikan',
      'Department',
      'Agensi'
    ]::text[],
    'complement',
    true,
    now()
  )
ON CONFLICT (key) DO UPDATE SET
  terms = EXCLUDED.terms,
  fields = EXCLUDED.fields,
  match_mode = EXCLUDED.match_mode,
  enabled = EXCLUDED.enabled,
  updated_at = now();
