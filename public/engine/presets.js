// 모든 규격 수치는 여기 한 곳 (SPEC 3절, 기준 구현 build.py 와 같은 값). 단위 pt, 보낸 쪽 기준.

export const DEFAULTS = Object.freeze({
  name: '나의 테마',
  id: '000000000000',
  preset: 'cream-dots',
  layout: 'perch',
  charSize: 'm',
  bubbleShape: 'round',
  outline: 'normal',
  outlineColor: 'auto',
  deco: 'none',
  fillTone: 'palette',
  pixelChar: false,
  grid: 48,
  pixelBubble: false,
  colors: null,
  background: null,     // null = 프리셋 무늬. resolveBackground 가 채운다
  slotsArePixel: false, // slot 그림이 이미 픽셀 스프라이트면 true (재격자화 없이 정수배)
  groupChar: 'none',    // 이어 보낸(02) 말풍선 위 작은 캐릭터: none | peek (서기에선 안 씀)
  peekPos: 'corner',    // 빼꼼 자리: corner(왼쪽 위 모서리) | center(가운데 위). peek 레이아웃·02 빼꼼에만
  textTone: 'palette',  // 글자 색: palette | mono (본문 #383838·보조 #5E5E5E, 선택 배경·보내기 버튼도 무채색)
  keypadTone: 'palette', // 잠금 키패드 배경: palette | char (캐릭터 대표색 = 보낸 말풍선 파스텔, 눌림은 흰 원)
});

// 말풍선 위 캐릭터: 없음 / 올라앉기(앞) / 빼꼼(뒤, 위쪽만 보임) / 엎드려 걸치기(뒤 + 앞발만 앞) / 프사 옆 꼬마(바깥 서기)
export const LAYOUTS = ['none', 'perch', 'peek', 'hang', 'stand'];
export const CHAR_SIZES = ['s', 'm', 'l'];
// note = 포스트잇 (각진 모서리, 꼬리·하이라이트 없음). 외곽선 none 과 같이 쓰면 단색 면만
export const SHAPES = ['round', 'soft', 'square', 'note'];
export const OUTLINES = { thin: 0.8, normal: 1.2, thick: 2.2, none: 0 }; // 둥근 외곽선 pt (보낸 쪽). 받은 쪽은 +RECV_EXTRA (none 은 0 그대로)
export const RECV_EXTRA = 0.3; // 흰 받은 말풍선은 밝은 배경에서 묻혀서 조금 더 굵게
export const PIXEL_OUTLINE = { thin: 1, normal: 1, thick: 2, none: 0 }; // 픽셀 말풍선 외곽선 칸 수
export const OUTLINE_COLORS = ['auto', 'dark'];
export const DECOS = ['none', 'sparkle', 'heart', 'star', 'note'];
// pastel = 보낸 쪽은 팔레트 sendFill, 받은 쪽은 색상환 120도 돌린 연한 파스텔 (흰 배경에서 외곽선 없이도 보이게. render.applyFillTone)
export const FILL_TONES = { palette: null, white: '#FFFFFF', cream: '#FFF6E0', pastel: 'pastel' };
export const GROUP_CHARS = ['none', 'peek'];
export const PEEK_POS = ['corner', 'center'];
export const TEXT_TONES = { palette: null, mono: { text: '#383838', muted: '#5E5E5E' } };
export const KEYPAD_TONES = ['palette', 'char'];
export const GRIDS = [32, 48, 64];

// 배경 프리셋 4종: 색은 Palette 에서, 무늬만 다름. pattern = background.pattern 기본값 ('+' 로 겹침)
export const PRESETS = {
  'cream-dots': { label: '크림 도트', pattern: 'dots' },
  'pastel-check': { label: '파스텔 체크', pattern: 'check' },
  'retro-game': { label: '레트로 게임', pattern: 'grid+stars' },
  'plain-minimal': { label: '심플', pattern: 'none' },
};

