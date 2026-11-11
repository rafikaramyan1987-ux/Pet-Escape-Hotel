/**
 * Playgama Bridge (https://github.com/Playgama/bridge). index.html of the Playgama build loads Bridge from Playgama's
 * CDN (https://bridge.playgama.com/v2/stable/playgama-bridge.js) as its first script and initializes it before the
 * game bundle runs (vite.config.ts, scripts/playgama/boot.js); outside Playgama, Bridge runs its mock platform (no
 * ads, its own storage).
 * - init (before the first level): `bridge.initialize()`'s outcome (see initBridge; a failure is logged with
 *   console.error and the game plays on with no ads and an in-memory save), then `platform.language` (Bridge's own fallback is the browser language; the game
 *   falls back to English; a language the player chose in Settings still wins), the save through Bridge Storage (one
 *   `storage.get([...])` of every key, kept in memory; writes go to `storage.set`), `platform.isAudioEnabled`, and
 *   the AUDIO_STATE_CHANGED / PAUSE_STATE_CHANGED events
 * - `game_ready` once the loading screen is gone and the first level is up (500 ms after loadingStop()); it is always the
 *   first message: gameplay messages before it (level 1's level_started) are held and sent right after it
 * - gameplay start → `level_started` (once per level); a rescue → `level_completed`, a fail → `level_failed`
 * - interstitials (`advertisement.showInterstitial()`) on every Next between levels, with no counter or timer of the
 *   game's own: Bridge paces them (`minimumDelayBetweenInterstitial: 120` in playgama-bridge-config.json); never
 *   during a level, never before the first level is finished, no pre-roll
 * - rewarded (`advertisement.showRewarded()`) only from the labelled ad buttons; `adsEnabled` is Bridge's
 *   `isRewardedSupported`, so without rewarded ads the ad buttons are hidden (as in the web build). The reward is
 *   granted only when Bridge reports the `rewarded` state before `closed`; cancelled / failed: no reward
 * - every ad request settles exactly once (BasePlatform: closed / failed, or not opened within 8 s)
 * - an ad opening, Bridge's pause state and the page being hidden pause the level and mute all audio; Bridge's audio
 *   state mutes without pausing; audio only comes back when nothing keeps the game silent, and then through the
 *   player's own sound / music settings (audio.ts)
 */
import { BasePlatform } from './base';
import { type AdHandle, type AdResult, type AdSlot, type AdType, type Clock, realClock } from './types';

/** every storage key the game uses (src/game/save.ts SAVE_KEY), read in one `storage.get([...])` at startup */
export const PLAYGAMA_STORAGE_KEYS = ['screw-and-rescue.save.v1'];
/** `game_ready` this long after the loading screen is gone (the first level is mounted by then) */
export const GAME_READY_DELAY = 500;

type Listener = (v: never) => void;
export interface BridgeSdk {
  initialize(): Promise<unknown>;
  EVENT_NAME: Record<'INTERSTITIAL_STATE_CHANGED' | 'REWARDED_STATE_CHANGED' | 'AUDIO_STATE_CHANGED' | 'PAUSE_STATE_CHANGED', string>;
  platform: {
    id: string;
    language: string;
    isAudioEnabled: boolean;
    sendMessage(message: string, options?: Record<string, unknown>): unknown;
    on(event: string, fn: Listener): void;
  };
  advertisement: {
    isInterstitialSupported: boolean;
    isRewardedSupported: boolean;
    showInterstitial(placement?: string): void;
    showRewarded(placement?: string): void;
    on(event: string, fn: Listener): void;
  };
  storage: {
    get(keys: string[]): Promise<unknown[]>;
    set(key: string, value: string): Promise<unknown>;
  };
}

declare global {
  interface Window {
    bridge?: BridgeSdk;
    /** the Playgama platform, for scripts/playgama/test.mjs */
    __playgama?: PlaygamaPlatform;
    /** set by the Playgama build's boot script: bridge.initialize()'s outcome (null = initialized, else the error) */
    __playgamaBridgeInit?: Promise<unknown>;
  }
}

