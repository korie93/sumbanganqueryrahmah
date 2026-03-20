CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_created_at
ON public.ai_messages (conversation_id, created_at);
