import * as THREE from 'three';
import { PAL } from './palette';
import { type Actor, caps, cyl, glow, group, matte, mesh, metal, paint, puck, rbox, sph, torus, fur } from './kit';
import { glowSprite, sparkle } from './fx';
import { clockTexture, portraitTexture, rng, signTexture } from './textures';

// ─── Collectible bone (gently glowing, bobbing) ──────────────────────────────────
export function makeBone(phase = 0): Actor {
  const root = group();
  const spin = group();
  root.add(spin);
  const m = new THREE.MeshPhysicalMaterial({ color: PAL.bone, emissive: 0xffc46b, emissiveIntensity: 0.55, roughness: 0.4, clearcoat: 0.6 });
  const shaft = mesh(caps(0.075, 0.36), m);
  shaft.rotation.z = Math.PI / 2;
  spin.add(shaft);
  for (const x of [-0.24, 0.24]) for (const y of [-0.07, 0.07]) {
    const k = mesh(sph(0.095, 24, 16), m);
    k.position.set(x, y, 0);
    spin.add(k);
  }
  const halo = glowSprite(0xffc36a, 1.3, 0.55);
  root.add(halo);
  const sp: THREE.Sprite[] = [];
  for (let i = 0; i < 3; i++) {
    const s = sparkle(0xfff3c4, 0.2);
    root.add(s);
    sp.push(s);
  }
  const shadowBlob = mesh(new THREE.CircleGeometry(0.28, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }), false, false);
  shadowBlob.rotation.x = -Math.PI / 2;
  root.add(shadowBlob);
  return {
    root,
    update(t) {
      const tt = t + phase;
      spin.position.y = 0.45 + 0.08 * Math.sin(tt * 2.2);
      spin.rotation.y = tt * 1.4;
      spin.rotation.z = 0.25;
      halo.position.y = spin.position.y;
      (halo.material as THREE.SpriteMaterial).opacity = 0.45 + 0.15 * Math.sin(tt * 3);
      shadowBlob.position.y = 0.012;
      shadowBlob.scale.setScalar(1 - 0.15 * Math.sin(tt * 2.2));
      for (const [i, s] of sp.entries()) {
        const p = (tt * 0.6 + i / 3) % 1;
        const a = i * 2.1 + tt * 0.7;
        s.position.set(Math.cos(a) * 0.36, spin.position.y + (p - 0.5) * 0.5, Math.sin(a) * 0.36);
        const k = Math.sin(p * Math.PI);
        s.scale.set(0.22 * k, 0.22 * k, 1);
      }
    },
  };
}

// ─── Reception: service bell, room key, guest book, banker's lamp ──────────────────
export function makeBell(): THREE.Group {
  const g = group();
  const base = mesh(puck(0.2, 0.05, 0.02), metal(0x5b3a2a, 0.5));
  base.position.y = 0.025;
  const dome = mesh(new THREE.SphereGeometry(0.16, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), metal(PAL.gold, 0.18));
  dome.position.y = 0.05;
  const stem = mesh(cyl(0.015, 0.015, 0.06), metal(PAL.gold, 0.2));
  stem.position.y = 0.23;
  const btn = mesh(sph(0.035), metal(PAL.gold, 0.2));
  btn.position.y = 0.27;
  g.add(base, dome, stem, btn);
  return g;
}

export function makeKey(): THREE.Group {
  const g = group();
  const gold = metal(PAL.gold, 0.25);
  const bow = mesh(torus(0.07, 0.025), gold);
  bow.rotation.x = Math.PI / 2;
  const blade = mesh(rbox(0.22, 0.03, 0.04, 0.012), gold);
  blade.position.x = 0.17;
  const bit1 = mesh(rbox(0.03, 0.03, 0.07, 0.01), gold);
  bit1.position.set(0.24, 0, 0.04);
  const bit2 = mesh(rbox(0.03, 0.03, 0.05, 0.01), gold);
  bit2.position.set(0.19, 0, 0.03);
  // bone-shaped key tag
  const tag = group();
  const tm = paint(PAL.collar, 0.45, 0.5);
  const sh = mesh(caps(0.04, 0.14), tm);
  sh.rotation.z = Math.PI / 2;
  tag.add(sh);
  for (const x of [-0.1, 0.1]) for (const z of [-0.035, 0.035]) {
    const k = mesh(sph(0.045, 16, 12), tm);
    k.position.set(x, 0, z);
    tag.add(k);
  }
  tag.scale.y = 0.45;
  tag.position.set(-0.2, 0, -0.03);
  tag.rotation.y = 0.5;
  g.add(bow, blade, bit1, bit2, tag);
  return g;
}

