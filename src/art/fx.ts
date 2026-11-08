import * as THREE from 'three';
import { glowTexture, sparkleTexture } from './textures';

/** Light-beam material: additive, fades along the beam (uv.y: 1 at the source) and at grazing edges. */
export function beamMaterial(color: number, opacity: number, falloff = 1.6): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uFall: { value: falloff } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; uniform float uFall;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.4);
        float a = uOpacity * edge * pow(clamp(vUv.y, 0.0, 1.0), uFall);
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** A visible light cone with its apex at the origin, pointing down -Y. */
export function coneBeam(radius: number, length: number, color: number, opacity: number): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(radius * 0.06, radius, length, 48, 1, true);
  geo.translate(0, -length / 2, 0);
  const m = new THREE.Mesh(geo, beamMaterial(color, opacity, 1.2));
  m.userData.noAO = true;
  m.renderOrder = 10;
  return m;
}

/** Additive glow sprite. */
export function glowSprite(color: number, size: number, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(),
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  s.scale.set(size, size, 1);
  s.userData.noAO = true;
  s.renderOrder = 11;
  return s;
}

export function sparkle(color: number, size: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sparkleTexture(),
    color,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  s.scale.set(size, size, 1);
  s.userData.noAO = true;
  s.renderOrder = 12;
  return s;
}

/** Shaft of moonlight from a window rectangle (corners on the wall), pushed along `dir` for `len`. */
export function windowShaft(corners: THREE.Vector3[], dir: THREE.Vector3, len: number, color: number, opacity: number): THREE.Mesh {
  const far = corners.map((c) => c.clone().addScaledVector(dir, len));
  const pos: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const c = far[(i + 1) % 4];
    const d = far[i];
    for (const [p, v] of [[a, 1], [b, 1], [c, 0], [a, 1], [c, 0], [d, 0]] as const) {
      pos.push(p.x, p.y, p.z);
      uv.push(0, v);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, beamMaterial(color, opacity, 0.9));
  m.userData.noAO = true;
  m.renderOrder = 9;
  return m;
}
