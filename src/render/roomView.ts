import * as THREE from 'three';
import { type Level, type PetKind, type Theme, type XY, isPipe, key } from '../core/level';
import type { Sim } from '../core/sim';
import { FOV } from '../core/sim';
import { type Actor, at, cyl, fur, glow, group, matte, mesh, metal, paint, puck, rbox, sph, torus } from '../art/kit';
import { glowSprite } from '../art/fx';
import { applyCosmetics, characterLook } from '../art/look';
import { PAL } from '../art/palette';
import { makePet, type Fur } from '../art/pets';
import { makePorter, type Porter } from '../art/porter';
import {
  makeBone, makeBook, makeExitSign, makeFence, makeKennel, makeKey, makePlant, makeTube,
} from '../art/props';
import { gradientTexture, iconTexture, pawTexture, squeakTexture, themeFloor, wallpaperTexture, windowSkyTexture } from '../art/textures';
import type { Look } from '../game/save';
import { item } from '../game/shop';
import { fitCamera, orbit } from './frame';

/** One tile = 1.25 world units. Tile (x, y) sits at world (x·T, 0, y·T). */
export const T = 1.25;
const TALL = 2.5;
const LOW = 0.72;
const FURN = 0.95;

interface ThemeStyle {
  floor: Parameters<typeof themeFloor>[0];
  wall: number;
  low: number;
  trim: number;
  hemi: [number, number, number];
  lamp: number;
}

const STYLE: Record<Theme, ThemeStyle> = {
  lobby: { floor: 'planks', wall: 0x4f8790, low: 0x8e5636, trim: 0xf6e7c8, hemi: [0x6f7bd6, 0x6a3e30, 0.7], lamp: 0xffc477 },
  dining: { floor: 'darkPlanks', wall: 0x9b4b55, low: 0x6e3a2a, trim: 0xf6e7c8, hemi: [0x7a74c8, 0x6a3e30, 0.7], lamp: 0xffbe6e },
  spa: { floor: 'tiles', wall: 0x5aa39c, low: 0xe9e2d0, trim: 0xffffff, hemi: [0x7f9ae0, 0x5a7a74, 0.75], lamp: 0xffe0b0 },
  garden: { floor: 'grass', wall: 0x7a5a4a, low: 0x3f7d43, trim: 0xd9c9a8, hemi: [0x6f86d6, 0x3a5a34, 0.75], lamp: 0xffd08a },
  rooftop: { floor: 'roof', wall: 0x6a5a7a, low: 0x8a7a9a, trim: 0xcfc6dd, hemi: [0x7c86e0, 0x4a4458, 0.8], lamp: 0xffc98a },
};

export interface PetView {
  kind: PetKind;
  actor: Actor;
  root: THREE.Group;
  yaw: number;
  phase: number;
  hidden: THREE.Sprite;
}

interface GuardView {
  porter: Porter;
  fan: THREE.Mesh;
  fanGeo: THREE.BufferGeometry;
  icon: THREE.Sprite;
  phase: number;
}

interface CamView {
  head: THREE.Group;
  fan: THREE.Mesh;
  fanGeo: THREE.BufferGeometry;
  led: THREE.Mesh;
}

const RAYS = 28;

function fanGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((RAYS + 2) * 3), 3));
  // RGBA: bright and fairly opaque at the lamp, fading out at the far edge
  const col = new Float32Array((RAYS + 2) * 4);
  col.set([1, 1, 1, 0.62], 0);
  for (let i = 1; i < RAYS + 2; i++) col.set([1, 1, 1, 0.16], i * 4);
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  const idx: number[] = [];
  for (let i = 1; i <= RAYS; i++) idx.push(0, i, i + 1);
  g.setIndex(idx);
  return g;
}

function fanMesh(geo: THREE.BufferGeometry, color: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  }));
  m.userData.noAO = true;
  m.renderOrder = 8;
  m.frustumCulled = false;
  return m;
}

export class RoomView {
  readonly scene = new THREE.Scene();
  readonly root = group();
  readonly level: Level;
  readonly pets = new Map<PetKind, PetView>();
  private guards: GuardView[] = [];
  private cams: CamView[] = [];
  private bones: Actor[] = [];
  private boneGone: number[] = [];
  private keyObj: THREE.Group | null = null;
  private gates: { g: THREE.Group; open: number }[] = [];
  private buttons: THREE.Mesh[] = [];
  private tubes = new Map<number, { curve: THREE.CurvePath<THREE.Vector3>; reverse: boolean }>();
  private exitRings: THREE.Mesh[] = [];
  private fill: THREE.PointLight;
  private marker: THREE.Mesh;
  private hint: THREE.Mesh | null = null;
  readonly camTarget = new THREE.Vector3();
  private camDist = 12;
  private camReady = false;
  private time = 0;

  constructor(level: Level, looks: Record<PetKind, Look>, private quality: 'high' | 'low') {
    this.level = level;
    this.scene.background = gradientTexture([[0, '#0e0c26'], [0.55, '#221d4f'], [1, '#3a2a5e']]);
    this.scene.add(this.root);
    const st = STYLE[level.theme];
    this.buildFloor(st);
    this.buildTiles(st);
    this.buildLights(st);
    for (const kind of level.pets) this.addPet(kind, looks[kind]);
    level.def.guards.forEach((g, i) => this.addGuard(i, g.skin ?? 'porter'));
    (level.def.cams ?? []).forEach((c) => this.addCam(c.x, c.y));
    level.bones.forEach(([x, y], i) => {
      const b = makeBone(i * 1.7);
      b.root.position.copy(this.world(x, y));
      b.root.scale.setScalar(1.15);
      this.root.add(b.root);
      this.bones.push(b);
      this.boneGone.push(-1);
    });
    if (level.key) {
      const k = group();
      const kk = makeKey();
      kk.scale.setScalar(2.2);
      kk.rotation.x = Math.PI / 2;
      k.add(kk, glowSprite(0xffd36a, 1.4, 0.7));
      k.position.copy(this.world(...level.key));
      this.root.add(k);
      this.keyObj = k;
    }
    // active pet fill light + marker ring
    this.fill = new THREE.PointLight(0xfff0dc, 5, 5.5, 1.4);
    this.scene.add(this.fill);
    this.marker = mesh(new THREE.RingGeometry(0.42, 0.55, 40), new THREE.MeshBasicMaterial({ color: 0xffd26a, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }), false, false);
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.userData.noAO = true;
    this.scene.add(this.marker);
  }

