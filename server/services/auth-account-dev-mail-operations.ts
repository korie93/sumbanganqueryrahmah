import type { AuthenticatedUser } from "../auth/guards";
import { readOptionalString } from "../http/validation";
import {
  clearDevMailOutbox as clearDevMailOutboxFiles,
  deleteDevMailPreview as deleteDevMailPreviewFile,
  isDevMailOutboxEnabled,
  listDevMailPreviewsPage,
  readDevMailPreview,
  renderDevMailPreviewHtml,
} from "../mail/dev-mail-outbox";
import type { PostgresStorage } from "../storage-postgres";
import { readPaginationMeta } from "./auth-account-pagination-utils";
import { AuthAccountError } from "./auth-account-types";

type AuthAccountAdminUser = NonNullable<Awaited<ReturnType<PostgresStorage["getUser"]>>>;

type AuthAccountDevMailStorage = Pick<PostgresStorage, "createAuditLog">;

type AuthAccountDevMailOpsDeps = {
  storage: AuthAccountDevMailStorage;
  requireSuperuser: (authUser: AuthenticatedUser | undefined) => Promise<AuthAccountAdminUser>;
};

export class AuthAccountDevMailOperations {
  constructor(private readonly deps: AuthAccountDevMailOpsDeps) {}

  async getDevMailPreviewHtml(previewId: string) {
    if (!isDevMailOutboxEnabled()) {
      return null;
    }

    const preview = await readDevMailPreview(previewId);
    if (!preview) {
      return null;
    }

    return renderDevMailPreviewHtml(preview);
  }

  async listDevMailOutbox(
    authUser: AuthenticatedUser | undefined,
    query: Record<string, unknown> = {},
  ) {
    await this.deps.requireSuperuser(authUser);
    const { page, pageSize } = readPaginationMeta(query, {
      pageSize: 25,
      maxPageSize: 100,
    });
    const searchEmail = readOptionalString(query.searchEmail ?? query.email ?? query.searchTo);
    const searchSubject = readOptionalString(
      query.searchSubject ?? query.subject ?? query.search,
    );
    const sortDirection = String(readOptionalString(query.sortDirection) || "").toLowerCase() === "asc"
      ? "asc"
      : "desc";
    const previewPage = await listDevMailPreviewsPage({
      page,
      pageSize,
      searchEmail: searchEmail || undefined,
      searchSubject: searchSubject || undefined,
      sortDirection,
    });

    return {
      enabled: isDevMailOutboxEnabled(),
      previews: previewPage.previews,
      pagination: {
        page: previewPage.page,
        pageSize: previewPage.pageSize,
        total: previewPage.total,
        totalPages: previewPage.totalPages,
      },
    };
  }

  async deleteDevMailPreview(authUser: AuthenticatedUser | undefined, previewId: string) {
    const actor = await this.deps.requireSuperuser(authUser);
    const deleted = await deleteDevMailPreviewFile(previewId);

    if (!deleted) {
      throw new AuthAccountError(404, "MAIL_PREVIEW_NOT_FOUND", "Mail preview not found.");
    }

    await this.deps.storage.createAuditLog({
      action: "DEV_MAIL_OUTBOX_ENTRY_DELETED",
      performedBy: actor.username,
      targetResource: previewId,
      details: "Local mail outbox preview deleted.",
    });

    return {
      deleted: true,
    };
  }

  async clearDevMailOutbox(authUser: AuthenticatedUser | undefined) {
    const actor = await this.deps.requireSuperuser(authUser);
    const deletedCount = await clearDevMailOutboxFiles();

    await this.deps.storage.createAuditLog({
      action: "DEV_MAIL_OUTBOX_CLEARED",
      performedBy: actor.username,
      details: JSON.stringify({
        metadata: {
          deleted_count: deletedCount,
        },
      }),
    });

    return {
      deletedCount,
    };
  }
}
