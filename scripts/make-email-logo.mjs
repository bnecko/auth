// Regenerates public/email-logo.png — the bottleneck logotype for transactional
// email (email clients render SVG poorly, so we ship a PNG). Navy monogram +
// wordmark on transparent. Run: node scripts/make-email-logo.mjs
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../public/email-logo.png", import.meta.url));

const mark = "#1e3a8a"; // navy — the email's black-blue accent
const word = "#0b1220"; // near-black heading colour

// 2x canvas (560x168) so it stays crisp when shown at width:140 in the email.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="168" viewBox="0 0 560 168">
  <g transform="translate(20 34) scale(5)" fill="none" stroke="${mark}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 1 V7 L8 12 V19"/>
    <path d="M17 1 V7 L12 12 V19"/>
    <path d="M8 12 H12"/>
  </g>
  <text x="140" y="108" font-family="Helvetica, Arial, sans-serif" font-size="68" font-weight="600" letter-spacing="-1" fill="${word}">bottleneck</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(out);
console.log("wrote", out);
