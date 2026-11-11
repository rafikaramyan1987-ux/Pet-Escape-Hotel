import type { Game } from '../puzzle/game';
import type { PetKind } from '../art/pets';
import { getLang, LANGS, type Lang, langName, setLang, t } from '../game/i18n';
import { BOOSTER_PRICE, type Booster, DAILY_REWARDS, claimDaily, dailyStatus } from '../game/save';
import { allPets, KINDS } from '../game/collection';
import { itemName, SHOP, type Slot } from '../game/shop';
import { ICON } from './icons';
import { renderPetPortraits } from './portraits';
import { type Mechanic, tierOf } from '../puzzle/mechanics';
import type { LoseReason } from '../puzzle/model';
import type { Rect } from '../puzzle/view';
import { drawBomb, hiddenTexture, iceTexture, lockTexture } from '../puzzle/look';
import { TryOn } from './tryon';

const HAND = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M26 6c3 0 5 2 5 5v18l3-1c3-1 5 0 6 2l2-1c3-1 5 0 6 2 3-1 6 1 6 4v12c0 9-7 15-15 15h-4c-6 0-10-3-13-8l-9-14c-2-3 1-6 4-5l4 3V11c0-3 2-5 5-5z" fill="#fff4dc" stroke="#3b2346" stroke-width="4" stroke-linejoin="round"/></svg>`;

const BOOSTERS: { id: Booster; icon: string; label: 'boosterSlot' | 'boosterUndo' | 'boosterHammer' }[] = [
  { id: 'undo', icon: ICON.undo, label: 'boosterUndo' },
  { id: 'slot', icon: ICON.slot, label: 'boosterSlot' },
  { id: 'hammer', icon: ICON.hammer, label: 'boosterHammer' },
];

type Panel = 'pets' | 'shop' | 'daily' | 'settings';

/** The tutorial tip fades out after this many seconds of play (or the first valid tap, or a tap on it). */
export const TIP_SECONDS = 5;

/** DOM layer: top bar, booster bar, tutorial hand, hints, tap ripples, results and the menu panels. */
export class Hud {
  private hand: HTMLElement | null = null;
  private handTarget = -1;
  private handT = 0;
  private toastEl: HTMLElement;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private noAdUntil: Partial<Record<Booster, number>> = {};
  private tryon: TryOn | null = null;
  /** the tutorial tip of levels 1-4: seconds shown */
  private tipT = 0;
  /** the HUD insets last given to the view (see insetsFrame) */
  private insetsKey = '';
  private insetsView: unknown = null;

  constructor(private g: Game, private root: HTMLElement) {
    this.toastEl = document.getElementById('toast') ?? document.createElement('div');
  }

  private coins(): string {
    return `<div class="card pill coins" data-coins>${ICON.coin}<b data-testid="coins">${this.g.save.coins}</b></div>`;
  }

