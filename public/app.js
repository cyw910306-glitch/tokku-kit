// 톡꾸 키트 UI: 상태, 단계, 이벤트. 엔진은 SPEC 2절 API 만 쓴다.
import { createPhone, bubbleGeom } from './mock.js';

// 무료·비영리 오픈소스 (MIT). 인스타 주소를 넣으면 받기 완료 화면·푸터에 팔로우 버튼이 보인다 (빈 값 = 숨김)
const GITHUB_URL = 'https://github.com/cyw910306-glitch/tokku-kit';
const INSTAGRAM_URL = '';
const SITE = 'tokku-kit.vercel.app';
const MAX_SIDE = 2048;     // 캐릭터 사진
const SLOT_SIDE = 768;     // 자리별 그림 (실제로 쓰는 크기는 잠금 132px, 구석 400px 남짓)
const PHOTO_SIDE = 2250;   // 배경 사진 (1125x2250 화면)
const TOL0 = 32, TOL_MAX = 40; // 다듬기 세기 시작값·최대 (40 넘으면 배경과 비슷한 털이 깎이기 시작)
const EMPTY_MSG = '캐릭터가 거의 다 지워졌어요. 2단계 다듬기에서 세기를 왼쪽으로 옮기거나 다른 사진을 넣어 주세요.';
const FALLBACK_DEFAULTS = { name: '나의 테마', id: '', preset: 'cream-dots', layout: 'perch', charSize: 'm', bubbleShape: 'round', outline: 'normal', outlineColor: 'auto',
  deco: 'none', fillTone: 'palette', pixelChar: false, grid: 48, pixelBubble: false, colors: null };
// 꾸미기 버튼과 프로젝트 불러오기 검증이 같이 쓰는 표 (값, 화면 글자)
const CHOICES = {
  layout: [['none', '없음'], ['perch', '올라앉기'], ['peek', '빼꼼'], ['hang', '엎드려 걸치기'], ['stand', '프사 옆 꼬마']],
  charSize: [['s', '작게'], ['m', '보통'], ['l', '크게']],
  bubbleShape: [['round', '동글'], ['soft', '살짝 둥글'], ['square', '네모']],
  outline: [['thin', '얇게'], ['normal', '보통'], ['thick', '굵게']],
  outlineColor: [['auto', '말풍선 색'], ['dark', '진하게']],
  deco: [['none', '없음'], ['sparkle', '반짝 ✦'], ['heart', '하트 ♥'], ['star', '별 ★'], ['note', '음표 ♪']],
  fillTone: [['palette', '사진 색'], ['white', '하양'], ['cream', '크림']],
  grid: [[32, '굵게 32칸'], [48, '보통 48칸'], [64, '섬세 64칸']],
  preset: [['cream-dots', '크림 도트'], ['pastel-check', '파스텔 체크'], ['retro-game', '레트로 게임'], ['plain-minimal', '무지 미니멀']],
};
// 템플릿이 정하는 '모양' 키. 템플릿에 없는 키는 기본값으로 되돌려 같은 템플릿이 늘 같은 모양이 되게 한다 (무늬·격자·색·이름은 유지)
const LOOK_KEYS = ['layout', 'charSize', 'bubbleShape', 'outline', 'outlineColor', 'deco', 'fillTone', 'pixelChar', 'pixelBubble'];
const SWATCHES = [['bg', '배경'], ['tabBg', '탭 바'], ['sendFill', '보낸 말풍선'], ['accent', '포인트'], ['text', '글자']];
// '색 더 보기' (팔레트 나머지 전부 + 프로필 바탕): 남이 만든 테마 색을 그대로 옮길 수 있게
const SWATCHES_MORE = [['sendLine', '보낸 테두리'], ['sendSel', '보낸 누름'], ['recvFill', '받은 말풍선'], ['recvLine', '받은 테두리'], ['recvSel', '받은 누름'],
  ['muted', '흐린 글자'], ['line', '선'], ['keypad', '잠금 키패드'], ['shadow', '그림자'], ['profileBg', '프로필 바탕']];

// ---------- 배경 (opts.background) ----------
const PATTERNS = [['dots', '도트'], ['check', '체크'], ['grid', '격자'], ['stars', '별'], ['grid+stars', '레트로'], ['hearts', '하트'], ['cubes', '큐브'], ['none', '없음']];
const PRESET_PATTERN = { 'cream-dots': 'dots', 'pastel-check': 'check', 'retro-game': 'grid+stars', 'plain-minimal': 'none' };
// 무늬를 고르면 preset 도 가장 가까운 값으로 맞춘다 (배경 옵션을 모르는 엔진에서도 비슷하게 보이게)
const PATTERN_PRESET = { dots: 'cream-dots', check: 'pastel-check', grid: 'retro-game', stars: 'retro-game', 'grid+stars': 'retro-game', hearts: 'cream-dots', cubes: 'cream-dots', none: 'plain-minimal' };
const CORNERS = [['br', '오른쪽 아래'], ['bl', '왼쪽 아래'], ['tr', '오른쪽 위'], ['tl', '왼쪽 위'], ['none', '없음']];
const SIZES3 = [['s', '작게'], ['m', '보통'], ['l', '크게']];
const FITS = [['cover', '꽉 채우기'], ['contain', '전체 보이기']];
const PHOTO_KEYS = [['main', '친구탭', 'bgMain'], ['chat', '채팅방', 'bgChat'], ['passcode', '잠금', 'bgPasscode']];
const AREAS = [['full', '전체'], ['top', '위쪽 띠만'], ['none', '없음']], AREAS2 = [AREAS[0], AREAS[2]];
const BG_SEG = { pattern: PATTERNS, 'patternArea.main': AREAS, 'patternArea.chat': AREAS, 'patternArea.passcode': AREAS2,
  'corner.main': CORNERS, 'corner.chat': CORNERS, 'corner.size': SIZES3, ...Object.fromEntries(PHOTO_KEYS.map(([k]) => [`photo.${k}.fit`, FITS])) };
const DIM_MAX = 0.8;
const HEX = /^#[0-9A-Fa-f]{6}$/;
const pick = (v, list, def) => list.some(x => x[0] === v) ? v : def;
const num = (v, lo, hi, def) => typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
/** 아무 값 -> 빠짐없는 배경 옵션. 프로젝트 불러오기 검증과 기본값을 같이 맡는다. 진하기 null = 엔진 기본(프리셋 값) */
function normBg(src, preset, layout) {
  const s = src && typeof src === 'object' ? src : {}, c = s.corner || {};
  const ph = k => { const p = (s.photo && s.photo[k]) || {}; return { fit: pick(p.fit, FITS, 'cover'), blur: num(p.blur, 0, 12, 0), dim: num(p.dim, 0, DIM_MAX, 0.15) }; };
  const pa = s.patternArea || {}, pc = s.patternColors;
  return {
    pattern: pick(s.pattern, PATTERNS, PRESET_PATTERN[preset] || 'dots'),
    patternSize: pick(s.patternSize, SIZES3, 'm'),
    patternOpacity: num(s.patternOpacity, 0, 1, null),
    patternColors: Array.isArray(pc) && pc.length === 3 && pc.every(v => HEX.test(v)) ? pc.map(v => v.toUpperCase()) : null,
    patternArea: { main: pick(pa.main, AREAS, 'full'), chat: pick(pa.chat, AREAS, 'full'), passcode: pick(pa.passcode, AREAS2, 'full') },
    color: HEX.test(s.color || '') ? s.color.toUpperCase() : null,
    photo: Object.fromEntries(PHOTO_KEYS.map(([k]) => [k, ph(k)])),
    corner: { main: pick(c.main, CORNERS, 'br'), chat: pick(c.chat, CORNERS, layout === 'stand' ? 'br' : 'bl'), size: pick(c.size, SIZES3, 'm'), opacity: num(c.opacity, 0.15, 1, null) },
  };
}
const getPath = (o, p) => p.split('.').reduce((x, k) => x && x[k], o);
const setPath = (o, p, v) => { const ks = p.split('.'), last = ks.pop(); ks.reduce((x, k) => x[k], o)[last] = v; };