export function makeBook(color: number, w = 0.3, h = 0.4, d = 0.07): THREE.Group {
  const g = group();
  const cover = mesh(rbox(d, h, w, 0.012), paint(color, 0.7, 0.1));
  const pages = mesh(new THREE.BoxGeometry(d * 0.8, h * 0.94, w * 0.92), matte(0xfbf2dc, 0.9));
  pages.position.z = 0.012;
  const stripe = mesh(new THREE.BoxGeometry(d * 1.02, h * 0.08, w * 0.15), metal(PAL.gold, 0.35));
  stripe.position.set(0, h * 0.25, -w * 0.47);
  g.add(cover, pages, stripe);
  return g;
}

export function makeGuestBook(): THREE.Group {
  const g = group();
  for (const s of [-1, 1]) {
    const page = mesh(rbox(0.26, 0.03, 0.34, 0.01), matte(0xfbf2dc, 0.85));
    page.position.set(s * 0.135, 0.02, 0);
    page.rotation.z = -s * 0.06;
    g.add(page);
    for (let i = 0; i < 5; i++) {
      const line = mesh(new THREE.BoxGeometry(0.18, 0.002, 0.012), matte(0x9a8a7a), false, false);
      line.position.set(s * 0.135, 0.04 + (s < 0 ? -1 : 1) * 0.0, -0.11 + i * 0.055);
      line.rotation.z = -s * 0.06;
      g.add(line);
    }
  }
  const cover = mesh(rbox(0.58, 0.02, 0.38, 0.01), paint(0x7a2e3b, 0.6, 0.2));
  g.add(cover);
  const pen = mesh(caps(0.012, 0.18), paint(0x223355, 0.3, 0.8));
  pen.position.set(0.15, 0.06, 0.06);
  pen.rotation.set(Math.PI / 2, 0, 0.6);
  pen.rotation.order = 'YXZ';
  g.add(pen);
  return g;
}

/** Banker's lamp: brass base, green glass shade, warm spot light pointing down. */
export function makeDeskLamp(): { root: THREE.Group; light: THREE.SpotLight } {
  const g = group();
  const brass = metal(PAL.gold, 0.3);
  const base = mesh(puck(0.16, 0.05, 0.02), brass);
  base.position.y = 0.025;
  const stem = mesh(cyl(0.02, 0.02, 0.42), brass);
  stem.position.y = 0.26;
  const shade = mesh(new THREE.CylinderGeometry(0.1, 0.22, 0.16, 32, 1, true), new THREE.MeshPhysicalMaterial({ color: 0x2f8a5a, roughness: 0.25, clearcoat: 1, side: THREE.DoubleSide, emissive: 0x1d5a3a, emissiveIntensity: 0.25 }));
  shade.position.y = 0.5;
  const top = mesh(sph(0.1, 24, 12), shade.material as THREE.Material);
  top.scale.y = 0.4;
  top.position.y = 0.58;
  const bulb = mesh(sph(0.07, 20, 12), glow(0xffe0a8, 6), false, false);
  bulb.position.y = 0.45;
  g.add(base, stem, shade, top, bulb);
  const light = new THREE.SpotLight(PAL.lamp, 9, 4, 1.05, 0.7, 1.4);
  light.position.set(0, 0.44, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  light.shadow.bias = -0.0005;
  light.shadow.radius = 3;
  const tgt = new THREE.Object3D();
  tgt.position.set(0, -1, 0.1);
  g.add(light, tgt);
  light.target = tgt;
  const halo = glowSprite(PAL.lamp, 1.1, 0.6);
  halo.position.y = 0.4;
  g.add(halo);
  return { root: g, light };
}

// ─── Plants ───────────────────────────────────────────────────────────────────
function pot(r: number, h: number, color: number = PAL.pot): THREE.Group {
  const g = group();
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(r * 0.72, 0), new THREE.Vector2(r * 0.8, h * 0.08), new THREE.Vector2(r, h * 0.82), new THREE.Vector2(r * 1.08, h * 0.84), new THREE.Vector2(r * 1.1, h), new THREE.Vector2(r * 0.9, h), new THREE.Vector2(r * 0.88, h * 0.9), new THREE.Vector2(0, h * 0.9)];
  const body = mesh(new THREE.LatheGeometry(pts, 40), paint(color, 0.6, 0.2));
  const soil = mesh(new THREE.CircleGeometry(r * 0.88, 32), matte(0x4a2e22));
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = h * 0.9;
  g.add(body, soil);
  return g;
}

/** Round, chunky leaf (flattened sphere) with a pivot at its base. */
function leaf(len: number, wid: number, mat: THREE.Material): THREE.Group {
  const g = group();
  const l = mesh(sph(0.5, 24, 16), mat);
  l.scale.set(wid, 0.1, len);
  l.position.z = len * 0.5;
  g.add(l);
  return g;
}

