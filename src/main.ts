import './style.css';
import * as THREE from 'three';
import { Pipeline } from './render/pipeline';
import { makeShot, type ShotName } from './showcase/shots';
import { renderHud } from './ui/hud';
import { renderPortraits } from './ui/portraits';

/**
 * Phase 1 (art direction): the page shows the showcase lobby. `?shot=gameplay|lineup|title|turntable`
 * picks a composition; `?t=<seconds>` freezes time; `?hud=0` hides the HUD. `window.__art.renderAt(t)` lets
 * the capture script step frames deterministically.
 */
async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const shotName = (params.get('shot') ?? 'gameplay') as ShotName;
  const frozen = params.has('t') ? Number(params.get('t')) : null;
  const hq = params.get('q') !== 'low';

  await Promise.all([
    document.fonts.load("400 64px 'Lilita One'"),
    document.fonts.load("600 32px 'Fredoka'"),
    document.fonts.load("700 32px 'Fredoka'"),
  ]).catch(() => undefined);

  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const ui = document.getElementById('ui')!;
  const aspect = window.innerWidth / window.innerHeight;
  const shot = makeShot(shotName, aspect);
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

  window.addEventListener('resize', () => {
    shot.camera.aspect = window.innerWidth / window.innerHeight;
    shot.camera.updateProjectionMatrix();
    pipe.setSize(window.innerWidth, window.innerHeight);
    shot.overlay?.(ui);
  });

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

void boot();
