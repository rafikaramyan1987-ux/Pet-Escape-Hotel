import { AD_START_TIMEOUT, AdPolicy, type AdHandle, type AdResult, type AdSlot, type AdType, type Clock, type Platform, type PlatformName, realClock } from './types';

/** Why the portal wants silence / a frozen game. Each reason is set and cleared on its own (idempotent). */
export type Silence = 'setting' | 'pause' | 'ad' | 'soundOff';

/**
 * What every portal build shares: the ad safety wrapper, gameplay start/stop de-duplication, silence / pause
 * bookkeeping and localStorage saves.
 *
 * Ad safety: every request settles exactly once — when the ad finishes, fails, the SDK call throws, or the ad has
 * not started within 8 s. One ad at a time. Gameplay stops for the ad and starts again after it, and while it
 * plays the game is muted and input is blocked (onAdStart / onAdEnd).
 */
export abstract class BasePlatform implements Platform {
  abstract readonly name: PlatformName;
  readonly adsEnabled: boolean = true;
  readonly policy: AdPolicy;
  protected playing = false;
  protected adBusy = false;
  private silence = new Set<Silence>();
  private paused = false;
  /** Mute and freeze from the moment an ad is requested (GD, GamePix), not only once it has started. */
  protected muteOnRequest = false;
  onMuteChange: (muted: boolean) => void = () => undefined;
  onPause: (paused: boolean) => void = () => undefined;
  onAdStart: () => void = () => undefined;
  onAdEnd: () => void = () => undefined;

  constructor(protected clock: Clock = realClock, minRooms = 4) {
    this.policy = new AdPolicy(clock, minRooms);
  }

  abstract get available(): boolean;
  async init(): Promise<void> {}
  loadingProgress(_p: number): void {}
  loadingStart(): void {}
  loadingStop(): void {}
  async ready(): Promise<void> {}
  happytime(): void {}
  sadMoment(): void {}
  locale(): string | null {
    return null;
  }

  get muted(): boolean {
    return this.silence.size > 0;
  }

  /** Set / clear one reason for silence; 'pause' and 'ad' also freeze the game. Calling twice changes nothing. */
  protected setSilence(reason: Silence, on: boolean): void {
    const was = this.muted;
    if (on) this.silence.add(reason);
    else this.silence.delete(reason);
    if (this.muted !== was) this.onMuteChange(this.muted);
    const p = this.silence.has('pause') || this.silence.has('ad');
    if (p !== this.paused) {
      this.paused = p;
      this.onPause(p);
    }
  }

  protected call(fn: () => void): void {
    try {
      fn();
    } catch {
      /* SDK hiccups must never break the game */
    }
  }

  gameplayStart(): void {
    if (this.playing || this.adBusy) return;
    this.playing = true;
    this.call(() => this.sdkGameplay(true));
  }

  gameplayStop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.call(() => this.sdkGameplay(false));
  }

  /** Tell the portal gameplay started / stopped (called de-duplicated). */
  protected sdkGameplay(_on: boolean): void {}

  /** Start an ad in the portal SDK and report through `h` (may throw: the request then fails). */
  protected abstract show(type: AdType, h: AdHandle): void;

  /** The request settled (any reason): adapters drop their per-ad state here. */
  protected adSettled(): void {}

  /** Request an ad. Resolves exactly once. */
  requestAd(type: AdType): Promise<AdResult> {
    if (!this.available) return Promise.resolve('nosdk');
    if (this.adBusy) return Promise.resolve('busy');
    const wasPlaying = this.playing;
    this.gameplayStop();
    this.adBusy = true;
    if (this.muteOnRequest) this.setSilence('ad', true);
    return new Promise<AdResult>((resolve) => {
      let settled = false;
      let started = false;
      let startTimer: unknown = null;
      const settle = (r: AdResult) => {
        if (settled) return;
        settled = true;
        if (startTimer !== null) this.clock.clearTimeout(startTimer);
        this.adBusy = false;
        this.call(() => this.adSettled());
        if (started) this.onAdEnd();
        this.setSilence('ad', false);
        if (r === 'finished' && type === 'midgame') this.policy.noteAd();
        if (wasPlaying) this.gameplayStart();
        resolve(r);
      };
      startTimer = this.clock.setTimeout(() => settle('timeout'), AD_START_TIMEOUT);
      try {
        this.show(type, {
          started: () => {
            if (settled || started) return;
            started = true;
            if (startTimer !== null) this.clock.clearTimeout(startTimer);
            startTimer = null;
            this.onAdStart();
          },
          finished: () => settle('finished'),
          failed: () => settle('error'),
        });
      } catch {
        settle('error');
      }
    });
  }

  /** Midgame interstitial between levels, if the policy allows it. */
  async midgame(slot: AdSlot): Promise<void> {
    if (slot !== 'between' || !this.available || !this.policy.canShowMidgame()) return;
    await this.requestAd('midgame');
  }

  // ─── saves: localStorage, known keys only ───
  getItem(k: string): string | null {
    // Playgama: saves only through Bridge Storage (playgama.ts); no localStorage code in that build
    if (__PLATFORM__ === 'playgama') return null;
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  }

  setItem(k: string, v: string): void {
    if (__PLATFORM__ === 'playgama') return;
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage blocked: progress lives for this session only */
    }
  }
}
