/**
 * The portal platform of this build, chosen at build time (`VITE_PLATFORM` / `--mode`, see vite.config.ts):
 * web (GitHub Pages, no SDK), crazygames, gd (GameDistribution), gamepix, playgama (Playgama Bridge), gamemonetize or y8. `__PLATFORM__` is a literal, so the
 * bundler drops the other portals' code: a build only contains its own SDK.
 */
import { CrazyGamesPlatform } from './crazygames';
import { GameMonetizePlatform } from './gamemonetize';
import { GamePixPlatform } from './gamepix';
import { GDPlatform } from './gd';
import { PlaygamaPlatform } from './playgama';
import type { Platform } from './types';
import { WebPlatform } from './web';
import { Y8Platform } from './y8';

export type { AdResult, AdSlot, AdType, Platform, PlatformName } from './types';
export { AD_START_TIMEOUT, MIDGAME_GAP, NO_AD_MS } from './types';

export function createPlatform(): Platform {
  if (__PLATFORM__ === 'crazygames') return new CrazyGamesPlatform();
  if (__PLATFORM__ === 'gd') return new GDPlatform();
  if (__PLATFORM__ === 'gamepix') return new GamePixPlatform();
  if (__PLATFORM__ === 'playgama') return new PlaygamaPlatform();
  if (__PLATFORM__ === 'gamemonetize') return new GameMonetizePlatform();
  if (__PLATFORM__ === 'y8') return new Y8Platform();
  return new WebPlatform();
}
