import type { z } from "zod";

/** Keep the established UTF-16 limits when Zod counts Unicode code points. */
export function maxUtf16Length(
  maximum: number,
  message = `String must contain at most ${maximum} character(s)`,
) {
  return (value: string, ctx: z.RefinementCtx<string>) => {
    if (value.length > maximum) {
      ctx.addIssue({ code: "too_big", origin: "string", maximum, inclusive: true, message });
    }
  };
}
