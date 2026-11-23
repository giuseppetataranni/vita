// Genera icone PNG e splash screen iOS a partire da public/icons/icon.svg
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('public');
const svg = fs.readFileSync(path.join(root, 'icons/icon.svg'));
fs.mkdirSync(path.join(root, 'splash'), { recursive: true });

const icons = [
  ['icons/apple-touch-icon.png', 180],
  ['icons/icon-192.png', 192],
  ['icons/icon-512.png', 512]
];
for (const [file, size] of icons) {
  await sharp(svg, { density: 384 }).resize(size, size).flatten({ background: '#2b6cf6' }).png().toFile(path.join(root, file));
}
// Maskable: icona più piccola su fondo pieno (zona sicura 80%)
const inner = await sharp(svg, { density: 384 }).resize(400, 400).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#4a55f3' } })
  .composite([{ input: inner, gravity: 'center' }]).png().toFile(path.join(root, 'icons/icon-maskable-512.png'));

// Splash: [larghezza, altezza px, device-width, device-height, ratio]
export const SPLASH = [
  [1320, 2868, 440, 956, 3], [1260, 2736, 420, 912, 3], [1206, 2622, 402, 874, 3],
  [1290, 2796, 430, 932, 3], [1179, 2556, 393, 852, 3], [1284, 2778, 428, 926, 3],
  [1170, 2532, 390, 844, 3], [1125, 2436, 375, 812, 3], [1242, 2688, 414, 896, 3],
  [828, 1792, 414, 896, 2], [750, 1334, 375, 667, 2]
];
for (const [w, h] of SPLASH) {
  for (const [mode, bg] of [['light', '#f2f2f7'], ['dark', '#000000']]) {
    const s = Math.round(w * 0.28);
    const logo = await sharp(svg, { density: 384 }).resize(s, s).png().toBuffer();
    await sharp({ create: { width: w, height: h, channels: 4, background: bg } })
      .composite([{ input: logo, gravity: 'center' }]).png({ compressionLevel: 9 })
      .toFile(path.join(root, `splash/splash-${w}x${h}-${mode}.png`));
  }
}
console.log('Icone e splash generati.');
