import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const LOCAL_SUPERUSER_CREDENTIALS_FILE = path.resolve(
  process.cwd(),
  "output",
  "local-superuser-credentials.txt",
);

export async function writeLocalSuperuserCredentialsFile(params: {
  username: string;
  password: string;
}): Promise<string> {
  await mkdir(path.dirname(LOCAL_SUPERUSER_CREDENTIALS_FILE), { recursive: true });
  await writeFile(
    LOCAL_SUPERUSER_CREDENTIALS_FILE,
    [
      "SQR local superuser bootstrap credentials",
      `generatedAt=${new Date().toISOString()}`,
      `username=${params.username}`,
      `password=${params.password}`,
      "",
      "Change the password immediately after first login and delete this file afterward.",
      "",
    ].join("\n"),
    "utf8",
  );

  return LOCAL_SUPERUSER_CREDENTIALS_FILE;
}

