import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = __ENV.SQR_LOAD_BASE_URL || "http://127.0.0.1:5000";
const username = __ENV.SQR_LOAD_USERNAME || "";
const password = __ENV.SQR_LOAD_PASSWORD || "";

export const options = {
  vus: 5,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1500"],
  },
};

function jsonHeaders(cookieHeader = "") {
  return {
    "Content-Type": "application/json",
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
  };
}

export default function () {
  const readyResponse = http.get(`${baseUrl}/api/health/ready`);
  check(readyResponse, {
    "ready endpoint responds": (response) => response.status === 200 || response.status === 503,
  });

  if (!username || !password) {
    sleep(1);
    return;
  }

  const loginResponse = http.post(
    `${baseUrl}/api/auth/login`,
    JSON.stringify({ username, password }),
    { headers: jsonHeaders() },
  );

  check(loginResponse, {
    "login request stays within accepted auth outcomes": (response) =>
      response.status === 200 || response.status === 202 || response.status === 403,
  });

  const rawCookies = loginResponse.headers["Set-Cookie"];
  const cookieHeader = Array.isArray(rawCookies)
    ? rawCookies.map((cookie) => String(cookie).split(";")[0]).join("; ")
    : typeof rawCookies === "string"
      ? String(rawCookies).split(";")[0]
      : "";

  if (cookieHeader) {
    const importsResponse = http.get(`${baseUrl}/api/imports`, {
      headers: jsonHeaders(cookieHeader),
    });
    check(importsResponse, {
      "imports listing stays reachable": (response) => response.status === 200,
    });

    const backupsResponse = http.get(`${baseUrl}/api/backups`, {
      headers: jsonHeaders(cookieHeader),
    });
    check(backupsResponse, {
      "backups listing stays protected or reachable": (response) =>
        response.status === 200 || response.status === 403,
    });
  }

  sleep(1);
}
