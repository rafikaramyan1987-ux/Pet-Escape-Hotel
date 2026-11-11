/**
 * Y8 SDK (https://docs.y8.com/sdk/advertising/, /sdk/ad-placement-guidelines/, /studio/game-requirements/).
 * - the SDK comes only from Y8's CDN: `<script src="https://cdn.y8.com/minimal-sdk/2-0/y8.min.js" async>` in <head>
 *   (vite.config.ts, Y8 build only), never bundled
 * - initialized exactly like the portal snippet: a `y8sdk.ready` listener ({ once: true }) runs `y8Sdk = y8.sdk()`,
 *   `y8Sdk.init({ appId, autoLogin: true }, { gameId, preloadAdBreaks: 'on', sound: 'on', onReady })` and
 *   `y8Sdk.onAuth(…)`; then `window.y8.emitReadyEvent()` in case the SDK had already loaded. Guest play always works:
 *   onAuth only notes the player, nothing waits for a login.
 * - no ad call before init: `available` (and with it every ad request) needs the initialized SDK instance
 * - interstitials only from a click outside gameplay: type `start` on the first Play of the title, type `next` on Next
 *   (rescued) and Retry (failed) of the result cards. Never automatic, never during a level. No frequency cap of the
 *   game's own: the SDK paces them, and a break that shows nothing continues the game at once.
 * - beforeAd: pause + mute; afterAd: resume + audio back through the player's own settings. Each request settles exactly
 *   once: adBreakDone, the showAd promise's .catch(), a throw, not started within 8 s (BasePlatform) or AD_MAX after it
 *   started
 * - rewarded (`reward`), only from a button that names its reward: beforeReward(showAdFn) calls showAdFn(); the reward
 *   only after adViewed; adDismissed = no reward; no ad = "No ad available right now, try later" and the game goes on
 * - Y8 requirement: pause and mute while the page is hidden (visibilitychange) or the window lost focus (blur), resume
 *   on return (focus, or any input the game receives)
 * - saves in localStorage; with an ad blocker (no SDK) the game is fully playable and hides the rewarded buttons
 */
import { BasePlatform } from './base';
import { AD_MAX, type AdHandle, type AdSlot, type AdType, type Clock, realClock } from './types';

export const Y8_APP_ID = '6af4b159ca1c6869a74e059b';
export const Y8_GAME_ID = '292545';
export const Y8_SDK_URL = 'https://cdn.y8.com/minimal-sdk/2-0/y8.min.js';

export type Y8BreakType = 'start' | 'next' | 'reward';
export interface Y8AdBreakInfo {
  breakType?: string;
  breakName?: string;
  breakFormat?: string;
  breakStatus?: string;
}
export interface Y8ShowAdOptions {
  type: Y8BreakType;
  name: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  beforeReward?: (showAdFn: () => void) => void;
  adViewed?: () => void;
  adDismissed?: () => void;
  adBreakDone?: (info?: Y8AdBreakInfo) => void;
}
export interface Y8AppConfig {
  appId: string;
  autoLogin: boolean;
}
export interface Y8AdConfig {
  gameId: string;
  preloadAdBreaks: 'on' | 'auto';
  sound: 'on' | 'off';
  onReady: () => void;
}
export interface Y8Sdk {
  init(appConfig: Y8AppConfig, adConfig: Y8AdConfig): unknown;
  onAuth(cb: (user: unknown, error?: unknown) => void): unknown;
  showAd(opts: Y8ShowAdOptions): unknown;
}
interface Y8Window {
  y8?: { sdk(): Y8Sdk; emitReadyEvent?: () => void };
}
const win = () => window as unknown as Y8Window;

type PauseReason = 'hidden' | 'blur';

export class Y8Platform extends BasePlatform {
  readonly name = 'y8';
  /** rewarded buttons only once the SDK is initialized (hidden with an ad blocker) */
  override adsEnabled = false;
  /** the SDK instance, set only once `init()` has been called on it */
  private y8Sdk: Y8Sdk | null = null;
  private adReady = false;
  private startShown = false;
  private breakType: Y8BreakType = 'next';
  private cap: unknown = null;
  private pausedBy = new Set<PauseReason>();
  /** the player is signed in to Y8 (onAuth); guests play the same game */
  user: unknown = null;

