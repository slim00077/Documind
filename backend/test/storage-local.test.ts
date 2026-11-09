import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

// The local driver writes under <cwd>/uploads. Run from a throwaway directory so this test can
// never touch the real backend/uploads folder.
const sandbox = mkdtempSync(join(tmpdir(), "documind-local-storage-"));
const realCwd = process.cwd();
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");

describe("local storage driver (docker compose / Kubernetes PVC / development)", () => {
  let h: import("./harness").Harness;
  const E = (n: string) => `${n}@local-storage.test`;
  let orgId = 0;

  before(async () => {
    process.chdir(sandbox);
    delete process.env.STORAGE_DRIVER;
    process.env.LLM_PROVIDER_ORDER = "none";
    const { Harness } = await import("./harness");
    h = new Harness();
    await h.start();
    await h.register("owner", E("owner"));
    await h.register("orgadmin", E("orgadmin"));
    await h.platformAdmin(E("platform"));
    const org = await h.call("POST", "/api/admin/organizations", E("platform"), { name: "Local Org", adminEmail: E("orgadmin") });
    assert.equal(org.status, 201);
    orgId = org.body.id;
  });

  after(async () => {
    await h.stop();
    process.chdir(realCwd);
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("is the default driver and keeps files in <cwd>/uploads", async () => {
    const { FileStorageService } = await import("../src/modules/storage/file-storage.service");
    const storage = h.app.get(FileStorageService);
    assert.equal(storage.driver, "local");
    assert.deepEqual(await storage.healthCheck(), { driver: "local", ok: true });
  });

  it("logo upload, read and replacement work through the local filesystem", async () => {
    const upload = async () => {
      const form = new FormData();
      form.append("logo", new Blob([PNG], { type: "image/png" }), "logo.png");
      return fetch(`${h.base}/api/organizations/${orgId}/logo`, { method: "POST", headers: { authorization: `Bearer ${h.token(E("orgadmin"))}` }, body: form });
    };
    assert.equal((await upload()).status, 201);
    const get = await fetch(`${h.base}/api/organizations/${orgId}/logo`, { headers: { authorization: `Bearer ${h.token(E("orgadmin"))}` } });
    assert.equal(get.status, 200);
    assert.deepEqual(Buffer.from(await get.arrayBuffer()), PNG);
    const { readdirSync } = await import("node:fs");
    assert.equal(readdirSync(join(sandbox, "uploads", "org-logos")).length, 1);
    assert.equal((await upload()).status, 201);
    assert.equal(readdirSync(join(sandbox, "uploads", "org-logos")).length, 1, "previous logo removed");
  });

  it("document image, version download and permanent deletion work locally", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(sandbox, "uploads", "documents"), { recursive: true });
    await writeFile(join(sandbox, "uploads", "documents", "local-1.png"), PNG);
    await writeFile(join(sandbox, "uploads", "documents", "local-v1.txt"), "old text");
    const owner = (await h.prisma.user.findUniqueOrThrow({ where: { email: E("owner") } })).id;
    const doc = await h.prisma.document.create({
      data: { name: "Local scan", userId: owner, status: "READY", extractedText: "x", mimeType: "image/png", originalName: "a.png", filePath: "local-1.png", size: PNG.length, chunks: { create: [{ content: "x", chunkIndex: 0 }] } },
    });
    const version = await h.prisma.documentVersion.create({ data: { documentId: doc.id, version: 1, originalName: "old.txt", mimeType: "text/plain", size: 8, filePath: "local-v1.txt", createdById: owner } });
    const auth = { headers: { authorization: `Bearer ${h.token(E("owner"))}` } };

    const image = await fetch(`${h.base}/api/documents/${doc.id}/image`, auth);
    assert.equal(image.status, 200);
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), PNG);
    assert.equal(await (await fetch(`${h.base}/api/documents/${doc.id}/versions/${version.id}/file`, auth)).text(), "old text");

    assert.equal((await h.call("DELETE", `/api/documents/${doc.id}`, E("owner"))).status, 200);
    assert.equal((await h.call("DELETE", `/api/documents/${doc.id}/permanent`, E("owner"))).status, 200);
    assert.ok(!existsSync(join(sandbox, "uploads", "documents", "local-1.png")));
    assert.ok(!existsSync(join(sandbox, "uploads", "documents", "local-v1.txt")));
  });
});
