import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

export type UploadAspect = "square" | "wide";
export type UploadSource = "library" | "camera";

/**
 * Thrown when the user has permanently denied a permission we need
 * (status === "denied" && canAskAgain === false). The OS will not
 * re-prompt — the only path forward is the system Settings app.
 *
 * Callers should catch this and surface a UI that includes an
 * "Open Settings" affordance (Linking.openSettings()).
 */
export class PermissionPermanentlyDeniedError extends Error {
  /** Which permission was denied. Drives the UI copy in the caller. */
  readonly permission: "camera" | "library";
  constructor(permission: "camera" | "library", message: string) {
    super(message);
    this.name = "PermissionPermanentlyDeniedError";
    this.permission = permission;
  }
}

interface Preset {
  ratio: [number, number];
  outW: number;
  outH: number;
  quality: number;
}

const PRESETS: Record<UploadAspect, Preset> = {
  square: { ratio: [1, 1], outW: 512, outH: 512, quality: 0.9 },
  wide: { ratio: [3, 1], outW: 1500, outH: 500, quality: 0.9 },
};

// Match the server-side image cap in
// artifacts/api-server/src/routes/storage.ts (IMAGE_MAX_BYTES = 8 MB) so users
// don't get rejected after the upload URL is requested.
const MAX_BYTES = 8 * 1024 * 1024;

export interface UploadDeps {
  apiBase: string;
  getToken: () => Promise<string | null>;
  /**
   * Called with a 0–100 integer as the PUT to the presigned URL progresses.
   * Reflects the actual bytes uploaded, not a fake animation. May be called
   * with 100 once the PUT finishes; never called after the upload resolves.
   */
  onProgress?: (percent: number) => void;
  /**
   * Optional AbortSignal. When aborted, the in-flight PUT to the
   * presigned URL is torn down (xhr.abort) and `pickAndUploadImage`
   * rejects with an Error whose `.name === "AbortError"`. Callers
   * can use that to distinguish a user cancel from a real failure
   * and avoid surfacing an "Upload failed" alert.
   */
  signal?: AbortSignal;
}

/** Test for an abort error without depending on the global DOMException. */
export function isUploadAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/**
 * PUT a Blob to the presigned URL using XMLHttpRequest so we can surface
 * upload progress. `fetch` in React Native has no equivalent of
 * `xhr.upload.onprogress`, which is why we drop down to XHR here.
 */
function putWithProgress(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (ev: ProgressEvent) => {
        if (ev.lengthComputable && ev.total > 0) {
          const pct = Math.min(100, Math.round((ev.loaded / ev.total) * 100));
          onProgress(pct);
        }
      };
    }
    const makeAbortError = () => {
      const e = new Error("Upload aborted");
      e.name = "AbortError";
      return e;
    };

    // Pre-aborted signal: bail before opening the socket.
    if (signal?.aborted) {
      reject(makeAbortError());
      return;
    }

    const onAbort = () => {
      try {
        xhr.abort();
      } catch {
        // ignore — we'll reject below regardless
      }
      reject(makeAbortError());
    };
    signal?.addEventListener("abort", onAbort);

    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
    };

    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error("Upload to storage failed"));
      }
    };
    xhr.onerror = () => {
      cleanup();
      reject(new Error("Upload to storage failed"));
    };
    xhr.onabort = () => {
      cleanup();
      // If the abort came from our signal listener it has already
      // rejected with AbortError. Calling reject() here is a no-op
      // because the promise is already settled, but we still want
      // a non-AbortError fallback for non-signal-triggered aborts
      // (defensive — XHR doesn't otherwise abort itself).
      reject(makeAbortError());
    };
    xhr.send(blob);
  });
}

/**
 * Pick an image from the camera roll, present the system editor at the
 * requested aspect ratio, then deterministically center-crop the result to
 * the exact target ratio and resize to the preset output dimensions as JPEG.
 *
 * The post-pick center-crop is essential: on iOS, `expo-image-picker`'s
 * `aspect` option is not reliably enforced for non-square ratios, so we
 * cannot trust the picker to hand us a 3:1 cover image. By cropping to the
 * target ratio ourselves before the resize, we guarantee a non-distorted
 * output regardless of what the picker returned.
 *
 * Then uploads via the same presigned-URL flow the web app uses, returning
 * the served URL — or `null` if the user cancelled.
 */
