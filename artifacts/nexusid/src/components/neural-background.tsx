export default function NeuralBackground() {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      {/* Translucent base — lets the body wallpaper bleed through for iOS-matched watermorphism */}
      <div className="absolute inset-0 bg-[hsl(212,60%,10%)]/82" />

      {/* Radial gold + crimson glows */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(232,117,74,0.16) 0%, transparent 70%), " +
            "radial-gradient(ellipse 60% 50% at 80% 100%, rgba(220,20,60,0.10) 0%, transparent 60%), " +
            "radial-gradient(ellipse 50% 50% at 10% 70%, rgba(232,117,74,0.07) 0%, transparent 60%)",
        }}
      />

      {/* Subtle CSS grid */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(232,117,74,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(232,117,74,0.5) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse 70% 70% at 50% 50%, black 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 70% at 50% 50%, black 30%, transparent 80%)",
        }}
      />

      {/* Floating orbs — CSS animation only */}
      <div className="absolute top-[20%] left-[15%] w-72 h-72 bg-[#E8754A]/10 blur-[100px] rounded-full float-slow" />
      <div
        className="absolute bottom-[15%] right-[10%] w-96 h-96 bg-[#DC143C]/8 blur-[120px] rounded-full float-slow"
        style={{ animationDelay: "2s" }}
      />
      <div
        className="absolute top-[60%] left-[60%] w-64 h-64 bg-[#E8754A]/8 blur-[80px] rounded-full float-slow"
        style={{ animationDelay: "4s" }}
      />

      {/* Scanline overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 1px, transparent 1px, transparent 3px)",
        }}
      />

      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 100% 100% at 50% 50%, transparent 40%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </div>
  );
}