export function makePlant(kind: 'tall' | 'bush' | 'small', seed = 1): THREE.Group {
  const r = rng(seed);
  const g = group();
  const light = fur(PAL.plantGreen, 0.6);
  const dark = fur(PAL.plantDark, 0.6);
  if (kind === 'tall') {
    const p = pot(0.42, 0.7);
    g.add(p);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r() * 0.4;
      const stemH = 0.9 + r() * 1.1;
      const stem = mesh(cyl(0.025, 0.03, stemH, 8), dark);
      const tilt = 0.18 + r() * 0.3;
      stem.position.set(Math.sin(a) * tilt * stemH * 0.5, 0.65 + stemH / 2, Math.cos(a) * tilt * stemH * 0.5);
      stem.rotation.set(Math.cos(a) * tilt, 0, -Math.sin(a) * tilt);
      g.add(stem);
      const L = leaf(0.75 + r() * 0.25, 0.6 + r() * 0.2, i % 2 ? light : dark);
      L.position.set(Math.sin(a) * tilt * stemH, 0.62 + stemH * Math.cos(tilt), Math.cos(a) * tilt * stemH);
      L.rotation.set(-0.5 - r() * 0.4, a, 0, 'YXZ');
      g.add(L);
    }
  } else if (kind === 'bush') {
    const p = pot(0.38, 0.55, 0xe9d6b4);
    g.add(p);
    const blobs: [number, number, number, number][] = [[0, 0.95, 0, 0.42], [0.25, 0.82, 0.12, 0.3], [-0.24, 0.84, 0.08, 0.32], [0.05, 0.8, -0.25, 0.3], [0.08, 1.25, 0.05, 0.28]];
    for (const [i, [x, y, z, s]] of blobs.entries()) {
      const b = mesh(sph(s, 28, 20), i % 2 ? light : dark);
      b.position.set(x, y, z);
      g.add(b);
    }
  } else {
    const p = pot(0.14, 0.2, 0xf6e7c8);
    g.add(p);
    for (let i = 0; i < 6; i++) {
      const L = leaf(0.22, 0.13, i % 2 ? light : dark);
      L.position.y = 0.2;
      L.rotation.set(-0.7 - r() * 0.4, (i / 6) * Math.PI * 2, 0, 'YXZ');
      g.add(L);
    }
  }
  return g;
}

// ─── Kennel (hotel "room" for a pet), gate swung open ─────────────────────────────
export function makeKennel(roof: number, name: string): THREE.Group {
  const g = group();
  const W = 1.5;
  const H = 1.15;
  const D = 1.25;
  const body = mesh(rbox(W, H, D, 0.1), paint(PAL.kennelBody, 0.65, 0.15));
  body.position.y = H / 2;
  g.add(body);
  // roof halves
  for (const s of [-1, 1]) {
    const r = mesh(rbox(W * 0.62, 0.12, D + 0.22, 0.05), paint(roof, 0.5, 0.35));
    r.position.set(s * W * 0.25, H + 0.24, 0);
    r.rotation.z = -s * 0.62;
    g.add(r);
  }
  const gable = new THREE.Shape();
  gable.moveTo(-W / 2 + 0.05, 0);
  gable.lineTo(0, 0.42);
  gable.lineTo(W / 2 - 0.05, 0);
  gable.closePath();
  const gab = mesh(new THREE.ExtrudeGeometry(gable, { depth: D - 0.05, bevelEnabled: false }), paint(PAL.kennelBody, 0.65, 0.15));
  gab.position.set(0, H - 0.02, -(D - 0.05) / 2);
  g.add(gab);
  // arched dark opening
  const arch = new THREE.Shape();
  const aw = 0.42;
  arch.moveTo(-aw, 0);
  arch.lineTo(-aw, 0.45);
  arch.absarc(0, 0.45, aw, Math.PI, 0, true);
  arch.lineTo(aw, 0);
  arch.closePath();
  const hole = mesh(new THREE.ShapeGeometry(arch, 24), matte(0x24152a, 1), false, true);
  hole.position.set(0, 0.06, D / 2 + 0.002);
  g.add(hole);
  const rim = mesh(new THREE.ExtrudeGeometry(arch, { depth: 0.04, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.02, bevelSegments: 3 }), paint(roof, 0.5, 0.3));
  rim.scale.set(1.12, 1.07, 1);
  rim.position.set(0, 0.03, D / 2 - 0.035);
  const rimInner = mesh(new THREE.ShapeGeometry(arch, 24), matte(0x24152a, 1), false, true);
  rimInner.position.set(0, 0.06, D / 2 + 0.05);
  g.add(rim, rimInner);
  // pillow peeking out
  const pillow = mesh(rbox(0.7, 0.14, 0.5, 0.07), fur(0xa9d7e6, 0.7));
  pillow.position.set(0, 0.13, D / 2 - 0.22);
  g.add(pillow);
  // open gate with bars, hinged on the left
  const gate = group();
  gate.position.set(-aw - 0.05, 0.06, D / 2 + 0.06);
  gate.rotation.y = -1.9;
  const steel = metal(0xc9ced8, 0.35);
  const frameTop = mesh(torus(aw, 0.025, Math.PI), steel);
  frameTop.position.set(aw, 0.45, 0);
  gate.add(frameTop);
  for (let i = 0; i <= 5; i++) {
    const bar = mesh(cyl(0.018, 0.018, 0.45 + (i === 0 || i === 5 ? 0 : Math.sin((i / 5) * Math.PI) * aw * 0.92), 8), steel);
    const x = (i / 5) * aw * 2;
    const hgt = 0.45 + (i === 0 || i === 5 ? 0 : Math.sin(Math.acos(1 - (i / 5) * 2)) * aw * 0.97);
    bar.geometry.dispose();
    bar.geometry = cyl(0.018, 0.018, hgt, 8);
    bar.position.set(x, hgt / 2, 0);
    gate.add(bar);
  }
  const bottom = mesh(cyl(0.022, 0.022, aw * 2, 8), steel);
  bottom.rotation.z = Math.PI / 2;
  bottom.position.set(aw, 0.02, 0);
  gate.add(bottom);
  g.add(gate);
  // name plate (bone shaped)
  const plate = group();
  const plateTex = signTexture(name, { w: 256, h: 96, bg: '#fbf0d6', fg: '#3b2346', size: 60 });
  const pm = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.5 });
  const pl = mesh(rbox(0.5, 0.18, 0.04, 0.03), paint(0xfbf0d6, 0.5, 0.4));
  const face = mesh(new THREE.PlaneGeometry(0.44, 0.165), pm, false, true);
  face.position.z = 0.022;
  plate.add(face);
  plate.add(pl);
  for (const x of [-0.27, 0.27]) for (const y of [-0.06, 0.06]) {
    const k = mesh(sph(0.07, 16, 12), paint(0xfbf0d6, 0.5, 0.4));
    k.position.set(x, y, 0);
    k.scale.z = 0.35;
    plate.add(k);
  }
  plate.position.set(0, H - 0.08, D / 2 + 0.03);
  g.add(plate);
  // food bowl
  const bowl = mesh(new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.17, 0), new THREE.Vector2(0.21, 0.09), new THREE.Vector2(0.19, 0.1), new THREE.Vector2(0.15, 0.03), new THREE.Vector2(0, 0.03)], 32), paint(roof, 0.4, 0.6));
  bowl.position.set(0.55, 0, D / 2 + 0.3);
  g.add(bowl);
  return g;
}