// ---------- 자리별 그림 (assets.slots) ----------
const TAB6 = [['friends', '친구'], ['chats', '채팅'], ['now', '오픈채팅'], ['shopping', '쇼핑'], ['call', '통화'], ['more', '더보기']];
const SLOT_GROUPS = [
  ['프로필 · 아이콘', [['profile', '기본 프로필'], ['icon', '테마 아이콘']]],
  ['탭 (눌렀을 때)', TAB6.map(([k, t]) => ['tabSelected.' + k, t])],
  ['탭 (평소)', TAB6.map(([k, t]) => ['tabNormal.' + k, t])],
  ['잠금 화면', [0, 1, 2, 3].map(i => ['passcodeSelected.' + i, `${i + 1}번째 자리`]).concat([['passcodeArt', '잠금 배경 그림']])],
  ['말풍선 캐릭터', [['bubble.perch', '올라앉기'], ['bubble.peek', '빼꼼'], ['bubble.hang', '엎드려 걸치기'], ['bubble.stand', '프사 옆 꼬마']]],
  ['배경 구석 그림', [['cornerMain', '친구탭 구석'], ['cornerChat', '채팅방 구석']]],
];
const SLOT_NAME = Object.fromEntries(SLOT_GROUPS.flatMap(g => g[1]));
const BIG_JSON = 15 * 1024 * 1024;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ua = navigator.userAgent;
const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(ua);
const isPC = !isIOS && !isAndroid && !/Mobile/i.test(ua);

const newId = () => [...crypto.getRandomValues(new Uint8Array(6))].map(b => b.toString(16).padStart(2, '0')).join('');
const say = (el, text, kind = '') => { el.textContent = text; el.className = 'msg' + (kind ? ' ' + kind : ''); };

let engine = null;
let DEF = FALLBACK_DEFAULTS, TEMPLATES = [];
const S = { id: newId(), opts: { ...FALLBACK_DEFAULTS, name: '젤리 테마', background: normBg(null, FALLBACK_DEFAULTS.preset), slotsArePixel: false },
  a: null, b: null, photos: {}, slots: {}, step: 1, demo: true, tpl: null, couple: false, pack: null };
let palette = null;     // 마지막 빌드에 쓰인 Palette (스와치 표시용)
let bgMeta = null;      // 마지막 빌드의 배경 결과 { dim: {main,chat,passcode}, warnings } (자동 어둡게·대비 경고 표시용)
let current = null;     // { urls: Map, meta }
let buildSeq = 0, timer = 0;

const hero = createPhone($('#heroPhone'), { tab: 'chat', label: '데모 젤리 테마 미리보기' });
const phone = createPhone($('#buildPhone'), { tab: 'chat', label: '내 테마 미리보기' });

// ---------- 이미지 ----------
function loadImage(src) {
  return new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('image')); i.src = src; });
}

/**
 * File|Blob|dataURL -> { src: dataURL(긴 변 side 이하), raw: Img, transparent }. 배경 사진은 mime 'image/jpeg' (흰 바탕, 키잉 안 함).
 * side = 캐릭터 2048 / 자리별 그림 768 / 배경 사진 2250 (저장 JSON·메모리 크기를 쓰는 만큼만)
 */
async function toChar(input, mime = 'image/png', side = MAX_SIDE) {
  const url = typeof input === 'string' ? input : URL.createObjectURL(input);
  try {
    const im = await loadImage(url);
    const k = Math.min(1, side / Math.max(im.naturalWidth, im.naturalHeight));
    const w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (mime === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(im, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h);
    const src = typeof input === 'string' && k === 1 ? input : c.toDataURL(mime, 0.85);
    c.width = c.height = 0;
    let clear = 0; for (let i = 3; i < d.data.length; i += 4) if (d.data[i] < 128) clear++;
    return { src, raw: { width: w, height: h, data: d.data }, transparent: clear / (w * h) >= 0.05, tol: TOL0, ready: null, readyTol: -1, empty: false };
  } finally { if (typeof input !== 'string') URL.revokeObjectURL(url); }
}

async function ready(c) {
  if (c.ready && c.readyTol === c.tol) return c.ready;
  c.ready = await engine.prepareCharacter(c.raw, { tolerance: c.tol });
  c.readyTol = c.tol;
  // 배경 지우기가 캐릭터까지 먹었는지: 남은 불투명 픽셀이 (긴 변 1024 로 줄인) 원본 넓이의 2% 미만
  if (!c.transparent) {
    const { width: w, height: h } = c.raw, k = Math.min(1, 1024 / Math.max(w, h));
    let n = 0; for (let i = 3; i < c.ready.data.length; i += 4) if (c.ready.data[i] > 10) n++;
    c.empty = n < 0.02 * Math.round(w * k) * Math.round(h * k);
    if (c.slot) c.frag = !c.empty && fragmented(c.ready);
  }
  return c.ready;
}

/** 배경 지우기 뒤 그림이 조각났는지: 가장 큰 덩어리(4방향 연결)가 남은 불투명 픽셀의 절반 미만 (배경 있는 사진을 칸에 넣은 경우) */
function fragmented({ width: w, height: h, data }) {
  const seen = new Uint8Array(w * h), stack = new Int32Array(w * h);
  let total = 0, best = 0;
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || data[i * 4 + 3] <= 10) continue;
    let n = 0, sp = 0; stack[sp++] = i; seen[i] = 1;
    while (sp) {
      const p = stack[--sp], x = p % w; n++;
      for (const q of [p - w, p + w, x ? p - 1 : -1, x < w - 1 ? p + 1 : -1]) {
        if (q >= 0 && q < w * h && !seen[q] && data[q * 4 + 3] > 10) { seen[q] = 1; stack[sp++] = q; }
      }
    }
    total += n; best = Math.max(best, n);
  }
  return total > 0 && best < total / 2;
}

function drawImg(canvas, img) {
  canvas.width = img.width; canvas.height = img.height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
}

// ---------- 빌드 / 미리보기 ----------
// null(= 엔진 기본) 값은 빼고 넘긴다
const cleanBg = bg => JSON.parse(JSON.stringify(bg, (k, v) => v === null ? undefined : v));
const opts = () => ({ ...S.opts, background: cleanBg(S.opts.background), name: S.opts.name.trim() || '나의 테마', id: S.id });

/** 엔진 4번째 인자 assets: 배경 사진(키잉 없음) + 자리별 그림(키잉). 다 지워진 그림은 빼서 내 캐릭터로 대신 */
async function assetsOf() {
  const slots = {};
  for (const [path, c] of Object.entries(S.slots)) {
    const img = await ready(c);
    if (c.empty) continue;
    const [g, k] = path.split('.');
    if (k == null) slots[g] = img;
    else (slots[g] ||= g === 'passcodeSelected' ? [null, null, null, null] : {})[g === 'passcodeSelected' ? +k : k] = img;
  }
  const a = { slots };
  for (const [k, , key] of PHOTO_KEYS) if (S.photos[k]) a[key] = S.photos[k].raw;
  return a;
}
const lookup = urls => n => urls.get(`Images/${n}@3x.png`) || urls.get(`Images/${n}@2x.png`) || urls.get(`Images/${n}.png`) || '';
const info = (extra) => ({ me: '나', friend: S.b ? '친구' : '호떡', friendChar: !!S.b, rules: engine && engine.bubbleRules, ...extra });

