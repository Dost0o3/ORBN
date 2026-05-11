import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";
import sharp from "sharp";

/**
 * Coverage for the community branch of @workspace/profile-image-normalizer.
 *
 * The shared normalizer sweeps community avatars + banners alongside user
 * avatars/covers. To exercise the community path end-to-end without
 * touching real GCS, we mock @google-cloud/storage with an in-memory
 * fake backed by a Map<objectName, { bytes, contentType, metadata }>
 * and seed a real community row in the test DB pointing at a too-large
 * PNG asset.
 */

// ─── In-memory GCS fake ─────────────────────────────────────────────────────

interface FakeObject {
  bytes: Buffer;
  contentType: string;
  customMetadata: Record<string, string>;
}

const storageMap = vi.hoisted(() => new Map<string, { bytes: Buffer; contentType: string; customMetadata: Record<string, string> }>());

vi.mock("@google-cloud/storage", () => {
  // Each `bucket(name).file(objectName)` returns a thin wrapper that
  // reads/writes from `storageMap` under the composite key
  // `${bucketName}/${objectName}`.
  const makeFile = (key: string) => ({
    async exists(): Promise<[boolean]> {
      return [storageMap.has(key)];
    },
    async getMetadata(): Promise<[{ size: number; metadata: Record<string, string> }]> {
      const obj = storageMap.get(key);
      if (!obj) throw new Error(`fake getMetadata: missing ${key}`);
      return [{ size: obj.bytes.byteLength, metadata: obj.customMetadata }];
    },
    createReadStream() {
      const obj = storageMap.get(key);
      if (!obj) throw new Error(`fake createReadStream: missing ${key}`);
      // Return a minimal stream that emits the buffer once and ends.
      const { Readable } = require("stream") as typeof import("stream");
      return Readable.from([obj.bytes]);
    },
    async save(
      bytes: Buffer,
      opts: { contentType: string; metadata?: { metadata?: Record<string, string> } },
    ): Promise<void> {
      storageMap.set(key, {
        bytes,
        contentType: opts.contentType,
        customMetadata: opts.metadata?.metadata ?? {},
      });
    },
  });
  return {
    Storage: class {
      bucket(bucketName: string) {
        return {
          file: (objectName: string) => makeFile(`${bucketName}/${objectName}`),
        };
      }
    },
  };
});

// PRIVATE_OBJECT_DIR drives where `/objects/{id}` resolves to in GCS.
// Pin a deterministic value so the fake bucket key is predictable.
const TEST_BUCKET = "test-bucket";
const TEST_DIR_PREFIX = "private";
process.env.PRIVATE_OBJECT_DIR = `/${TEST_BUCKET}/${TEST_DIR_PREFIX}`;

