import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { QrCode, Download, X, Link2, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProfileQRProps {
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  rank?: string | null;
  rankColor: string;
}

function buildPermanentUrl(username: string) {
  if (typeof window === "undefined") return `/u/${username}`;
  const basePath = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  return `${window.location.origin}${basePath}/u/${username}`;
}

export default function ProfileQR({ username, displayName, avatarUrl, rank, rankColor }: ProfileQRProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [chipDataUrl, setChipDataUrl] = useState<string>("");
  const modalCanvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  const url = buildPermanentUrl(username);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: 96,
      color: { dark: "#E8754A", light: "#00000000" },
    })
      .then((d) => { if (!cancelled) setChipDataUrl(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [url]);

  useEffect(() => {
    if (!open || !modalCanvasRef.current) return;
    QRCode.toCanvas(modalCanvasRef.current, url, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 280,
      color: { dark: rankColor, light: "#000000" },
    }).catch(() => {});
  }, [open, url, rankColor]);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: "Permanent link copied", description: url });
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const downloadCard = async () => {
    const dataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 720,
      color: { dark: rankColor, light: "#000000" },
    });
    const card = document.createElement("canvas");
    card.width = 1080;
    card.height = 1350;
    const ctx = card.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, card.width, card.height);
    const grad = ctx.createRadialGradient(540, 200, 50, 540, 200, 900);
    grad.addColorStop(0, `${rankColor}30`);
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, card.width, card.height);
    ctx.strokeStyle = `${rankColor}55`;
    ctx.lineWidth = 4;
    ctx.strokeRect(40, 40, 1000, 1270);
    ctx.fillStyle = rankColor;
    ctx.font = "900 64px 'Space Grotesk', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ORBN", 540, 150);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 56px 'Space Grotesk', sans-serif";
    ctx.fillText(displayName.toUpperCase(), 540, 250);
    ctx.fillStyle = `${rankColor}cc`;
    ctx.font = "700 36px sans-serif";
    ctx.fillText(`@${username}`, 540, 310);
    if (rank) {
      ctx.fillStyle = rankColor;
      ctx.font = "900 28px sans-serif";
      ctx.fillText(rank.toUpperCase(), 540, 360);
    }
    const qrImg = new Image();
    await new Promise<void>((resolve, reject) => {
      qrImg.onload = () => resolve();
      qrImg.onerror = () => reject();
      qrImg.src = dataUrl;
    });
    const qrSize = 720;
    ctx.drawImage(qrImg, (card.width - qrSize) / 2, 430, qrSize, qrSize);
    ctx.fillStyle = "#ffffff99";
    ctx.font = "600 28px sans-serif";
    ctx.fillText("Scan to view profile", 540, 1200);
    ctx.fillStyle = `${rankColor}cc`;
    ctx.font = "700 24px monospace";
    ctx.fillText(url.replace(/^https?:\/\//, ""), 540, 1255);

    const link = document.createElement("a");
    link.download = `nexusid-${username}.png`;
    link.href = card.toDataURL("image/png");
    link.click();
    toast({ title: "QR card saved" });
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group relative flex flex-col items-center gap-1 px-2 py-1.5 border border-[#E8754A]/25 bg-black/60 hover:border-[#E8754A]/55 transition-colors"
        aria-label={`Open QR code for @${username}`}
        title={`Permanent link: ${url}`}
      >
        {chipDataUrl ? (
          <img src={chipDataUrl} alt="" className="w-12 h-12" />
        ) : (
          <div className="w-12 h-12 flex items-center justify-center"><QrCode className="w-6 h-6 text-[#E8754A]/55" /></div>
        )}
        <span className="text-[8px] font-black uppercase tracking-[0.18em] text-[#E8754A]/65 group-hover:text-[#E8754A]">
          @{username}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Profile QR code"
        >
          <div
            className="relative bg-[#0a0a0a] border max-w-sm w-full p-6"
            style={{ borderColor: `${rankColor}55`, boxShadow: `0 0 60px -10px ${rankColor}80` }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 text-white/40 hover:text-white"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="text-center mb-4">
              <div className="text-[9px] font-black uppercase tracking-[0.25em]" style={{ color: rankColor }}>
                ORBN · IDENTITY
              </div>
              <div className="font-black text-xl tracking-tight uppercase mt-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {displayName}
              </div>
              <div className="text-sm font-bold" style={{ color: `${rankColor}cc` }}>@{username}</div>
              {rank && (
                <div className="text-[9px] font-black uppercase tracking-[0.25em] mt-1" style={{ color: rankColor }}>
                  {rank}
                </div>
              )}
            </div>
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-black border" style={{ borderColor: `${rankColor}40` }}>
                <canvas ref={modalCanvasRef} width={280} height={280} aria-label={`QR code for @${username}`} />
              </div>
            </div>
            <div className="text-center text-[10px] font-bold text-white/45 mb-4 break-all">
              {url}
            </div>
            <div className="flex gap-2">
              <button
                onClick={copyUrl}
                className="flex-1 flex items-center justify-center gap-1.5 h-9 bg-transparent border border-white/15 text-white/70 hover:border-[#E8754A]/45 hover:text-[#E8754A] text-[10px] font-black uppercase tracking-wider transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy Link"}
              </button>
              <button
                onClick={downloadCard}
                className="flex-1 flex items-center justify-center gap-1.5 h-9 text-black text-[10px] font-black uppercase tracking-wider transition-colors hover:opacity-90"
                style={{ background: rankColor }}
              >
                <Download className="w-3.5 h-3.5" />
                Save Card
              </button>
            </div>
            {avatarUrl && (
              <div className="text-center text-[9px] font-bold text-white/30 mt-3 uppercase tracking-wider">
                Scan from any phone — opens profile instantly
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
