import { createHash, randomUUID } from "node:crypto";
import { constants, promises as fs } from "node:fs";
import path from "node:path";
import { ACCOUNT_AVATAR_ENDPOINT, ACCOUNT_AVATAR_MAX_BYTES } from "../../shared/account-avatar";

/** One private file per immutable account ID; client filenames and IDs never select a path. */
export class AccountAvatarRepository {
  private directory: string;

  constructor(private readonly uploadsRootDir: string) {
    this.directory = path.join(path.resolve(uploadsRootDir), "profile-avatars");
  }

  private filePath(userId: string) {
    if (!userId) throw new Error("Avatar account identity is required.");
    const key = createHash("sha256").update(userId).digest("hex");
    return path.join(this.directory, `${key}.avatar`);
  }

  private async checkDirectory(create: boolean) {
    if (create) await fs.mkdir(this.uploadsRootDir, { recursive: true, mode: 0o750 });
    try {
      // Production release directories may link the trusted uploads root to
      // shared persistent storage. Only that operator-owned root is resolved.
      const root = await fs.realpath(this.uploadsRootDir);
      if (!(await fs.stat(root)).isDirectory()) throw new Error("Avatar storage root is not valid.");
      this.directory = path.join(root, "profile-avatars");
      if (create) await fs.mkdir(this.directory, { mode: 0o750 }).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      });
      const stat = await fs.lstat(this.directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Avatar storage directory is not valid.");
    } catch (error) {
      if (!create && (error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
    return true;
  }

  async getUrl(userId: string): Promise<string | null> {
    if (!await this.checkDirectory(false)) return null;
    try {
      const stat = await fs.lstat(this.filePath(userId));
      if (!stat.isFile() || stat.isSymbolicLink() || !stat.size || stat.size > ACCOUNT_AVATAR_MAX_BYTES) return null;
      const version = createHash("sha256").update(`${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`).digest("hex").slice(0, 24);
      return `${ACCOUNT_AVATAR_ENDPOINT}?v=${version}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async read(userId: string): Promise<Buffer | null> {
    if (!await this.checkDirectory(false)) return null;
    const filePath = this.filePath(userId);
    let handle;
    try {
      const entry = await fs.lstat(filePath);
      if (!entry.isFile() || entry.isSymbolicLink()) throw new Error("Avatar storage entry is not valid.");
      handle = await fs.open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      const stat = await handle.stat();
      if (!stat.isFile() || !stat.size || stat.size > ACCOUNT_AVATAR_MAX_BYTES) throw new Error("Avatar storage entry is not valid.");
      // Read a bounded buffer, including one overflow byte, even if a file changes concurrently.
      const buffer = Buffer.alloc(ACCOUNT_AVATAR_MAX_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const read = await handle.read(buffer, length, buffer.length - length, length);
        if (read.bytesRead === 0) break;
        length += read.bytesRead;
      }
      if (!length || length > ACCOUNT_AVATAR_MAX_BYTES) throw new Error("Avatar storage entry is not valid.");
      return buffer.subarray(0, length);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    } finally {
      await handle?.close();
    }
  }

  async save(userId: string, buffer: Buffer): Promise<void> {
    if (!buffer.length || buffer.length > ACCOUNT_AVATAR_MAX_BYTES) throw new Error("Avatar size is not valid.");
    await this.checkDirectory(true);
    const destination = this.filePath(userId);
    const temporary = path.join(this.directory, `${randomUUID()}.upload`);
    try {
      const handle = await fs.open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(buffer);
        await handle.sync();
      } finally {
        await handle.close();
      }
      // Atomic rename replaces the old image, not a link target, with no accumulating old copies.
      await fs.rename(temporary, destination);
    } finally {
      await fs.unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
}
