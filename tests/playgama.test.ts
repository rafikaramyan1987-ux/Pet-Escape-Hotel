import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_KEY } from '../src/game/save';
import { PlaygamaPlatform, PLAYGAMA_STORAGE_KEYS, type BridgeSdk } from '../src/platform/playgama';
import { AD_START_TIMEOUT, MIDGAME_GAP } from '../src/platform/types';

/** a Playgama Bridge stand-in: `ad` decides what an ad does (it emits Bridge's ad states) */
type Emit = (event: string, value: unknown) => void;
async function setup(ad: (kind: 'interstitial' | 'rewarded', emit: Emit) => void, opts: { audio?: boolean; rewarded?: boolean; saved?: string | null } = {}) {
  const handlers: Record<string, ((v: unknown) => void)[]> = {};
  const emit: Emit = (n, v) => handlers[n]?.forEach((f) => f(v));
  const on = (n: string, f: (v: unknown) => void) => (handlers[n] ??= []).push(f);
  const docListeners: (() => void)[] = [];
  const doc = { hidden: false, addEventListener: (n: string, f: () => void) => n === 'visibilitychange' && docListeners.push(f) };
  const sent: string[] = [];
  const stored: Record<string, string> = {};
  const bridge = {
    initialize: vi.fn(async () => {}),
    EVENT_NAME: { INTERSTITIAL_STATE_CHANGED: 'interstitial_state_changed', REWARDED_STATE_CHANGED: 'rewarded_state_changed', AUDIO_STATE_CHANGED: 'audio_state_changed', PAUSE_STATE_CHANGED: 'pause_state_changed' },
    platform: { id: 'playgama', language: 'fr', isAudioEnabled: opts.audio ?? true, sendMessage: vi.fn((m: string) => sent.push(m)), on },
    advertisement: {
      isInterstitialSupported: true,
      isRewardedSupported: opts.rewarded ?? true,
      showInterstitial: vi.fn(() => ad('interstitial', emit)),
      showRewarded: vi.fn(() => ad('rewarded', emit)),
      on,
    },
    storage: {
      get: vi.fn(async (keys: string[]) => keys.map((k) => (k === SAVE_KEY ? (opts.saved ?? null) : null))),
      set: vi.fn(async (k: string, v: string) => void (stored[k] = v)),
    },
  };
  vi.stubGlobal('window', { bridge: bridge as unknown as BridgeSdk });
  vi.stubGlobal('document', doc);
  const pg = new PlaygamaPlatform();
  const log: string[] = [];
  pg.onPause = (p) => log.push(p ? 'pause' : 'resume');
  pg.onMuteChange = (m) => log.push(m ? 'mute' : 'unmute');
  await pg.init();
  const visibility = (hidden: boolean) => {
    doc.hidden = hidden;
    docListeners.forEach((f) => f());
  };
  return { pg, bridge, emit, log, sent, stored, visibility };
}
/** an ad that opens, plays and closes; `reward` emits the rewarded state first */
const watched =
  (reward: boolean) =>
  (kind: 'interstitial' | 'rewarded', emit: Emit) => {
    const ev = kind === 'rewarded' ? 'rewarded_state_changed' : 'interstitial_state_changed';
    emit(ev, 'loading');
    setTimeout(() => emit(ev, 'opened'), 100);
    if (reward) setTimeout(() => emit(ev, 'rewarded'), 900);
    setTimeout(() => emit(ev, 'closed'), 1000);
  };

