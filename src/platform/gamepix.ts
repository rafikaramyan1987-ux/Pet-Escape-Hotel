/**
 * GamePix JS SDK v3, manual lifecycle. index.html of the GamePix build sets `window.GamePixConfig = { lifecycle:
 * 'manual' }` and loads gamepix.sdk.js before the game bundle (vite.config.ts), so `window.GamePix` is there at boot.
 * - lifecycle: loading(0..100) while booting, `await loaded()` before the title screen, gameStart() when the first
 *   level starts
 * - `pause` / `resume` events: pause gameplay and mute; `soundOff` / `soundOn` events (and the legacy
 *   GamePix.soundOff / soundOn / pause / resume hooks, set on window.GamePix): mute / unmute. Every reason is tracked on its own and is idempotent:
 *   audio only comes back when no pause, no ad and no sound-off is active (and the player's own setting allows it)
 * - `await GamePix.ads.interstitial()` only between levels, at most one every 2 minutes; `await GamePix.ads.reward()`
 *   from a rewarded button, rewarded only when `success === true`. Every request settles exactly once (8 s)
 * - happyMoment('level_complete') / sadMoment('level_failed'), GamePix.lang() (read once at boot) as the locale, localStorage saves
 */
import { BasePlatform } from './base';
import { type AdHandle, type AdType, type Clock, realClock } from './types';

export const GPX_SDK_URL = 'https://integration.gamepix.com/sdk/v3/gamepix.sdk.js';
/** loaded() resolves without a portal player too; capped so it can never block the game (ms). */
export const LOADED_CAP = 5000;

export interface GamePixAdResult {
  success?: boolean;
  message?: string;
}
type GpxEvent = 'pause' | 'resume' | 'soundOff' | 'soundOn';
export interface GamePixSdk {
  lifecycle?: { loading?(p: number): void; loaded?(): Promise<unknown> | void; gameStart?(): void };
  events?: { on?(name: GpxEvent, fn: () => void): void };
  ads?: { interstitial?(): Promise<GamePixAdResult>; reward?(): Promise<GamePixAdResult> };
  lang?(): string;
  happyMoment?(name: string): void;
  sadMoment?(name: string): void;
  /**
   * Game callbacks the SDK calls (`false` until the game sets them): `GamePix.on.<name>` first, else the legacy
   * `GamePix.<name>` (pause, resume, soundOn, soundOff).
   */
  on?: Partial<Record<GpxEvent, unknown>>;
  pause?: unknown;
  resume?: unknown;
  soundOff?: unknown;
  soundOn?: unknown;
}

/** `window.GamePix` once the game has set the legacy hooks the GamePix player checks for. */
interface GamePixWindowSdk extends Omit<GamePixSdk, GpxEvent> {
  soundOff?: () => void;
  soundOn?: () => void;
  pause?: () => void;
  resume?: () => void;
}
declare global {
  interface Window {
    GamePix?: GamePixWindowSdk;
  }
}

export class GamePixPlatform extends BasePlatform {
  readonly name = 'gamepix';
  protected override muteOnRequest = true;
  private progress = 0;
  private loaded = false;
  private started = false;
  private pending: AdHandle | null = null;
  /** GamePix.lang(), read once in init(). */
  private lang: string | null = null;
  /** What the portal asked for last (events and legacy hooks both land here): repeats are ignored. */
  private portalPaused = false;
  private portalSoundOff = false;

  constructor(private sdk: GamePixSdk | null = detectGamePix(), clock: Clock = realClock) {
    // interstitials between levels only depend on the 2-minute gap (none in the first 2 minutes)
    super(clock, 0);
  }

  get available(): boolean {
    return !!this.sdk?.ads;
  }

