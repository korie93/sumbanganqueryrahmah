import { logger } from "../lib/logger";
import { ensureUsersBootstrapSchema } from "./users-bootstrap/schema";
import { seedUsersBootstrapDefaults } from "./users-bootstrap/seed";

export class UsersBootstrap {
  private ready = false;
  private initPromise: Promise<void> | null = null;
  private seedCompleted = false;
  private seedPromise: Promise<void> | null = null;

  async ensureTable(): Promise<void> {
    if (this.ready) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      try {
        await ensureUsersBootstrapSchema();
        this.ready = true;
      } catch (err: any) {
        logger.error("Failed to ensure users table", { error: err });
        throw err;
      }
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  async seedDefaultUsers(): Promise<void> {
    if (this.seedCompleted) return;
    if (this.seedPromise) {
      await this.seedPromise;
      return;
    }

    this.seedPromise = (async () => {
      await seedUsersBootstrapDefaults();
      this.seedCompleted = true;
    })();

    try {
      await this.seedPromise;
    } finally {
      this.seedPromise = null;
    }
  }
}