describe('Playgama platform (Bridge)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('init: Bridge initialized, platform language, every save key read in one storage.get, writes to Bridge Storage', async () => {
    const { pg, bridge, stored } = await setup(watched(true), { saved: '{"v":1,"coins":7}' });
    expect(bridge.initialize).toHaveBeenCalledOnce();
    expect(pg.locale()).toBe('fr');
    expect(PLAYGAMA_STORAGE_KEYS).toEqual([SAVE_KEY]);
    expect(bridge.storage.get).toHaveBeenCalledOnce();
    expect(bridge.storage.get).toHaveBeenCalledWith([SAVE_KEY]);
    expect(pg.getItem(SAVE_KEY)).toBe('{"v":1,"coins":7}');
    pg.setItem(SAVE_KEY, '{"v":1,"coins":9}');
    pg.setItem(SAVE_KEY, '{"v":1,"coins":9}'); // unchanged: no second write
    await Promise.resolve();
    expect(bridge.storage.set).toHaveBeenCalledOnce();
    expect(stored[SAVE_KEY]).toBe('{"v":1,"coins":9}');
    expect(pg.getItem(SAVE_KEY)).toBe('{"v":1,"coins":9}');
  });

  it('game_ready once after the loading screen; level_started once per level, level_completed / level_failed at its end', async () => {
    const { pg, sent } = await setup(watched(true));
    pg.loadingStop();
    pg.loadingStop();
    expect(sent).toEqual([]); // not while the loading screen is going away
    await vi.advanceTimersByTimeAsync(600);
    pg.gameplayStart();
    pg.gameplayStop();
    pg.gameplayStart(); // resume after a pause: same level
    pg.gameplayStop();
    pg.happytime();
    pg.gameplayStart();
    pg.gameplayStop();
    pg.sadMoment();
    expect(sent).toEqual(['game_ready', 'level_started', 'level_completed', 'level_started', 'level_failed']);
  });

  it('rewarded: granted only after the `rewarded` state; muted + paused while the ad is open, audio back after', async () => {
    const { pg, log } = await setup(watched(true));
    expect(pg.adsEnabled).toBe(true);
    const p = pg.requestAd('rewarded');
    await vi.advanceTimersByTimeAsync(500);
    expect(pg.muted).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await p).toBe('finished');
    expect(pg.muted).toBe(false);
    expect(log).toEqual(['mute', 'pause', 'unmute', 'resume']);
  });

  it('rewarded: closed without the reward (cancelled) or failed → no reward', async () => {
    const { pg } = await setup(watched(false));
    const p = pg.requestAd('rewarded');
    await vi.advanceTimersByTimeAsync(1500);
    expect(await p).not.toBe('finished');
    const f = await setup((_kind, emit) => setTimeout(() => emit('rewarded_state_changed', 'failed'), 200));
    const q = f.pg.requestAd('rewarded');
    await vi.advanceTimersByTimeAsync(300);
    expect(await q).not.toBe('finished');
  });

  it('settles exactly once: an ad that never opens gives up after 8 s; late states are ignored', async () => {
    const { pg, emit } = await setup(() => {});
    const p = pg.requestAd('rewarded');
    await vi.advanceTimersByTimeAsync(AD_START_TIMEOUT + 10);
    expect(await p).toBe('timeout');
    emit('rewarded_state_changed', 'opened');
    emit('rewarded_state_changed', 'rewarded');
    emit('rewarded_state_changed', 'closed');
    expect(pg.muted).toBe(false);
  });

  it('no rewarded ads where Bridge has none: adsEnabled false (buttons hidden), Bridge never asked', async () => {
    const { pg, bridge } = await setup(watched(true), { rewarded: false });
    expect(pg.adsEnabled).toBe(false);
    expect(await pg.requestAd('rewarded')).toBe('nosdk');
    expect(bridge.advertisement.showRewarded).not.toHaveBeenCalled();
  });

  it('interstitials: between levels only, never in a level or as a pre-roll, at most one per MIDGAME_GAP', async () => {
    const { pg, bridge } = await setup(watched(false));
    await pg.midgame('between'); // right after loading: too early
    expect(bridge.advertisement.showInterstitial).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(MIDGAME_GAP);
    await pg.midgame('preroll');
    expect(bridge.advertisement.showInterstitial).not.toHaveBeenCalled();
    pg.gameplayStart();
    await pg.midgame('between'); // in a level
    expect(bridge.advertisement.showInterstitial).not.toHaveBeenCalled();
    pg.gameplayStop();
    const p = pg.midgame('between');
    await vi.advanceTimersByTimeAsync(1500);
    await p;
    expect(bridge.advertisement.showInterstitial).toHaveBeenCalledOnce();
    await pg.midgame('between'); // within the gap
    expect(bridge.advertisement.showInterstitial).toHaveBeenCalledOnce();
  });

  it("platform audio off mutes without pausing; Bridge's pause and a hidden page pause + mute; restore only when nothing is left", async () => {
    const { pg, emit, log, visibility } = await setup(watched(true), { audio: false });
    expect(pg.muted).toBe(true);
    emit('audio_state_changed', true);
    expect(pg.muted).toBe(false);
    emit('pause_state_changed', true);
    visibility(true);
    expect(pg.muted).toBe(true);
    emit('pause_state_changed', false);
    expect(pg.muted).toBe(true); // still hidden
    visibility(false);
    expect(pg.muted).toBe(false);
    emit('audio_state_changed', false);
    expect(pg.muted).toBe(true);
    expect(log).toEqual(['mute', 'unmute', 'mute', 'pause', 'unmute', 'resume', 'mute']);
  });

  it('without Bridge (script blocked) the game plays on: no ads, an in-memory save', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { hidden: false, addEventListener: () => {} });
    const pg = new PlaygamaPlatform();
    await pg.init();
    expect(pg.available).toBe(false);
    expect(pg.adsEnabled).toBe(false);
    expect(await pg.requestAd('rewarded')).toBe('nosdk');
    await pg.midgame('between');
    pg.setItem(SAVE_KEY, 'x');
    expect(pg.getItem(SAVE_KEY)).toBe('x');
  });

  it('a Bridge that never initializes is given up after 10 s', async () => {
    const never = { initialize: () => new Promise(() => {}) };
    vi.stubGlobal('window', { bridge: never });
    vi.stubGlobal('document', { hidden: false, addEventListener: () => {} });
    const pg = new PlaygamaPlatform();
    const p = pg.init();
    await vi.advanceTimersByTimeAsync(10_000);
    await p;
    expect(pg.available).toBe(false);
  });
});