const toUrls = files => new Map([...files].map(([k, v]) => [k, URL.createObjectURL(v)]));

// 히어로는 한 번만 만든다 (URL 은 revoke 안 함). 기본 = 데모 젤리, 팩이 있으면 팩 그림 그대로
async function buildHero() {
  let r, names;
  if (S.pack) {
    r = await engine.buildTheme(await ready(S.a), S.b ? await ready(S.b) : null, opts(), await assetsOf());
    names = { me: S.pack.name, friend: '친구', friendChar: !!S.b };
  } else {
    const [jelly, hotteok] = await Promise.all(['jelly', 'hotteok'].map(async n => toChar(await (await fetch(`demo/${n}.png`)).blob())));
    r = await engine.buildTheme(await ready(jelly), await ready(hotteok), { ...FALLBACK_DEFAULTS, ...engine.DEFAULTS, name: '젤리 테마', id: S.id, colors: null });
    names = { me: '젤리', friend: '호떡', friendChar: true };
  }
  hero.render(lookup(toUrls(r.files)), r.meta, info(names));
  hero.setLoading(false);
}

function schedule() {
  clearTimeout(timer);
  if (!engine || !S.a) return;
  phone.setLoading(true, '미리보기를 다시 그리는 중');
  timer = setTimeout(rebuild, 300);
}

async function rebuild() {
  const seq = ++buildSeq;
  try {
    const A = await ready(S.a), B = S.b ? await ready(S.b) : null;
    if (seq !== buildSeq) return;
    renderTrim();
    const thin = [S.a, S.b].some(c => c && c.empty);
    if (thin !== S.thin) { S.thin = thin; syncGet(); }
    const assets = await assetsOf();
    if (seq !== buildSeq) return;
    renderSlots();
    const { files, meta } = await engine.buildTheme(A, B, opts(), assets);
    if (seq !== buildSeq) return;
    const urls = toUrls(files);
    phone.render(lookup(urls), meta, info());
    if (current) current.urls.forEach(u => URL.revokeObjectURL(u));
    current = { urls, meta };
    palette = meta.palette; bgMeta = meta.background || null;
    renderSwatches(); syncBg();
    phone.setLoading(false);
  } catch (e) {
    if (seq !== buildSeq) return;
    console.error(e);
    phone.setLoading(true, '미리보기를 만들지 못했어요. 다른 사진이나 옵션으로 다시 해 보세요.');
  }
}

// ---------- 단계 ----------
const allTransparent = () => S.a && S.a.transparent && (!S.b || S.b.transparent);

function showStep(n) {
  S.step = n;
  $$('.panel').forEach(p => { p.hidden = +p.dataset.step !== n; });
  $$('.stepper button').forEach(b => +b.dataset.go === n ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current'));
  if (n === 2) renderTrim();
}

$$('[data-next]').forEach(b => b.addEventListener('click', () => {
  if (S.step === 1 && !S.a) return say($('#msg1'), '내 캐릭터 사진을 먼저 넣어 주세요.', 'err');
  showStep(S.step === 1 && allTransparent() ? 3 : S.step + 1);
  $('#builder').scrollIntoView({ block: 'start' });
}));
$$('[data-prev]').forEach(b => b.addEventListener('click', () => showStep(S.step === 3 && allTransparent() ? 1 : S.step - 1)));
$$('.stepper button').forEach(b => b.addEventListener('click', () => showStep(+b.dataset.go)));

// ---------- 1 사진 ----------
async function setChar(which, input, { keepId = false } = {}) {
  const msg = $('#msg1');
  try {
    say(msg, '사진을 읽는 중이에요');
    const c = await toChar(input);
    S[which] = c;
    if (which === 'a') {
      S.opts.colors = null;
      if (!keepId) S.id = newId();
      if (S.demo && !keepId) { S.demo = false; S.opts.name = '나의 테마'; $('#themeName').value = S.opts.name; }
    }
    renderThumbs();
    say(msg, c.transparent ? '배경이 투명한 사진이라 다듬기 단계는 건너뛰어요.' : '좋아요. 다음 단계에서 배경을 지워요.', 'ok');
    schedule();
  } catch {
    say(msg, '이 사진은 열 수 없어요. png, jpg, webp 사진을 넣어 주세요.', 'err');
  }
}

function renderThumbs() {
  for (const w of ['a', 'b']) {
    const W = w.toUpperCase(), c = S[w], img = $('#thumb' + W);
    img.hidden = !c; if (c) img.src = c.src;
    $('#name' + W).textContent = c ? '다른 사진으로 바꾸기' : (w === 'a' ? '사진 고르기' : '사진 고르기 (선택)');
  }
  $('#clearB').hidden = $('#coupleRow').hidden = !S.b;
  $('#couple').checked = !!S.couple;
}

function bindDrop(which) {
  const W = which.toUpperCase(), drop = $('#drop' + W), input = $('#file' + W);
  input.addEventListener('change', () => { if (input.files[0]) setChar(which, input.files[0]); input.value = ''; });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('over');
    const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/'));
    if (f) setChar(which, f);
  });
}
bindDrop('a'); bindDrop('b');
$('#clearB').addEventListener('click', () => { S.b = null; renderThumbs(); schedule(); });
$('#couple').addEventListener('change', e => { S.couple = e.target.checked; });

document.addEventListener('paste', e => {
  if (e.target.closest && e.target.closest('input, textarea')) return;
  const f = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/'));
  if (f) { e.preventDefault(); setChar('a', f); }
});

async function loadDemo(couple) {
  S.demo = true; S.id = newId(); S.opts.colors = null; S.opts.name = couple ? '젤리와 호떡' : '젤리 테마';
  $('#themeName').value = S.opts.name;
  try {
    const [a, b] = await Promise.all([fetch('demo/jelly.png').then(r => r.blob()), couple ? fetch('demo/hotteok.png').then(r => r.blob()) : null]);
    S.a = await toChar(a); S.b = b ? await toChar(b) : null;
    renderThumbs(); schedule();
  } catch { say($('#msg1'), '데모 사진을 불러오지 못했어요. 새로고침해 주세요.', 'err'); }
}
$('#demoOne').addEventListener('click', () => loadDemo(false));
$('#demoCouple').addEventListener('click', () => loadDemo(true));

$('#ctaMake').addEventListener('click', () => {
  showStep(1);
  $('#builder').scrollIntoView({ block: 'start' });
  $('#fileA').click();
});

// ---------- 2 다듬기 ----------
function renderTrim() {
  const box = $('#trimList');
  if (S.step !== 2 || !box) return;
  const list = [['a', '내 캐릭터'], ['b', '친구 캐릭터']].filter(([w]) => S[w]);
  if (!box._k || box._k[0] !== S.a || box._k[1] !== S.b) {
    box._k = [S.a, S.b];
    box.innerHTML = '';
    for (const [w, label] of list) {
      const c = S[w], f = document.createElement('div');
      f.className = 'field';
      f.innerHTML = `<span class="lab">${label}</span><div class="chk"><figure><canvas data-w="${w}" aria-label="${label} 다듬은 결과"></canvas><figcaption></figcaption></figure></div>` +
        (c.transparent ? '' : `<label class="lab" for="tol-${w}" style="margin-top:12px">배경 지우기 세기 <small id="tolv-${w}">${c.tol}</small></label><input type="range" id="tol-${w}" min="0" max="${TOL_MAX}" step="2" value="${c.tol}">`);
      box.append(f);
      const r = f.querySelector('input[type=range]');
      if (r) r.addEventListener('input', () => { c.tol = +r.value; $('#tolv-' + w).textContent = r.value; schedule(); });
    }
  }
  for (const cv of $$('canvas[data-w]', box)) {
    const c = S[cv.dataset.w], cap = cv.nextElementSibling;
    if (!c) continue;
    if (c.ready) drawImg(cv, c.ready);
    cap.textContent = c.transparent ? '이미 배경이 투명해요. 그대로 써요.' : c.empty ? EMPTY_MSG : '배경이 덜 지워지면 오른쪽으로, 캐릭터가 깎이면 왼쪽으로 옮겨요.';
    cap.classList.toggle('warn', !!c.empty);
  }
}