// ─── White picket play-pen fence with a dig spot ────────────────────────────────
export function makeFence(length: number): THREE.Group {
  const g = group();
  const white = paint(0xfbf6ec, 0.55, 0.3);
  const n = Math.round(length / 0.34);
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * length - length / 2;
    const post = mesh(rbox(0.16, 0.95, 0.07, 0.03), white);
    post.position.set(x, 0.5, 0);
    const cap = mesh(new THREE.ConeGeometry(0.11, 0.14, 4), white);
    cap.position.set(x, 1.03, 0);
    cap.rotation.y = Math.PI / 4;
    cap.scale.z = 0.45;
    g.add(post, cap);
  }
  for (const y of [0.3, 0.75]) {
    const rail = mesh(rbox(length + 0.1, 0.09, 0.06, 0.025), white);
    rail.position.set(0, y, -0.06);
    g.add(rail);
  }
  return g;
}

// ─── Wall shelf with cosy clutter ─────────────────────────────────────────────
export function makeShelf(len: number, items: 'books' | 'jars' | 'mixed', seed = 1): THREE.Group {
  const g = group();
  const r = rng(seed);
  const board = mesh(rbox(len, 0.1, 0.6, 0.04), paint(PAL.deskTop, 0.55, 0.3));
  board.position.set(0, 0, 0.3);
  g.add(board);
  for (const x of [-len / 2 + 0.25, len / 2 - 0.25]) {
    const br = mesh(rbox(0.06, 0.28, 0.36, 0.02), metal(PAL.gold, 0.35));
    br.position.set(x, -0.18, 0.2);
    g.add(br);
  }
  const bookCols = [0xe2574c, 0x4f9fb0, 0xf0b13e, 0x7b5ea7, 0x5fae5a, 0xf6e7c8];
  let x = -len / 2 + 0.15;
  const end = len / 2 - 0.15;
  while (x < end - 0.2) {
    const pick = items === 'books' ? 0 : items === 'jars' ? 1 : (r() < 0.5 ? 0 : 1);
    if (pick === 0) {
      const count = 2 + Math.floor(r() * 4);
      for (let i = 0; i < count && x < end; i++) {
        const h = 0.34 + r() * 0.18;
        const d = 0.07 + r() * 0.04;
        const b = makeBook(bookCols[Math.floor(r() * bookCols.length)], 0.36, h, d);
        b.position.set(x, 0.05 + h / 2, 0.3);
        if (i === count - 1 && r() < 0.4) {
          b.rotation.z = -0.25;
          b.position.x += 0.04;
        }
        g.add(b);
        x += d + 0.005;
      }
      x += 0.12;
    } else {
      const jr = 0.1 + r() * 0.04;
      const jh = 0.22 + r() * 0.1;
      const jar = mesh(cyl(jr, jr, jh, 28), new THREE.MeshPhysicalMaterial({ color: 0xdff4ff, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.45, clearcoat: 1 }), false, true);
      jar.position.set(x + jr, 0.05 + jh / 2, 0.3);
      jar.userData.noAO = true;
      const lid = mesh(puck(jr + 0.015, 0.05, 0.02), paint(bookCols[Math.floor(r() * 4)], 0.4, 0.5));
      lid.position.set(x + jr, 0.05 + jh + 0.02, 0.3);
      const fill = mesh(cyl(jr * 0.85, jr * 0.85, jh * 0.6, 20), paint(r() < 0.5 ? 0xd9965a : 0xf2d27a, 0.8, 0));
      fill.position.set(x + jr, 0.05 + jh * 0.32, 0.3);
      g.add(fill, jar, lid);
      x += jr * 2 + 0.12;
    }
  }
  return g;
}

