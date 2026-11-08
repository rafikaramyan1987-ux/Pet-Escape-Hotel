import * as THREE from 'three';
import { PAL, hex } from './palette';

/** Procedural canvas textures (no image files: the CrazyGames build stays one small file). */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, srgb = true, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Deterministic PRNG so every render is identical. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const shade = (c: number, k: number): string => {
  const col = new THREE.Color(c);
  if (k > 0) col.lerp(new THREE.Color(0xffffff), k);
  else col.lerp(new THREE.Color(0x000000), -k);
  return `#${col.getHexString()}`;
};

/** Honey wooden planks, 4×4 world units per tile. Returns colour + bump. */
export function floorTextures(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const S = 1024;
  const [c, g] = canvas(S, S);
  const [b, gb] = canvas(S, S);
  const r = rng(7);
  const planks = 6;
  const pw = S / planks;
  gb.fillStyle = '#fff';
  gb.fillRect(0, 0, S, S);
  for (let i = 0; i < planks; i++) {
    let y = -r() * S;
    while (y < S) {
      const len = S * (0.45 + r() * 0.5);
      const k = (r() - 0.5) * 0.16;
      g.fillStyle = shade(PAL.floorWood, k);
      g.fillRect(i * pw, y, pw, len);
      // grain
      g.globalAlpha = 0.12;
      for (let j = 0; j < 9; j++) {
        g.strokeStyle = shade(PAL.floorWood, -0.35);
        g.lineWidth = 1 + r() * 2;
        g.beginPath();
        const x0 = i * pw + 6 + r() * (pw - 12);
        g.moveTo(x0, y);
        for (let s = 0; s <= 8; s++) g.lineTo(x0 + Math.sin(s * 0.9 + r() * 2) * 4, y + (len * s) / 8);
        g.stroke();
      }
      g.globalAlpha = 1;
      // seams
      g.fillStyle = shade(PAL.floorWood, -0.55);
      g.fillRect(i * pw, y, pw, 4);
      gb.fillStyle = '#000';
      gb.fillRect(i * pw, y, pw, 5);
      y += len;
    }
    g.fillStyle = shade(PAL.floorWood, -0.55);
    g.fillRect(i * pw, 0, 4, S);
    gb.fillStyle = '#000';
    gb.fillRect(i * pw, 0, 5, S);
  }
  return { map: tex(c, true, true), bump: tex(b, false, true) };
}

/** Dusty-teal wallpaper with soft stripes and little cream paw motifs. 2×2 world units per tile. */
export function wallpaperTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = hex(PAL.wallpaper);
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = shade(PAL.wallpaper, i % 2 ? 0.06 : -0.03);
    g.fillRect(i * (S / 8), 0, S / 8, S);
  }
  g.fillStyle = shade(PAL.wallpaper, 0.32);
  const paw = (x: number, y: number, s: number) => {
    g.beginPath();
    g.ellipse(x, y + s * 0.35, s * 0.42, s * 0.34, 0, 0, Math.PI * 2);
    g.fill();
    for (const [dx, dy] of [[-0.48, -0.12], [-0.17, -0.42], [0.17, -0.42], [0.48, -0.12]] as const) {
      g.beginPath();
      g.ellipse(x + dx * s, y + dy * s, s * 0.15, s * 0.19, dx * 0.6, 0, Math.PI * 2);
      g.fill();
    }
  };
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) paw(64 + col * 128 + (row % 2) * 64, 64 + row * 128, 26);
  return tex(c, true, true);
}

