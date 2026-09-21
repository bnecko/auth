import { encode } from "uqr";

const QUIET = 4;
const FINDER = 7;
const MODULE_RADIUS = 0.5;
const PLATE_RADIUS = 2;

// A finder eye is three nested squares filled even-odd: the ring, the gap
// inside it, and the pupil. Each is [inset, side, corner radius] in modules.
const FINDER_LAYERS = [
  [0, 7, 2.25],
  [1, 5, 1.6],
  [2, 3, 1.4],
];

type Radii = [topLeft: number, topRight: number, bottomRight: number, bottomLeft: number];

// Both control points of each curve sit on the corner itself, which gives the
// squarer corner qr.oqwo.org draws rather than a true arc.
function roundedSquare(x: number, y: number, side: number, [tl, tr, br, bl]: Radii) {
  const right = x + side;
  const bottom = y + side;
  return (
    `M${x + tl} ${y}H${right - tr}` +
    (tr ? `C${right} ${y} ${right} ${y} ${right} ${y + tr}` : "") +
    `V${bottom - br}` +
    (br ? `C${right} ${bottom} ${right} ${bottom} ${right - br} ${bottom}` : "") +
    `H${x + bl}` +
    (bl ? `C${x} ${bottom} ${x} ${bottom} ${x} ${bottom - bl}` : "") +
    `V${y + tl}` +
    (tl ? `C${x} ${y} ${x} ${y} ${x + tl} ${y}` : "") +
    "Z"
  );
}

function finderPath(eyes: number[][]) {
  let path = "";
  for (const [x, y] of eyes) {
    for (const [inset, side, radius] of FINDER_LAYERS) {
      path += roundedSquare(x + inset + QUIET, y + inset + QUIET, side, [radius, radius, radius, radius]);
    }
  }
  return path;
}

// Drawn as paths with presentation attributes rather than through the
// library's SVG renderer, because the production style-src has no
// 'unsafe-inline' and any style attribute in the markup would be dropped. No
// hooks and no client directive, so this renders on the server or inside a
// client component.
export function QrCode({ text, size = 216, label }: { text: string; size?: number; label: string }) {
  // The library's own one-module border is turned off so the finder eyes sit
  // at known coordinates and the quiet zone is set in one place.
  const { size: modules, data } = encode(text, { ecc: "M", border: 0 });
  const extent = modules + QUIET * 2;
  const eyes = [
    [0, 0],
    [modules - FINDER, 0],
    [0, modules - FINDER],
  ];

  const isDark = (x: number, y: number) => data[y]?.[x] === true;
  const inEye = (x: number, y: number) =>
    eyes.some(([ex, ey]) => x >= ex && x < ex + FINDER && y >= ey && y < ey + FINDER);
  // A corner is rounded only when both sides meeting at it are free, so
  // touching modules fuse into one shape instead of breaking into dots.
  const radius = (sideA: boolean, sideB: boolean) => (sideA || sideB ? 0 : MODULE_RADIUS);

  let path = "";
  for (let y = 0; y < modules; y++) {
    for (let x = 0; x < modules; x++) {
      if (!data[y][x] || inEye(x, y)) continue;
      const up = isDark(x, y - 1);
      const down = isDark(x, y + 1);
      const left = isDark(x - 1, y);
      const right = isDark(x + 1, y);
      path += roundedSquare(x + QUIET, y + QUIET, 1, [
        radius(up, left),
        radius(up, right),
        radius(down, right),
        radius(down, left),
      ]);
    }
  }

  return (
    <svg viewBox={`0 0 ${extent} ${extent}`} width={size} height={size} role="img" aria-label={label}>
      <rect width={extent} height={extent} rx={PLATE_RADIUS} fill="#ffffff" />
      {/* Neighbouring modules are separate subpaths that only share an edge.
          The hairline stroke covers the seam antialiasing would leave there. */}
      <path d={path} fill="#000000" stroke="#000000" strokeWidth={0.02} strokeLinejoin="round" />
      <path d={finderPath(eyes)} fill="#000000" fillRule="evenodd" />
    </svg>
  );
}