export function makeYarn(color: number): THREE.Group {
  const g = group();
  const b = mesh(sph(0.16, 28, 20), fur(color, 0.9));
  g.add(b);
  for (let i = 0; i < 4; i++) {
    const t = mesh(torus(0.158, 0.012), fur(color, 0.9));
    t.rotation.set(i * 0.8, i * 1.3, 0);
    g.add(t);
  }
  b.position.y = 0;
  return g;
}

// ─── Wall decor ──────────────────────────────────────────────────────────────
export function makeFrame(kind: 'dog' | 'cat' | 'fish', w = 0.7, h = 0.85): THREE.Group {
  const g = group();
  const frame = mesh(rbox(w, h, 0.08, 0.04), paint(PAL.gold, 0.4, 0.6));
  const pic = mesh(new THREE.PlaneGeometry(w * 0.78, h * 0.8), new THREE.MeshStandardMaterial({ map: portraitTexture(kind), roughness: 0.7 }), false, true);
  pic.position.z = 0.045;
  g.add(frame, pic);
  return g;
}

export function makeClock(): THREE.Group {
  const g = group();
  const rim = mesh(torus(0.36, 0.06), paint(0xe2574c, 0.4, 0.6));
  const face = mesh(new THREE.CircleGeometry(0.36, 48), new THREE.MeshStandardMaterial({ map: clockTexture(), roughness: 0.6 }), false, true);
  face.position.z = 0.01;
  const back = mesh(cyl(0.37, 0.37, 0.06, 40), paint(0xfbf3df, 0.6, 0.1));
  back.rotation.x = Math.PI / 2;
  back.position.z = -0.02;
  g.add(back, face, rim);
  return g;
}

/** Wall sconce: brass arm + fabric shade with a warm (non-shadowing) point light. */
export function makeSconce(): { root: THREE.Group; light: THREE.PointLight } {
  const g = group();
  const plate = mesh(rbox(0.16, 0.26, 0.05, 0.03), metal(PAL.gold, 0.3));
  const arm = mesh(cyl(0.02, 0.02, 0.26, 10), metal(PAL.gold, 0.3));
  arm.rotation.x = Math.PI / 2;
  arm.position.set(0, 0, 0.13);
  const shade = mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.26, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffb860, emissiveIntensity: 1.8, side: THREE.DoubleSide, roughness: 0.9 }), false, false);
  shade.position.set(0, 0.1, 0.26);
  g.add(plate, arm, shade);
  const light = new THREE.PointLight(PAL.lamp, 9, 6.5, 1.6);
  light.position.set(0, 0.05, 0.3);
  g.add(light);
  const halo = glowSprite(PAL.lamp, 1.3, 0.55);
  halo.position.set(0, 0.1, 0.3);
  g.add(halo);
  return { root: g, light };
}

