import path from "node:path";

const MAX_CHILD_PROCESS_ARG_LENGTH = 4_096;
const MAX_CHILD_PROCESS_ENV_VALUE_LENGTH = 32_768;
const UNSAFE_ARGUMENT_CHAR_PATTERN = /[\0\r\n;&|`$<>"']/;
const PATH_TRAVERSAL_SEGMENT_PATTERN = /(^|[\\/])\.\.([\\/]|$)/;
const SAFE_ARGUMENT_PATTERN = /^[A-Za-z0-9_./:=@+,\-\\()[\] ]+$/;
const SAFE_ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const ALLOWED_COMMAND_BASENAMES = new Set([
  "node",
  "node.exe",
  "npm",
  "npm.cmd",
  "taskkill",
  "taskkill.exe",
]);

const ALLOWED_SCANNER_COMMAND_BASENAMES = new Set([
  "clamdscan",
  "clamdscan.exe",
  "clamscan",
  "clamscan.exe",
  "node",
  "node.exe",
]);

const ALWAYS_ALLOWED_ENV_KEYS = new Set([
  "APPDATA",
  "CI",
  "CHROME_PATH",
  "ComSpec",
  "FORCE_COLOR",
  "FORCE_JAVASCRIPT_ACTIONS_TO_NODE24",
  "GITHUB_ACTIONS",
  "HOME",
  "HOST",
  "LOCALAPPDATA",
  "NO_COLOR",
  "NODE_ENV",
  "Path",
  "PATH",
  "PATHEXT",
  "PLAYWRIGHT_BROWSERS_PATH",
  "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH",
  "PORT",
  "RUNNER_OS",
  "SystemRoot",
  "TEMP",
  "TERM",
  "TMP",
  "TMPDIR",
  "USERPROFILE",
  "WINDIR",
  "npm_config_cache",
  "npm_config_loglevel",
  "npm_config_prefix",
  "npm_config_user_agent",
  "npm_execpath",
  "npm_node_execpath",
]);

const ALLOWED_ENV_PREFIXES = [
  "A11Y_",
  "ANALYTICS_",
  "AUTH_",
  "BACKUP_",
  "COLLECTION_",
  "CORS_",
  "DATABASE_",
  "DEFAULT_",
  "GRACEFUL_",
  "HSTS_",
  "HTTP_",
  "IMPORT_",
  "LOG_",
  "MAINTENANCE_",
  "OPERATIONS_",
  "PG",
  "PUBLIC_",
  "RUNTIME_",
  "SEED_",
  "SESSION_",
  "SMOKE_",
  "SQR_",
  "TRUSTED_",
  "TWO_FACTOR_",
  "VISUAL_",
];

function toCommandBasename(command) {
  return path.basename(String(command).replace(/\\/g, "/")).toLowerCase();
}

function rejectUnsafeText(value, label) {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string.`);
  }

  if (!value.trim()) {
    throw new Error(`${label} must not be empty.`);
  }

  if (UNSAFE_ARGUMENT_CHAR_PATTERN.test(value)) {
    throw new Error(`${label} contains shell metacharacters or control characters.`);
  }
}

export function validateChildProcessCommand(command) {
  rejectUnsafeText(command, "Child process command");

  if (PATH_TRAVERSAL_SEGMENT_PATTERN.test(command)) {
    throw new Error("Child process command must not contain path traversal segments.");
  }

  const basename = toCommandBasename(command);
  if (!ALLOWED_COMMAND_BASENAMES.has(basename)) {
    throw new Error(`Child process command is not allowlisted: ${basename}`);
  }

  return command;
}

export function validateChildProcessArg(arg) {
  rejectUnsafeText(arg, "Child process argument");

  if (arg.length > MAX_CHILD_PROCESS_ARG_LENGTH) {
    throw new Error("Child process argument exceeds the maximum supported length.");
  }

  if (PATH_TRAVERSAL_SEGMENT_PATTERN.test(arg)) {
    throw new Error("Child process argument must not contain path traversal segments.");
  }

  if (!SAFE_ARGUMENT_PATTERN.test(arg)) {
    throw new Error("Child process argument contains unsupported characters.");
  }

  return arg;
}

export function validateConfiguredScannerCommand(command) {
  rejectUnsafeText(command, "Configured scanner command");

  if (PATH_TRAVERSAL_SEGMENT_PATTERN.test(command)) {
    throw new Error("Configured scanner command must not contain path traversal segments.");
  }

  const basename = toCommandBasename(command);
  if (!ALLOWED_SCANNER_COMMAND_BASENAMES.has(basename)) {
    throw new Error(`Configured scanner command is not allowlisted: ${basename}`);
  }

  return command;
}

export function normalizeScannerArgsJson(rawValue, label = "scanner args JSON") {
  const parsed = JSON.parse(rawValue);
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array.`);
  }

  const safeArgs = parsed.map((entry, index) => {
    if (typeof entry !== "string") {
      throw new Error(`${label} entry ${index} must be a string.`);
    }

    rejectUnsafeText(entry, `${label} entry ${index}`);
    if (entry.length > MAX_CHILD_PROCESS_ARG_LENGTH) {
      throw new Error(`${label} entry ${index} exceeds the maximum supported length.`);
    }
    if (PATH_TRAVERSAL_SEGMENT_PATTERN.test(entry)) {
      throw new Error(`${label} entry ${index} must not contain path traversal segments.`);
    }
    if (!/^[A-Za-z0-9_./:=@+,\-\\()[\]{} ]+$/.test(entry)) {
      throw new Error(`${label} entry ${index} contains unsupported characters.`);
    }

    return entry;
  });

  return JSON.stringify(safeArgs);
}

function isAllowedEnvKey(key) {
  return ALWAYS_ALLOWED_ENV_KEYS.has(key)
    || ALLOWED_ENV_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function normalizeEnvValue(value, key) {
  if (value == null) {
    return undefined;
  }

  const normalized = String(value);
  if (normalized.includes("\0")) {
    throw new Error(`Child process env ${key} contains a null byte.`);
  }

  if (normalized.length > MAX_CHILD_PROCESS_ENV_VALUE_LENGTH) {
    throw new Error(`Child process env ${key} exceeds the maximum supported length.`);
  }

  return normalized;
}

export function buildSafeChildEnv(baseEnv = {}, overrides = {}) {
  const safeEnv = {};

  for (const [key, value] of Object.entries(baseEnv)) {
    if (!SAFE_ENV_KEY_PATTERN.test(key) || !isAllowedEnvKey(key)) {
      continue;
    }

    const normalized = normalizeEnvValue(value, key);
    if (normalized !== undefined) {
      safeEnv[key] = normalized;
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (!SAFE_ENV_KEY_PATTERN.test(key)) {
      throw new Error(`Child process env key is invalid: ${key}`);
    }

    const normalized = normalizeEnvValue(value, key);
    if (normalized === undefined) {
      delete safeEnv[key];
    } else {
      safeEnv[key] = normalized;
    }
  }

  return safeEnv;
}

export function validateSafeSpawnSpec(command, args) {
  if (!Array.isArray(args)) {
    throw new TypeError("Child process args must be an array.");
  }

  return {
    args: args.map(validateChildProcessArg),
    command: validateChildProcessCommand(command),
  };
}

export function buildSafeSpawnOptions({
  cwd = process.cwd(),
  env = buildSafeChildEnv(process.env),
  stdio = "inherit",
} = {}) {
  return {
    cwd,
    env: buildSafeChildEnv(env),
    shell: false,
    stdio,
  };
}
