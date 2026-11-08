import * as THREE from 'three';
import { buildLobby, ROOM, type Lobby } from '../art/lobby';
import { type Actor, at, fur, group, mesh, paint, puck } from '../art/kit';
import { makeCat, makeDog, makeHamster } from '../art/pets';
import { makePorter } from '../art/porter';
import { makeBone, makePlant } from '../art/props';
import { glowSprite } from '../art/fx';
import { gradientTexture } from '../art/textures';
import { ICON } from '../ui/icons';
import { fitCamera, orbit } from '../render/frame';
import { characterLook } from '../art/look';

/** The art-direction shots, all rendered from the real scene. */
export type ShotName = 'gameplay' | 'lineup' | 'title' | 'turntable';

export interface Shot {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Pose everything (and the camera) for time t. */
  update(t: number): void;
  /** Optional DOM overlay positioned from 3D (labels). */
  overlay?(ui: HTMLElement): void;
  bloom?: [number, number, number];
  vignette?: number;
}

/** Corners of the lobby diorama (floor slab + wall tops). */
function roomHull(): THREE.Vector3[] {
  const { x0, x1, z0, z1, wallH, wallT } = ROOM;
  return [
    new THREE.Vector3(x0 - wallT, -0.7, z1 + 0.35), new THREE.Vector3(x1 + 0.35, -0.7, z1 + 0.35), new THREE.Vector3(x1 + 0.35, -0.7, z0 - wallT),
    new THREE.Vector3(x0 - wallT, wallH, z0 - wallT), new THREE.Vector3(x1, wallH, z0 - wallT), new THREE.Vector3(x0 - wallT, wallH, z1),
  ];
}

function nightBackground(): THREE.Texture {
  return gradientTexture([[0, '#0e0c26'], [0.55, '#221d4f'], [1, '#3a2a5e']]);
}

function lobbyScene(opts?: Parameters<typeof buildLobby>[0]): { scene: THREE.Scene; lobby: Lobby } {
  const scene = new THREE.Scene();
  scene.background = nightBackground();
  const lobby = buildLobby(opts);
  scene.add(lobby.root);
  return { scene, lobby };
}

export function makeShot(name: ShotName, aspect: number): Shot {
  switch (name) {
    case 'gameplay': return gameplayShot(aspect);
    case 'turntable': return turntableShot(aspect);
    case 'lineup': return lineupShot(aspect);
    case 'title': return titleShot(aspect);
  }
}

function gameplayShot(aspect: number): Shot {
  const { scene, lobby } = lobbyScene();
  const portrait = aspect < 1;
  const camera = new THREE.PerspectiveCamera(portrait ? 30 : 26, aspect, 0.5, 120);
  if (portrait) fitCamera(camera, roomHull(), 16, 55, { x0: -1.08, x1: 1.08, y0: -0.7, y1: 0.84 });
  else fitCamera(camera, roomHull(), 40, 46, { x0: -0.9, x1: 0.9, y0: -1.04, y1: 0.98 });
  lobby.pinMoon(camera);
  return {
    scene,
    camera,
    update(t) {
      lobby.update(t);
    },
    bloom: [0.6, 0.6, 1.0],
  };
}

function turntableShot(aspect: number): Shot {
  const { scene, lobby } = lobbyScene();
  const camera = new THREE.PerspectiveCamera(26, aspect, 0.5, 120);
  const hull = roomHull();
  return {
    scene,
    camera,
    update(t) {
      // 10 s: slow ease-in-out swing from the right corner towards the kennels, gentle dolly-in mid-way
      const u = THREE.MathUtils.smootherstep(t / 10, 0, 1);
      const { target, dist } = fitCamera(camera, hull, 58 - 44 * u, 44 - 6 * Math.sin(u * Math.PI), { x0: -0.9, x1: 0.9, y0: -0.92, y1: 0.92 });
      orbit(camera, target, 58 - 44 * u, 44 - 6 * Math.sin(u * Math.PI), dist * (1 - 0.1 * Math.sin(u * Math.PI)));
      lobby.pinMoon(camera);
      lobby.update(t);
    },
    bloom: [0.6, 0.6, 1.0],
  };
}

