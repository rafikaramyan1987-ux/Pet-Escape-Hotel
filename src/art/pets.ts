import * as THREE from 'three';
import { PAL } from './palette';
import {
  type Actor, at, blink, blushMat, caps, cyl, fur, glossy, group, makeEye, matte, mesh, metal, onSphere, paint, pulse, sph, torus,
} from './kit';
import { catBodyTexture, catHeadTexture, tailTexture } from './textures';

/**
 * The three playable pets. All face +Z, stand on y = 0, and are about 1.1 (dog), 1.15 (cat) and 0.7 (hamster)
 * units tall: big heads, big eyes, chunky bodies. `update(t)` plays the idle loop.
 */

export type PetKind = 'dog' | 'cat' | 'hamster';

function eyesOn(head: THREE.Object3D, c: THREE.Vector3, R: number, spread: number, up: number, r: number, opt: Parameters<typeof makeEye>[1] = {}) {
  const eyes: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const e = onSphere(makeEye(r, opt), c, R, [s * spread, up, 1], 0.93);
    head.add(e);
    eyes.push(e);
  }
  return eyes;
}

function cheeks(head: THREE.Object3D, c: THREE.Vector3, R: number, spread: number, up: number, r: number) {
  for (const s of [-1, 1]) {
    const b = onSphere(mesh(sph(r, 20, 12), blushMat(PAL.blush), false, false), c, R, [s * spread, up, 1], 0.985);
    b.scale.z = 0.25;
    head.add(b);
  }
}

function whiskers(head: THREE.Object3D, x: number, y: number, z: number, len: number) {
  const m = matte(0xfdf8f0, 0.6);
  for (const s of [-1, 1]) {
    for (const k of [-1, 0, 1]) {
      const w = mesh(cyl(0.006, 0.006, len, 6), m, false, false);
      w.position.set(x * s + s * len * 0.45, y + k * 0.025, z);
      w.rotation.set(0, 0, Math.PI / 2 + s * k * 0.16);
      head.add(w);
    }
  }
}

function setBlink(eyes: THREE.Group[], v: number) {
  for (const e of eyes) (e.userData.lens as THREE.Object3D).scale.y = v;
}

