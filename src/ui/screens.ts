import type { PetKind } from '../core/level';
import { FLOOR_NAMES, ROOMS } from '../core/rooms';
import type { Game } from '../game/game';
import { type Key, name, t } from '../game/i18n';
import { claimDaily, dailyStatus, DAILY_REWARDS } from '../game/save';
import { SHOP, type ShopItem, type Slot } from '../game/shop';
import { ICON } from './icons';
import { TryOn } from './tryon';

const PET_ICON: Record<PetKind, string> = { dog: ICON.dig, cat: ICON.jump, hamster: ICON.pipe };
const PET_ABILITY: Record<PetKind, Key> = { dog: 'dig', cat: 'jump', hamster: 'squeeze' };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** DOM screens on top of the 3D view. */
export class UI {
  private tryon: TryOn | null = null;
  private hudEls: {
    bones?: HTMLElement; meter?: HTMLElement; ability?: HTMLButtonElement; run?: HTMLButtonElement; map?: HTMLButtonElement;
    stars?: HTMLElement; pets?: Map<PetKind, HTMLElement>; objective?: HTMLElement;
  } = {};
  private toastEl: HTMLElement;

  constructor(private g: Game, private root: HTMLElement) {
    this.toastEl = document.getElementById('toast') ?? document.createElement('div');
  }

  private set(html: string): void {
    this.closeTryOn();
    this.root.innerHTML = html;
    this.hudEls = {};
  }

