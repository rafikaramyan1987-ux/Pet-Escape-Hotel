import * as THREE from 'three';
import { Pipeline } from '../render/pipeline';
import { makeShot, type ShotName } from './shots';
import { renderHud } from '../ui/hud';
import { renderPortraits } from '../ui/portraits';

/** Phase-1 art showcase (used by scripts/render-art.mjs). */
export async function bootShowcase(params: URLSearchParams): Promise<void> {
  const shotName = (params.get('shot') ?? 'gameplay') as ShotName;
  const frozen = params.has('t') ? Number(params.get('t')) : null;
  const hq = params.get('q') !== 'low';
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const ui = document.getElementById('ui')!;
  const shot = makeShot(shotName, window.innerWidth / window.innerHeight);
  const pipe = new Pipeline(canvas, shot.scene, shot.camera, { ao: hq, bloom: true, pixelRatio: Math.min(window.devicePixelRatio, 2) });
  if (shot.bloom) pipe.setBloom(...shot.bloom);
  if (shot.vignette !== undefined) pipe.setVignette(shot.vignette);
  if (shotName === 'gameplay' && params.get('hud') !== '0') {
    renderHud(ui, { room: 'The Lobby', roomNo: 1, stars: 2, bones: [1, 3], active: 'dog', stealth: 0.32 }, renderPortraits());
  }
  shot.update(frozen ?? 0);
  shot.overlay?.(ui);
  document.getElementById('boot')?.remove();
  const renderAt = (t: number) => {
    shot.update(t);
    pipe.render();
  };
  (window as unknown as { __art: unknown }).__art = { renderAt, ready: true };
  if (frozen !== null) {
    renderAt(frozen);
    return;
  }
  const clock = new THREE.Clock();
  const loop = () => {
    renderAt(clock.getElapsedTime());
    requestAnimationFrame(loop);
  };
  loop();
}
