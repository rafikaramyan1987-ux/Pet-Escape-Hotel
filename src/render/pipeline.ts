import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Renderer + post stack: MSAA HDR target → GTAO (soft contact shadows) → bloom (emissives only)
 * → grade (vignette, warm/cool split) → tone mapping + sRGB.
 */
export interface Quality {
  ao: boolean;
  bloom: boolean;
  pixelRatio: number;
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignette: { value: 0.42 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVignette; uniform float uAspect; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 p = vUv - 0.5;
      p.x *= mix(1.0, uAspect, 0.5);
      float d = length(p);
      float v = 1.0 - uVignette * smoothstep(0.3, 0.85, d);
      // split-tone: lift shadows towards indigo, keep highlights warm
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 shadowTint = vec3(0.020, 0.018, 0.055);
      c.rgb = c.rgb + shadowTint * (1.0 - smoothstep(0.0, 0.25, l));
      c.rgb *= v;
      gl_FragColor = c;
    }`,
};

export class Pipeline {
  readonly renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private gtao: GTAOPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  private grade: ShaderPass;
  private sceneRef: { current: THREE.Scene };

  constructor(canvas: HTMLCanvasElement, scene: THREE.Scene, camera: THREE.PerspectiveCamera, private q: Quality) {
    this.sceneRef = { current: scene };
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    r.setPixelRatio(q.pixelRatio);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = r;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    r.setSize(w, h, false);
    const rt = new THREE.WebGLRenderTarget(w * q.pixelRatio, h * q.pixelRatio, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.setPixelRatio(q.pixelRatio);
    this.composer.setSize(w, h);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    if (q.ao) {
      const ao = new GTAOPass(scene, camera, w * q.pixelRatio, h * q.pixelRatio);
      ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      ao.blendIntensity = 0.9;
      // transparent things (glass, light beams, sprites) must not darken what is behind them
      const hidden: THREE.Object3D[] = [];
      const sceneRef = this.sceneRef;
      const self = ao as unknown as { _overrideVisibility(): void; _restoreVisibility(): void };
      self._overrideVisibility = () => {
        sceneRef.current.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (o.visible && (o.userData.noAO || (o as THREE.Sprite).isSprite || (m && !Array.isArray(m) && m.transparent))) {
            o.visible = false;
            hidden.push(o);
          }
        });
      };
      self._restoreVisibility = () => {
        for (const o of hidden) o.visible = true;
        hidden.length = 0;
      };
      this.composer.addPass(ao);
      this.gtao = ao;
    }
    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.65, 1.0);
      this.composer.addPass(this.bloom);
    }
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.grade.uniforms.uAspect.value = w / h;
  }

  /** Swap the rendered scene (new room) keeping the same camera and post stack. */
  setScene(scene: THREE.Scene): void {
    this.renderPass.scene = scene;
    if (this.gtao) {
      this.gtao.scene = scene;
      this.sceneRef.current = scene;
    }
  }

  setBloom(strength: number, radius = 0.65, threshold = 1.0): void {
    if (!this.bloom) return;
    this.bloom.strength = strength;
    this.bloom.radius = radius;
    this.bloom.threshold = threshold;
  }

  setVignette(v: number): void {
    this.grade.uniforms.uVignette.value = v;
  }

  setSize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.gtao?.setSize(w * this.q.pixelRatio, h * this.q.pixelRatio);
    this.grade.uniforms.uAspect.value = w / h;
  }

  render(): void {
    this.composer.render();
  }
}