// ─── Dog: golden, floppy ears, red collar ─────────────────────────────────────────
export function makeDog(): Actor {
  const root = new THREE.Group();
  root.name = 'dog';
  const furM = fur(PAL.dogFur);
  const dark = fur(PAL.dogDark);
  const cream = fur(PAL.dogCream);

  const body = group();
  root.add(body);
  const torso = mesh(sph(0.36), furM);
  at(torso, 0, 0.44, -0.06);
  torso.scale.set(1, 0.86, 1.18);
  const chest = mesh(sph(0.25), cream);
  at(chest, 0, 0.45, 0.2);
  chest.scale.set(1, 1.05, 0.75);
  body.add(torso, chest);
  for (const x of [-0.19, 0.19]) {
    for (const z of [0.16, -0.3]) {
      const leg = mesh(caps(0.1, 0.14), furM);
      at(leg, x, 0.19, z);
      const paw = mesh(sph(0.115), cream);
      at(paw, x, 0.075, z + 0.04);
      paw.scale.set(1, 0.68, 1.2);
      body.add(leg, paw);
    }
  }
  // collar + tag
  const collar = mesh(torus(0.24, 0.062), paint(PAL.collar, 0.4, 0.6));
  at(collar, 0, 0.66, 0.16, Math.PI / 2 - 0.55, 0, 0);
  const tag = mesh(cyl(0.065, 0.065, 0.025, 24), metal(PAL.gold, 0.25));
  at(tag, 0, 0.56, 0.38, Math.PI / 2 - 0.3, 0, 0);
  body.add(collar, tag);

  // head
  const head = group();
  at(head, 0, 0.74, 0.24);
  body.add(head);
  const hc = new THREE.Vector3(0, 0.22, 0.08);
  const R = 0.37;
  const skull = mesh(sph(R), furM);
  skull.position.copy(hc);
  const muzzle = mesh(sph(0.19), cream);
  at(muzzle, 0, 0.1, 0.39);
  muzzle.scale.set(1.28, 0.82, 0.92);
  const nose = mesh(sph(0.07), glossy(PAL.nose));
  at(nose, 0, 0.17, 0.555);
  nose.scale.set(1.35, 0.92, 0.9);
  const tongue = mesh(sph(0.06), paint(0xf06a7c, 0.4, 0.5));
  at(tongue, 0.035, 0.0, 0.5, 0.5, 0, 0);
  tongue.scale.set(0.85, 0.45, 1.1);
  head.add(skull, muzzle, nose, tongue);
  const eyes = eyesOn(head, hc, R, 0.4, 0.26, 0.085);
  cheeks(head, hc, R, 0.68, -0.08, 0.07);
  // eyebrows (tan dots, very expressive)
  for (const s of [-1, 1]) {
    const b = onSphere(mesh(sph(0.04, 16, 10), fur(PAL.dogDark)), hc, R, [s * 0.38, 0.62, 1], 0.98);
    b.scale.set(1.3, 0.7, 0.5);
    head.add(b);
  }
  const ears: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const pivot = group();
    at(pivot, s * 0.27, 0.44, 0.02);
    const ear = mesh(sph(0.18), dark);
    at(ear, s * 0.07, -0.18, 0.02, 0, 0, s * 0.22);
    ear.scale.set(0.5, 1.15, 0.34);
    pivot.add(ear);
    head.add(pivot);
    ears.push(pivot);
  }
  // tail
  const tail = group();
  at(tail, 0, 0.58, -0.44);
  const tailM = mesh(caps(0.065, 0.24), furM);
  at(tailM, 0, 0.14, -0.08, -0.55, 0, 0);
  const tip = mesh(sph(0.075), cream);
  at(tip, 0, 0.29, -0.17);
  tail.add(tailM, tip);
  body.add(tail);

  return {
    root,
    update(t) {
      const br = Math.sin(t * 2.6);
      torso.scale.y = 0.86 * (1 + 0.03 * br);
      chest.scale.z = 0.75 * (1 + 0.04 * br);
      head.position.y = 0.74 + 0.012 * br;
      head.rotation.z = 0.07 * Math.sin(t * 0.9);
      head.rotation.x = -0.05 + 0.04 * Math.sin(t * 0.7 + 1);
      tail.rotation.y = 0.65 * Math.sin(t * 11);
      tail.rotation.x = -0.2;
      const tw = pulse(t, 4.3, 0.35, 1.2);
      ears[0].rotation.x = -0.35 * tw;
      ears[1].rotation.x = -0.35 * pulse(t, 5.1, 0.35, 3.0);
      ears[0].rotation.z = -0.08 * Math.sin(t * 1.3);
      ears[1].rotation.z = 0.08 * Math.sin(t * 1.3);
      setBlink(eyes, blink(t, 3.4, 0.6));
    },
  };
}

