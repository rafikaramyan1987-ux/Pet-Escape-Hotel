import * as THREE from 'three';
import type { PetKind } from '../art/pets';
import { applyCosmetics, characterLook } from '../art/look';
import { puck, paint } from '../art/kit';
import { makePet, type Fur } from '../art/pets';
import type { Look } from '../game/save';
import { item } from '../game/shop';

/** Live 3D try-on for the shop: the pet turns on a little pedestal wearing the selected items. */
export class TryOn {
  private r: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private pet: ReturnType<typeof makePet> | null = null;
  private raf = 0;
  private t = 0;
  private holder = new THREE.Group();

  constructor(readonly canvas: HTMLCanvasElement) {
    this.r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.r.toneMapping = THREE.NeutralToneMapping;
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight(0xc9d2ff, 0x6a4a50, 1.5));
    const key = new THREE.DirectionalLight(0xffe2b8, 2.8);
    key.position.set(2, 4, 4);
    const rim = new THREE.DirectionalLight(0x9fb4ff, 2.6);
    rim.position.set(-3, 2, -3);
    this.scene.add(key, rim);
    const ped = new THREE.Mesh(puck(0.85, 0.2, 0.08), paint(0xfbf0d6, 0.5, 0.35));
    ped.position.y = -0.1;
    this.scene.add(ped, this.holder);
    this.cam.position.set(0, 1.5, 3.6);
    this.cam.lookAt(0, 0.55, 0);
    const loop = () => {
      this.t += 1 / 60;
      this.holder.rotation.y = Math.sin(this.t * 0.6) * 0.7;
      this.pet?.update(this.t);
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      if (w && h && (this.canvas.width !== Math.floor(w * this.r.getPixelRatio()))) {
        this.r.setSize(w, h, false);
        this.cam.aspect = w / h;
        this.cam.updateProjectionMatrix();
      }
      this.r.render(this.scene, this.cam);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  show(kind: PetKind, look: Look): void {
    if (this.pet) this.holder.remove(this.pet.root);
    const skin = look.skin !== 'default' ? (item(look.skin)?.fur as Fur | undefined) : undefined;
    this.pet = makePet(kind, skin);
    applyCosmetics(this.pet.root, look);
    characterLook(this.pet.root, 0xd6e0ff, 0.5, true);
    const s = kind === 'hamster' ? 1.5 : 1;
    this.pet.root.scale.setScalar(s);
    this.holder.add(this.pet.root);
    this.cam.position.set(0, kind === 'hamster' ? 1.2 : 1.5, kind === 'hamster' ? 3.0 : 3.6);
    this.cam.lookAt(0, kind === 'hamster' ? 0.45 : 0.6, 0);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.r.dispose();
    this.r.forceContextLoss();
  }
}
