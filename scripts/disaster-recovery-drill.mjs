import "dotenv/config";
import crypto from "node:crypto";
import process from "node:process";

const baseUrl = String(process.env.DRILL_BASE_URL || process.env.SMOKE_BASE_URL || "http://127.0.0.1:5000").trim();
const username = String(process.env.DRILL_SUPERUSER_USERNAME || process.env.SMOKE_TEST_USERNAME || "").trim();
const password = String(process.env.DRILL_SUPERUSER_PASSWORD || process.env.SMOKE_TEST_PASSWORD || "").trim();
const runRestore = String(process.env.DRILL_RUN_RESTORE || "").trim() === "1";
const keepBackup = String(process.env.DRILL_KEEP_BACKUP || "").trim() === "1";
const requestTimeoutMs = Math.max(2000, Number.parseInt(String(process.env.DRILL_TIMEOUT_MS || "15000"), 10) || 15000);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, label) {
  return Promise.race([
    promise,
    sleep(requestTimeoutMs).then(() => {
      throw new Error(`${label} timed out after ${requestTimeoutMs}ms`);
    }),
  ]);
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const cookie = headers.get("set-cookie");
  return cookie ? [cookie] : [];
}

function parseSetCookie(cookieLine) {
  const [pair] = String(cookieLine || "").split(";");
  const separatorIndex = pair.indexOf("=");
  if (separatorIndex <= 0) {
    return null;
  }
  const name = pair.slice(0, separatorIndex).trim();
  const value = pair.slice(separatorIndex + 1).trim();
  if (!name) {
    return null;
  }
  return { name, value };
}

function buildCookieHeader(cookieJar) {
  return Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function computePayloadChecksum(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

async function run() {
  assert(baseUrl, "DRILL_BASE_URL is required.");
  assert(username, "DRILL_SUPERUSER_USERNAME (or SMOKE_TEST_USERNAME) is required.");
  assert(password, "DRILL_SUPERUSER_PASSWORD (or SMOKE_TEST_PASSWORD) is required.");

  const cookieJar = new Map();
  let createdBackupId = null;
  let createdBackupName = null;

  const request = async (path, init = {}, options = {}) => {
    const method = String(init.method || "GET").toUpperCase();
    const headers = new Headers(init.headers || {});
    const cookieHeader = buildCookieHeader(cookieJar);
    if (cookieHeader) {
      headers.set("cookie", cookieHeader);
    }
    if (!headers.has("content-type") && init.body) {
      headers.set("content-type", "application/json");
    }
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      const csrfToken = cookieJar.get("sqr_csrf");
      if (csrfToken) {
        headers.set("x-csrf-token", csrfToken);
      }
    }

    const response = await withTimeout(
      fetch(`${baseUrl}${path}`, {
        ...init,
        method,
        headers,
      }),
      `${method} ${path}`,
    );

    for (const setCookie of getSetCookieHeaders(response.headers)) {
      const parsed = parseSetCookie(setCookie);
      if (!parsed) {
        continue;
      }
      if (parsed.value) {
        cookieJar.set(parsed.name, parsed.value);
      } else {
        cookieJar.delete(parsed.name);
      }
    }

    const bodyText = await response.text();
    let bodyJson = null;
    try {
      bodyJson = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      bodyJson = null;
    }

    if (!options.allowFailure && !response.ok) {
      throw new Error(
        [
          `${method} ${path} failed with ${response.status}.`,
          bodyJson?.message ? `Message: ${bodyJson.message}` : bodyText ? `Body: ${bodyText}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    return {
      status: response.status,
      headers: response.headers,
      text: bodyText,
      json: bodyJson,
    };
  };

  try {
    console.log(`Running DR drill against ${baseUrl}`);
    console.log(`Restore step enabled: ${runRestore ? "yes" : "no"}`);

    const loginResponse = await request("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username,
        password,
        fingerprint: "drill-script",
        pcName: "DR Drill Runner",
        browser: "drill-script",
      }),
    });
    assert(loginResponse.status === 200, `Login failed with ${loginResponse.status}`);
    assert(cookieJar.has("sqr_auth"), "Login did not return sqr_auth session cookie.");
    assert(cookieJar.has("sqr_csrf"), "Login did not return sqr_csrf cookie required for mutation protection.");

    const backupList = await request("/api/backups?page=1&pageSize=5");
    assert(Array.isArray(backupList.json?.backups), "Backup list response is malformed.");
    console.log(`Backup list check passed. Existing backups on page 1: ${backupList.json.backups.length}`);

    createdBackupName = `DR-Drill-${Date.now()}`;
    const createResponse = await request("/api/backups", {
      method: "POST",
      body: JSON.stringify({ name: createdBackupName }),
    });
    createdBackupId = String(createResponse.json?.id || "");
    assert(createdBackupId, "Backup creation did not return backup id.");
    console.log(`Created drill backup ${createdBackupName} (${createdBackupId}).`);

    const metadataResponse = await request(`/api/backups/${encodeURIComponent(createdBackupId)}`);
    const metadataChecksum = String(
      metadataResponse.json?.metadata?.payloadChecksumSha256 || "",
    ).toLowerCase();
    assert(!metadataChecksum || /^[a-f0-9]{64}$/.test(metadataChecksum), "Metadata checksum format is invalid.");

    const exportResponse = await request(`/api/backups/${encodeURIComponent(createdBackupId)}/export`);
    const exportPayload = exportResponse.json || JSON.parse(String(exportResponse.text || "{}"));
    assert(exportPayload?.backupData, "Export payload missing backupData.");
    const computedChecksum = computePayloadChecksum(exportPayload.backupData);
    const payloadChecksum = String(exportPayload?.integrity?.checksumSha256 || "").toLowerCase();
    assert(payloadChecksum, "Export payload missing integrity checksum.");
    assert(
      computedChecksum === payloadChecksum,
      `Export integrity mismatch. computed=${computedChecksum} payload=${payloadChecksum}`,
    );
    if (metadataChecksum) {
      assert(
        metadataChecksum === payloadChecksum,
        `Metadata checksum mismatch. metadata=${metadataChecksum} payload=${payloadChecksum}`,
      );
    }
    console.log("Backup export integrity verification passed.");

    if (runRestore) {
      const restoreResponse = await request(`/api/backups/${encodeURIComponent(createdBackupId)}/restore`, {
        method: "POST",
      });
      assert(restoreResponse.status === 200, `Restore failed with ${restoreResponse.status}`);
      assert(restoreResponse.json?.success === true, "Restore response did not report success.");
      console.log("Restore drill completed successfully.");
    } else {
      console.log("Restore step skipped. Set DRILL_RUN_RESTORE=1 to include restore verification.");
    }
  } finally {
    if (createdBackupId && !keepBackup) {
      try {
        await request(`/api/backups/${encodeURIComponent(createdBackupId)}`, {
          method: "DELETE",
        }, { allowFailure: true });
        console.log(`Deleted drill backup ${createdBackupId}.`);
      } catch (error) {
        console.warn(`Backup cleanup failed for ${createdBackupId}:`, error);
      }
    } else if (createdBackupId && keepBackup) {
      console.log(`Keeping drill backup ${createdBackupId} because DRILL_KEEP_BACKUP=1.`);
    }

    try {
      await request("/api/activity/logout", {
        method: "POST",
      }, { allowFailure: true });
    } catch {
      // best effort logout
    }
  }

  console.log("Disaster recovery drill finished.");
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