// Imports must come AFTER vi.mock + env setup.
import { db, communitiesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { runNormalizeProfileImages } from "@workspace/profile-image-normalizer";
import { createTestUser, deleteTestUsers } from "../test/test-helpers";

const createdCommunityIds: number[] = [];
const createdUserIds: string[] = [];

async function seedCommunityWithLargeAvatar(): Promise<{
  communityId: number;
  ownerId: string;
  entityId: string;
  bucketKey: string;
  beforeBytes: number;
}> {
  const owner = await createTestUser();
  createdUserIds.push(owner.id);

  // Build a deliberately-too-large PNG so the normalizer is forced to
  // rewrite (PNG ≠ jpeg, and 2000x2000 > 512x512 target).
  const largePng = await sharp({
    create: {
      width: 2000,
      height: 2000,
      channels: 3,
      background: { r: 200, g: 100, b: 50 },
    },
  })
    .png()
    .toBuffer();

  const entityId = `community-test-${randomUUID()}`;
  const objectName = `${TEST_DIR_PREFIX}/${entityId}`;
  const bucketKey = `${TEST_BUCKET}/${objectName}`;
  storageMap.set(bucketKey, {
    bytes: largePng,
    contentType: "image/png",
    customMetadata: { "custom:aclPolicy": JSON.stringify({ visibility: "public" }) },
  });

  const [row] = await db
    .insert(communitiesTable)
    .values({
      creatorId: owner.id,
      name: `test-community-${randomUUID().slice(0, 8)}`,
      description: "fixture for normalizer community-branch test",
      category: "test",
      avatarUrl: `/objects/${entityId}`,
      bannerUrl: null,
    })
    .returning({ id: communitiesTable.id });

  createdCommunityIds.push(row.id);
  return {
    communityId: row.id,
    ownerId: owner.id,
    entityId,
    bucketKey,
    beforeBytes: largePng.byteLength,
  };
}

beforeAll(() => {
  // Smaller-but-already-normalized fixtures from other suites can leave
  // entries in the map between describes; not relevant — we use unique
  // entityIds per test.
});

beforeEach(() => {
  // Don't wipe the whole map; each test seeds its own unique entityId.
});

afterAll(async () => {
  if (createdCommunityIds.length > 0) {
    await db
      .delete(communitiesTable)
      .where(eq(communitiesTable.id, createdCommunityIds[0]))
      .catch(() => {});
    // Bulk delete the rest.
    for (const id of createdCommunityIds.slice(1)) {
      await db.delete(communitiesTable).where(eq(communitiesTable.id, id)).catch(() => {});
    }
  }
  await deleteTestUsers(createdUserIds);
  storageMap.clear();
});

describe("runNormalizeProfileImages — community branch", () => {
  it("rewrites a too-large community avatar to JPEG at/under the 512x512 target", async () => {
    const fixture = await seedCommunityWithLargeAvatar();

    const totals = await runNormalizeProfileImages();

    // Community was scanned and the asset was rewritten.
    expect(totals.communitiesScanned).toBeGreaterThanOrEqual(1);
    expect(totals.rewritten).toBeGreaterThanOrEqual(1);
    expect(totals.bytesAfter).toBeLessThan(totals.bytesBefore);

    // Stored object is now JPEG with content-type set, and its
    // dimensions are at/under the 512x512 community-avatar target.
    const stored = storageMap.get(fixture.bucketKey);
    expect(stored).toBeDefined();
    expect(stored!.contentType).toBe("image/jpeg");

    const meta = await sharp(stored!.bytes).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBeLessThanOrEqual(512);
    expect(meta.height).toBeLessThanOrEqual(512);
    expect(stored!.bytes.byteLength).toBeLessThan(fixture.beforeBytes);

    // ACL policy custom metadata must survive the rewrite — losing it
    // would silently make the asset private and break read access.
    expect(stored!.customMetadata["custom:aclPolicy"]).toContain("visibility");
  });

  it("is a no-op on a second pass (idempotent for the community branch)", async () => {
    const fixture = await seedCommunityWithLargeAvatar();

    // First pass — must rewrite.
    const first = await runNormalizeProfileImages();
    expect(first.rewritten).toBeGreaterThanOrEqual(1);

    const afterFirst = storageMap.get(fixture.bucketKey);
    expect(afterFirst).toBeDefined();
    const sizeAfterFirst = afterFirst!.bytes.byteLength;

    // Second pass — already JPEG and at/under target, must short-circuit.
    // Use onlyUserId=null (default) so the community sweep runs again.
    const second = await runNormalizeProfileImages();
    expect(second.skippedAlreadyNormalized).toBeGreaterThanOrEqual(1);

    // The stored bytes must be byte-identical to the post-first-pass
    // version — no second rewrite happened.
    const afterSecond = storageMap.get(fixture.bucketKey);
    expect(afterSecond).toBeDefined();
    expect(afterSecond!.bytes.byteLength).toBe(sizeAfterFirst);
    expect(Buffer.compare(afterSecond!.bytes, afterFirst!.bytes)).toBe(0);
  });
});
