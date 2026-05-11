import { useRef, useState, useCallback, useEffect } from "react";
import { Upload, X, ImageIcon, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type CropAspect = "square" | "wide" | "free";

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  accept?: string;
  maxSizeMb?: number;
  className?: string;
  compact?: boolean;
  /**
   * ACL visibility to stamp on the uploaded object.
   * - "public" — readable by anyone (use for profile avatars, cover images,
   *   community banners, anything embedded in shareable pages).
   * - "private" — only readable by the uploader (default; use for sensitive
   *   docs, in-progress drafts, etc.).
   */
  visibility?: "public" | "private";
  /**
   * If set, the user is shown an in-browser cropper after picking an image.
   * The cropped output is resized & re-encoded to a sensible max dimension
   * before upload.
   * - "square" → 1:1, 512×512 (avatar)
   * - "wide"   → 3:1, 1500×500 (cover banner)
   * - "free"   → no crop, upload as-is (default)
   */
  aspect?: CropAspect;
}

const BASE_API = "/api";

const CROP_PRESETS: Record<
  Exclude<CropAspect, "free">,
  { ratio: number; outW: number; outH: number; mime: string; quality: number; viewW: number; viewH: number }
> = {
  square: {
    ratio: 1,
    outW: 512,
    outH: 512,
    mime: "image/jpeg",
    quality: 0.9,
    viewW: 280,
    viewH: 280,
  },
  wide: {
    ratio: 3,
    outW: 1500,
    outH: 500,
    mime: "image/jpeg",
    quality: 0.9,
    viewW: 360,
    viewH: 120,
  },
};

