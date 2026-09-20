import { encode } from "uqr";

// Drawn as one path of 1x1 squares rather than through the library's SVG
// renderer, because the production style-src has no 'unsafe-inline' and any
// style attribute in the markup would be dropped. No hooks and no client
// directive, so this renders on the server or inside a client component.
export function QrCode({ text, size = 216, label }: { text: string; size?: number; label: string }) {
  const { size: modules, data } = encode(text, { ecc: "M" });
  const quiet = 2;
  const extent = modules + quiet * 2;

  let path = "";
  for (let y = 0; y < modules; y++) {
    for (let x = 0; x < modules; x++) {
      if (data[y][x]) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }
  }

  return (
    <svg
      viewBox={`0 0 ${extent} ${extent}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      className="rounded-md"
    >
      <rect width={extent} height={extent} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
