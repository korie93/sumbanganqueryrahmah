import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { count, sql } from "drizzle-orm";
import { users } from "../../../shared/schema-postgres";
import { normalizeUserRole } from "../../auth/account-lifecycle";
import { shouldSeedDefaultUsers } from "../../config/security";
import { db } from "../../db-postgres";
import { logger } from "../../lib/logger";
import { USERS_BOOTSTRAP_BCRYPT_COST } from "./constants";
import { writeLocalSuperuserCredentialsFile } from "./credentials-file";
import {
  isUsersBootstrapStrictLocalDevelopmentEnvironment,
  readUsersBootstrapBooleanFlag,
} from "./runtime";

type SeedableUser = {
  username: string;
  password: string;
  fullName: string;
  role: string;
};

function resolveConfiguredSeedUsers(): SeedableUser[] {
  return [
    {
      username: process.env.SEED_SUPERUSER_USERNAME || "superuser",
      password: process.env.SEED_SUPERUSER_PASSWORD || "",
      fullName: process.env.SEED_SUPERUSER_FULL_NAME || "Superuser",
      role: "superuser",
    },
    {
      username: process.env.SEED_ADMIN_USERNAME || "admin1",
      password: process.env.SEED_ADMIN_PASSWORD || "",
      fullName: process.env.SEED_ADMIN_FULL_NAME || "Admin",
      role: "admin",
    },
    {
      username: process.env.SEED_USER_USERNAME || "user1",
      password: process.env.SEED_USER_PASSWORD || "",
      fullName: process.env.SEED_USER_FULL_NAME || "User",
      role: "user",
    },
  ].filter((user) => Boolean(String(user.password || "").trim()));
}

function dedupeSeedUsers(usersList: SeedableUser[]): SeedableUser[] {
  return Array.from(
    new Map(
      usersList.map((user) => [String(user.username || "").trim().toLowerCase(), user]),
    ).values(),
  );
}

export function shouldRunFreshLocalUsersBootstrap(params: {
  shouldSeedConfiguredUsers: boolean;
  existingUserCount: number;
  isStrictLocalDevelopment: boolean;
}): boolean {
  return !params.shouldSeedConfiguredUsers
    && Number(params.existingUserCount || 0) === 0
    && params.isStrictLocalDevelopment;
}

export async function seedUsersBootstrapDefaults(): Promise<void> {
  const shouldSeedConfiguredUsers = shouldSeedDefaultUsers();
  const [{ value: existingUserCount }] = await db.select({ value: count() }).from(users);
  const isFreshLocalBootstrap = shouldRunFreshLocalUsersBootstrap({
    shouldSeedConfiguredUsers,
    existingUserCount: Number(existingUserCount || 0),
    isStrictLocalDevelopment: isUsersBootstrapStrictLocalDevelopmentEnvironment(),
  });
  let localSuperuserCredentialsFilePath: string | null = null;

  const defaultUsers = resolveConfiguredSeedUsers();

  if (isFreshLocalBootstrap) {
    const bootstrapUsername = process.env.SEED_SUPERUSER_USERNAME || "superuser";
    const bootstrapPassword = String(process.env.SEED_SUPERUSER_PASSWORD || "").trim();
    if (!bootstrapPassword) {
      throw new Error(
        "Fresh local bootstrap requires SEED_SUPERUSER_PASSWORD. Temporary credential generation and disk output are disabled by default.",
      );
    }

    const shouldWriteCredentialsFile = readUsersBootstrapBooleanFlag(
      "LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED",
      false,
    );
    if (shouldWriteCredentialsFile) {
      if (!isUsersBootstrapStrictLocalDevelopmentEnvironment()) {
        throw new Error(
          "Refusing to write local superuser credentials file outside strict local development mode.",
        );
      }
      localSuperuserCredentialsFilePath = await writeLocalSuperuserCredentialsFile({
        username: bootstrapUsername,
        password: bootstrapPassword,
      });
    }

    defaultUsers.push({
      username: bootstrapUsername,
      password: bootstrapPassword,
      fullName: process.env.SEED_SUPERUSER_FULL_NAME || "Local Superuser",
      role: "superuser",
    });
  } else if (!shouldSeedConfiguredUsers) {
    return;
  }

  const dedupedDefaultUsers = dedupeSeedUsers(defaultUsers);
  for (const user of dedupedDefaultUsers) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.username}) = lower(${user.username})`)
      .limit(1);

    if (existing[0]) {
      continue;
    }

    const now = new Date();
    const hashedPassword = await bcrypt.hash(user.password, USERS_BOOTSTRAP_BCRYPT_COST);
    await db.insert(users).values({
      id: randomUUID(),
      username: user.username,
      fullName: user.fullName,
      passwordHash: hashedPassword,
      role: normalizeUserRole(user.role),
      status: "active",
      mustChangePassword: isFreshLocalBootstrap && user.role === "superuser",
      passwordResetBySuperuser: isFreshLocalBootstrap && user.role === "superuser",
      createdBy: "system-bootstrap",
      createdAt: now,
      updatedAt: now,
      passwordChangedAt: now,
      activatedAt: now,
      isBanned: false,
    });
  }

  if (localSuperuserCredentialsFilePath) {
    logger.warn("Bootstrapped a local superuser account and wrote credentials to an explicitly enabled local file", {
      username: process.env.SEED_SUPERUSER_USERNAME || "superuser",
      credentialsFilePath: localSuperuserCredentialsFilePath,
    });
    logger.warn("Credential-file output should be treated as temporary local development material", {
      credentialsFilePath: localSuperuserCredentialsFilePath,
    });
  }
}