// ---------- 3 꾸미기 ----------
for (const [k, list] of Object.entries(CHOICES)) {
  const g = $(`[data-opt="${k}"]`);
  if (g) g.innerHTML = list.map(([v, t]) => `<button type="button" data-v="${v}">${t}</button>`).join('');
}
const okLayout = v => !engine || !engine.LAYOUTS || engine.LAYOUTS.includes(v);
const allowed = k => CHOICES[k].map(c => c[0]).filter(v => k !== 'layout' || okLayout(v));
const lookOf = t => { const { name, id, colors, ...look } = t.opts || {}; return { ...Object.fromEntries(LOOK_KEYS.map(k => [k, DEF[k]])), ...look }; };
const matchTpl = () => (TEMPLATES.find(t => Object.entries(lookOf(t)).every(([k, v]) => String(S.opts[k]) === String(v))) || {}).id || null;

function syncControls() {
  $$('[data-opt]').forEach(g => {
    const k = g.dataset.opt;
    $$('button', g).forEach(b => b.setAttribute('aria-pressed', String(String(S.opts[k]) === b.dataset.v)));
  });
  $$('[data-toggle]').forEach(b => b.setAttribute('aria-pressed', String(!!S.opts[b.dataset.toggle])));
  $$('[data-opt="grid"] button').forEach(b => { b.disabled = !S.opts.pixelChar; });
  $('[data-toggle="slotsArePixel"]').disabled = !S.opts.pixelChar;
  syncBg();
  $$('[data-opt="bubbleShape"] button').forEach(b => { b.disabled = !!S.opts.pixelBubble; });
  $('#shapeNote').textContent = S.opts.pixelBubble ? '(픽셀 말풍선은 계단 모서리라 고를 수 없어요)' : '';
  $$('[data-opt="charSize"] button').forEach(b => { b.disabled = S.opts.layout === 'none'; });
  $$('[data-opt="layout"] button').forEach(b => { b.disabled = !okLayout(b.dataset.v); });
  $$('.tpl[data-tpl]').forEach(b => {
    b.setAttribute('aria-pressed', String(b.closest('#tplGrid') ? b.dataset.tpl === S.tpl : false));
    const t = TEMPLATES.find(x => x.id === b.dataset.tpl);
    b.disabled = !t || !okLayout(lookOf(t).layout);
  });
  const t = TEMPLATES.find(x => x.id === S.tpl);
  $('#tplState').textContent = t ? `지금: ${t.name}` : '지금: 직접 꾸밈';
  $('#themeName').value = S.opts.name;
  renderSlots();
}
// 프사 옆 꼬마는 친구 캐릭터가 채팅방 왼쪽 아래에 서서, 채팅방 구석 그림이 기본(왼쪽 아래)이면 오른쪽 아래로 비켜 준다
const standCorner = () => { const c = S.opts.background.corner; if (S.opts.layout === 'stand' && c.chat === 'bl') c.chat = 'br'; };
$$('[data-opt]').forEach(g => g.addEventListener('click', e => {
  const b = e.target.closest('button[data-v]'); if (!b || b.disabled) return;
  const k = g.dataset.opt;
  S.opts[k] = k === 'grid' ? +b.dataset.v : b.dataset.v;
  if (k === 'layout') standCorner();
  S.tpl = null;
  syncControls(); schedule();
}));
$$('[data-toggle]').forEach(b => b.addEventListener('click', () => {
  S.opts[b.dataset.toggle] = !S.opts[b.dataset.toggle];
  if (LOOK_KEYS.includes(b.dataset.toggle)) S.tpl = null;
  syncControls(); schedule();
}));

// 템플릿: 카드 = 엔진 thumb 그림(데모 캐릭터) + 이름. 고른 결과는 내 캐릭터로 미리보기 폰에 바로 그려진다
function applyTemplate(id) {
  const t = TEMPLATES.find(x => x.id === id); if (!t) return;
  S.opts = { ...S.opts, ...lookOf(t) };
  if (PRESET_PATTERN[t.opts.preset]) S.opts.background = { ...S.opts.background, pattern: PRESET_PATTERN[t.opts.preset] };
  standCorner();
  S.tpl = t.id;
  syncControls(); schedule();
}
function tplCards(box) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  box.innerHTML = TEMPLATES.map(t => `<button type="button" class="tpl" data-tpl="${esc(t.id)}" aria-pressed="false">` +
    (typeof t.thumb === 'string' && /^templates\/[\w-]+\.png$/.test(t.thumb) ? `<img class="th" src="${t.thumb}" alt="">` : '') +
    `<b>${esc(t.name)}</b>${t.desc ? `<small>${esc(t.desc)}</small>` : ''}</button>`).join('');
}
function renderTemplates() {
  $('#tplField').hidden = !TEMPLATES.length;
  if (!TEMPLATES.length) { $('#more').open = true; return; } // 템플릿이 없는 엔진이면 옵션을 바로 펼쳐 둔다
  tplCards($('#tplGrid'));
  tplCards($('#tplStrip'));
  $('#tplStrip').setAttribute('role', 'group'); $('#tplStrip').setAttribute('aria-label', '템플릿 미리보기');
  syncControls();
}
$('#tplGrid').addEventListener('click', e => {
  const b = e.target.closest('.tpl'); if (!b || b.disabled) return;
  applyTemplate(b.dataset.tpl);
  // 폰이 아래에 있는 좁은 화면: 고른 결과가 '미리보기 보기' 아래에 있다고 알려 준다 (스크롤은 사용자가)
  const p = $('#peek'); if (getComputedStyle(p.parentElement).display === 'none') return;
  p.classList.remove('pulse'); void p.offsetWidth; p.classList.add('pulse');
});
$('#tplStrip').addEventListener('click', e => {
  const b = e.target.closest('.tpl'); if (!b || b.disabled) return;
  applyTemplate(b.dataset.tpl); showStep(3);
  $('#builder').scrollIntoView({ block: 'start' });
});
$('#themeName').addEventListener('input', e => { S.opts.name = e.target.value; schedule(); });
$('#autoColor').addEventListener('click', () => { S.opts.colors = null; schedule(); });
$('#peek').addEventListener('click', () => $('#buildPhone').scrollIntoView({ block: 'center' }));

function renderSwatches() {
  for (const [box, list] of [[$('#swatches'), SWATCHES], [$('#swatchesMore'), SWATCHES_MORE]]) {
    if (!box.children.length) {
      box.innerHTML = list.map(([k, t]) => `<label><input type="color" data-k="${k}" aria-label="${t} 색">${t}</label>`).join('');
      box.addEventListener('input', e => {
        const k = e.target.dataset.k; if (!k || !palette) return;
        S.opts.colors = { ...(S.opts.colors || palette), [k]: e.target.value.toUpperCase() };
        schedule();
      });
    }
    if (palette) $$('input', box).forEach(i => { const v = (S.opts.colors || palette)[i.dataset.k]; if (v && document.activeElement !== i) i.value = v.toLowerCase(); });
  }
}

