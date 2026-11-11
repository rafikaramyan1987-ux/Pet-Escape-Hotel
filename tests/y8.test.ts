import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AD_MAX, AD_START_TIMEOUT } from '../src/platform/types';
import { Y8_APP_ID, Y8_GAME_ID, Y8Platform, type Y8ShowAdOptions, type Y8Sdk } from '../src/platform/y8';

type Mode = 'ad' | 'noad' | 'dismiss' | 'reject' | 'silent' | 'throw';

/** A stand-in for window.y8 (the real one comes from cdn.y8.com) on a fake window / document. */
function fakeY8() {
  const calls: string[] = [];
  const last: { opts: Y8ShowAdOptions | null } = { opts: null };
  let mode: Mode = 'ad';
  const win = new EventTarget() as EventTarget & { y8?: unknown };
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const sdk: Y8Sdk = {
    init: (app, ad) => {
      calls.push(`init:${JSON.stringify(app)}:${JSON.stringify({ ...ad, onReady: typeof ad.onReady })}`);
      ad.onReady();
    },
    onAuth: (cb) => {
      calls.push('onAuth');
      cb(null, null);
    },
    showAd: (o) => {
      calls.push(`showAd:${o.type}`);
      last.opts = o;
      if (mode === 'throw') throw new Error('broken');
      if (mode === 'reject') return Promise.reject(new Error('no fill'));
      if (mode === 'silent') return Promise.resolve();
      if (mode === 'noad') {
        o.adBreakDone?.({ breakStatus: 'notReady' });
        return Promise.resolve();
      }
      if (o.type === 'reward') {
        o.beforeReward?.(() => {
          o.beforeAd?.();
          if (mode === 'dismiss') o.adDismissed?.();
          else o.adViewed?.();
          o.afterAd?.();
          o.adBreakDone?.({ breakStatus: mode === 'dismiss' ? 'dismissed' : 'viewed' });
        });
        return Promise.resolve();
      }
      o.beforeAd?.();
      calls.push(`during:${o.type}`);
      o.afterAd?.();
      o.adBreakDone?.({ breakStatus: 'viewed' });
      return Promise.resolve();
    },
  };
  /** the SDK script loaded: window.y8 exists, emitReadyEvent() dispatches y8sdk.ready */
  const load = () => {
    win.y8 = { sdk: () => (calls.push('y8.sdk()'), sdk), emitReadyEvent: () => win.dispatchEvent(new Event('y8sdk.ready')) };
  };
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  return { calls, last, win, doc, load, setMode: (m: Mode) => (mode = m) };
}

