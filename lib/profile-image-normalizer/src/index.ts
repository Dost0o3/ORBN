/**
 * Shared profile-image normalization logic.
 *
 * Used by both the one-shot CLI script
 * (`scripts/src/normalize-profile-images.ts`) and the api-server's recurring
 * cleanup job (`artifacts/api-server/src/lib/profile-image-cleanup.ts`) so the
 * exact same idempotent rewrite happens whether an operator runs it by hand or
 * the scheduled sweep runs in production.
 *
 * The web uploader now crops + re-encodes images client-side before they ever
 * reach object storage, but assets uploaded *before* that change — plus any
 * future regressions, bulk imports, or seeds — can still be sitting at their
 * original (often multi-MB) dimensions. This module walks every user's
 * `avatarUrl` / `coverUrl` and every community's `avatarUrl` / `bannerUrl`,
 * downloads the asset, resizes it to the target dimensions, re-encodes as
 * JPEG (quality ~90), and writes it back in place.
 *
 * Idempotency: assets that are already JPEG and already at (or under) the
 * target dimensions are left untouched.
 */
import { Storage, type File } from "@google-cloud/storage";
import sharp from "sharp";
import { db, usersTable, communitiesTable } from "@workspace/db";
import { eq, isNotNull, or } from "drizzle-orm";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export type Kind =
  | "avatar"
  | "cover"
  | "community-avatar"
  | "community-banner";

const TARGETS: Record<Kind, { w: number; h: number; quality: number }> = {
  avatar: { w: 512, h: 512, quality: 90 },
  cover: { w: 1500, h: 500, quality: 90 },
  "community-avatar": { w: 512, h: 512, quality: 90 },
  "community-banner": { w: 1500, h: 500, quality: 90 },
};

function getPrivateObjectDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) {
    throw new Error("PRIVATE_OBJECT_DIR not set");
  }
  return dir;
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  const p = path.startsWith("/") ? path : `/${path}`;
  const parts = p.split("/");
  if (parts.length < 3) throw new Error(`Invalid object path: ${path}`);
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

/**
 * Resolve a stored avatarUrl/coverUrl to the underlying GCS File handle.
 *
 * Owned formats we normalize:
 *   - `/objects/{entityId}` — canonical app-served path
 *   - `https://storage.googleapis.com/{bucket}/{...}/uploads/{entityId}` —
 *     legacy raw GCS URLs that some early uploads stored before the client
 *     started normalizing to `/objects/...` (mirrors the logic in
 *     ObjectStorageService.normalizeObjectEntityPath).
 *
 * Everything else (e.g. Clerk-hosted avatars, third-party image CDNs) returns
 * null and is skipped — they aren't the legacy bloat this script is here to
 * fix and we don't own them.
 */
function resolveObjectFile(url: string): File | null {
  let entityId: string | null = null;

  if (url.startsWith("/objects/")) {
    entityId = url.slice("/objects/".length);
  } else if (url.startsWith("https://storage.googleapis.com/")) {
    let dir = getPrivateObjectDir();
    if (!dir.endsWith("/")) dir = `${dir}/`;
    const rawPath = new URL(url).pathname;
    if (rawPath.startsWith(dir)) {
      entityId = rawPath.slice(dir.length);
    }
  }

  if (!entityId) return null;
  let dir = getPrivateObjectDir();
  if (!dir.endsWith("/")) dir = `${dir}/`;
  const { bucketName, objectName } = parseObjectPath(`${dir}${entityId}`);
  return storage.bucket(bucketName).file(objectName);
}

async function streamToBuffer(file: File): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    file
      .createReadStream()
      .on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
      .on("end", () => resolve())
      .on("error", reject);
  });
  return Buffer.concat(chunks);
}

export interface NormalizeResult {
  status:
    | "skipped-already-normalized"
    | "skipped-external"
    | "skipped-missing"
    | "rewritten"
    | "failed";
  beforeBytes?: number;
  afterBytes?: number;
  reason?: string;
}

export async function normalizeOne(
  url: string | null,
  kind: Kind,
  dryRun: boolean,
): Promise<NormalizeResult> {
  if (!url) return { status: "skipped-missing" };
  const file = resolveObjectFile(url);
  if (!file) return { status: "skipped-external", reason: "non-/objects URL" };

  const [exists] = await file.exists();
  if (!exists)
    return { status: "skipped-missing", reason: "object not in storage" };

  const [metadata] = await file.getMetadata();
  const beforeBytes = Number(metadata.size ?? 0);
  const target = TARGETS[kind];

  const buf = await streamToBuffer(file);
  const meta = await sharp(buf).metadata();
  const isJpeg = meta.format === "jpeg";
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const atOrUnderTarget = w > 0 && h > 0 && w <= target.w && h <= target.h;

  // Idempotency: if it's already JPEG and already at/under target, leave it.
  if (isJpeg && atOrUnderTarget) {
    return { status: "skipped-already-normalized", beforeBytes };
  }

  const resized = await sharp(buf)
    .rotate() // honor EXIF orientation before resize
    .resize(target.w, target.h, { fit: "cover", position: "centre" })
    .jpeg({ quality: target.quality, mozjpeg: true })
    .toBuffer();

  if (dryRun) {
    return { status: "rewritten", beforeBytes, afterBytes: resized.byteLength };
  }

  // Preserve existing custom metadata (notably the ACL policy stored under
  // "custom:aclPolicy") — overwriting without it would drop the public/private
  // visibility flag and break read access for other users.
  await file.save(resized, {
    contentType: "image/jpeg",
    resumable: false,
    metadata: {
      contentType: "image/jpeg",
      metadata: metadata.metadata ?? {},
    },
  });

  return { status: "rewritten", beforeBytes, afterBytes: resized.byteLength };
}

