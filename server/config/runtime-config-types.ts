import type { RuntimeEnvironment } from "./runtime-environment";

export type RuntimeConfigDiagnostic = {
  code: string;
  envNames: string[];
  message: string;
  severity: "warning";
};

export type RuntimeConfigValidation = {
  warningCount: number;
  warnings: readonly RuntimeConfigDiagnostic[];
};

export type MailConfigurationAssessment = {
  effectiveFrom: string | null;
  hasAnyInput: boolean;
  isConfigured: boolean;
  isIncomplete: boolean;
};

export type SeedUserRuntimeConfig = {
  username: string;
  password: string;
  fullName: string;
};

export type RuntimeConfig = {
  app: {
    nodeEnv: RuntimeEnvironment;
    isProduction: boolean;
    isProductionLike: boolean;
    isStrictLocalDevelopment: boolean;
    port: number;
    host: string;
    publicAppUrl: string | null;
    debugLogs: boolean;
    logLevel: string;
    allowLocalDevCors: boolean;
    uploadsRootDir: string;
    bodyLimits: {
      default: string;
      imports: string;
      collection: string;
    };
    corsAllowedOrigins: string[];
    trustedProxies: string[];
  };
  database: {
    connectionString: string | null;
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    maxConnections: number;
    idleTimeoutMs: number;
    connectionTimeoutMs: number;
    searchPath: string;
  };
  auth: {
    sessionSecret: string;
    previousSessionSecrets: string[];
    collectionNicknameTempPassword: string;
    twoFactorEncryptionSecret: string | null;
    seedDefaultUsers: boolean;
    cookieSecure: boolean;
  };
  ai: {
    host: string;
    chatModel: string;
    embedModel: string;
    timeoutMs: number;
    precomputeOnStart: boolean;
    lowMemoryMode: boolean;
    debugLogs: boolean;
    debugEnabled: boolean;
    intentMode: string | null;
    gate: {
      globalLimit: number;
      queueLimit: number;
      queueWaitMs: number;
      roleLimits: {
        user: number;
        admin: number;
        superuser: number;
      };
    };
    latency: {
      staleAfterMs: number;
      decayHalfLifeMs: number;
    };
    cache: {
      maxSearchEntries: number;
      maxLastPersonEntries: number;
      lastPersonTtlMs: number;
    };
  };
  runtime: {
    defaults: {
      sessionTimeoutMinutes: number;
      wsIdleMinutes: number;
      aiTimeoutMs: number;
      searchResultLimit: number;
      viewerRowsPerPage: number;
    };
    maintenanceCacheTtlMs: number;
    runtimeSettingsCacheTtlMs: number;
    pgPoolWarnCooldownMs: number;
    backupOperationTimeoutMs: number;
    backupMaxPayloadBytes: number;
    importAnalysisTimeoutMs: number;
    collectionRollupListenReconnectMs: number;
    httpSlowRequestMs: number;
    analyticsTimeZone: string;
  };
  collection: {
    routeWarnMs: number;
    receiptQuarantineEnabled: boolean;
    receiptQuarantineDir: string;
    piiEncryptionSecret: string | null;
    previousPiiEncryptionSecrets: string[];
    piiRetiredFields: string[];
  };
  mail: {
    devOutboxEnabled: boolean;
    devOutboxDir: string;
    devOutboxMaxFiles: number;
    transport: {
      from: string | null;
      host: string | null;
      password: string | null;
      port: number;
      requireTls: boolean;
      secure: boolean;
      service: string | null;
      user: string | null;
    };
  };
  backups: {
    featureEnabled: boolean;
    encryptionKey: string | null;
    encryptionKeys: string | null;
    encryptionKeyId: string | null;
  };
  cluster: {
    lowMemoryMode: boolean;
    maxWorkers: number;
    initialWorkers: number;
    preallocateMb: number;
    forceCluster: boolean;
  };
  bootstrap: {
    localSuperuserCredentialsFileEnabled: boolean;
    users: {
      superuser: SeedUserRuntimeConfig;
      admin: SeedUserRuntimeConfig;
      user: SeedUserRuntimeConfig;
    };
    freshLocalSuperuser: SeedUserRuntimeConfig;
  };
};