/** Round rug: cranberry with cream and gold rings and a scalloped border (top cap of a cylinder). */
export function rugTexture(): THREE.CanvasTexture {
  const S = 1024;
  const [c, g] = canvas(S, S);
  const cx = S / 2;
  const ring = (r: number, col: string) => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(cx, cx, r, 0, Math.PI * 2);
    g.fill();
  };
  ring(512, hex(PAL.rugCream));
  ring(470, hex(PAL.rugRed));
  // scallops
  g.fillStyle = hex(PAL.rugGold);
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    g.beginPath();
    g.arc(cx + Math.cos(a) * 420, cx + Math.sin(a) * 420, 22, 0, Math.PI * 2);
    g.fill();
  }
  ring(380, hex(PAL.rugCream));
  ring(355, shade(PAL.rugRed, -0.08));
  ring(250, hex(PAL.rugGold));
  ring(232, hex(PAL.rugRed));
  // centre paw
  g.fillStyle = hex(PAL.rugCream);
  g.beginPath();
  g.ellipse(cx, cx + 40, 80, 64, 0, 0, Math.PI * 2);
  g.fill();
  for (const [dx, dy] of [[-92, -30], [-36, -92], [36, -92], [92, -30]] as const) {
    g.beginPath();
    g.ellipse(cx + dx, cx + dy, 30, 38, dx * 0.004, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c);
}

/** Night sky seen through the windows: gradient, stars, soft clouds, distant rooftops. */
export function skyTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 1024;
  const [c, g] = canvas(W, H);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0b0b26');
  grad.addColorStop(0.55, '#26266a');
  grad.addColorStop(1, '#4b3f86');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const r = rng(3);
  for (let i = 0; i < 260; i++) {
    const s = r() < 0.08 ? 2.6 : 1 + r();
    g.fillStyle = `rgba(255,248,230,${0.35 + r() * 0.65})`;
    g.beginPath();
    g.arc(r() * W, r() * H * 0.85, s, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(160,150,230,0.12)';
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    g.ellipse(r() * W, H * (0.3 + r() * 0.4), 160 + r() * 140, 26 + r() * 20, 0, 0, Math.PI * 2);
    g.fill();
  }
  // rooftops & trees silhouette
  g.fillStyle = '#16143a';
  let x = 0;
  while (x < W) {
    const w = 60 + r() * 120;
    const h = 60 + r() * 120;
    g.fillRect(x, H - h, w, h);
    if (r() < 0.5) {
      g.beginPath();
      g.moveTo(x - 6, H - h);
      g.lineTo(x + w / 2, H - h - 40);
      g.lineTo(x + w + 6, H - h);
      g.fill();
    }
    x += w + 10;
  }
  g.fillStyle = 'rgba(255,205,120,0.9)';
  for (let i = 0; i < 14; i++) g.fillRect(r() * W, H - 30 - r() * 100, 10, 14);
  return tex(c);
}

/** Soft radial glow for additive sprites. */
let glowTex: THREE.CanvasTexture | null = null;
export function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const S = 256;
  const [c, g] = canvas(S, S);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  glowTex = tex(c, false);
  return glowTex;
}

/** Four-point sparkle for collectibles. */
export function sparkleTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, g] = canvas(S, S);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(64, 0);
  g.quadraticCurveTo(70, 58, 128, 64);
  g.quadraticCurveTo(70, 70, 64, 128);
  g.quadraticCurveTo(58, 70, 0, 64);
  g.quadraticCurveTo(58, 58, 64, 0);
  g.fill();
  return tex(c, false);
}