export interface NormalizeRunTotals {
  rewritten: number;
  skippedAlreadyNormalized: number;
  skippedExternal: number;
  skippedMissing: number;
  failed: number;
  bytesBefore: number;
  bytesAfter: number;
  usersScanned: number;
  communitiesScanned: number;
}

export interface NormalizeRunOptions {
  dryRun?: boolean;
  /** Limit the sweep to a single user id (for debugging). */
  onlyUserId?: string | null;
  /** Per-asset progress hook, used by the CLI for human-readable output. */
  onProgress?: (event: {
    /** Owner label for log output — username for users, community name for communities. */
    owner: string;
    kind: Kind;
    result: NormalizeResult;
  }) => void;
}

export async function runNormalizeProfileImages(
  opts: NormalizeRunOptions = {},
): Promise<NormalizeRunTotals> {
  const dryRun = opts.dryRun ?? false;
  const onlyUserId = opts.onlyUserId ?? null;

  const where = onlyUserId
    ? eq(usersTable.id, onlyUserId)
    : or(isNotNull(usersTable.avatarUrl), isNotNull(usersTable.coverUrl));

  const users = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      avatarUrl: usersTable.avatarUrl,
      coverUrl: usersTable.coverUrl,
    })
    .from(usersTable)
    .where(where);

  // Communities have their own avatar (icon) + banner images stored in object
  // storage that suffer from the same legacy bloat — uploaded before the
  // cropper existed and still sitting at original dimensions. Skip when
  // targeting a single user via --user, since that flag scopes the run to one
  // profile. We include any community with at least one of the two URLs set so
  // a community with only a banner (or only an avatar) is still scanned.
  const communities = onlyUserId
    ? []
    : await db
        .select({
          id: communitiesTable.id,
          name: communitiesTable.name,
          avatarUrl: communitiesTable.avatarUrl,
          bannerUrl: communitiesTable.bannerUrl,
        })
        .from(communitiesTable)
        .where(
          or(
            isNotNull(communitiesTable.avatarUrl),
            isNotNull(communitiesTable.bannerUrl),
          ),
        );

  const totals: NormalizeRunTotals = {
    rewritten: 0,
    skippedAlreadyNormalized: 0,
    skippedExternal: 0,
    skippedMissing: 0,
    failed: 0,
    bytesBefore: 0,
    bytesAfter: 0,
    usersScanned: users.length,
    communitiesScanned: communities.length,
  };

  const tally = (result: NormalizeResult) => {
    switch (result.status) {
      case "rewritten":
        totals.rewritten++;
        totals.bytesBefore += result.beforeBytes ?? 0;
        totals.bytesAfter += result.afterBytes ?? 0;
        break;
      case "skipped-already-normalized":
        totals.skippedAlreadyNormalized++;
        break;
      case "skipped-external":
        totals.skippedExternal++;
        break;
      case "skipped-missing":
        totals.skippedMissing++;
        break;
      case "failed":
        totals.failed++;
        break;
    }
  };

  for (const u of users) {
    for (const kind of ["avatar", "cover"] as const) {
      const url = kind === "avatar" ? u.avatarUrl : u.coverUrl;
      if (!url) continue;
      let result: NormalizeResult;
      try {
        result = await normalizeOne(url, kind, dryRun);
      } catch (err) {
        result = {
          status: "failed",
          reason: err instanceof Error ? err.message : String(err),
        };
      }
      tally(result);
      opts.onProgress?.({ owner: u.username, kind, result });
    }
  }

  for (const c of communities) {
    for (const kind of ["community-avatar", "community-banner"] as const) {
      const url = kind === "community-avatar" ? c.avatarUrl : c.bannerUrl;
      if (!url) continue;
      let result: NormalizeResult;
      try {
        result = await normalizeOne(url, kind, dryRun);
      } catch (err) {
        result = {
          status: "failed",
          reason: err instanceof Error ? err.message : String(err),
        };
      }
      tally(result);
      opts.onProgress?.({
        owner: `community:${c.name}`,
        kind,
        result,
      });
    }
  }

  return totals;
}
