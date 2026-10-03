import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AccountAvatarRepository } from "../account-avatar.repository";

test("private avatar storage is bounded to immutable IDs, atomically replaces and leaves no temp files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sqr-avatar-repository-"));
  try {
    const repository = new AccountAvatarRepository(root);
    assert.equal(await repository.getUrl("one"), null);
    assert.equal(await repository.read("one"), null);
    await repository.save("one", Buffer.from("first"));
    assert.match((await repository.getUrl("one"))!, /^\/api\/me\/avatar\?v=[a-f0-9]{24}$/);
    await repository.save("one", Buffer.from("replacement"));
    await repository.save("../two", Buffer.from("second account"));
    assert.equal((await repository.read("one"))?.toString(), "replacement");
    assert.equal((await repository.read("../two"))?.toString(), "second account");
    assert.equal(await repository.read("two"), null);
    assert.deepEqual((await fs.readdir(path.join(root, "profile-avatars"))).sort(), ["one", "../two"].map((id) => `${createHash("sha256").update(id).digest("hex")}.avatar`).sort());
    await assert.rejects(repository.save("one", Buffer.alloc(1024 * 1024 + 1)));
    assert.equal((await repository.read("one"))?.toString(), "replacement");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("avatar storage allows a trusted deployment-root link but rejects image and subdirectory links", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sqr-avatar-symlink-"));
  try {
    const persistent = path.join(root, "persistent");
    await fs.mkdir(persistent);
    const uploadsLink = path.join(root, "uploads");
    try { await fs.symlink(persistent, uploadsLink, process.platform === "win32" ? "junction" : "dir"); }
    catch (error) {
      if (["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code || "")) { context.skip("Host does not permit test symlinks."); return; }
      throw error;
    }
    const repository = new AccountAvatarRepository(uploadsLink);
    await repository.save("one", Buffer.from("safe"));
    assert.equal((await repository.read("one"))?.toString(), "safe");
    const avatarDirectory = path.join(persistent, "profile-avatars");
    const file = path.join(avatarDirectory, `${createHash("sha256").update("one").digest("hex")}.avatar`);
    await fs.unlink(file);
    try { await fs.symlink(path.join(root, "target"), file, "file"); }
    catch (error) {
      if (["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code || "")) { context.skip("Host does not permit file symlinks."); return; }
      throw error;
    }
    await fs.writeFile(path.join(root, "target"), "private outside content");
    await assert.rejects(repository.read("one"), /not valid/);
    assert.equal(await repository.getUrl("one"), null);
    await fs.unlink(file);
    await fs.rmdir(avatarDirectory);
    await fs.symlink(root, avatarDirectory, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(repository.save("one", Buffer.from("unsafe")), /not valid/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
