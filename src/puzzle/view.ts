import * as THREE from 'three';
import { applyCosmetics, characterLook } from '../art/look';
import { type Actor, at, cyl, fur, group, matte, mesh, metal, paint, puck, rbox, torus } from '../art/kit';
import { glowSprite, sparkle } from '../art/fx';
import { type Fur, makePet } from '../art/pets';
import { floorTextures, gradientTexture } from '../art/textures';
import type { Look } from '../game/save';
import { PLANK_TINTS, SCREW_HEX, drawBomb, headTexture, hiddenTexture, iceTexture, lockTexture, plankTexture } from './look';
import { BOX_SIZE, type Color, type LevelDef, type PlankStyle, Puzzle, type PuzzleEvent, SCREW_R, plankWidth } from './model';

/**
 * 3D presentation of a puzzle: the object (crate / cage / kennel) with the pet inside, planks and screws on
 * its front, the toolboxes and the holding tray floating above it. The model changes instantly; the view
 * plays the matching animations (spin out, fly, land, lid close, plank fall, rescue) on its own clock.
 */
const OPEN_W = 3.6;
const OPEN_H = 3.0;
const FLOOR_Y = -OPEN_H / 2 - 0.42;
const PLANK_D = 0.16;
const LAYER_Z = 0.15;

type Sound = 'unscrew' | 'land' | 'tray' | 'close' | 'plank' | 'thud' | 'rescue' | 'pop' | 'fail' | 'ice' | 'unlock' | 'tick' | 'boom' | 'warn';

interface Tween {
  t0: number;
  dur: number;
  fn: (k: number) => void;
  done?: () => void;
}

interface ScrewView {
  id: number;
  color: Color;
  g: THREE.Group;
  head: THREE.Mesh;
  cap: THREE.Mesh;
  dim: boolean;
  /** Where it rests (world) while on the plank. */
  home: THREE.Vector3;
  flying: boolean;
  /** Mechanic decorations (removed when they stop applying). */
  ice?: THREE.Group;
  /** Shown as "?" until free. */
  masked: boolean;
}

interface BoxView {
  uid: number;
  color: Color;
  index: number;
  g: THREE.Group;
  lid: THREE.Group;
  landed: number;
  full: boolean;
  /** Time the box is in place (screws aimed at it wait for that). */
  readyAt: number;
  leaving: boolean;
}

interface Falling {
  m: THREE.Object3D;
  v: THREE.Vector3;
  w: THREE.Vector3;
  t: number;
  bounced: number;
}

/** A screen rectangle (canvas px). */
export interface Rect {
  kind: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const overlaps = (a: Rect, b: Rect) => Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0);

const ease = (k: number) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const backOut = (k: number) => 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2);

export class PuzzleView {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private now = 0;
  private tweens: Tween[] = [];
  private screws: ScrewView[] = [];
  private planks: THREE.Group[] = [];
  private boxes: BoxView[] = [];
  private trayG = group();
  private traySlots: THREE.Vector3[] = [];
  private queueG = group();
  private falling: Falling[] = [];
  private pet: Actor;
  private petRoot: THREE.Group;
  private object = group();
  private confetti: THREE.InstancedMesh | null = null;
  private confettiState: { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; w: THREE.Vector3 }[] = [];
  private confettiT = 0;
  private rescued = -1;
  private hearts: THREE.Sprite[] = [];
  private layoutAspect = 0;
  /**
   * Shares of the screen height the scene is kept out of: the bottom strip of the tutorial tip, and at the top only as
   * much as the HUD (top bar, moves pill, tier badge) would otherwise overlap the board (setInsets). 0 = full screen.
   */
  private insetTop = 0;
  private insetBottom = 0;
  /** Box anchor (world) per open-box index, and the tray anchor; set by layout(). */
  private boxAnchor: THREE.Vector3[] = [];
  private trayAnchor = new THREE.Vector3();
  private boxScale = 1;
  private orbit = 0;
  private camHome: { pos: THREE.Vector3; target: THREE.Vector3; portrait: boolean } | null = null;
  private chains: { planks: number[]; g: THREE.Group }[] = [];
  private bombs: { screw: number; canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; m: THREE.Mesh; last: number }[] = [];
  private trayHoles: THREE.Mesh[] = [];
  private trayWarn = false;
  onSound: (s: Sound) => void = () => undefined;