/** Floor lamp with a fabric shade and a soft warm shadow-casting spot. */
export function makeFloorLamp(): { root: THREE.Group; light: THREE.SpotLight } {
  const g = group();
  const brass = metal(PAL.gold, 0.3);
  const base = mesh(puck(0.28, 0.06, 0.03), brass);
  base.position.y = 0.03;
  const pole = mesh(cyl(0.03, 0.03, 2.4, 12), brass);
  pole.position.y = 1.2;
  const shade = mesh(new THREE.CylinderGeometry(0.3, 0.46, 0.5, 40, 1, true), new THREE.MeshStandardMaterial({ color: 0xfbe2b5, emissive: 0xffb05a, emissiveIntensity: 1.5, side: THREE.DoubleSide, roughness: 0.9 }), false, false);
  shade.position.y = 2.45;
  const trim = mesh(torus(0.46, 0.02), paint(0xe2574c, 0.5, 0.3));
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 2.2;
  const diffuser = mesh(new THREE.CircleGeometry(0.3, 40), new THREE.MeshStandardMaterial({ color: 0xfff3dc, emissive: 0xffc98a, emissiveIntensity: 1.2, side: THREE.DoubleSide }), false, false);
  diffuser.rotation.x = -Math.PI / 2;
  diffuser.position.y = 2.69;
  g.add(base, pole, shade, trim, diffuser);
  const light = new THREE.SpotLight(PAL.lamp, 48, 10, 1.1, 0.8, 1.5);
  light.position.set(0, 2.35, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.0004;
  light.shadow.radius = 5;
  const tgt = new THREE.Object3D();
  tgt.position.set(0.2, 0, 2.4);
  g.add(light, tgt);
  light.target = tgt;
  const halo = glowSprite(PAL.lamp, 2.2, 0.45);
  halo.position.y = 2.4;
  g.add(halo);
  return { root: g, light };
}

/** EXIT sign: emissive green box with white text — drives the bloom. */
export function makeExitSign(): THREE.Group {
  const g = group();
  const tex = signTexture('EXIT', { w: 512, h: 200, bg: '#16b85c', fg: '#f4fff6', border: '#e9ffef', arrow: true, size: 128 });
  const face = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 3.2, roughness: 0.4 });
  const edge = paint(0xf6f6f2, 0.4, 0.5);
  const box = mesh(rbox(1.3, 0.5, 0.16, 0.05), edge);
  const front = mesh(new THREE.PlaneGeometry(1.2, 0.44), face, false, false);
  front.position.z = 0.082;
  g.add(box, front);
  const halo = glowSprite(PAL.exitGreen, 3.4, 0.5);
  halo.position.z = 0.2;
  g.add(halo);
  return g;
}

/** A transparent hamster tube along a path, with coloured connector rings. */
export function makeTube(points: THREE.Vector3[], radius = 0.24): { root: THREE.Group; curve: THREE.CurvePath<THREE.Vector3> } {
  const g = group();
  const path = new THREE.CurvePath<THREE.Vector3>();
  // straight runs joined by rounded elbows
  const pts = points;
  const elbowR = 0.45;
  let prev = pts[0].clone();
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (i < pts.length - 1) {
      const n = pts[i + 1];
      const a = p.clone().sub(prev).normalize();
      const b = n.clone().sub(p).normalize();
      const s = p.clone().addScaledVector(a, -elbowR);
      const e = p.clone().addScaledVector(b, elbowR);
      path.add(new THREE.LineCurve3(prev, s));
      path.add(new THREE.QuadraticBezierCurve3(s, p.clone(), e));
      prev = e;
    } else {
      path.add(new THREE.LineCurve3(prev, p.clone()));
    }
  }
  const glass = new THREE.MeshPhysicalMaterial({
    color: PAL.tube, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.28, clearcoat: 1, clearcoatRoughness: 0.05,
    side: THREE.DoubleSide, depthWrite: false, emissive: 0x5fa8c8, emissiveIntensity: 0.12,
  });
  const tubeGeo = new THREE.TubeGeometry(path, 400, radius, 28, false);
  const tube = mesh(tubeGeo, glass, false, false);
  tube.userData.noAO = true;
  tube.renderOrder = 5;
  g.add(tube);
  // rim highlights (fake fresnel) via a slightly bigger back-face shell
  const rimMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xcff3ff) } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1. - abs(dot(normalize(vN), normalize(vV))), 3.); gl_FragColor = vec4(uColor * f * 0.9, 1.); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const rim = new THREE.Mesh(tubeGeo, rimMat);
  rim.userData.noAO = true;
  rim.renderOrder = 6;
  g.add(rim);
  const ringMat = paint(PAL.tubeRing, 0.35, 0.7);
  const L = path.getLength();
  const ringCount = Math.floor(L / 1.6);
  for (let i = 0; i <= ringCount; i++) {
    const u = i / ringCount;
    const p = path.getPointAt(u);
    const tng = path.getTangentAt(u);
    const ring = mesh(torus(radius + 0.02, 0.05), ringMat);
    ring.position.copy(p);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tng);
    g.add(ring);
  }
  return { root: g, curve: path };
}

