/**
 * The platform layer: what the game needs from a web-game portal (loading / gameplay events, ads, saves, mute,
 * locale). One implementation per portal, chosen at build time by `__PLATFORM__` (VITE_PLATFORM, see
 * vite.config.ts), so a build only contains its own portal's code.
 */
export type PlatformName = 'web' | 'crazygames' | 'gd' | 'gamepix';

export type AdType = 'midgame' | 'rewarded';
export type AdResult = 'finished' | 'error' | 'timeout' | 'busy' | 'nosdk';
/** Where an interstitial is asked for: `preroll` = the first Play click, `between` = Next between levels. */
export type AdSlot = 'preroll' | 'between';

export interface Clock {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  now: () => number;
}

export const realClock: Clock = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

/** An ad that has not started after this long counts as "no ad available" (ms). */
export const AD_START_TIMEOUT = 8000;
/** At most one interstitial every ~2 minutes. */
export const MIDGAME_GAP = 120_000;
/** How long the "No ad available right now, try later" message (and the paused button) stays (ms). */
export const NO_AD_MS = 2500;

/** Interstitials only between levels, never before `minRooms` levels are done, at most one every ~2 minutes. */
export class AdPolicy {
  private lastAd: number;
  roomsDone = 0;
  constructor(private clock: Clock = realClock, private minRooms = 4) {
    this.lastAd = clock.now();
  }
  canShowMidgame(): boolean {
    return this.roomsDone >= this.minRooms && this.clock.now() - this.lastAd >= MIDGAME_GAP;
  }
  noteAd(): void {
    this.lastAd = this.clock.now();
  }
}

/** Callbacks a portal SDK adapter reports an ad's progress through (see BasePlatform.requestAd). */
export interface AdHandle {
  started: () => void;
  finished: () => void;
  failed: () => void;
}

export interface Platform {
  readonly name: PlatformName;
  /** false = no ad SDK in this build at all (web): rewarded-ad buttons are hidden. */
  readonly adsEnabled: boolean;
  /** An ad SDK is loaded and usable right now. */
  readonly available: boolean;
  readonly policy: AdPolicy;
  /** The portal asks for silence (its mute setting, a pause, an ad, a sound-off event). */
  readonly muted: boolean;
  onMuteChange: (muted: boolean) => void;
  /** The portal paused the game (an ad, a pause event): freeze gameplay and block input. */
  onPause: (paused: boolean) => void;
  onAdStart: () => void;
  onAdEnd: () => void;
  init(): Promise<void>;
  /** Loading progress 0..100 (GamePix shows it). */
  loadingProgress(p: number): void;
  loadingStart(): void;
  loadingStop(): void;
  /** End of loading: resolves when the portal lets the game show its first screen (never blocks for long). */
  ready(): Promise<void>;
  gameplayStart(): void;
  gameplayStop(): void;
  happytime(): void;
  sadMoment(): void;
  locale(): string | null;
  /** Request an ad; resolves exactly once. */
  requestAd(type: AdType): Promise<AdResult>;
  /** Interstitial at a natural break after a click, if this portal's policy allows it. */
  midgame(slot: AdSlot): Promise<void>;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** Load an external script once (never throws: resolves false when blocked, offline or slow). */
export function loadScript(src: string, timeoutMs: number, id?: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (id && document.getElementById(id)) return resolve(true);
    const el = document.createElement('script');
    if (id) el.id = id;
    el.src = src;
    el.async = true;
    const to = setTimeout(() => resolve(false), timeoutMs);
    el.onload = () => {
      clearTimeout(to);
      resolve(true);
    };
    el.onerror = () => {
      clearTimeout(to);
      resolve(false);
    };
    document.head.appendChild(el);
  });
}
