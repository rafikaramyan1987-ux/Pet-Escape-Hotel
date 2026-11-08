import { ICON } from './icons';
import type { PetKind } from '../art/pets';

/** In-game HUD mock-up (art direction): room title + stars, bones, stealth meter, pet switcher, ability button. */
export interface HudState {
  room: string;
  roomNo: number;
  stars: number;
  bones: [number, number];
  active: PetKind;
  stealth: number; // 0..1, how close the porter is to noticing
}

const PETS: { kind: PetKind; name: string; ability: string; icon: string; key: string }[] = [
  { kind: 'dog', name: 'Biscuit', ability: 'Dig', icon: ICON.dig, key: '1' },
  { kind: 'cat', name: 'Miso', ability: 'Jump', icon: ICON.jump, key: '2' },
  { kind: 'hamster', name: 'Peanut', ability: 'Squeeze', icon: ICON.pipe, key: '3' },
];

export function renderHud(root: HTMLElement, s: HudState, portraits: Record<PetKind, string>): void {
  const active = PETS.find((p) => p.kind === s.active)!;
  const stars = [0, 1, 2].map((i) => `<i class="star ${i < s.stars ? 'on' : ''}">${ICON.star}</i>`).join('');
  const pets = PETS.map((p) => `
    <button class="pet ${p.kind} ${p.kind === s.active ? 'active' : ''}" data-testid="pet-${p.kind}" aria-label="${p.name}">
      <span class="ring"><img src="${portraits[p.kind]}" alt="" /></span>
      <span class="badge">${p.icon}</span>
      <span class="hotkey">${p.key}</span>
      ${p.kind === s.active ? `<span class="name">${p.name}</span>` : ''}
    </button>`).join('');
  root.innerHTML = `
    <div class="hud">
      <div class="top">
        <div class="card room">
          <span class="room-no">${ICON.moon} Room ${s.roomNo}</span>
          <span class="room-title">${s.room}</span>
          <span class="stars">${stars}</span>
        </div>
        <div class="top-right">
          <div class="card pill bones">${ICON.bone}<b>${s.bones[0]}</b><span>/ ${s.bones[1]}</span></div>
          <button class="round pause" aria-label="Pause">${ICON.pause}</button>
        </div>
      </div>
      <div class="stealth card pill" aria-label="Stealth">
        <span class="eye">${ICON.eye}</span>
        <span class="meter"><span style="width:${Math.round(s.stealth * 100)}%"></span></span>
        <span class="zz">Zzz…</span>
      </div>
      <div class="bottom">
        <div class="switcher card">${pets}</div>
        <button class="ability ${active.kind}" data-testid="ability">
          <span class="ab-icon">${active.icon}</span>
          <span class="ab-label">${active.ability}</span>
        </button>
      </div>
    </div>`;
}