// ─── Cat: grey tabby, pointy ears, curly striped tail ────────────────────────────
export function makeCat(): Actor {
  const root = new THREE.Group();
  root.name = 'cat';
  const furM = fur(PAL.catFur);
  const cream = fur(PAL.catCream);
  const bodyTex = new THREE.MeshPhysicalMaterial({ map: catBodyTexture(), roughness: 0.8, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xdfe4ee) });
  const headTex = new THREE.MeshPhysicalMaterial({ map: catHeadTexture(), roughness: 0.8, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xdfe4ee) });
  const pink = paint(PAL.pink, 0.6, 0.2);

  const body = group();
  root.add(body);
  // sitting pose: body pear tilted up
  const torso = mesh(sph(0.33), bodyTex);
  at(torso, 0, 0.42, -0.06, Math.PI / 2 - 0.55, 0, 0);
  torso.scale.set(0.95, 1.22, 0.9);
  const chest = mesh(sph(0.2), cream);
  at(chest, 0, 0.5, 0.16);
  chest.scale.set(1, 1.2, 0.7);
  body.add(torso, chest);
  // front legs (straight, sitting) + back haunches
  for (const s of [-1, 1]) {
    const leg = mesh(caps(0.075, 0.26), furM);
    at(leg, s * 0.12, 0.2, 0.18);
    const paw = mesh(sph(0.09), cream);
    at(paw, s * 0.12, 0.06, 0.22);
    paw.scale.set(1, 0.7, 1.25);
    const haunch = mesh(sph(0.17), furM);
    at(haunch, s * 0.22, 0.17, -0.12);
    haunch.scale.set(0.8, 0.9, 1.25);
    const foot = mesh(sph(0.085), cream);
    at(foot, s * 0.24, 0.05, 0.04);
    foot.scale.set(1, 0.65, 1.4);
    body.add(leg, paw, haunch, foot);
  }

  const head = group();
  at(head, 0, 0.8, 0.12);
  body.add(head);
  const hc = new THREE.Vector3(0, 0.2, 0.06);
  const R = 0.35;
  const skull = mesh(sph(R), headTex);
  skull.position.copy(hc);
  skull.scale.set(1.1, 0.95, 1);
  head.add(skull);
  for (const s of [-1, 1]) {
    const cheek = mesh(sph(0.12), cream);
    at(cheek, s * 0.08, 0.07, 0.37);
    cheek.scale.set(1.05, 0.8, 0.8);
    head.add(cheek);
  }
  const chin = mesh(sph(0.07), cream);
  at(chin, 0, 0.0, 0.34);
  const nose = mesh(sph(0.04), glossy(0xe77d8d));
  at(nose, 0, 0.13, 0.45);
  nose.scale.set(1.3, 0.8, 0.8);
  head.add(chin, nose);
  const eyes = eyesOn(head, hc, R * 1.02, 0.42, 0.22, 0.095, { iris: PAL.catIris, slit: true });
  for (const e of eyes) e.rotation.z += (e.position.x > 0 ? 1 : -1) * 0.12;
  cheeks(head, hc, R * 1.05, 0.78, -0.12, 0.06);
  whiskers(head, 0.17, 0.08, 0.38, 0.22);
  const ears: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const pivot = group();
    at(pivot, s * 0.2, 0.44, 0.02, 0, 0, -s * 0.28);
    const ear = mesh(new THREE.ConeGeometry(0.13, 0.25, 4, 1), furM);
    at(ear, 0, 0.1, 0, 0, Math.PI / 4, 0);
    ear.scale.set(1, 1, 0.55);
    const inner = mesh(new THREE.ConeGeometry(0.075, 0.16, 4, 1), pink);
    at(inner, 0, 0.07, 0.045, 0, Math.PI / 4, 0);
    inner.scale.set(1, 1, 0.3);
    pivot.add(ear, inner);
    head.add(pivot);
    ears.push(pivot);
  }
  // tail
  const tail = group();
  at(tail, 0, 0.18, -0.4);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.05, 0.05, -0.22),
    new THREE.Vector3(0.15, 0.3, -0.32),
    new THREE.Vector3(0.22, 0.6, -0.26),
    new THREE.Vector3(0.18, 0.82, -0.08),
    new THREE.Vector3(0.08, 0.86, 0.04),
  ]);
  const tailTex = tailTexture();
  tailTex.wrapS = THREE.RepeatWrapping;
  const tube = mesh(new THREE.TubeGeometry(curve, 48, 0.06, 16, false), new THREE.MeshPhysicalMaterial({ map: tailTex, roughness: 0.8, sheen: 1, sheenColor: new THREE.Color(0xdfe4ee) }));
  const tip = mesh(sph(0.06), fur(PAL.catStripe));
  tip.position.copy(curve.getPoint(1));
  tail.add(tube, tip);
  body.add(tail);

  return {
    root,
    update(t) {
      const br = Math.sin(t * 2.2);
      torso.scale.z = 0.9 * (1 + 0.03 * br);
      chest.scale.z = 0.7 * (1 + 0.04 * br);
      head.position.y = 0.8 + 0.01 * br;
      head.rotation.z = 0.12 * Math.sin(t * 0.6);
      head.rotation.y = 0.1 * Math.sin(t * 0.35);
      tail.rotation.y = 0.35 * Math.sin(t * 1.6);
      tail.rotation.z = 0.12 * Math.sin(t * 1.6 + 0.8);
      ears[0].rotation.x = -0.4 * pulse(t, 3.9, 0.25, 0.4);
      ears[1].rotation.x = -0.4 * pulse(t, 6.2, 0.25, 2.2);
      setBlink(eyes, blink(t, 4.1, 1.7));
    },
  };
}