// ---------- 배경 커스텀 (opts.background) ----------
// 무늬 9종. cubes = 3색 둥근 사각 (accent 색상환 3등분, patternColors 로 직접). 기본 투명도 = 무늬별 값 (프리셋 그림 그대로)
// wobble-grid = 손그림처럼 살짝 삐뚤한 격자, sprinkle-hearts = 드문드문 불규칙 작은 하트 4색. 둘 다 시드 고정 난수 (같은 입력 = 같은 그림)
export const PATTERNS = ['dots', 'check', 'grid', 'stars', 'hearts', 'cubes', 'wobble-grid', 'sprinkle-hearts', 'none'];
export const PATTERN_ALPHA = { dots: 0.24, check: 0.3, grid: 0.1, stars: 0.28, hearts: 0.22, cubes: 0.16, 'wobble-grid': 0.2, 'sprinkle-hearts': 0.9, none: 0 };
// 헤이즈 = 무늬 아래 까는 흐린 파스텔 무지개 + 구름 (화면마다 none | rainbow). 사진이 있으면 사진이 우선
export const HAZES = ['none', 'rainbow'];
export const PATTERN_SIZES = { s: 0.75, m: 1, l: 1.4 };
export const CORNERS = ['br', 'bl', 'tr', 'tl', 'none'];
export const CORNER_SIZES = { s: 0.7, m: 1, l: 1.3 };
export const PHOTO_FITS = ['cover', 'contain'];
// auto = 글자 대비(text 4.5:1, muted 3:1)가 모자라면 dim 을 자동으로 올림 (render.autoDim)
const PHOTO_DEFAULT = { fit: 'cover', blur: 0, dim: 0.15, auto: true };
export const DIM_MAX = 0.8;
// 무늬 넣을 곳: full = 헤더 아래 전체, top = 위쪽 띠만 (BG.topBand), none = 무늬 없음. 잠금은 full|none
export const PATTERN_AREAS = { main: ['full', 'top', 'none'], chat: ['full', 'top', 'none'], passcode: ['full', 'none'] };

const range = (v, lo, hi, what) => {
  if (typeof v !== 'number' || !(v >= lo && v <= hi)) throw new Error(`${what} must be ${lo}~${hi}: ${v}`);
  return v;
};

/**
 * opts.background (일부만 와도 됨) -> 전부 채운 배경 설정. 같은 값을 다시 넣어도 같은 결과 (buildCouple 이 두 번 부름).
 * pattern 은 PATTERNS 하나 또는 'grid+stars' 처럼 '+' 로 겹친 것. patternOpacity 는 첫 무늬 기준, 나머지는 비율대로.
 * corner.opacity null = 배경별 기본 (main 0.42, chat 0.38).
 */
