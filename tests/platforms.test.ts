import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePixPlatform, type GamePixSdk } from '../src/platform/gamepix';
import { GD_GAME_ID, GDPlatform, type GDEvent } from '../src/platform/gd';
import { AD_START_TIMEOUT, MIDGAME_GAP } from '../src/platform/types';
import { WebPlatform } from '../src/platform/web';

type G = { GD_OPTIONS?: { gameId: string; onEvent: (e: GDEvent) => void }; gdsdk?: unknown };
const g = globalThis as unknown as G;

describe('web build', () => {
  it('no SDK, no ads: rewarded buttons are hidden', async () => {
    const p = new WebPlatform();
    expect(p.adsEnabled).toBe(false);
    await expect(p.requestAd('rewarded')).resolves.toBe('nosdk');
    await p.midgame('preroll');
    await p.midgame('between');
  });
});

describe('GameDistribution', () => {
  let shown: (string | undefined)[];
  let resolveAd: (() => void) | null;
  const ev = (name: string) => g.GD_OPTIONS!.onEvent({ name });
  beforeEach(async () => {
    vi.useFakeTimers();
    shown = [];
    resolveAd = null;
    g.gdsdk = { showAd: (t?: string) => (shown.push(t), new Promise<void>((r) => (resolveAd = r))) };
  });
  afterEach(() => {
    vi.useRealTimers();
    delete g.gdsdk;
    delete g.GD_OPTIONS;
  });

  it('sets GD_OPTIONS with the game id', async () => {
    const p = new GDPlatform();
    await p.init();
    expect(g.GD_OPTIONS!.gameId).toBe(GD_GAME_ID);
    expect(GD_GAME_ID).toBe('b25c8dbf41c5409aa7a8fabe7fc7d2e3');
  });

  it('SDK_GAME_PAUSE pauses and mutes, SDK_GAME_START resumes and unmutes; idempotent', async () => {
    const p = new GDPlatform();
    await p.init();
    const mute = vi.fn();
    const pause = vi.fn();
    p.onMuteChange = mute;
    p.onPause = pause;
    ev('SDK_GAME_PAUSE');
    ev('SDK_GAME_PAUSE');
    expect(p.muted).toBe(true);
    ev('SDK_GAME_START');
    ev('SDK_GAME_START');
    expect(p.muted).toBe(false);
    expect(mute.mock.calls).toEqual([[true], [false]]);
    expect(pause.mock.calls).toEqual([[true], [false]]);
  });

  it('pre-roll on the first Play only, then between levels at most every 2 minutes', async () => {
    const p = new GDPlatform();
    await p.init();
    const run = async (slot: 'preroll' | 'between') => {
      const r = p.midgame(slot);
      if (resolveAd) {
        ev('SDK_GAME_PAUSE');
        ev('SDK_GAME_START');
        resolveAd();
        resolveAd = null;
      }
      await r;
    };
    await run('preroll');
    expect(shown).toEqual([undefined]);
    await run('preroll');
    await run('between');
    expect(shown).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(MIDGAME_GAP);
    await run('between');
    expect(shown).toEqual([undefined, undefined]);
  });

  it('rewarded: granted only after SDK_REWARDED_WATCH_COMPLETE', async () => {
    const p = new GDPlatform();
    await p.init();
    const ok = p.requestAd('rewarded');
    expect(shown).toEqual(['rewarded']);
    expect(p.muted).toBe(true); // muted from the request on
    ev('SDK_GAME_PAUSE');
    ev('SDK_REWARDED_WATCH_COMPLETE');
    ev('SDK_GAME_START');
    await expect(ok).resolves.toBe('finished');
    expect(p.muted).toBe(false);
    // closed early: no reward (after a short grace for a late event)
    const no = p.requestAd('rewarded');
    ev('SDK_GAME_PAUSE');
    ev('SDK_GAME_START');
    await vi.advanceTimersByTimeAsync(1000);
    await expect(no).resolves.toBe('error');
  });

  it('settles exactly once: an ad that never starts times out after 8 s; late events change nothing', async () => {
    const p = new GDPlatform();
    await p.init();
    let res: string | null = null;
    void p.requestAd('rewarded').then((r) => (res = r));
    await vi.advanceTimersByTimeAsync(AD_START_TIMEOUT - 1);
    expect(res).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(res).toBe('timeout');
    expect(p.muted).toBe(false);
    ev('SDK_REWARDED_WATCH_COMPLETE');
    ev('SDK_GAME_START');
    expect(res).toBe('timeout');
  });

  it('AD_ERROR fails the request', async () => {
    const p = new GDPlatform();
    await p.init();
    const r = p.requestAd('rewarded');
    ev('AD_ERROR');
    await expect(r).resolves.toBe('error');
  });
});

function fakeGamePix() {
  const calls: string[] = [];
  const handlers: Record<string, () => void> = {};
  let adResult: Promise<{ success: boolean }> = Promise.resolve({ success: true });
  let loaded: () => void = () => undefined;
  const sdk: GamePixSdk = {
    lifecycle: {
      loading: (p) => calls.push(`loading:${p}`),
      loaded: () => (calls.push('loaded'), new Promise<void>((r) => (loaded = r))),
      gameStart: () => calls.push('gameStart'),
    },
    events: { on: (n, fn) => (handlers[n] = fn) },
    on: { pause: false, resume: false, soundOn: false, soundOff: false },
    pause: false,
    resume: false,
    soundOn: false,
    soundOff: false,
    ads: {
      interstitial: () => (calls.push('interstitial'), adResult),
      reward: () => (calls.push('reward'), adResult),
    },
    lang: () => 'de',
    happyMoment: (n) => calls.push(`happy:${n}`),
    sadMoment: (n) => calls.push(`sad:${n}`),
  };
  return { sdk, calls, handlers, setAd: (r: Promise<{ success: boolean }>) => (adResult = r), loaded: () => loaded() };
}