// 배경 묶음: 무늬·구석·맞춤 버튼은 BG_SEG 표, 사진 줄은 PHOTO_KEYS 표에서 만든다
$('#photoList').innerHTML = PHOTO_KEYS.map(([k, t]) => `<div class="photo" data-photo="${k}">
  <div class="row"><b>${t}</b><img class="pth" alt="${t} 배경 사진" hidden>
    <label class="btn small ghost pick-btn">내 사진 넣기<input type="file" class="sr" accept="image/png,image/jpeg,image/webp" aria-label="${t} 배경 사진 고르기"></label>
    <button type="button" class="btn small ghost" data-px hidden>빼기</button></div>
  <div class="pctl" hidden>
    <div class="seg" role="group" aria-label="${t} 사진 맞춤" data-bgk="photo.${k}.fit"></div>
    <label class="lab" for="blur-${k}">흐림 <small data-bgv="photo.${k}.blur"></small></label><input type="range" id="blur-${k}" min="0" max="12" step="1" data-bgr="photo.${k}.blur">
    <label class="lab" for="dim-${k}">글자 잘 보이게 덮기 <small data-bgv="photo.${k}.dim"></small></label><input type="range" id="dim-${k}" min="0" max="${DIM_MAX}" step="0.05" data-bgr="photo.${k}.dim">
  </div></div>`).join('');
for (const [path, list] of Object.entries(BG_SEG)) {
  $(`[data-bgk="${path}"]`).innerHTML = list.map(([v, t]) => `<button type="button" data-v="${v}">${path === 'pattern' ? `<i class="pt-${v}" aria-hidden="true"></i>` : ''}${t}</button>`).join('');
}
const pct = v => Math.round(v * 100) + '%';
const bgLabel = (path, v) => {
  if (path === 'patternSize') return SIZES3.find(x => x[0] === v)[1];
  if (v == null) return '기본';
  if (/blur$/.test(path)) return v ? v + '단계' : '없음';
  const m = /^photo\.(\w+)\.dim$/.exec(path), eff = m && bgMeta && bgMeta.dim && bgMeta.dim[m[1]];
  return eff != null && eff > v + 1e-9 ? `${pct(v)} (글자가 안 보여 자동 ${pct(eff)})` : pct(v);
};

function syncBg() {
  const bg = S.opts.background;
  $$('[data-bgk]').forEach(g => $$('button', g).forEach(b => b.setAttribute('aria-pressed', String(getPath(bg, g.dataset.bgk) === b.dataset.v))));
  $$('[data-bgr]').forEach(r => {
    const p = r.dataset.bgr, v = getPath(bg, p);
    if (document.activeElement !== r) r.value = p === 'patternSize' ? SIZES3.findIndex(x => x[0] === v) : v ?? (p === 'patternOpacity' ? 0.3 : 0.4);
    $(`[data-bgv="${p}"]`).textContent = bgLabel(p, v);
  });
  // 사진이 깔린 화면은 무늬가 안 보인다: 무늬 라벨에 알리고, 세 화면 다 사진이면 무늬 조절을 끈다
  const withPhoto = PHOTO_KEYS.filter(([k]) => S.photos[k]), allPhoto = withPhoto.length === PHOTO_KEYS.length;
  $('#patNote').textContent = allPhoto ? '(세 화면 모두 사진이라 무늬는 안 보여요)' : withPhoto.length ? `(${withPhoto.map(x => x[1]).join('·')}은 사진이 우선)` : '';
  $$('[data-bgk="pattern"] button, [data-bgk^="patternArea"] button, [data-pc], #pcAuto').forEach(b => { b.disabled = allPhoto; });
  $$('[data-bgr="patternSize"], [data-bgr="patternOpacity"]').forEach(r => { r.disabled = allPhoto || bg.pattern === 'none'; });
  const pcs = bg.patternColors;
  $$('[data-pc]').forEach(i => { const v = pcs ? pcs[+i.dataset.pc] : ((S.opts.colors || palette || {})[['accent', 'sendLine', 'line'][+i.dataset.pc]]); if (v && document.activeElement !== i) i.value = v.toLowerCase(); });
  $('#pcV').textContent = pcs ? '(직접 고름, 도트·큐브·하트)' : '(자동, 도트·큐브·하트)';
  const warn = bgMeta && bgMeta.warnings && bgMeta.warnings.includes('text-on-bg');
  if (warn) say($('#msgBg'), '배경 색이 어두워서 글자가 잘 안 보일 수 있어요. 더 밝은 색을 고르거나 색에서 글자 색을 바꿔 주세요.', 'err');
  else if ($('#msgBg').classList.contains('err') && /배경 색이 어두워/.test($('#msgBg').textContent)) say($('#msgBg'), '');
  $$('[data-bgk="corner.size"] button').forEach(b => { b.disabled = bg.corner.main === 'none' && bg.corner.chat === 'none'; });
  $('[data-bgr="corner.opacity"]').disabled = bg.corner.main === 'none' && bg.corner.chat === 'none';
  const bc = $('#bgColor'), auto = bg.color || (S.opts.colors || palette || {}).bg;
  if (auto && document.activeElement !== bc) bc.value = auto.toLowerCase();
  $('#bgColorV').textContent = bg.color ? '(직접 고름)' : '(사진 색 자동)';
  for (const [k] of PHOTO_KEYS) {
    const row = $(`[data-photo="${k}"]`), p = S.photos[k];
    row.querySelector('.pth').hidden = row.querySelector('.pctl').hidden = row.querySelector('[data-px]').hidden = !p;
    if (p) row.querySelector('.pth').src = p.src;
    row.querySelector('.pick-btn').firstChild.textContent = p ? '바꾸기' : '내 사진 넣기';
  }
}
const setBg = (path, v) => {
  S.opts.background = structuredClone(S.opts.background);
  setPath(S.opts.background, path, v);
  if (path === 'pattern') S.opts.preset = PATTERN_PRESET[v];
  syncBg(); schedule();
};
$('#bgBox').addEventListener('click', e => {
  const b = e.target.closest('[data-bgk] button[data-v]');
  if (b && !b.disabled) return setBg(b.closest('[data-bgk]').dataset.bgk, b.dataset.v);
  const x = e.target.closest('[data-px]');
  if (x) { delete S.photos[x.closest('[data-photo]').dataset.photo]; syncBg(); schedule(); }
});
$('#bgBox').addEventListener('input', e => {
  const r = e.target.closest('[data-bgr]');
  if (r) setBg(r.dataset.bgr, r.dataset.bgr === 'patternSize' ? SIZES3[+r.value][0] : +r.value);
  else if (e.target.id === 'bgColor') setBg('color', e.target.value.toUpperCase());
  else if (e.target.dataset.pc) {
    const cur = S.opts.background.patternColors || $$('[data-pc]').map(i => i.value.toUpperCase());
    setBg('patternColors', cur.map((v, i) => i === +e.target.dataset.pc ? e.target.value.toUpperCase() : v));
  }
});
$('#pcAuto').addEventListener('click', () => setBg('patternColors', null));
$('#bgBox').addEventListener('change', async e => {
  const inp = e.target.closest('[data-photo] input[type=file]'); if (!inp || !inp.files[0]) return;
  const k = inp.closest('[data-photo]').dataset.photo, f = inp.files[0]; inp.value = '';
  try { S.photos[k] = await toChar(f, 'image/jpeg', PHOTO_SIDE); syncBg(); schedule(); }
  catch { say($('#msgBg'), '이 사진은 열 수 없어요. png, jpg, webp 사진을 넣어 주세요.', 'err'); }
});
$('#bgAuto').addEventListener('click', () => setBg('color', null));

// 자리별 그림: 칸 하나 = 업로드(키잉) + 썸네일 + 지우기
$('#slotList').innerHTML = SLOT_GROUPS.map(([g, list]) => `<div class="slot-g">${g}</div><div class="slots">` + list.map(([p, t]) =>
  `<div class="slot" data-slot="${p}"><label class="pick"><img alt="" hidden><span>자동</span><input type="file" class="sr" accept="image/png,image/jpeg,image/webp" aria-label="${t} 그림 넣기"></label>` +
  `<span>${t}</span><button type="button" class="x" hidden aria-label="${t} 그림 지우기">지우기</button></div>`).join('') + '</div>').join('') + '<p class="msg" id="msgSlot" role="status"></p>';
