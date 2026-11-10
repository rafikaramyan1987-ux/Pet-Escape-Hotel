import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CrazyGamesPlatform as Platform, type CrazySdk } from '../src/platform/crazygames';
import { AD_START_TIMEOUT, MIDGAME_GAP } from '../src/platform/types';

type Cb = { adStarted?: () => void; adFinished?: () => void; adError?: () => void };

function fakeSdk(behaviour: (cb: Cb) => void) {
  const calls: string[] = [];
  const sdk: CrazySdk = {
    ad: { requestAd: (_t, cb) => behaviour(cb) },
    game: {
      gameplayStart: () => calls.push('start'),
      gameplayStop: () => calls.push('stop'),
      happytime: () => calls.push('happy'),
    },
  };
  return { sdk, calls };
}

describe('ad requests settle exactly once', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('finishes on adFinished and ignores later callbacks', async () => {
    let cb: Cb = {};
    const { sdk } = fakeSdk((c) => (cb = c));
    const p = new Platform(sdk);
    const ends = vi.fn();
    p.onAdEnd = ends;
    const r = p.requestAd('rewarded');
    cb.adStarted!();
    cb.adFinished!();
    cb.adError!();
    cb.adFinished!();
    await expect(r).resolves.toBe('finished');
    expect(ends).toHaveBeenCalledTimes(1);
  });

  it('errors on adError', async () => {
    const { sdk } = fakeSdk((c) => {
      c.adStarted!();
      c.adError!();
    });
    await expect(new Platform(sdk).requestAd('rewarded')).resolves.toBe('error');
  });

  it('errors when requestAd throws', async () => {
    const { sdk } = fakeSdk(() => {
      throw new Error('blocked');
    });
    await expect(new Platform(sdk).requestAd('midgame')).resolves.toBe('error');
  });

  it('times out when adStarted is not called within 8 s', async () => {
    const { sdk } = fakeSdk(() => undefined);
    const p = new Platform(sdk);
    const starts = vi.fn();
    p.onAdStart = starts;
    let result: string | null = null;
    void p.requestAd('rewarded').then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(AD_START_TIMEOUT - 1);
    expect(result).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toBe('timeout');
    expect(starts).not.toHaveBeenCalled();
  });

  it('a late adStarted / adFinished after the timeout changes nothing', async () => {
    let cb: Cb = {};
    const { sdk } = fakeSdk((c) => (cb = c));
    const p = new Platform(sdk);
    const starts = vi.fn();
    p.onAdStart = starts;
    const r = p.requestAd('rewarded');
    await vi.advanceTimersByTimeAsync(AD_START_TIMEOUT + 10);
    cb.adStarted!();
    cb.adFinished!();
    await expect(r).resolves.toBe('timeout');
    expect(starts).not.toHaveBeenCalled();
  });

  it('a started ad is not cut off by the start timeout', async () => {
    let cb: Cb = {};
    const { sdk } = fakeSdk((c) => (cb = c));
    let result: string | null = null;
    void new Platform(sdk).requestAd('rewarded').then((r) => (result = r));
    cb.adStarted!();
    await vi.advanceTimersByTimeAsync(AD_START_TIMEOUT * 3);
    expect(result).toBeNull();
    cb.adFinished!();
    await vi.runAllTimersAsync();
    expect(result).toBe('finished');
  });

  it('one ad at a time: a second request while busy resolves "busy"', async () => {
    let cb: Cb = {};
    const { sdk } = fakeSdk((c) => (cb = c));
    const p = new Platform(sdk);
    const first = p.requestAd('rewarded');
    await expect(p.requestAd('rewarded')).resolves.toBe('busy');
    cb.adStarted!();
    cb.adFinished!();
    await expect(first).resolves.toBe('finished');
  });

  it('no SDK: no ad and no reward', async () => {
    const p = new Platform(null);
    await expect(p.requestAd('midgame')).resolves.toBe('nosdk');
    await expect(p.requestAd('rewarded')).resolves.toBe('nosdk');
  });

  it('a rewarded ad that never starts reports "timeout" (no reward) so the button can say so', async () => {
    const { sdk } = fakeSdk(() => undefined);
    const p = new Platform(sdk);
    const r = p.requestAd('rewarded');
    await vi.advanceTimersByTimeAsync(AD_START_TIMEOUT);
    await expect(r).resolves.toBe('timeout');
  });

  it('gameplay stops during the ad and resumes after; calls are de-duplicated', async () => {
    let cb: Cb = {};
    const { sdk, calls } = fakeSdk((c) => (cb = c));
    const p = new Platform(sdk);
    p.gameplayStart();
    p.gameplayStart();
    const r = p.requestAd('rewarded');
    cb.adStarted!();
    cb.adFinished!();
    await r;
    expect(calls).toEqual(['start', 'stop', 'start']);
  });
});

describe('midgame policy', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('only between rooms after the first few, at most one per ~2 minutes', async () => {
    let n = 0;
    const { sdk } = fakeSdk((c) => {
      n++;
      c.adStarted!();
      c.adFinished!();
    });
    const p = new Platform(sdk);
    p.policy.roomsDone = 1;
    await vi.advanceTimersByTimeAsync(MIDGAME_GAP);
    await p.midgame('between');
    expect(n).toBe(0); // too early in the game
    p.policy.roomsDone = 4;
    await p.midgame('between');
    expect(n).toBe(1);
    await vi.advanceTimersByTimeAsync(MIDGAME_GAP / 2);
    p.policy.roomsDone = 5;
    await p.midgame('between');
    expect(n).toBe(1); // within 2 minutes of the last one
    await vi.advanceTimersByTimeAsync(MIDGAME_GAP / 2);
    await p.midgame('between');
    expect(n).toBe(2);
  });
});
