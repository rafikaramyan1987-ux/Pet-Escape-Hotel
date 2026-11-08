import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Small modelling kit: everything in the game is built from soft primitives (the "toy" look). */

export type Mat = THREE.Material;

const matCache = new Map<string, THREE.Material>();
function cached<T extends THREE.Material>(key: string, make: () => T): T {
  let m = matCache.get(key);
  if (!m) {
    m = make();
    matCache.set(key, m);
  }
  return m as T;
}

function lighten(c: number, k: number): THREE.Color {
  return new THREE.Color(c).lerp(new THREE.Color(0xffffff), k);
}

/** Flocked / felt fur: soft sheen that catches rim light. */
export const fur = (c: number, rough = 0.78): THREE.MeshPhysicalMaterial =>
  cached(`fur${c}${rough}`, () => new THREE.MeshPhysicalMaterial({
    color: c,
    roughness: rough,
    sheen: 1,
    sheenRoughness: 0.45,
    sheenColor: lighten(c, 0.55),
  }));

/** Painted toy plastic / wood with a light clear coat. */
export const paint = (c: number, rough = 0.55, coat = 0.25): THREE.MeshPhysicalMaterial =>
  cached(`paint${c}${rough}${coat}`, () => new THREE.MeshPhysicalMaterial({ color: c, roughness: rough, clearcoat: coat, clearcoatRoughness: 0.35 }));

export const matte = (c: number, rough = 0.9): THREE.MeshStandardMaterial =>
  cached(`matte${c}${rough}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: rough }));

/** Wet-looking glossy (eyes, noses). */
export const glossy = (c: number): THREE.MeshPhysicalMaterial =>
  cached(`glossy${c}`, () => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 }));

export const metal = (c: number, rough = 0.28): THREE.MeshStandardMaterial =>
  cached(`metal${c}${rough}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 1 }));

export const unlit = (c: number): THREE.MeshBasicMaterial =>
  cached(`unlit${c}`, () => new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));

export const glow = (c: number, intensity: number): THREE.MeshStandardMaterial =>
  cached(`glow${c}${intensity}`, () => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: intensity, roughness: 0.5 }));

export const blushMat = (c: number): THREE.MeshBasicMaterial =>
  cached(`blush${c}`, () => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, depthWrite: false }));

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], cast = true, receive = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

export const sph = (r: number, w = 40, h = 28): THREE.SphereGeometry => new THREE.SphereGeometry(r, w, h);
export const rbox = (w: number, h: number, d: number, r: number, seg = 4): RoundedBoxGeometry => new RoundedBoxGeometry(w, h, d, seg, r);
export const cyl = (rt: number, rb: number, h: number, seg = 32): THREE.CylinderGeometry => new THREE.CylinderGeometry(rt, rb, h, seg);
export const caps = (r: number, len: number): THREE.CapsuleGeometry => new THREE.CapsuleGeometry(r, len, 8, 24);
export const torus = (r: number, t: number, arc = Math.PI * 2): THREE.TorusGeometry => new THREE.TorusGeometry(r, t, 16, 48, arc);

/** A rounded cylinder (puck) — pedestals, rugs, pot rims. */
export function puck(r: number, h: number, bevel = 0.04, seg = 48): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, -h / 2)];
  const b = Math.min(bevel, h / 2, r);
  for (let i = 0; i <= 6; i++) {
    const a = (-Math.PI / 2) + (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - b + Math.cos(a) * b, -h / 2 + b + Math.sin(a) * b));
  }
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - b + Math.cos(a) * b, h / 2 - b + Math.sin(a) * b));
  }
  pts.push(new THREE.Vector2(0, h / 2));
  return new THREE.LatheGeometry(pts, seg);
}

export function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): T {
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
}

export function scaled<T extends THREE.Object3D>(o: T, x: number, y = x, z = x): T {
  o.scale.set(x, y, z);
  return o;
}

export function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  if (children.length) g.add(...children);
  return g;
}

/** Something that animates from absolute time (deterministic: the art renders are frame-exact). */
export interface Actor {
  root: THREE.Group;
  update(t: number): void;
}

/** 0 most of the time, a smooth 0→1→0 bump of length `dur` once per `period`. */
export function pulse(t: number, period: number, dur: number, offset = 0): number {
  const p = (((t + offset) % period) + period) % period;
  return p < dur ? Math.sin((p / dur) * Math.PI) : 0;
}

/** Eye-lid factor for blinking (1 open, ~0.08 closed). */
export const blink = (t: number, period = 3.7, offset = 0): number => 1 - 0.92 * pulse(t, period, 0.16, offset);

/** Big toy eye: glossy ball, optional iris and pupil, two painted highlights. +Z looks out. */
export function makeEye(r: number, opt: { iris?: number; slit?: boolean; base?: number } = {}): THREE.Group {
  const g = new THREE.Group();
  const lens = new THREE.Group(); // blinks
  g.add(lens);
  const ball = mesh(sph(r, 32, 24), glossy(opt.iris ?? opt.base ?? 0x1c1311), false, false);
  ball.scale.set(1, 1, 0.55);
  lens.add(ball);
  if (opt.iris !== undefined) {
    const pupil = mesh(sph(r * 0.62, 24, 18), glossy(0x120c0c), false, false);
    pupil.scale.set(opt.slit ? 0.42 : 1, 1, 0.3);
    pupil.position.z = r * 0.42;
    lens.add(pupil);
  }
  const hl = unlit(0xffffff);
  const h1 = mesh(sph(r * 0.3, 16, 12), hl, false, false);
  h1.position.set(r * 0.3, r * 0.36, r * 0.5);
  h1.scale.z = 0.4;
  const h2 = mesh(sph(r * 0.14, 12, 10), hl, false, false);
  h2.position.set(-r * 0.32, -r * 0.3, r * 0.52);
  h2.scale.z = 0.4;
  lens.add(h1, h2);
  g.userData.lens = lens;
  return g;
}

/** Place a feature on the surface of a sphere (centre c, radius R) along `dir`, facing outwards. */
export function onSphere<T extends THREE.Object3D>(o: T, c: THREE.Vector3, R: number, dir: [number, number, number], k = 0.94): T {
  const d = new THREE.Vector3(...dir).normalize();
  o.position.copy(c).addScaledVector(d, R * k);
  o.lookAt(o.position.clone().add(d));
  return o;
}

/** Make every mesh below `o` cast and receive shadows (or not). */
export function shadows(o: THREE.Object3D, cast: boolean, receive = true): void {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
}
