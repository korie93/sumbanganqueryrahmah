import { z } from "zod";

export async function parseApiJson<TSchema extends z.ZodTypeAny>(
  response: Response,
  schema: TSchema,
  endpoint: string,
): Promise<z.infer<TSchema>> {
  const payload = await response.json();
  const parsed = schema.safeParse(payload);

  if (parsed.success) {
    return parsed.data;
  }

  throw new Error(`API contract mismatch for ${endpoint}`);
}