/** Window: frame, mullions, sill, curtains; glass (no shadow). Built around (0,0) = opening centre. */
export function makeWindow(w: number, h: number): THREE.Group {
  const g = group();
  const trim = paint(PAL.trim, 0.55, 0.3);
  const t = 0.12;
  for (const [x, y, ww, hh] of [[0, h / 2 + t / 2, w + 2 * t, t], [0, -h / 2 - t / 2, w + 2 * t, t], [-w / 2 - t / 2, 0, t, h], [w / 2 + t / 2, 0, t, h]] as const) {
    const b = mesh(rbox(ww, hh, 0.42, 0.04), trim);
    b.position.set(x, y, 0);
    g.add(b);
  }
  const mull = mesh(rbox(0.06, h, 0.08, 0.02), trim);
  const mull2 = mesh(rbox(w, 0.06, 0.08, 0.02), trim);
  mull.position.z = mull2.position.z = -0.05;
  g.add(mull, mull2);
  const sill = mesh(rbox(w + 0.5, 0.1, 0.42, 0.04), trim);
  sill.position.set(0, -h / 2 - 0.12, 0.16);
  g.add(sill);
  const glass = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshPhysicalMaterial({ color: 0xbfd2ff, roughness: 0.05, transparent: true, opacity: 0.12, clearcoat: 1, depthWrite: false }), false, false);
  glass.position.z = -0.08;
  glass.userData.noAO = true;
  g.add(glass);
  // curtains (soft bunched fabric)
  const cloth = fur(0xe7b347, 0.85);
  for (const s of [-1, 1]) {
    const c = group();
    for (let i = 0; i < 4; i++) {
      const fold = mesh(caps(0.075, h + 0.25), cloth);
      fold.position.set(s * (w / 2 + 0.1 + i * 0.1), -0.05, 0.28 + (i % 2) * 0.04);
      c.add(fold);
    }
    const tie = mesh(torus(0.2, 0.035), paint(0xe2574c, 0.5, 0.3));
    tie.position.set(s * (w / 2 + 0.25), -0.2, 0.3);
    tie.rotation.x = Math.PI / 2;
    tie.scale.set(1, 0.6, 1);
    c.add(tie);
    g.add(c);
  }
  const rod = mesh(cyl(0.035, 0.035, w + 1.3, 12), metal(PAL.gold, 0.3));
  rod.rotation.z = Math.PI / 2;
  rod.position.set(0, h / 2 + 0.22, 0.32);
  g.add(rod);
  for (const s of [-1, 1]) {
    const k = mesh(sph(0.06, 16, 12), metal(PAL.gold, 0.3));
    k.position.set(s * (w / 2 + 0.65), h / 2 + 0.22, 0.32);
    g.add(k);
  }
  return g;
}

export function makeExitDoor(w: number, h: number): THREE.Group {
  const g = group();
  const trim = paint(PAL.trim, 0.55, 0.3);
  const t = 0.16;
  for (const [x, y, ww, hh] of [[0, h + t / 2, w + 2 * t, t], [-w / 2 - t / 2, h / 2, t, h], [w / 2 + t / 2, h / 2, t, h]] as const) {
    const b = mesh(rbox(ww, hh, 0.44, 0.05), trim);
    b.position.set(x, y, 0);
    g.add(b);
  }
  const doorMat = paint(0x2f9a6a, 0.5, 0.35);
  const door = mesh(rbox(w, h, 0.12, 0.05), doorMat);
  door.position.set(0, h / 2, -0.05);
  g.add(door);
  for (const y of [h * 0.3, h * 0.72]) {
    const panel = mesh(rbox(w * 0.7, h * 0.32, 0.04, 0.04), paint(0x37ad78, 0.5, 0.35));
    panel.position.set(0, y, 0.02);
    g.add(panel);
  }
  const bar = mesh(caps(0.035, w * 0.6), metal(0xd9dde6, 0.25));
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, h * 0.48, 0.1);
  g.add(bar);
  // warm light spilling under the door
  const slit = mesh(new THREE.PlaneGeometry(w * 0.95, 0.05), glow(0x9dffc4, 3), false, false);
  slit.position.set(0, 0.03, 0.02);
  g.add(slit);
  return g;
}

/** Reception desk: teal front with cream panels, wooden top, "RECEPTION" sign. Front faces +Z. */
export function makeDesk(len: number): THREE.Group {
  const g = group();
  const H = 1.15;
  const D = 1.0;
  const body = mesh(rbox(len, H, D, 0.1), paint(PAL.deskTeal, 0.55, 0.3));
  body.position.y = H / 2;
  g.add(body);
  const top = mesh(rbox(len + 0.25, 0.14, D + 0.3, 0.06), paint(PAL.deskTop, 0.45, 0.6));
  top.position.set(0, H + 0.05, 0.05);
  g.add(top);
  const kick = mesh(rbox(len - 0.1, 0.12, D - 0.1, 0.05), paint(0x225a5c, 0.6, 0.2));
  kick.position.set(0, 0.06, 0.06);
  g.add(kick);
  const panels = 3;
  for (let i = 0; i < panels; i++) {
    const pw = (len - 0.5) / panels - 0.12;
    const x = -len / 2 + 0.25 + (i + 0.5) * ((len - 0.5) / panels);
    const p = mesh(rbox(pw, 0.62, 0.05, 0.04), paint(0x3a8e8f, 0.55, 0.3));
    p.position.set(x, 0.5, D / 2 + 0.01);
    g.add(p);
  }
  const signTex = signTexture('RECEPTION', { w: 1024, h: 160, bg: '#fbf0d6', fg: '#3b2346', size: 110 });
  const sign = mesh(rbox(1.7, 0.27, 0.05, 0.04), paint(0xfbf0d6, 0.5, 0.3));
  sign.position.set(0, 0.92, D / 2 + 0.03);
  const signFace = mesh(new THREE.PlaneGeometry(1.62, 0.25), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.5 }), false, true);
  signFace.position.set(0, 0.92, D / 2 + 0.058);
  g.add(sign, signFace);
  for (const s of [-1, 1]) {
    const k = mesh(sph(0.04, 12, 10), metal(PAL.gold, 0.3));
    k.position.set(s * 0.78, 0.92, D / 2 + 0.07);
    g.add(k);
  }
  return g;
}