function renderSlots() {
  const bad = [], frag = [];
  for (const el of $$('[data-slot]')) {
    const p = el.dataset.slot, c = S.slots[p], img = el.querySelector('img');
    el.classList.toggle('on', !!c); el.classList.toggle('warn', !!(c && (c.empty || c.frag)));
    img.hidden = el.querySelector('.x').hidden = !c; el.querySelector('.pick span').hidden = !!c;
    if (c && img.getAttribute('src') !== c.src) img.src = c.src;
    if (c && c.empty) bad.push(SLOT_NAME[p]);
    if (c && c.frag) frag.push(SLOT_NAME[p]);
    // 말풍선 캐릭터 칸은 지금 고른 '말풍선 위 캐릭터' 모양 하나만 쓴다
    const idle = p.startsWith('bubble.') && p.slice(7) !== S.opts.layout;
    el.classList.toggle('idle', idle);
    el.querySelector('small')?.remove();
    if (idle) el.querySelector(':scope > span').insertAdjacentHTML('afterend', '<small>지금 모양에선 안 쓰여요</small>');
  }
  const m = $('#msgSlot');
  const txt = [bad.length && `${bad.join(', ')}: 배경 지우기로 그림이 거의 다 지워져서 내 캐릭터로 대신 넣었어요.`,
    frag.length && `${frag.join(', ')}: 배경이 있는 사진이라 그림이 조각났어요.`].filter(Boolean);
  if (txt.length) say(m, txt.join(' ') + ' 배경이 투명한 PNG 를 넣어 주세요.', 'err');
  else if (m.classList.contains('err')) say(m, '');
}
$('#slotList').addEventListener('change', async e => {
  const inp = e.target.closest('[data-slot] input[type=file]'); if (!inp || !inp.files[0]) return;
  const p = inp.closest('[data-slot]').dataset.slot, f = inp.files[0]; inp.value = '';
  try { S.slots[p] = Object.assign(await toChar(f, 'image/png', SLOT_SIDE), { slot: true }); renderSlots(); schedule(); }
  catch { say($('#msgSlot'), '이 그림은 열 수 없어요. png, jpg, webp 그림을 넣어 주세요.', 'err'); }
});
$('#slotList').addEventListener('click', e => {
  const x = e.target.closest('.x'); if (!x) return;
  delete S.slots[x.closest('[data-slot]').dataset.slot]; renderSlots(); schedule();
});

// ---------- 4 받기 ----------
const safeName = s => (s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim() || 'tokku-theme').slice(0, 40);
const withExt = n => /\.ktheme$/i.test(n) ? n : n + '.ktheme';

function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

async function shareOrSave(blob, name, type) {
  const file = new File([blob], name, { type });
  if (isIOS && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  saveBlob(blob, name);
}

/** 테마 파일 목록. 친구 캐릭터는 받은 말풍선에 들어가고, '상대 폰용도 같이' 를 켜면 친구가 보낸 쪽인 테마를 하나 더 */
async function makeFiles() {
  const A = await ready(S.a), B = S.b ? await ready(S.b) : null, o = opts(), assets = await assetsOf();
  if (B && S.couple) {
    const list = await engine.buildCouple(A, B, o, assets);
    const label = ['내 폰용', '상대 폰용'];
    return list.map((x, i) => ({ name: withExt(safeName(x.name || `${o.name} ${label[i]}`)), blob: x.blob, label: label[i] }));
  }
  const { files } = await engine.buildTheme(A, B, o, assets);
  const name = engine.themeFileName ? engine.themeFileName(o) : withExt(safeName(o.name));
  return [{ name, blob: await engine.packTheme(files), label: '테마' }];
}

async function deliver() {
  const msg = $('#msg4'), box = $('#files');
  if (!engine || !S.a) return say(msg, engine ? '사진을 먼저 넣어 주세요.' : '만들기 엔진이 아직 준비되지 않았어요.', 'err');
  await ready(S.a); if (S.b) await ready(S.b);
  if (S.a.empty || (S.b && S.b.empty)) return say(msg, EMPTY_MSG, 'err');
  $('#getTheme').disabled = true;
  say(msg, '테마를 만드는 중이에요');
  box.innerHTML = '';
  $('#igDone').hidden = true;
  try {
    const list = await makeFiles();
    const canShare = isIOS && navigator.canShare && navigator.canShare({ files: [new File([list[0].blob], list[0].name, { type: 'application/octet-stream' })] });
    for (const f of list) {
      const el = document.createElement('div');
      el.className = 'file';
      el.innerHTML = `<div class="n"></div><div class="row"></div>`;
      el.querySelector('.n').textContent = `${f.label} · ${f.name} `;
      el.querySelector('.n').insertAdjacentHTML('beforeend', `<small>${Math.max(1, Math.round(f.blob.size / 1024))}KB</small>`);
      const row = el.querySelector('.row');
      if (canShare) {
        const s = document.createElement('button'); s.type = 'button'; s.className = 'btn primary small';
        s.textContent = '카카오톡으로 보내기(공유)';
        s.addEventListener('click', () => shareOrSave(f.blob, f.name, 'application/octet-stream'));
        row.append(s);
      }
      const d = document.createElement('button'); d.type = 'button'; d.className = 'btn small' + (canShare ? ' ghost' : ' primary');
      d.textContent = '파일로 저장';
      d.addEventListener('click', () => saveBlob(f.blob, f.name));
      row.append(d);
      box.append(el);
    }
    say(msg, canShare ? '준비됐어요. 공유에서 카카오톡을 고르고 나에게 보내세요.' : '준비됐어요. 파일로 저장한 뒤 아래 설치 방법을 따라 해 주세요.', 'ok');
    $('#pcHint').hidden = !isPC;
    $('#igDone').hidden = !INSTAGRAM_URL;
  } catch (e) {
    console.error(e);
    say(msg, '파일을 만들지 못했어요. 잠시 뒤 다시 눌러 주세요.', 'err');
  } finally { syncGet(); }
}
$('#getTheme').addEventListener('click', () => deliver());

function syncGet() {
  $('#getTheme').disabled = !engine || !!S.thin;
  if (S.thin) say($('#msg4'), EMPTY_MSG, 'err');
  else if ($('#msg4').textContent === EMPTY_MSG) say($('#msg4'), '');
}
if (isAndroid) $('#getHint').textContent += ' 안드로이드는 지원하지 않아요. 아이폰 카카오톡에서 써 주세요.';
$$('[data-gh]').forEach(a => { a.href = GITHUB_URL; });
$$('[data-ig]').forEach(a => { a.href = INSTAGRAM_URL; a.hidden = !INSTAGRAM_URL; });

// ---------- 공유 카드 (1080x1920) ----------
function nine(ctx, img, g, x, y, w, h, k) {
  const s = img.naturalWidth / g.W;
  const sx = [0, g.X * s, (g.X + 1) * s, img.naturalWidth], sy = [0, g.Y * s, (g.Y + 1) * s, img.naturalHeight];
  const R = Math.round, dx = [x, x + g.X * k, x + w - g.R * k, x + w].map(R), dy = [y, y + g.Y * k, y + h - g.B * k, y + h].map(R);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const sw = sx[j + 1] - sx[j], sh = sy[i + 1] - sy[i], dw = dx[j + 1] - dx[j], dh = dy[i + 1] - dy[i];
    if (sw > 0 && sh > 0 && dw > 0 && dh > 0) ctx.drawImage(img, sx[j], sy[i], sw, sh, dx[j], dy[i], dw, dh);
  }
}

