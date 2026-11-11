import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GM_GAME_ID, GameMonetizePlatform, type GMEvent } from '../src/platform/gamemonetize';
import { AD_MAX, AD_START_TIMEOUT, MIDGAME_GAP } from '../src/platform/types';

type G = { SDK_OPTIONS?: { gameId: string; onEvent: (e: GMEvent) => void }; sdk?: unknown };
const g = globalThis as unknown as G;
const ev = (name: string) => g.SDK_OPTIONS!.onEvent({ name });

describe('GameMonetize', () => {
  let shown: number;
  let behaviour: 'ad' | 'throw' | 'silent';
  beforeEach(() => {
    vi.useFakeTimers();
    shown = 0;
    behaviour = 'ad';
    g.sdk = {
      showBanner: () => {
        shown++;
        if (behaviour === 'throw') throw new Error('no fill');
        if (behaviour === 'ad') ev('SDK_GAME_PAUSE');
      },
    };
  });
  afterEach(() => {
    vi.useRealTimers();
    delete g.sdk;
    delete g.SDK_OPTIONS;
  });

  async function ready() {
    const p = new GameMonetizePlatform();
    await p.init();
    ev('SDK_READY');
    return p;
  }

  it('sets SDK_OPTIONS with the game id; no ads before SDK_READY', async () => {
    const p = new GameMonetizePlatform();
    await p.init();
    expect(g.SDK_OPTIONS!.gameId).toBe(GM_GAME_ID);
    expect(GM_GAME_ID).toBe('qd017r024ijevcoihn7kl2hkyvkw2t7z');
    expect(p.available).toBe(false);
    await p.midgame('preroll');
    expect(shown).toBe(0);
    ev('SDK_READY');
    expect(p.available).toBe(true);
  });

  it('no rewarded API: rewarded buttons hidden, a rewarded request never shows an ad', async () => {
    const p = await ready();
    expect(p.adsEnabled).toBe(false);
    await expect(p.requestAd('rewarded')).resolves.toBe('nosdk');
    expect(shown).toBe(0);
  });

  it('SDK_GAME_PAUSE pauses and mutes, SDK_GAME_START resumes and unmutes (idempotent)', async () => {
    const p = await ready();
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

  it('pre-roll on the first Play only; between levels at most once per ~2 minutes; never during gameplay', async () => {
    const p = await ready();
    const run = async (slot: 'preroll' | 'between') => {
      const r = p.midgame(slot);
      ev('SDK_GAME_START');
      await r;
    };
    await run('preroll');
    expect(shown).toBe(1);
    await run('preroll');
    await run('between');
    expect(shown).toBe(1);
    await vi.advanceTimersByTimeAsync(MIDGAME_GAP);
    p.gameplayStart();
    await run('between');
    expect(shown).toBe(1); // in a level: never
    p.gameplayStop();
    await run('between');
    expect(shown).toBe(2);
  });

  it('every request settles exactly once: SDK_GAME_START, a throw, not started in 8 s, or AD_MAX', async () => {
    const p = await ready();
    const starts = vi.fn();
    const ends = vi.fn();
    p.onAdStart = starts;
    p.onAdEnd = ends;
    const a = p.requestAd('midgame');
    expect(p.muted).toBe(true);
    ev('SDK_GAME_START');
    ev('SDK_GAME_START');
    await expect(a).resolves.toBe('finished');
    expect(p.muted).toBe(false);
    expect([starts.mock.calls.length, ends.mock.calls.length]).toEqual([1, 1]);

    behaviour = 'throw';
    await expect(p.requestAd('midgame')).resolves.toBe('error');
    expect(p.muted).toBe(false);

    behaviour = 'silent';
    let res: string | null = null;
    void p.requestAd('midgame').then((r) => (res = r));
    await vi.advanceTimersByTimeAsync(AD_START_TIMEOUT - 1);
    expect(res).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(res).toBe('timeout');
    ev('SDK_GAME_PAUSE');
    ev('SDK_GAME_START');
    expect(res).toBe('timeout');
    expect(p.muted).toBe(false);

    behaviour = 'ad';
    res = null;
    void p.requestAd('midgame').then((r) => (res = r));
    await vi.advanceTimersByTimeAsync(AD_MAX);
    expect(res).toBe('error');
    expect(p.muted).toBe(false);
  });

  it('SDK fails to load: the game plays on without ads', async () => {
    delete g.sdk;
    const p = new GameMonetizePlatform();
    await p.init();
    ev('SDK_READY');
    expect(p.available).toBe(false);
    await p.midgame('preroll');
    await expect(p.requestAd('midgame')).resolves.toBe('nosdk');
  });
});
