import type { Pose } from '../shared/types';

// A small chibi drawn in SVG so the app works before any real art exists.
// Every pose is the same body with different eyes, mouth, arms and extras,
// so swapping poses never makes her jump.

const SKIN = '#f8d3bd';
const HAIR = '#2a1a16';
const DRESS = '#f48fb1';
const DRESS_DARK = '#e0719a';
const BLUSH = '#f9a8c0';
const LINE = '#3a2a30';

type Eyes =
  | 'open'
  | 'closed'
  | 'happy'
  | 'angry'
  | 'sleepy'
  | 'hearts'
  | 'side';
type Mouth = 'smile' | 'open' | 'pout' | 'frown' | 'grin' | 'o' | 'flat';
type Arms =
  | 'down'
  | 'wave'
  | 'up'
  | 'crossed'
  | 'hips'
  | 'clasped'
  | 'point'
  | 'chin'
  | 'rub';
type Extra = 'none' | 'hearts' | 'steam' | 'zzz' | 'dots' | 'sparkle';

interface Look {
  eyes: Eyes;
  mouth: Mouth;
  arms: Arms;
  extra: Extra;
}

const LOOKS: Record<Pose, Look> = {
  idle: { eyes: 'open', mouth: 'smile', arms: 'down', extra: 'none' },
  blink: { eyes: 'closed', mouth: 'smile', arms: 'down', extra: 'none' },
  wave: { eyes: 'happy', mouth: 'grin', arms: 'wave', extra: 'sparkle' },
  talk: { eyes: 'open', mouth: 'open', arms: 'down', extra: 'none' },
  happy: { eyes: 'happy', mouth: 'grin', arms: 'up', extra: 'hearts' },
  love: { eyes: 'hearts', mouth: 'smile', arms: 'clasped', extra: 'hearts' },
  pout: { eyes: 'side', mouth: 'pout', arms: 'crossed', extra: 'none' },
  angry: { eyes: 'angry', mouth: 'frown', arms: 'hips', extra: 'steam' },
  sleepy: { eyes: 'sleepy', mouth: 'o', arms: 'rub', extra: 'zzz' },
  thinking: { eyes: 'side', mouth: 'flat', arms: 'chin', extra: 'dots' },
  point: { eyes: 'open', mouth: 'grin', arms: 'point', extra: 'none' },
  water: { eyes: 'open', mouth: 'grin', arms: 'point', extra: 'sparkle' },
  meal: { eyes: 'happy', mouth: 'smile', arms: 'clasped', extra: 'hearts' },
};

const ARM = `stroke="${SKIN}" stroke-width="16" stroke-linecap="round" fill="none"`;

function eyes(kind: Eyes): string {
  const lx = 78;
  const rx = 122;
  const y = 92;
  switch (kind) {
    case 'open':
      return `<ellipse cx="${lx}" cy="${y}" rx="8" ry="11" fill="${LINE}"/><ellipse cx="${rx}" cy="${y}" rx="8" ry="11" fill="${LINE}"/>
        <circle cx="${lx + 3}" cy="${y - 4}" r="3" fill="#fff"/><circle cx="${rx + 3}" cy="${y - 4}" r="3" fill="#fff"/>`;
    case 'side':
      return `<ellipse cx="${lx + 4}" cy="${y}" rx="8" ry="11" fill="${LINE}"/><ellipse cx="${rx + 4}" cy="${y}" rx="8" ry="11" fill="${LINE}"/>
        <circle cx="${lx + 7}" cy="${y - 4}" r="3" fill="#fff"/><circle cx="${rx + 7}" cy="${y - 4}" r="3" fill="#fff"/>`;
    case 'closed':
      return `<path d="M${lx - 9} ${y} q9 6 18 0" stroke="${LINE}" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M${rx - 9} ${y} q9 6 18 0" stroke="${LINE}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    case 'happy':
      return `<path d="M${lx - 9} ${y + 2} q9 -12 18 0" stroke="${LINE}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        <path d="M${rx - 9} ${y + 2} q9 -12 18 0" stroke="${LINE}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
    case 'angry':
      return `<ellipse cx="${lx}" cy="${y + 2}" rx="8" ry="9" fill="${LINE}"/><ellipse cx="${rx}" cy="${y + 2}" rx="8" ry="9" fill="${LINE}"/>
        <path d="M${lx - 12} ${y - 16} l24 6" stroke="${LINE}" stroke-width="4" stroke-linecap="round"/>
        <path d="M${rx + 12} ${y - 16} l-24 6" stroke="${LINE}" stroke-width="4" stroke-linecap="round"/>`;
    case 'sleepy':
      return `<ellipse cx="${lx}" cy="${y}" rx="8" ry="11" fill="${LINE}"/><ellipse cx="${rx}" cy="${y}" rx="8" ry="11" fill="${LINE}"/>
        <rect x="${lx - 10}" y="${y - 12}" width="20" height="13" fill="${SKIN}"/><rect x="${rx - 10}" y="${y - 12}" width="20" height="13" fill="${SKIN}"/>
        <path d="M${lx - 9} ${y + 1} h18 M${rx - 9} ${y + 1} h18" stroke="${LINE}" stroke-width="3" stroke-linecap="round"/>`;
    case 'hearts':
      return `${heart(lx, y, 11, '#ff5d8f')}${heart(rx, y, 11, '#ff5d8f')}`;
  }
}