  constructor(readonly puzzle: Puzzle, look: Look, quality: 'high' | 'low', fur?: Fur) {
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.2, 100);
    this.scene.background = gradientTexture([[0, '#ffe9c7'], [0.5, '#ffd3b5'], [1, '#f7b9a8']]);
    this.buildRoom(quality);
    this.buildObject(puzzle.def);
    // pet inside
    this.pet = makePet(puzzle.def.pet, fur);
    applyCosmetics(this.pet.root, look);
    characterLook(this.pet.root, 0xffffff, 0.35, true);
    this.petRoot = group(this.pet.root);
    const s = puzzle.def.pet === 'hamster' ? 1.9 : 1.45;
    this.pet.root.scale.setScalar(s);
    this.petRoot.position.set(0, -OPEN_H / 2 + 0.02, -0.75);
    this.object.add(this.petRoot);
    this.buildPlanks();
    this.buildToolArea();
    this.scene.add(this.object);
    if (puzzle.history.length) this.syncState();
  }

  /** Rebuild the picture of a level already in progress (after undo): planks gone, screws in boxes/tray. */
  private syncState(): void {
    const p = this.puzzle;
    p.plankGone.forEach((gone, i) => {
      if (gone) this.planks[i].visible = false;
    });
    for (const b of this.boxes) {
      const box = p.boxes[b.index];
      if (!box) continue;
      b.landed = box.screws.length;
      box.screws.forEach((sid, slot) => {
        const g = sid >= 0 ? this.screws[sid].g : this.ghostScrew(box.color);
        if (sid >= 0) this.screws[sid].flying = true;
        b.g.add(g);
        g.position.set(-0.42 + slot * 0.42, 0.5, 0.06);
        g.rotation.set(-0.45, 0, 0);
        g.scale.setScalar(0.88);
      });
    }
    p.tray.forEach((sid, slot) => {
      if (sid === null) return;
      const s = this.screws[sid];
      s.flying = true;
      this.trayG.add(s.g);
      s.g.position.copy(this.traySlots[slot]).add(new THREE.Vector3(0, 0.12, 0));
      s.g.rotation.set(-0.5, 0, 0);
      s.g.scale.setScalar(0.88);
    });
    // screws already packed away in closed boxes
    p.removed.forEach((r, sid) => {
      if (r && !this.screws[sid].flying) this.screws[sid].g.visible = false;
    });
    this.refreshDim(true);
  }

  /** A screw of a colour with no plank (filled in by the hammer booster). */
  private ghostScrew(color: Color): THREE.Group {
    const g = group();
    const cap = mesh(puck(SCREW_R, 0.1, 0.04, 40), new THREE.MeshPhysicalMaterial({ color: SCREW_HEX[color], roughness: 0.42, clearcoat: 0.45 }), false, false);
    cap.rotation.x = Math.PI / 2;
    cap.position.z = 0.05;
    const head = mesh(new THREE.CircleGeometry(SCREW_R * 0.93, 40), new THREE.MeshStandardMaterial({ map: headTexture(color), roughness: 0.6 }), false, false);
    head.position.z = 0.101;
    g.add(cap, head);
    return g;
  }

  // ─── building ────────────────────────────────────────────────────────────
  private buildRoom(quality: 'high' | 'low'): void {
    this.scene.add(new THREE.HemisphereLight(0xfff4e2, 0xd9a07a, 1.35));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    sun.position.set(-4, 9, 7);
    sun.castShadow = true;
    const sz = quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(sz, sz);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 7, bottom: -5, near: 1, far: 30 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0xffd6f0, 1.0);
    rim.position.set(5, 3, -6);
    this.scene.add(rim);
    // table top
    const { map, bump } = floorTextures(0xd99a62);
    map.repeat.set(3, 3);
    bump.repeat.copy(map.repeat);
    const table = mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 1, roughness: 0.6 }), false, true);
    at(table, 0, FLOOR_Y, -0.5, -Math.PI / 2, 0, 0);
    this.scene.add(table);
    // a soft rug under the object
    const rug = mesh(puck(2.9, 0.04, 0.02, 64), fur(0xffe2a8, 0.9), false, true);
    rug.scale.z = 0.6;
    rug.position.set(0, FLOOR_Y + 0.02, 0.2);
    this.scene.add(rug);
  }

  private buildObject(def: LevelDef): void {
    const o = this.object;
    const W = OPEN_W + 0.5;
    const H = OPEN_H + 0.5;
    const D = 1.7;
    const kind = def.object;
    const frameCol = kind === 'cage' ? 0x4f9fd8 : kind === 'kennel' ? 0xf0b13e : kind === 'carrier' ? 0xff8fb8 : kind === 'toybox' ? 0x6fcf7a : 0xc9874f;
    const frameMat = kind === 'cage' ? paint(frameCol, 0.35, 0.6) : paint(frameCol, 0.6, 0.25);
    const innerMat = matte(kind === 'cage' ? 0xe8f2fb : kind === 'kennel' ? 0xffe2b0 : 0xf2c79a, 0.9);
    // back + sides + floor + top (an open-front box)
    const back = mesh(rbox(W, H, 0.14, 0.05), innerMat);
    back.position.set(0, 0, -D + 0.07);
    const floor = mesh(rbox(W, 0.2, D, 0.06), frameMat);
    floor.position.set(0, -H / 2 + 0.1, -D / 2);
    const roof = mesh(rbox(W, 0.2, D, 0.06), frameMat);
    roof.position.set(0, H / 2 - 0.1, -D / 2);
    o.add(back, floor, roof);
    for (const s of [-1, 1]) {
      const side = mesh(rbox(0.2, H, D, 0.06), frameMat);
      side.position.set((s * (W - 0.2)) / 2, 0, -D / 2);
      o.add(side);
    }
    // front frame
    const beam = (w: number, h: number, x: number, y: number) => {
      const b = mesh(rbox(w, h, 0.26, 0.08), frameMat);
      b.position.set(x, y, 0.0);
      o.add(b);
    };
    beam(W + 0.1, 0.32, 0, H / 2);
    beam(W + 0.1, 0.32, 0, -H / 2);
    beam(0.32, H, -W / 2, 0);
    beam(0.32, H, W / 2, 0);
    if (kind === 'crate') {
      // slats on the sides, stencilled paw on the top beam
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        const slat = mesh(rbox(0.06, H * 0.9, 0.3, 0.02), paint(0xb3743f, 0.6, 0.2));
        slat.position.set((s * (W + 0.02)) / 2, 0, -0.35 - i * 0.5);
        o.add(slat);
      }
    } else if (kind === 'cage') {
      for (let i = 0; i < 9; i++) {
        const bar = mesh(cyl(0.035, 0.035, H - 0.3, 10), metal(0xd8dde8, 0.3));
        bar.position.set(-W / 2 + 0.25 + (i * (W - 0.5)) / 8, 0, -D + 0.2);
        o.add(bar);
      }
      const handle = mesh(torus(0.5, 0.07, Math.PI), paint(frameCol, 0.35, 0.6));
      handle.position.set(0, H / 2 + 0.1, -D / 2);
      o.add(handle);
    } else if (kind === 'carrier') {
      const handle = mesh(torus(0.6, 0.09, Math.PI), paint(0xffffff, 0.4, 0.5));
      handle.position.set(0, H / 2 + 0.05, -D / 2);
      o.add(handle);
      for (let i = 0; i < 5; i++) {
        const vent = mesh(rbox(0.12, 0.5, 0.05, 0.04), matte(0xd96a95, 0.8));
        vent.position.set((W / 2 + 0.11) * (i % 2 ? 1 : -1), -0.5 + Math.floor(i / 2) * 0.5, -D / 2);
        vent.rotation.y = Math.PI / 2;
        o.add(vent);
      }
    } else if (kind === 'toybox') {
      const lid = mesh(rbox(W + 0.3, 0.3, D + 0.3, 0.1), paint(0xffc928, 0.45, 0.4));
      lid.position.set(0, H / 2 + 0.55, -D - 0.1);
      lid.rotation.x = -1.15;
      o.add(lid);
      const cols = [0xf0464b, 0x3d8bf2, 0xffc928, 0x9a5cf0];
      for (let i = 0; i < 4; i++) {
        const blk = mesh(rbox(0.36, 0.36, 0.36, 0.06), paint(cols[i], 0.45, 0.4));
        blk.position.set((i % 2 ? 1 : -1) * (W / 2 + 0.2), -H / 2 + 0.2 + (i > 1 ? 0.4 : 0), 0.3 - (i > 1 ? 0.2 : 0));
        blk.rotation.y = i * 0.5;
        o.add(blk);
      }
    } else if (kind === 'kennel') {
      for (const s of [-1, 1]) {
        const r = mesh(rbox(W * 0.62, 0.18, D + 0.4, 0.06), paint(0xe2574c, 0.5, 0.35));
        r.position.set(s * W * 0.27, H / 2 + 0.45, -D / 2);
        r.rotation.z = -s * 0.55;
        o.add(r);
      }
    }
    // name plate
    const plate = mesh(rbox(1.3, 0.3, 0.06, 0.06), paint(0xfff4dc, 0.5, 0.4));
    plate.position.set(0, -H / 2 - 0.02, 0.15);
    o.add(plate);
  }

  private plankZ(layer: number): number {
    return 0.2 + layer * LAYER_Z;
  }

  private buildPlanks(): void {
    const tex = plankTexture();
    for (const p of this.puzzle.planks) {
      const sp = p.spec;
      const g = group();
      const tint = PLANK_TINTS[(sp.tint ?? p.id) % PLANK_TINTS.length];
      const W = plankWidth(sp);
      const style = sp.style ?? 0;
      // six plank looks so levels don't all feel alike: wood, painted metal strip, striped, plywood, a rounded
      // painted stick and a board with cut corners
      const mat = style >= 4
        ? new THREE.MeshPhysicalMaterial({ color: new THREE.Color(tint).multiplyScalar(style === 4 ? 1 : 0.94), roughness: style === 4 ? 0.38 : 0.6, clearcoat: style === 4 ? 0.5 : 0 })
        : style === 1
        ? new THREE.MeshStandardMaterial({ color: new THREE.Color(tint).lerp(new THREE.Color(0x9aa3b8), 0.55), roughness: 0.35, metalness: 0.55 })
        : style === 3
          ? new THREE.MeshStandardMaterial({ map: tex, color: new THREE.Color(tint).lerp(new THREE.Color(0xe8cf9a), 0.6), roughness: 0.7 })
          : new THREE.MeshStandardMaterial({ map: tex, color: tint, roughness: 0.55 });
      const m = mesh(style >= 4 ? shapedPlank(sp.len, W, style) : rbox(sp.len, W, PLANK_D, style === 3 ? 0.02 : 0.07), mat);
      g.add(m);
      if (style === 1) {
        // rivets along the metal strip
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          const rv = mesh(puck(0.05, 0.03, 0.01, 12), metal(0xd8dce6, 0.25), false, false);
          rv.rotation.x = Math.PI / 2;
          rv.position.set(sx * (sp.len / 2 - 0.12), sy * (W / 2 - 0.1), PLANK_D / 2 + 0.01);
          g.add(rv);
        }
      } else if (style === 2) {
        // painted stripes across the plank
        const n = Math.max(2, Math.floor(sp.len / 0.55));
        for (let k = 0; k < n; k++) {
          const st = mesh(rbox(0.12, W * 0.96, 0.012, 0.004), new THREE.MeshStandardMaterial({ color: new THREE.Color(tint).multiplyScalar(0.78), roughness: 0.6 }), false, false);
          st.position.set(-sp.len / 2 + ((k + 0.5) * sp.len) / n, 0, PLANK_D / 2 + 0.003);
          st.rotation.z = 0.5;
          g.add(st);
        }
      }
      if (sp.sticky) {
        // honey goo: a glossy amber coat with drips
        const goo = mesh(rbox(sp.len * 0.96, W * 0.9, 0.03, 0.02), new THREE.MeshPhysicalMaterial({ color: 0xffb627, roughness: 0.15, clearcoat: 1, transparent: true, opacity: 0.72 }), false, false);
        goo.position.z = PLANK_D / 2 + 0.012;
        goo.userData.noAO = true;
        g.add(goo);
        for (let k = 0; k < 4; k++) {
          const drip = mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshPhysicalMaterial({ color: 0xffa20f, roughness: 0.1, clearcoat: 1 }), false, false);
          drip.scale.set(1, 1.6, 0.6);
          drip.position.set(-sp.len / 2 + 0.3 + ((sp.len - 0.6) * k) / 3, -W / 2 - 0.02, PLANK_D / 2);
          g.add(drip);
        }
        g.userData.goo = goo;
      }
      if (sp.lock !== undefined) {
        // a big padlock on the plank (same symbol as its key screw)
        const pl = mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: lockTexture(sp.lock, 'lock'), transparent: true, depthWrite: false, toneMapped: false }), false, false);
        pl.userData.noAO = true;
        pl.renderOrder = 3;
        const holder = group(pl);
        holder.rotation.z = -(sp.angle * Math.PI) / 180;
        pl.position.set(0, 0, PLANK_D / 2 + 0.55);
        g.add(holder);
        // a chain wrapped across the plank
        for (let k = -3; k <= 3; k++) {
          const link = mesh(torus(0.07, 0.022), metal(0xc9ced8, 0.3), false, false);
          link.scale.set(1.25, 0.8, 1);
          link.position.set(k * 0.12 + 0.36, 0, PLANK_D / 2 + 0.04);
          link.rotation.set(k % 2 ? Math.PI / 2 : 0, 0, 0);
          g.add(link);
        }
        g.userData.padlock = holder;
      }
      // little nail heads at the ends so planks read as "fixed"
      g.position.set(sp.x, sp.y, this.plankZ(sp.layer));
      g.rotation.z = (sp.angle * Math.PI) / 180;
      g.userData.holes = [];
      this.object.add(g);
      this.planks.push(g);
    }
    for (const s of this.puzzle.screws) {
      const g = group();
      const color = s.color;
      const col = SCREW_HEX[color];
      const cap = mesh(puck(SCREW_R, 0.1, 0.04, 40), new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.3 }));
      cap.rotation.x = Math.PI / 2;
      cap.position.z = 0.05;
      const head = mesh(new THREE.CircleGeometry(SCREW_R * 0.93, 40), new THREE.MeshStandardMaterial({ map: headTexture(color), roughness: 0.6 }), false, false);
      head.position.z = 0.101;
      const washer = mesh(torus(SCREW_R * 0.95, 0.03), metal(0xe6e9f0, 0.25), false, false);
      washer.position.z = 0.01;
      const shaft = mesh(cyl(0.06, 0.035, 0.42, 14), metal(0xc9ced8, 0.3), false, false);
      shaft.rotation.x = Math.PI / 2;
      shaft.position.z = -0.2;
      for (let i = 0; i < 4; i++) {
        const th = mesh(torus(0.065 - i * 0.006, 0.012), metal(0xb7bcc8, 0.3), false, false);
        th.position.z = -0.06 - i * 0.09;
        g.add(th);
      }
      g.add(shaft, washer, cap, head);
      const home = new THREE.Vector3(s.x, s.y, this.plankZ(s.layer) + PLANK_D / 2);
      g.position.copy(home);
      g.rotation.z = ((s.id * 37) % 90) * (Math.PI / 180);
      this.object.add(g);
      const sv: ScrewView = { id: s.id, color, g, head, cap, dim: false, home, flying: false, masked: false };
      // decorations stay upright while the screw head is turned
      const upright = (m: THREE.Object3D, x: number, y: number) => {
        const holder = group(m);
        holder.rotation.z = -g.rotation.z;
        m.position.set(x, y, 0.16);
        g.add(holder);
      };
      if (s.ice) {
        const ice = group();
        const block = mesh(puck(SCREW_R * 1.32, 0.28, 0.07, 32), new THREE.MeshPhysicalMaterial({ color: 0xcdeeff, roughness: 0.12, transparent: true, opacity: 0.62, clearcoat: 1 }), false, false);
        block.rotation.x = Math.PI / 2;
        block.position.z = 0.1;
        const top = mesh(new THREE.CircleGeometry(SCREW_R * 1.3, 32), new THREE.MeshBasicMaterial({ map: iceTexture(), transparent: true, depthWrite: false, toneMapped: false }), false, false);
        top.position.z = 0.285;
        ice.add(block, top);
        ice.traverse((o) => (o.userData.noAO = true));
        g.add(ice);
        sv.ice = ice;
      }
      if (s.key >= 0) {
        const kt = mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshBasicMaterial({ map: lockTexture(s.key, 'key'), transparent: true, depthWrite: false, toneMapped: false }), false, false);
        kt.userData.noAO = true;
        upright(kt, 0.24, 0.24);
      }
      this.screws.push(sv);
    }
    this.buildChains();
    this.buildBombs();
    this.refreshDim(true);
  }

  /** Chain links between planks that fall together. */
  private buildChains(): void {
    const ids = [...new Set(this.puzzle.planks.map((p) => p.spec.chain).filter((c) => c !== undefined))];
    for (const c of ids) {
      const members = this.puzzle.planks.filter((p) => p.spec.chain === c);
      const g = group();
      // above every plank, so the chain always reads
      const z = this.plankZ(Math.max(...this.puzzle.planks.map((p) => p.spec.layer))) + PLANK_D / 2 + 0.06;
      for (let i = 0; i + 1 < members.length; i++) {
        const a = new THREE.Vector3(members[i].spec.x, members[i].spec.y, z);
        const b = new THREE.Vector3(members[i + 1].spec.x, members[i + 1].spec.y, z);
        const n = Math.max(3, Math.round(a.distanceTo(b) / 0.16));
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        for (let k = 0; k <= n; k++) {
          const link = mesh(torus(0.085, 0.026), metal(0xc9ced8, 0.3), false, false);
          link.scale.set(1.25, 0.8, 1);
          link.position.lerpVectors(a, b, k / n);
          link.rotation.set(k % 2 ? Math.PI / 2 : 0, 0, ang, 'ZXY');
          g.add(link);
        }
        for (const end of [a, b]) {
          const bolt = mesh(puck(0.12, 0.06, 0.02, 20), metal(0x9aa0ae, 0.3), false, false);
          bolt.rotation.x = Math.PI / 2;
          bolt.position.copy(end);
          g.add(bolt);
        }
      }
      this.object.add(g);
      this.chains.push({ planks: members.map((p) => p.id), g });
    }
  }

  /** Bomb screws: a ticking badge with the taps left, right on the screw. */
  private buildBombs(): void {
    for (const sc of this.puzzle.screws) {
      if (!sc.bomb) continue;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      drawBomb(canvas, this.puzzle.bombLeft(sc.id), false);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const m = mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }), false, false);
      m.userData.noAO = true;
      m.renderOrder = 3;
      const sv = this.screws[sc.id];
      const holder = group(m);
      holder.rotation.z = -sv.g.rotation.z;
      m.position.set(0.22, 0.26, 0.2);
      sv.g.add(holder);
      // a red ring around the bomb screw
      const ring = mesh(torus(SCREW_R * 1.12, 0.04), new THREE.MeshBasicMaterial({ color: 0xff4b3e, toneMapped: false }), false, false);
      ring.position.z = 0.11;
      ring.userData.noAO = true;
      sv.g.add(ring);
      this.bombs.push({ screw: sc.id, canvas, tex, m, last: this.puzzle.bombLeft(sc.id) });
    }
  }

  private refreshBombs(): void {
    for (const b of this.bombs) {
      const left = this.puzzle.bombLeft(b.screw);
      if (left === b.last || left === Infinity) continue;
      b.last = left;
      drawBomb(b.canvas, left, left <= 3);
      b.tex.needsUpdate = true;
      this.onSound('tick');
      this.tween(0, 0.25, (k) => b.m.scale.setScalar(1 + 0.35 * Math.sin(k * Math.PI)));
    }
  }

  /** A screw at a point that is in plain sight but blocked (locked plank, or a sticky plank in progress), or -1. */
  blockedAt(px: number, py: number, w: number, h: number): number {
    for (const s of this.screws) {
      if (s.flying || this.puzzle.removed[s.id] || !this.puzzle.isUncovered(s.id) || this.puzzle.isFree(s.id)) continue;
      const sc = this.screenOf(s.id, w, h);
      if (Math.hypot(px - sc.x, py - sc.y) <= Math.max(26, sc.r * 1.4)) return s.id;
    }
    return -1;
  }

  /** Locked screw tapped: the padlock wiggles. */
  wiggleLock(id: number): void {
    const pl = this.planks[this.puzzle.screws[id].plank].userData.padlock as THREE.Group | undefined;
    if (!pl) return;
    this.onSound('fail');
    this.tween(0, 0.4, (k) => (pl.rotation.z = Math.sin(k * Math.PI * 6) * 0.4 * (1 - k)));
  }

  private buildToolArea(): void {
    this.scene.add(this.trayG, this.queueG);
    this.buildTray(this.puzzle.tray.length);
    this.puzzle.boxes.forEach((b, i) => {
      if (b) this.addBox(b.uid, b.color, i, 0, false);
    });
    this.refreshQueue();
  }

  /** (Re)build the holding tray with n slots; screws already in it move to their slot. */
  private buildTray(n: number): void {
    for (const c of this.trayG.children.slice()) if (c.userData.trayPart) this.trayG.remove(c);
    const W = n * 0.72 + 0.3;
    const base = mesh(rbox(W, 0.22, 0.75, 0.1), paint(0x8f9bd6, 0.45, 0.4));
    const lip = mesh(rbox(W - 0.1, 0.06, 0.62, 0.05), paint(0x6f7cc0, 0.5, 0.3), false, false);
    lip.position.y = 0.11;
    base.userData.trayPart = lip.userData.trayPart = true;
    this.trayG.add(base, lip);
    this.traySlots = [];
    this.trayHoles = [];
    for (let i = 0; i < n; i++) {
      const x = -((n - 1) * 0.72) / 2 + i * 0.72;
      const extra = i >= this.puzzle.def.tray;
      const hole = mesh(new THREE.CircleGeometry(0.22, 28), new THREE.MeshBasicMaterial({ color: extra ? 0x2f7a5a : 0x3a3f6a }), false, false);
      at(hole, x, 0.145, 0, -Math.PI / 2, 0, 0);
      hole.userData.trayPart = true;
      hole.userData.base = extra ? 0x2f7a5a : 0x3a3f6a;
      this.trayG.add(hole);
      this.trayHoles.push(hole);
      this.traySlots.push(new THREE.Vector3(x, 0.15, 0));
    }
    this.puzzle.tray.forEach((sid, slot) => {
      if (sid === null) return;
      const s = this.screws[sid];
      if (s.g.parent === this.trayG) s.g.position.copy(this.traySlots[slot]).add(new THREE.Vector3(0, 0.12, 0));
    });
  }

  private makeBox(color: Color): { g: THREE.Group; lid: THREE.Group } {
    const g = group();
    const col = SCREW_HEX[color];
    const body = mesh(rbox(1.5, 0.62, 0.78, 0.12), paint(col, 0.4, 0.55));
    const band = mesh(rbox(1.52, 0.1, 0.8, 0.04), paint(new THREE.Color(col).multiplyScalar(0.7).getHex(), 0.4, 0.5));
    band.position.y = -0.12;
    const top = mesh(rbox(1.38, 0.05, 0.66, 0.03), matte(0x2c2340, 1), false, false);
    top.position.y = 0.3;
    g.add(body, band, top);
    for (let i = 0; i < BOX_SIZE; i++) {
      const hole = mesh(new THREE.CircleGeometry(0.17, 24), matte(0x120c1c, 1), false, false);
      at(hole, -0.42 + i * 0.42, 0.33, 0, -Math.PI / 2, 0, 0);
      g.add(hole);
    }
    // symbol badge on the front (colour-blind friendly)
    const badge = mesh(new THREE.CircleGeometry(0.2, 32), new THREE.MeshStandardMaterial({ map: headTexture(color), roughness: 0.4 }), false, false);
    badge.position.set(0, -0.02, 0.395);
    const ring = mesh(torus(0.2, 0.03), paint(0xffffff, 0.4, 0.4), false, false);
    ring.position.copy(badge.position);
    g.add(badge, ring);
    // lid hinged at the back edge
    const lid = group();
    lid.position.set(0, 0.31, -0.39);
    const lidM = mesh(rbox(1.5, 0.07, 0.78, 0.03), paint(col, 0.4, 0.55));
    lidM.position.set(0, 0.05, 0.39);
    const handle = mesh(torus(0.18, 0.04, Math.PI), paint(0x3b3f52, 0.4, 0.4));
    handle.position.set(0, 0.11, 0.39);
    handle.rotation.y = Math.PI / 2;
    handle.rotation.z = 0;
    lid.add(lidM, handle);
    lid.rotation.x = -2.5;
    g.add(lid);
    return { g, lid };
  }

  private addBox(uid: number, color: Color, index: number, delay: number, animate: boolean): void {
    const { g, lid } = this.makeBox(color);
    const bv: BoxView = { uid, color, index, g, lid, landed: 0, full: false, readyAt: this.now + delay + (animate ? 0.4 : 0), leaving: false };
    this.boxes.push(bv);
    this.scene.add(g);
    this.placeBox(bv, animate ? 1 : 0);
    if (animate) {
      g.visible = false;
      this.tween(delay, 0.4, (k) => {
        g.visible = true;
        this.placeBox(bv, 1 - backOut(k));
      });
    }
  }

  /** A closed grey box with a tick: this colour slot is finished (the row of toolboxes never empties). */
  private addDoneBox(index: number): void {
    const g = group();
    const body = mesh(rbox(1.5, 0.62, 0.78, 0.12), paint(0xd9d3e6, 0.5, 0.3));
    const lid = mesh(rbox(1.5, 0.08, 0.78, 0.03), paint(0xc4bcd6, 0.5, 0.3));
    lid.position.y = 0.35;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    x.fillStyle = '#3fc46a';
    x.beginPath();
    x.arc(64, 64, 60, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#fff';
    x.lineWidth = 16;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(36, 66);
    x.lineTo(56, 86);
    x.lineTo(94, 44);
    x.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const badge = mesh(new THREE.CircleGeometry(0.2, 32), new THREE.MeshBasicMaterial({ map: tex }), false, false);
    badge.position.set(0, -0.02, 0.395);
    g.add(body, lid, badge);
    const bv: BoxView = { uid: -index - 1, color: 'red', index, g, lid: group(), landed: 0, full: true, readyAt: this.now, leaving: false };
    this.boxes.push(bv);
    this.scene.add(g);
    this.placeBox(bv, 1);
    this.tween(0, 0.35, (k) => this.placeBox(bv, 1 - backOut(k)));
  }

  /** offset: 0 = in place, 1 = off to the right. */
  private placeBox(b: BoxView, offset: number): void {
    const a = this.boxAnchor[b.index];
    if (!a) return;
    b.g.position.copy(a).add(new THREE.Vector3(offset * 4.5, 0, 0));
    b.g.scale.setScalar(this.boxScale * (1 - offset * 0.3));
    b.g.userData.offset = offset;
    b.g.rotation.y = this.orbit;
  }

  private refreshQueue(): void {
    this.queueG.clear();
    // the next two boxes of the queue, small and greyed, so the player can plan ahead
    const upcoming = this.puzzle.def.queue.slice(this.puzzle.next, this.puzzle.next + 2);
    upcoming.forEach((c, i) => {
      const sc = i === 0 ? 1.15 : 1;
      const grey = new THREE.Color(SCREW_HEX[c]).lerp(new THREE.Color(0xb9b4c6), 0.55);
      const chip = mesh(rbox(0.5 * sc, 0.3 * sc, 0.3, 0.08), paint(grey.getHex(), 0.6, 0.2), false, false);
      chip.position.set((i - (upcoming.length - 1) / 2) * 0.66, 0, 0);
      const d = mesh(new THREE.CircleGeometry(0.12 * sc, 20), new THREE.MeshBasicMaterial({ map: headTexture(c, true) }), false, false);
      d.position.set((i - (upcoming.length - 1) / 2) * 0.66, 0, 0.152);
      this.queueG.add(chip, d);
    });
  }

  private refreshDim(force = false): void {
    for (const s of this.screws) {
      if (s.flying) continue;
      const covered = !this.puzzle.isUncovered(s.id) && !this.puzzle.removed[s.id];
      // a sticky plank in progress: every other screw waits (shown dimmed)
      const dim = covered || (this.puzzle.isStuckBySticky(s.id) && !this.puzzle.removed[s.id]);
      const masked = this.puzzle.screws[s.id].hidden && covered;
      if (dim === s.dim && masked === s.masked && !force) continue;
      s.dim = dim;
      s.masked = masked;
      (s.head.material as THREE.MeshStandardMaterial).map = masked ? hiddenTexture() : headTexture(s.color, dim);
      (s.head.material as THREE.MeshStandardMaterial).needsUpdate = true;
      const c = new THREE.Color(masked ? 0x9d98ae : SCREW_HEX[s.color]);
      if (dim) c.lerp(new THREE.Color(0x7d7a8c), 0.55).multiplyScalar(0.7);
      (s.cap.material as THREE.MeshPhysicalMaterial).color.copy(c);
    }
  }

  // ─── layout ──────────────────────────────────────────────────────────────
  /** World point at screen NDC (x, y) on the plane z = zPlane. */
  private ndcToWorld(x: number, y: number, zPlane: number): THREE.Vector3 {
    const v = new THREE.Vector3(x, y, 0.5).unproject(this.camera);
    const dir = v.sub(this.camera.position).normalize();
    const t = (zPlane - this.camera.position.z) / dir.z;
    return this.camera.position.clone().addScaledVector(dir, t);
  }

  /**
   * Keep the scene clear of the HUD. `bottomPx`: the strip at the bottom reserved for the tutorial tip (0 = none), the
   * scene is framed above it. `hud`: the screen rects (canvas px) of the controls on top of the screen; where one would
   * overlap the toolboxes, the queue, the tray or the object, the frame starts just below it, and only by that much
   * (no overlap: the framing stays exactly as without insets).
   */
  setInsets(hud: Rect[], bottomPx: number, w: number, h: number): void {
    if (!h) return;
    this.insetBottom = Math.max(0, Math.min(0.4, bottomPx / h));
    this.insetTop = 0;
    this.layout(w / h);
    const gap = 6;
    for (let i = 0; i < 6; i++) {
      let need = 0;
      for (const b of this.frameRects(w, h)) for (const r of hud) if (overlaps(r, b)) need = Math.max(need, r.y1 + gap - b.y0);
      if (need <= 0.5 || this.insetTop + this.insetBottom > 0.6) break;
      this.insetTop += need / h;
      this.layout(w / h);
    }
  }

  /** Screen rect (canvas px) of an object's bounding box. */
  private rectOf(kind: string, o: THREE.Object3D, w: number, h: number): Rect | null {
    const b = new THREE.Box3().setFromObject(o);
    if (b.isEmpty()) return null;
    const v = new THREE.Vector3();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(this.camera);
      const x = ((v.x + 1) / 2) * w;
      const y = ((1 - v.y) / 2) * h;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return { kind, x0, y0, x1, y1 };
  }

  /** The big parts of the board: toolboxes, queue, tray and the object (with its planks, screws and the pet). */
  private frameRects(w: number, h: number): Rect[] {
    this.scene.updateMatrixWorld();
    const parts: [string, THREE.Object3D][] = [['object', this.object], ['tray', this.trayG]];
    for (const b of this.boxes) if (!b.leaving) parts.push([`toolbox ${b.index}`, b.g]);
    if (this.queueG.children.length) parts.push(['queue', this.queueG]);
    return parts.map(([k, o]) => this.rectOf(k, o, w, h)).filter((r): r is Rect => r !== null);
  }

  layout(screenAspect: number): void {
    const cam = this.camera;
    // framed as if the screen were only the part between the insets (setViewOffset below extends the picture over them)
    const span = 1 - this.insetTop - this.insetBottom;
    const aspect = screenAspect / span;
    cam.clearViewOffset();
    cam.aspect = aspect;
    const portrait = screenAspect < 1;
    cam.fov = portrait ? 38 : 32;
    cam.updateProjectionMatrix();
    const tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    // portrait: the object fills the width; landscape: it fills ~56% of the height
    const objW = OPEN_W + 1.0;
    const objH = OPEN_H + 1.3;
    // portrait: toolboxes and tray stacked above the object; landscape: toolboxes left, tray right
    let halfH: number;
    let objNdcY: number;
    if (portrait) {
      halfH = Math.max(objW / 2 / 0.94 / aspect, objH / 2 / 0.48);
      // tall phones: the width limits the object, so lift it towards the tray
      objNdcY = aspect < 0.62 ? -0.2 : -0.32;
    } else {
      halfH = objH / 2 / 0.56;
      objNdcY = -0.36;
    }
    const D = halfH / tanH + 0.4;
    const tilt = THREE.MathUtils.degToRad(7);
    const target = new THREE.Vector3(0, -objNdcY * halfH * 0.95, 0);
    cam.position.set(Math.sin(this.orbit) * D, target.y + Math.tan(tilt) * D, Math.cos(this.orbit) * D);
    cam.lookAt(target);
    cam.updateMatrixWorld();
    this.camHome = { pos: cam.position.clone(), target: target.clone(), portrait };
    const zPlane = 1.0;
    const n = this.puzzle.def.open;
    const left = this.ndcToWorld(-1, 0, zPlane);
    const right = this.ndcToWorld(1, 0, zPlane);
    const worldW = right.x - left.x;
    this.boxAnchor = [];
    const trayN = Math.max(this.puzzle.def.tray, 6) * 0.72 + 0.3;
    if (portrait) {
      for (let i = 0; i < n; i++) this.boxAnchor.push(this.ndcToWorld(n === 1 ? 0 : -0.46 + (0.92 * i) / (n - 1), 0.62, zPlane));
      this.boxScale = Math.min(1, (worldW * 0.34) / 1.5);
      this.trayAnchor = this.ndcToWorld(0, 0.43, zPlane);
      this.trayG.scale.setScalar(Math.min(1, (worldW * 0.8) / trayN));
      this.queueG.position.copy(this.ndcToWorld(0, 0.335, zPlane));
    } else {
      for (let i = 0; i < n; i++) this.boxAnchor.push(this.ndcToWorld(n === 1 ? 0 : -0.2 + (0.4 * i) / (n - 1), 0.66, zPlane));
      this.boxScale = Math.min(1.1, (worldW * 0.15) / 1.5);
      this.trayAnchor = this.ndcToWorld(0, 0.43, zPlane);
      this.trayG.scale.setScalar(Math.min(1, (worldW * 0.34) / trayN));
      this.queueG.position.copy(this.ndcToWorld(0.36, 0.66, zPlane));
    }
    this.trayG.position.copy(this.trayAnchor);
    this.trayG.rotation.order = 'YXZ';
    this.trayG.rotation.x = 0.35;
    this.queueG.scale.setScalar(this.boxScale * 0.8);
    for (const b of this.boxes) if (!b.leaving) this.placeBox(b, b.g.userData.offset ?? 0);
    this.layoutAspect = screenAspect;
    // the screen shows the framed picture between the insets (room / floor continue above and below it)
    if (span < 1) cam.setViewOffset(1000 * aspect, 1000, 0, (-1000 * this.insetTop) / span, 1000 * aspect, 1000 / span);
    cam.updateMatrixWorld();
  }

  /**
   * Screen rectangles (CSS px in a w×h canvas) of everything a player must see or tap: each screw still on the board,
   * each plank still up, the pet, the open toolboxes, the tray and the queue. For layout tests (tooling builds).
   */
  screenRects(w: number, h: number): Rect[] {
    this.scene.updateMatrixWorld();
    const out: Rect[] = [];
    const rect = (kind: string, o: THREE.Object3D) => {
      const r = this.rectOf(kind, o, w, h);
      if (r) out.push(r);
    };
    for (const s of this.screws) {
      if (this.puzzle.removed[s.id] || s.flying) continue;
      const c = this.screenOf(s.id, w, h);
      out.push({ kind: `screw ${s.id}`, x0: c.x - c.r, y0: c.y - c.r, x1: c.x + c.r, y1: c.y + c.r });
    }
    this.planks.forEach((p, i) => {
      if (p.visible && !this.puzzle.plankGone[i]) rect(`plank ${i}`, p);
    });
    rect('pet', this.petRoot);
    for (const b of this.boxes) if (!b.leaving) rect(`toolbox ${b.index}`, b.g);
    rect('tray', this.trayG);
    if (this.queueG.children.length) rect('queue', this.queueG);
    return out;
  }

  setOrbit(a: number): void {
    this.orbit = a;
    this.layout(this.layoutAspect || 1);
    // toolboxes and tray stay facing the player while the crate turns
    this.trayG.rotation.y = a;
    this.queueG.rotation.y = a;
    for (const b of this.boxes) b.g.rotation.y = a;
  }

  /** Free the GPU resources of this level (a new view is built for each level / undo). */
  dispose(): void {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) mat?.dispose();
    });
  }

  // ─── picking ─────────────────────────────────────────────────────────────
  screenOf(id: number, w: number, h: number): { x: number; y: number; r: number } {
    const s = this.screws[id];
    const p = new THREE.Vector3();
    s.head.getWorldPosition(p);
    const q = p.clone().add(new THREE.Vector3(SCREW_R, 0, 0)).project(this.camera);
    p.project(this.camera);
    const x = ((p.x + 1) / 2) * w;
    const y = ((1 - p.y) / 2) * h;
    const r = Math.abs(((q.x + 1) / 2) * w - x);
    return { x, y, r };
  }

  /** Free screw under a screen point (generous hit area: at least 26 px radius, i.e. a 52 px target). */
  pick(px: number, py: number, w: number, h: number): number {
    let best = -1;
    let bestD = Infinity;
    for (const s of this.screws) {
      if (!this.puzzle.isFree(s.id) || s.flying) continue;
      const sc = this.screenOf(s.id, w, h);
      const d = Math.hypot(px - sc.x, py - sc.y);
      if (d <= Math.max(26, sc.r * 1.4) && d < bestD) {
        best = s.id;
        bestD = d;
      }
    }
    return best;
  }

  // ─── events → animations ─────────────────────────────────────────────────
  private tween(delay: number, dur: number, fn: (k: number) => void, done?: () => void): void {
    this.tweens.push({ t0: this.now + delay, dur, fn, done });
  }

  private boxSlotWorld(b: BoxView, slot: number): THREE.Vector3 {
    const p = new THREE.Vector3(-0.42 + slot * 0.42, 0.5, 0.06);
    return b.g.localToWorld(p);
  }

  private traySlotWorld(slot: number): THREE.Vector3 {
    return this.trayG.localToWorld(this.traySlots[slot].clone().add(new THREE.Vector3(0, 0.12, 0)));
  }

  /** Fly a screw (detached from the object) to a target that may move. */
  private fly(s: ScrewView, delay: number, target: () => THREE.Vector3, upright: number, onLand: () => void): void {
    s.flying = true;
    const start = new THREE.Vector3();
    const startQ = new THREE.Quaternion();
    // 1) unscrew: spin out of the plank
    const spinT = delay === 0 ? 0.32 : 0;
    if (spinT) {
      const z0 = s.g.position.z;
      const r0 = s.g.rotation.z;
      this.tween(0, spinT, (k) => {
        s.g.position.z = z0 + ease(k) * 0.5;
        s.g.rotation.z = r0 + k * Math.PI * 5;
      });
    }
    // 2) fly on an arc
    this.tween(Math.max(spinT, delay), 0.5, (k) => {
      if (start.lengthSq() === 0) {
        s.g.getWorldPosition(start);
        s.g.getWorldQuaternion(startQ);
        this.scene.attach(s.g);
        start.copy(s.g.position);
      }
      const end = target();
      const e = easeInOut(k);
      const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 1.2, 0.6));
      const a = start.clone().lerp(mid, e);
      const b = mid.clone().lerp(end, e);
      s.g.position.copy(a.lerp(b, e));
      const endQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-upright, 0, k * Math.PI * 2));
      s.g.quaternion.copy(startQ).slerp(endQ, e);
      s.g.scale.setScalar(1 - 0.12 * e);
    }, () => {
      s.g.position.copy(target());
      onLand();
    });
  }

  apply(events: PuzzleEvent[]): void {
    const unscrewed = events.find((e) => e.type === 'toBox' || e.type === 'toTray');
    if (unscrewed) this.onSound('unscrew');
    for (const e of events) {
      switch (e.type) {
        case 'toBox': {
          const s = this.screws[e.screw];
          const b = this.boxes.find((x) => x.uid === e.uid)!;
          const wait = Math.max(0, b.readyAt - this.now - 0.5);
          this.fly(s, wait, () => this.boxSlotWorld(b, e.slot), 0.45, () => {
            this.onSound('land');
            b.g.attach(s.g);
            this.landedInBox(b);
          });
          break;
        }
        case 'toTray': {
          const s = this.screws[e.screw];
          this.fly(s, 0, () => this.traySlotWorld(e.slot), 0.5, () => {
            this.onSound('tray');
            this.trayG.attach(s.g);
          });
          break;
        }
        case 'trayToBox': {
          const s = this.screws[e.screw];
          const b = this.boxes.find((x) => x.uid === e.uid)!;
          const wait = Math.max(0.55, b.readyAt - this.now);
          this.fly(s, wait, () => this.boxSlotWorld(b, e.slot), 0.45, () => {
            this.onSound('land');
            b.g.attach(s.g);
            this.landedInBox(b);
          });
          break;
        }
        case 'boxFull': {
          const b = this.boxes.find((x) => x.uid === e.uid);
          if (b) b.full = true;
          break;
        }
        case 'boxOpen': {
          // the new box slides in once the full one at this index has left
          const prev = this.boxes.filter((x) => x.index === e.box && x.uid !== e.uid);
          const leaveAt = prev.length ? Math.max(...prev.map((p) => p.readyAt)) + 1.05 : this.now;
          this.addBox(e.uid, e.color, e.box, Math.max(0, leaveAt - this.now), true);
          this.refreshQueue();
          break;
        }
        case 'plankFall':
          this.tween(0.3, 0.01, () => undefined, () => {
            this.dropPlank(e.plank);
            // a short shake of the whole object as the plank lets go
            this.tween(0, 0.25, (k) => (this.object.position.x = Math.sin(k * Math.PI * 6) * 0.035 * (1 - k)));
          });
          break;
        case 'won':
          this.tween(1.0, 0.01, () => undefined, () => this.rescue());
          break;
        case 'traySlot':
          this.buildTray(e.slots);
          this.onSound('pop');
          break;
        case 'hammer':
          this.smash(e.plank, e.screws);
          break;
        case 'ghostToBox': {
          const b = this.boxes.find((x) => x.uid === e.uid);
          if (!b) break;
          const g = this.ghostScrew(e.color);
          this.scene.add(g);
          const from = this.planks.length ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3();
          g.position.copy(from);
          const wait = Math.max(0.35, b.readyAt - this.now);
          this.tween(wait, 0.45, (k) => {
            const end = this.boxSlotWorld(b, e.slot);
            g.position.lerpVectors(from, end, easeInOut(k));
            g.position.y += Math.sin(k * Math.PI) * 1.0;
            g.rotation.set(-0.45 * k, 0, k * Math.PI * 2);
          }, () => {
            b.g.attach(g);
            g.position.copy(b.g.worldToLocal(this.boxSlotWorld(b, e.slot)));
            this.onSound('land');
            this.landedInBox(b);
          });
          break;
        }
        case 'ice': {
          const sv = this.screws[e.screw];
          if (sv.ice) this.shatter(sv.ice);
          sv.ice = undefined;
          break;
        }
        case 'reveal': {
          const sv = this.screws[e.screw];
          this.onSound('pop');
          this.tween(0.35, 0.35, (k) => (sv.head.scale.x = Math.abs(Math.cos(k * Math.PI))));
          break;
        }
        case 'unlock': {
          const g = this.planks[e.plank];
          const pl = g.userData.padlock as THREE.Group | undefined;
          g.userData.padlock = undefined;
          this.onSound('unlock');
          // the padlock pops and the chain around the plank drops away
          for (const c of g.children.slice()) if ((c as THREE.Mesh).geometry?.type === 'TorusGeometry') this.tween(0.15, 0.4, (k) => (c.position.y = -k * 1.5), () => c.removeFromParent());
          if (pl) this.tween(0.2, 0.5, (k) => {
            pl.position.z = k * 0.6;
            pl.scale.setScalar(1 + k * 0.6);
            ((pl.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1 - k;
          }, () => pl.removeFromParent());
          break;
        }
        case 'sticky': {
          const goo = this.planks[e.plank].userData.goo as THREE.Mesh | undefined;
          this.onSound('warn');
          if (goo) this.tween(0, 0.6, (k) => ((goo.material as THREE.MeshPhysicalMaterial).emissive ?? new THREE.Color()).setHex(0x6a3a00).multiplyScalar(Math.sin(k * Math.PI)));
          break;
        }
        case 'lost':
          if (e.reason === 'bomb' && e.screw !== undefined) {
            this.explode(this.puzzle.screws[e.screw].plank);
            break;
          }
          this.onSound('fail');
          this.tween(0, 0.5, (k) => {
            this.trayG.rotation.z = Math.sin(k * Math.PI * 6) * 0.06 * (1 - k);
          });
          break;
      }
    }
    this.refreshDim();
    this.refreshBombs();
    this.refreshTray();
  }

  /** Tray feedback: the free slots turn orange with one slot left (the next wrong screw fails), red pulse + sound. */
  private refreshTray(): void {
    const left = this.puzzle.trayFree();
    const warn = left === 1 && this.puzzle.status === 'play';
    if (warn && !this.trayWarn) this.onSound('warn');
    this.trayWarn = warn;
    this.puzzle.tray.forEach((sid, i) => {
      const h = this.trayHoles[i];
      if (!h) return;
      (h.material as THREE.MeshBasicMaterial).color.setHex(warn && sid === null ? 0xff8a2a : h.userData.base);
    });
  }

  /** Ice breaks into shards that tumble to the floor. */
  private shatter(ice: THREE.Group): void {
    this.onSound('ice');
    const p = new THREE.Vector3();
    ice.getWorldPosition(p);
    ice.removeFromParent();
    for (let i = 0; i < 7; i++) {
      const shard = mesh(new THREE.TetrahedronGeometry(0.07 + Math.random() * 0.05), new THREE.MeshPhysicalMaterial({ color: 0xdff4ff, roughness: 0.1, transparent: true, opacity: 0.8 }), false, false);
      shard.userData.noAO = true;
      shard.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 0.1));
      this.scene.add(shard);
      const a = (i / 7) * Math.PI * 2;
      this.falling.push({ m: shard, v: new THREE.Vector3(Math.cos(a) * 1.6, 1.5 + Math.sin(a), 1.2), w: new THREE.Vector3(6, 4, 5), t: 0.4, bounced: 0 });
    }
  }

  /** Bomb ran out: flash, smoke, and the plank is blown off. */
  private explode(plank: number): void {
    this.onSound('boom');
    const g = this.planks[plank];
    const p = new THREE.Vector3();
    g.getWorldPosition(p);
    const flash = glowSprite(0xffd27a, 3.2, 1);
    flash.position.copy(p).add(new THREE.Vector3(0, 0, 0.5));
    this.scene.add(flash);
    this.tween(0, 0.5, (k) => {
      flash.scale.setScalar(1 + k * 3);
      flash.material.opacity = 1 - k;
    }, () => flash.removeFromParent());
    this.dust(p);
    this.dust(p.clone().add(new THREE.Vector3(0.4, 0.3, 0)));
    this.tween(0, 0.6, (k) => {
      this.object.position.x = Math.sin(k * Math.PI * 10) * 0.08 * (1 - k);
    });
  }

  /** Hammer booster: a big toy hammer bonks the plank; its screws pop off with sparkles. */
  private smash(plank: number, screws: number[]): void {
    const g = this.planks[plank];
    const target = new THREE.Vector3();
    g.getWorldPosition(target);
    const hammer = group();
    const handle = mesh(cyl(0.07, 0.07, 1.4, 12), paint(0xc9874f, 0.6, 0.2));
    handle.position.y = -0.7;
    const headM = mesh(rbox(0.9, 0.45, 0.45, 0.12), paint(0xf0464b, 0.4, 0.5));
    hammer.add(handle, headM);
    hammer.position.copy(target).add(new THREE.Vector3(0.9, 1.9, 0.9));
    this.scene.add(hammer);
    this.onSound('unscrew');
    this.tween(0, 0.3, (k) => {
      hammer.rotation.z = 1.2 - ease(k) * 2.2;
      hammer.position.copy(target).add(new THREE.Vector3(0.9 - k * 0.6, 1.9 - k * 1.3, 0.9));
    }, () => {
      this.onSound('thud');
      this.dust(target);
      for (const sid of screws) {
        const s = this.screws[sid];
        s.flying = true;
        const p0 = new THREE.Vector3();
        s.g.getWorldPosition(p0);
        this.scene.attach(s.g);
        const v = new THREE.Vector3((Math.random() - 0.5) * 3, 2.5 + Math.random(), 1.5);
        this.tween(0, 0.5, (k) => {
          s.g.position.copy(p0).addScaledVector(v, k).add(new THREE.Vector3(0, -6 * k * k, 0));
          s.g.rotation.z += 0.3;
          s.g.scale.setScalar(1 - k);
        }, () => (s.g.visible = false));
      }
    });
    this.tween(0.45, 0.3, (k) => hammer.scale.setScalar(1 - k), () => hammer.removeFromParent());
  }

  // ─── hints ───────────────────────────────────────────────────────────────
  private hintRing: THREE.Mesh | null = null;
  /** Pulsing ring around the next safe screw (-1 clears it). */
  highlight(id: number): void {
    if (this.hintRing) {
      this.hintRing.removeFromParent();
      this.hintRing = null;
    }
    if (id < 0) return;
    const ring = mesh(new THREE.RingGeometry(SCREW_R * 1.15, SCREW_R * 1.55, 40), new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false }), false, false);
    ring.position.z = 0.12;
    ring.userData.noAO = true;
    this.screws[id].g.add(ring);
    this.hintRing = ring;
  }

  /** Plank under a screen point (hammer booster), or -1. */
  pickPlank(px: number, py: number, w: number, h: number): number {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((px / w) * 2 - 1, -(py / h) * 2 + 1), this.camera);
    const live = this.planks.map((g, i) => ({ g, i })).filter(({ i }) => !this.puzzle.plankGone[i]);
    const hits = ray.intersectObjects(live.map((x) => x.g), true);
    if (!hits.length) return -1;
    let o: THREE.Object3D | null = hits[0].object;
    while (o && !this.planks.includes(o as THREE.Group)) o = o.parent;
    return o ? this.planks.indexOf(o as THREE.Group) : -1;
  }

  private landedInBox(b: BoxView): void {
    b.landed++;
    const s0 = this.boxScale;
    this.tween(0, 0.18, (k) => b.g.scale.set(s0 * (1 + 0.08 * Math.sin(k * Math.PI)), s0 * (1 - 0.08 * Math.sin(k * Math.PI)), s0));
    if (b.landed >= BOX_SIZE) {
      b.leaving = true;
      b.readyAt = this.now;
      // lid closes, a little hop, slides away
      this.tween(0.1, 0.22, (k) => (b.lid.rotation.x = -2.5 * (1 - ease(k))), () => this.onSound('close'));
      this.tween(0.36, 0.2, (k) => (b.g.position.y = this.boxAnchor[b.index].y + Math.sin(k * Math.PI) * 0.25));
      this.tween(0.6, 0.4, (k) => this.placeBox(b, easeInOut(k)), () => {
        b.g.removeFromParent();
        this.boxes = this.boxes.filter((x) => x !== b);
        if (!this.puzzle.boxes[b.index] && !this.boxes.some((x) => x.index === b.index)) this.addDoneBox(b.index);
      });
      // sparkle
      const sp = sparkle(0xffffff, 0.6);
      sp.position.copy(b.g.position).add(new THREE.Vector3(0.5, 0.5, 0.4));
      this.scene.add(sp);
      this.tween(0.1, 0.5, (k) => sp.scale.setScalar(0.9 * Math.sin(k * Math.PI)), () => sp.removeFromParent());
    }
  }

  private dropPlank(id: number): void {
    const g = this.planks[id];
    this.onSound('plank');
    for (const c of this.chains) {
      if (!c.planks.includes(id) || !c.g.parent || c.g.parent === this.scene) continue;
      this.scene.attach(c.g);
      this.falling.push({ m: c.g, v: new THREE.Vector3(0, 0.8, 0.9), w: new THREE.Vector3(0.6, 0.4, 1.2), t: 0, bounced: 0 });
    }
    this.scene.attach(g);
    const side = g.position.x < -0.05 ? -1 : g.position.x > 0.05 ? 1 : id % 2 ? 1 : -1;
    this.falling.push({ m: g, v: new THREE.Vector3(side * (2.2 + (id % 3) * 0.4), 1.4, 0.7), w: new THREE.Vector3(1.2, side * 1.5, side * 2.6), t: 0, bounced: 0 });
    this.refreshDim(true);
  }

  private dust(p: THREE.Vector3): void {
    for (let i = 0; i < 6; i++) {
      const s = glowSprite(0xfff1dc, 0.5, 0.55);
      s.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.1, (Math.random() - 0.5) * 0.6));
      this.scene.add(s);
      const v = new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8);
      const p0 = s.position.clone();
      this.tween(0, 0.7, (k) => {
        s.position.copy(p0).addScaledVector(v, k);
        s.scale.setScalar(0.4 + k * 0.8);
        s.material.opacity = 0.55 * (1 - k);
      }, () => s.removeFromParent());
    }
  }

  /** The pet jumps out towards the camera and celebrates; the empty crate poofs away. */
  private rescue(): void {
    this.rescued = this.now;
    this.onSound('rescue');
    this.scene.attach(this.petRoot);
    const p0 = this.petRoot.position.clone();
    const p1 = new THREE.Vector3(0, FLOOR_Y + 0.02, 1.7);
    const s0 = this.petRoot.scale.x;
    this.tween(0, 0.75, (k) => {
      this.petRoot.position.lerpVectors(p0, p1, k);
      this.petRoot.position.y = p0.y + (p1.y - p0.y) * k + Math.sin(k * Math.PI) * 1.9;
      this.petRoot.rotation.y = k * Math.PI * 2;
      this.petRoot.scale.setScalar(s0 * (1 + 0.1 * k));
    }, () => this.onSound('pop'));
    // the crate shrinks away with a puff, so no empty dark box is left behind
    const o = this.object;
    this.tween(0.85, 0.4, (k) => {
      const e = k < 0.3 ? 1 + k * 0.4 : 1.12 * (1 - (k - 0.3) / 0.7);
      o.scale.setScalar(Math.max(0.001, e));
    }, () => {
      o.visible = false;
      this.onSound('pop');
    });
    this.tween(1.05, 0.01, () => undefined, () => {
      this.dust(new THREE.Vector3(0, FLOOR_Y + 0.4, 0));
      this.dust(new THREE.Vector3(-1, FLOOR_Y + 1.2, 0));
      this.dust(new THREE.Vector3(1, FLOOR_Y + 1.2, 0));
      for (let i = 0; i < 6; i++) {
        const sp = sparkle(0xfff3c4, 0.8);
        sp.position.set((i - 2.5) * 0.6, FLOOR_Y + 1 + (i % 2) * 0.8, 0.2);
        this.scene.add(sp);
        this.tween(i * 0.04, 0.5, (k) => sp.scale.setScalar(1.1 * Math.sin(k * Math.PI)), () => sp.removeFromParent());
      }
    });
    // confetti
    const N = 140;
    const geo = new THREE.PlaneGeometry(0.12, 0.2);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    const im = new THREE.InstancedMesh(geo, mat, N);
    const cols = Object.values(SCREW_HEX);
    this.confettiState = [];
    for (let i = 0; i < N; i++) {
      im.setColorAt(i, new THREE.Color(cols[i % cols.length]));
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 4;
      this.confettiState.push({
        p: new THREE.Vector3(0, 0.2, 2.0),
        v: new THREE.Vector3(Math.cos(a) * sp * 0.6, 5 + Math.random() * 4, Math.sin(a) * sp * 0.4 + 1),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0),
        w: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
      });
    }
    im.userData.noAO = true;
    this.scene.add(im);
    this.confetti = im;
    this.confettiT = 0;
    for (let i = 0; i < 5; i++) {
      const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTexture(), transparent: true, depthWrite: false }));
      h.userData.noAO = true;
      this.scene.add(h);
      this.hearts.push(h);
    }
  }

  /** Cover art: no tray, and the two other pets cheering beside the object. */
  private extras: Actor[] = [];
  coverExtras(): void {
    this.trayG.visible = false;
    this.queueG.visible = false;
    // portrait / square covers: the logo takes the top, so the toolboxes stay out of the shot
    if ((this.layoutAspect || 1) <= 1.3) for (const b of this.boxes) b.g.visible = false;
    const others = (['dog', 'cat', 'hamster'] as const).filter((k) => k !== this.puzzle.def.pet);
    others.forEach((k, i) => {
      const a = makePet(k);
      characterLook(a.root, 0xffffff, 0.35, true);
      // landscape: beside the object; portrait / square covers: tucked in front of its corners
      const wide = (this.layoutAspect || 1) > 1.3;
      a.root.scale.setScalar((k === 'hamster' ? 1.75 : 1.3) * (wide ? 1 : 0.9));
      const sx = i === 0 ? -1 : 1;
      a.root.position.set(sx * (wide ? 2.7 : 1.45), FLOOR_Y + 0.04, wide ? 1.9 : 2.15);
      a.root.rotation.y = -sx * 0.45;
      this.scene.add(a.root);
      this.extras.push(a);
    });
  }

  get rescueTime(): number {
    return this.rescued < 0 ? -1 : this.now - this.rescued;
  }

  // ─── frame ───────────────────────────────────────────────────────────────
  update(dt: number): void {
    this.now += dt;
    const t = this.now;
    // one slot left: the free slot pulses between orange and red
    if (this.trayWarn) {
      const k = 0.5 + 0.5 * Math.sin(t * 9);
      this.puzzle.tray.forEach((sid, i) => {
        if (sid === null && this.trayHoles[i]) (this.trayHoles[i].material as THREE.MeshBasicMaterial).color.setHex(0xff8a2a).lerp(new THREE.Color(0xff2a2a), k);
      });
    }
    for (const tw of this.tweens.slice()) {
      if (t < tw.t0) continue;
      const k = Math.min(1, (t - tw.t0) / tw.dur);
      tw.fn(k);
      if (k >= 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.done?.();
      }
    }
    // falling planks
    for (const f of this.falling.slice()) {
      f.t += dt;
      f.v.y -= 16 * dt;
      f.m.position.addScaledVector(f.v, dt);
      f.m.rotation.x += f.w.x * dt;
      f.m.rotation.y += f.w.y * dt;
      f.m.rotation.z += f.w.z * dt;
      if (f.m.position.y < FLOOR_Y + 0.12 && f.v.y < 0) {
        f.m.position.y = FLOOR_Y + 0.12;
        if (f.bounced === 0) {
          this.dust(f.m.position);
          this.onSound('thud');
        }
        f.bounced++;
        f.v.y = -f.v.y * 0.35;
        f.v.x *= 0.6;
        f.v.z *= 0.6;
        f.w.multiplyScalar(0.4);
      }
      if (f.t > 1.0) {
        const k = Math.min(1, (f.t - 1.0) / 0.35);
        f.m.scale.setScalar(1 - k);
        if (k >= 1) {
          f.m.removeFromParent();
          this.falling.splice(this.falling.indexOf(f), 1);
        }
      }
    }
    // free screws breathe a little (they are the ones you can tap)
    for (const s of this.screws) {
      if (s.flying) continue;
      const free = this.puzzle.isFree(s.id);
      s.g.scale.setScalar(free ? 1 + 0.035 * Math.sin(t * 4 + s.id) : 1);
    }
    // pet
    this.pet.update(t);
    this.extras.forEach((a, i) => {
      a.update(t + i);
      a.root.position.y = FLOOR_Y + 0.04 + Math.abs(Math.sin(t * 3 + i * 1.7)) * 0.18;
    });
    if (this.rescued >= 0) {
      const rt = t - this.rescued;
      if (rt > 0.75) {
        const h = Math.abs(Math.sin((rt - 0.75) * 5.5));
        this.petRoot.position.y = FLOOR_Y + 0.02 + h * 0.45;
        this.petRoot.rotation.y = Math.sin((rt - 0.75) * 2.75) * 0.5;
      }
      this.hearts.forEach((h, i) => {
        const p = ((rt * 0.5 + i / 5) % 1);
        h.position.set(this.petRoot.position.x + Math.sin(i * 2 + rt) * 0.8, this.petRoot.position.y + 1.4 + p * 1.6, this.petRoot.position.z);
        const s = 0.35 * Math.sin(p * Math.PI);
        h.scale.set(s, s, 1);
      });
    }
    // after the jump the camera glides in and frames the pet in the upper half (the result card goes below)
    if (this.rescued >= 0 && this.camHome) {
      const k = easeInOut(Math.min(1, Math.max(0, (t - this.rescued - 0.8) / 0.9)));
      const pet = this.petRoot.position.clone();
      pet.y = FLOOR_Y;
      const h = this.camHome;
      const lookAt = pet.clone().add(new THREE.Vector3(0, h.portrait ? -0.9 : 0.3, 0));
      // distance from the visible half-width we want around the pet (~2.6 units), whatever the screen shape
      const tanH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      const d = h.portrait ? 2.6 / (tanH * this.camera.aspect) : 9;
      const pos = pet.clone().add(new THREE.Vector3(0, d * 0.3, d));
      const tg = h.target.clone().lerp(lookAt, k);
      this.camera.position.copy(h.pos).lerp(pos, k);
      this.camera.lookAt(tg);
    }
    if (this.confetti) {
      this.confettiT += dt;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      this.confettiState.forEach((c, i) => {
        c.v.y -= 9 * dt;
        c.v.multiplyScalar(1 - dt * 0.8);
        c.p.addScaledVector(c.v, dt);
        c.r.x += c.w.x * dt;
        c.r.y += c.w.y * dt;
        if (c.p.y < FLOOR_Y + 0.02) {
          c.p.y = FLOOR_Y + 0.02;
          c.v.set(0, 0, 0);
        }
        q.setFromEuler(c.r);
        m.compose(c.p, q, new THREE.Vector3(1, 1, 1));
        this.confetti!.setMatrixAt(i, m);
      });
      this.confetti.instanceMatrix.needsUpdate = true;
    }
  }

  /** True while screws are still flying / boxes moving (the controller waits before showing results). */
  busy(): boolean {
    return this.tweens.length > 0 || this.falling.length > 0;
  }
}

