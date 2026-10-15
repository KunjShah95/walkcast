export function RecordLightHalo() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -inset-3 -z-10 rounded-[14px] opacity-70 blur-md motion-reduce:animate-none motion-safe:animate-pulse"
      style={{
        background:
          "radial-gradient(ellipse at 83% 24%, color-mix(in srgb, var(--rec) 55%, transparent), transparent 60%)",
      }}
    />
  );
}