function wrapText(ctx, text, max) {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of para) { if (line && ctx.measureText(line + ch).width > max) { out.push(line); line = ch; } else line += ch; }
    out.push(line);
  }
  return out;
}

async function bragCard() {
  if (!current) throw new Error('no preview');
  const u = lookup(current.urls), meta = current.meta, p = meta.palette, k = 1080 / 375;
  const names = ['chatroomBgImage', 'profileImg01', 'chatroomBubbleSend01', 'chatroomBubbleSend02', 'chatroomBubbleReceive01', 'chatroomBubbleReceive02'];
  const im = Object.fromEntries(await Promise.all(names.map(async n => [n, await loadImage(u(n))])));
  await document.fonts.load('700 40px "Pretendard Variable"').catch(() => {});
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
  const ctx = c.getContext('2d');
  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, 1080, 1920);
  const bg = im.chatroomBgImage; ctx.drawImage(bg, 0, 0, 1080, 1080 * bg.naturalHeight / bg.naturalWidth);
  const font = (wt, px) => `${wt} ${px}px "Pretendard Variable", Pretendard, -apple-system, sans-serif`;
  ctx.fillStyle = p.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = font(700, 50); ctx.fillText(S.opts.name.trim() || '나의 테마', 540, 150);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const msgs = [['r', '오늘 저녁에 산책 갈래?', '01'], ['r', '날씨 진짜 좋대!', '02'], ['s', '좋아 좋아!!', '01'], ['s', '간식도 챙겨 갈게', '02'], ['r', 'ㅋㅋ', '01'], ['s', 'ㅋ', '01']];
  let y = 120; // pt
  ctx.font = font(500, 15 * k);
  ctx.imageSmoothingEnabled = !S.opts.pixelBubble;
  for (const [side, text, n] of msgs) {
    const recv = side === 'r', g = bubbleGeom(meta.bubbles[n], recv);
    const img = im[`chatroomBubble${recv ? 'Receive' : 'Send'}${n}`];
    const lines = wrapText(ctx, text, 230 * k), lh = 20 * k;
    const tw = Math.max(...lines.map(l => ctx.measureText(l).width)) / k;
    const w = Math.max(g.W, tw + g.l + g.r), h = Math.max(g.H, lines.length * 20 + g.t + g.bo);
    const x = recv ? 58 : 375 - 12 - w;
    if (recv && n === '01') { ctx.save(); ctx.imageSmoothingEnabled = true; ctx.beginPath(); ctx.roundRect(12 * k, y * k, 38 * k, 38 * k, 14 * k); ctx.clip(); ctx.drawImage(im.profileImg01, 12 * k, y * k, 38 * k, 38 * k); ctx.restore(); }
    nine(ctx, img, g, x * k, y * k, w * k, h * k, k);
    ctx.fillStyle = p.text;
    lines.forEach((l, i) => ctx.fillText(l, (x + g.l) * k, (y + g.t) * k + i * lh));
    y += h + 8;
  }
  ctx.fillStyle = p.bg; ctx.fillRect(0, 1800, 1080, 120);
  ctx.fillStyle = p.line; ctx.fillRect(0, 1800, 1080, 2);
  ctx.fillStyle = p.muted; ctx.textAlign = 'center'; ctx.font = font(600, 30);
  ctx.fillText(`톡꾸 키트로 만든 테마 · ${SITE}`, 540, 1850);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = c.height = 0;
  return blob;
}
$('#brag').addEventListener('click', async () => {
  const msg = $('#msgX');
  try { say(msg, '카드를 그리는 중이에요'); await shareOrSave(await bragCard(), 'tokku-card.png', 'image/png'); say(msg, '자랑 카드를 만들었어요.', 'ok'); }
  catch (e) { console.error(e); say(msg, '미리보기가 준비된 뒤 다시 눌러 주세요.', 'err'); }
});

// ---------- 프로젝트 저장 / 불러오기 ----------
$('#saveProj').addEventListener('click', () => {
  if (!S.a) return say($('#msgX'), '사진을 먼저 넣어 주세요.', 'err');
  const pack = c => c && { src: c.src, tol: c.tol };
  // v3: 배경 옵션 + 배경 사진(dataURL) + 자리별 그림. 옛 v1/v2 는 불러오기에서 그대로 읽힌다
  const json = JSON.stringify({ app: 'tokku-kit', v: 3, id: S.id, options: { ...S.opts }, a: pack(S.a), b: pack(S.b), couple: !!S.couple,
    photos: Object.fromEntries(Object.entries(S.photos).map(([k, c]) => [k, { src: c.src }])),
    slots: Object.fromEntries(Object.entries(S.slots).map(([k, c]) => [k, pack(c)])) });
  const mb = Math.round(json.length / 1048576);
  // 큰 파일은 저장 '전에' 묻는다 (메일·메신저 첨부 한도, 폰 저장 공간)
  if (json.length > BIG_JSON && !confirm(`넣은 사진이 많아 프로젝트 파일이 ${mb}MB 예요. 그래도 저장할까요? (취소하고 배경 사진이나 자리별 그림 수를 줄이면 작아져요)`)) return say($('#msgX'), '저장을 취소했어요.', '');
  saveBlob(new Blob([json], { type: 'application/json' }), withExt(safeName(S.opts.name)).replace(/\.ktheme$/, '.json'));
  say($('#msgX'), json.length > BIG_JSON ? `프로젝트를 저장했어요 (${mb}MB).` : '프로젝트를 저장했어요.', 'ok');
});
$('#fileProj').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const msg = $('#msg1');
  try {
    const j = JSON.parse(await f.text());
    const okSrc = s => typeof s === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(s);
    if (j.app !== 'tokku-kit' || !j.a || !okSrc(j.a.src) || (j.b && !okSrc(j.b.src))) throw new Error('bad');
    S.opts = { ...S.opts, ...normOpts(j.options || {}, { ...DEF, name: S.opts.name, background: null }) };
    S.couple = !!j.couple;
    S.id = /^[0-9a-f]{12}$/.test(j.id) ? j.id : newId();
    S.demo = false;
    const tolOf = t => (typeof t === 'number' && Number.isFinite(t) ? Math.min(TOL_MAX, Math.max(0, t)) : TOL0); // 0(안 지우기)도 그대로
    const a = await toChar(j.a.src); a.tol = tolOf(j.a.tol);
    const b = j.b ? await toChar(j.b.src) : null; if (b) b.tol = tolOf(j.b.tol);
    const photos = {}, slots = {};
    for (const [k] of PHOTO_KEYS) { const p = j.photos && j.photos[k]; if (p && okSrc(p.src)) photos[k] = await toChar(p.src, 'image/jpeg', PHOTO_SIDE); }
    for (const [k, v] of Object.entries(j.slots && typeof j.slots === 'object' ? j.slots : {})) {
      if (SLOT_NAME[k] && v && okSrc(v.src)) { slots[k] = Object.assign(await toChar(v.src, 'image/png', SLOT_SIDE), { slot: true }); slots[k].tol = tolOf(v.tol); }
    }
    S.a = a; S.b = b; S.photos = photos; S.slots = slots;
    S.tpl = matchTpl();
    renderThumbs(); syncControls(); renderSlots(); schedule();
    say(msg, '프로젝트를 불러왔어요.', 'ok');
  } catch { say(msg, '톡꾸 키트 프로젝트 파일이 아니에요.', 'err'); }
});

/**
 * 옵션 검증 (프로젝트 불러오기·캐릭터 팩 같이). 표에 있는 값만 받고, 없거나 모르는 값은 base 값.
 * base.background 가 없으면 preset 에서 무늬 (옛 v1/v2 프로젝트 = 배경 없음)
 */
