import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dir, '..', 'icons');
const svgPath = join(iconsDir, 'icon.svg');

const svg = await readFile(svgPath);
let sharp;
try { sharp = (await import('sharp')).default; }
catch { console.error('Manca "sharp". Esegui: npm i -D sharp  (oppure genera i PNG a mano da icons/icon.svg)'); process.exit(1); }
await mkdir(iconsDir, { recursive: true });
const sizes = [180, 192, 512];
for (const s of sizes) {
  await sharp(svg).resize(s, s).png().toFile(join(iconsDir, `icon-${s}.png`));
  console.log('icon-' + s + '.png');
}
// maskable: padding ~20% (icona dentro safe-zone)
await sharp(svg).resize(410, 410).extend({ top:51, bottom:51, left:51, right:51, background:'#160409' })
  .png().toFile(join(iconsDir, 'icon-512-maskable.png'));
console.log('icon-512-maskable.png');