  override async init(): Promise<void> {
    const s = this.sdk;
    if (!s) return;
    const handlers: Record<GpxEvent, () => void> = {
      pause: () => {
        // the SDK pauses the game when an ad really shows: from then on the ad may take as long as it needs
        this.pending?.started();
        if (this.portalPaused) return;
        this.portalPaused = true;
        this.setSilence('pause', true);
      },
      resume: () => {
        if (!this.portalPaused) return;
        this.portalPaused = false;
        this.setSilence('pause', false);
      },
      soundOff: () => {
        if (this.portalSoundOff) return;
        this.portalSoundOff = true;
        this.setSilence('soundOff', true);
      },
      soundOn: () => {
        // only clears the sound-off reason: a pause / ad / the player's own setting keeps the game muted
        if (!this.portalSoundOff) return;
        this.portalSoundOff = false;
        this.setSilence('soundOff', false);
      },
    };
    for (const [name, fn] of Object.entries(handlers) as [GpxEvent, () => void][]) {
      // the events API …
      this.call(() => s.events?.on?.(name, fn));
      // … and GamePix.on.<name> (keeping anything that was already there). Every handler is idempotent, so being
      // called twice changes nothing.
      const chain = (prev: unknown) => () => {
        if (typeof prev === 'function') this.call(() => (prev as () => void).call(s));
        fn();
      };
      this.call(() => {
        if (s.on && typeof s.on === 'object') s.on[name] = chain(s.on[name]);
      });
    }
    // The legacy GamePix.<name> hooks the GamePix player checks for, pointing at the same handlers. Written out on
    // `window.GamePix` so the minified bundle keeps the literal `GamePix.soundOff=` (checked in CI).
    try {
      if (typeof window !== 'undefined' && window.GamePix && (window.GamePix as unknown) === s) {
        window.GamePix.soundOff = handlers.soundOff;
        window.GamePix.soundOn = handlers.soundOn;
        window.GamePix.pause = handlers.pause;
        window.GamePix.resume = handlers.resume;
      }
    } catch {
      /* a frozen SDK object: the events API still works */
    }
    // the portal language, read once at boot (before loaded()); the saved Settings choice still wins (detectLang)
    try {
      const global = typeof window !== 'undefined' && (window.GamePix as unknown) === s;
      const l = global
        ? typeof window.GamePix!.lang === 'function' ? window.GamePix!.lang() : null
        : typeof s.lang === 'function' ? s.lang() : null;
      this.lang = typeof l === 'string' && l ? l : null;
    } catch {
      this.lang = null;
    }
    this.loadingProgress(10);
  }

  /** Progress 0..100, whole numbers, only increasing. */
  override loadingProgress(p: number): void {
    p = Math.round(Math.min(100, Math.max(0, p)));
    if (p <= this.progress) return;
    this.progress = p;
    this.call(() => this.sdk?.lifecycle?.loading?.(p));
  }

  override loadingStart(): void {
    this.loadingProgress(20);
  }
  override loadingStop(): void {
    this.loadingProgress(100);
  }

  /** 100 %, then wait for `loaded()` before the title screen shows (capped). */
  override async ready(): Promise<void> {
    this.loadingProgress(100);
    const s = this.sdk;
    if (s?.lifecycle?.loaded && !this.loaded) {
      let timer: unknown;
      try {
        await Promise.race([
          Promise.resolve(s.lifecycle.loaded()),
          new Promise((r) => (timer = this.clock.setTimeout(() => r(undefined), LOADED_CAP))),
        ]);
      } catch {
        /* play on */
      } finally {
        this.clock.clearTimeout(timer);
      }
    }
    this.loaded = true;
  }

  /** gameStart() once, when the first level starts (after loaded()). */
  protected override sdkGameplay(on: boolean): void {
    if (!on || this.started || !this.loaded) return;
    this.started = true;
    this.sdk?.lifecycle?.gameStart?.();
  }

  override happytime(): void {
    this.call(() => this.sdk?.happyMoment?.('level_complete'));
  }
  override sadMoment(): void {
    this.call(() => this.sdk?.sadMoment?.('level_failed'));
  }

  /** GamePix.lang() as read once in init(). */
  override locale(): string | null {
    return this.lang;
  }

  /**
   * The SDK promise is the ad: it resolves when the ad is over, or at once when there is none. The game is muted
   * and frozen from the request on (muteOnRequest). A `pause` event marks the ad as started; a promise that
   * neither resolves nor starts an ad within 8 s is given up (BasePlatform). Only `success === true` counts.
   */
  protected show(type: AdType, h: AdHandle): void {
    const ads = this.sdk!.ads!;
    const call = type === 'rewarded' ? ads.reward : ads.interstitial;
    if (!call) throw new Error('no ad call');
    this.pending = h;
    const r = call.call(ads);
    Promise.resolve(r).then(
      (v) => (v?.success === true ? h.finished() : h.failed()),
      () => h.failed(),
    );
  }

  protected override adSettled(): void {
    this.pending = null;
  }
}

export function detectGamePix(): GamePixSdk | null {
  const w = globalThis as unknown as { GamePix?: GamePixSdk };
  return w.GamePix ?? null;
}
