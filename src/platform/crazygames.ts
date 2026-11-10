/**
 * CrazyGames SDK v3. The script tag is in index.html of the CrazyGames build (vite.config.ts); every call is
 * optional (an ad blocker can remove it). `SDK.init()` first (bounded), then loading events, gameplay events
 * around real play only, happytime on a rescue, the portal mute setting, Data Module saves (localStorage
 * fallback) and the user's locale. Ads go through BasePlatform's settle-once wrapper.
 */
import { BasePlatform } from './base';
import { type AdHandle, type AdType, type Clock, realClock } from './types';

interface AdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (e?: unknown) => void;
}

export interface CrazySdk {
  init?: () => Promise<void>;
  environment?: string;
  ad?: { requestAd: (type: AdType, cb: AdCallbacks) => void };
  game?: {
    gameplayStart?: () => void;
    gameplayStop?: () => void;
    loadingStart?: () => void;
    loadingStop?: () => void;
    happytime?: () => void;
    settings?: { muteAudio?: boolean };
    addSettingsChangeListener?: (l: (s: { muteAudio?: boolean }) => void) => void;
  };
  data?: {
    getItem: (k: string) => string | null;
    setItem: (k: string, v: string) => void;
    removeItem?: (k: string) => void;
  };
  user?: { systemInfo?: { locale?: string; countryCode?: string } };
}

export class CrazyGamesPlatform extends BasePlatform {
  readonly name = 'crazygames';
  private sdk: CrazySdk | null;

  constructor(sdk: CrazySdk | null = detectSdk(), clock: Clock = realClock) {
    super(clock, 4);
    this.sdk = sdk;
  }

  get available(): boolean {
    return !!this.sdk?.ad;
  }

  /** await SDK.init() (bounded, so a blocked SDK never blocks the game). */
  override async init(timeoutMs = 8000): Promise<void> {
    if (!this.sdk?.init) return;
    let timer: unknown;
    try {
      await Promise.race([
        this.sdk.init(),
        new Promise<void>((_, rej) => {
          timer = this.clock.setTimeout(() => rej(new Error('sdk init timeout')), timeoutMs);
        }),
      ]);
    } catch {
      this.sdk = null;
      return;
    } finally {
      this.clock.clearTimeout(timer);
    }
    try {
      this.setSilence('setting', !!this.sdk.game?.settings?.muteAudio);
      this.sdk.game?.addSettingsChangeListener?.((s) => this.setSilence('setting', !!s.muteAudio));
    } catch {
      /* optional */
    }
  }

  override locale(): string | null {
    try {
      return this.sdk?.user?.systemInfo?.locale ?? null;
    } catch {
      return null;
    }
  }

  override loadingStart(): void {
    this.call(() => this.sdk?.game?.loadingStart?.());
  }
  override loadingStop(): void {
    this.call(() => this.sdk?.game?.loadingStop?.());
  }
  protected override sdkGameplay(on: boolean): void {
    if (on) this.sdk?.game?.gameplayStart?.();
    else this.sdk?.game?.gameplayStop?.();
  }
  override happytime(): void {
    this.call(() => this.sdk?.game?.happytime?.());
  }

  protected show(type: AdType, h: AdHandle): void {
    this.sdk!.ad!.requestAd(type, { adStarted: h.started, adFinished: h.finished, adError: h.failed });
  }

  // ─── Data Module (falls back to localStorage) ───
  override getItem(k: string): string | null {
    try {
      if (this.sdk?.data) return this.sdk.data.getItem(k);
    } catch {
      /* fall through */
    }
    return super.getItem(k);
  }

  override setItem(k: string, v: string): void {
    try {
      if (this.sdk?.data) {
        this.sdk.data.setItem(k, v);
        return;
      }
    } catch {
      /* fall through */
    }
    super.setItem(k, v);
  }
}

export function detectSdk(): CrazySdk | null {
  const w = globalThis as unknown as { CrazyGames?: { SDK?: CrazySdk } };
  return w.CrazyGames?.SDK ?? null;
}