  private on(sel: string, fn: (el: HTMLElement) => void): void {
    this.root.querySelectorAll<HTMLElement>(sel).forEach((el) =>
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.g.audio.unlock();
        this.g.audio.play('click');
        fn(el);
      }),
    );
  }

  /** Rewarded-ad button: on failure say so for 2.5 s, then re-enable. */
  private rewardButton(sel: string, action: () => Promise<boolean | 'unavailable'>): void {
    const btn = this.root.querySelector<HTMLButtonElement>(sel);
    if (!btn) return;
    const label = btn.innerHTML;
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      btn.disabled = true;
      const r = await action();
      if (r === 'unavailable') {
        btn.innerHTML = `<span class="noad">${t('noAd')}</span>`;
        setTimeout(() => {
          btn.innerHTML = label;
          btn.disabled = false;
        }, 2500);
      } else if (btn.isConnected) btn.disabled = false;
    });
  }

  toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.toggle('show', !!msg);
  }

  tapMarker(nx: number, ny: number, ok: boolean): void {
    const m = document.createElement('div');
    m.className = `tap ${ok ? 'ok' : 'no'}`;
    m.style.left = `${((nx + 1) / 2) * 100}%`;
    m.style.top = `${((1 - ny) / 2) * 100}%`;
    document.getElementById('app')!.appendChild(m);
    setTimeout(() => m.remove(), 500);
  }

  private coinsPill(): string {
    return `<div class="card pill coins">${ICON.coin}<b data-coins>${this.g.save.coins}</b></div>`;
  }

  // ─── home ────────────────────────────────────────────────────────────────
  home(): void {
    const g = this.g;
    const cur = g.currentRoom();
    const started = Object.keys(g.save.rooms).length > 0;
    const daily = dailyStatus(g.save, new Date());
    this.set(`
      <div class="screen home">
        <div class="topbar">${this.coinsPill()}<button class="round" data-act="settings" aria-label="${t('settings')}">${ICON.gear}</button></div>
        <div class="logo small"><span class="l1"><span class="sh">PET ESCAPE</span><span class="ol">PET ESCAPE</span><span class="fg">PET ESCAPE</span></span><span class="l2"><span class="sh">HOTEL</span><span class="ol">HOTEL</span><span class="fg">HOTEL</span></span></div>
        <div class="menu">
          <button class="big primary" data-act="play" data-testid="play">${ICON.play}<span>${started ? t('continue') : t('play')}</span><small>${t('floor', { n: ROOMS[cur].floor })} · ${t('room', { n: ROOMS[cur].room })}</small></button>
          <div class="row">
            <button class="big" data-act="floors" data-testid="floors">${ICON.map}<span>${t('floors')}</span></button>
            <button class="big" data-act="shop" data-testid="shop">${ICON.bag}<span>${t('shop')}</span></button>
          </div>
          <button class="big daily ${daily.available ? 'ready' : ''}" data-act="daily" data-testid="daily">${ICON.gift}<span>${t('daily')}</span>${daily.available ? '<i class="dot"></i>' : ''}</button>
        </div>
        <p class="controls">${t('controls')}</p>
      </div>`);
    this.on('[data-act=play]', () => g.startRoom(g.currentRoom()));
    this.on('[data-act=floors]', () => this.floors(ROOMS[cur].floor));
    this.on('[data-act=shop]', () => this.shop('dog', 'hat'));
    this.on('[data-act=daily]', () => this.daily());
    this.on('[data-act=settings]', () => this.settings(() => this.home()));
  }

  floors(floor: number): void {
    const g = this.g;
    const tabs = FLOOR_NAMES.map((_f, i) => {
      const n = i + 1;
      const open = g.isUnlocked(g.roomIndex(`${n}-1`));
      return `<button class="tab ${n === floor ? 'on' : ''} ${open ? '' : 'locked'}" data-floor="${n}">${open ? n : ICON.lock}</button>`;
    }).join('');
    const rooms = ROOMS.filter((r) => r.floor === floor).map((r) => {
      const i = g.roomIndex(r.id);
      const open = g.isUnlocked(i);
      const rec = g.save.rooms[r.id];
      const skipped = g.save.skipped.includes(r.id);
      const stars = [0, 1, 2].map((k) => `<i class="star ${rec && k < rec.stars ? 'on' : ''}">${ICON.star}</i>`).join('');
      return `<button class="roomcard ${open ? '' : 'locked'} ${r.room === 8 ? 'finale' : ''}" data-room="${i}" ${open ? '' : 'disabled'} data-testid="room-${r.id}">
        <span class="no">${open ? r.room : ICON.lock}</span><span class="nm">${esc(name(r.name))}</span>
        <span class="stars">${skipped && !rec ? `<em>${ICON.skip}</em>` : stars}</span>${r.room === 8 ? `<span class="fin">${t('finale')}</span>` : ''}</button>`;
    }).join('');
    const total = ROOMS.filter((r) => r.floor === floor).reduce((s, r) => s + (g.save.rooms[r.id]?.stars ?? 0), 0);
    this.set(`
      <div class="screen floors">
        <div class="topbar"><button class="round" data-act="back" aria-label="${t('back')}">${ICON.home}</button>${this.coinsPill()}</div>
        <div class="card panel">
          <h2>${t('floor', { n: floor })} · ${esc(g.floorName(floor))}</h2>
          <div class="tabs">${tabs}</div>
          <div class="sub">${ICON.star} ${total} / 24</div>
          <div class="rooms">${rooms}</div>
        </div>
      </div>`);
    this.on('[data-act=back]', () => this.home());
    this.on('.tab:not(.locked)', (el) => this.floors(Number(el.dataset.floor)));
    this.on('.roomcard:not(.locked)', (el) => g.startRoom(Number(el.dataset.room)));
  }

  // ─── HUD ─────────────────────────────────────────────────────────────────
  hud(): void {
    const g = this.g;
    const L = g.level!;
    const sim = g.sim!;
    if (!g.portraits) g.refreshPortraits();
    const pets = L.pets.map((k, i) => `
      <button class="pet ${k}" data-pet="${k}" data-testid="pet-${k}" aria-label="${t(k)}">
        <span class="ring"><img src="${g.portraits![k]}" alt="" /></span>
        <span class="badge">${PET_ICON[k]}</span>
        <span class="hotkey">${i + 1}</span>
        <span class="name">${t(k)}</span>
        <span class="done">${ICON.paw}</span>
      </button>`).join('');
    const req = L.required.length === L.pets.length ? t('everyone') : t('only', { pets: L.required.map((k) => t(k)).join(' + ') });
    this.set(`
      <div class="hud">
        <div class="top">
          <div class="card room">
            <span class="room-no">${ICON.moon} ${t('floor', { n: L.def.floor })} · ${t('room', { n: L.def.room })}</span>
            <span class="room-title">${esc(name(L.def.name))}</span>
            <span class="stars" data-stars></span>
          </div>
          <div class="top-right">
            <div class="card pill bones">${ICON.bone}<b data-bones>0</b><span>/ ${L.bones.length}</span></div>
            <button class="round pause" data-act="pause" aria-label="${t('pause')}" data-testid="pause">${ICON.pause}</button>
          </div>
        </div>
        <div class="stealth card pill" aria-label="Stealth">
          <span class="eye">${ICON.eye}</span>
          <span class="meter"><span data-meter></span></span>
        </div>
        <div class="objective" data-objective>${esc(req)}${L.key ? ` · ${ICON.key}` : ''}</div>
        <div class="side">
          <button class="round small" data-act="map" aria-label="${t('map')}" data-testid="map">${ICON.map}</button>
          <button class="round small run" data-act="run" aria-label="${t('run')}" data-testid="run">${ICON.sneak}</button>
        </div>
        <div class="bottom">
          <div class="switcher card">${pets}</div>
          <button class="ability" data-act="ability" data-testid="ability"><span class="ab-icon"></span><span class="ab-label"></span></button>
        </div>
      </div>`);
    this.hudEls = {
      bones: this.root.querySelector<HTMLElement>('[data-bones]')!,
      meter: this.root.querySelector<HTMLElement>('[data-meter]')!,
      ability: this.root.querySelector<HTMLButtonElement>('[data-act=ability]')!,
      run: this.root.querySelector<HTMLButtonElement>('[data-act=run]')!,
      map: this.root.querySelector<HTMLButtonElement>('[data-act=map]')!,
      stars: this.root.querySelector<HTMLElement>('[data-stars]')!,
      objective: this.root.querySelector<HTMLElement>('[data-objective]')!,
      pets: new Map(L.pets.map((k) => [k, this.root.querySelector<HTMLElement>(`[data-pet=${k}]`)!])),
    };
    this.on('[data-act=pause]', () => g.pause());
    this.on('[data-act=map]', () => g.toggleMap());
    this.on('[data-act=run]', () => g.setRun(!sim.run));
    this.on('[data-act=ability]', () => g.useAbility());
    this.root.querySelectorAll<HTMLElement>('[data-pet]').forEach((el) =>
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        g.setActive(el.dataset.pet as PetKind);
      }),
    );
    this.updateHud();
  }

  updateHud(): void {
    const g = this.g;
    const sim = g.sim;
    const e = this.hudEls;
    if (!sim || !e.bones) return;
    e.bones.textContent = String(sim.bones.filter(Boolean).length);
    for (const [k, el] of e.pets!) {
      const p = sim.pet(k)!;
      el.classList.toggle('active', sim.active === k);
      el.classList.toggle('escaped', p.escaped);
    }
    e.run!.classList.toggle('on', sim.run);
    e.run!.innerHTML = sim.run ? ICON.run : ICON.sneak;
    e.map!.classList.toggle('on', g.camMode === 'map');
    const bones = sim.bones.filter(Boolean).length;
    const preview = 1 + (bones === sim.bones.length ? 1 : 0) + (sim.spotted ? 0 : 1);
    e.stars!.innerHTML = [0, 1, 2].map((k) => `<i class="star ${k < preview ? 'on' : ''}">${ICON.star}</i>`).join('');
    const a = sim.active;
    e.ability!.className = `ability ${a}`;
    e.ability!.querySelector('.ab-icon')!.innerHTML = PET_ICON[a];
    e.ability!.querySelector('.ab-label')!.textContent = t(PET_ABILITY[a]);
  }

  /** Per-frame HUD bits (cheap). */
  frame(): void {
    const g = this.g;
    const sim = g.sim;
    const e = this.hudEls;
    if (!sim || !e.meter) return;
    const lvl = sim.alertLevel();
    e.meter.style.width = `${Math.round(lvl * 100)}%`;
    e.meter.classList.toggle('hot', lvl > 0.6);
    const can = !!g.abilityMove();
    e.ability!.classList.toggle('ready', can);
    if (sim.spotted && e.stars && !e.stars.dataset.spotted) {
      e.stars.dataset.spotted = '1';
      this.updateHud();
    }
  }

  // ─── overlays ────────────────────────────────────────────────────────────
  private overlay(html: string, cls = ''): void {
    this.closeTryOn();
    const prev = this.root.querySelector('.overlay');
    prev?.remove();
    const d = document.createElement('div');
    d.className = `overlay ${cls}`;
    d.innerHTML = html;
    this.root.appendChild(d);
  }

  tip(floor: number, done: () => void): void {
    this.overlay(`<div class="card dialog tip"><h2>${t('floor', { n: floor })} · ${esc(this.g.floorName(floor))}</h2><p>${t(`tip${floor}` as Key)}</p>${floor === 1 ? `<p class="small">${t('tipMove')}<br/>${t('pressSwitch')}</p>` : ''}<button class="big primary" data-act="ok" data-testid="tip-ok">${t('got')}</button></div>`);
    this.on('[data-act=ok]', () => done());
  }

  pause(): void {
    const g = this.g;
    const fails = g.level ? g.save.fails[g.level.id] ?? 0 : 0;
    this.overlay(`<div class="card dialog">
      <h2>${t('pause')}</h2>
      <button class="big primary" data-act="resume" data-testid="resume">${ICON.play}<span>${t('resume')}</span></button>
      <button class="big" data-act="restart">${ICON.restart}<span>${t('restart')}</span></button>
      ${fails >= 3 ? `<button class="big" data-act="hint">${ICON.bulb}<span>${t('hint')}</span></button>` : ''}
      ${fails >= 5 ? `<button class="big" data-act="skip">${ICON.skip}<span>${t('skipAd')}</span></button>` : ''}
      <div class="row"><button class="big" data-act="settings">${ICON.gear}<span>${t('settings')}</span></button><button class="big" data-act="home">${ICON.home}<span>${t('home')}</span></button></div>
    </div>`);
    this.on('[data-act=resume]', () => g.resume());
    this.on('[data-act=restart]', () => g.restart());
    this.on('[data-act=hint]', () => {
      g.resume();
      g.showHint();
    });
    this.rewardButton('[data-act=skip]', () => g.skipRoom());
    this.on('[data-act=settings]', () => this.settings(() => this.pause()));
    this.on('[data-act=home]', () => g.goHome());
  }

  caught(who: string | null, pet: string, fails: number): void {
    const g = this.g;
    const msg = who ? t('caughtBy', { who, pet }) : t('caughtCam', { pet });
    this.overlay(`<div class="card dialog caught">
      <div class="burst">${ICON.eye}</div>
      <h2>${t('caughtTitle')}</h2><p>${esc(msg)}</p>
      <button class="big primary" data-act="retry" data-testid="retry">${ICON.restart}<span>${t('retry')}</span></button>
      ${fails >= 3 ? `<button class="big" data-act="hint" data-testid="hint">${ICON.bulb}<span>${t('hint')}</span></button>` : ''}
      ${fails >= 5 ? `<button class="big" data-act="skip" data-testid="skip">${ICON.skip}<span>${t('skipAd')}</span></button>` : ''}
      <button class="link" data-act="home">${t('home')}</button>
    </div>`, 'red');
    this.on('[data-act=retry]', () => g.restart());
    this.on('[data-act=hint]', () => {
      g.restart();
      g.showHint();
    });
    this.rewardButton('[data-act=skip]', () => g.skipRoom());
    this.on('[data-act=home]', () => g.goHome());
  }

  won(stars: number, bones: number, clean: boolean, coins: number, floorDone: number): void {
    const g = this.g;
    const last = g.level && g.roomIndex(g.level.id) === ROOMS.length - 1;
    const row = (ok: boolean, label: string) => `<li class="${ok ? 'ok' : ''}">${ok ? ICON.star : ICON.lock}<span>${label}</span></li>`;
    this.overlay(`<div class="card dialog won">
      <h2>${floorDone ? (last ? t('allDone') : t('floorDone', { n: floorDone })) : t('wonTitle')}</h2>
      <div class="bigstars">${[0, 1, 2].map((k) => `<i class="star ${k < stars ? 'on' : ''}" style="--d:${k * 0.18}s">${ICON.star}</i>`).join('')}</div>
      <ul class="checks">${row(true, t('escaped'))}${row(bones === 3, `${t('allBones')} (${bones}/3)`)}${row(clean, t('spotted'))}</ul>
      <div class="gain">${ICON.coin}<b>${t('coins', { n: coins })}</b></div>
      <button class="big primary" data-act="next" data-testid="next">${ICON.play}<span>${last ? t('home') : t('next')}</span></button>
      <div class="row"><button class="big" data-act="replay">${ICON.restart}<span>${t('replay')}</span></button><button class="big" data-act="home">${ICON.home}<span>${t('home')}</span></button></div>
    </div>`, 'gold');
    this.g.audio.play('coin');
    this.on('[data-act=next]', () => void g.nextRoom());
    this.on('[data-act=replay]', () => g.restart());
    this.on('[data-act=home]', () => g.goHome());
  }

  settings(back: () => void): void {
    const g = this.g;
    const s = g.save.settings;
    const tog = (k: 'sound' | 'music') => `<button class="toggle ${s[k] ? 'on' : ''}" data-tog="${k}">${s[k] ? t('on') : t('off')}</button>`;
    this.overlay(`<div class="card dialog">
      <h2>${t('settings')}</h2>
      <div class="setrow"><span>${t('sound')}</span>${tog('sound')}</div>
      <div class="setrow"><span>${t('music')}</span>${tog('music')}</div>
      <div class="setrow"><span>${t('language')}</span><span><button class="toggle ${g.lang === 'en' ? 'on' : ''}" data-lang="en">EN</button><button class="toggle ${g.lang === 'fr' ? 'on' : ''}" data-lang="fr" data-testid="lang-fr">FR</button></span></div>
      <p class="small">${t('controls')}</p>
      <button class="big primary" data-act="close" data-testid="close">${t('close')}</button>
    </div>`);
    this.on('[data-tog]', (el) => {
      const k = el.dataset.tog as 'sound' | 'music';
      s[k] = !s[k];
      g.audio.setSound(s.sound);
      g.audio.setMusic(s.music);
      g.persist();
      this.settings(back);
    });
    this.on('[data-lang]', (el) => {
      g.setLang(el.dataset.lang as 'en' | 'fr');
      this.settings(back);
    });
    this.on('[data-act=close]', () => (g.sim && g.mode === 'paused' ? this.pause() : back()));
  }

  daily(): void {
    const g = this.g;
    const st = dailyStatus(g.save, new Date());
    const day = st.available ? st.day : ((g.save.daily.streak - 1) % 7) + 1;
    const days = DAILY_REWARDS.map((c, i) => `<div class="day ${i + 1 < day || (!st.available && i + 1 === day) ? 'got' : ''} ${st.available && i + 1 === day ? 'today' : ''}"><small>${t('day', { n: i + 1 })}</small>${ICON.coin}<b>${c}</b></div>`).join('');
    this.overlay(`<div class="card dialog daily">
      <h2>${ICON.gift} ${t('daily')}</h2>
      <div class="days">${days}</div>
      <p>${st.available ? t('dailyText') : t('dailyClaimed')}</p>
      ${st.available ? `<button class="big primary" data-act="claim" data-testid="claim">${ICON.coin}<span>${t('claim')} ${st.amount}</span></button><button class="big" data-act="double">${ICON.coin}<span>${t('claimDouble')}</span></button>` : ''}
      <button class="link" data-act="close">${t('close')}</button>
    </div>`);
    const done = (n: number) => {
      g.audio.play('coin');
      g.persist();
      g.toast(t('coins', { n }));
      this.home();
    };
    this.on('[data-act=claim]', () => done(claimDaily(g.save, new Date())));
    this.rewardButton('[data-act=double]', async () => {
      const ok = await g.platform.rewarded();
      if (ok !== true) return ok;
      done(claimDaily(g.save, new Date(), 2));
      return true;
    });
    this.on('[data-act=close]', () => this.home());
  }

  // ─── shop ────────────────────────────────────────────────────────────────
  private closeTryOn(): void {
    this.tryon?.dispose();
    this.tryon = null;
  }

  shop(pet: PetKind, slot: Slot, preview?: string): void {
    const g = this.g;
    const look = { ...g.save.looks[pet] };
    if (preview) look[slot] = preview;
    const items = SHOP.filter((i) => i.slot === slot && (slot !== 'skin' || !i.pet || i.pet === pet));
    if (slot === 'skin') items.unshift({ id: 'default', slot: 'skin', price: 0, name: { en: 'Natural', fr: 'Naturel' } } as ShopItem);
    const owned = (id: string) => id === 'default' || id === 'none' || g.save.owned.includes(`${slot}:${id}`) || g.save.owned.includes(id) && slot !== 'skin';
    const cards = items.map((it) => {
      const wearing = g.save.looks[pet][slot] === it.id;
      const sel = (preview ?? g.save.looks[pet][slot]) === it.id;
      const has = owned(it.id);
      const sw = it.fur ? `background:linear-gradient(135deg,#${it.fur[0].toString(16).padStart(6, '0')} 50%,#${it.fur[1].toString(16).padStart(6, '0')} 50%)` : it.color ? `background:#${it.color.toString(16).padStart(6, '0')}` : '';
      return `<button class="item ${sel ? 'sel' : ''}" data-item="${it.id}"><span class="swatch" style="${sw}"></span><span class="nm">${esc(name(it.name))}</span>
        <span class="price">${wearing ? `<em>${t('equipped')}</em>` : has ? t('equip') : `${ICON.coin}${it.price}`}</span></button>`;
    }).join('');
    const selItem = items.find((i) => i.id === (preview ?? g.save.looks[pet][slot]))!;
    const selOwned = owned(selItem.id);
    const action = g.save.looks[pet][slot] === selItem.id ? '' : selOwned
      ? `<button class="big primary" data-act="wear" data-testid="wear">${t('equip')}</button>`
      : `<button class="big primary ${g.save.coins < selItem.price ? 'poor' : ''}" data-act="buy" data-testid="buy">${ICON.coin}<span>${t('buy')} ${selItem.price}</span></button>`;
    this.set(`
      <div class="screen shop">
        <div class="topbar"><button class="round" data-act="back" aria-label="${t('back')}">${ICON.home}</button>${this.coinsPill()}</div>
        <div class="card panel">
          <h2>${ICON.bag} ${t('shop')}</h2>
          <div class="tabs pets">${(['dog', 'cat', 'hamster'] as const).map((k) => `<button class="tab ${k === pet ? 'on' : ''}" data-pet="${k}">${t(k)}</button>`).join('')}</div>
          <canvas class="tryon" data-testid="tryon"></canvas>
          <div class="tabs slots">${(['hat', 'collar', 'skin'] as const).map((s) => `<button class="tab ${s === slot ? 'on' : ''}" data-slot="${s}">${t(s === 'hat' ? 'hats' : s === 'collar' ? 'collars' : 'skins')}</button>`).join('')}</div>
          <div class="items">${cards}</div>
          <div class="shopact">${action}</div>
        </div>
      </div>`);
    const canvas = this.root.querySelector<HTMLCanvasElement>('canvas.tryon')!;
    this.tryon = new TryOn(canvas);
    this.tryon.show(pet, look);
    this.on('[data-act=back]', () => this.home());
    this.on('[data-pet]', (el) => this.shop(el.dataset.pet as PetKind, slot));
    this.on('[data-slot]', (el) => this.shop(pet, el.dataset.slot as Slot));
    this.on('[data-item]', (el) => this.shop(pet, slot, el.dataset.item));
    this.on('[data-act=wear]', () => {
      g.save.looks[pet][slot] = selItem.id;
      g.persist();
      g.portraits = null;
      this.shop(pet, slot);
    });
    this.on('[data-act=buy]', () => {
      if (g.save.coins < selItem.price) {
        g.toast(t('notEnough'));
        return;
      }
      g.save.coins -= selItem.price;
      g.save.owned.push(`${slot}:${selItem.id}`);
      g.save.looks[pet][slot] = selItem.id;
      g.audio.play('coin');
      g.persist();
      g.portraits = null;
      this.shop(pet, slot);
    });
  }
}
