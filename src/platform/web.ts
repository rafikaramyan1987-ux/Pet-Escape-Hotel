/** GitHub Pages / self-hosted build: no portal SDK and no ads at all (rewarded-ad buttons are hidden). */
import { BasePlatform } from './base';
import type { AdHandle, AdType } from './types';

export class WebPlatform extends BasePlatform {
  readonly name = 'web';
  override readonly adsEnabled = false;
  get available(): boolean {
    return false;
  }
  protected show(_type: AdType, h: AdHandle): void {
    h.failed();
  }
}
