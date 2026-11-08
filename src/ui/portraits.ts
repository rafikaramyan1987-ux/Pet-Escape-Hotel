import * as THREE from 'three';
import type { PetKind } from '../core/level';
import { applyCosmetics } from '../art/look';
import { makePet, type Fur } from '../art/pets';
import type { Look } from '../game/save';
import { item } from '../game/shop';

/** Render round head portraits of the pets from the real 3D models (used by the pet switcher). */
export function renderPortraits(size = 256, looks?: Record<PetKind, Look>): Record<PetKind, string> {
  const canvas = document.createElement('canvas');
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(size, size, false);
  r.toneMapping = THREE.NeutralToneMapping;
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.setClearColor(0x000000, 0);
  const out = {} as Record<PetKind, string>;
  // the hamster is framed whole (a round ball with little ears) so it never reads as "another dog face"
  const frames: Record<PetKind, { y: number; dist: number; t: number }> = {
    dog: { y: 0.95, dist: 2.2, t: 0.3 },
    cat: { y: 0.98, dist: 2.2, t: 0.4 },
    hamster: { y: 0.34, dist: 2.35, t: 0.5 },
  };
  for (const kind of ['dog', 'cat', 'hamster'] as const) {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xc9d2ff, 0x7a5040, 1.6));
    const key = new THREE.DirectionalLight(0xffe2b8, 2.6);
    key.position.set(2, 3, 4);
    const rim = new THREE.DirectionalLight(0x9fb4ff, 2.4);
    rim.position.set(-3, 2, -2);
    scene.add(key, rim);
    const look = looks?.[kind];
    const skin = look && look.skin !== 'default' ? (item(look.skin)?.fur as Fur | undefined) : undefined;
    const pet = makePet(kind, skin);
    if (look) applyCosmetics(pet.root, look);
    pet.update(frames[kind].t);
    pet.root.rotation.y = kind === 'hamster' ? -0.1 : -0.25;
    scene.add(pet.root);
    const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
    const f = frames[kind];
    cam.position.set(0.25, f.y + 0.25 + (look && look.hat !== 'none' ? 0.1 : 0), f.dist + (look && look.hat !== 'none' ? 0.3 : 0));
    cam.lookAt(0, f.y - 0.02 + (look && look.hat !== 'none' ? 0.08 : 0), 0);
    r.render(scene, cam);
    out[kind] = canvas.toDataURL('image/png');
  }
  r.dispose();
  r.forceContextLoss();
  return out;
}
