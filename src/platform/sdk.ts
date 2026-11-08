/**
 * CrazyGames SDK v3 wrapper. Every call is optional (GitHub Pages has no SDK, ad blockers remove it) and every ad
 * request settles exactly once: on adFinished / adError, when requestAd throws, or when adStarted has not been
 * called within 8 s. While an ad plays the game is muted and input is blocked.
 */
export type AdType = 'midgame' | 'rewarded';
export type AdResult = 'finished' | 'error' | 'timeout' | 'busy' | 'nosdk';

interface AdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (e?: unknown) => void;
}

export interface CrazySdk {
  init?: () => Promise<void>;
  environment?: string;
  ad?: { requestAd: (type: AdType, cb: AdCallbacks) => void };
  game?: {
    gameplayStart?: () => void;
    gameplayStop?: () => void;
    loadingStart?: () => void;
    loadingStop?: () => void;
    happytime?: () => void;
    settings?: { muteAudio?: boolean };
    addSettingsChangeListener?: (l: (s: { muteAudio?: boolean }) => void) => void;
  };
  data?: {
    getItem: (k: string) => string | null;
    setItem: (k: string, v: string) => void;
    removeItem?: (k: string) => void;
  };
}

export interface Clock {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  now: () => number;
}

const realClock: Clock = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

export const AD_START_TIMEOUT = 8000;
export const MIDGAME_GAP = 120_000;

/** Midgame ads only between rooms, never in the first rooms, at most one every ~2 minutes. */
export class AdPolicy {
  private lastAd: number;
  roomsDone = 0;
  constructor(private clock: Clock = realClock, private minRooms = 3) {
    this.lastAd = clock.now();
  }
  canShowMidgame(): boolean {
    return this.roomsDone >= this.minRooms && this.clock.now() - this.lastAd >= MIDGAME_GAP;
  }
  noteAd(): void {
    this.lastAd = this.clock.now();
  }
}

export class Platform {
  private sdk: CrazySdk | null;
  private playing = false;
  private adBusy = false;
  private externalMute = false;
  onAdStart: () => void = () => undefined;
  onAdEnd: () => void = () => undefined;
  onMuteChange: (muted: boolean) => void = () => undefined;
  readonly policy: AdPolicy;

  constructor(sdk: CrazySdk | null, private clock: Clock = realClock) {
    this.sdk = sdk;
    this.policy = new AdPolicy(clock);
  }

  get available(): boolean {
    return !!this.sdk?.ad;
  }

  get muted(): boolean {
    return this.externalMute;
  }

  /** await SDK.init() (bounded, so a blocked SDK never blocks the game). */
  async init(timeoutMs = 8000): Promise<void> {
    if (!this.sdk?.init) return;
    let timer: unknown;
    try {
      await Promise.race([
        this.sdk.init(),
        new Promise<void>((_, rej) => {
          timer = this.clock.setTimeout(() => rej(new Error('sdk init timeout')), timeoutMs);
        }),
      ]);
    } catch {
      this.sdk = null;
      return;
    } finally {
      this.clock.clearTimeout(timer);
    }
    try {
      this.externalMute = !!this.sdk.game?.settings?.muteAudio;
      this.sdk.game?.addSettingsChangeListener?.((s) => {
        this.externalMute = !!s.muteAudio;
        this.onMuteChange(this.externalMute);
      });
    } catch {
      /* optional */
    }
  }

  private call(fn: (() => void) | undefined): void {
    try {
      fn?.();
    } catch {
      /* SDK hiccups must never break the game */
    }
  }

  loadingStart(): void {
    this.call(this.sdk?.game?.loadingStart && (() => this.sdk!.game!.loadingStart!()));
  }
  loadingStop(): void {
    this.call(this.sdk?.game?.loadingStop && (() => this.sdk!.game!.loadingStop!()));
  }
  gameplayStart(): void {
    if (this.playing || this.adBusy) return;
    this.playing = true;
    this.call(this.sdk?.game?.gameplayStart && (() => this.sdk!.game!.gameplayStart!()));
  }
  gameplayStop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.call(this.sdk?.game?.gameplayStop && (() => this.sdk!.game!.gameplayStop!()));
  }
  happytime(): void {
    this.call(this.sdk?.game?.happytime && (() => this.sdk!.game!.happytime!()));
  }

  /** Request an ad. Resolves exactly once. */
  requestAd(type: AdType): Promise<AdResult> {
    const ad = this.sdk?.ad;
    if (!ad) return Promise.resolve('nosdk');
    if (this.adBusy) return Promise.resolve('busy');
    this.adBusy = true;
    const wasPlaying = this.playing;
    this.gameplayStop();
    return new Promise<AdResult>((resolve) => {
      let settled = false;
      let started = false;
      let startTimer: unknown = null;
      const settle = (r: AdResult) => {
        if (settled) return;
        settled = true;
        if (startTimer !== null) this.clock.clearTimeout(startTimer);
        this.adBusy = false;
        if (started) this.onAdEnd();
        if (r === 'finished' && type === 'midgame') this.policy.noteAd();
        if (wasPlaying) this.gameplayStart();
        resolve(r);
      };
      startTimer = this.clock.setTimeout(() => settle('timeout'), AD_START_TIMEOUT);
      try {
        ad.requestAd(type, {
          adStarted: () => {
            if (settled || started) return;
            started = true;
            if (startTimer !== null) this.clock.clearTimeout(startTimer);
            startTimer = null;
            this.onAdStart();
          },
          adFinished: () => settle('finished'),
          adError: () => settle('error'),
        });
      } catch {
        settle('error');
      }
    });
  }

  /** Midgame ad between rooms, if the policy allows it. */
  async maybeMidgame(): Promise<void> {
    if (!this.available || !this.policy.canShowMidgame()) return;
    await this.requestAd('midgame');
  }

  /** Optional rewarded ad. true = grant the reward. Without an SDK (web build) rewards are granted. */
  async rewarded(): Promise<boolean | 'unavailable'> {
    const r = await this.requestAd('rewarded');
    if (r === 'finished' || r === 'nosdk') return true;
    return 'unavailable';
  }

  // ─── data module (falls back to localStorage) ───
  getItem(k: string): string | null {
    try {
      if (this.sdk?.data) return this.sdk.data.getItem(k);
    } catch {
      /* fall through */
    }
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  }

  setItem(k: string, v: string): void {
    try {
      if (this.sdk?.data) {
        this.sdk.data.setItem(k, v);
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage blocked: progress lives for this session only */
    }
  }
}

export function detectSdk(): CrazySdk | null {
  const w = globalThis as unknown as { CrazyGames?: { SDK?: CrazySdk } };
  return w.CrazyGames?.SDK ?? null;
}