function normOpts(o, base) {
  const picked = Object.fromEntries(Object.keys(CHOICES).map(k => [k, allowed(k).includes(o[k]) ? o[k] : base[k]]));
  const bool = k => typeof o[k] === 'boolean' ? o[k] : !!base[k];
  const okColors = o.colors && typeof o.colors === 'object' && Object.values(o.colors).every(v => HEX.test(v));
  return {
    ...picked,
    name: typeof o.name === 'string' ? o.name.slice(0, 24) : base.name,
    pixelChar: bool('pixelChar'), pixelBubble: bool('pixelBubble'), slotsArePixel: bool('slotsArePixel'),
    colors: okColors ? o.colors : (o.colors === undefined ? base.colors || null : null),
    background: o.background || !base.background ? normBg(o.background, picked.preset, picked.layout) : base.background,
  };
}

// ---------- 캐릭터 팩 (docs/PACKS.md): pack.json 하나 + 같은 곳의 그림들로 캐릭터·친구·자리별 그림·옵션·색을 한 번에 ----------
// ?pack= 은 이 사이트 안의 상대 경로만 (남의 그림을 이 사이트 주소로 띄우지 못하게). 버튼은 사용자가 고른 아무 https 주소
const PACK_PARAM = /^(?![a-z][\w+.-]*:)(?!\/)(?!.*\/\/)[\w./-]+\.json$/i;
const flat = (o, pre = '') => Object.entries(o && typeof o === 'object' ? o : {}).flatMap(([k, v]) => v && typeof v === 'object' ? flat(v, pre + k + '.') : [[pre + k, v]]);

async function loadPack(url, vid, keepLook = false) {
  const base = new URL(url, location.href);
  if (!/^https?:$/.test(base.protocol)) throw new Error('pack url');
  const get = async u => { const r = await fetch(u); if (!r.ok) throw new Error(`pack ${r.status} ${u}`); return r; };
  const j = await (await get(base)).json();
  if (!j || j.tokkuPack !== 1 || typeof j.char !== 'string') throw new Error('not a pack');
  const vars = (Array.isArray(j.variants) ? j.variants : []).filter(v => v && typeof v.id === 'string' && typeof v.name === 'string').slice(0, 8);
  const v = vars.find(x => x.id === vid) || vars[0] || {};
  const P = { ...j, ...v, options: { ...(j.options || {}), ...(v.options || {}) } };
  // 그림은 pack.json 과 같은 출처에서만 (상대 경로 기준 = pack.json 위치)
  const img = async (p, side) => {
    const u = new URL(p, base);
    if (u.origin !== base.origin) throw new Error('pack image origin');
    return toChar(await (await get(u)).blob(), 'image/png', side);
  };
  const slotList = flat(P.slots).filter(([k, p]) => SLOT_NAME[k] && typeof p === 'string');
  const [a, b, ...arts] = await Promise.all([img(P.char, MAX_SIDE), typeof P.friend === 'string' ? img(P.friend, MAX_SIDE) : null,
    ...slotList.map(([, p]) => img(p, SLOT_SIDE))]);
  const o = { ...P.options, colors: P.colors === undefined ? null : P.colors };
  if (typeof P.slotsArePixel === 'boolean') o.slotsArePixel = P.slotsArePixel;
  if (typeof o.name !== 'string' && typeof j.name === 'string' && !keepLook) o.name = j.name;
  // 종류만 바꿀 땐(keepLook) 지금 고른 템플릿·배경을 두고 종류가 정한 값만 덮는다
  const vo = keepLook ? { ...(v.options || {}), colors: o.colors } : o;
  if (keepLook && typeof P.slotsArePixel === 'boolean') vo.slotsArePixel = P.slotsArePixel;
  S.opts = { ...S.opts, ...normOpts(vo, keepLook ? S.opts : { ...DEF, name: S.opts.name, background: null }) };
  S.a = a; S.b = b; S.photos = keepLook ? S.photos : {};
  S.slots = Object.fromEntries(slotList.map(([k], i) => [k, Object.assign(arts[i], { slot: true })]));
  S.id = newId(); S.demo = false;
  S.pack = { url, name: typeof j.name === 'string' ? j.name.slice(0, 40) : '캐릭터 팩', vars, vid: v.id || null };
  S.tpl = matchTpl();
  renderPack(); renderThumbs(); syncControls(); schedule();
}

function renderPack() {
  const p = S.pack;
  $('#packBar').hidden = !p;
  if (!p) return;
  $('#packName').textContent = p.name;
  $('#packVars').hidden = p.vars.length < 2;
  $('#packVars').innerHTML = p.vars.map(v => `<button type="button" data-pv="${encodeURIComponent(v.id)}" aria-pressed="${v.id === p.vid}"></button>`).join('');
  $$('#packVars button').forEach((b, i) => { b.textContent = p.vars[i].name.slice(0, 20); });
  $('#bLead').textContent = `'${p.name}' 팩 그림이 미리 채워져 있어요. 템플릿, 배경, 자리별 그림을 마음대로 바꿔 보세요.`;
}
$('#packVars').addEventListener('click', async e => {
  const b = e.target.closest('button[data-pv]'); if (!b || !S.pack) return;
  try { await loadPack(S.pack.url, decodeURIComponent(b.dataset.pv), true); }
  catch (err) { console.warn(err); say($('#msg1'), '팩 그림을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.', 'err'); }
});
// 팩 끄기 = 주소에서 ?pack 을 빼고 처음부터 (데모 젤리)
$('#packOff').addEventListener('click', () => location.replace(location.pathname + '#builder'));
$('#packOpen').addEventListener('click', () => { $('#packForm').hidden = false; $('#packUrl').focus(); });
$('#packForm').addEventListener('submit', async e => {
  e.preventDefault();
  const url = $('#packUrl').value.trim(), msg = $('#msg1');
  if (!url) return;
  say(msg, '팩을 불러오는 중이에요');
  try { await loadPack(url); say(msg, `'${S.pack.name}' 팩을 불러왔어요.`, 'ok'); }
  catch (err) { console.warn(err); say(msg, '팩을 불러오지 못했어요. pack.json 주소가 맞는지, 그림이 같은 곳에 있는지 확인해 주세요.', 'err'); }
});

// ---------- 시작 ----------
syncControls(); renderSwatches(); syncGet();
try {
  engine = await import('./engine/index.js');
  DEF = { ...FALLBACK_DEFAULTS, ...(engine.DEFAULTS || {}) };
  TEMPLATES = Array.isArray(engine.TEMPLATES) ? engine.TEMPLATES.filter(t => t && t.id && t.name && t.opts) : [];
  S.opts = { ...DEF, name: S.opts.name, colors: null, background: normBg(DEF.background, DEF.preset, DEF.layout), slotsArePixel: !!DEF.slotsArePixel };
  S.tpl = matchTpl();
  renderTemplates(); syncControls(); syncGet();
  const packParam = new URLSearchParams(location.search).get('pack');
  if (packParam) {
    try {
      if (!PACK_PARAM.test(packParam)) throw new Error('pack param');
      await loadPack(packParam);
    } catch (e) {
      console.warn(e);
      $('#engineNoteText').textContent = '캐릭터 팩을 불러오지 못해서 데모 젤리로 시작해요.';
      $('#engineNote').hidden = false;
    }
  }
  await buildHero().catch(e => { console.error(e); hero.setLoading(true, '데모를 그리지 못했어요. 새로고침해 주세요.'); });
  if (!S.pack) await loadDemo(false);
} catch (e) {
  engine = null;
  $('#engineNoteText').textContent = '만들기 엔진을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요. 페이지 안내는 그대로 볼 수 있어요.';
  $('#engineNote').hidden = false;
  const t = '엔진 준비 중이에요. 잠시 뒤 새로고침해 주세요.';
  hero.setLoading(true, t); phone.setLoading(true, t);
  syncGet();
}
