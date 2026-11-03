/* Shadow Fiend Arena: item and shop data. Original names and icons (hand-written SVG), inspired by the
   DotA 1 classics noted in `classic`. Numbers are tuned for a short raze duel: 1 world unit = 100 DotA range,
   heroes have 700 HP, a raze deals 170 + 9 per soul, passive income is 2 gold per second.
   Rules live in game.js (search "items"). */
(() => {
'use strict';
// icon frame: dark bevelled square; each glyph draws on top in a 64x64 box
const frame = (id, c1, c2, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><radialGradient id="bg${id}" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>
<linearGradient id="metal${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f1ea"/><stop offset=".45" stop-color="#9aa0a8"/><stop offset="1" stop-color="#3d4148"/></linearGradient>
<linearGradient id="gold${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a0"/><stop offset=".5" stop-color="#d9a52c"/><stop offset="1" stop-color="#7a4d0c"/></linearGradient>
<filter id="glow${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<rect width="64" height="64" fill="url(#bg${id})"/>${body}
<rect x="1" y="1" width="62" height="62" fill="none" stroke="#000" stroke-opacity=".7" stroke-width="2"/>
<rect x="3" y="3" width="58" height="58" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="1"/></svg>`;

const ICONS = {
  boots: frame('b', '#5a4630', '#1c140c', `
    <path d="M22 12h14v24c0 3 2 5 6 6l9 3c3 1 4 3 4 6v3H14l2-10z" fill="#7a5532" stroke="#2a1a0c" stroke-width="2"/>
    <path d="M22 12h14v6H22z" fill="#a8763f"/><path d="M14 54h41v-3H15z" fill="#2c1c0e"/>
    <path d="M8 30h10M6 36h11M9 42h8" stroke="#ffe9b0" stroke-width="2.5" stroke-linecap="round" opacity=".8"/>
    <circle cx="44" cy="44" r="2" fill="url(#goldb)"/>`),
  treads: frame('t', '#6a2a10', '#160604', `
    <path d="M22 10h14v24c0 3 2 5 6 6l9 3c3 1 4 3 4 6v5H14l2-12z" fill="#3a2a22" stroke="#140a06" stroke-width="2"/>
    <path d="M17 44l38 0" stroke="#ff7a2a" stroke-width="3" filter="url(#glowt)"/>
    <path d="M22 10h14v7H22z" fill="url(#goldt)"/>
    <path d="M24 24l5-6 5 6-5 5z" fill="#ffb24a" filter="url(#glowt)"/>
    <path d="M8 28h9M6 34h10M9 40h7" stroke="#ff9a4a" stroke-width="2.5" stroke-linecap="round" filter="url(#glowt)"/>`),
  salve: frame('s', '#1f5a2a', '#07160a', `
    <path d="M26 10h12v6l-2 2v4c8 2 13 9 13 17 0 10-8 17-17 17s-17-7-17-17c0-8 5-15 13-17v-4l-2-2z" fill="#cfe8d0" fill-opacity=".25" stroke="#d8f0d8" stroke-width="2"/>
    <path d="M17 38c0 9 7 15 15 15s15-6 15-15c-6 3-24 3-30 0z" fill="#3fd06a" filter="url(#glows)"/>
    <rect x="25" y="7" width="14" height="5" rx="1" fill="#8a5a2a"/>
    <path d="M32 26c-3 4-6 6-6 9a6 6 0 0 0 12 0c0-3-3-5-6-9z" fill="#b8ffc8" opacity=".85"/>`),
  wand: frame('w', '#3a2a5a', '#0c0818', `
    <path d="M14 52L44 18" stroke="#6a3a1a" stroke-width="6" stroke-linecap="round"/>
    <path d="M14 52L44 18" stroke="#a8693a" stroke-width="2" stroke-linecap="round"/>
    <circle cx="47" cy="15" r="7" fill="#b07aff" filter="url(#gloww)"/><circle cx="47" cy="15" r="3.5" fill="#fff"/>
    <path d="M47 4v5M47 21v5M36 15h5M53 15h5" stroke="#d8b8ff" stroke-width="2" stroke-linecap="round"/>
    <path d="M22 44l4 4M27 38l4 4" stroke="url(#goldw)" stroke-width="3"/>`),
  ward: frame('o', '#4a4a20', '#121206', `
    <path d="M32 30v28" stroke="#6a4a22" stroke-width="5" stroke-linecap="round"/>
    <path d="M26 54h12" stroke="#3a2a12" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="32" cy="22" rx="16" ry="11" fill="#f6e6a0" stroke="#3a2a0a" stroke-width="2"/>
    <circle cx="32" cy="22" r="7" fill="#ffcc22" filter="url(#glowo)"/><ellipse cx="32" cy="22" rx="2" ry="6" fill="#140c00"/>
    <path d="M16 22c4-9 28-9 32 0" fill="none" stroke="#7a5a1a" stroke-width="3"/>`),
  dagger: frame('d', '#2a3a5a', '#080c18', `
    <path d="M44 8L50 14 26 40 22 36z" fill="url(#metald)" stroke="#20242a" stroke-width="1.5"/>
    <path d="M44 8L50 14 34 30z" fill="#fff" opacity=".35"/>
    <path d="M17 33l14 14" stroke="url(#goldd)" stroke-width="5" stroke-linecap="round"/>
    <path d="M22 42l-8 8" stroke="#3a2412" stroke-width="5" stroke-linecap="round"/>
    <circle cx="12" cy="52" r="3.5" fill="#5ab4ff" filter="url(#glowd)"/>
    <path d="M40 46c5 0 9-3 10-8M46 52c6-1 10-5 11-11" stroke="#7ac8ff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/>`),
  cyclone: frame('c', '#1e5a5a', '#041212', `
    <path d="M47 44L56 58" stroke="#c8b890" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="46" cy="42" r="4" fill="#7affe0" filter="url(#glowc)"/>
    <g fill="none" stroke-linecap="round">
      <path d="M9 13c8 6 38 6 46 0" stroke="#e8fffb" stroke-width="3.5"/>
      <path d="M13 22c7 5 31 5 38 0" stroke="#c8fbf3" stroke-width="3.2"/>
      <path d="M18 31c6 4 22 4 28 0" stroke="#a8f2e8" stroke-width="3"/>
      <path d="M23 39c5 3 13 3 17 0" stroke="#8ae8da" stroke-width="2.8"/>
      <path d="M27 46c3 2 8 2 10 0" stroke="#6adccc" stroke-width="2.5"/>
      <path d="M31 52c1 2 3 3 3 6" stroke="#5ad0c0" stroke-width="2.4"/>
      <path d="M12 16c10 2 30 4 40-2M16 26c8 1 24 2 32-3" stroke="#ffffff" stroke-width="1" opacity=".6"/></g>
    <circle cx="16" cy="40" r="1.6" fill="#bff"/><circle cx="50" cy="28" r="1.3" fill="#bff"/>`),
  blade: frame('v', '#4a2266', '#0c0414', `
    <ellipse cx="34" cy="30" rx="20" ry="24" fill="#a070ff" opacity=".18" filter="url(#glowv)"/>
    <path d="M18 48L47 9l5 4-27 40z" fill="#3a2a52" stroke="#d8c0ff" stroke-width="1.6"/>
    <path d="M47 9l5 4-20 28z" fill="#efe2ff" opacity=".75"/>
    <path d="M13 43l14 11" stroke="#7a4aa8" stroke-width="5" stroke-linecap="round"/>
    <path d="M11 57l6-6" stroke="#24142e" stroke-width="5" stroke-linecap="round"/>
    <circle cx="20" cy="49" r="2.4" fill="#d8b0ff" filter="url(#glowv)"/>
    <g fill="none" stroke="#cfb0ff" stroke-width="2" stroke-linecap="round" opacity=".7"><path d="M27 12c-7 4-9 11-7 17"/><path d="M55 33c-2 7-9 11-16 11"/><path d="M9 26c1-6 5-10 10-12"/></g>`),
  avatar: frame('a', '#5a4a10', '#140e02', `
    <rect x="22" y="12" width="20" height="40" rx="3" fill="#20180a" stroke="url(#golda)" stroke-width="3"/>
    <path d="M32 16l7 9-7 9-7-9z" fill="url(#golda)" filter="url(#glowa)"/>
    <path d="M26 40h12M26 45h12" stroke="url(#golda)" stroke-width="2.5"/>
    <path d="M18 12l4 4M46 12l-4 4M18 52l4-4M46 52l-4-4" stroke="#ffd860" stroke-width="2" stroke-linecap="round"/>`),
  scepter: frame('g', '#4a0a12', '#120204', `
    <path d="M30 58L34 22" stroke="url(#goldg)" stroke-width="5" stroke-linecap="round"/>
    <path d="M24 26c0-10 16-10 16 0" fill="none" stroke="url(#goldg)" stroke-width="3"/>
    <path d="M32 6l7 10-7 10-7-10z" fill="#ff2a3a" filter="url(#glowg)"/><path d="M32 9l3 7-3 6-3-6z" fill="#ffb0b8"/>
    <circle cx="20" cy="18" r="2.5" fill="#ff5a3a" filter="url(#glowg)"/><circle cx="44" cy="18" r="2.5" fill="#ff5a3a" filter="url(#glowg)"/>
    <path d="M27 40h10" stroke="#ffe0a0" stroke-width="2"/>`),
};

// kind: passive | active | consumable. Durations in seconds, ranges in world units.
const ITEMS = {
  boots:   { name: 'Swift Boots', classic: 'Boots of Speed', cost: 300, kind: 'passive', speed: 0.15,
             desc: 'Lightweight boots of tanned shadow-hide.', stats: ['+15% movement speed'] },
  treads:  { name: 'Ember Treads', classic: 'Power Treads', cost: 650, needs: 'boots', kind: 'passive', speed: 0.25, hp: 120,
             desc: 'Swift Boots reforged in the Scourge Pit.', stats: ['+25% movement speed', '+120 max health', 'Upgrades Swift Boots (replaces them)'] },
  salve:   { name: 'Soothing Salve', classic: 'Healing Salve', cost: 75, kind: 'consumable', heal: 350, dur: 8,
             desc: 'Restores health over time. Taking damage from a hero ends it.', stats: ['Heals 350 over 8 s'] },
  wand:    { name: 'Soul Wand', classic: 'Magic Wand', cost: 250, kind: 'active', cd: 8, maxCharges: 15, perCharge: 30, chargeRange: 12,
             desc: 'Gains a charge whenever a visible enemy razes nearby (up to 15). Use: heal for every charge.', stats: ['30 health per charge', '8 s cooldown'] },
  ward:    { name: 'Watcher Ward', classic: 'Observer Ward', cost: 75, kind: 'consumable', target: 'point', range: 6, vision: 10, life: 150, max: 3,
             desc: 'Plant an unseen eye that sees through the fog. Invisible to enemies.', stats: ['Vision radius 10 for 150 s', 'Cast range 6', 'Up to 3 at once'] },
  dagger:  { name: 'Shadowstep Dagger', classic: 'Blink Dagger', cost: 900, kind: 'active', target: 'point', cd: 12, range: 12, lock: 3,
             desc: 'Step through the shadows to the cursor. Disabled for 3 s after taking hero damage.', stats: ['Blink up to 12 units', '12 s cooldown'] },
  cyclone: { name: 'Cyclone Staff', classic: "Eul's Scepter of Divinity", cost: 1000, kind: 'active', target: 'unit', cd: 20, range: 7, dur: 2.2, speed: 0.08,
             desc: 'Sweep a hero (or yourself) into a cyclone. They can not move, act or be harmed, and their raze is cancelled.', stats: ['2.2 s cyclone, cast range 7', '+8% movement speed', '20 s cooldown'] },
  blade:   { name: 'Veil Blade', classic: 'Shadow Blade (Lothar’s Edge)', cost: 1100, kind: 'active', cd: 22, dur: 9, speed: 0.2, bonus: 120,
             desc: 'Vanish from sight. Razing or using an item reveals you; a raze from the veil deals bonus damage.', stats: ['Invisible for 9 s, +20% speed', '+120 damage on the revealing raze', '22 s cooldown'] },
  avatar:  { name: 'Avatar Totem', classic: 'Black King Bar', cost: 1400, kind: 'active', cd: 45, durs: [6, 5, 4, 3], hp: 60,
             desc: 'Become immune to razes. Each use is shorter (6, 5, 4, then 3 s). Lava still burns.', stats: ['Raze immunity 6 s (shrinks to 3 s)', '+60 max health', '45 s cooldown'] },
  scepter: { name: 'Abyssal Scepter', classic: 'Aghanim’s Scepter', cost: 1700, kind: 'passive', hp: 150, cdMul: 0.85, mark: 40, markMax: 4, markDur: 6,
             desc: 'Your razes brand their victims: each Shadow Mark makes your next raze hit them harder.', stats: ['+150 max health', '-15% raze cooldown', 'Shadow Mark: +40 damage per stack (max 4, 6 s)'] },
};
// shop grid order (4 x 3, like a WC3 shop)
const SHOP = ['boots', 'treads', 'salve', 'wand', 'ward', 'dagger', 'cyclone', 'blade', 'avatar', 'scepter'];
// gold rules
const GOLD = { start: 200, perSec: 2, kill: 150, perStreak: 25, firstBlood: 100, assist: 60, assistWindow: 10, sellBack: 0.5 };

window.SFA_ITEMS = { ITEMS, SHOP, GOLD, ICONS };
})();