function titleShot(aspect: number): Shot {
  const { scene, lobby } = lobbyScene({ pets: false });
  const camera = new THREE.PerspectiveCamera(30, aspect, 0.3, 120);
  const dog = makeDog();
  const cat = makeCat();
  const ham = makeHamster();
  at(dog.root, 1.25, 0, 5.15, 0, 0.3, 0);
  dog.root.scale.setScalar(1.6);
  at(cat.root, -1.25, 0, 4.75, 0, 0.6, 0);
  cat.root.scale.setScalar(1.55);
  // hamster on a cushion between them
  const cushion = mesh(puck(0.5, 0.24, 0.1), fur(0xe2574c, 0.75));
  at(cushion, 0.05, 0.12, 5.85);
  at(ham.root, 0.05, 0.24, 5.85, 0, 0.42, 0);
  ham.root.scale.setScalar(1.35);
  for (const a of [dog, cat, ham]) characterLook(a.root, 0xd6e0ff, 0.55, true);
  characterLook(lobby.porter.root, 0xd6e0ff, 0.45, true);
  scene.add(dog.root, cat.root, ham.root, cushion);
  const bones: Actor[] = [];
  for (const [x, z, ph] of [[2.55, 5.7, 0], [-2.45, 5.6, 1.5]] as const) {
    const b = makeBone(ph);
    at(b.root, x, 0, z);
    b.root.scale.setScalar(1.4);
    scene.add(b.root);
    bones.push(b);
  }
  // porter dozing by the desk in the background
  lobby.porter.root.position.set(2.9, 0, -0.9);
  lobby.porter.root.rotation.y = -0.45;
  const porterFill = new THREE.PointLight(0xffc98a, 6, 5, 1.5);
  porterFill.position.set(3.6, 3.2, 0.6);
  scene.add(porterFill);
  lobby.porter.root.scale.setScalar(1.25);
  lobby.porter.aim.set(-0.6, 0, 3.2);
  // covers come in three shapes: frame the heroes for each (the logo goes where the top-left stays clear)
  if (aspect < 0.9) {
    camera.fov = 40;
    camera.updateProjectionMatrix();
    orbit(camera, new THREE.Vector3(0.1, 1.2, 3.2), 22, 30, 15.5);
  } else if (aspect < 1.2) {
    camera.fov = 36;
    camera.updateProjectionMatrix();
    orbit(camera, new THREE.Vector3(0.1, 0.2, 4.6), 22, 30, 15);
  } else orbit(camera, new THREE.Vector3(0.1, 2.0, 2.4), 22, 21, 15);
  lobby.pinMoon(camera);
  // warm key light on the heroes
  const key = new THREE.SpotLight(0xffd6a0, 40, 20, 0.5, 0.8, 1.2);
  key.position.set(4, 8, 12);
  key.target.position.set(0, 0.6, 5.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 5;
  key.shadow.bias = -0.0004;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x8fa6ff, 1.4);
  rim.position.set(-6, 5, -6);
  scene.add(rim);
  return {
    scene,
    camera,
    update(t) {
      lobby.update(t);
      dog.update(t);
      cat.update(t + 0.7);
      ham.update(t + 1.4);
      for (const b of bones) b.update(t);
    },
    bloom: [0.7, 0.7, 1.0],
    vignette: 0.5,
    overlay(ui) {
      const layered = (cls: string, text: string) => `<span class="${cls}"><span class="sh">${text}</span><span class="ol">${text}</span><span class="fg">${text}</span></span>`;
      const layout = aspect < 0.9 ? 'cover-portrait' : aspect < 1.2 ? 'cover-square' : '';
      ui.innerHTML = `<div class="logo ${layout}">${layered('l1', 'PET ESCAPE')}${layered('l2', 'HOTEL')}<span class="moon">${ICON.moon}</span><br/><span class="plate">${ICON.paw} SNEAK · SWITCH · ESCAPE ${ICON.paw}</span></div>`;
    },
  };
}