function mouth(kind: Mouth): string {
  const x = 100;
  const y = 116;
  switch (kind) {
    case 'smile':
      return `<path d="M${x - 9} ${y} q9 9 18 0" stroke="${LINE}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    case 'grin':
      return `<path d="M${x - 12} ${y - 2} q12 16 24 0 z" fill="${LINE}"/><path d="M${x - 7} ${y + 6} q7 4 14 0" fill="#ff8fab"/>`;
    case 'open':
      return `<ellipse cx="${x}" cy="${y + 3}" rx="7" ry="8" fill="${LINE}"/><ellipse cx="${x}" cy="${y + 6}" rx="4" ry="3" fill="#ff8fab"/>`;
    case 'pout':
      return `<circle cx="${x + 6}" cy="${y + 2}" r="4" fill="${LINE}"/>`;
    case 'frown':
      return `<path d="M${x - 9} ${y + 6} q9 -9 18 0" stroke="${LINE}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    case 'o':
      return `<circle cx="${x}" cy="${y + 3}" r="6" fill="${LINE}"/>`;
    case 'flat':
      return `<path d="M${x - 8} ${y + 2} h16" stroke="${LINE}" stroke-width="3" stroke-linecap="round"/>`;
  }
}

function arms(kind: Arms): string {
  // Shoulders at (72,150) and (128,150).
  switch (kind) {
    case 'down':
      return `<path d="M72 150 q-14 30 -8 56" ${ARM}/><path d="M128 150 q14 30 8 56" ${ARM}/>`;
    case 'wave':
      return `<path d="M72 150 q-14 30 -8 56" ${ARM}/><path d="M128 150 q26 -14 34 -46" ${ARM}/>`;
    case 'up':
      return `<path d="M72 150 q-24 -16 -30 -46" ${ARM}/><path d="M128 150 q24 -16 30 -46" ${ARM}/>`;
    case 'crossed':
      return `<path d="M72 152 q28 14 52 2" ${ARM}/><path d="M128 158 q-28 18 -52 4" ${ARM}/>`;
    case 'hips':
      return `<path d="M72 150 q-24 20 -4 44" ${ARM}/><path d="M128 150 q24 20 4 44" ${ARM}/>`;
    case 'clasped':
      return `<path d="M72 150 q6 26 24 26" ${ARM}/><path d="M128 150 q-6 26 -24 26" ${ARM}/>`;
    case 'point':
      return `<path d="M72 150 q-14 30 -8 56" ${ARM}/><path d="M128 150 q30 6 38 18" ${ARM}/><circle cx="170" cy="170" r="11" fill="${SKIN}"/>`;
    case 'chin':
      return `<path d="M72 150 q-14 30 -8 56" ${ARM}/><path d="M128 150 q20 -6 -8 -28" ${ARM}/>`;
    case 'rub':
      return `<path d="M72 150 q-14 30 -8 56" ${ARM}/><path d="M128 150 q14 -20 -4 -56" ${ARM}/>`;
  }
}

