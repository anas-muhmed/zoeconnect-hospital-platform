"use client";

export function AuroraBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-1/2 top-[-10%] h-[600px] w-[600px] -translate-x-1/2 animate-float rounded-full bg-signal-500/18 blur-[130px]" />
      <div className="absolute right-[-10%] top-1/3 h-[500px] w-[500px] animate-float rounded-full bg-signal-300/15 blur-[130px]" />
      <div className="absolute bottom-[-15%] left-[-10%] h-[500px] w-[500px] animate-float-delay rounded-full bg-signal-600/15 blur-[130px]" />
      <div className="grid-fade absolute inset-0" />
    </div>
  );
}
