import * as THREE from 'three';
import type { Look } from '../game/save';
import { item } from '../game/shop';
import { caps, cyl, group, mesh, metal, paint, puck, sph, torus } from './kit';

/**
 * Readability pass for characters: a soft fresnel rim light baked into their materials, and a thin ink
 * outline (inverted hull) on the larger parts, so pets and staff pop out of the dark rooms.
 */
const rimCache = new Map<string, THREE.Material>();

function withRim(m: THREE.Material, color: THREE.Color, strength: number): THREE.Material {
  const keyStr = `${m.uuid}|${color.getHexString()}|${strength}`;
  const hit = rimCache.get(keyStr);
  if (hit) return hit;
  if (!(m instanceof THREE.MeshStandardMaterial) || m.transparent) return m;
  const c = m.clone();
  c.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = { value: color.clone().multiplyScalar(strength) };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.6);\n  totalEmissiveRadiance += uRim * rimF;',
      );
  };
  c.customProgramCacheKey = () => `rim${strength}${color.getHexString()}`;
  rimCache.set(keyStr, c);
  return c;
}

let outlineMat: THREE.MeshBasicMaterial | null = null;
function outlineMaterial(): THREE.MeshBasicMaterial {
  if (outlineMat) return outlineMat;
  outlineMat = new THREE.MeshBasicMaterial({ color: 0x1a1030, side: THREE.BackSide });
  outlineMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normalize(normal) * 0.018;');
  };
  outlineMat.customProgramCacheKey = () => 'outline';
  return outlineMat;
}

export function characterLook(root: THREE.Object3D, rim = 0xbfd0ff, strength = 0.55, outline = true): void {
  const color = new THREE.Color(rim);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.noAO && !m.userData.isOutline) meshes.push(m);
  });
  for (const m of meshes) {
    if (Array.isArray(m.material)) continue;
    m.material = withRim(m.material, color, strength);
    if (!outline || (m.material as THREE.Material).transparent || m.material instanceof THREE.MeshBasicMaterial) continue;
    m.geometry.computeBoundingSphere();
    const r = m.geometry.boundingSphere!.radius * Math.max(m.scale.x, m.scale.y, m.scale.z);
    if (r < 0.07) continue;
    const o = new THREE.Mesh(m.geometry, outlineMaterial());
    o.userData.isOutline = true;
    o.userData.noAO = true;
    o.castShadow = false;
    o.receiveShadow = false;
    m.add(o);
  }
}

// ─── cosmetics ───────────────────────────────────────────────────────────────
function makeHat(id: string): THREE.Object3D | null {
  const it = item(id);
  if (!it || id === 'none') return null;
  const c = it.color ?? 0xffffff;
  const g = group();
  switch (id) {
    case 'nightcap': {
      const cone = mesh(new THREE.ConeGeometry(0.2, 0.45, 24), paint(c, 0.8, 0));
      cone.position.y = 0.2;
      cone.rotation.z = -0.5;
      const pom = mesh(sph(0.07), paint(0xffffff, 0.9, 0));
      pom.position.set(0.2, 0.36, 0);
      const rim = mesh(torus(0.19, 0.05), paint(0xffffff, 0.9, 0));
      rim.rotation.x = Math.PI / 2;
      g.add(cone, pom, rim);
      break;
    }
    case 'party': {
      const cone = mesh(new THREE.ConeGeometry(0.16, 0.38, 24), paint(c, 0.4, 0.6));
      cone.position.y = 0.19;
      const pom = mesh(sph(0.06), paint(0xf0bd4f, 0.4, 0.5));
      pom.position.y = 0.4;
      const dots = mesh(torus(0.12, 0.02), paint(0xf0bd4f, 0.4, 0.5));
      dots.position.y = 0.12;
      dots.rotation.x = Math.PI / 2;
      g.add(cone, pom, dots);
      break;
    }
    case 'bellhop': {
      const b = mesh(cyl(0.17, 0.19, 0.18, 32), paint(c, 0.45, 0.4));
      b.position.y = 0.08;
      const band = mesh(torus(0.185, 0.02), metal(0xf0bd4f, 0.3));
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.03;
      const top = mesh(puck(0.17, 0.04, 0.02), paint(c, 0.45, 0.4));
      top.position.y = 0.18;
      g.add(b, band, top);
      g.rotation.z = 0.2;
      break;
    }
    case 'crown': {
      const ring = mesh(cyl(0.18, 0.16, 0.1, 6, ), metal(c, 0.25));
      ring.position.y = 0.05;
      g.add(ring);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const sp = mesh(new THREE.ConeGeometry(0.04, 0.12, 8), metal(c, 0.25));
        sp.position.set(Math.cos(a) * 0.16, 0.15, Math.sin(a) * 0.16);
        const gem = mesh(sph(0.025), paint(i % 2 ? 0xe2574c : 0x4f9fb0, 0.2, 1));
        gem.position.set(Math.cos(a) * 0.175, 0.06, Math.sin(a) * 0.175);
        g.add(sp, gem);
      }
      break;
    }
    case 'flower': {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const p = mesh(sph(0.07, 16, 10), paint(c, 0.6, 0.2));
        p.position.set(Math.cos(a) * 0.08, 0.05, Math.sin(a) * 0.08);
        p.scale.y = 0.5;
        g.add(p);
      }
      const mid = mesh(sph(0.05, 16, 10), paint(0xf0bd4f, 0.5, 0.3));
      mid.position.y = 0.07;
      g.add(mid);
      g.position.x = 0.14;
      g.rotation.z = -0.4;
      break;
    }
  }
  return g;
}

export function applyCosmetics(root: THREE.Object3D, look: Look): void {
  const ud = root.userData;
  const head = ud.head as THREE.Object3D | undefined;
  if (ud.hatObj) {
    (ud.hatObj as THREE.Object3D).removeFromParent();
    ud.hatObj = null;
  }
  const hat = makeHat(look.hat);
  if (hat && head) {
    hat.position.add(ud.hatAt as THREE.Vector3);
    hat.scale.setScalar(ud.hatScale as number);
    head.add(hat);
    ud.hatObj = hat;
  }
  const collar = ud.collar as THREE.Mesh | undefined;
  if (collar) {
    if (ud.bow) {
      (ud.bow as THREE.Object3D).removeFromParent();
      ud.bow = null;
    }
    const it = item(look.collar);
    const base = (root.name === 'hamster') ? look.collar !== 'default' : true;
    collar.visible = base;
    const r = (collar.geometry as THREE.TorusGeometry).parameters.radius;
    const col = look.collar === 'default' ? 0xe0383e : it?.color ?? 0xe0383e;
    collar.material = look.collar === 'gold' ? metal(col, 0.25) : paint(col, 0.4, 0.6);
    if (look.collar === 'bow') {
      const bow = group();
      for (const s of [-1, 1]) {
        const w = mesh(new THREE.ConeGeometry(0.07, 0.12, 12), paint(col, 0.4, 0.6));
        w.rotation.z = (s * Math.PI) / 2;
        w.position.x = s * 0.06;
        bow.add(w);
      }
      const knot = mesh(sph(0.035), paint(col, 0.4, 0.6));
      bow.add(knot);
      bow.position.set(0, r + 0.02, 0);
      collar.add(bow);
      ud.bow = bow;
    } else if (look.collar === 'scarf') {
      const tail = mesh(caps(0.04, 0.16), paint(col, 0.8, 0));
      tail.position.set(0.08, r, -0.08);
      tail.rotation.set(0.4, 0, 0.3);
      collar.add(tail);
      ud.bow = tail;
    }
  }
}
