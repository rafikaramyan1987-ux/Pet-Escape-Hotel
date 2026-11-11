/**
 * GameMonetize.com HTML5 SDK (https://github.com/GameMonetize/GameMonetize.com-SDK).
 * - `window.SDK_OPTIONS = { gameId, onEvent }`, then https://api.gamemonetize.com/sdk.js injected ONCE while the game
 *   boots (never from a click), as the SDK README's loader does it: a `<script id="gamemonetize-sdk">` inserted before
 *   the first script of the page, only if no element with that id exists yet
 * - SDK_GAME_PAUSE: pause the game and mute all audio; SDK_GAME_START: resume, audio comes back through the player's
 *   own sound / music settings (audio.ts); SDK_READY: interstitials can be shown
 * - interstitials (`sdk.showBanner()`) only at the same natural breaks as the GD build and only after a player click:
 *   the first Play on the title (pre-roll), then Next between levels at most once every ~2 minutes; never during a
 *   level, never on a timer
 * - every request settles exactly once: SDK_GAME_START, a throwing showBanner(), not started within 8 s
 *   (BasePlatform), or AD_MAX after it started
 * - no rewarded API in the GameMonetize SDK: `adsEnabled` is false, so every "watch an ad" button is hidden (as in the
 *   web build) and showBanner() is never used as a fake rewarded ad
 * - saves in localStorage; the SDK failing to load (ad blocker, offline) leaves a fully playable game without ads
 */
import { BasePlatform } from './base';
import { AD_MAX, type AdHandle, type AdResult, type AdSlot, type AdType, type Clock, realClock } from './types';

export const GM_GAME_ID = 'qd017r024ijevcoihn7kl2hkyvkw2t7z';
export const GM_SDK_URL = 'https://api.gamemonetize.com/sdk.js';
export const GM_SCRIPT_ID = 'gamemonetize-sdk';

export interface GMEvent {
  name: string;
  message?: string;
  status?: string;
}
export interface GMSdk {
  showBanner(): unknown;
}

interface GMWindow {
  SDK_OPTIONS?: { gameId: string; onEvent: (e: GMEvent) => void };
  sdk?: GMSdk;
}
const win = () => globalThis as unknown as GMWindow;

interface Pending {
  started: boolean;
  h: AdHandle;
  cap: unknown;
}

export class GameMonetizePlatform extends BasePlatform {
  readonly name = 'gamemonetize';
  /** GameMonetize has no rewarded ads: every rewarded button is hidden in this build */
  override readonly adsEnabled = false;
  protected override muteOnRequest = true;
  private sdkReady = false;
  private prerollDone = false;
  private pending: Pending | null = null;

  constructor(private gameId = GM_GAME_ID, clock: Clock = realClock) {
    // interstitials between levels only depend on the ~2-minute gap (counted from loading or the last ad), as GD
    super(clock, 0);
  }

  /** SDK_READY seen and `sdk.showBanner` there */
  get available(): boolean {
    return this.sdkReady && typeof win().sdk?.showBanner === 'function';
  }

  /** README loader: SDK_OPTIONS first, then sdk.js once. Waits for the script at most `timeoutMs` (never throws). */
  override async init(timeoutMs = 4000): Promise<void> {
    win().SDK_OPTIONS = { gameId: this.gameId, onEvent: (e) => this.onEvent(e) };
    if (typeof document === 'undefined' || document.getElementById(GM_SCRIPT_ID)) return;
    await new Promise<void>((res) => {
      const to = setTimeout(() => res(), timeoutMs);
      const done = () => {
        clearTimeout(to);
        res();
      };
      try {
        const el = document.createElement('script');
        el.id = GM_SCRIPT_ID;
        el.src = GM_SDK_URL;
        el.onload = done;
        // blocked / offline: play on without ads (a late load still enables them)
        el.onerror = done;
        const first = document.getElementsByTagName('script')[0];
        if (first?.parentNode) first.parentNode.insertBefore(el, first);
        else document.head.appendChild(el);
      } catch {
        done();
      }
    });
  }

  /** SDK events (also for ads the SDK shows by itself). */
  onEvent(e: GMEvent): void {
    const p = this.pending;
    switch (e?.name) {
      case 'SDK_READY':
        this.sdkReady = true;
        break;
      case 'SDK_GAME_PAUSE':
        this.setSilence('pause', true);
        if (p && !p.started) {
          p.started = true;
          p.h.started();
          p.cap = this.clock.setTimeout(() => this.done(p, false), AD_MAX);
        }
        break;
      case 'SDK_GAME_START':
        this.setSilence('pause', false);
        // the ad is over (or there was none to show): the request settles
        if (p) this.done(p, true);
        break;
      case 'SDK_ERROR':
      case 'AD_ERROR':
        if (p) this.done(p, false);
        break;
    }
  }

  private done(p: Pending, ok: boolean): void {
    if (this.pending !== p) return;
    this.pending = null;
    if (p.cap !== null) this.clock.clearTimeout(p.cap);
    this.setSilence('pause', false);
    if (ok) p.h.finished();
    else p.h.failed();
  }

  protected show(_type: AdType, h: AdHandle): void {
    const p: Pending = { started: false, h, cap: null };
    this.pending = p;
    win().sdk!.showBanner();
  }

  /** The request settled (also by the 8 s timeout): forget it, late SDK events then change nothing. */
  protected override adSettled(): void {
    const p = this.pending;
    this.pending = null;
    if (p && p.cap !== null) this.clock.clearTimeout(p.cap);
  }

  /** no rewarded API: never shows an ad for a reward, never grants one */
  override requestAd(type: AdType): Promise<AdResult> {
    if (type === 'rewarded') return Promise.resolve('nosdk');
    return super.requestAd(type);
  }

  /** The first Play click is the pre-roll; Next between levels at most once every ~2 minutes. Never during a level. */
  override async midgame(slot: AdSlot): Promise<void> {
    if (!this.available || this.playing) return;
    if (slot === 'preroll') {
      if (this.prerollDone) return;
      this.prerollDone = true;
    } else if (!this.policy.canShowMidgame()) return;
    this.policy.noteAd();
    await this.requestAd('midgame');
  }
}
