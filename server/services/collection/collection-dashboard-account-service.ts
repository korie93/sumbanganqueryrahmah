import { z } from "zod";
import { badRequest, forbidden, notFound } from "../../http/errors";
import type { AuthenticatedUser } from "../../auth/guards";
import { CollectionServiceSupport } from "./collection-service-support";

export class CollectionDashboardAccountService extends CollectionServiceSupport {
  private async target(actor: AuthenticatedUser | undefined, userId: string) {
    if (this.requireUser(actor).role !== "superuser") throw forbidden("Only superusers may manage Dashboard nickname links.");
    const target = await this.storage.getUser(userId);
    if (!target || target.status === "deleted") throw notFound("Account not found.");
    if (target.role !== "user" && target.role !== "admin") throw badRequest("This role already sees all Collection totals.");
    return target;
  }

  async getLink(actor: AuthenticatedUser | undefined, userId: string) {
    const target = await this.target(actor, userId);
    const [link, nicknames] = await Promise.all([
      this.storage.getCollectionDashboardAccount(target.id),
      this.storage.getCollectionStaffNicknames({ activeOnly: true, allowedRole: target.role as "user" | "admin" }),
    ]);
    return { ok: true as const, link, nicknames: nicknames.map(({ id, nickname }) => ({ id, nickname })) };
  }

  async setLink(actor: AuthenticatedUser | undefined, userId: string, body: unknown) {
    const target = await this.target(actor, userId);
    const parsed = z.object({ nicknameId: z.guid().nullable() }).strict().safeParse(body);
    if (!parsed.success) throw badRequest("Choose a valid nickname or remove the link.");
    const link = await this.storage.setCollectionDashboardAccount({
      userId: target.id, nicknameId: parsed.data.nicknameId, actor: this.requireUser(actor).username,
    });
    return { ok: true as const, link };
  }
}
