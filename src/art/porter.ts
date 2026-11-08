import * as THREE from 'three';
import { PAL } from './palette';
import { type Actor, at, blink, blushMat, caps, cyl, fur, glossy, group, makeEye, mesh, metal, onSphere, paint, puck, rbox, sph, torus } from './kit';
import { coneBeam, glowSprite } from './fx';
import { zTexture } from './textures';

/**
 * Bernard, the friendly (and very sleepy) night porter: chunky toy proportions, peaked cap,
 * walrus moustache, flashlight with a real spot light + visible cone. Faces +Z, about 2.2 units tall.
 */
export interface Porter extends Actor {
  /** Spot light of the flashlight (aim it with `aim`). */
  light: THREE.SpotLight;
  /** Point the flashlight is aimed at, in porter-local space; animated by update(). */
  aim: THREE.Vector3;
}

export function makePorter(opts: { cone?: boolean; zzz?: boolean } = {}): Porter {
  const root = new THREE.Group();
  root.name = 'porter';
  const uni = paint(PAL.uniform, 0.62, 0.15);
  const uniDark = paint(PAL.uniformDark, 0.6, 0.15);
  const gold = metal(PAL.gold, 0.3);
  const skin = paint(PAL.skin, 0.6, 0.1);

  const body = group();
  root.add(body);
  // legs + shoes
  for (const s of [-1, 1]) {
    const leg = mesh(caps(0.16, 0.16), paint(PAL.trouser, 0.7, 0));
    at(leg, s * 0.2, 0.3, 0);
    const shoe = mesh(rbox(0.26, 0.16, 0.4, 0.07), glossy(PAL.shoe));
    at(shoe, s * 0.21, 0.08, 0.07);
    body.add(leg, shoe);
  }
  // torso: bean-shaped jacket
  const torso = group();
  at(torso, 0, 0.46, 0);
  body.add(torso);
  const jacketProfile: THREE.Vector2[] = [];
  const prof = [[0, 0], [0.4, 0.02], [0.52, 0.18], [0.55, 0.42], [0.5, 0.68], [0.4, 0.86], [0.24, 0.96], [0, 0.98]];
  for (const [x, y] of prof) jacketProfile.push(new THREE.Vector2(x, y));
  const jacketGeo = new THREE.LatheGeometry(new THREE.SplineCurve(jacketProfile).getPoints(40), 48);
  const jacket = mesh(jacketGeo, uni);
  jacket.scale.set(1.08, 1, 0.86);
  torso.add(jacket);
  const hem = mesh(torus(0.4, 0.04), gold);
  at(hem, 0, 0.06, 0, Math.PI / 2, 0, 0);
  hem.scale.set(1.02, 0.82, 1);
  const belt = mesh(torus(0.54, 0.05), uniDark);
  at(belt, 0, 0.32, 0, Math.PI / 2, 0, 0);
  belt.scale.set(1, 0.82, 1);
  const buckle = mesh(rbox(0.14, 0.11, 0.04, 0.02), gold);
  at(buckle, 0, 0.32, 0.46);
  torso.add(hem, belt, buckle);
  for (const y of [0.5, 0.64, 0.78]) {
    const b = mesh(sph(0.035, 16, 10), gold);
    at(b, 0, y, 0.43 - (y - 0.5) * 0.35);
    torso.add(b);
  }
  const tagM = mesh(rbox(0.16, 0.06, 0.02, 0.01), gold);
  at(tagM, 0.24, 0.66, 0.36, -0.25, 0.45, 0);
  torso.add(tagM);
  // epaulettes
  for (const s of [-1, 1]) {
    const ep = mesh(rbox(0.2, 0.05, 0.16, 0.025), gold);
    at(ep, s * 0.36, 0.86, 0, 0, 0, s * -0.35);
    torso.add(ep);
  }

  // arms
  const armL = group();
  at(armL, -0.6, 0.8, 0);
  const upperL = mesh(caps(0.13, 0.36), uni);
  at(upperL, 0, -0.24, 0);
  const handL = mesh(sph(0.11), skin);
  at(handL, 0, -0.5, 0.02);
  const cuffL = mesh(torus(0.1, 0.03), gold);
  at(cuffL, 0, -0.4, 0, Math.PI / 2, 0, 0);
  armL.add(upperL, handL, cuffL);
  // key ring dangling from the left hand
  const ring = mesh(torus(0.06, 0.012), gold);
  at(ring, 0, -0.62, 0.05);
  const key = mesh(rbox(0.04, 0.14, 0.015, 0.008), gold);
  at(key, 0.02, -0.72, 0.05, 0, 0, 0.3);
  armL.add(ring, key);
  armL.rotation.z = 0.2;
  torso.add(armL);

  const armR = group();
  at(armR, 0.6, 0.8, 0);
  const upperR = mesh(caps(0.13, 0.36), uni);
  at(upperR, 0, -0.24, 0);
  const handR = mesh(sph(0.11), skin);
  at(handR, 0, -0.5, 0.02);
  const cuffR = mesh(torus(0.1, 0.03), gold);
  at(cuffR, 0, -0.4, 0, Math.PI / 2, 0, 0);
  armR.add(upperR, handR, cuffR);
  // flashlight in the right hand, pointing along the arm's -Y initially; we tilt the arm forward
  const flash = group();
  at(flash, 0, -0.52, 0.06);
  const barrel = mesh(cyl(0.05, 0.05, 0.32, 20), paint(0x3d4052, 0.4, 0.5));
  at(barrel, 0, 0, 0.08, Math.PI / 2, 0, 0);
  const headF = mesh(cyl(0.085, 0.06, 0.12, 24), paint(0xf2c84b, 0.35, 0.6));
  at(headF, 0, 0, 0.27, Math.PI / 2, 0, 0);
  const lens = mesh(cyl(0.075, 0.075, 0.01, 24), new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 4 }));
  at(lens, 0, 0, 0.335, Math.PI / 2, 0, 0);
  flash.add(barrel, headF, lens);
  armR.add(flash);
  torso.add(armR);

  // head
  const head = group();
  at(head, 0, 0.98, 0.02);
  head.scale.setScalar(1.22);
  torso.add(head);
  const hc = new THREE.Vector3(0, 0.4, 0.04);
  const R = 0.42;
  const skull = mesh(sph(R), skin);
  skull.position.copy(hc);
  head.add(skull);
  const neck = mesh(cyl(0.18, 0.2, 0.12), skin);
  at(neck, 0, 0.02, 0);
  const collar = mesh(torus(0.2, 0.05), uniDark);
  at(collar, 0, 0.02, 0, Math.PI / 2, 0, 0);
  head.add(neck, collar);
  for (const s of [-1, 1]) {
    const ear = mesh(sph(0.09), skin);
    at(ear, s * 0.41, 0.38, 0.02);
    ear.scale.set(0.5, 1, 0.8);
    head.add(ear);
  }
  const nose = mesh(sph(0.11), paint(PAL.skinShade, 0.5, 0.1));
  at(nose, 0, 0.36, 0.46);
  nose.scale.set(1.1, 0.95, 0.9);
  head.add(nose);
  for (const s of [-1, 1]) {
    const m = mesh(sph(0.13), fur(PAL.mustache, 0.85));
    at(m, s * 0.13, 0.25, 0.4, 0, -s * 0.4, s * 0.3);
    m.scale.set(1.25, 0.55, 0.6);
    head.add(m);
    const curl = mesh(sph(0.055), fur(PAL.mustache, 0.85));
    at(curl, s * 0.26, 0.3, 0.32);
    head.add(curl);
  }
  // sleepy half-closed eyes: dark eye + skin-coloured eyelid
  const eyes: THREE.Group[] = [];
  const lids: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const e = onSphere(makeEye(0.075), hc, R, [s * 0.36, 0.22, 1], 0.95);
    head.add(e);
    eyes.push(e);
    const lid = mesh(sph(0.088, 24, 16, ), skin, false, false);
    lid.position.copy(e.position);
    lid.quaternion.copy(e.quaternion);
    head.add(lid);
    lids.push(lid);
    const brow = onSphere(mesh(caps(0.022, 0.09), fur(PAL.mustache)), hc, R, [s * 0.36, 0.5, 1], 1.0);
    brow.rotateZ(Math.PI / 2 + s * 0.25);
    head.add(brow);
  }
  for (const s of [-1, 1]) {
    const b = onSphere(mesh(sph(0.075, 20, 12), blushMat(PAL.blush), false, false), hc, R, [s * 0.62, -0.02, 1], 0.99);
    b.scale.z = 0.25;
    head.add(b);
  }
  // cap
  const cap = group();
  at(cap, 0, 0.7, -0.02, -0.3, 0, 0);
  head.add(cap);
  const band = mesh(cyl(0.38, 0.4, 0.16, 48), uniDark);
  const crown = mesh(puck(0.47, 0.13, 0.06), uni);
  at(crown, 0, 0.14, -0.02);
  const goldBand = mesh(torus(0.39, 0.025), gold);
  at(goldBand, 0, -0.04, 0, Math.PI / 2, 0, 0);
  const visor = mesh(cyl(0.34, 0.34, 0.04, 32, ), glossy(0x1d1f2e));
  at(visor, 0, -0.08, 0.24, 0.25, 0, 0);
  visor.scale.set(1, 1, 0.62);
  const badge = mesh(rbox(0.13, 0.1, 0.03, 0.02), gold);
  at(badge, 0, 0.05, 0.4, -0.2, 0, 0);
  cap.add(band, crown, goldBand, visor, badge);

  // light
  const light = new THREE.SpotLight(0xffe6b0, 60, 14, 0.42, 0.55, 1.6);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.0004;
  light.shadow.radius = 4;
  light.shadow.camera.near = 0.2;
  flash.add(light);
  light.position.set(0, 0, 0.34);
  const target = new THREE.Object3D();
  root.add(target);
  light.target = target;
  const aim = new THREE.Vector3(0, 0, 3);

  let cone: THREE.Mesh | null = null;
  if (opts.cone !== false) {
    cone = coneBeam(1.15, 4.2, 0xffe2a0, 0.16);
    flash.add(cone);
    cone.position.set(0, 0, 0.34);
    cone.rotation.x = -Math.PI / 2;
  }
  const flare = glowSprite(0xfff0c8, 0.7, 0.9);
  flare.position.set(0, 0, 0.36);
  flash.add(flare);

  // Zzz
  const zs: THREE.Sprite[] = [];
  if (opts.zzz !== false) {
    const zm = zTexture();
    for (let i = 0; i < 3; i++) {
      const z = new THREE.Sprite(new THREE.SpriteMaterial({ map: zm, transparent: true, depthWrite: false }));
      z.userData.noAO = true;
      root.add(z);
      zs.push(z);
    }
  }

  const tmp = new THREE.Vector3();
  const q = new THREE.Quaternion();
  return {
    root,
    light,
    aim,
    update(t) {
      const br = Math.sin(t * 1.6);
      torso.scale.set(1 + 0.012 * br, 1 + 0.02 * br, 1 + 0.015 * br);
      // sleepy nod: slow droop then a little jerk back up
      const nodPhase = (t % 6.5) / 6.5;
      const nod = nodPhase < 0.85 ? nodPhase / 0.85 : 1 - (nodPhase - 0.85) / 0.15;
      head.rotation.x = 0.04 + 0.16 * nod * nod;
      head.rotation.z = 0.05 * Math.sin(t * 0.7);
      body.rotation.y = 0.04 * Math.sin(t * 0.5);
      const lidK = 0.5 + 0.18 * nod;
      for (const [i, lid] of lids.entries()) {
        // top half of the eye covered: shift lid up/down along its local Y
        lid.scale.set(1, 1, 0.6);
        lid.position.copy(eyes[i].position);
        lid.translateY(0.1 - lidK * 0.1);
        lid.translateZ(0.012);
      }
      for (const e of eyes) (e.userData.lens as THREE.Object3D).scale.y = blink(t, 5.3, 2) * (1 - 0.4 * nod);
      armL.rotation.x = 0.06 * Math.sin(t * 1.6);
      // flashlight sweep (in porter space)
      const sweep = Math.sin(t * 0.55);
      tmp.set(aim.x + sweep * 1.2, aim.y, aim.z);
      root.updateMatrixWorld(true);
      // aim the right arm so the flashlight (local +Z) points at the target
      const shoulder = new THREE.Vector3();
      armR.getWorldPosition(shoulder);
      const goalW = root.localToWorld(tmp.clone());
      target.position.copy(tmp);
      const dirW = goalW.sub(shoulder).normalize();
      const parentQ = new THREE.Quaternion();
      torso.getWorldQuaternion(parentQ);
      const dirL = dirW.applyQuaternion(parentQ.invert());
      // arm points down -Y, flashlight forward +Z: rotate arm so that its local (0,-0.55,0.85) faces dirL
      const armAxis = new THREE.Vector3(0, -0.6, 0.8).normalize();
      q.setFromUnitVectors(armAxis, dirL);
      armR.quaternion.copy(q);
      flash.rotation.set(Math.atan2(0.6, 0.8), 0, 0);
      for (const [i, z] of zs.entries()) {
        const p = ((t * 0.32 + i / 3) % 1 + 1) % 1;
        z.position.set(-0.35 - p * 0.5 + Math.sin(p * 6 + i) * 0.08, 2.35 + p * 0.9, 0.1);
        const s = 0.18 + p * 0.22;
        z.scale.set(s, s, 1);
        (z.material as THREE.SpriteMaterial).opacity = Math.sin(p * Math.PI) * 0.95;
      }
      if (cone) cone.visible = true;
    },
  };
}