let heartTex: THREE.CanvasTexture | null = null;
function heartTexture(): THREE.CanvasTexture {
  if (heartTex) return heartTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ff5f8f';
  g.strokeStyle = '#3b2346';
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(64, 110);
  g.bezierCurveTo(-10, 60, 20, 0, 64, 36);
  g.bezierCurveTo(108, 0, 138, 60, 64, 110);
  g.fill();
  g.stroke();
  heartTex = new THREE.CanvasTexture(c);
  heartTex.colorSpace = THREE.SRGBColorSpace;
  return heartTex;
}


/** Plank outlines beyond the rounded box: 4 = a stick with round ends, 5 = a board with cut corners. Centred, depth PLANK_D. */
function shapedPlank(len: number, w: number, style: PlankStyle): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  const hl = len / 2;
  const hw = w / 2;
  const bevel = 0.025;
  if (style === 4) {
    const r = hw - bevel;
    sh.moveTo(-hl + hw, -r);
    sh.lineTo(hl - hw, -r);
    sh.absarc(hl - hw, 0, r, -Math.PI / 2, Math.PI / 2, false);
    sh.lineTo(-hl + hw, r);
    sh.absarc(-hl + hw, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
  } else {
    const c = Math.min(hw * 0.7, 0.22);
    const y = hw - bevel;
    const x = hl - bevel;
    sh.moveTo(-x + c, -y);
    sh.lineTo(x - c, -y);
    sh.lineTo(x, -y + c);
    sh.lineTo(x, y - c);
    sh.lineTo(x - c, y);
    sh.lineTo(-x + c, y);
    sh.lineTo(-x, y - c);
    sh.lineTo(-x, -y + c);
    sh.closePath();
  }
  const depth = PLANK_D - bevel * 2;
  const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 24 });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}
