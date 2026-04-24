import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { count, sql } from "drizzle-orm";
import { users } from "../../../shared/schema-postgres";
import { normalizeUserRole } from "../../auth/account-lifecycle";
import { runtimeConfig } from "../../config/runtime";
import { shouldSeedDefaultUsers } from "../../config/security";
import { db } from "../../db-postgres";
import { logger } from "../../lib/logger";
import {
  USERS_BOOTSTRAP_BCRYPT_COST,
  USERS_BOOTSTRAP_SYSTEM_ACTOR_USERNAME,
} from "./constants";
import { writeLocalSuperuserCredentialsFile } from "./credentials-file";
import { isUsersBootstrapStrictLocalDevelopmentEnvironment } from "./runtime";

type SeedableUser = {
  username: string;
  password: string;
  fullName: string;
  role: string;
};

function resolveConfiguredSeedUsers(): SeedableUser[] {
  return [
    {
      username: runtimeConfig.bootstrap.users.superuser.username,
      password: runtimeConfig.bootstrap.users.superuser.password,
      fullName: runtimeConfig.bootstrap.users.superuser.fullName,
      role: "superuser",
    },
    {
      username: runtimeConfig.bootstrap.users.admin.username,
      password: runtimeConfig.bootstrap.users.admin.password,
      fullName: runtimeConfig.bootstrap.users.admin.fullName,
      role: "admin",
    },
    {
      username: runtimeConfig.bootstrap.users.user.username,
      password: runtimeConfig.bootstrap.users.user.password,
      fullName: runtimeConfig.bootstrap.users.user.fullName,
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
    const bootstrapUsername = runtimeConfig.bootstrap.freshLocalSuperuser.username;
    const bootstrapPassword = String(runtimeConfig.bootstrap.freshLocalSuperuser.password || "").trim();
    if (!bootstrapPassword) {
      throw new Error(
        "Fresh local bootstrap requires SEED_SUPERUSER_PASSWORD. Temporary credential generation and disk output are disabled by default.",
      );
    }

    const shouldWriteCredentialsFile = runtimeConfig.bootstrap.localSuperuserCredentialsFileEnabled;
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
      fullName: runtimeConfig.bootstrap.freshLocalSuperuser.fullName,
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
      createdBy: USERS_BOOTSTRAP_SYSTEM_ACTOR_USERNAME,
      createdAt: now,
      updatedAt: now,
      passwordChangedAt: now,
      activatedAt: now,
      isBanned: false,
    });
  }

  if (localSuperuserCredentialsFilePath) {
    logger.warn("Bootstrapped a local superuser account and wrote credentials to an explicitly enabled local file", {
      username: runtimeConfig.bootstrap.freshLocalSuperuser.username,
      credentialsFilePath: localSuperuserCredentialsFilePath,
    });
    logger.warn("Credential-file output should be treated as temporary local development material", {
      credentialsFilePath: localSuperuserCredentialsFilePath,
    });
  }
}