export function ImageUploader({
  value,
  onChange,
  label = "Upload image",
  accept = "image/*",
  maxSizeMb = 10,
  className,
  compact = false,
  visibility = "private",
  aspect = "free",
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [pendingCrop, setPendingCrop] = useState<File | null>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      setError(null);
      if (file.size > maxSizeMb * 1024 * 1024) {
        setError(`File too large — max ${maxSizeMb} MB`);
        return;
      }

      setUploading(true);
      setProgress(10);

      try {
        // 1. Request presigned URL
        const res = await fetch(`${BASE_API}/storage/uploads/request-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            contentType: file.type || "application/octet-stream",
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to get upload URL");
        }

        const { uploadURL, objectPath } = await res.json();
        setProgress(30);

        // 2. PUT directly to GCS presigned URL
        const putRes = await fetch(uploadURL, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
        });

        if (!putRes.ok) {
          throw new Error("Upload to storage failed");
        }

        setProgress(80);

        // 3. Finalize: ask the server to stamp the object's ACL with the
        // current user as owner. Without this, the read endpoint returns 403.
        // Pass `visibility` so profile/community-style assets can be marked
        // public and rendered to other viewers (private is owner-only).
        const finalizeRes = await fetch(`${BASE_API}/storage/objects/finalize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ objectPath, visibility }),
        });
        if (!finalizeRes.ok) {
          throw new Error("Failed to finalize upload");
        }

        setProgress(95);

        // 4. Build serving URL: /api/storage/objects/{entityId}
        // objectPath is like /objects/{entityId}
        const serveUrl = `${window.location.origin}${BASE_API}/storage${objectPath}`;
        onChange(serveUrl);
        setProgress(100);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
        setTimeout(() => setProgress(0), 600);
      }
    },
    [maxSizeMb, onChange, visibility],
  );

  const handlePickedFile = useCallback(
    (file: File) => {
      setError(null);
      // Only route image uploads through the cropper. Non-image files (or
      // when aspect="free") go straight to upload.
      if (aspect !== "free" && file.type.startsWith("image/")) {
        if (file.size > maxSizeMb * 1024 * 1024) {
          setError(`File too large — max ${maxSizeMb} MB`);
          return;
        }
        setPendingCrop(file);
        return;
      }
      uploadFile(file);
    },
    [aspect, maxSizeMb, uploadFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handlePickedFile(file);
    },
    [handlePickedFile],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handlePickedFile(file);
      e.target.value = "";
    },
    [handlePickedFile],
  );

  const clear = useCallback(
    (ev: React.MouseEvent) => {
      ev.stopPropagation();
      onChange("");
      setError(null);
    },
    [onChange],
  );

  const cropper = pendingCrop && aspect !== "free" ? (
    <CropperModal
      file={pendingCrop}
      aspect={aspect}
      onCancel={() => setPendingCrop(null)}
      onConfirm={(blob) => {
        const cropped = new File([blob], renameForOutput(pendingCrop.name, aspect), {
          type: CROP_PRESETS[aspect].mime,
        });
        setPendingCrop(null);
        uploadFile(cropped);
      }}
    />
  ) : null;

  if (compact) {
    return (
      <div className={cn("relative group", className)}>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="relative w-full h-9 flex items-center gap-2 px-3 bg-black border border-[#E8754A]/18 hover:border-[#E8754A]/45 rounded-md text-sm text-white/40 hover:text-white/70 transition-colors"
        >
          {uploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E8754A]" />
          ) : (
            <Upload className="w-3.5 h-3.5 shrink-0" />
          )}
          <span className="flex-1 text-left truncate text-xs">
            {uploading ? `Uploading… ${progress}%` : value ? "Change photo" : label}
          </span>
          {value && !uploading && (
            <button
              type="button"
              onClick={clear}
              className="ml-auto text-white/25 hover:text-red-400 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </button>
        {value && (
          <div className="mt-2">
            <img
              src={value}
              alt="Preview"
              className="h-16 w-16 rounded-full object-cover border border-[#E8754A]/25"
            />
          </div>
        )}
        {error && <p className="mt-1 text-[10px] text-red-400">{error}</p>}
        {uploading && progress > 0 && (
          <div className="mt-1 h-0.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#E8754A] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        {cropper}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && !uploading && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "relative w-full rounded-lg border-2 border-dashed transition-all duration-200 cursor-pointer select-none overflow-hidden",
          dragging
            ? "border-[#E8754A]/60 bg-[#E8754A]/8"
            : "border-[#E8754A]/20 hover:border-[#E8754A]/40 bg-black/40 hover:bg-[#E8754A]/4",
          uploading && "pointer-events-none opacity-75",
        )}
      >
        {/* Existing image preview */}
        {value ? (
          <div className="relative">
            <img
              src={value}
              alt="Preview"
              className="w-full max-h-48 object-cover rounded-lg"
            />
            <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-3 rounded-lg">
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Replace
              </span>
            </div>
            {!uploading && (
              <button
                type="button"
                onClick={clear}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 border border-white/15 flex items-center justify-center text-white/60 hover:text-red-400 hover:border-red-400/40 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 px-4 gap-3">
            {uploading ? (
              <Loader2 className="w-8 h-8 text-[#E8754A] animate-spin" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-[#E8754A]/10 border border-[#E8754A]/20 flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-[#E8754A]/60" />
              </div>
            )}
            <div className="text-center">
              <p className="text-sm font-semibold text-white/55">
                {uploading ? `Uploading… ${progress}%` : label}
              </p>
              {!uploading && (
                <p className="text-xs text-white/25 mt-0.5">
                  Drag & drop or click · max {maxSizeMb} MB
                </p>
              )}
            </div>
          </div>
        )}

        {/* Progress bar */}
        {uploading && progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5">
            <div
              className="h-full bg-[#E8754A] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {error && (
        <p className="text-[11px] text-red-400 flex items-center gap-1.5">
          <X className="w-3 h-3 shrink-0" /> {error}
        </p>
      )}
      {cropper}
    </div>
  );
}

function renameForOutput(originalName: string, aspect: Exclude<CropAspect, "free">) {
  const base = originalName.replace(/\.[^./\\]+$/, "") || "image";
  const ext = CROP_PRESETS[aspect].mime === "image/jpeg" ? "jpg" : "webp";
  return `${base}-${aspect}.${ext}`;
}

interface CropperModalProps {
  file: File;
  aspect: Exclude<CropAspect, "free">;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}

/**
 * In-browser cropper. Shows the picked image inside a fixed-aspect viewport,
 * lets the user drag and zoom, and produces a resized JPEG of the requested
 * output dimensions. Avoids any third-party dependency — uses a single
 * canvas + pointer events.
 */
function CropperModal({ file, aspect, onCancel, onConfirm }: CropperModalProps) {
  const preset = CROP_PRESETS[aspect];
  const [imgUrl, setImgUrl] = useState<string>("");
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const dragState = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);

  // Load image once.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    const image = new Image();
    image.onload = () => setImg(image);
    image.onerror = () => setLoadError("Couldn't read that image");
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Reset transform whenever a new image loads.
  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [img]);

  const baseScale = img
    ? Math.max(preset.viewW / img.naturalWidth, preset.viewH / img.naturalHeight)
    : 1;
  const effScale = baseScale * zoom;
  const dispW = img ? img.naturalWidth * effScale : 0;
  const dispH = img ? img.naturalHeight * effScale : 0;

  // Clamp offset so the displayed image always covers the crop viewport.
  const clamp = useCallback(
    (o: { x: number; y: number }) => {
      const maxX = Math.max(0, (dispW - preset.viewW) / 2);
      const maxY = Math.max(0, (dispH - preset.viewH) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, o.x)),
        y: Math.min(maxY, Math.max(-maxY, o.y)),
      };
    },
    [dispW, dispH, preset.viewW, preset.viewH],
  );

  // Re-clamp when zoom changes.
  useEffect(() => {
    setOffset((prev) => clamp(prev));
  }, [clamp]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setOffset(clamp({ x: dragState.current.ox + dx, y: dragState.current.oy + dy }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragState.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore — pointer was already released
    }
  };

  const handleConfirm = useCallback(async () => {
    if (!img || busy) return;
    setBusy(true);
    try {
      // Map the visible viewport back to source-image coordinates.
      const srcW = preset.viewW / effScale;
      const srcH = preset.viewH / effScale;
      const srcX = (img.naturalWidth - srcW) / 2 - offset.x / effScale;
      const srcY = (img.naturalHeight - srcH) / 2 - offset.y / effScale;

      const canvas = document.createElement("canvas");
      canvas.width = preset.outW;
      canvas.height = preset.outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not available");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, preset.outW, preset.outH);

      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), preset.mime, preset.quality),
      );
      if (!blob) throw new Error("Failed to encode image");
      onConfirm(blob);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to crop image");
      setBusy(false);
    }
  }, [img, busy, effScale, offset, preset, onConfirm]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Crop image"
    >
      <div className="w-full max-w-md bg-[#0a0a0a] border border-[#E8754A]/25 rounded-lg p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-[0.18em] text-white">
            {aspect === "square" ? "Crop avatar" : "Crop cover image"}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-white/40 hover:text-white transition-colors"
            aria-label="Cancel crop"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className="relative mx-auto overflow-hidden bg-black border border-[#E8754A]/20 rounded-md touch-none cursor-grab active:cursor-grabbing"
          style={{ width: preset.viewW, height: preset.viewH }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {imgUrl && (
            <img
              src={imgUrl}
              alt=""
              draggable={false}
              className="absolute top-1/2 left-1/2 select-none pointer-events-none max-w-none"
              style={{
                width: dispW,
                height: dispH,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
            />
          )}
          {/* Subtle inner outline so the user sees the crop boundary */}
          <div
            className={cn(
              "absolute inset-0 pointer-events-none border border-white/30",
              aspect === "square" && "rounded-full",
            )}
          />
        </div>

        <div className="space-y-1.5">
          <label className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
            <span>Zoom</span>
            <span>{zoom.toFixed(1)}×</span>
          </label>
          <input
            type="range"
            min={1}
            max={4}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="w-full accent-[#E8754A]"
            aria-label="Zoom"
          />
        </div>

        {loadError && <p className="text-xs text-red-400">{loadError}</p>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 px-3 text-xs font-bold uppercase tracking-wider text-white/60 hover:text-white border border-white/10 hover:border-white/30 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!img || busy}
            className="h-9 px-3 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-black bg-[#E8754A] hover:bg-[#ff8a5b] disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {busy ? "Saving" : "Use photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