async function ready(p: GamePixPlatform, f: ReturnType<typeof fakeGamePix>) {
  const r = p.ready();
  f.loaded();
  await r;
}

describe('GamePix', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('lifecycle: loading 0..100, loaded() before the menu, gameStart once when level 1 starts', async () => {
    const f = fakeGamePix();
    const p = new GamePixPlatform(f.sdk);
    await p.init();
    p.loadingStart();
    p.loadingProgress(60);
    p.loadingProgress(50);
    p.gameplayStart(); // before loaded(): not yet
    p.gameplayStop();
    const ready = p.ready();
    f.loaded();
    await ready;
    p.gameplayStart();
    p.gameplayStop();
    p.gameplayStart();
    expect(f.calls).toEqual(['loading:10', 'loading:20', 'loading:60', 'loading:100', 'loaded', 'gameStart']);
    expect(p.locale()).toBe('de');
  });

  it('pause / resume and soundOff / soundOn (events and legacy hooks): idempotent, audio only back when all clear', async () => {
    const f = fakeGamePix();
    const p = new GamePixPlatform(f.sdk);
    await p.init();
    const paused = vi.fn();
    p.onPause = paused;
    f.handlers.soundOff();
    f.handlers.pause();
    f.handlers.pause();
    expect(p.muted).toBe(true);
    f.handlers.resume();
    expect(p.muted).toBe(true); // still sound off
    (f.sdk.soundOn as () => void)(); // legacy hook
    expect(p.muted).toBe(false);
    (f.sdk.on!.soundOff as () => void)(); // GamePix.on.<name> callback (what the SDK calls first)
    f.handlers.soundOff();
    expect(p.muted).toBe(true);
    f.handlers.soundOn();
    expect(p.muted).toBe(false);
    expect(paused.mock.calls).toEqual([[true], [false]]);
    // the SDK's own callbacks: GamePix.on.pause / GamePix.resume
    (f.sdk.on!.pause as () => void)();
    expect(p.muted).toBe(true);
    (f.sdk.resume as () => void)();
    expect(p.muted).toBe(false);
  });

  it('rewarded only on success === true; muted during the ad; nofill / cancel / rejection give nothing', async () => {
    const f = fakeGamePix();
    const p = new GamePixPlatform(f.sdk);
    await p.init();
    await ready(p, f);
    const ok = p.requestAd('rewarded');
    expect(p.muted).toBe(true);
    await expect(ok).resolves.toBe('finished');
    expect(p.muted).toBe(false);
    f.setAd(Promise.resolve({ success: false }));
    await expect(p.requestAd('rewarded')).resolves.toBe('error');
    f.setAd(Promise.reject(new Error('cancel')));
    await expect(p.requestAd('rewarded')).resolves.toBe('error');
    f.setAd(new Promise(() => undefined)); // never answers
    const hang = p.requestAd('rewarded');
    await vi.advanceTimersByTimeAsync(AD_START_TIMEOUT);
    await expect(hang).resolves.toBe('timeout');
    expect(p.muted).toBe(false);
  });

  it('a long ad that really started (pause event) is not cut off by the 8 s timeout', async () => {
    const f = fakeGamePix();
    const p = new GamePixPlatform(f.sdk);
    await p.init();
    await ready(p, f);
    let done: (v: { success: boolean }) => void = () => undefined;
    f.setAd(new Promise((r) => (done = r)));
    let res: string | null = null;
    void p.requestAd('rewarded').then((r) => (res = r));
    f.handlers.pause();
    await vi.advanceTimersByTimeAsync(AD_START_TIMEOUT * 3);
    expect(res).toBeNull();
    f.handlers.resume();
    done({ success: true });
    await vi.runAllTimersAsync();
    expect(res).toBe('finished');
  });

  it('interstitials only between levels, at most every 2 minutes; no pre-roll', async () => {
    const f = fakeGamePix();
    const p = new GamePixPlatform(f.sdk);
    await p.init();
    await ready(p, f);
    await p.midgame('preroll');
    await p.midgame('between');
    expect(f.calls.filter((c) => c === 'interstitial')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(MIDGAME_GAP);
    await p.midgame('between');
    await p.midgame('between');
    expect(f.calls.filter((c) => c === 'interstitial')).toHaveLength(1);
  });

  it('happy / sad moments', async () => {
    const f = fakeGamePix();
    const p = new GamePixPlatform(f.sdk);
    p.happytime();
    p.sadMoment();
    expect(f.calls).toEqual(['happy:level_complete', 'sad:level_failed']);
  });

  it('no SDK (blocked): the game plays on, no reward', async () => {
    const p = new GamePixPlatform(null);
    await p.init();
    await p.ready();
    await expect(p.requestAd('rewarded')).resolves.toBe('nosdk');
  });
});
