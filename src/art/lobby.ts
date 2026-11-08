import * as THREE from 'three';
import { PAL } from './palette';
import { type Actor, at, group, matte, mesh, paint, rbox, shadows, sph, puck, fur } from './kit';
import { glowSprite, windowShaft } from './fx';
import { makeCat, makeDog, makeHamster } from './pets';
import { makePorter, type Porter } from './porter';
import {
  makeBell, makeBench, makeBone, makeClock, makeDesk, makeDeskLamp, makeExitDoor, makeExitSign, makeFence, makeFloorLamp, makeFrame,
  makeArmchair, makeGuestBook, makeKennel, makeKey, makeKeyBoard, makePlant, makeSconce, makeShelf, makeTube, makeWindow, makeYarn,
} from './props';
import { dirtTexture, floorTextures, pawTrailTexture, rugTexture, skyTexture, wallpaperTexture } from './textures';

/**
 * The showcase room: the hotel reception lobby at night, as a cut-away diorama.
 * Room interior: x ∈ [-5, 5], z ∈ [-7, 7], walls on the back (z = -7) and left (x = -5).
 */
export const ROOM = { x0: -5, x1: 5, z0: -7, z1: 7, wallH: 4.6, wallT: 0.3 } as const;

const WIN_W = 1.6;
const WIN_H = 2.0;
const WIN_Y = 2.45; // centre
const WINDOWS = [-3.1, 0.1];
const DOOR = { x: 3.7, w: 1.4, h: 2.6 };

export interface Lobby {
  root: THREE.Group;
  pets: { dog: Actor; cat: Actor; hamster: Actor };
  porter: Porter;
  actors: Actor[];
  /** Keep the moon framed in the left window whatever the camera does. */
  pinMoon(camera: THREE.Camera): void;
  update(t: number): void;
  moonLight: THREE.DirectionalLight;
}

export interface LobbyOptions {
  /** Which pets to place in the room (the title shot stages them itself). */
  pets?: boolean;
  porter?: boolean;
  bones?: boolean;
}

function wallMaterials(): THREE.Material[] {
  const wp = wallpaperTexture();
  wp.repeat.set(0.55, 0.55);
  return [
    new THREE.MeshStandardMaterial({ map: wp, roughness: 0.92 }),
    paint(PAL.trim, 0.6, 0.2),
  ];
}

