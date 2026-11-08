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
