/** Inline SVG icons in the game's chunky style (fill = currentColor, dark outline). */
const wrap = (body: string, vb = '0 0 64 64') => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;
const ink = '#3b2346';

export const ICON = {
  bone: wrap(`<g stroke="${ink}" stroke-width="5" stroke-linejoin="round" fill="#fff3da"><path d="M17 22a8 8 0 1 1 9-9l15 15a8 8 0 1 1 9 9 8 8 0 1 1-9 9L26 31a8 8 0 1 1-9-9z" transform="rotate(0 32 32)"/></g><path d="M20 17l6 5" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>`),
  star: wrap(`<path d="M32 5l8.2 16.6 18.3 2.7-13.3 12.9 3.2 18.2L32 46.8 15.6 55.4l3.2-18.2L5.5 24.3l18.3-2.7z" stroke="${ink}" stroke-width="5" stroke-linejoin="round" fill="currentColor"/><path d="M24 24l4-1" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>`),
  pause: wrap(`<rect x="18" y="15" width="10" height="34" rx="4" fill="currentColor"/><rect x="36" y="15" width="10" height="34" rx="4" fill="currentColor"/>`),
  eye: wrap(`<path d="M4 32c8-12 17-18 28-18s20 6 28 18c-8 12-17 18-28 18S12 44 4 32z" fill="#fff3da" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/><circle cx="32" cy="32" r="10" fill="${ink}"/><circle cx="35" cy="28" r="3.5" fill="#fff"/><path d="M8 20 4 14M20 13l-2-7M44 13l2-7M56 20l4-6" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`),
  dig: wrap(`<path d="M44 6l14 14-6 6-4-4-14 14 3 3-12 12c-4 4-11 4-15 0s-4-11 0-15l12-12 3 3 14-14-4-4z" fill="currentColor" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/><path d="M14 44l6 6" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>`),
  jump: wrap(`<path d="M32 6l20 22H40v14H24V28H12z" fill="currentColor" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/><rect x="10" y="50" width="44" height="8" rx="4" fill="currentColor" stroke="${ink}" stroke-width="4"/>`),
  pipe: wrap(`<path d="M8 22h30a14 14 0 0 1 14 14v20H36V38H8z" fill="currentColor" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/><rect x="4" y="18" width="8" height="24" rx="3" fill="currentColor" stroke="${ink}" stroke-width="4"/><rect x="32" y="50" width="24" height="8" rx="3" fill="currentColor" stroke="${ink}" stroke-width="4"/>`),
  moon: wrap(`<path d="M40 6a26 26 0 1 0 18 40A22 22 0 0 1 40 6z" fill="currentColor"/>`),
  key: wrap(`<circle cx="18" cy="32" r="11" fill="none" stroke="currentColor" stroke-width="7"/><path d="M29 32h29M48 32v10M56 32v8" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>`),
  paw: wrap(`<ellipse cx="32" cy="42" rx="14" ry="12" fill="currentColor"/><ellipse cx="14" cy="28" rx="6" ry="8" fill="currentColor"/><ellipse cx="25" cy="17" rx="6" ry="8" fill="currentColor"/><ellipse cx="39" cy="17" rx="6" ry="8" fill="currentColor"/><ellipse cx="50" cy="28" rx="6" ry="8" fill="currentColor"/>`),
};