const NO_SDK = 'the game runs WITHOUT Playgama Bridge (no ads, no Bridge storage, no game_ready)';
/**
 * Bridge after `bridge.initialize()`, or null when it failed (logged with console.error, never silent; the game then
 * plays on without the SDK). In the Playgama build index.html's boot script (scripts/playgama/boot.js) already called
 * initialize() and started the game only once it settled: its outcome is `window.__playgamaBridgeInit`. No timeout of
 * the game's own: Bridge settles the promise itself (Playgama: wait for initialization before anything else).
 */
export async function initBridge(): Promise<BridgeSdk | null> {
  if (typeof window === 'undefined') return null;
  const b = window.bridge;
  if (!b?.initialize) {
    console.error(`[Playgama Bridge] window.bridge is missing: ${NO_SDK}`);
    return null;
  }
  const booted = window.__playgamaBridgeInit;
  const err = booted
    ? await booted
    : await b.initialize().then(
        () => null,
        (e: unknown) => e ?? new Error('bridge.initialize() rejected'),
      );
  if (err) {
    // the boot script has logged it already
    if (!booted) console.error(`[Playgama Bridge] bridge.initialize() failed; ${NO_SDK}:`, err);
    return null;
  }
  return b;
}

interface Pending {
  type: AdType;
  h: AdHandle;
  opened: boolean;
  earned: boolean;
}

export class PlaygamaPlatform extends BasePlatform {
  readonly name = 'playgama';
  /** rewarded-ad buttons only where Bridge has rewarded ads (set in init) */
  override adsEnabled = false;
  private b: BridgeSdk | null = null;
  private mem = new Map<string, string>();
  private lang: string | null = null;
  private levelOn = false;
  private readySent = false;
  /** gameplay messages waiting for game_ready (see send) */
  private held: string[] = [];
  private pausedBy = new Set<'sdk' | 'hidden'>();
  private pending: Pending | null = null;
  /** what was sent to / received from Bridge (messages, ad states), for scripts/playgama/test.mjs */
  readonly log: string[] = [];

  constructor(clock: Clock = realClock) {
    // the base AdPolicy is not used for interstitials here (see midgame): Bridge paces them
    super(clock, 0);
  }

  /** Bridge is up: interstitials can be asked for (rewarded: see adsEnabled) */
  get available(): boolean {
    return !!this.b;
  }

