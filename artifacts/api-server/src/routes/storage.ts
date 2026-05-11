import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { getAuth } from "@clerk/express";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  // Require authenticated Clerk session — anonymous callers must NEVER be able
  // to mint signed upload URLs to private storage (cost & abuse vector).
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    // Server-side size cap. The web client now crops & re-encodes profile
    // images before upload, so legitimate avatar/cover uploads are well
    // under 1 MB. We keep a generous absolute ceiling here so misbehaving
    // or non-cropped clients can't dump arbitrarily large blobs into
    // storage. Images get a tighter cap than other content types.
    const ABSOLUTE_MAX_BYTES = 25 * 1024 * 1024; // 25 MB hard ceiling
    const IMAGE_MAX_BYTES = 8 * 1024 * 1024; // 8 MB for image/*
    const limit = contentType.startsWith("image/") ? IMAGE_MAX_BYTES : ABSOLUTE_MAX_BYTES;
    if (size > limit) {
      res.status(413).json({
        error: `File too large — max ${Math.round(limit / (1024 * 1024))} MB`,
      });
      return;
    }

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * POST /storage/objects/finalize
 *
 * Called by the client AFTER it successfully PUTs the file to the presigned
 * URL. Sets an ACL policy on the object with the uploader as owner so the
 * read endpoint can later authorize them.
 *
 * Body: { objectPath: "/objects/{entityId}", visibility?: "public" | "private" }
 *
 * `visibility` defaults to "private". Pass "public" for profile media (avatars,
 * cover images) and other assets that need to be readable by other users —
 * without this, anyone visiting another user's profile would see broken images
 * because the read endpoint only allows the uploader through for private
 * objects.
 */
router.post("/storage/objects/finalize", async (req: Request, res: Response) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const objectPath: unknown = req.body?.objectPath;
  if (typeof objectPath !== "string" || !objectPath.startsWith("/objects/")) {
    res.status(400).json({ error: "Invalid objectPath" });
    return;
  }

  const rawVisibility: unknown = req.body?.visibility;
  let visibility: "public" | "private" = "private";
  if (rawVisibility === "public" || rawVisibility === "private") {
    visibility = rawVisibility;
  } else if (rawVisibility !== undefined) {
    res.status(400).json({ error: "visibility must be 'public' or 'private'" });
    return;
  }

  try {
    await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
      owner: clerkId,
      visibility,
    });
    res.json({ ok: true, objectPath, visibility });
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error finalizing object ACL");
    res.status(500).json({ error: "Failed to finalize object" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    // Public objects (e.g. profile avatars/cover images) must be readable by
    // anyone — they are embedded across the app, shown on share previews,
    // and rendered by OG-image fetchers that don't carry a Clerk session.
    // Private objects still require an authenticated session AND ownership/ACL.
    const { userId: clerkId } = getAuth(req);

    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const canAccess = await objectStorageService.canAccessObjectEntity({
      userId: clerkId ?? undefined,
      objectFile,
      requestedPermission: ObjectPermission.READ,
    });
    if (!canAccess) {
      // 401 if the caller has no session at all (might just need to log in to
      // see a private asset they own); 403 otherwise.
      res.status(clerkId ? 403 : 401).json({ error: clerkId ? "Forbidden" : "Unauthorized" });
      return;
    }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
