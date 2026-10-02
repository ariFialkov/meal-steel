// Generates PWA icons (PNG) without any native dependencies.
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

function png(width, height, pixelFn) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x / width, y / height);
      const o = y * (width * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Simple cartoon food-truck icon: orange rounded square, white truck, dark wheels, red stripe.
function pixel(u, v) {
  const bg = [255, 106, 42, 255];
  const rr = 0.18;
  const dx = Math.max(Math.abs(u - 0.5) - (0.5 - rr), 0);
  const dy = Math.max(Math.abs(v - 0.5) - (0.5 - rr), 0);
  if (Math.hypot(dx, dy) > rr) return [27, 20, 48, 255];
  // truck body
  const inBox = u > 0.18 && u < 0.78 && v > 0.34 && v < 0.66;
  const inCab = u >= 0.78 && u < 0.9 && v > 0.44 && v < 0.66;
  const inWin = u > 0.8 && u < 0.88 && v > 0.46 && v < 0.55;
  const inStripe = inBox && v > 0.47 && v < 0.53;
  const wheel = (cx) => Math.hypot((u - cx) * 1.0, (v - 0.68) * 1.0) < 0.07;
  const hub = (cx) => Math.hypot(u - cx, v - 0.68) < 0.03;
  if (hub(0.32) || hub(0.74)) return [220, 220, 220, 255];
  if (wheel(0.32) || wheel(0.74)) return [30, 30, 40, 255];
  if (inWin) return [120, 200, 255, 255];
  if (inStripe) return [220, 40, 60, 255];
  if (inBox || inCab) return [250, 250, 245, 255];
  // awning
  if (u > 0.2 && u < 0.76 && v > 0.29 && v <= 0.34) return (Math.floor(u * 14) % 2) ? [255, 255, 255, 255] : [220, 40, 60, 255];
  // hot dog on the roof
  if (Math.hypot((u - 0.48) / 0.16, (v - 0.22) / 0.06) < 1) return [200, 110, 60, 255];
  return bg;
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', png(192, 192, pixel));
writeFileSync('public/icons/icon-512.png', png(512, 512, pixel));
console.log('icons written');
