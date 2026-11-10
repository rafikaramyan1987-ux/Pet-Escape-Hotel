/**
 * GameDistribution HTML5 SDK. `window.GD_OPTIONS = { gameId, onEvent }`, then main.min.js (script id
 * "gamedistribution-jssdk") is loaded while the game boots.
 * - SDK_GAME_PAUSE: pause gameplay and mute; SDK_GAME_START: resume, audio back if the player's settings allow
 * - `gdsdk.showAd()` only after a user action: the first Play click (pre-roll), then between levels (Next) at
 *   most once every 2 minutes
 * - `gdsdk.showAd('rewarded')` only from a rewarded button; the reward needs SDK_REWARDED_WATCH_COMPLETE
 * - every request settles exactly once (BasePlatform: 8 s start timeout); saves in localStorage
 */
import { BasePlatform } from './base';
import { type AdHandle, type AdSlot, type AdType, type Clock, loadScript, realClock } from './types';

export const GD_GAME_ID = 'b25c8dbf41c5409aa7a8fabe7fc7d2e3';
export const GD_SDK_URL = 'https://html5.api.gamedistribution.com/main.min.js';
export const GD_SCRIPT_ID = 'gamedistribution-jssdk';
/** A rewarded ad that closed without SDK_REWARDED_WATCH_COMPLETE gets this long for a late event (ms). */
export const REWARD_GRACE = 600;

export interface GDEvent {
  name: string;
  message?: string;
  status?: string;
}
export interface GDSdk {
  showAd(type?: 'interstitial' | 'rewarded'): Promise<unknown> | void;
}

interface GDWindow {
  GD_OPTIONS?: { gameId: string; onEvent: (e: GDEvent) => void };
  gdsdk?: GDSdk;
}
const win = () => globalThis as unknown as GDWindow;

interface Pending {
  type: AdType;
  started: boolean;
  earned: boolean;
  h: AdHandle;
  grace: unknown;
}

export class GDPlatform extends BasePlatform {
  readonly name = 'gd';
  protected override muteOnRequest = true;
  private prerollDone = false;
  private pending: Pending | null = null;

  constructor(private gameId = GD_GAME_ID, clock: Clock = realClock) {
    // interstitials between levels only depend on the 2-minute gap (counted from loading or the last ad)
    super(clock, 0);
  }

  get available(): boolean {
    return typeof win().gdsdk?.showAd === 'function';
  }

  override async init(timeoutMs = 4000): Promise<void> {
    win().GD_OPTIONS = { gameId: this.gameId, onEvent: (e) => this.onEvent(e) };
    if (typeof document === 'undefined' || win().gdsdk) return;
    // blocked / offline / slow: play on without ads (a late load still enables them)
    await loadScript(GD_SDK_URL, timeoutMs, GD_SCRIPT_ID);
  }

  /** SDK events (also for ads the SDK shows by itself). */
  onEvent(e: GDEvent): void {
    const p = this.pending;
    switch (e?.name) {
      case 'SDK_GAME_PAUSE':
        this.setSilence('pause', true);
        p?.h.started();
        if (p) p.started = true;
        break;
      case 'SDK_GAME_START':
        this.setSilence('pause', false);
        if (p?.started) this.closed(p);
        break;
      case 'SDK_REWARDED_WATCH_COMPLETE':
        if (p?.type === 'rewarded') p.earned = true;
        break;
      case 'AD_ERROR':
      case 'AD_SDK_CANCELED':
        if (p) this.done(p, false);
        break;
    }
  }

  /** The ad closed: an interstitial is done; a rewarded ad only counts with SDK_REWARDED_WATCH_COMPLETE. */
  private closed(p: Pending): void {
    if (p.type === 'midgame' || p.earned) return this.done(p, true);
    if (p.grace === null) p.grace = this.clock.setTimeout(() => this.done(p, p.earned), REWARD_GRACE);
  }

  private done(p: Pending, ok: boolean): void {
    if (this.pending !== p) return;
    this.pending = null;
    if (p.grace !== null) this.clock.clearTimeout(p.grace);
    this.setSilence('pause', false);
    if (ok) p.h.finished();
    else p.h.failed();
  }

  protected show(type: AdType, h: AdHandle): void {
    const sdk = win().gdsdk!;
    const p: Pending = { type, started: false, earned: false, h, grace: null };
    this.pending = p;
    const r = type === 'rewarded' ? sdk.showAd('rewarded') : sdk.showAd();
    if (r && typeof (r as Promise<unknown>).then === 'function') {
      (r as Promise<unknown>).then(
        () => {
          if (this.pending === p) this.closed(p);
        },
        () => this.done(p, false),
      );
    }
  }

  /** The request settled (also by the 8 s timeout): forget it, late SDK events then change nothing. */
  protected override adSettled(): void {
    const p = this.pending;
    this.pending = null;
    if (p && p.grace !== null) this.clock.clearTimeout(p.grace);
  }

  /** The first Play click is the pre-roll; between levels at most one every 2 minutes. Never during a level. */
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