/** Text sign (EXIT, RECEPTION, name plates). */
export function signTexture(text: string, o: { w?: number; h?: number; bg: string; fg: string; font?: string; size?: number; border?: string; arrow?: boolean }): THREE.CanvasTexture {
  const W = o.w ?? 512;
  const H = o.h ?? 192;
  const [c, g] = canvas(W, H);
  g.fillStyle = o.bg;
  g.fillRect(0, 0, W, H);
  if (o.border) {
    g.strokeStyle = o.border;
    g.lineWidth = H * 0.07;
    const m = H * 0.09;
    g.beginPath();
    g.roundRect(m, m, W - 2 * m, H - 2 * m, H * 0.14);
    g.stroke();
  }
  g.fillStyle = o.fg;
  g.font = `${o.size ?? H * 0.58}px ${o.font ?? "'Lilita One', 'Fredoka', sans-serif"}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const tx = o.arrow ? W * 0.43 : W / 2;
  g.fillText(text, tx, H * 0.54);
  if (o.arrow) {
    g.beginPath();
    const ax = W * 0.8;
    const ay = H / 2;
    const s = H * 0.24;
    g.moveTo(ax - s, ay - s * 0.4);
    g.lineTo(ax, ay - s * 0.4);
    g.lineTo(ax, ay - s);
    g.lineTo(ax + s, ay);
    g.lineTo(ax, ay + s);
    g.lineTo(ax, ay + s * 0.4);
    g.lineTo(ax - s, ay + s * 0.4);
    g.closePath();
    g.fill();
  }
  return tex(c);
}

/** Tabby stripes for a sphere whose poles point along ±Z (body) — rings perpendicular to the spine. */
export function catBodyTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = hex(PAL.catFur);
  g.fillRect(0, 0, W, H);
  // belly (u = 0.25) lighter
  const grad = g.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0.05, 'rgba(243,239,232,0)');
  grad.addColorStop(0.25, 'rgba(243,239,232,1)');
  grad.addColorStop(0.45, 'rgba(243,239,232,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.fillStyle = hex(PAL.catStripe);
  const rows = [0.3, 0.42, 0.54, 0.66, 0.78];
  for (const [i, v] of rows.entries()) {
    const y = v * H;
    const half = W * (0.17 + (i % 2) * 0.03);
    g.beginPath();
    g.moveTo(W * 0.75 - half, y);
    g.quadraticCurveTo(W * 0.75, y - 16, W * 0.75 + half, y);
    g.quadraticCurveTo(W * 0.75, y + 4, W * 0.75 - half, y);
    g.fill();
  }
  // spine stripe
  g.fillRect(W * 0.74, H * 0.2, W * 0.02, H * 0.7);
  return tex(c);
}

/** Tabby forehead "M" + cheek stripes for an upright sphere head (front at u = 0.25). */
export function catHeadTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = hex(PAL.catFur);
  g.fillRect(0, 0, W, H);
  g.fillStyle = hex(PAL.catStripe);
  const stripe = (u: number, y0: number, y1: number, w: number) => {
    g.beginPath();
    g.moveTo(u * W - w, y0 * H);
    g.quadraticCurveTo(u * W, y1 * H + 12, u * W + w, y0 * H);
    g.fill();
  };
  stripe(0.25, 0.08, 0.36, 9);
  stripe(0.215, 0.1, 0.3, 7);
  stripe(0.285, 0.1, 0.3, 7);
  for (const u of [0.04, 0.46]) {
    for (const v of [0.5, 0.58]) {
      g.beginPath();
      g.ellipse(u * W, v * H, 26, 4, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  for (let i = 0; i < 4; i++) stripe(0.65 + i * 0.065, 0.05, 0.4, 10);
  return tex(c);
}

/** Stripes along the length of a tube (cat tail). */
export function tailTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 32);
  g.fillStyle = hex(PAL.catFur);
  g.fillRect(0, 0, 256, 32);
  g.fillStyle = hex(PAL.catStripe);
  for (let i = 0; i < 6; i++) g.fillRect(14 + i * 40, 0, 16, 32);
  g.fillRect(236, 0, 20, 32);
  return tex(c);
}

/** Dug-up dirt patch with crumbs (decal). */
export function dirtTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S, S);
  const r = rng(11);
  g.fillStyle = 'rgba(92,58,36,0.95)';
  g.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const rad = 80 + r() * 26;
    const x = 128 + Math.cos(a) * rad;
    const y = 128 + Math.sin(a) * rad * 0.8;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.fill();
  for (let i = 0; i < 40; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(122,80,48,1)' : 'rgba(70,42,26,1)';
    const a = r() * Math.PI * 2;
    const d = r() * 120;
    g.beginPath();
    g.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d * 0.8, 3 + r() * 6, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c);
}

/** A trail of small paw prints (decal). */
export function pawTrailTexture(col = 'rgba(255,230,190,0.55)'): THREE.CanvasTexture {
  const [c, g] = canvas(256, 1024);
  g.fillStyle = col;
  for (let i = 0; i < 6; i++) {
    const x = 128 + (i % 2 ? 36 : -36);
    const y = 1024 - 90 - i * 160;
    g.beginPath();
    g.ellipse(x, y, 26, 22, 0, 0, Math.PI * 2);
    g.fill();
    for (const [dx, dy] of [[-28, -30], [-10, -44], [10, -44], [28, -30]] as const) {
      g.beginPath();
      g.ellipse(x + dx, y + dy, 8, 10, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  return tex(c);
}

/** Framed pet portrait for the wall. */
export function portraitTexture(kind: 'dog' | 'cat' | 'fish'): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S, S);
  const bg = { dog: '#f2c46b', cat: '#9fd3c7', fish: '#f4a7a3' }[kind];
  g.fillStyle = bg;
  g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.arc(128, 150, 96, 0, Math.PI * 2);
  g.fill();
  if (kind === 'dog') {
    g.fillStyle = '#b06b35';
    g.beginPath(); g.ellipse(72, 120, 26, 50, 0.3, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(184, 120, 26, 50, -0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e6a65a';
    g.beginPath(); g.arc(128, 132, 62, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fbe6c4';
    g.beginPath(); g.ellipse(128, 160, 34, 26, 0, 0, Math.PI * 2); g.fill();
  } else if (kind === 'cat') {
    g.fillStyle = '#7f8796';
    g.beginPath(); g.moveTo(70, 110); g.lineTo(84, 52); g.lineTo(118, 86); g.fill();
    g.beginPath(); g.moveTo(186, 110); g.lineTo(172, 52); g.lineTo(138, 86); g.fill();
    g.beginPath(); g.arc(128, 136, 60, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f3efe8';
    g.beginPath(); g.ellipse(128, 164, 30, 22, 0, 0, Math.PI * 2); g.fill();
  } else {
    g.fillStyle = '#f39a45';
    g.beginPath(); g.ellipse(120, 140, 62, 42, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(176, 140); g.lineTo(220, 104); g.lineTo(220, 176); g.fill();
  }
  g.fillStyle = '#2a1c1a';
  if (kind !== 'fish') {
    g.beginPath(); g.arc(106, 128, 9, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(150, 128, 9, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(128, 152, 10, 7, 0, 0, Math.PI * 2); g.fill();
  } else {
    g.beginPath(); g.arc(92, 130, 8, 0, Math.PI * 2); g.fill();
  }
  return tex(c);
}

/** Wall clock face (hands at 2:47 — the dead of night). */
export function clockTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#fbf3df';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#3b2346';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.arc(128 + Math.sin(a) * 100, 128 - Math.cos(a) * 100, i % 3 ? 5 : 9, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#3b2346';
  g.lineCap = 'round';
  const hand = (a: number, len: number, w: number) => {
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(128, 128);
    g.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len);
    g.stroke();
  };
  hand(((2 + 47 / 60) / 12) * Math.PI * 2, 56, 12);
  hand((47 / 60) * Math.PI * 2, 84, 8);
  g.fillStyle = '#e0383e';
  g.beginPath();
  g.arc(128, 128, 10, 0, Math.PI * 2);
  g.fill();
  return tex(c);
}

/** Vertical gradient (used for the lineup/stage backdrop). */
export function gradientTexture(stops: [number, string][]): THREE.CanvasTexture {
  const [c, g] = canvas(4, 512);
  const grad = g.createLinearGradient(0, 0, 0, 512);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 512);
  return tex(c);
}

/** "Z" letter for the sleepy porter. */
export function zTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.font = "96px 'Lilita One', sans-serif";
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 14;
  g.strokeStyle = '#3b2346';
  g.strokeText('z', 64, 66);
  g.fillStyle = '#e8ecff';
  g.fillText('z', 64, 66);
  return tex(c);
}