export function buildLobby(opt: LobbyOptions = {}): Lobby {
  const root = group();
  const actors: Actor[] = [];
  const { x0, x1, z0, z1, wallH, wallT } = ROOM;

  // ── floor slab (diorama base) + planks ──
  const slab = mesh(rbox(x1 - x0 + 0.7, 0.7, z1 - z0 + 0.7, 0.12), paint(PAL.baseWood, 0.6, 0.3));
  at(slab, (x0 + x1) / 2 - 0.05, -0.36, (z0 + z1) / 2 - 0.05);
  root.add(slab);
  const trimBand = mesh(rbox(x1 - x0 + 0.76, 0.12, z1 - z0 + 0.76, 0.05), paint(PAL.gold, 0.4, 0.5));
  at(trimBand, (x0 + x1) / 2 - 0.05, -0.5, (z0 + z1) / 2 - 0.05);
  root.add(trimBand);
  const { map: fm, bump: fb } = floorTextures();
  fm.repeat.set((x1 - x0 + 0.3) / 4, (z1 - z0 + 0.3) / 4);
  fb.repeat.copy(fm.repeat);
  const planks = mesh(new THREE.PlaneGeometry(x1 - x0 + 0.3, z1 - z0 + 0.3), new THREE.MeshStandardMaterial({ map: fm, bumpMap: fb, bumpScale: 1.5, roughness: 0.62 }), false, true);
  at(planks, (x0 + x1) / 2 - 0.15 + 0.15, 0.002, (z0 + z1) / 2, -Math.PI / 2, 0, 0);
  planks.position.set((x0 + x1) / 2 + 0.15 - 0.15, 0.002, (z0 + z1) / 2 + 0.15 - 0.15);
  root.add(planks);
  // soft contact shadow under the whole diorama
  const under = mesh(new THREE.CircleGeometry(12, 64), new THREE.MeshBasicMaterial({ map: radialShadow(), transparent: true, depthWrite: false }), false, false);
  at(under, 0, -0.62, 0, -Math.PI / 2, 0, 0);
  under.scale.set(1, 1.3, 1);
  under.userData.noAO = true;
  root.add(under);

  // ── back wall with window holes and the door notch ──
  const [wallM, edgeM] = wallMaterials();
  const back = new THREE.Shape();
  const bx0 = x0 - wallT;
  const bx1 = x1 + 0.0;
  const dl = DOOR.x - DOOR.w / 2;
  const dr = DOOR.x + DOOR.w / 2;
  back.moveTo(bx0, 0);
  back.lineTo(dl, 0);
  back.lineTo(dl, DOOR.h);
  back.lineTo(dr, DOOR.h);
  back.lineTo(dr, 0);
  back.lineTo(bx1, 0);
  back.lineTo(bx1, wallH);
  back.lineTo(bx0, wallH);
  back.closePath();
  for (const wx of WINDOWS) {
    const h = new THREE.Path();
    h.moveTo(wx - WIN_W / 2, WIN_Y - WIN_H / 2);
    h.lineTo(wx + WIN_W / 2, WIN_Y - WIN_H / 2);
    h.lineTo(wx + WIN_W / 2, WIN_Y + WIN_H / 2);
    h.lineTo(wx - WIN_W / 2, WIN_Y + WIN_H / 2);
    h.closePath();
    back.holes.push(h);
  }
  const backWall = mesh(new THREE.ExtrudeGeometry(back, { depth: wallT, bevelEnabled: false }), [wallM, edgeM]);
  backWall.position.z = z0 - wallT;
  root.add(backWall);

  // left wall
  const left = new THREE.Shape();
  left.moveTo(-(z1), 0);
  left.lineTo(-(z0 - wallT), 0);
  left.lineTo(-(z0 - wallT), wallH);
  left.lineTo(-z1, wallH);
  left.closePath();
  const leftWall = mesh(new THREE.ExtrudeGeometry(left, { depth: wallT, bevelEnabled: false }), [wallM, edgeM]);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.x = x0 - wallT;
  root.add(leftWall);

  // wainscoting + rails + crown
  const wain = paint(PAL.wainscot, 0.5, 0.35);
  const trim = paint(PAL.trim, 0.55, 0.3);
  const WY = 1.15;
  const segs: [number, number][] = [[x0, dl - 0.18], [dr + 0.18, x1]];
  for (const [a, b] of segs) {
    const p = mesh(rbox(b - a, WY, 0.08, 0.03), wain);
    at(p, (a + b) / 2, WY / 2, z0 + 0.03);
    const rail = mesh(rbox(b - a, 0.1, 0.14, 0.04), trim);
    at(rail, (a + b) / 2, WY + 0.04, z0 + 0.05);
    const skirt = mesh(rbox(b - a, 0.16, 0.12, 0.04), trim);
    at(skirt, (a + b) / 2, 0.08, z0 + 0.05);
    root.add(p, rail, skirt);
  }
  {
    const len = z1 - z0;
    const p = mesh(rbox(0.08, WY, len, 0.03), wain);
    at(p, x0 + 0.03, WY / 2, (z0 + z1) / 2);
    const rail = mesh(rbox(0.14, 0.1, len, 0.04), trim);
    at(rail, x0 + 0.05, WY + 0.04, (z0 + z1) / 2);
    const skirt = mesh(rbox(0.12, 0.16, len, 0.04), trim);
    at(skirt, x0 + 0.05, 0.08, (z0 + z1) / 2);
    root.add(p, rail, skirt);
    // wainscot panels (raised)
    for (let z = z0 + 0.6; z < z1 - 0.5; z += 1.2) {
      const pan = mesh(rbox(0.04, WY - 0.45, 0.9, 0.03), paint(0x9c6340, 0.5, 0.35));
      at(pan, x0 + 0.08, WY / 2 + 0.03, z + 0.45);
      root.add(pan);
    }
    for (let x = x0 + 0.5; x < x1 - 0.5; x += 1.2) {
      if (x + 0.9 > dl - 0.2 && x < dr + 0.2) continue;
      const pan = mesh(rbox(0.9, WY - 0.45, 0.04, 0.03), paint(0x9c6340, 0.5, 0.35));
      at(pan, x + 0.45, WY / 2 + 0.03, z0 + 0.08);
      root.add(pan);
    }
  }
  const crownB = mesh(rbox(x1 - x0 + wallT, 0.16, 0.2, 0.05), trim);
  at(crownB, (x0 + x1) / 2 - wallT / 2, wallH - 0.08, z0 + 0.05);
  const crownL = mesh(rbox(0.2, 0.16, z1 - z0, 0.05), trim);
  at(crownL, x0 + 0.05, wallH - 0.08, (z0 + z1) / 2);
  root.add(crownB, crownL);

  // ── windows, night sky, moon, moonlight ──
  const sky = skyTexture();
  for (const [i, wx] of WINDOWS.entries()) {
    const w = makeWindow(WIN_W, WIN_H);
    at(w, wx, WIN_Y, z0 - wallT / 2);
    root.add(w);
    const t = sky.clone();
    t.needsUpdate = true;
    t.repeat.set(0.5, 1);
    t.offset.set(i * 0.5, 0);
    const back = mesh(new THREE.PlaneGeometry(3.6, 3.4), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }), false, false);
    at(back, wx, 2.25, z0 - wallT - 0.6);
    back.userData.noAO = true;
    root.add(back);
  }
  const moon = group();
  const moonDisc = mesh(new THREE.CircleGeometry(0.34, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.moon).multiplyScalar(2.2), toneMapped: false }), false, false);
  moonDisc.userData.noAO = true;
  const crater = (x: number, y: number, r: number) => {
    const c = mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe8d9b4).multiplyScalar(1.6), toneMapped: false }), false, false);
    c.position.set(x, y, 0.002);
    c.userData.noAO = true;
    moon.add(c);
  };
  crater(-0.1, 0.08, 0.07);
  crater(0.12, -0.06, 0.05);
  crater(0.02, -0.16, 0.035);
  moon.add(moonDisc, glowSprite(0xb9c8ff, 2.4, 0.8));
  root.add(moon);

  const moonLight = new THREE.DirectionalLight(PAL.moonLight, 3.4);
  moonLight.position.set(-4, 10, -18);
  moonLight.target.position.set(-1, 0, -1);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  const sc = moonLight.shadow.camera;
  sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 50;
  moonLight.shadow.bias = -0.0005;
  moonLight.shadow.normalBias = 0.02;
  moonLight.shadow.radius = 3;
  root.add(moonLight, moonLight.target);
  const mdir = moonLight.target.position.clone().sub(moonLight.position).normalize();
  for (const wx of WINDOWS) {
    const zf = z0 + 0.02;
    const corners = [
      new THREE.Vector3(wx - WIN_W / 2, WIN_Y + WIN_H / 2, zf),
      new THREE.Vector3(wx + WIN_W / 2, WIN_Y + WIN_H / 2, zf),
      new THREE.Vector3(wx + WIN_W / 2, WIN_Y - WIN_H / 2, zf),
      new THREE.Vector3(wx - WIN_W / 2, WIN_Y - WIN_H / 2, zf),
    ];
    root.add(windowShaft(corners, mdir, (WIN_Y + WIN_H / 2) / -mdir.y, 0x9fb4ff, 0.11));
  }

  // ambient: cool sky from above, warm bounce from the floor
  root.add(new THREE.HemisphereLight(0x6f7bd6, 0x6a3e30, 0.62));
  const fill = new THREE.DirectionalLight(0xffc48a, 0.22);
  fill.position.set(8, 9, 10);
  root.add(fill);

  // ── exit door + sign ──
  const door = makeExitDoor(DOOR.w, DOOR.h);
  at(door, DOOR.x, 0, z0 - wallT / 2);
  root.add(door);
  const sign = makeExitSign();
  at(sign, DOOR.x, DOOR.h + 0.62, z0 + 0.1);
  root.add(sign);
  const exitLight = new THREE.PointLight(PAL.exitGreen, 5, 6, 1.6);
  exitLight.position.set(DOOR.x, DOOR.h + 0.3, z0 + 0.9);
  root.add(exitLight);
  const exitZone = mesh(new THREE.CircleGeometry(0.9, 48), new THREE.MeshBasicMaterial({ map: ringTexture(), color: new THREE.Color(PAL.exitGreen).multiplyScalar(1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), false, false);
  at(exitZone, DOOR.x, 0.015, z0 + 1.0, -Math.PI / 2, 0, 0);
  exitZone.userData.noAO = true;
  root.add(exitZone);
  const trail = mesh(new THREE.PlaneGeometry(0.7, 2.8), new THREE.MeshBasicMaterial({ map: pawTrailTexture('rgba(150,255,200,0.75)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), false, false);
  at(trail, DOOR.x - 0.3, 0.012, z0 + 3.0, -Math.PI / 2, 0, 0.12);
  trail.userData.noAO = true;
  root.add(trail);

  // ── reception ──
  const desk = makeDesk(3.4);
  at(desk, 2.0, 0, -3.7);
  root.add(desk);
  const TOP = 1.27;
  const bell = makeBell();
  at(bell, 1.0, TOP, -3.3);
  const key = makeKey();
  at(key, 1.55, TOP + 0.02, -3.15, 0, 0.5, 0);
  const book = makeGuestBook();
  at(book, 2.35, TOP, -3.45, 0, -0.15, 0);
  const lamp = makeDeskLamp();
  at(lamp.root, 3.25, TOP, -3.85);
  const deskPlant = makePlant('small', 4);
  at(deskPlant, 0.55, TOP, -3.9);
  root.add(bell, key, book, lamp.root, deskPlant);
  const keyBoard = makeKeyBoard();
  at(keyBoard, 1.95, 2.45, z0 + 0.06);
  keyBoard.scale.setScalar(0.72);
  root.add(keyBoard);
  // porter's stool behind the desk
  const stool = group();
  const seat = mesh(puck(0.34, 0.12, 0.05), fur(0xe2574c, 0.75));
  seat.position.y = 0.82;
  const stem = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.76, 12), paint(PAL.gold, 0.3, 0.6));
  stem.position.y = 0.4;
  const foot = mesh(puck(0.28, 0.05, 0.02), paint(PAL.gold, 0.3, 0.6));
  foot.position.y = 0.03;
  stool.add(seat, stem, foot);
  at(stool, 2.4, 0, -4.9);
  root.add(stool);

  // ── left wall: shelves + bench (cat route), kennels, frames, clock ──
  const SH_Z = -3.6;
  const bench = makeBench(2.4);
  at(bench, x0 + 0.42, 0, SH_Z, 0, Math.PI / 2, 0);
  root.add(bench);
  const sh1 = makeShelf(2.6, 'mixed', 3);
  at(sh1, x0, 2.0, SH_Z, 0, Math.PI / 2, 0);
  const sh2 = makeShelf(2.6, 'jars', 8);
  at(sh2, x0, 2.95, SH_Z, 0, Math.PI / 2, 0);
  root.add(sh1, sh2);
  const yarn = makeYarn(0xe2574c);
  at(yarn, x0 + 0.4, 0.98 + 0.16 - 0.01, SH_Z + 0.7);
  root.add(yarn);
  const clock = makeClock();
  at(clock, x0 + 0.03, 3.55, -6.0, 0, Math.PI / 2, 0);
  root.add(clock);
  const names = ['BISCUIT', 'MISO', 'PEANUT'];
  for (let i = 0; i < 3; i++) {
    const k = makeKennel(PAL.kennelRoofs[i], names[i]);
    at(k, x0 + 0.68, 0, 0.55 + i * 1.75, 0, Math.PI / 2, 0);
    root.add(k);
    const f = makeFrame((['dog', 'cat', 'fish'] as const)[i], 0.62, 0.74);
    at(f, x0 + 0.04, 2.75, 0.55 + i * 1.75, 0, Math.PI / 2, 0);
    root.add(f);
  }
  // hamster tube: up from the floor at the front, over the kennels, down by the shelves
  const tube = makeTube([
    new THREE.Vector3(-3.7, 0.32, 6.3),
    new THREE.Vector3(x0 + 0.42, 0.32, 6.3),
    new THREE.Vector3(x0 + 0.42, 3.95, 6.3),
    new THREE.Vector3(x0 + 0.42, 3.95, -1.6),
    new THREE.Vector3(x0 + 0.42, 0.32, -1.6),
    new THREE.Vector3(-3.7, 0.32, -1.6),
  ], 0.36);
  root.add(tube.root);
  for (const [z] of [[6.3], [-1.6]]) {
    const cap = mesh(new THREE.TorusGeometry(0.4, 0.08, 16, 40), paint(PAL.tubeRing, 0.35, 0.7));
    at(cap, -3.7, 0.32, z, 0, Math.PI / 2, 0);
    root.add(cap);
  }

  // ── sconces + floor lamp ──
  const sc1 = makeSconce();
  at(sc1.root, -1.5, 2.85, z0 + 0.02);
  const sc2 = makeSconce();
  at(sc2.root, x0 + 0.02, 2.9, -1.0, 0, Math.PI / 2, 0);
  root.add(sc1.root, sc2.root);
  const fl = makeFloorLamp();
  at(fl.root, 4.45, 0, 1.25, 0, -0.6, 0);
  root.add(fl.root);
  const chair = makeArmchair();
  at(chair, 4.05, 0, -0.35, 0, -Math.PI / 2 - 0.35, 0);
  root.add(chair);

  // ── rug, fence with dig spot, plants, luggage ──
  const rugTex = rugTexture();
  const rug = mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.05, 96), [paint(PAL.rugCream, 0.9, 0), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 0.95 }), matte(0x000000)], false, true);
  at(rug, -0.7, 0.025, 1.0);
  rug.scale.set(1, 1, 0.82);
  root.add(rug);
  const fence = makeFence(4.2);
  at(fence, 2.9, 0, 3.1);
  root.add(fence);
  const dirt = mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshStandardMaterial({ map: dirtTexture(), transparent: true, depthWrite: false, roughness: 1 }), false, true);
  at(dirt, 2.3, 0.01, 3.2, -Math.PI / 2, 0, 0);
  root.add(dirt);
  for (const [x, z, s] of [[2.0, 3.55, 0.16], [2.55, 3.65, 0.13], [2.3, 2.75, 0.12], [2.75, 3.3, 0.09]] as const) {
    const clod = mesh(sph(s, 16, 10), matte(0x6e4529, 1));
    at(clod, x, s * 0.4, z);
    clod.scale.y = 0.55;
    root.add(clod);
  }
  const plants: [THREE.Group, number, number][] = [
    [makePlant('tall', 2), x0 + 0.7, z0 + 0.7],
    [makePlant('bush', 5), 4.45, -2.9],
    [makePlant('bush', 9), -3.0, 6.35],
  ];
  for (const [p, x, z] of plants) {
    at(p, x, 0, z);
    root.add(p);
  }
  const luggage = group();
  const s1 = mesh(rbox(1.0, 0.7, 0.4, 0.08), paint(0xe2574c, 0.5, 0.4));
  s1.position.y = 0.35;
  const s2 = mesh(rbox(0.78, 0.55, 0.34, 0.07), paint(0xf0b13e, 0.5, 0.4));
  s2.position.set(0.05, 0.98, 0);
  s2.rotation.y = 0.12;
  const handle = mesh(new THREE.TorusGeometry(0.12, 0.025, 10, 24, Math.PI), paint(0x5a3324, 0.5, 0.3));
  handle.position.set(0.05, 1.25, 0);
  handle.rotation.y = 0.12;
  for (const y of [0.15, 0.55]) {
    const strap = mesh(rbox(0.06, 0.72, 0.42, 0.02), paint(0x5a3324, 0.5, 0.3));
    strap.position.set(-0.25 + y * 0.5, 0.35, 0);
    luggage.add(strap);
  }
  luggage.add(s1, s2, handle);
  at(luggage, -0.9, 0, z0 + 0.45, 0, 0.05, 0);
  root.add(luggage);

  // ── characters + bones ──
  const dog = makeDog();
  const cat = makeCat();
  const hamster = makeHamster();
  if (opt.pets !== false) {
    at(dog.root, 2.3, 0, 4.25, 0, 0.3, 0);
    dog.root.scale.setScalar(1.5);
    at(cat.root, x0 + 0.36, 2.98, SH_Z - 0.55, 0, Math.PI / 2 + 0.3, 0);
    cat.root.scale.setScalar(1.3);
    at(hamster.root, x0 + 0.42, 3.95 - 0.33, 3.3, 0, Math.PI / 2 + 0.55, 0);
    hamster.root.scale.setScalar(0.82);
    root.add(dog.root, cat.root, hamster.root);
    actors.push(dog, cat, hamster);
  }
  const porter = makePorter();
  if (opt.porter !== false) {
    at(porter.root, 0.8, 0, -1.7, 0, -0.35, 0);
    porter.aim.set(-0.3, 0, 3.2);
    root.add(porter.root);
    actors.push(porter);
  }
  if (opt.bones !== false) {
    for (const [x, y, z, ph] of [[-1.5, 0, 1.0, 0], [x0 + 0.38, 2.98, SH_Z + 0.55, 1.3]] as const) {
      const b = makeBone(ph);
      at(b.root, x, y, z);
      b.root.scale.setScalar(y > 0 ? 1.0 : 1.4);
      root.add(b.root);
      actors.push(b);
    }
  }

  root.traverse((o) => {
    // sprites/beams never cast shadows
    if ((o as THREE.Sprite).isSprite) o.castShadow = false;
  });
  shadows(planks, false, true);

  const tmp = new THREE.Vector3();
  const target = new THREE.Vector3(WINDOWS[0] + 0.32, WIN_Y + 0.42, z0);
  const exitMat = exitZone.material as THREE.MeshBasicMaterial;
  return {
    root,
    pets: { dog, cat, hamster },
    porter,
    actors,
    moonLight,
    pinMoon(camera) {
      camera.updateMatrixWorld();
      const c = tmp.setFromMatrixPosition(camera.matrixWorld);
      const dir = target.clone().sub(c);
      const zPlane = z0 - wallT - 0.5;
      const k = (zPlane - c.z) / dir.z;
      moon.position.copy(c).addScaledVector(dir, k);
      moon.lookAt(c);
    },
    update(t) {
      for (const a of actors) a.update(t);
      exitMat.opacity = 0.75 + 0.25 * Math.sin(t * 3);
      exitZone.scale.setScalar(1 + 0.06 * Math.sin(t * 3));
    },
  };
}

let radial: THREE.CanvasTexture | null = null;
function radialShadow(): THREE.CanvasTexture {
  if (radial) return radial;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 20, 128, 128, 128);
  grad.addColorStop(0, 'rgba(5,4,18,0.85)');
  grad.addColorStop(0.55, 'rgba(5,4,18,0.45)');
  grad.addColorStop(1, 'rgba(5,4,18,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  radial = new THREE.CanvasTexture(c);
  return radial;
}

function ringTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0.35)');
  grad.addColorStop(0.62, 'rgba(255,255,255,0.15)');
  grad.addColorStop(0.78, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.86, 'rgba(255,255,255,0.2)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