  world(x: number, y: number, h = 0): THREE.Vector3 {
    return new THREE.Vector3(x * T, h, y * T);
  }

  /** Corners of the room (for the overview camera). */
  hull(): THREE.Vector3[] {
    const { w, h } = this.level;
    const x0 = -T / 2;
    const z0 = -T / 2;
    const x1 = (w - 0.5) * T;
    const z1 = (h - 0.5) * T;
    return [
      new THREE.Vector3(x0, 0, z1), new THREE.Vector3(x1, 0, z1), new THREE.Vector3(x1, 0, z0), new THREE.Vector3(x0, 0, z0),
      new THREE.Vector3(x0, TALL, z0), new THREE.Vector3(x1, TALL, z0), new THREE.Vector3(x0, TALL, z1),
    ];
  }

  // ─── build ───────────────────────────────────────────────────────────────
  private buildFloor(st: ThemeStyle): void {
    const { w, h } = this.level;
    const W = w * T;
    const H = h * T;
    const cx = (w - 1) * T * 0.5;
    const cz = (h - 1) * T * 0.5;
    const { map, bump } = themeFloor(st.floor);
    map.repeat.set(W / 4, H / 4);
    bump.repeat.copy(map.repeat);
    const floor = mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 1.2, roughness: 0.7 }), false, true);
    at(floor, cx, 0.001, cz, -Math.PI / 2, 0, 0);
    this.root.add(floor);
    const slab = mesh(rbox(W + 0.5, 0.6, H + 0.5, 0.12), paint(PAL.baseWood, 0.6, 0.3), true, true);
    at(slab, cx, -0.31, cz);
    const band = mesh(rbox(W + 0.56, 0.1, H + 0.56, 0.05), paint(PAL.gold, 0.4, 0.5), false, false);
    at(band, cx, -0.45, cz);
    this.root.add(slab, band);
    const shadowTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d')!;
      const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64);
      gr.addColorStop(0, 'rgba(5,4,18,0.8)');
      gr.addColorStop(1, 'rgba(5,4,18,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    const under = mesh(new THREE.PlaneGeometry(W * 1.9, H * 1.7), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }), false, false);
    at(under, cx, -0.62, cz, -Math.PI / 2, 0, 0);
    under.userData.noAO = true;
    this.root.add(under);
  }

  private isTall(x: number, y: number): boolean {
    return y === 0 || x === 0;
  }

  /** Front (south) and right (east) boundary: a low cut-away ledge so the camera sees in. */
  private isLedge(x: number, y: number): boolean {
    return !this.isTall(x, y) && (y === this.level.h - 1 || x === this.level.w - 1);
  }

  private buildTiles(st: ThemeStyle): void {
    const L = this.level;
    const wp = wallpaperTexture(st.wall);
    wp.repeat.set(0.62, 1.2);
    const wallMat = new THREE.MeshStandardMaterial({ map: wp, roughness: 0.9 });
    const trimMat = paint(st.trim, 0.55, 0.3);
    const lowMat = L.theme === 'garden' ? fur(st.low, 0.85) : paint(st.low, 0.55, 0.3);
    const tallGeo = new THREE.BoxGeometry(T, TALL, T);
    const lowGeo = L.theme === 'garden' ? rbox(T * 0.98, LOW + 0.1, T * 0.98, 0.18) : new THREE.BoxGeometry(T, LOW, T);
    const capGeo = rbox(T + 0.04, 0.1, T + 0.04, 0.03);
    const ledgeGeo = new THREE.BoxGeometry(T, 0.32, T);
    const capLowMat = L.theme === 'garden' ? fur(0x4f9a52, 0.85) : paint(st.low, 0.45, 0.5);
    const skyA = windowSkyTexture(true);
    const skyB = windowSkyTexture(false);
    let windowCount = 0;
    const furnSeed = { n: 0 };
    for (let y = 0; y < L.h; y++) {
      for (let x = 0; x < L.w; x++) {
        const ch = L.tiles[y][x];
        const p = this.world(x, y);
        if (ch === '#' || ch === 'h') {
          const tall = this.isTall(x, y);
          const ledge = this.isLedge(x, y);
          const hgt = tall ? TALL : ledge ? 0.32 : LOW;
          const wall = mesh(tall ? tallGeo : ledge ? ledgeGeo : lowGeo, tall ? [wallMat, wallMat, trimMat, wallMat, wallMat, wallMat] : lowMat, true, true);
          wall.position.set(p.x, hgt / 2, p.z);
          this.root.add(wall);
          const cap = mesh(capGeo, ledge || !tall ? capLowMat : trimMat, false, true);
          cap.position.set(p.x, hgt + 0.03, p.z);
          this.root.add(cap);
          if (tall) {
            const skirt = mesh(new THREE.BoxGeometry(T + 0.02, 0.18, T + 0.02), paint(st.low, 0.5, 0.4), false, true);
            skirt.position.set(p.x, 0.09, p.z);
            this.root.add(skirt);
          }
          // windows in the back wall (cool moonlight)
          if (tall && y === 0 && x > 0 && x < L.w - 1 && L.tiles[1]?.[x] !== '#' && x % 3 === 1) {
            const win = group();
            const sky = mesh(new THREE.PlaneGeometry(T * 0.62, 1.0), new THREE.MeshBasicMaterial({ map: windowCount++ % 2 ? skyB : skyA, color: 0xb0b0c8 }), false, false);
            sky.userData.noAO = true;
            const frame = mesh(rbox(T * 0.74, 1.12, 0.08, 0.03), trimMat, false, false);
            frame.position.z = -0.03;
            const mull = mesh(new THREE.BoxGeometry(0.05, 1.0, 0.04), trimMat, false, false);
            mull.position.z = 0.02;
            const mull2 = mesh(new THREE.BoxGeometry(T * 0.62, 0.05, 0.04), trimMat, false, false);
            mull2.position.z = 0.02;
            const sill = mesh(rbox(T * 0.85, 0.08, 0.2, 0.03), trimMat, false, true);
            sill.position.set(0, -0.56, 0.08);
            win.add(frame, sky, mull, mull2, sill);
            win.position.set(p.x, 1.45, p.z + T / 2 + 0.01);
            this.root.add(win);
            const glowS = glowSprite(0x9fb4ff, 1.4, 0.12);
            glowS.position.set(p.x, 1.5, p.z + T / 2 + 0.3);
            this.root.add(glowS);
          }
          if (ch === 'h') this.mouseHoles(x, y);
          continue;
        }
        switch (ch) {
          case 'F': {
            const horiz = L.tiles[y][x - 1] === 'F' || L.tiles[y][x + 1] === 'F' || L.tiles[y][x - 1] === '#' || L.tiles[y][x + 1] === '#';
            const f = makeFence(T * 0.98);
            f.scale.set(1, 0.85, 1);
            at(f, p.x, 0, p.z, 0, horiz ? 0 : Math.PI / 2, 0);
            this.root.add(f);
            const dirt = mesh(new THREE.CircleGeometry(0.35, 20), matte(0x6e4529, 1), false, true);
            at(dirt, p.x, 0.006, p.z, -Math.PI / 2, 0, 0);
            dirt.scale.set(1, 0.6, 1);
            this.root.add(dirt);
            break;
          }
          case 'H':
            this.root.add(this.furniture(L.theme, p, furnSeed.n++));
            break;
          case 'B': {
            const bed = group();
            const base = mesh(puck(0.5, 0.18, 0.08), fur(0x7b86d8, 0.8));
            base.position.y = 0.09;
            const rim = mesh(torus(0.46, 0.12), fur(0x9aa6f0, 0.8));
            rim.rotation.x = Math.PI / 2;
            rim.position.y = 0.2;
            const pillow = mesh(rbox(0.5, 0.1, 0.36, 0.05), fur(0xf6e7c8, 0.8));
            pillow.position.set(0, 0.2, -0.12);
            bed.add(base, rim, pillow);
            bed.position.copy(p);
            this.root.add(bed);
            break;
          }
          case 'P': {
            const pl = makePlant(L.theme === 'garden' ? 'bush' : (x + y) % 2 ? 'bush' : 'tall', x * 7 + y);
            pl.scale.setScalar(L.theme === 'garden' ? 0.85 : 0.7);
            pl.position.copy(p);
            this.root.add(pl);
            break;
          }
          case 'C': {
            const c = group();
            const box = mesh(rbox(0.85, 0.62, 0.8, 0.12), paint(0xf0b13e, 0.5, 0.4));
            box.position.y = 0.31;
            const door = mesh(new THREE.PlaneGeometry(0.5, 0.4), new THREE.MeshStandardMaterial({ color: 0x2a1c2e, roughness: 1 }), false, false);
            door.position.set(0, 0.3, 0.401);
            const handle = mesh(torus(0.16, 0.035, Math.PI), paint(0x5a3324, 0.5, 0.3));
            handle.position.y = 0.62;
            for (let i = -2; i <= 2; i++) {
              const bar = mesh(cyl(0.012, 0.012, 0.4, 6), metal(0xd9dde6, 0.3), false, false);
              bar.position.set(i * 0.1, 0.3, 0.41);
              c.add(bar);
            }
            c.add(box, door, handle);
            c.position.copy(p);
            c.rotation.y = ((x * 31 + y * 17) % 5 - 2) * 0.1;
            this.root.add(c);
            break;
          }
          case 'K': {
            const pet = (Object.entries(L.starts) as [PetKind, XY][]).find(([, s]) => s[0] === x && s[1] === y)?.[0];
            const roof = pet === 'dog' ? PAL.kennelRoofs[0] : pet === 'cat' ? PAL.kennelRoofs[1] : PAL.kennelRoofs[2];
            const k = makeKennel(roof, pet === 'dog' ? 'BISCUIT' : pet === 'cat' ? 'MISO' : 'PEANUT');
            k.scale.setScalar(0.62);
            at(k, p.x, 0, p.z - 0.18);
            this.root.add(k);
            break;
          }
          case 'E':
            this.exit(x, y);
            break;
          case '~': {
            const sq = mesh(new THREE.PlaneGeometry(T * 0.96, T * 0.96), new THREE.MeshStandardMaterial({ map: squeakTexture(), roughness: 0.8 }), false, true);
            at(sq, p.x, 0.004, p.z, -Math.PI / 2, 0, (x + y) % 2 ? Math.PI / 2 : 0);
            this.root.add(sq);
            break;
          }
          case 'x': {
            const btn = mesh(puck(0.42, 0.1, 0.04), new THREE.MeshStandardMaterial({ map: pawTexture(), emissive: 0xffc548, emissiveIntensity: 0.2, roughness: 0.5 }), false, true);
            btn.position.set(p.x, 0.05, p.z);
            const ring = mesh(torus(0.44, 0.04), paint(0x3b2346, 0.5, 0.2), false, false);
            ring.rotation.x = Math.PI / 2;
            ring.position.set(p.x, 0.06, p.z);
            this.root.add(btn, ring);
            this.buttons.push(btn);
            break;
          }
          case 'X': {
            const g = group();
            const frameM = paint(0x3b3f52, 0.4, 0.5);
            const horiz = L.tiles[y][x - 1] === '#' || L.tiles[y][x + 1] === '#';
            const bars = group();
            for (let i = 0; i < 6; i++) {
              const bar = mesh(cyl(0.035, 0.035, 1.0, 10), metal(0xc9ced8, 0.3));
              bar.position.set(-T / 2 + 0.12 + i * ((T - 0.24) / 5), 0.5, 0);
              bars.add(bar);
            }
            const top = mesh(rbox(T, 0.08, 0.1, 0.03), metal(0xc9ced8, 0.3));
            top.position.y = 1.0;
            bars.add(top);
            const post1 = mesh(rbox(0.12, 1.25, 0.16, 0.04), frameM);
            post1.position.set(-T / 2 + 0.06, 0.62, 0);
            const post2 = post1.clone();
            post2.position.x = T / 2 - 0.06;
            const lintel = mesh(rbox(T, 0.12, 0.16, 0.04), frameM);
            lintel.position.y = 1.25;
            const led = mesh(sph(0.06), glow(0xff5a4a, 2), false, false);
            led.position.set(0, 1.25, 0.1);
            g.add(bars, post1, post2, lintel, led);
            g.userData.bars = bars;
            g.userData.led = led;
            at(g, p.x, 0, p.z, 0, horiz ? 0 : Math.PI / 2, 0);
            this.root.add(g);
            this.gates.push({ g, open: 0 });
            break;
          }
          default:
            if (isPipe(ch)) this.pipeEnd(x, y);
        }
      }
    }
    // pipes: one glass tube per pair, routed above the room
    const done = new Set<number>();
    for (const [k, other] of L.pipes) {
      if (done.has(k)) continue;
      const ax = k % 64;
      const ay = Math.floor(k / 64);
      done.add(k);
      done.add(key(other[0], other[1]));
      const hgt = 2.0;
      const a = this.world(ax, ay, 0.25);
      const b = this.world(other[0], other[1], 0.25);
      const pts = [a, new THREE.Vector3(a.x, hgt, a.z)];
      if (Math.abs(a.x - b.x) > 0.01 && Math.abs(a.z - b.z) > 0.01) pts.push(new THREE.Vector3(b.x, hgt, a.z));
      pts.push(new THREE.Vector3(b.x, hgt, b.z), b);
      const tube = makeTube(pts, 0.24);
      this.root.add(tube.root);
      this.tubes.set(k, { curve: tube.curve, reverse: false });
      this.tubes.set(key(other[0], other[1]), { curve: tube.curve, reverse: true });
    }
  }

  private mouseHoles(x: number, y: number): void {
    const p = this.world(x, y);
    const shape = new THREE.Shape();
    shape.moveTo(-0.22, 0);
    shape.lineTo(-0.22, 0.14);
    shape.absarc(0, 0.14, 0.22, Math.PI, 0, true);
    shape.lineTo(0.22, 0);
    const geo = new THREE.ShapeGeometry(shape, 16);
    const m = matte(0x1a0f1e, 1);
    const tall = this.isTall(x, y);
    const half = T / 2 + 0.005;
    for (const [dx, dz, ry] of [[0, half, 0], [0, -half, Math.PI], [half, 0, Math.PI / 2], [-half, 0, -Math.PI / 2]] as const) {
      if (tall && dz < 0) continue;
      const hole = mesh(geo, m, false, false);
      at(hole, p.x + dx, 0.002, p.z + dz, 0, ry, 0);
      this.root.add(hole);
    }
  }

  private furniture(theme: Theme, p: THREE.Vector3, n: number): THREE.Group {
    const g = group();
    g.position.copy(p);
    switch (theme) {
      case 'lobby': {
        const body = mesh(rbox(T * 0.94, FURN, T * 0.9, 0.08), paint(PAL.deskTop, 0.5, 0.4));
        body.position.y = FURN / 2;
        const shelf = mesh(new THREE.BoxGeometry(T * 0.8, 0.04, T * 0.6), paint(0x6a3f2a, 0.6, 0.2), false, false);
        shelf.position.set(0, FURN * 0.5, T * 0.16);
        g.add(body, shelf);
        const cols = [0xe2574c, 0x4f9fb0, 0xf0b13e, 0x7b5ea7, 0x5fae5a];
        for (let i = 0; i < 4; i++) {
          const b = makeBook(cols[(n + i) % cols.length], 0.3, 0.32 + ((n + i) % 3) * 0.05, 0.08);
          b.rotation.y = Math.PI / 2;
          b.position.set(-0.3 + i * 0.13, FURN * 0.5 + 0.2, T * 0.42);
          g.add(b);
        }
        break;
      }
      case 'dining': {
        const cloth = mesh(rbox(T * 0.96, 0.1, T * 0.96, 0.05), paint(0xf8f1e2, 0.7, 0.1));
        cloth.position.y = FURN;
        const drape = mesh(cyl(T * 0.5, T * 0.55, FURN - 0.1, 24), paint(0xf8f1e2, 0.75, 0.05));
        drape.position.y = (FURN - 0.1) / 2;
        drape.scale.set(1, 1, 0.98);
        g.add(drape, cloth);
        if (n % 2 === 0) {
          const plate = mesh(cyl(0.2, 0.16, 0.03, 24), paint(0xffffff, 0.3, 0.6));
          plate.position.set(-0.15, FURN + 0.07, 0.05);
          const candle = mesh(cyl(0.04, 0.04, 0.2, 12), paint(0xfff4d6, 0.6, 0));
          candle.position.set(0.22, FURN + 0.15, -0.1);
          const flame = mesh(sph(0.04), glow(0xffb84a, 4), false, false);
          flame.position.set(0.22, FURN + 0.28, -0.1);
          g.add(plate, candle, flame);
        }
        break;
      }
      case 'spa': {
        const body = mesh(rbox(T * 0.92, FURN, T * 0.86, 0.1), paint(0xf6f2ea, 0.5, 0.4));
        body.position.y = FURN / 2;
        g.add(body);
        const cols = [0x8fd3cc, 0xf7a1ad, 0xffffff, 0xf0d27a];
        for (let i = 0; i < 3; i++) {
          const towel = mesh(cyl(0.12, 0.12, T * 0.6, 16), fur(cols[(n + i) % cols.length], 0.9));
          towel.rotation.z = Math.PI / 2;
          towel.position.set(0, FURN + 0.12, -0.28 + i * 0.27);
          g.add(towel);
        }
        break;
      }
      case 'garden': {
        const box = mesh(rbox(T * 0.94, FURN * 0.7, T * 0.94, 0.08), paint(0x9a6b45, 0.6, 0.2));
        box.position.y = FURN * 0.35;
        const soil = mesh(new THREE.BoxGeometry(T * 0.8, 0.05, T * 0.8), matte(0x4a2e22), false, true);
        soil.position.y = FURN * 0.7;
        g.add(box, soil);
        const cols = [0xf7a1ad, 0xf0d27a, 0xffffff, 0xb59cf0];
        for (let i = 0; i < 5; i++) {
          const bush = mesh(sph(0.16, 16, 12), fur(i % 2 ? PAL.plantGreen : PAL.plantDark, 0.7));
          bush.position.set(-0.32 + (i % 3) * 0.32, FURN * 0.78, -0.2 + Math.floor(i / 3) * 0.38);
          const fl = mesh(sph(0.06, 12, 8), paint(cols[(n + i) % cols.length], 0.5, 0.2));
          fl.position.copy(bush.position).add(new THREE.Vector3(0.05, 0.13, 0.05));
          g.add(bush, fl);
        }
        break;
      }
      case 'rooftop': {
        if (n % 2 === 0) {
          const tank = mesh(cyl(T * 0.42, T * 0.44, FURN, 28), paint(0x8fa6c8, 0.45, 0.4));
          tank.position.y = FURN / 2;
          const lid = mesh(puck(T * 0.44, 0.08, 0.03), paint(0x6a7f9e, 0.45, 0.4));
          lid.position.y = FURN;
          g.add(tank, lid);
          for (const yy of [0.25, 0.65]) {
            const band = mesh(torus(T * 0.43, 0.02), metal(0x9aa0aa, 0.4));
            band.rotation.x = Math.PI / 2;
            band.position.y = yy;
            g.add(band);
          }
        } else {
          const vent = mesh(rbox(T * 0.9, FURN, T * 0.9, 0.08), metal(0xa9afbd, 0.45));
          vent.position.y = FURN / 2;
          const fan = mesh(cyl(0.32, 0.32, 0.06, 20), paint(0x3b3f52, 0.5, 0.3));
          fan.position.y = FURN + 0.02;
          g.add(vent, fan);
        }
        break;
      }
    }
    return g;
  }

  private pipeEnd(x: number, y: number): void {
    const p = this.world(x, y);
    const ring = mesh(torus(0.28, 0.07), paint(PAL.tubeRing, 0.35, 0.7));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(p.x, 0.07, p.z);
    const hole = mesh(new THREE.CircleGeometry(0.25, 24), matte(0x10202a, 1), false, false);
    at(hole, p.x, 0.008, p.z, -Math.PI / 2, 0, 0);
    this.root.add(ring, hole);
  }

  private exit(x: number, y: number): void {
    const p = this.world(x, y);
    const L = this.level;
    // face into the room: the exit's open neighbour
    let dir = 0;
    if (L.tiles[y + 1]?.[x] && L.tiles[y + 1][x] !== '#') dir = 0;
    else if (L.tiles[y]?.[x + 1] && L.tiles[y][x + 1] !== '#') dir = Math.PI / 2;
    else if (L.tiles[y]?.[x - 1] && L.tiles[y][x - 1] !== '#') dir = -Math.PI / 2;
    else dir = Math.PI;
    const g = group();
    const tall = this.isTall(x, y);
    const H = tall ? TALL : 1.6;
    const trim = paint(PAL.trim, 0.55, 0.3);
    for (const sx of [-1, 1]) {
      const post = mesh(rbox(0.16, H, T * 0.9, 0.05), tall ? new THREE.MeshStandardMaterial({ map: wallpaperTexture(STYLE[L.theme].wall), roughness: 0.9 }) : trim);
      post.position.set(sx * (T / 2 - 0.08), H / 2, 0);
      g.add(post);
    }
    const lintel = mesh(rbox(T, tall ? TALL - 1.75 : 0.2, T * 0.9, 0.05), trim);
    lintel.position.y = tall ? 1.75 + (TALL - 1.75) / 2 : 1.7;
    g.add(lintel);
    const door = mesh(rbox(T - 0.3, 1.7, 0.08, 0.05), paint(0x2f9a6a, 0.5, 0.35));
    door.position.set(0, 0.85, -T * 0.3);
    const bar = mesh(new THREE.CapsuleGeometry(0.03, 0.5, 6, 12), metal(0xd9dde6, 0.25));
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0.85, -T * 0.25);
    const light = mesh(new THREE.PlaneGeometry(T - 0.32, 0.05), glow(0x9dffc4, 3), false, false);
    light.position.set(0, 0.03, -T * 0.25);
    g.add(door, bar, light);
    const sign = makeExitSign();
    sign.scale.setScalar(0.62);
    sign.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m && m.emissiveMap) m.emissiveIntensity = 1.8; if ((o as THREE.Sprite).isSprite) (o as THREE.Sprite).material.opacity = 0.25; });
    sign.position.set(0, tall ? 2.05 : 1.95, T * 0.2);
    g.add(sign);
    at(g, p.x, 0, p.z, 0, dir, 0);
    this.root.add(g);
    const ring = mesh(new THREE.RingGeometry(0.34, 0.5, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.exitGreen).multiplyScalar(1.6), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), false, false);
    ring.userData.noAO = true;
    const fwd = new THREE.Vector3(Math.sin(dir), 0, Math.cos(dir)).multiplyScalar(T);
    at(ring, p.x + fwd.x, 0.02, p.z + fwd.z, -Math.PI / 2, 0, 0);
    this.root.add(ring);
    this.exitRings.push(ring);
    const pl = new THREE.PointLight(PAL.exitGreen, 2.2, 4, 1.8);
    pl.position.set(p.x + fwd.x * 0.6, 1.8, p.z + fwd.z * 0.6);
    this.root.add(pl);
  }

  private buildLights(st: ThemeStyle): void {
    const { w, h } = this.level;
    this.root.add(new THREE.HemisphereLight(st.hemi[0], st.hemi[1], st.hemi[2]));
    const fill = new THREE.DirectionalLight(0xffc48a, 0.25);
    fill.position.set(8, 9, 12);
    this.root.add(fill);
    const moon = new THREE.DirectionalLight(PAL.moonLight, 1.8);
    const c = this.world((w - 1) / 2, (h - 1) / 2);
    moon.position.set(c.x - 5, 12, c.z - 12);
    moon.target.position.copy(c);
    moon.castShadow = true;
    const sz = this.quality === 'high' ? 2048 : 1024;
    moon.shadow.mapSize.set(sz, sz);
    const ext = Math.max(w, h) * T * 0.8;
    Object.assign(moon.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 50 });
    moon.shadow.bias = -0.0006;
    moon.shadow.normalBias = 0.02;
    moon.shadow.radius = 3;
    this.root.add(moon, moon.target);
    // warm lamps along the back wall + one in the front corner
    const lamps: THREE.Vector3[] = [this.world(w * 0.25, 2.2, 2.0), this.world(w * 0.75, 2.2, 2.0), this.world(w - 2, h - 2, 2.2)];
    for (const lp of lamps) {
      const l = new THREE.PointLight(st.lamp, 6.5, 8, 1.5);
      l.position.copy(lp);
      this.root.add(l);
    }
    for (const lp of lamps.slice(0, 2)) {
      const sconce = group();
      const shade = mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.24, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffb860, emissiveIntensity: 1.8, side: THREE.DoubleSide }), false, false);
      sconce.add(shade, glowSprite(st.lamp, 1.3, 0.5));
      sconce.position.set(lp.x, 1.85, -T / 2 + 0.25);
      this.root.add(sconce);
    }
  }

  private addPet(kind: PetKind, look: Look): void {
    const skin = look.skin !== 'default' ? item(look.skin)?.fur : undefined;
    const actor = makePet(kind, skin as Fur | undefined);
    applyCosmetics(actor.root, look);
    characterLook(actor.root, 0xd6e0ff, 0.6, true);
    const root = group(actor.root);
    const s = kind === 'dog' ? 0.86 : kind === 'cat' ? 0.84 : 0.78;
    actor.root.scale.setScalar(s);
    const hidden = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture('…', '#c9c2f2'), transparent: true, depthWrite: false, depthTest: false }));
    hidden.scale.set(0.32, 0.32, 1);
    hidden.position.y = kind === 'hamster' ? 0.75 : 1.35;
    hidden.userData.noAO = true;
    hidden.renderOrder = 20;
    root.add(hidden);
    this.root.add(root);
    this.pets.set(kind, { kind, actor, root, yaw: 0, phase: Math.random() * 6, hidden });
  }

  private addGuard(i: number, look: 'porter' | 'chef' | 'maid' | 'gardener' | 'guard'): void {
    const porter = makePorter({ cone: false, look });
    porter.sweep = 0;
    porter.light.castShadow = false;
    porter.light.intensity = 26;
    porter.light.distance = 7;
    characterLook(porter.root, 0xd6e0ff, 0.5, true);
    porter.root.scale.setScalar(0.66);
    this.root.add(porter.root);
    const fanGeo = fanGeometry();
    const fan = fanMesh(fanGeo, 0xffe6a0);
    this.scene.add(fan);
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture('?', '#ffd27a'), transparent: true, depthWrite: false, depthTest: false }));
    icon.scale.set(0.5, 0.5, 1);
    icon.renderOrder = 21;
    icon.userData.noAO = true;
    this.scene.add(icon);
    this.guards.push({ porter, fan, fanGeo, icon, phase: i * 1.3 });
  }

  private addCam(x: number, y: number): void {
    const p = this.world(x, y);
    const g = group();
    const mount = mesh(rbox(0.16, 0.16, 0.16, 0.03), paint(0x3b3f52, 0.4, 0.5));
    const head = group();
    const body = mesh(rbox(0.42, 0.22, 0.22, 0.06), paint(0xe9e6f0, 0.4, 0.6));
    body.position.x = 0.2;
    const lens = mesh(cyl(0.08, 0.08, 0.06, 20), glossy0());
    lens.rotation.z = Math.PI / 2;
    lens.position.x = 0.43;
    const led = mesh(sph(0.04), glow(0xff3a3a, 3), false, false);
    led.position.set(0.3, 0.12, 0);
    head.add(body, lens, led);
    g.add(mount, head);
    const tall = this.isTall(x, y);
    g.position.set(p.x, tall ? 2.1 : LOW + 0.45, p.z);
    this.root.add(g);
    const fanGeo = fanGeometry();
    const fan = fanMesh(fanGeo, 0xff5a5a);
    this.scene.add(fan);
    this.cams.push({ head, fan, fanGeo, led });
  }

  // ─── per frame ───────────────────────────────────────────────────────────
  private updateFan(geo: THREE.BufferGeometry, sim: Sim, x: number, y: number, dir: number, range: number, visible: boolean, mesh: THREE.Mesh): void {
    mesh.visible = visible;
    if (!visible) return;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, x * T, 0.03, y * T);
    for (let i = 0; i <= RAYS; i++) {
      const a = dir - FOV + (2 * FOV * i) / RAYS;
      const d = sim.castRay(x, y, a, range);
      pos.setXYZ(i + 1, (x + Math.cos(a) * d) * T, 0.03, (y + Math.sin(a) * d) * T);
    }
    pos.needsUpdate = true;
    geo.computeBoundingSphere();
  }

  sync(sim: Sim, dt: number, active: PetKind): void {
    this.time += dt;
    const t = this.time;
    // pets
    for (const p of sim.pets) {
      const v = this.pets.get(p.kind)!;
      v.root.visible = !p.escaped;
      if (p.escaped) continue;
      const [px, py] = sim.petPos(p);
      let h = 0;
      const tile = sim.tile(p.tx, p.ty);
      const from = p.move ? sim.tile(p.move.fx, p.move.fy) : tile;
      const onH = (ch: string) => (ch === 'H' ? FURN : 0);
      if (p.move && p.move.type !== 'pipe') {
        const k = Math.min(1, p.move.t / p.move.dur);
        h = onH(from) + (onH(tile) - onH(from)) * k;
        if (p.move.type === 'jump') h += Math.sin(k * Math.PI) * 0.55;
        else h += Math.abs(Math.sin(k * Math.PI)) * (p.move.type === 'run' ? 0.12 : 0.07);
        if (p.move.type === 'dig') h -= Math.sin(k * Math.PI) * 0.35;
      } else h = onH(tile);
      const wp = this.world(px, py, h);
      if (p.move?.type === 'pipe') {
        const tube = this.tubes.get(key(p.move.fx, p.move.fy));
        if (tube) {
          const k = Math.min(1, p.move.t / p.move.dur);
          wp.copy(tube.curve.getPointAt(tube.reverse ? 1 - k : k));
          wp.y -= 0.12;
        }
      }
      v.root.position.lerp(wp, p.move ? 1 : Math.min(1, dt * 14));
      const want = Math.PI / 2 - p.dir;
      let d = want - v.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      v.yaw += d * Math.min(1, dt * 12);
      v.root.rotation.y = v.yaw;
      v.actor.update(t + v.phase);
      const inPipe = p.move?.type === 'pipe';
      v.actor.root.scale.setScalar((p.kind === 'dog' ? 0.86 : p.kind === 'cat' ? 0.84 : 0.78) * (inPipe ? 0.62 : 1));
      v.hidden.visible = sim.isHidden(p) && !inPipe;
      (v.hidden.material as THREE.SpriteMaterial).opacity = 0.7 + 0.3 * Math.sin(t * 3);
    }
    // active pet: fill light + ring
    const av = this.pets.get(active);
    if (av && av.root.visible) {
      this.fill.position.copy(av.root.position).add(new THREE.Vector3(0.3, 2.4, 1.2));
      this.marker.visible = true;
      this.marker.position.set(av.root.position.x, Math.max(0.02, av.root.position.y + 0.02), av.root.position.z);
      const s = 1 + 0.08 * Math.sin(t * 4);
      this.marker.scale.set(s, s, s);
    } else this.marker.visible = false;
    // staff
    sim.guards.forEach((g, i) => {
      const v = this.guards[i];
      const def = this.level.def.guards[i];
      const pr = v.porter;
      const moving = g.route.length > 0;
      pr.root.position.set(g.x * T, moving ? Math.abs(Math.sin(t * 9 + v.phase)) * 0.05 : 0, g.y * T);
      pr.root.rotation.y = Math.PI / 2 - g.dir;
      pr.sleeping = g.mode === 'sleep';
      pr.aim.set(0, 0.2, 3);
      pr.light.visible = g.mode !== 'sleep';
      pr.update(t + v.phase);
      const range = def.range ?? 4.5;
      this.updateFan(v.fanGeo, sim, g.x, g.y, g.dir, range, g.mode !== 'sleep', v.fan);
      const col = g.mode === 'chase' ? 0xff4a3a : g.mode === 'suspicious' || g.mode === 'look' ? 0xffa040 : 0xffe6a0;
      (v.fan.material as THREE.MeshBasicMaterial).color.setHex(col);
      (v.fan.material as THREE.MeshBasicMaterial).opacity = 0.75 + g.meter * 0.25;
      pr.light.color.setHex(col);
      const showIcon = g.mode === 'suspicious' || g.mode === 'look' || g.mode === 'chase';
      v.icon.visible = showIcon;
      if (showIcon) {
        const txt = g.mode === 'chase' ? '!' : '?';
        if (v.icon.userData.txt !== txt) {
          (v.icon.material as THREE.SpriteMaterial).map = iconTexture(txt, txt === '!' ? '#ff6a5a' : '#ffd27a');
          (v.icon.material as THREE.SpriteMaterial).needsUpdate = true;
          v.icon.userData.txt = txt;
        }
        v.icon.position.set(g.x * T, 2.0 + Math.sin(t * 6) * 0.05, g.y * T);
        const sc = 0.45 + 0.15 * (txt === '!' ? 1 : g.meter);
        v.icon.scale.set(sc, sc, 1);
      }
    });
    // cameras
    sim.cams.forEach((c, i) => {
      const def = this.level.def.cams![i];
      const v = this.cams[i];
      v.head.rotation.y = -c.dir;
      this.updateFan(v.fanGeo, sim, def.x, def.y, c.dir, def.range ?? 4, true, v.fan);
      (v.fan.material as THREE.MeshBasicMaterial).opacity = 0.7 + c.meter * 0.3;
      (v.led.material as THREE.MeshStandardMaterial).emissiveIntensity = 2 + Math.sin(t * 8) * 1.5 + c.meter * 4;
    });
    // bones / key / gates / buttons / exit
    this.bones.forEach((b, i) => {
      if (sim.bones[i] && this.boneGone[i] < 0) this.boneGone[i] = t;
      if (this.boneGone[i] >= 0) {
        const k = (t - this.boneGone[i]) / 0.4;
        b.root.scale.setScalar(Math.max(0, 1.15 * (1 + k) * (1 - k)));
        b.root.position.y = k;
        if (k >= 1) b.root.visible = false;
      } else b.update(t);
    });
    if (this.keyObj) {
      if (sim.hasKey) this.keyObj.visible = false;
      else {
        this.keyObj.position.y = 0.6 + Math.sin(t * 2.4) * 0.1;
        this.keyObj.rotation.y = t * 1.5;
      }
    }
    for (const gt of this.gates) {
      const target = sim.gateOpen ? 1 : 0;
      gt.open += (target - gt.open) * Math.min(1, dt * 8);
      (gt.g.userData.bars as THREE.Object3D).position.y = -gt.open * 0.98;
      ((gt.g.userData.led as THREE.Mesh).material as THREE.MeshStandardMaterial).emissive.setHex(sim.gateOpen ? 0x4aff8a : 0xff5a4a);
    }
    for (const b of this.buttons) (b.material as THREE.MeshStandardMaterial).emissiveIntensity = sim.gateOpen ? 1.2 : 0.15;
    const locked = !sim.hasKey;
    for (const r of this.exitRings) {
      const mat = r.material as THREE.MeshBasicMaterial;
      mat.color.setHex(locked ? 0xff7a5a : PAL.exitGreen).multiplyScalar(1.6);
      r.scale.setScalar(1 + 0.08 * Math.sin(t * 3));
    }
    if (this.hint) (this.hint.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(t * 4);
  }

  /** Glowing paw trail along a route (hints). */
  showHint(path: XY[] | null): void {
    if (this.hint) {
      this.hint.removeFromParent();
      this.hint = null;
    }
    if (!path || !path.length) return;
    const g = new THREE.BufferGeometry();
    const pos: number[] = [];
    const idx: number[] = [];
    path.forEach(([x, y]) => {
      const c = this.world(x, y, 0.035);
      const s = 0.16;
      const o = pos.length / 3;
      pos.push(c.x - s, c.y, c.z - s, c.x + s, c.y, c.z - s, c.x + s, c.y, c.z + s, c.x - s, c.y, c.z + s);
      idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
    });
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const uv: number[] = [];
    path.forEach(() => uv.push(0, 0, 1, 0, 1, 1, 0, 1));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: pawTexture('#ffffff', 'rgba(0,0,0,0)'), color: 0x9dffc4, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    m.userData.noAO = true;
    m.renderOrder = 9;
    this.scene.add(m);
    this.hint = m;
  }

  // ─── camera ──────────────────────────────────────────────────────────────
  /** Follow the active pet (portrait-first framing), or show the whole room ("map"). Smoothly blends. */
  updateCamera(cam: THREE.PerspectiveCamera, dt: number, mode: 'follow' | 'map', focus: THREE.Vector3 | null): void {
    const portrait = cam.aspect < 1;
    let target: THREE.Vector3;
    let dist: number;
    const yaw = portrait ? 14 : 24;
    const pitch = portrait ? 50 : 48;
    if (mode === 'map' || !focus) {
      const probe = cam.clone();
      const f = fitCamera(probe, this.hull(), yaw, pitch, portrait ? { x0: -0.98, x1: 0.98, y0: -0.62, y1: 0.78 } : { x0: -0.82, x1: 0.82, y0: -0.9, y1: 0.86 });
      target = f.target;
      dist = f.dist;
    } else {
      target = focus.clone();
      target.y = 0.5;
      // keep a little more room in front of the pet (towards the camera / exits are usually at the back)
      target.z -= portrait ? 0.6 : 0.3;
      const { w, h } = this.level;
      target.x = THREE.MathUtils.clamp(target.x, T * 1.5, (w - 2.5) * T);
      target.z = THREE.MathUtils.clamp(target.z, T * 1.2, (h - 2.2) * T);
      dist = portrait ? 19 : 16;
    }
    if (!this.camReady) {
      this.camTarget.copy(target);
      this.camDist = dist;
      this.camReady = true;
    }
    const k = 1 - Math.exp(-dt * (mode === 'map' ? 3 : 4.5));
    this.camTarget.lerp(target, k);
    this.camDist += (dist - this.camDist) * k;
    orbit(cam, this.camTarget, yaw, pitch, this.camDist);
  }

  /** Floor tile under a screen point (NDC). */
  pick(cam: THREE.PerspectiveCamera, nx: number, ny: number): XY | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(nx, ny), cam);
    const hit = new THREE.Vector3();
    // furniture top first (cats), then the floor
    for (const h of [FURN, 0]) {
      if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -h), hit)) continue;
      const x = Math.round(hit.x / T);
      const y = Math.round(hit.z / T);
      if (x < 0 || y < 0 || x >= this.level.w || y >= this.level.h) continue;
      if (h > 0 && this.level.tiles[y][x] !== 'H') continue;
      return [x, y];
    }
    return null;
  }

  /** Which pet (if any) is under a screen point. */
  pickPet(cam: THREE.PerspectiveCamera, nx: number, ny: number): PetKind | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(nx, ny), cam);
    let best: PetKind | null = null;
    let bestD = 0.6;
    for (const [kind, v] of this.pets) {
      if (!v.root.visible) continue;
      const c = v.root.position.clone().add(new THREE.Vector3(0, 0.45, 0));
      const d = ray.ray.distanceToPoint(c);
      if (d < bestD) {
        bestD = d;
        best = kind;
      }
    }
    return best;
  }

  dispose(): void {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}

function glossy0(): THREE.Material {
  return new THREE.MeshPhysicalMaterial({ color: 0x15151f, roughness: 0.1, clearcoat: 1 });
}