// ─── Hamster: an orange-cream ball with puffy cheeks ────────────────────────────
export function makeHamster(): Actor {
  const root = new THREE.Group();
  root.name = 'hamster';
  const furM = fur(PAL.hamFur);
  const cream = fur(PAL.hamCream);
  const pink = paint(PAL.pink, 0.55, 0.3);

  const body = group();
  root.add(body);
  const ball = mesh(sph(0.34), furM);
  at(ball, 0, 0.33, 0);
  ball.scale.set(1.06, 0.95, 1);
  const belly = mesh(sph(0.3), cream);
  at(belly, 0, 0.27, 0.09);
  belly.scale.set(0.95, 0.9, 0.9);
  body.add(ball, belly);
  // face
  const hc = new THREE.Vector3(0, 0.33, 0);
  const R = 0.34;
  const eyes = eyesOn(body, hc, R, 0.42, 0.38, 0.07);
  for (const s of [-1, 1]) {
    const puff = mesh(sph(0.13), cream);
    at(puff, s * 0.17, 0.25, 0.22);
    puff.scale.set(1, 0.88, 0.85);
    body.add(puff);
  }
  cheeks(body, hc, R * 1.08, 0.6, -0.05, 0.06);
  const nose = mesh(sph(0.03), glossy(0xe77d8d));
  at(nose, 0, 0.32, 0.345);
  const teeth = mesh(new THREE.BoxGeometry(0.05, 0.04, 0.012), matte(0xffffff, 0.4));
  at(teeth, 0, 0.255, 0.335);
  body.add(nose, teeth);
  whiskers(body, 0.1, 0.3, 0.33, 0.16);
  // stripe on the head
  const stripe = mesh(sph(0.12), fur(0xd97a2c));
  at(stripe, 0, 0.6, 0.06);
  stripe.scale.set(0.9, 0.35, 1.3);
  body.add(stripe);
  const ears: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const pivot = group();
    at(pivot, s * 0.19, 0.58, -0.02, 0, 0, -s * 0.35);
    const ear = mesh(sph(0.08), furM);
    ear.scale.set(1, 1, 0.45);
    const inner = mesh(sph(0.05), pink);
    at(inner, 0, 0, 0.02);
    inner.scale.set(1, 1, 0.4);
    pivot.add(ear, inner);
    body.add(pivot);
    ears.push(pivot);
  }
  // little paws holding a sunflower seed
  const hands = group();
  body.add(hands);
  for (const s of [-1, 1]) {
    const paw = mesh(sph(0.045), pink);
    at(paw, s * 0.055, 0.18, 0.34);
    paw.scale.set(1, 0.8, 0.9);
    hands.add(paw);
  }
  const seed = mesh(sph(0.05, 20, 12), paint(0x3a3232, 0.6, 0.1));
  at(seed, 0, 0.2, 0.37, 0.3, 0, 0);
  seed.scale.set(0.6, 1.25, 0.45);
  hands.add(seed);
  for (const s of [-1, 1]) {
    const foot = mesh(sph(0.06), pink);
    at(foot, s * 0.14, 0.03, 0.2);
    foot.scale.set(1, 0.5, 1.3);
    body.add(foot);
  }

  return {
    root,
    update(t) {
      const br = Math.sin(t * 4.2);
      body.scale.set(1 + 0.018 * br, 1 - 0.022 * br, 1 + 0.018 * br);
      const nib = pulse(t, 1.4, 0.5, 0);
      hands.position.y = 0.012 * Math.sin(t * 22) * nib;
      nose.position.y = 0.32 + 0.006 * Math.sin(t * 18);
      body.rotation.y = 0.08 * Math.sin(t * 0.8);
      ears[0].rotation.x = -0.5 * pulse(t, 3.3, 0.2, 0.9);
      ears[1].rotation.x = -0.5 * pulse(t, 3.3, 0.2, 1.05);
      setBlink(eyes, blink(t, 2.9, 0.2));
    },
  };
}

export function makePet(kind: PetKind): Actor {
  return kind === 'dog' ? makeDog() : kind === 'cat' ? makeCat() : makeHamster();
}