describe('Y8', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('initializes exactly like the portal snippet (SDK already loaded: emitReadyEvent); no ad call before init', async () => {
    const f = fakeY8();
    const p = new Y8Platform();
    expect(p.available).toBe(false);
    await p.midgame('preroll');
    expect(f.calls).toEqual([]);
    f.load();
    await p.init();
    expect(f.calls).toEqual([
      'y8.sdk()',
      `init:{"appId":"${Y8_APP_ID}","autoLogin":true}:{"gameId":"${Y8_GAME_ID}","preloadAdBreaks":"on","sound":"on","onReady":"function"}`,
      'onAuth',
    ]);
    expect([Y8_APP_ID, Y8_GAME_ID]).toEqual(['6af4b159ca1c6869a74e059b', '292545']);
    expect(p.available).toBe(true);
    expect(p.adsEnabled).toBe(true);
    expect(p.adSystemReady).toBe(true);
    // y8sdk.ready is handled once
    f.win.dispatchEvent(new Event('y8sdk.ready'));
    expect(f.calls.filter((c) => c === 'y8.sdk()')).toHaveLength(1);
  });

  it('a late SDK still initializes; no SDK (ad blocker): no ads, rewarded buttons hidden, game goes on', async () => {
    const f = fakeY8();
    const p = new Y8Platform();
    const init = p.init();
    await vi.advanceTimersByTimeAsync(4000);
    await init;
    expect(p.available).toBe(false);
    expect(p.adsEnabled).toBe(false);
    await expect(p.requestAd('rewarded')).resolves.toBe('nosdk');
    await p.midgame('between');
    f.load();
    (f.win as unknown as { y8: { emitReadyEvent: () => void } }).y8.emitReadyEvent();
    expect(p.available).toBe(true);
  });

  it('start on the first Play only, next on every Next / Retry (no own cap); never during gameplay', async () => {
    const f = fakeY8();
    f.load();
    const p = new Y8Platform();
    await p.init();
    await p.midgame('preroll');
    await p.midgame('preroll');
    await p.midgame('between');
    await p.midgame('between');
    p.gameplayStart();
    await p.midgame('between');
    p.gameplayStop();
    expect(f.calls.filter((c) => c.startsWith('showAd'))).toEqual(['showAd:start', 'showAd:next', 'showAd:next']);
  });

  it('beforeAd pauses + mutes, afterAd resumes + unmutes', async () => {
    const f = fakeY8();
    f.load();
    const p = new Y8Platform();
    await p.init();
    const seen: string[] = [];
    p.onMuteChange = (m) => seen.push(`mute:${m}`);
    p.onPause = (x) => seen.push(`pause:${x}`);
    p.onAdStart = () => seen.push('adStart');
    p.onAdEnd = () => seen.push('adEnd');
    await p.midgame('between');
    expect(seen).toEqual(['adStart', 'mute:true', 'pause:true', 'mute:false', 'pause:false', 'adEnd']);
    expect(p.muted).toBe(false);
  });

  it('no ad to show: the break ends at once and the game continues', async () => {
    const f = fakeY8();
    f.load();
    const p = new Y8Platform();
    await p.init();
    f.setMode('noad');
    await expect(p.requestAd('midgame')).resolves.toBe('finished');
    expect(p.muted).toBe(false);
  });

  it('rewarded: showAdFn() in beforeReward, reward only on adViewed; dismissed / no ad = no reward', async () => {
    const f = fakeY8();
    f.load();
    const p = new Y8Platform();
    await p.init();
    await expect(p.requestAd('rewarded')).resolves.toBe('finished');
    expect(f.last.opts!.type).toBe('reward');
    f.setMode('dismiss');
    await expect(p.requestAd('rewarded')).resolves.toBe('error');
    f.setMode('noad');
    await expect(p.requestAd('rewarded')).resolves.toBe('error');
    expect(p.muted).toBe(false);
  });

  it('every request settles exactly once: .catch(), a throw, not started in 8 s, AD_MAX; late callbacks change nothing', async () => {
    const f = fakeY8();
    f.load();
    const p = new Y8Platform();
    await p.init();
    f.setMode('reject');
    await expect(p.requestAd('midgame')).resolves.toBe('error');
    f.setMode('throw');
    await expect(p.requestAd('midgame')).resolves.toBe('error');

    f.setMode('silent');
    let res: string | null = null;
    void p.requestAd('rewarded').then((r) => (res = r));
    await vi.advanceTimersByTimeAsync(AD_START_TIMEOUT);
    expect(res).toBe('timeout');
    const o = f.last.opts!;
    o.adViewed?.();
    o.adBreakDone?.();
    expect(res).toBe('timeout');

    res = null;
    void p.requestAd('midgame').then((r) => (res = r));
    f.last.opts!.beforeAd!();
    expect(p.muted).toBe(true);
    await vi.advanceTimersByTimeAsync(AD_MAX);
    expect(res).toBe('error');
    expect(p.muted).toBe(false);
    f.last.opts!.adBreakDone?.();
    expect(res).toBe('error');
  });

  it('pauses + mutes while hidden or blurred, resumes on return', async () => {
    const f = fakeY8();
    f.load();
    const p = new Y8Platform();
    await p.init();
    const pause = vi.fn();
    p.onPause = pause;
    f.doc.hidden = true;
    f.doc.dispatchEvent(new Event('visibilitychange'));
    expect(p.muted).toBe(true);
    f.win.dispatchEvent(new Event('blur'));
    f.doc.hidden = false;
    f.doc.dispatchEvent(new Event('visibilitychange'));
    expect(p.muted).toBe(true); // still blurred
    f.win.dispatchEvent(new Event('focus'));
    expect(p.muted).toBe(false);
    f.win.dispatchEvent(new Event('blur'));
    expect(p.muted).toBe(true);
    f.doc.dispatchEvent(new Event('pointerdown'));
    expect(p.muted).toBe(false);
    expect(pause.mock.calls).toEqual([[true], [false], [true], [false]]);
  });
});
