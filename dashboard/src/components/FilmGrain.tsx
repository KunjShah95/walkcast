const NOISE_SVG = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>',
);
const NOISE_DATA_URL = `url("data:image/svg+xml,${NOISE_SVG}")`;

export function FilmGrain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[1] mix-blend-overlay motion-reduce:opacity-0"
      style={{
        backgroundImage: NOISE_DATA_URL,
        backgroundRepeat: "repeat",
        backgroundSize: "140px 140px",
        opacity: "var(--grain-opacity)",
      }}
    />
  );
}
