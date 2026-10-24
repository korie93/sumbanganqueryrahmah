import crypto from "crypto";
import { sql, type SQLWrapper } from "drizzle-orm";
import { db } from "../db-postgres";
import { notFound } from "../http/errors";
import type { AiConversationMessage } from "./ai-repository-types";
import { buildAiConversationOwnerKey } from "../auth/ai-conversation-owner";

type ConversationExecutor = {
  execute(query: string | SQLWrapper): Promise<{ rows?: unknown[] }>;
};

export async function createAiConversation(
  ownerUserId: string,
  executor: ConversationExecutor = db,
): Promise<string> {
  const id = crypto.randomUUID();
  const ownerKey = buildAiConversationOwnerKey(ownerUserId);
  await executor.execute(sql`
    INSERT INTO public.ai_conversations (id, created_by, created_at)
    VALUES (${id}, ${ownerKey}, ${new Date()})
  `);
  return id;
}

export async function assertAiConversationOwner(
  conversationId: string,
  ownerUserId: string,
  executor: ConversationExecutor = db,
): Promise<void> {
  const ownerKey = buildAiConversationOwnerKey(ownerUserId);
  const result = await executor.execute(sql`
    SELECT id FROM public.ai_conversations
    WHERE id = ${conversationId} AND created_by = ${ownerKey}
  `);
  if (!result.rows?.length) {
    throw notFound("Conversation not found.");
  }
}

export async function saveAiConversationMessage(
  conversationId: string,
  ownerUserId: string,
  role: "user" | "assistant" | "system",
  content: string,
  executor: ConversationExecutor = db,
): Promise<void> {
  const ownerKey = buildAiConversationOwnerKey(ownerUserId);
  // Check ownership in the write itself, even if the service checked earlier.
  const result = await executor.execute(sql`
    INSERT INTO public.ai_messages (id, conversation_id, role, content, created_at)
    SELECT ${crypto.randomUUID()}, conversation.id, ${role}, ${content}, ${new Date()}
    FROM public.ai_conversations AS conversation
    WHERE conversation.id = ${conversationId} AND conversation.created_by = ${ownerKey}
    RETURNING id
  `);
  if (!result.rows?.length) {
    throw notFound("Conversation not found.");
  }
}

export async function getAiConversationMessages(
  conversationId: string,
  ownerUserId: string,
  limit = 20,
  executor: ConversationExecutor = db,
): Promise<AiConversationMessage[]> {
  const ownerKey = buildAiConversationOwnerKey(ownerUserId);
  const result = await executor.execute(sql`
    SELECT message.role, message.content
    FROM public.ai_conversations AS conversation
    LEFT JOIN LATERAL (
      SELECT role, content, created_at FROM public.ai_messages
      WHERE conversation_id = conversation.id
      ORDER BY created_at ASC
      LIMIT ${limit}
    ) AS message ON true
    WHERE conversation.id = ${conversationId} AND conversation.created_by = ${ownerKey}
    ORDER BY message.created_at ASC
  `);

  if (!result.rows?.length) {
    throw notFound("Conversation not found.");
  }
  // An owned conversation with no history still produces one outer-join row.
  return (result.rows as Array<{ role: string | null; content: string | null }>)
    .filter((row): row is AiConversationMessage => row.role !== null && row.content !== null);
}