export function resolveBackground(preset = 'cream-dots', bg = null) {
  if (!PRESETS[preset]) throw new Error(`unknown preset ${preset}`);
  const b = bg || {};
  const pattern = b.pattern || PRESETS[preset].pattern;
  const parts = pattern.split('+');
  if (!parts.every(p => PATTERNS.includes(p)) || (parts.length > 1 && parts.includes('none'))) throw new Error(`unknown pattern ${pattern}`);
  const patternSize = b.patternSize || 'm';
  if (!PATTERN_SIZES[patternSize]) throw new Error(`unknown patternSize ${patternSize}`);
  const patternOpacity = b.patternOpacity == null ? PATTERN_ALPHA[parts[0]] : range(b.patternOpacity, 0, 1, 'patternOpacity');
  const color = b.color == null ? null : b.color;
  if (color !== null && !/^#[0-9A-Fa-f]{6}$/.test(color)) throw new Error(`background.color must be #RRGGBB: ${color}`);
  const photo = {};
  for (const w of ['main', 'chat', 'passcode']) {
    const p = { ...PHOTO_DEFAULT, ...((b.photo && b.photo[w]) || {}) };
    if (!PHOTO_FITS.includes(p.fit)) throw new Error(`unknown photo fit ${p.fit}`);
    photo[w] = { fit: p.fit, blur: range(p.blur, 0, 12, 'photo blur'), dim: range(p.dim, 0, DIM_MAX, 'photo dim'), auto: p.auto !== false };
  }
  // 무늬 색 (dots·cubes·hearts 가 차례로 돌려 씀). null = 팔레트에서
  const pc = b.patternColors == null ? null : b.patternColors;
  if (pc !== null && (!Array.isArray(pc) || !pc.length || pc.length > 3 || !pc.every(v => /^#[0-9A-Fa-f]{6}$/.test(v)))) throw new Error(`patternColors must be 1~3 #RRGGBB: ${pc}`);
  const patternArea = { main: 'full', chat: 'full', passcode: 'full', ...(b.patternArea || {}) };
  for (const [w, ok] of Object.entries(PATTERN_AREAS)) if (!ok.includes(patternArea[w])) throw new Error(`unknown patternArea.${w} ${patternArea[w]}`);
  const c = { main: 'br', chat: 'bl', size: 'm', opacity: null, ...(b.corner || {}) };
  for (const w of ['main', 'chat']) if (!CORNERS.includes(c[w])) throw new Error(`unknown corner ${c[w]}`);
  if (!CORNER_SIZES[c.size]) throw new Error(`unknown corner size ${c.size}`);
  const corner = { main: c.main, chat: c.chat, size: c.size, opacity: c.opacity == null ? null : range(c.opacity, 0.15, 1, 'corner opacity') };
  const hz = { main: 'none', chat: 'none', passcode: 'none', ...(b.haze || {}) };
  for (const w of ['main', 'chat', 'passcode']) if (!HAZES.includes(hz[w])) throw new Error(`unknown haze.${w} ${hz[w]}`);
  return { pattern, patternSize, patternOpacity, patternColors: pc && [...pc], patternArea: { main: patternArea.main, chat: patternArea.chat, passcode: patternArea.passcode }, color, photo, corner,
    haze: { main: hz.main, chat: hz.chat, passcode: hz.passcode } };
}

/** 무늬 겹 목록 [[무늬, 투명도]] (none 이면 빈 배열) */
export function patternLayers(bg) {
  const parts = bg.pattern.split('+').filter(p => p !== 'none');
  if (!parts.length) return [];
  const r = bg.patternOpacity / PATTERN_ALPHA[parts[0]];
  return parts.map(p => [p, r === 1 ? PATTERN_ALPHA[p] : Math.min(1, PATTERN_ALPHA[p] * r)]);
}

// 템플릿 = 모양 옵션 묶음. 색은 강제하지 않는다 (팔레트는 사진에서 자동, 면 성향만 fillTone 으로).
// bg (선택) = 그 템플릿이 까는 배경 (opts.background 일부. UI 가 지금 배경에 덮어씀). 포스트잇 계열: 채팅방 손그림 격자, 친구탭·잠금 무지개 헤이즈
const STICKY_BG = { pattern: 'wobble-grid+sprinkle-hearts', patternArea: { main: 'none', chat: 'full', passcode: 'none' }, haze: { main: 'rainbow', chat: 'none', passcode: 'rainbow' } };
export const TEMPLATES = [
  { id: 'near-profile', name: '프사 옆 꼬마', desc: '프로필 사진 바로 옆에 캐릭터가 서서 말풍선으로 말해요. 하얀 말풍선, 굵은 손글씨 선.',
    opts: { layout: 'stand', charSize: 'l', bubbleShape: 'round', outline: 'thick', outlineColor: 'dark', deco: 'none', fillTone: 'white', pixelChar: false, pixelBubble: false } },
  { id: 'peek-sparkle', name: '말풍선 빼꼼', desc: '말풍선 뒤에 숨어서 머리만 빼꼼. 반대쪽 모서리에 반짝이.',
    opts: { layout: 'peek', charSize: 'm', bubbleShape: 'round', outline: 'normal', outlineColor: 'dark', deco: 'sparkle', fillTone: 'cream', pixelChar: false, pixelBubble: false } },
  { id: 'hang', name: '엎드려 걸치기', desc: '말풍선 위에 엎드려 앞발을 걸쳤어요.',
    opts: { layout: 'hang', charSize: 'm', bubbleShape: 'soft', outline: 'normal', outlineColor: 'dark', deco: 'none', fillTone: 'palette', pixelChar: false, pixelBubble: false } },
  { id: 'perch', name: '올라앉기', desc: '말풍선 위에 폭 올라앉은 기본 모양.',
    opts: { layout: 'perch', charSize: 'm', bubbleShape: 'round', outline: 'normal', outlineColor: 'auto', deco: 'none', fillTone: 'palette', pixelChar: false, pixelBubble: false } },
  { id: 'pixel-dot', name: '픽셀 도트', desc: '캐릭터도 말풍선도 도트로. 오락실 감성.',
    opts: { layout: 'perch', charSize: 'm', bubbleShape: 'square', outline: 'normal', outlineColor: 'dark', deco: 'star', fillTone: 'palette', pixelChar: true, pixelBubble: true } },
  { id: 'simple', name: '심플', desc: '캐릭터 없이 깔끔한 말풍선만.',
    opts: { layout: 'none', charSize: 'm', bubbleShape: 'round', outline: 'normal', outlineColor: 'auto', deco: 'none', fillTone: 'palette', pixelChar: false, pixelBubble: false } },
  { id: 'heart-pop', name: '하트 뿅', desc: '큰 얼굴이 말풍선 위로 빼꼼, 하트 하나.',
    opts: { layout: 'peek', charSize: 'l', bubbleShape: 'round', outline: 'thick', outlineColor: 'auto', deco: 'heart', fillTone: 'palette', pixelChar: false, pixelBubble: false } },
  { id: 'retro-game', name: '레트로 게임', desc: '도트 꼬마가 픽셀 말풍선 옆에 서 있어요.',
    opts: { layout: 'stand', charSize: 's', bubbleShape: 'square', outline: 'thick', outlineColor: 'dark', deco: 'none', fillTone: 'white', pixelChar: true, pixelBubble: true } },
  { id: 'tiny-note', name: '콩알 빼꼼', desc: '작은 캐릭터가 네모 말풍선 뒤에서 콧노래.',
    opts: { layout: 'peek', charSize: 's', bubbleShape: 'square', outline: 'thin', outlineColor: 'dark', deco: 'note', fillTone: 'white', pixelChar: false, pixelBubble: false } },
  { id: 'sticky-peek', name: '포스트잇 빼꼼', desc: '네모난 포스트잇 뒤에서 가운데로 빼꼼, 이어 보낸 말풍선에도 작게 빼꼼. 손그림 격자에 하트, 글자는 차분한 먹색.',
    opts: { layout: 'peek', peekPos: 'center', groupChar: 'peek', charSize: 'm', bubbleShape: 'note', outline: 'none', outlineColor: 'auto', deco: 'none', fillTone: 'pastel', textTone: 'mono', keypadTone: 'char', pixelChar: false, pixelBubble: false },
    bg: STICKY_BG },
  { id: 'sticky-perch', name: '포스트잇 올라앉기', desc: '네모난 포스트잇 모서리에 폭 올라앉았어요. 손그림 격자, 글자는 차분한 먹색.',
    opts: { layout: 'perch', charSize: 'm', bubbleShape: 'note', outline: 'none', outlineColor: 'auto', deco: 'none', fillTone: 'pastel', textTone: 'mono', keypadTone: 'char', pixelChar: false, pixelBubble: false },
    bg: { ...STICKY_BG, pattern: 'wobble-grid' } },
].map(t => ({ ...t, thumb: `templates/${t.id}.png` })); // 썸네일 = tests/gen-thumbs.mjs 가 데모 캐릭터로 만든 그림

export const PIXEL_CELL = 2;       // 픽셀 말풍선 1칸 = 2pt
export const PIXEL_RADIUS = 3.6;   // 계단 모서리 반경 (칸)
export const PERCH_CROP = 0.7;     // 옆으로 퍼진 그림은 가운데 70% 까지만 가로 크롭
export const PEEK_CROP = 0.65;     // 빼꼼: 그림 위 65% (대략 턱까지) 만 쓴다. 자른 선은 몸통 뒤로 숨는다

const SIZE_F = { xs: 0.6, s: 0.75, m: 1, l: 1.3 }; // xs = 02 빼꼼 전용 (옵션 charSize 는 s|m|l)
const RADIUS = { soft: 6, square: 2, note: 0 }; // round = 12 (40pt 짜리) / 10
const CENTER_L = 16; // 빼꼼 center: 상자 왼쪽 x. 최소 폭(W = X + 20)일 때 상자 가운데 = 몸통 가운데 ((W - 6) / 2)
const ev = v => 2 * Math.round(v / 2); // 픽셀 말풍선 2pt 칸에 맞게 짝수
// 캐릭터 상자 기본 크기 (m, pt). top = 몸통 윗변이 상자 높이의 어디를 지나는지
const CHAR_BASE = {
  perch: { w: 40, h: 26, top: 0.62 },
  peek: { w: 36, h: 28, top: 0.88 },  // 위 65% 크롭 그림. 아래 2~4pt 만 몸통 뒤로 숨는다 (자른 선은 가리고 얼굴은 다 보이게)
  hang: { w: 40, h: 30, top: 0.82 },  // 상자 아래 ~18% (앞발) 만 테두리 앞으로 걸친다. 몸통에 가려지는 띠가 없게 앞에 그린다
  stand: { w: 36, h: 36 },            // 프사 크기 정도 (m 36pt, l 46pt 높이)
};
const STAND_BODY = 34; // 서기: 몸통 오른쪽 끝 x (pt, 보낸 쪽). 그 오른쪽 2pt 띄우고 캐릭터 상자
const NONE = {
  round: { W: 40, H: 35, X: 17, Y: 17, top: 0, ins: [10, 11, 7, 17] },
  pixel: { W: 40, H: 36, X: 16, Y: 16, top: 0, ins: [10, 12, 8, 18] },
};

/**
 * 말풍선 규격 (보낸 쪽, pt). X,Y = 늘이는 1pt 열·행, ins = [top, left, bottom, right], top = 몸통 시작 y,
 * r = 둥근 모서리 반경, box = 캐릭터 상자, deco = 장식 자리 {x,y,s}. perch/m/round = 기준 표 (64x58, X44 Y32).
 * 규칙: 캐릭터 상자는 늘이는 열 왼쪽(X-2 까지)·행 위(Y-2 까지), 텍스트는 상자 아래, 인셋 합 = W-12 / >= H-20.
 */
export function bubbleGeometry(layout = 'perch', charSize = 'm', shape = 'round', pixel = false, peekPos = 'corner') {
  if (!SHAPES.includes(shape)) throw new Error(`unknown bubbleShape ${shape}`);
  if (!PEEK_POS.includes(peekPos)) throw new Error(`unknown peekPos ${peekPos}`);
  let g, box = null, deco;
  if (layout === 'none') {
    g = { ...NONE[pixel ? 'pixel' : 'round'] };
    deco = pixel ? { x: 4, y: 4, s: 5, inside: true } : { x: 3, y: 3, s: 6, inside: true }; // 몸통 안 왼쪽 위 (꼬리 반대)
  } else {
    const base = CHAR_BASE[layout], f = SIZE_F[charSize];
    if (!base) throw new Error(`unknown layout ${layout}`);
    if (!f) throw new Error(`unknown charSize ${charSize}`);
    const w = ev(base.w * f), h = ev(base.h * f);
    if (layout === 'stand') { // 프사 옆 꼬마: 캐릭터는 몸통 오른쪽 위 바깥 (받은 쪽 = 거울 = 프사 바로 옆 왼쪽 위),
      // 몸통은 그 아래 옆으로 비켜서 시작하고 꼬리가 몸통 모서리에서 캐릭터 발밑 쪽으로 올라간다 (캐릭터가 말하는 모양)
      const bx = STAND_BODY, X = 14, W = bx + 2 + w, top = h + 8, Y = top + 16;
      g = { W, H: Y + 20, X, Y, top, bx, ins: pixel ? [top + 10, 12, 8, W - 22] : [top + 10, 11, 8, W - 23] };
      box = { x: W - w, y: 0, w, h };
    } else { // 왼쪽 위 모서리에 (올라앉기 / 빼꼼 / 걸치기). 빼꼼 center = 최소 폭 몸통의 가운데 위 (늘이는 열은 상자 오른쪽)
      const L = layout === 'peek' && peekPos === 'center' ? CENTER_L : 2;
      const top = ev(h * base.top), X = L + w + 2, W = X + 20, Y = Math.max(top + 16, h + 2), t = h + 2;
      const H = Math.max(Y + 16, t + 30);
      // center 는 짧은 글이 얼굴 아래 가운데 오게 글자 틀(12pt)을 몸통 가운데에. 인셋 합은 같다 (W - 12)
      const l = L === 2 ? W - 31 : (W - 6) / 2 - 6;
      g = { W, H, X, Y, top, ins: [t, l, Math.max(10, H - 20 - t), W - 12 - l] };
      box = { x: L, y: 0, w, h };
    }
    // 장식: 캐릭터 반대쪽 위 모서리 바깥 (올라앉기 계열은 꼬리 위, 서기는 왼쪽 위)
    const s = pixel ? 10 : 8, gap = pixel ? 2 : 1;
    deco = { x: layout === 'stand' ? gap : g.W - s - gap, y: g.top - s - gap, s };
  }
  g.r = shape === 'round' ? (g.W <= 40 ? 12 : 10) : RADIUS[shape];
  if (shape === 'note' && !pixel) g.note = true; // 포스트잇: 꼬리·하이라이트 없음 (픽셀 말풍선이면 픽셀이 우선)
  return { ...g, box, deco };
}

// 기본 표 (호환용): none 둘 + perch·stand 의 m 크기
const pick = ({ W, H, X, Y, top, ins }) => ({ W, H, X, Y, top, ins });
export const BUBBLES = {
  round: NONE.round, pixel: NONE.pixel,
  perch: pick(bubbleGeometry('perch')), stand: pick(bubbleGeometry('stand')),
};

/**
 * 레이아웃·스타일·그룹(02)에 맞는 말풍선 규격. 02 와 none 은 캐릭터·장식 없는 기본 크기.
 * 서기(stand) 02 만 예외: 01 과 같은 폭으로 늘리고 캐릭터 자리만큼 투명 띠(pad, 보낸 쪽 오른쪽 = 받은 쪽 왼쪽)를 둔다.
 * 그래야 이어 보낸 말풍선 몸통이 첫 말풍선 몸통과 같은 x 에서 시작한다 (카카오는 01·02 그림을 같은 x 에 놓는다).
 */
export function bubbleSpec(layout, pixelBubble, group, o = {}) {
  const shape = o.bubbleShape || 'round', charSize = o.charSize || 'm', pos = o.peekPos || 'corner';
  if (!group) return bubbleGeometry(layout, charSize, shape, pixelBubble, pos);
  // 이어 보낸 말풍선 위 작은 빼꼼 (xs 크기, 꼬리·장식 없음). 몸통 꼬리 쪽 끝이 W - 6 으로 01 과 같아서 카카오가 같은 x 에 놓아도 정렬된다
  if (o.groupChar === 'peek' && layout !== 'stand') return { ...bubbleGeometry('peek', 'xs', shape, pixelBubble, pos), deco: null };
  const g = { ...bubbleGeometry('none', 'm', shape, pixelBubble), deco: null };
  if (layout !== 'stand') return g;
  const pad = bubbleGeometry('stand', charSize, shape, pixelBubble).W - g.W;
  return { ...g, W: g.W + pad, pad, ins: [g.ins[0], g.ins[1], g.ins[2], g.ins[3] + pad] };
}

const mirrorBox = (c, b) => ({ ...c, x: b.W - c.x - (c.w ?? c.s) });

/** 캐릭터 상자 (없으면 null). side = 'send' | 'receive'. 받은 쪽은 상자만 옮김 (그림은 반전 안 함) */
export function charBox(layout, side, b) {
  const c = b && b.box;
  if (!c || layout === 'none') return null;
  return side === 'receive' ? mirrorBox(c, b) : { ...c };
}

/** 장식 자리 (없으면 null) */
export function decoBox(side, b) {
  const d = b && b.deco;
  if (!d) return null;
  return side === 'receive' ? mirrorBox(d, b) : { ...d };
}

/**
 * 둥근 말풍선 도형 (pt). 몸통 = 둥근 사각, 꼬리 = 위 오른쪽 삼각 [밑점, 끝점, 밑점], 하이라이트 = 왼쪽 위 타원.
 * b.bx (서기) = 몸통 오른쪽 끝. 꼬리는 몸통 오른쪽 위 모서리에서 위·오른쪽(캐릭터 발밑)으로 올라간다 (up)
 */
export function roundGeometry(b) {
  const T = b.top, Wb = b.W - (b.pad || 0), x1 = b.bx ?? Wb - 6; // pad = 오른쪽 투명 띠 (서기 02)
  return {
    body: { x0: 0.6, y0: T + 0.6, x1, y1: b.H - 0.6, r: b.r ?? (Wb <= 40 ? 12 : 10) },
    tail: b.note ? null : b.bx ? [[x1 - 15, T + 2.5], [x1 + 6, T - 7], [x1 - 3, T + 5]] : [[Wb - 12, T + 2], [Wb - 0.4, T + 0.8], [Wb - 6.4, T + 13]],
    up: !!b.bx,
    highlight: b.note ? null : { cx: 7.5, cy: T + 5.75, rx: 3, ry: 1.75 }, // 포스트잇(note)은 꼬리·하이라이트 없음
  };
}

/** 픽셀 말풍선 칸 좌표 (칸 단위). x1,y1 = 몸통 오른쪽·아래 끝 칸. 꼬리 = 행 ty+i 의 [시작, 끝] 칸 (서기는 몸통 위로 올라감) */
export function pixelGeometry(b) {
  const C = PIXEL_CELL;
  const Wc = b.W / C, Hc = b.H / C, Tc = b.top / C;
  const x1 = b.bx ? b.bx / C - 1 : (b.W - (b.pad || 0)) / C - 4, y1 = Hc - 2;
  const tail = b.bx
    ? [[x1 + 2, x1 + 4], [x1, x1 + 3], [x1 - 3, x1 + 1], [x1 - 5, x1], [x1 - 5, x1]]
    : [[x1 - 2, x1 + 3], [x1 - 2, x1 + 2], [x1 - 1, x1 + 1], [x1 - 1, x1]];
  return { Wc, Hc, Tc, x1, y1, r: PIXEL_RADIUS, tail, ty: b.bx ? Tc - 3 : Tc };
}

/** 둥근 외곽선 굵기 pt (받은 쪽이 더 굵음) */
export const lineWidth = (outline = 'normal', side = 'send') => {
  const w = OUTLINES[outline];
  if (w == null) throw new Error(`unknown outline ${outline}`);
  return w && w + (side === 'receive' ? RECV_EXTRA : 0); // none = 0 (받은 쪽도)
};
// 래스터에서 외곽선이 실제로 닿는 거리 (@2x/@3x 반올림 중 큰 쪽, 받은 쪽 기준)
const lineReach = outline => Math.max(...[2, 3].map(k => Math.round(lineWidth(outline, 'receive') * k) / k));

/**
 * 늘어나면 안 되는 부분 (pt 상자 목록): 모서리 곡선, 꼬리(외곽선 닿는 거리 포함), 하이라이트, 캐릭터, 장식 자리.
 * 늘이는 열 X (와 양옆 1pt) 는 이 상자들의 x 범위와, 행 Y 는 y 범위와 겹치면 안 된다.
 * 둥근 외곽선은 원판 침식이라 모서리 곡선이 시작하는 x·y 는 굵기와 상관없이 그대로다.
 */
export function features(b, pixel, outline = 'normal') {
  const out = [];
  if (pixel) {
    const g = pixelGeometry(b), C = PIXEL_CELL, e = Math.max(0, PIXEL_OUTLINE[outline] - 1) * C;
    const rc = Math.ceil(g.r - 0.5); // 계단 모서리가 차지하는 칸 수 (중심 clamp 가 걸리는 칸)
    const L = 0, R = g.x1 + 2, Tp = g.Tc, Bt = g.y1 + 2; // 그림자 1칸 포함
    out.push({ kind: 'corner', x0: L * C, x1: rc * C + e, y0: Tp * C, y1: (Tp + rc) * C + e });
    out.push({ kind: 'corner', x0: (R - rc - 1) * C - e, x1: R * C, y0: (Bt - rc - 1) * C - e, y1: Bt * C });
    const tx0 = Math.min(...g.tail.map(t => t[0])), tx1 = Math.max(...g.tail.map(t => t[1])) + 2;
    out.push({ kind: 'tail', x0: tx0 * C - e, x1: tx1 * C, y0: g.ty * C - e, y1: (g.ty + g.tail.length + 1) * C + e });
    out.push({ kind: 'highlight', x0: 2 * C, x1: 4 * C, y0: (g.Tc + 2) * C, y1: (g.Tc + 4) * C });
  } else {
    const g = roundGeometry(b), { x0, y0, x1, y1, r } = g.body, e = lineReach(outline);
    out.push({ kind: 'corner', x0, x1: x0 + r, y0, y1: y0 + r });
    out.push({ kind: 'corner', x0: x1 - r, x1, y0: y1 - r, y1 });
    // 꼬리는 몸통 밖으로 나온 부분만 보인다: 오른쪽 변(x1)을 빠져나가는 y 까지. 위로 올라가는 꼬리(서기)는 삼각형 전체 + 선
    if (g.tail) {
      const [, [bx, by], [cx, cy]] = g.tail, exitY = by + (cy - by) * (bx - x1) / (bx - cx);
      const xs = g.tail.map(p => p[0]), ys = g.tail.map(p => p[1]);
      out.push(g.up
        ? { kind: 'tail', x0: Math.min(...xs) - e, x1: Math.max(...xs) + e, y0: Math.min(...ys) - e, y1: Math.max(...ys) + e }
        : { kind: 'tail', x0: Math.min(...xs) - e, x1: Math.max(...xs), y0: Math.min(...ys), y1: exitY + e });
    }
    const h = g.highlight;
    if (h) out.push({ kind: 'highlight', x0: h.cx - h.rx, x1: h.cx + h.rx, y0: h.cy - h.ry, y1: h.cy + h.ry });
  }
  const c = b.box; // 받은 쪽은 거울상이라 띠도 같이 반전된다
  if (c) out.push({ kind: 'char', x0: c.x, x1: c.x + c.w, y0: c.y, y1: c.y + c.h });
  const d = b.deco;
  if (d) out.push({ kind: 'deco', x0: d.x, x1: d.x + d.s, y0: d.y, y1: d.y + d.s });
  return out;
}

/** 불변식 검사 (SPEC 3절). o = { charSize, bubbleShape, outline }. 오류 문자열 배열, 비어 있으면 통과 */
export function checkInvariants(layout, pixelBubble, group = false, o = {}) {
  return checkBubble(bubbleSpec(layout, pixelBubble, group, o), pixelBubble, o.outline || 'normal',
    `${group ? 'none' : layout}/${o.charSize || 'm'}/${pixelBubble ? 'pixel' : o.bubbleShape || 'round'}/${o.outline || 'normal'}${group ? '/02' : ''}`);
}

/** 규격 객체 하나 검사 (checkInvariants 본체) */
export function checkBubble(b, pixelBubble, outline = 'normal', tag = 'bubble') {
  const errs = [];
  // 1. 늘이는 열·행에서 1pt 이상 떨어짐: 띠 [X-1, X+2) 와 겹치면 안 됨
  for (const f of features(b, pixelBubble, outline)) {
    if (f.x1 > b.X - 1 && f.x0 < b.X + 2) errs.push(`${tag}: ${f.kind} x ${f.x0}~${f.x1} touches column ${b.X}`);
    if (f.y1 > b.Y - 1 && f.y0 < b.Y + 2) errs.push(`${tag}: ${f.kind} y ${f.y0}~${f.y1} touches row ${b.Y}`);
    if ((f.kind === 'char' || f.kind === 'deco') && (f.x0 < 0 || f.y0 < 0 || f.x1 > b.W || f.y1 > b.H)) errs.push(`${tag}: ${f.kind} outside image`);
  }
  // 2. 인셋 합
  const [t, l, bo, r] = b.ins;
  if (l + r < b.W - 12) errs.push(`${tag}: left+right inset ${l + r} < ${b.W - 12}`);
  if (t + bo < b.H - 20) errs.push(`${tag}: top+bottom inset ${t + bo} < ${b.H - 20}`);
  if (l + r >= b.W || t + bo >= b.H) errs.push(`${tag}: text area empty`);
  // 3. 텍스트 영역이 캐릭터 상자·장식과 겹치지 않음 (양쪽 모두)
  for (const side of ['send', 'receive']) {
    const [il, ir] = side === 'send' ? [l, r] : [r, l];
    const tx0 = il, tx1 = b.W - ir, ty0 = t, ty1 = b.H - bo;
    for (const [what, c] of [['character', charBox('any', side, b)], ['deco', decoBox(side, b)]]) {
      if (!c) continue;
      const cw = c.w ?? c.s, chh = c.h ?? c.s;
      if (c.x < tx1 && c.x + cw > tx0 && c.y < ty1 && c.y + chh > ty0) errs.push(`${tag}: ${side} text area overlaps ${what}`);
    }
  }
  // 4. 받은 쪽 cap X = W - X - 1 이 그 자체로 이미지 안 (반전 대칭)
  const Xr = b.W - b.X - 1;
  if (Xr < 1 || Xr > b.W - 2 || b.Y < 1 || b.Y > b.H - 2) errs.push(`${tag}: cap out of range`);
  if (pixelBubble && (b.W % 2 || b.H % 2 || b.top % 2)) errs.push(`${tag}: pixel bubble size must be even`);
  return errs;
}

// 배경·에셋 배치 (px, @3x). 헤더 330px 는 무늬 없이 (사진이면 bg 70% 띠).
// main/chat char = 기본 구석(main 오른쪽 아래, chat 왼쪽 아래) m 크기. mx/my = 구석에서 떨어진 거리
export const BG = {
  header: 330,
  headerBand: 0.7,
  headerFade: 60,          // 사진 위 헤더 띠 아래로 0.7 -> 0 페이드 (이음매 없게)
  topBand: [60, 420],      // patternArea 'top' = 이 띠만 (채팅방 위쪽만 살짝)
  main: { w: 1125, h: 2250, char: { x: 775, y: 1720, w: 320, h: 320, alpha: 0.42 }, mx: 30, my: 210 },
  chat: { w: 1125, h: 2250, char: { x: 20, y: 1700, w: 400, h: 340, alpha: 0.38 }, mx: 20, my: 210 },
  passcode: { w: 1200, h: 1200, patternEnd: 700, gradStart: 900, char: { x: 390, y: 700, w: 420, h: 400 } },
};

/**
 * 배경 구석 그림 자리 (px, @3x). which = 'main' | 'chat', corner = resolveBackground().corner. 'none' 이면 null.
 * 아래 구석은 바닥 정렬, 위 구석은 헤더 바로 아래 위 정렬. m + 기본 구석 = BG.<which>.char 그대로.
 */
export function cornerBox(which, corner) {
  const S = BG[which], where = corner[which];
  if (where === 'none') return null;
  const f = CORNER_SIZES[corner.size], w = Math.round(S.char.w * f), h = Math.round(S.char.h * f);
  const top = where[0] === 't';
  return {
    x: where[1] === 'r' ? S.w - S.mx - w : S.mx,
    y: top ? BG.header + 40 : S.h - S.my - h,
    w, h, align: top ? 'top' : 'bottom',
    alpha: corner.opacity == null ? S.char.alpha : corner.opacity,
  };
}
