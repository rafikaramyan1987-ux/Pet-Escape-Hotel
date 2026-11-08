import * as THREE from 'three';

export function orbit(cam: THREE.PerspectiveCamera, target: THREE.Vector3, yawDeg: number, pitchDeg: number, dist: number): void {
  const y = THREE.MathUtils.degToRad(yawDeg);
  const p = THREE.MathUtils.degToRad(pitchDeg);
  cam.position.set(target.x + Math.sin(y) * Math.cos(p) * dist, target.y + Math.sin(p) * dist, target.z + Math.cos(y) * Math.cos(p) * dist);
  cam.lookAt(target);
}

/**
 * Aim the camera from (yaw, pitch) so that `pts` fill the safe rectangle (NDC) as much as possible:
 * a few iterations of re-centering the target and scaling the distance.
 */
export function fitCamera(cam: THREE.PerspectiveCamera, pts: THREE.Vector3[], yawDeg: number, pitchDeg: number, safe: { x0: number; x1: number; y0: number; y1: number }): { target: THREE.Vector3; dist: number } {
  const target = new THREE.Vector3();
  for (const p of pts) target.add(p);
  target.divideScalar(pts.length);
  let dist = 30;
  const v = new THREE.Vector3();
  for (let i = 0; i < 12; i++) {
    orbit(cam, target, yawDeg, pitchDeg, dist);
    cam.updateMatrixWorld();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      v.copy(p).project(cam);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    const k = Math.max((maxX - minX) / (safe.x1 - safe.x0), (maxY - minY) / (safe.y1 - safe.y0));
    const dx = (minX + maxX) / 2 - (safe.x0 + safe.x1) / 2;
    const dy = (minY + maxY) / 2 - (safe.y0 + safe.y1) / 2;
    const halfH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * dist;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    target.addScaledVector(right, dx * halfH * cam.aspect).addScaledVector(up, dy * halfH);
    dist *= 0.5 + 0.5 * k;
  }
  orbit(cam, target, yawDeg, pitchDeg, dist);
  return { target, dist };
}