  override async init(): Promise<void> {
    if (typeof window !== 'undefined') window.__playgama = this;
    this.b = await initBridge();
    const s = this.b;
    if (s) {
      try {
        this.lang = s.platform.language || null;
      } catch {
        this.lang = null;
      }
      try {
        const vals = await s.storage.get(PLAYGAMA_STORAGE_KEYS);
        PLAYGAMA_STORAGE_KEYS.forEach((k, i) => {
          const v = Array.isArray(vals) ? vals[i] : null;
          if (v !== null && v !== undefined) this.mem.set(k, typeof v === 'string' ? v : JSON.stringify(v));
        });
      } catch {
        /* nothing saved yet / storage unavailable: a fresh save */
      }
      try {
        this.adsEnabled = s.advertisement.isRewardedSupported === true;
      } catch {
        this.adsEnabled = false;
      }
      const E = s.EVENT_NAME;
      this.call(() => {
        if (s.platform.isAudioEnabled === false) this.setSilence('soundOff', true);
      });
      this.call(() => s.platform.on(E.AUDIO_STATE_CHANGED, ((on: boolean) => this.setSilence('soundOff', on === false)) as Listener));
      this.call(() => s.platform.on(E.PAUSE_STATE_CHANGED, ((p: boolean) => this.pause('sdk', !!p)) as Listener));
      this.call(() => s.advertisement.on(E.INTERSTITIAL_STATE_CHANGED, ((st: string) => this.onAdState('interstitial', st)) as Listener));
      this.call(() => s.advertisement.on(E.REWARDED_STATE_CHANGED, ((st: string) => this.onAdState('rewarded', st)) as Listener));
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => this.pause('hidden', document.hidden));
      // Playgama 1.4.5: a long press on the game opens no context menu, callout or magnifier
      document.addEventListener('contextmenu', (e) => e.preventDefault());
      document.documentElement?.style?.setProperty('-webkit-touch-callout', 'none');
    }
  }

  /** Bridge's pause state and the page being hidden: pause the level + mute (reasons tracked separately) */
  private pause(reason: 'sdk' | 'hidden', on: boolean): void {
    if (on) this.pausedBy.add(reason);
    else this.pausedBy.delete(reason);
    this.setSilence('pause', this.pausedBy.size > 0);
  }

  private onAdState(type: 'interstitial' | 'rewarded', state: string): void {
    this.log.push(`${type}:${state}`);
    const p = this.pending;
    if (!p || (p.type === 'rewarded') !== (type === 'rewarded')) return;
    if (state === 'opened') {
      p.opened = true;
      p.h.started();
      this.setSilence('ad', true);
    } else if (state === 'rewarded') p.earned = true;
    else if (state === 'closed') {
      if (p.type === 'rewarded' && !p.earned) p.h.failed();
      else p.h.finished();
    } else if (state === 'failed') p.h.failed();
  }

  protected show(type: AdType, h: AdHandle): void {
    const s = this.b!;
    this.pending = { type, h, opened: false, earned: false };
    if (type === 'rewarded') s.advertisement.showRewarded();
    else s.advertisement.showInterstitial();
  }

  protected override adSettled(): void {
    this.pending = null;
  }

  /** rewarded only where Bridge supports it (the buttons are hidden otherwise) */
  override requestAd(type: AdType): Promise<AdResult> {
    if (type === 'rewarded' && !this.adsEnabled) return Promise.resolve('nosdk');
    return super.requestAd(type);
  }

  /**
   * Interstitial on every Next between levels (only offered on a rescued level's result card: never in a level, never
   * before the first level is finished, no pre-roll). No counter or timer of the game's own: how often one actually
   * shows is Bridge's call (`minimumDelayBetweenInterstitial` in playgama-bridge-config.json), as Playgama's docs say.
   */
  override async midgame(slot: AdSlot): Promise<void> {
    if (slot !== 'between' || this.playing || !this.b) return;
    try {
      if (!this.b.advertisement.isInterstitialSupported) return;
    } catch {
      return;
    }
    await this.requestAd('midgame');
  }

  override locale(): string | null {
    return this.lang;
  }

  /** the loading screen is gone: Bridge's `game_ready` once the first level is up */
  override loadingStop(): void {
    this.clock.setTimeout(() => {
      if (this.readySent || !this.b) return;
      this.readySent = true;
      this.send('game_ready');
      // gameplay messages sent while the loading screen was still up (level 1 mounts behind it) follow game_ready,
      // in their order
      for (const m of this.held.splice(0)) this.send(m);
    }, GAME_READY_DELAY);
  }

  protected override sdkGameplay(on: boolean): void {
    if (!on || this.levelOn) return;
    this.levelOn = true;
    this.send('level_started');
  }

  override happytime(): void {
    this.levelEnd(true);
  }
  override sadMoment(): void {
    this.levelEnd(false);
  }
  private levelEnd(won: boolean): void {
    if (!this.levelOn) return;
    this.levelOn = false;
    this.send(won ? 'level_completed' : 'level_failed');
  }

  /**
   * Every Bridge message goes through here. Playgama: `game_ready` comes first, so any gameplay message (level_started,
   * level_completed, …) before it is held and sent right after it.
   */
  private send(m: string): void {
    if (m !== 'game_ready' && !this.readySent) {
      this.held.push(m);
      return;
    }
    this.log.push(m);
    this.call(() => void Promise.resolve(this.b?.platform.sendMessage(m)).catch(() => undefined));
  }

  // ─── saves: Bridge Storage only (Playgama 3.2.1), in memory without Bridge ───
  override getItem(k: string): string | null {
    return this.mem.get(k) ?? null;
  }

  override setItem(k: string, v: string): void {
    if (this.mem.get(k) === v) return;
    this.mem.set(k, v);
    const s = this.b;
    if (s) this.call(() => void Promise.resolve(s.storage.set(k, v)).catch(() => undefined));
  }
}
