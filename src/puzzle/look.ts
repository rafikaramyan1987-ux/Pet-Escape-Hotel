import * as THREE from 'three';
import type { Color } from './model';

/** Screw colours: bright and distinct, each with its own head symbol for colour-blind players. */
export const SCREW_HEX: Record<Color, number> = {
  red: 0xf0464b,
  blue: 0x3d8bf2,
  yellow: 0xffc928,
  green: 0x3fc46a,
  purple: 0x9a5cf0,
  orange: 0xff8a2a,
  pink: 0xff6fb5,
  teal: 0x22c3c0,
};

export type Symbol = 'circle' | 'square' | 'triangle' | 'star' | 'diamond' | 'heart' | 'cross' | 'hex';
export const SCREW_SYMBOL: Record<Color, Symbol> = {
  red: 'circle',
  blue: 'square',
  yellow: 'triangle',
  green: 'star',
  purple: 'diamond',
  orange: 'heart',
  pink: 'cross',
  teal: 'hex',
};

export const PLANK_TINTS = [0xf7c98a, 0xa9dfd2, 0xf6b3c4, 0xc3b6f4, 0xbfe39a];

export function drawSymbol(g: CanvasRenderingContext2D, sym: Symbol, cx: number, cy: number, r: number): void {
  g.beginPath();
  switch (sym) {
    case 'circle':
      g.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
      break;
    case 'square':
      g.roundRect(cx - r * 0.72, cy - r * 0.72, r * 1.44, r * 1.44, r * 0.18);
      break;
    case 'triangle':
      g.moveTo(cx, cy - r * 0.95);
      g.lineTo(cx + r * 0.9, cy + r * 0.7);
      g.lineTo(cx - r * 0.9, cy + r * 0.7);
      g.closePath();
      break;
    case 'diamond':
      g.moveTo(cx, cy - r);
      g.lineTo(cx + r * 0.8, cy);
      g.lineTo(cx, cy + r);
      g.lineTo(cx - r * 0.8, cy);
      g.closePath();
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.42 : r;
        if (i) g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        else g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      g.closePath();
      break;
    case 'heart':
      g.moveTo(cx, cy + r * 0.85);
      g.bezierCurveTo(cx - r * 1.3, cy - r * 0.1, cx - r * 0.5, cy - r * 1.05, cx, cy - r * 0.35);
      g.bezierCurveTo(cx + r * 0.5, cy - r * 1.05, cx + r * 1.3, cy - r * 0.1, cx, cy + r * 0.85);
      break;
    case 'cross': {
      const w = r * 0.36;
      g.roundRect(cx - w, cy - r * 0.9, w * 2, r * 1.8, w * 0.5);
      g.roundRect(cx - r * 0.9, cy - w, r * 1.8, w * 2, w * 0.5);
      break;
    }
    case 'hex':
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        if (i) g.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9);
        else g.moveTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9);
      }
      g.closePath();
      break;
  }
  g.fill();
}

const headCache = new Map<string, THREE.CanvasTexture>();
/** Screw-head decal: coloured disc, soft rim, white symbol with a dark outline. */
export function headTexture(color: Color, dim = false): THREE.CanvasTexture {
  const k = `${color}${dim}`;
  const hit = headCache.get(k);
  if (hit) return hit;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const base = new THREE.Color(SCREW_HEX[color]);
  if (dim) base.lerp(new THREE.Color(0x7d7a8c), 0.55).multiplyScalar(0.7);
  const grad = g.createRadialGradient(S * 0.4, S * 0.36, S * 0.05, S / 2, S / 2, S / 2);
  grad.addColorStop(0, `#${base.clone().lerp(new THREE.Color(0xffffff), 0.45).getHexString()}`);
  grad.addColorStop(0.65, `#${base.getHexString()}`);
  grad.addColorStop(1, `#${base.clone().multiplyScalar(0.62).getHexString()}`);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = S * 0.05;
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.46, 0, Math.PI * 2);
  g.stroke();
  // symbol: dark outline then white fill
  g.save();
  g.fillStyle = dim ? 'rgba(40,30,50,0.55)' : 'rgba(40,24,52,0.9)';
  g.translate(0, S * 0.012);
  drawSymbol(g, SCREW_SYMBOL[color], S / 2, S / 2, S * 0.27);
  g.restore();
  g.fillStyle = dim ? 'rgba(255,255,255,0.45)' : '#ffffff';
  drawSymbol(g, SCREW_SYMBOL[color], S / 2, S / 2, S * 0.23);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  headCache.set(k, t);
  return t;
}