function extra(kind: Extra): string {
  switch (kind) {
    case 'none':
      return '';
    case 'hearts':
      return `<g class="float">${heart(34, 70, 9, '#ff7aa2')}${heart(168, 56, 7, '#ff9bbd')}${heart(160, 110, 6, '#ffb3cc')}</g>`;
    case 'steam':
      return `<g class="float" fill="none" stroke="#9aa" stroke-width="3" stroke-linecap="round">
        <path d="M40 60 q6 -10 0 -20 q-6 -10 0 -20"/><path d="M160 60 q6 -10 0 -20 q-6 -10 0 -20"/></g>`;
    case 'zzz':
      return `<g class="float" fill="#7c8db5" font-family="system-ui" font-weight="700">
        <text x="150" y="60" font-size="18">z</text><text x="166" y="42" font-size="14">z</text><text x="178" y="28" font-size="11">z</text></g>`;
    case 'dots':
      return `<g class="float" fill="#8a7b84"><circle cx="150" cy="44" r="3"/><circle cx="162" cy="40" r="4"/><circle cx="176" cy="34" r="5"/></g>`;
    case 'sparkle':
      return `<g class="float" fill="#ffd166"><path d="M36 50 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z"/><path d="M174 90 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/></g>`;
  }
}

function heart(cx: number, cy: number, r: number, color: string): string {
  const d = `M${cx} ${cy + r * 0.9} C${cx - r * 1.6} ${cy - r * 0.2} ${cx - r * 0.9} ${cy - r * 1.2} ${cx} ${cy - r * 0.4} C${cx + r * 0.9} ${cy - r * 1.2} ${cx + r * 1.6} ${cy - r * 0.2} ${cx} ${cy + r * 0.9}z`;
  return `<path d="${d}" fill="${color}"/>`;
}

export function placeholderSvg(pose: Pose): string {
  const look = LOOKS[pose];
  return `<svg viewBox="0 0 200 260" xmlns="http://www.w3.org/2000/svg" aria-label="${pose}">
    <!-- legs -->
    <path d="M84 222 v26" stroke="${SKIN}" stroke-width="16" stroke-linecap="round"/>
    <path d="M116 222 v26" stroke="${SKIN}" stroke-width="16" stroke-linecap="round"/>
    <ellipse cx="84" cy="250" rx="12" ry="6" fill="${LINE}"/><ellipse cx="116" cy="250" rx="12" ry="6" fill="${LINE}"/>
    <!-- dress -->
    <path d="M70 148 q30 -14 60 0 l16 78 q-46 10 -92 0z" fill="${DRESS}"/>
    <path d="M70 148 q30 -14 60 0 l4 20 q-34 10 -68 0z" fill="${DRESS_DARK}" opacity=".5"/>
    ${arms(look.arms)}
    <!-- neck + head -->
    <rect x="92" y="130" width="16" height="18" fill="${SKIN}"/>
    <circle cx="100" cy="92" r="56" fill="${SKIN}"/>
    <!-- hair: bob with fringe -->
    <path d="M44 92 q0 -62 56 -62 q56 0 56 62 q0 14 -10 24 q4 -40 -20 -46 q-14 30 -46 8 q-14 -4 -26 14 q-10 -10 -10 0z" fill="${HAIR}"/>
    <path d="M44 92 q-4 36 14 54 q-4 -30 2 -50z M156 92 q4 36 -14 54 q4 -30 -2 -50z" fill="${HAIR}"/>
    <!-- blush -->
    <ellipse cx="68" cy="112" rx="9" ry="5" fill="${BLUSH}" opacity=".8"/><ellipse cx="132" cy="112" rx="9" ry="5" fill="${BLUSH}" opacity=".8"/>
    ${eyes(look.eyes)}
    ${mouth(look.mouth)}
    ${extra(look.extra)}
  </svg>`;
}