export async function pickAndUploadImage(
  aspect: UploadAspect,
  { apiBase, getToken, onProgress, signal }: UploadDeps,
  source: UploadSource = "library",
): Promise<string | null> {
  const preset = PRESETS[aspect];
  const targetRatio = preset.outW / preset.outH;

  const pickerOptions: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: preset.ratio,
    quality: 1,
    exif: false,
  };

  let picked: ImagePicker.ImagePickerResult;
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      // `canAskAgain === false` means the OS will no longer surface
      // the prompt — the only path forward is the system Settings app.
      // Signal that with a typed error so callers can offer a one-tap
      // "Open Settings" shortcut instead of a dead-end alert.
      if (perm.canAskAgain === false) {
        throw new PermissionPermanentlyDeniedError(
          "camera",
          "Camera access is turned off for this app. Open Settings to enable it, then try again.",
        );
      }
      throw new Error(
        "Camera access was denied. You can enable it in Settings to take a new photo.",
      );
    }
    picked = await ImagePicker.launchCameraAsync({
      ...pickerOptions,
      cameraType:
        aspect === "square"
          ? ImagePicker.CameraType.front
          : ImagePicker.CameraType.back,
    });
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (perm.canAskAgain === false) {
        throw new PermissionPermanentlyDeniedError(
          "library",
          "Photo library access is turned off for this app. Open Settings to enable it, then try again.",
        );
      }
      throw new Error("Permission to access photos was denied");
    }
    picked = await ImagePicker.launchImageLibraryAsync(pickerOptions);
  }

  if (picked.canceled || !picked.assets?.[0]) {
    return null;
  }

  const asset = picked.assets[0];
  const srcW = asset.width ?? preset.outW;
  const srcH = asset.height ?? preset.outH;
  const srcRatio = srcW / srcH;

  // Center-crop to the exact target ratio so a non-3:1 (or non-1:1) source
  // becomes the right shape without any stretch/distortion.
  let cropW: number;
  let cropH: number;
  if (srcRatio > targetRatio) {
    // Source is wider than target — trim the sides.
    cropH = srcH;
    cropW = Math.round(srcH * targetRatio);
  } else {
    // Source is taller than target — trim top/bottom.
    cropW = srcW;
    cropH = Math.round(srcW / targetRatio);
  }
  const originX = Math.max(0, Math.round((srcW - cropW) / 2));
  const originY = Math.max(0, Math.round((srcH - cropH) / 2));

  const manipulated = await ImageManipulator.manipulateAsync(
    asset.uri,
    [
      { crop: { originX, originY, width: cropW, height: cropH } },
      { resize: { width: preset.outW, height: preset.outH } },
    ],
    {
      compress: preset.quality,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );

  const blob = await (await fetch(manipulated.uri)).blob();
  if (blob.size > MAX_BYTES) {
    throw new Error(
      `Image is too large after compression (max ${Math.round(MAX_BYTES / (1024 * 1024))} MB)`,
    );
  }
  const fileName = `profile-${aspect}-${Date.now()}.jpg`;

  const token = await getToken();
  const authHeaders: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  const reqRes = await fetch(`${apiBase}/api/storage/uploads/request-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({
      name: fileName,
      size: blob.size,
      contentType: "image/jpeg",
    }),
  });
  if (!reqRes.ok) {
    throw new Error("Failed to get upload URL");
  }
  const { uploadURL, objectPath } = (await reqRes.json()) as {
    uploadURL: string;
    objectPath: string;
  };

  onProgress?.(0);
  await putWithProgress(uploadURL, blob, "image/jpeg", onProgress, signal);

  // If the caller cancelled between PUT completion and finalize, treat
  // it as an aborted upload too. The orphan object will be cleaned up
  // by the background sweep — we don't want to commit a URL the user
  // already asked us to discard.
  if (signal?.aborted) {
    const e = new Error("Upload aborted");
    e.name = "AbortError";
    throw e;
  }

  const finRes = await fetch(`${apiBase}/api/storage/objects/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ objectPath, visibility: "public" }),
  });
  if (!finRes.ok) {
    throw new Error("Failed to finalize upload");
  }

  return `${apiBase}/api/storage${objectPath}`;
}