let woodTex: THREE.CanvasTexture | null = null;
/** Light wood grain, tinted per plank by the material colour. */
export function plankTexture(): THREE.CanvasTexture {
  if (woodTex) return woodTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4ece0';
  g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(150,110,70,${0.08 + (i % 4) * 0.03})`;
    g.lineWidth = 1.5 + (i % 3);
    g.beginPath();
    const y = (i * 128) / 26 + (i % 5);
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 3);
    g.stroke();
  }
  g.fillStyle = 'rgba(150,110,70,0.25)';
  for (const [x, y] of [[120, 50], [380, 80]]) {
    g.beginPath();
    g.ellipse(x, y, 16, 7, 0, 0, Math.PI * 2);
    g.fill();
  }
  woodTex = new THREE.CanvasTexture(c);
  woodTex.colorSpace = THREE.SRGBColorSpace;
  woodTex.anisotropy = 8;
  return woodTex;
}

// ─── mechanic decals ─────────────────────────────────────────────────────
const canvasTex = (S: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture => {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};
const once = <T>(f: () => T): (() => T) => {
  let v: T | undefined;
  return () => (v ??= f());
};

/** Symbols that pair a lock with its key (gold, never a screw colour). */
export const LOCK_SYMBOL: Symbol[] = ['star', 'heart', 'diamond', 'hex'];

/** Hidden "?" screw head: grey until it is free. */
export const hiddenTexture = once(() => canvasTex(256, (g) => {
  const S = 256;
  const grad = g.createRadialGradient(S * 0.4, S * 0.36, S * 0.05, S / 2, S / 2, S / 2);
  grad.addColorStop(0, '#d9d6e2');
  grad.addColorStop(0.65, '#9d98ae');
  grad.addColorStop(1, '#6c6880');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
  g.fill();
  g.font = `900 ${S * 0.62}px 'Lilita One', 'Fredoka', sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = S * 0.06;
  g.strokeStyle = 'rgba(40,24,52,0.9)';
  g.strokeText('?', S / 2, S * 0.54);
  g.fillStyle = '#fff';
  g.fillText('?', S / 2, S * 0.54);
}));

const lockCache = new Map<string, THREE.CanvasTexture>();
/** Gold padlock (locked screw) or key tag (key screw) with the pair's symbol. */
export function lockTexture(sym: number, kind: 'lock' | 'key'): THREE.CanvasTexture {
  const k = `${kind}${sym}`;
  const hit = lockCache.get(k);
  if (hit) return hit;
  const t = canvasTex(256, (g) => {
    const S = 256;
    g.lineJoin = 'round';
    g.lineWidth = 14;
    g.strokeStyle = '#3b2346';
    g.fillStyle = '#ffc928';
    if (kind === 'lock') {
      g.beginPath();
      g.arc(S / 2, S * 0.38, S * 0.2, Math.PI, 0);
      g.lineWidth = 30;
      g.stroke();
      g.lineWidth = 16;
      g.strokeStyle = '#ffc928';
      g.stroke();
      g.lineWidth = 14;
      g.strokeStyle = '#3b2346';
      g.beginPath();
      g.roundRect(S * 0.2, S * 0.4, S * 0.6, S * 0.48, 26);
      g.fill();
      g.stroke();
    } else {
      g.beginPath();
      g.arc(S * 0.5, S * 0.32, S * 0.24, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.beginPath();
      g.roundRect(S * 0.43, S * 0.5, S * 0.14, S * 0.42, 8);
      g.roundRect(S * 0.55, S * 0.72, S * 0.14, S * 0.08, 4);
      g.roundRect(S * 0.55, S * 0.84, S * 0.12, S * 0.08, 4);
      g.fill();
      g.stroke();
    }
    g.fillStyle = '#3b2346';
    const cy = kind === 'lock' ? S * 0.64 : S * 0.32;
    drawSymbol(g, LOCK_SYMBOL[sym % LOCK_SYMBOL.length], S / 2, cy, S * 0.12);
  });
  lockCache.set(k, t);
  return t;
}

/** Frosty ice cap over a screw head. */
export const iceTexture = once(() => canvasTex(256, (g) => {
  const S = 256;
  const grad = g.createRadialGradient(S * 0.35, S * 0.3, S * 0.05, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.6, 'rgba(190,232,255,0.75)');
  grad.addColorStop(1, 'rgba(120,190,240,0.85)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 6;
  for (const [a, b, c, d] of [[0.25, 0.3, 0.45, 0.42], [0.62, 0.22, 0.55, 0.45], [0.3, 0.7, 0.48, 0.58], [0.7, 0.68, 0.56, 0.6]]) {
    g.beginPath();
    g.moveTo(S * a, S * b);
    g.lineTo(S * c, S * d);
    g.stroke();
  }
}));

/** Bomb badge with the taps left (redrawn into the same canvas when the number changes). */
export function drawBomb(c: HTMLCanvasElement, n: number, hot: boolean): void {
  const S = c.width;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, S, S);
  g.fillStyle = hot ? '#ff4b3e' : '#2e2a3d';
  g.strokeStyle = '#ffffff';
  g.lineWidth = S * 0.06;
  g.beginPath();
  g.arc(S / 2, S * 0.55, S * 0.4, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // fuse
  g.strokeStyle = '#3b2346';
  g.lineWidth = S * 0.07;
  g.beginPath();
  g.moveTo(S * 0.66, S * 0.2);
  g.quadraticCurveTo(S * 0.78, S * 0.05, S * 0.9, S * 0.1);
  g.stroke();
  g.fillStyle = '#ffc928';
  g.beginPath();
  g.arc(S * 0.9, S * 0.1, S * 0.07, 0, Math.PI * 2);
  g.fill();
  g.font = `900 ${S * 0.42}px 'Lilita One', 'Fredoka', sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffffff';
  g.fillText(String(Math.max(0, n)), S / 2, S * 0.58);
}