/** Key board for the wall behind reception. */
export function makeKeyBoard(): THREE.Group {
  const g = group();
  const board = mesh(rbox(1.1, 0.8, 0.06, 0.04), paint(PAL.deskTop, 0.5, 0.4));
  g.add(board);
  const cols = [0xe2574c, 0xf0b13e, 0x4f9fb0];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
    const x = -0.39 + c * 0.26;
    const y = 0.18 - r * 0.36;
    const hook = mesh(cyl(0.015, 0.015, 0.08, 8), metal(PAL.gold, 0.3));
    hook.rotation.x = Math.PI / 2;
    hook.position.set(x, y, 0.06);
    g.add(hook);
    if ((r * 4 + c) % 3 !== 1) {
      const tag = mesh(rbox(0.1, 0.16, 0.025, 0.02), paint(cols[(r + c) % 3], 0.5, 0.5));
      tag.position.set(x, y - 0.14, 0.05);
      const k = mesh(rbox(0.025, 0.1, 0.02, 0.008), metal(PAL.gold, 0.3));
      k.position.set(x, y - 0.03, 0.07);
      g.add(tag, k);
    }
  }
  return g;
}

/** Low cushioned bench under the shelves (first step of the cat's climb). */
export function makeBench(len: number): THREE.Group {
  const g = group();
  const wood = paint(PAL.wainscot, 0.5, 0.4);
  const top = mesh(rbox(len, 0.12, 0.75, 0.05), wood);
  top.position.y = 0.72;
  const cushion = mesh(rbox(len - 0.1, 0.16, 0.65, 0.08), fur(0xe2574c, 0.75));
  cushion.position.y = 0.86;
  g.add(top, cushion);
  for (const x of [-len / 2 + 0.12, len / 2 - 0.12]) for (const z of [-0.26, 0.26]) {
    const leg = mesh(cyl(0.05, 0.04, 0.68, 12), wood);
    leg.position.set(x, 0.34, z);
    g.add(leg);
  }
  return g;
}

/** Plump velvet armchair (faces +Z). */
export function makeArmchair(): THREE.Group {
  const g = group();
  const velvet = fur(0x7d4fa0, 0.7);
  const dark = fur(0x5f3a80, 0.7);
  const base = mesh(rbox(1.3, 0.5, 1.1, 0.16), velvet);
  base.position.y = 0.42;
  const seat = mesh(rbox(0.95, 0.24, 0.9, 0.12), fur(0x9a6cc0, 0.7));
  seat.position.set(0, 0.74, 0.06);
  const back = mesh(rbox(1.3, 0.95, 0.32, 0.16), velvet);
  back.position.set(0, 1.05, -0.42);
  back.rotation.x = -0.12;
  g.add(base, seat, back);
  for (const s of [-1, 1]) {
    const arm = mesh(rbox(0.26, 0.5, 1.1, 0.12), dark);
    arm.position.set(s * 0.58, 0.78, 0);
    const roll = mesh(caps(0.15, 0.85), velvet);
    roll.rotation.x = Math.PI / 2;
    roll.position.set(s * 0.58, 1.03, 0.02);
    g.add(arm, roll);
  }
  for (const x of [-0.5, 0.5]) for (const z of [-0.4, 0.4]) {
    const leg = mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.18, 12), paint(PAL.gold, 0.3, 0.6));
    leg.position.set(x, 0.09, z);
    g.add(leg);
  }
  const pillow = mesh(rbox(0.5, 0.42, 0.16, 0.14), fur(0xf0b13e, 0.75));
  pillow.position.set(0.18, 1.0, -0.15);
  pillow.rotation.set(-0.25, 0.2, 0.25);
  g.add(pillow);
  return g;
}

export function makePawCushion(color: number): THREE.Group {
  const g = group();
  const c = mesh(puck(0.42, 0.16, 0.08), fur(color, 0.8));
  c.position.y = 0.08;
  g.add(c);
  return g;
}

