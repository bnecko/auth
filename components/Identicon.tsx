// Deterministic GitHub-style identicon rendered as pure SVG — no upload, no
// storage, no dependencies. A 5x5 grid mirrored across the vertical axis, with
// a colour and pattern derived from the seed. When the user picks a preset, the
// preset index seeds it; otherwise it derives from their stable public_id, so
// every account always has a recognisable avatar with no backfill.

const PALETTE = [
  "#2f6fed",
  "#1c9c5a",
  "#c0392b",
  "#8e44ad",
  "#d68910",
  "#16a085",
  "#2c3e50",
  "#e84393",
];

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function Identicon({
  seed,
  preset,
  size = 40,
}: {
  seed: string;
  preset?: number | null;
  size?: number;
}) {
  const base = preset != null ? `preset-${preset}` : seed;
  const h = hashString(base);
  const color = PALETTE[(preset != null ? preset : h) % PALETTE.length];

  const cell = size / 5;
  const rects: React.ReactNode[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const on = ((h >> (row * 3 + col)) & 1) === 1;
      if (!on) continue;
      const cols = col < 2 ? [col, 4 - col] : [col];
      for (const c of cols) {
        rects.push(
          <rect
            key={`${row}-${c}`}
            x={c * cell}
            y={row * cell}
            width={cell}
            height={cell}
            fill={color}
          />,
        );
      }
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="avatar"
      className="rounded-md shrink-0"
    >
      <rect width={size} height={size} fill="var(--hover)" />
      {rects}
    </svg>
  );
}