  constructor(
    private appId = Y8_APP_ID,
    private gameId = Y8_GAME_ID,
    clock: Clock = realClock,
  ) {
    super(clock, 0);
  }

  /** the SDK is initialized: ads may be asked for (no ad call before init) */
  get available(): boolean {
    return this.y8Sdk !== null;
  }

  /** the ad system reported ready (adConfig.onReady) */
  get adSystemReady(): boolean {
    return this.adReady;
  }

  /** The portal snippet. Waits for `y8sdk.ready` at most `timeoutMs` (an ad blocker: never); a late SDK still initializes. */
  override async init(timeoutMs = 3500): Promise<void> {
    if (typeof window === 'undefined') return;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => this.pause('hidden', document.hidden));
      window.addEventListener('blur', () => this.pause('blur', true));
      window.addEventListener('focus', () => this.pause('blur', false));
      // any input reaching the game means it has the focus again
      for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, () => this.pause('blur', false), true);
    }
    await new Promise<void>((res) => {
      const to = setTimeout(res, timeoutMs);
      window.addEventListener(
        'y8sdk.ready',
        () => {
          try {
            const y8Sdk = win().y8!.sdk();
            const appConfig: Y8AppConfig = { appId: this.appId, autoLogin: true };
            const adConfig: Y8AdConfig = { gameId: this.gameId, preloadAdBreaks: 'on', sound: 'on', onReady: () => (this.adReady = true) };
            y8Sdk.init(appConfig, adConfig);
            // guest play needs nothing: a signed-in player is just recognised
            y8Sdk.onAuth((user) => {
              this.user = user ?? null;
            });
            this.y8Sdk = y8Sdk;
            this.adsEnabled = true;
          } catch {
            /* SDK broken: play on without ads */
          }
          clearTimeout(to);
          res();
        },
        { once: true },
      );
      // the SDK may have loaded before this listener: ask it to announce itself again
      try {
        win().y8?.emitReadyEvent?.();
      } catch {
        /* play on */
      }
    });
  }

  /** hidden page / lost focus: the level pauses and all audio is silent while either holds */
  pause(reason: PauseReason, on: boolean): void {
    if (on === this.pausedBy.has(reason)) return;
    if (on) this.pausedBy.add(reason);
    else this.pausedBy.delete(reason);
    this.setSilence('pause', this.pausedBy.size > 0);
  }

  protected show(type: AdType, h: AdHandle): void {
    const s = this.y8Sdk!;
    const kind: Y8BreakType = type === 'rewarded' ? 'reward' : this.breakType;
    let viewed = false;
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      h.started();
      this.cap = this.clock.setTimeout(() => h.failed(), AD_MAX);
    };
    const opts: Y8ShowAdOptions = {
      type: kind,
      name: kind === 'start' ? 'start-game' : kind === 'reward' ? 'booster-reward' : 'next-level',
      beforeAd: () => {
        start();
        this.setSilence('ad', true);
      },
      afterAd: () => this.setSilence('ad', false),
      // the break is over, whether an ad showed or not: an interstitial continues the game, a reward needs adViewed
      adBreakDone: () => (kind === 'reward' && !viewed ? h.failed() : h.finished()),
    };
    if (kind === 'reward') {
      opts.beforeReward = (showAdFn) => {
        start();
        showAdFn();
      };
      opts.adViewed = () => {
        viewed = true;
      };
      opts.adDismissed = () => {
        viewed = false;
      };
    }
    const r = s.showAd(opts);
    if (r && typeof (r as Promise<unknown>).then === 'function') (r as Promise<unknown>).then(undefined, () => h.failed());
  }

  protected override adSettled(): void {
    if (this.cap !== null) this.clock.clearTimeout(this.cap);
    this.cap = null;
  }

  /** `start` on the first Play click of the title, `next` on Next / Retry of a result card; the SDK alone paces them */
  override async midgame(slot: AdSlot): Promise<void> {
    if (!this.y8Sdk || this.playing) return;
    if (slot === 'preroll') {
      if (this.startShown) return;
      this.startShown = true;
      this.breakType = 'start';
    } else this.breakType = 'next';
    await this.requestAd('midgame');
  }
}