function lineupShot(aspect: number): Shot {
  const scene = new THREE.Scene();
  scene.background = nightBackground();
  const camera = new THREE.PerspectiveCamera(24, aspect, 0.5, 100);
  const floor = mesh(new THREE.CircleGeometry(14, 96), new THREE.MeshStandardMaterial({ color: 0x3a2f63, roughness: 0.9 }), false, true);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  // backdrop arc (soft cyclorama)
  const cyc = mesh(new THREE.CylinderGeometry(13, 13, 12, 96, 1, true, Math.PI * 0.6, Math.PI * 0.8), new THREE.MeshStandardMaterial({ color: 0x2b2457, roughness: 1, side: THREE.BackSide }), false, true);
  cyc.position.set(0, 6, 3);
  scene.add(cyc);

  const cast: { actor: Actor; x: number; s: number; color: number; name: string; species: string; role: string; icon: string; staff?: boolean; h: number }[] = [
    { actor: makeDog(), x: -4.6, s: 1.45, color: 0xf0b13e, name: 'Biscuit', species: 'the Dog', role: 'Digs under fences', icon: ICON.dig, h: 1.15 },
    { actor: makeCat(), x: -1.55, s: 1.45, color: 0x4f9fb0, name: 'Miso', species: 'the Cat', role: 'Jumps onto shelves', icon: ICON.jump, h: 1.2 },
    { actor: makeHamster(), x: 1.5, s: 1.6, color: 0xe2574c, name: 'Peanut', species: 'the Hamster', role: 'Squeezes through pipes', icon: ICON.pipe, h: 0.72 },
    { actor: makePorter({ cone: false }), x: 4.6, s: 1.0, color: 0x7b86d8, name: 'Bernard', species: 'the Night Porter', role: 'Patrols with a flashlight', icon: ICON.eye, staff: true, h: 2.6 },
  ];
  for (const c of cast) {
    const ped = group();
    const base = mesh(puck(1.05, 0.34, 0.12), paint(0xfbf0d6, 0.5, 0.35));
    base.position.y = 0.17;
    const band = mesh(puck(1.09, 0.1, 0.04), paint(c.color, 0.45, 0.5));
    band.position.y = 0.12;
    const glowRing = glowSprite(c.color, 3.2, 0.25);
    glowRing.position.y = 0.1;
    ped.add(base, band, glowRing);
    at(ped, c.x, 0, 0);
    scene.add(ped);
    at(c.actor.root, c.x, 0.34, 0.05, 0, c.staff ? -0.25 : 0.12, 0);
    c.actor.root.scale.setScalar(c.s);
    scene.add(c.actor.root);
    // soft pool of light on each pedestal
    const pool = new THREE.SpotLight(0xffe0b0, 30, 12, 0.32, 0.9, 1.2);
    pool.position.set(c.x + 1.0, 6.5, 4);
    pool.target.position.set(c.x, 0.6, 0);
    scene.add(pool, pool.target);
  }
  const porter = cast[3].actor as ReturnType<typeof makePorter>;
  porter.aim.set(-1.2, 0.2, 1.6);
  const plantL = makePlant('tall', 2);
  at(plantL, -7.4, 0, -2.6);
  const plantR = makePlant('bush', 5);
  at(plantR, 7.2, 0, -2.2);
  scene.add(plantL, plantR);

  scene.add(new THREE.HemisphereLight(0x8a93e0, 0x5a3a40, 1.0));
  const key = new THREE.DirectionalLight(0xffd9a8, 2.2);
  key.position.set(4, 8, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: 6, bottom: -4, near: 1, far: 30 });
  key.shadow.radius = 4;
  key.shadow.bias = -0.0004;
  const rim = new THREE.DirectionalLight(0x8fa6ff, 2.6);
  rim.position.set(-3, 5, -8);
  scene.add(key, rim);
  orbit(camera, new THREE.Vector3(0, 1.3, 0), 0, 8, 20.5);
  camera.updateMatrixWorld();
  porter.light.intensity = 12;

  return {
    scene,
    camera,
    update(t) {
      for (const [i, c] of cast.entries()) c.actor.update(t + i * 0.9);
    },
    bloom: [0.45, 0.6, 1.0],
    vignette: 0.55,
    overlay(ui) {
      const v = new THREE.Vector3();
      camera.updateMatrixWorld();
      const w = ui.clientWidth;
      const h = ui.clientHeight;
      const labels = cast.map((c) => {
        v.set(c.x, -0.15, 0.9).project(camera);
        const x = ((v.x + 1) / 2) * w;
        const y = ((1 - v.y) / 2) * h;
        return `<div class="label ${c.staff ? 'staff' : ''}" style="left:${x}px; top:${y}px"><span class="nm">${c.name}</span><span class="species">${c.species}</span><span class="role"><i>${c.icon}</i>${c.role}</span></div>`;
      });
      ui.innerHTML = `<div class="sheet-title">The Night Crew<small>PET ESCAPE HOTEL · CHARACTERS</small></div><div class="labels">${labels.join('')}</div>`;
    },
  };
}
