import type { Game } from '../puzzle/game';
import { t } from '../game/i18n';
import { ICON } from './icons';

const HAND = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M26 6c3 0 5 2 5 5v18l3-1c3-1 5 0 6 2l2-1c3-1 5 0 6 2 3-1 6 1 6 4v12c0 9-7 15-15 15h-4c-6 0-10-3-13-8l-9-14c-2-3 1-6 4-5l4 3V11c0-3 2-5 5-5z" fill="#fff4dc" stroke="#3b2346" stroke-width="4" stroke-linejoin="round"/></svg>`;

/** DOM layer: top bar, tutorial hand, tap ripples, results. */
export class Hud {
  private hand: HTMLElement | null = null;
  private tutorial = false;
  private handTarget = -1;
  private handT = 0;
  private toastEl: HTMLElement;

  constructor(private g: Game, private root: HTMLElement) {
    this.toastEl = document.getElementById('toast') ?? document.createElement('div');
  }

  private coins(): string {
    return `<div class="card pill coins">${ICON.coin}<b>${this.g.save.coins}</b></div>`;
  }

  level(n: number, tutorial: boolean): void {
    this.tutorial = tutorial;
    this.root.innerHTML = `
      <div class="hud">
        <div class="top">
          <div class="card pill levelpill"><b data-testid="level">${t('level', { n })}</b></div>
          <div class="top-right">${this.coins()}<button class="round" data-act="sound" aria-label="${t('sound')}" data-testid="sound">${this.g.save.settings.sound ? ICON.paw : ICON.pause}</button></div>
        </div>
        ${tutorial ? `<div class="tutorial-text card pill" data-testid="tutorial">${n === 1 ? t('tapHint') : t('tapHint2')}</div>` : ''}
      </div>`;
    this.root.querySelector<HTMLElement>('[data-act=sound]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      const s = this.g.save.settings;
      s.sound = !s.sound;
      this.g.audio.setSound(s.sound);
      this.g.persist();
      this.level(n, this.tutorial && this.g.tapsDone < 2);
    });
    this.hand = null;
    if (tutorial) {
      this.hand = document.createElement('div');
      this.hand.className = 'hand';
      this.hand.innerHTML = HAND;
      this.root.appendChild(this.hand);
      this.handTarget = -1;
    }
  }

  ripple(x: number, y: number, ok: boolean): void {
    const m = document.createElement('div');
    m.className = `tap ${ok ? 'ok' : 'no'}`;
    m.style.left = `${x}px`;
    m.style.top = `${y}px`;
    document.getElementById('app')!.appendChild(m);
    setTimeout(() => m.remove(), 500);
  }

  frame(dt: number): void {
    if (!this.hand) return;
    const g = this.g;
    // the hand stays for the whole first level, and for the first two taps of the second
    const show = g.mode === 'play' && (g.index === 0 || g.tapsDone < 2);
    if (!show) {
      this.hand.style.display = 'none';
      this.root.querySelector('.tutorial-text')?.remove();
      return;
    }
    if (this.handTarget < 0 || g.puzzle.removed[this.handTarget]) this.handTarget = g.hintScrew();
    if (this.handTarget < 0) return;
    this.handT += dt;
    const r = g.canvas.getBoundingClientRect();
    const sc = g.view.screenOf(this.handTarget, r.width, r.height);
    const press = Math.max(0, Math.sin(this.handT * 4)) * 10;
    this.hand.style.display = 'block';
    this.hand.style.left = `${sc.x + r.left - 12}px`;
    this.hand.style.top = `${sc.y + r.top - 2 + press}px`;
  }

  private overlay(html: string, cls = ''): void {
    this.root.querySelector('.overlay')?.remove();
    const d = document.createElement('div');
    d.className = `overlay ${cls}`;
    d.innerHTML = html;
    this.root.appendChild(d);
  }

  won(pet: string, coins: number): void {
    this.overlay(`<div class="card dialog won">
      <h2>${t('rescued', { pet })}</h2>
      <div class="bigstars">${[0, 1, 2].map((k) => `<i class="star on" style="--d:${k * 0.15}s">${ICON.star}</i>`).join('')}</div>
      <div class="gain">${ICON.coin}<b>${t('coins', { n: coins })}</b></div>
      <button class="big primary" data-act="next" data-testid="next">${ICON.play}<span>${t('next')}</span></button>
    </div>`, 'gold soft');
    this.root.querySelector<HTMLElement>('[data-act=next]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.g.audio.play('click');
      this.g.next();
    });
  }

  lost(): void {
    this.overlay(`<div class="card dialog caught">
      <h2>${t('failTitle')}</h2><p>${t('failText')}</p>
      <button class="big primary" data-act="retry" data-testid="retry">${ICON.restart}<span>${t('retry')}</span></button>
    </div>`, 'red');
    this.root.querySelector<HTMLElement>('[data-act=retry]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.g.retry();
    });
  }

  moreSoon(): void {
    this.overlay(`<div class="card dialog"><h2>${t('moreSoon')}</h2>
      <button class="big primary" data-act="again">${ICON.restart}<span>${t('level', { n: 1 })}</span></button></div>`);
    this.root.querySelector<HTMLElement>('[data-act=again]')!.addEventListener('click', () => this.g.start(0));
  }

  toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.toggle('show', !!msg);
  }
}