  level(n: number, tutorial: boolean): void {
    const daily = dailyStatus(this.g.save, new Date()).available;
    const tier = tierOf(n);
    this.root.innerHTML = `
      <div class="hud">
        <div class="top">
          <div class="top-left">
            <button class="round" data-act="menu" aria-label="${t('menu')}" data-testid="menu">${ICON.menu}${daily ? '<i class="dot"></i>' : ''}</button>
            <div class="card pill levelpill"><b data-testid="level">${t('level', { n })}</b>${tier === 'hard' || tier === 'veryhard' ? `<span class="tierbadge ${tier}" data-testid="tier">${t(tier === 'hard' ? 'hardLevel' : 'veryHardLevel')}</span>` : ''}</div>
          </div>
          <div class="top-right">${this.coins()}<button class="round" data-act="sound" aria-label="${t('sound')}" data-testid="sound">${this.g.save.settings.sound ? ICON.paw : ICON.pause}</button></div>
        </div>
        <div class="card pill movespill" data-testid="moves" aria-label="${t('moves')}"><span>${t('moves')}</span><b data-moves>0</b><small>/ ${this.g.minMoves}</small></div>
        ${n <= 4 ? `<div class="tutorial-text card pill${n <= 2 ? ' low' : ''}" data-testid="tip" role="status">${t(`tip${n}` as 'tip1')}</div>` : ''}
        <button class="round hintbtn" data-act="hint" aria-label="${t('hint')}" data-testid="hint" hidden>${ICON.bulb}</button>
        <div class="boosters" data-boosters ${n <= 2 ? 'hidden' : ''}>
          ${BOOSTERS.map((b) => `<button class="booster" data-booster="${b.id}" data-testid="booster-${b.id}" aria-label="${t(b.label)}">${b.icon}<span class="lbl">${t(b.label)}</span><span class="cost"></span></button>`).join('')}
        </div>
      </div>`;
    this.on('[data-act=sound]', () => {
      const s = this.g.save.settings;
      s.sound = !s.sound;
      this.g.audio.setSound(s.sound);
      this.g.persist();
      this.root.querySelector('[data-act=sound]')!.innerHTML = s.sound ? ICON.paw : ICON.pause;
    });
    this.on('[data-act=menu]', () => this.menu('pets'));
    this.on('[data-act=hint]', () => {
      this.g.audio.play('click');
      this.g.showHint();
    });
    for (const b of BOOSTERS) this.on(`[data-booster=${b.id}]`, () => void this.g.useBooster(b.id));
    // the tip: tap it to dismiss it (it only ever sits in its own strip, never over the board)
    this.tipT = 0;
    this.insetsKey = '';
    this.on('[data-testid=tip]', () => this.hideTip());
    this.hand = null;
    if (tutorial) {
      this.hand = document.createElement('div');
      this.hand.className = 'hand';
      this.hand.innerHTML = HAND;
      this.root.appendChild(this.hand);
      this.handTarget = -1;
    }
    this.boosters();
  }

