DO $$
BEGIN
  IF to_regclass('public.ai_messages') IS NOT NULL THEN
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_created_at
      ON public.ai_messages (conversation_id, created_at)
    ';
  END IF;
END
$$;
