import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import type { AiConversationMessage } from "./ai-repository-types";

export async function createAiConversation(createdBy: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO public.ai_conversations (id, created_by, created_at)
    VALUES (${id}, ${createdBy}, ${new Date()})
  `);
  return id;
}

export async function saveAiConversationMessage(
  conversationId: string,
  role: "user" | "assistant" | "system",
  content: string,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO public.ai_messages (id, conversation_id, role, content, created_at)
    VALUES (${crypto.randomUUID()}, ${conversationId}, ${role}, ${content}, ${new Date()})
  `);
}

export async function getAiConversationMessages(
  conversationId: string,
  limit = 20,
): Promise<AiConversationMessage[]> {
  const result = await db.execute(sql`
    SELECT role, content
    FROM public.ai_messages
    WHERE conversation_id = ${conversationId}
    ORDER BY created_at ASC
    LIMIT ${limit}
  `);

  return result.rows as AiConversationMessage[];
}