  private on(sel: string, fn: () => void, scope: ParentNode = this.root): void {
    scope.querySelectorAll<HTMLElement>(sel).forEach((el) =>
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      }),
    );
  }

  /** Refresh the booster bar: stock count, coin price, or the "free with an ad" badge. */
  boosters(): void {
    const g = this.g;
    const now = performance.now();
    for (const b of BOOSTERS) {
      const el = this.root.querySelector<HTMLButtonElement>(`[data-booster=${b.id}]`);
      if (!el) continue;
      const stock = g.save.boosters[b.id];
      const cost = el.querySelector('.cost')!;
      if (stock > 0) cost.innerHTML = `<b>${stock}</b>`;
      else if (g.save.coins >= BOOSTER_PRICE[b.id]) cost.innerHTML = `${ICON.coin}<b>${BOOSTER_PRICE[b.id]}</b>`;
      else if (g.platform.adsEnabled) cost.innerHTML = `${ICON.ad}`;
      // no ads in this build: the price stays, greyed out
      else cost.innerHTML = `${ICON.coin}<b>${BOOSTER_PRICE[b.id]}</b>`;
      el.classList.toggle('poor', stock <= 0 && g.save.coins < BOOSTER_PRICE[b.id] && !g.platform.adsEnabled);
      el.classList.toggle('active', b.id === 'hammer' && g.hammerMode);
      el.disabled = (this.noAdUntil[b.id] ?? 0) > now;
      el.classList.toggle('off', !g.canUse(b.id) && !(b.id === 'hammer' && g.hammerMode));
    }
    const label = this.root.querySelector('[data-testid=coins]');
    if (label && !this.flying.length) label.textContent = String(g.save.coins);
  }

  /** A rewarded ad could not be shown: say so, and keep that button disabled for a moment. */
  noAd(b: Booster | 'continue'): void {
    this.toast(t('noAd'), 2.5);
    if (b === 'continue') {
      const el = this.root.querySelector<HTMLButtonElement>('[data-act=adcontinue]');
      if (el) {
        el.disabled = true;
        setTimeout(() => (el.disabled = false), 2500);
      }
      return;
    }
    this.noAdUntil[b] = performance.now() + 2500;
    this.boosters();
    setTimeout(() => this.boosters(), 2550);
  }

  ripple(x: number, y: number, ok: boolean): void {
    const m = document.createElement('div');
    m.className = `tap ${ok ? 'ok' : 'no'}`;
    m.style.left = `${x}px`;
    m.style.top = `${y}px`;
    document.getElementById('app')!.appendChild(m);
    setTimeout(() => m.remove(), 500);
  }

  /** The tutorial tip fades out (first valid tap, 5 s, or tapped); its strip stays reserved so the board doesn't jump. */
  hideTip(): void {
    this.root.querySelector('[data-testid=tip]')?.classList.add('gone');
  }

  /**
   * The tip timer, and the insets the board is framed in (every level, measured from the DOM so they follow the screen
   * size, wrapping and the language): the tip's strip at the bottom, and the top-bar controls, the moves pill and the
   * tier badge at the top. Re-applied only when they change (or undo / continue built a new view).
   */
  private insetsFrame(dt: number): void {
    const tip = this.root.querySelector<HTMLElement>('[data-testid=tip]');
    // 5 s of play: not while a menu or the mechanic tip has paused the level
    if (tip && !tip.classList.contains('gone') && this.g.mode === 'play' && !this.g.paused) {
      this.tipT += dt;
      if (this.tipT >= TIP_SECONDS) this.hideTip();
    }
    // only in play: a relayout must never cut into the rescue camera glide
    if (this.g.mode !== 'play') return;
    const c = this.g.canvas.getBoundingClientRect();
    if (!c.height) return;
    const u = Math.min(c.width / 440, c.height / 780);
    // the tip's strip stays reserved after it faded, so the board doesn't jump
    const bottom = tip ? Math.max(0, c.bottom - tip.getBoundingClientRect().top + u * 12) : 0;
    const hud: Rect[] = [];
    for (const el of this.root.querySelectorAll<HTMLElement>('.hud .top button, .hud .top .card, .hud .movespill, .hud .tierbadge')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) hud.push({ kind: el.dataset.testid ?? el.className, x0: r.left - c.left, y0: r.top - c.top, x1: r.right - c.left, y1: r.bottom - c.top });
    }
    const key = `${Math.round(c.width)}x${Math.round(c.height)}|${Math.round(bottom)}|${hud.map((r) => [r.x0, r.y0, r.x1, r.y1].map((v) => Math.round(v / 4)).join(',')).join(';')}`;
    if (key === this.insetsKey && this.insetsView === this.g.view) return;
    this.insetsKey = key;
    this.insetsView = this.g.view;
    this.g.view.setInsets(hud, bottom, c.width, c.height);
  }

  frame(dt: number): void {
    this.animateCoins(dt);
    this.insetsFrame(dt);
    const g = this.g;
    const hb = this.root.querySelector<HTMLElement>('[data-act=hint]');
    if (hb) hb.hidden = !g.hintAvailable;
    // the hand: the whole first level, the first two taps of the second, and on a hint
    // the tutorial hand: level 1 only
    const tut = this.hand && g.mode === 'play' && g.def.tutorial === true && g.hintTarget < 0;
    if (this.hand && !tut && g.hintTarget < 0) this.hand.style.display = 'none';
    if (!tut && g.hintTarget >= 0 && g.mode === 'play') {
      if (!this.hand) {
        this.hand = document.createElement('div');
        this.hand.className = 'hand';
        this.hand.innerHTML = HAND;
        this.root.appendChild(this.hand);
      }
      this.handTarget = g.hintTarget;
    } else if (!tut) {
      if (this.hand) this.hand.style.display = 'none';
      return;
    } else if (this.handTarget < 0 || g.puzzle.removed[this.handTarget]) this.handTarget = g.hintScrew();
    if (this.handTarget < 0 || !this.hand) return;
    this.handT += dt;
    const r = g.canvas.getBoundingClientRect();
    const sc = g.view.screenOf(this.handTarget, r.width, r.height);
    const press = Math.max(0, Math.sin(this.handT * 4)) * 10;
    this.hand.style.display = 'block';
    this.hand.style.left = `${sc.x + r.left - 12}px`;
    this.hand.style.top = `${sc.y + r.top - 2 + press}px`;
  }

  private overlay(html: string, cls = ''): HTMLElement {
    this.closeOverlay();
    const d = document.createElement('div');
    d.className = `overlay ${cls}`;
    d.innerHTML = html;
    this.root.appendChild(d);
    return d;
  }

  private closeOverlay(): void {
    this.root.querySelector('.overlay')?.remove();
    this.tryon?.dispose();
    this.tryon = null;
  }

  /** Big result card, then the coins fly into the counter and it counts up. */
  won(pet: string, coins: number, stars: number, before: number, extra: string[] = []): void {
    this.toast('');
    this.overlay(`<div class="card dialog won result" data-testid="result">
      <div class="ribbon">${t('rescuedTitle')}</div>
      <p class="sub">${t('rescued', { pet })}</p>
      <div class="bigstars">${[0, 1, 2].map((k) => `<i class="star ${k < stars ? 'on' : ''}" style="--d:${0.2 + k * 0.18}s">${ICON.star}</i>`).join('')}</div>
      <div class="gain" data-gain>${ICON.coin}<b>${t('coins', { n: coins })}</b></div>
      ${extra.map((x) => `<p class="newtag">${x}</p>`).join('')}
      <button class="big primary" data-act="next" data-testid="next">${ICON.play}<span>${t('next')}</span></button>
    </div>`, 'gold soft');
    this.on('[data-act=next]', () => {
      this.g.audio.play('click');
      this.g.next();
    });
    const from = this.root.querySelector<HTMLElement>('[data-gain] svg')!.getBoundingClientRect();
    const counter = this.root.querySelector<HTMLElement>('[data-coins]');
    const label = this.root.querySelector<HTMLElement>('[data-testid=coins]');
    if (!counter || !label) return;
    label.textContent = String(before);
    const to = counter.getBoundingClientRect();
    const n = Math.min(10, Math.max(4, Math.round(coins / 5)));
    const app = document.getElementById('app')!;
    const fx = from.left + from.width / 2;
    const fy = from.top + from.height / 2;
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'flycoin';
      el.innerHTML = ICON.coin;
      el.style.left = `${fx}px`;
      el.style.top = `${fy}px`;
      el.style.opacity = '0';
      app.appendChild(el);
      this.flying.push({
        el, t: -(0.6 + i * 0.08), dx: to.left + 18 - fx, dy: to.top + to.height / 2 - fy,
        land: () => {
          this.g.audio.play('land');
          label.textContent = String(before + Math.round((coins * (i + 1)) / n));
          counter.classList.remove('bump');
          void counter.offsetWidth;
          counter.classList.add('bump');
        },
      });
    }
  }

  /** Coins flying into the counter, driven by the game clock (so recordings capture them). */
  private flying: { el: HTMLElement; t: number; dx: number; dy: number; land: () => void }[] = [];
  private animateCoins(dt: number): void {
    for (const c of this.flying.slice()) {
      c.t += dt;
      if (c.t < 0) continue;
      const k = Math.min(1, c.t / 0.6);
      const e = k * k * (3 - 2 * k);
      const lift = Math.sin(k * Math.PI) * -60;
      c.el.style.opacity = '1';
      c.el.style.transform = `translate(${c.dx * e}px, ${c.dy * e + lift}px) scale(${1.1 - 0.4 * k})`;
      if (k >= 1) {
        c.el.remove();
        c.land();
        this.flying.splice(this.flying.indexOf(c), 1);
      }
    }
  }

  /** Fail card: Retry (instant), +1 slot or undo the last 3 taps (one continue per level). */
  lost(reason: LoseReason): void {
    const g = this.g;
    const title = reason === 'bomb' ? t('boomTitle') : reason === 'stuck' ? t('stuckTitle') : t('trayFull');
    const text = reason === 'bomb' ? t('boomText') : reason === 'stuck' ? t('stuckText') : t('failText');
    const more = g.canContinue();
    this.overlay(`<div class="card dialog caught" data-testid="lost">
      <h2 data-testid="lost-title">${title}</h2><p>${text}</p>
      ${more ? `<button class="big" data-act="adcontinue" data-testid="continue">${ICON.ad}<span>${t('adContinue')}</span></button>` : ''}
      <button class="big primary" data-act="retry" data-testid="retry">${ICON.restart}<span>${t('retry')}</span></button>
    </div>`, 'red');
    this.on('[data-act=retry]', () => g.retry());
    this.on('[data-act=adcontinue]', () => void g.continueWithAd());
  }

  /** Moves counter (stars depend on it). */
  moves(): void {
    const el = this.root.querySelector('[data-moves]');
    if (el) el.textContent = String(this.g.moves);
    this.root.querySelector('[data-testid=moves]')?.classList.toggle('over', this.g.moves > this.g.minMoves);
  }

  /** One-screen tip for a new mechanic (on its first level). */
  mechanicTip(m: Mechanic): void {
    const g = this.g;
    g.setPaused(true);
    const img = (c: HTMLCanvasElement | { toDataURL(): string }) => `<img class="mtip-img" alt="" src="${c.toDataURL()}"/>`;
    const bomb = document.createElement('canvas');
    bomb.width = bomb.height = 128;
    drawBomb(bomb, 9, false);
    const icon: Record<Mechanic, string> = {
      ice: img(iceTexture().image as HTMLCanvasElement),
      hidden: img(hiddenTexture().image as HTMLCanvasElement),
      chain: `<svg class="mtip-img" viewBox="0 0 64 64"><g fill="none" stroke="#9aa0ae" stroke-width="7"><rect x="4" y="22" width="22" height="20" rx="10"/><rect x="21" y="22" width="22" height="20" rx="10" stroke="#c9ced8"/><rect x="38" y="22" width="22" height="20" rx="10"/></g></svg>`,
      lock: img(lockTexture(0, 'lock').image as HTMLCanvasElement),
      bomb: img(bomb),
      sticky: `<svg class="mtip-img" viewBox="0 0 64 64"><rect x="4" y="18" width="56" height="20" rx="6" fill="#ffb627" stroke="#3b2346" stroke-width="4"/><path d="M14 38v10a4 4 0 0 0 8 0V38M40 38v6a4 4 0 0 0 8 0v-6" fill="#ffa20f" stroke="#3b2346" stroke-width="3"/></svg>`,
    };
    const key = ({ ice: 'Ice', hidden: 'Hidden', chain: 'Chain', lock: 'Lock', bomb: 'Bomb', sticky: 'Sticky' } as const)[m];
    const d = this.overlay(`<div class="card dialog mtip" data-testid="mechanic-tip">
      <div class="ribbon small">${t('newMechanic')}</div>
      ${icon[m]}
      <h2>${t(`m${key}Title` as 'mIceTitle')}</h2>
      <p>${t(`m${key}Text` as 'mIceText')}</p>
      <button class="big primary" data-act="gotit" data-testid="gotit">${ICON.play}<span>${t('gotIt')}</span></button>
    </div>`, 'menu');
    this.on('[data-act=gotit]', () => {
      this.closeOverlay();
      g.setPaused(false);
    }, d);
  }

  /** Title screen (GameDistribution / GamePix builds): the logo and Play. The first Play click may show a pre-roll. */
  title(onPlay: () => Promise<void> | void): void {
    const layered = (cls: string, text: string) => `<span class="${cls}"><span class="sh">${text}</span><span class="ol">${text}</span><span class="fg">${text}</span></span>`;
    this.root.innerHTML = `<div class="title" data-testid="title">
      <div class="logo">${layered('l1', 'SCREW &amp;')}${layered('l2', 'RESCUE')}</div>
      <p class="tagline">${t('tagline')}</p>
      <button class="big primary" data-act="play" data-testid="play">${ICON.play}<span>${t('play')}</span></button>
      <p class="controls">${t('controls')}</p>
    </div>`;
    const btn = this.root.querySelector<HTMLButtonElement>('[data-act=play]')!;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      btn.disabled = true;
      this.g.audio.play('click');
      void Promise.resolve(onPlay());
    });
  }

  moreSoon(): void {
    this.overlay(`<div class="card dialog"><h2>${t('moreSoon')}</h2>
      <button class="big primary" data-act="again">${ICON.restart}<span>${t('level', { n: 1 })}</span></button></div>`);
    this.on('[data-act=again]', () => this.g.start(0));
  }

  /** Short message; `secs` 0 keeps it until replaced, '' hides it. */
  toast(msg: string, secs = 2): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = null;
    this.toastEl.textContent = msg;
    this.toastEl.classList.toggle('show', !!msg);
    if (msg && secs > 0) this.toastTimer = setTimeout(() => this.toast(''), secs * 1000);
  }

  // ─── menu: pets, shop, daily gift, settings ─────────────────────────────
  menu(panel: Panel): void {
    const g = this.g;
    g.setPaused(true);
    g.audio.play('click');
    const tabs: { id: Panel; icon: string; label: string }[] = [
      { id: 'pets', icon: ICON.paw, label: t('collection') },
      { id: 'shop', icon: ICON.bag, label: t('shop') },
      { id: 'daily', icon: ICON.gift, label: t('daily') },
      { id: 'settings', icon: ICON.gear, label: t('settings') },
    ];
    const d = this.overlay(`<div class="card panel menupanel" data-testid="menu-panel">
      <div class="tabs">${tabs.map((x) => `<button class="tab ${x.id === panel ? 'on' : ''}" data-tab="${x.id}" data-testid="tab-${x.id}" aria-label="${x.label}">${x.icon}</button>`).join('')}</div>
      <div class="panelbody" data-body></div>
      <button class="big primary" data-act="resume" data-testid="resume">${ICON.play}<span>${t('resume')}</span></button>
    </div>`, 'menu');
    for (const x of tabs) this.on(`[data-tab=${x.id}]`, () => this.menu(x.id), d);
    this.on('[data-act=resume]', () => {
      this.closeOverlay();
      g.setPaused(false);
      this.level(g.def.id, g.def.tutorial === true && g.tapsDone < 2);
    }, d);
    const body = d.querySelector<HTMLElement>('[data-body]')!;
    if (panel === 'pets') this.petsPanel(body);
    else if (panel === 'shop') this.shopPanel(body, g.def.pet, 'hat');
    else if (panel === 'daily') this.dailyPanel(body);
    else this.settingsPanel(body);
  }

  private petsPanel(body: HTMLElement): void {
    const pets = allPets();
    const owned = new Set(this.g.save.pets);
    const imgs = renderPetPortraits(pets);
    body.innerHTML = `<h2>${ICON.paw}${t('collectionTitle')}</h2>
      <p class="sub">${t('petsCount', { n: pets.filter((p) => owned.has(`${p.kind}:${p.v}`)).length, m: pets.length })}</p>
      <div class="petgrid">${pets.map((p, i) => {
        const has = owned.has(`${p.kind}:${p.v}`);
        return `<div class="petcell ${p.kind} ${has ? 'has' : 'locked'}" title="${has ? p.name : t('locked')}"><img alt="" src="${imgs[i]}"/><span>${has ? (p.v === 0 ? t(p.kind) : p.name) : '?'}</span></div>`;
      }).join('')}</div>`;
  }

  private shopPanel(body: HTMLElement, kind: PetKind, slot: Slot): void {
    const s = this.g.save;
    const look = s.looks[kind];
    const items = SHOP.filter((i) => i.slot === slot);
    body.innerHTML = `<h2>${ICON.bag}${t('shop')}</h2>
      <div class="tabs">${KINDS.map((k) => `<button class="tab ${k === kind ? 'on' : ''}" data-kind="${k}">${t(k)}</button>`).join('')}</div>
      <div class="shop"><canvas class="tryon"></canvas></div>
      <div class="tabs"><button class="tab ${slot === 'hat' ? 'on' : ''}" data-slot="hat">${t('hats')}</button><button class="tab ${slot === 'collar' ? 'on' : ''}" data-slot="collar">${t('collars')}</button></div>
      <div class="items">${items.map((i) => {
        const has = s.owned.includes(i.id);
        const worn = look[slot] === i.id;
        const sw = i.color !== undefined ? `style="background:#${i.color.toString(16).padStart(6, '0')}"` : '';
        return `<button class="item ${worn ? 'sel' : ''}" data-item="${i.id}" data-testid="item-${i.id}"><i class="swatch" ${sw}></i><span class="nm">${itemName(i.id)}</span><span class="price">${worn ? `<em>${t('equipped')}</em>` : has ? t('equip') : `${ICON.coin}${i.price}`}</span></button>`;
      }).join('')}</div>`;
    const canvas = body.querySelector<HTMLCanvasElement>('canvas.tryon')!;
    this.tryon?.dispose();
    this.tryon = new TryOn(canvas);
    this.tryon.show(kind, look);
    body.querySelectorAll<HTMLElement>('[data-kind]').forEach((el) => el.addEventListener('click', () => this.shopPanel(body, el.dataset.kind as PetKind, slot)));
    body.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) => el.addEventListener('click', () => this.shopPanel(body, kind, el.dataset.slot as Slot)));
    body.querySelectorAll<HTMLElement>('[data-item]').forEach((el) =>
      el.addEventListener('click', () => {
        const it = SHOP.find((x) => x.id === el.dataset.item)!;
        if (!s.owned.includes(it.id)) {
          if (s.coins < it.price) {
            this.toast(t('notEnough'), 1.6);
            return;
          }
          s.coins -= it.price;
          s.owned.push(it.id);
          this.g.audio.play('coin');
        }
        look[slot] = it.id;
        this.g.persist();
        this.shopPanel(body, kind, slot);
        this.boosters();
      }),
    );
  }

  private dailyPanel(body: HTMLElement): void {
    const s = this.g.save;
    const st = dailyStatus(s, new Date());
    const day = st.available ? st.day : ((s.daily.streak - 1) % 7) + 1;
    body.innerHTML = `<h2>${ICON.gift}${t('daily')}</h2><p class="small">${t('dailyText')}</p>
      <div class="days">${DAILY_REWARDS.map((a, i) => `<div class="day ${i + 1 < day || (!st.available && i + 1 === day) ? 'got' : ''} ${st.available && i + 1 === day ? 'today' : ''}"><span>${t('dayN', { n: i + 1 })}</span>${ICON.coin}<b>${a}</b></div>`).join('')}</div>
      ${st.available ? `<button class="big primary" data-act="claim" data-testid="claim">${ICON.gift}<span>${t('claim')}</span></button>` : `<p class="sub">${t('claimed')}</p>`}`;
    this.on('[data-act=claim]', () => {
      claimDaily(s, new Date());
      this.g.persist();
      this.g.audio.play('coin');
      this.boosters();
      this.dailyPanel(body);
      this.root.querySelector('[data-act=menu] .dot')?.remove();
    }, body);
  }

  private settingsPanel(body: HTMLElement): void {
    const s = this.g.save.settings;
    const row = (key: 'sound' | 'music' | 'vibration') => `<div class="setrow"><span>${t(key)}</span><button class="toggle ${s[key] ? 'on' : ''}" data-set="${key}" data-testid="set-${key}">${s[key] ? t('on') : t('off')}</button></div>`;
    body.innerHTML = `<h2>${ICON.gear}${t('settings')}</h2>${row('sound')}${row('music')}${row('vibration')}
      <div class="setrow langrow"><span>${t('language')}</span></div>
      <div class="langs" data-testid="langs">${LANGS.map((l) => `<button class="toggle ${getLang() === l ? 'on' : ''}" data-lang="${l}" data-testid="lang-${l}" lang="${l}">${langName(l)}</button>`).join('')}</div>
      <p class="small">${t('controls')}</p>`;
    body.querySelectorAll<HTMLElement>('[data-set]').forEach((el) =>
      el.addEventListener('click', () => {
        const k = el.dataset.set as 'sound' | 'music' | 'vibration';
        s[k] = !s[k];
        if (k === 'sound') this.g.audio.setSound(s.sound);
        if (k === 'music') this.g.audio.setMusic(s.music);
        this.g.persist();
        this.settingsPanel(body);
      }),
    );
    body.querySelectorAll<HTMLElement>('[data-lang]').forEach((el) =>
      el.addEventListener('click', () => {
        const l = el.dataset.lang as Lang;
        s.lang = l;
        setLang(l);
        this.g.persist();
        this.menu('settings');
      }),
    );
  }
}
