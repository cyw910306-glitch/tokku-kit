// 캔버스 렌더링과 테마 빌드. 브라우저 전용 (캔버스는 makeCanvas 한 곳에서만 만든다).
import { IMAGES } from './spec.js';
import { DEFAULTS, PRESETS, LAYOUTS, GRIDS, BG, PERCH_CROP, PEEK_CROP, CHAR_SIZES, SHAPES, OUTLINES, OUTLINE_COLORS, DECOS, FILL_TONES, GROUP_CHARS, PEEK_POS, TEXT_TONES, KEYPAD_TONES, PATTERN_SIZES, bubbleSpec, charBox, resolveBackground, patternLayers, cornerBox } from './presets.js';
import { derive, shiftL, oklch, rgbToOklch, rgb, lumRgb, contrast, mulberry32, textOn } from './palette.js';
import { pixelize, fitSprite, binarizeScale, centerCropX } from './pixelize.js';
import { crop, cropToAlpha } from './keying.js';
import { bubbleImage, layerChar, santaHat, XMAS } from './bubble.js';
import { buildCss, themeId, themeName } from './css.js';
import { packTheme } from './pack.js';

// ---------- 캔버스 ----------
export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
const ctxOf = (c, pixel = false) => {
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingEnabled = !pixel;
  if (!pixel) x.imageSmoothingQuality = 'high';
  return x;
};
const release = c => { c.width = 0; c.height = 0; };

export async function canvasToBlob(c) {
  const b = c.convertToBlob ? await c.convertToBlob({ type: 'image/png' }) : await new Promise(r => c.toBlob(r, 'image/png'));
  release(c); // iOS 메모리: 큰 캔버스는 바로 해제
  return b;
}

/** Img -> 캔버스 */
export function imgCanvas(img) {
  const c = makeCanvas(img.width, img.height);
  ctxOf(c).putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  return c;
}

/** 캔버스 -> Img */
export function canvasImg(c) {
  const d = ctxOf(c).getImageData(0, 0, c.width, c.height);
  return { width: d.width, height: d.height, data: d.data };
}

/** 이미지 파일(Blob/File) -> Img (UI 용) */
export async function decodeImage(blob) {
  const bmp = await createImageBitmap(blob);
  const c = makeCanvas(bmp.width, bmp.height);
  ctxOf(c).drawImage(bmp, 0, 0);
  bmp.close && bmp.close();
  const img = canvasImg(c);
  release(c);
  return img;
}

/** Img -> PNG Blob */
export const imgToBlob = img => canvasToBlob(imgCanvas(img));

// 큰 축소는 반씩 단계적으로 (한 번에 줄이면 계단·모아레)
function drawScaled(ctx, src, dx, dy, dw, dh) {
  let cur = src, w = src.width, h = src.height;
  const tmp = [];
  while (w / 2 >= dw && h / 2 >= dh && w > 2 && h > 2) {
    const c = makeCanvas(Math.ceil(w / 2), Math.ceil(h / 2));
    ctxOf(c).drawImage(cur, 0, 0, w, h, 0, 0, c.width, c.height);
    tmp.push(c); cur = c; w = c.width; h = c.height;
  }
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, 0, 0, w, h, dx, dy, dw, dh);
  tmp.forEach(release);
}

// ---------- 캐릭터 ----------
// 한 캐릭터(또는 slot 그림)의 그림 변형: full(원본), perch(올라앉기용 가로 크롭), peek(위 65%). 처음 쓸 때 만든다.
// pixel 이면 각각 스프라이트. asSprite = 이미 픽셀 스프라이트라 재격자화 없이 그대로 (opts.slotsArePixel)
function makeChar(img, pixel, grid, asSprite = false) { return { img, pixel, grid, asSprite, variants: {} }; }
function variant(ch, key) {
  if (ch.variants[key]) return ch.variants[key];
  const { img, pixel, grid, asSprite } = ch, sp = im => ({ sprite: asSprite ? im : pixelize(im, grid) });
  let v;
  if (key === 'full') v = pixel ? sp(img) : { img };
  else if (key === 'perch') {
    const src = img.width / img.height > 40 / 26 ? centerCropX(img, Math.max(PERCH_CROP, (40 / 26) * img.height / img.width)) : img;
    v = pixel ? sp(src) : { img: src };
  } else if (key === 'peek') { // 산타모자를 씌운 그림은 모자 줄(hatTop) + 원래 그림의 65% (얼굴이 안 잘리게)
    const r = ((img.hatTop || 0) + (img.height - (img.hatTop || 0)) * PEEK_CROP) / img.height;
    if (pixel) { const f = variant(ch, 'full').sprite; v = { sprite: crop(f, 0, 0, f.width, Math.max(1, Math.round(f.height * r))) }; }
    else v = { img: crop(img, 0, 0, img.width, Math.max(1, Math.round(img.height * r))) };
  } else throw new Error(`unknown variant ${key}`);
  return (ch.variants[key] = v);
}
function freeChar(ch) { for (const v of Object.values(ch.variants)) if (v.canvas) release(v.canvas); }

/**
 * 캐릭터를 상자 (x,y,w,h px, @k) 에 비율 유지로. align: 'center' | 'bottom' | 'top'.
 * 픽셀은 fitSprite 정수배 nearest, 위치도 pt 정수라 @2x/@3x 격자가 같다.
 */
function drawChar(ctx, ch, key, box, k, { align = 'center', alpha = 1, pad = 0 } = {}) {
  const v = variant(ch, key);
  const px = box.w * pad / 2, py = box.h * pad / 2;
  const bw = box.w - px * 2, bh = box.h - py * 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (ch.pixel) {
    const sp = fitSprite(v.sprite, bw / k, bh / k, k, !ch.asSprite);
    const ox = Math.floor((bw / k - sp.width / k) / 2), oy = align === 'top' ? 0 : align === 'bottom' ? Math.floor(bh / k - sp.height / k) : Math.floor((bh / k - sp.height / k) / 2);
    const c = imgCanvas(sp);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c, Math.round(box.x + px) + ox * k, Math.round(box.y + py) + oy * k);
    release(c);
  } else {
    const im = v.img;
    if (!v.canvas) v.canvas = imgCanvas(im);
    const s = Math.min(bw / im.width, bh / im.height);
    const dw = im.width * s, dh = im.height * s;
    const dx = box.x + px + (bw - dw) / 2, dy = box.y + py + (align === 'top' ? 0 : align === 'bottom' ? bh - dh : (bh - dh) / 2);
    drawScaled(ctx, v.canvas, dx, dy, dw, dh);
  }
  ctx.restore();
}

// ---------- 코드 도형 ----------
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(ctx, cx, cy, r) {
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx, cy, cx + r, cy); ctx.quadraticCurveTo(cx, cy, cx, cy + r);
  ctx.quadraticCurveTo(cx, cy, cx - r, cy); ctx.quadraticCurveTo(cx, cy, cx, cy - r);
  ctx.closePath();
}

/** 탭 라인 아이콘 (38pt 상자 좌표). mode 'stroke' = 비선택, 'fill' = 배지 */
function drawIcon(ctx, kind, mode, color, lw = 2.2) {
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const paint = () => (mode === 'fill' ? ctx.fill() : ctx.stroke());
  const dots = (pts, r) => { ctx.beginPath(); for (const [x, y] of pts) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); } ctx.fill(); };
  ctx.beginPath();
  if (kind === 'friends') { // 사람
    ctx.moveTo(24.5, 12.5); ctx.arc(19, 12.5, 5.5, 0, Math.PI * 2);
    ctx.moveTo(8.5, 31); ctx.bezierCurveTo(8.5, 23.5, 13, 20.5, 19, 20.5); ctx.bezierCurveTo(25, 20.5, 29.5, 23.5, 29.5, 31); ctx.closePath();
    paint();
  } else if (kind === 'chats') { // 말풍선 (몸통+꼬리 한 윤곽)
    ctx.ellipse(19, 17, 13, 9.5, 0, 2.45, 1.95 + Math.PI * 2);
    ctx.lineTo(8, 31); ctx.closePath();
    paint();
    if (mode === 'stroke') dots([[13.5, 17], [19, 17], [24.5, 17]], 1.6);
  } else if (kind === 'now') { // 반짝이
    star(ctx, 17, 20, 11); star(ctx, 29, 9, 4.5);
    paint();
  } else if (kind === 'shopping') { // 쇼핑백
    rr(ctx, 9, 14, 20, 18, 3); paint();
    ctx.beginPath(); ctx.arc(19, 14, 5, Math.PI, 0); ctx.stroke();
  } else if (kind === 'call') { // 전화기
    rr(ctx, 11.5, 5, 15, 28, 4); paint();
    if (mode === 'stroke') { ctx.beginPath(); ctx.moveTo(16.5, 9.5); ctx.lineTo(21.5, 9.5); ctx.stroke(); dots([[19, 28.5]], 1.4); }
  } else if (kind === 'more') { // 점 3개
    dots([[10, 19], [19, 19], [28, 19]], 2.8);
  }
  ctx.restore();
}

/**
 * 코드 도형 캔버스 (w x h pt, @k). 픽셀 모드면 1pt=1px 로 그린 뒤 알파 이진화 + nearest k배 (기준 구현 chrome).
 * draw(ctx) 는 pt 좌표로 그린다.
 */
function chrome(wPt, hPt, k, pixel, draw) {
  if (!pixel) {
    const c = makeCanvas(Math.round(wPt * k), Math.round(hPt * k));
    const ctx = ctxOf(c); ctx.scale(k, k); draw(ctx);
    return c;
  }
  const small = makeCanvas(wPt, hPt);
  draw(ctxOf(small));
  const img = binarizeScale(canvasImg(small), k);
  release(small);
  return imgCanvas(img);
}

// 배경 무늬 (px 좌표). layers = patternLayers(bg) [[무늬, 투명도]], f = 크기 배율. skip = 구석 그림 자리 {x,y,w,h}
// (흩뿌린 무늬만 비움. 체크·격자는 끊기면 어색해서 그대로). m·기본 투명도 = 예전 프리셋 그림과 픽셀까지 같다.
// pc = background.patternColors (dots·cubes·hearts 가 돌려 씀, null = 팔레트). dark = 밤하늘 헤이즈 위 (눈 = 흰색)
// avoid = 눈을 그리지 않을 글자 자리 [{x,y,w,h}] (밤하늘 위 밝은 글자가 흰 눈에 묻히지 않게)
function pattern(ctx, layers, f, pal, x0, y0, x1, y1, skip, pc = null, dark = false, avoid = []) {
  if (!layers.length) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  if (skip && layers.every(([k]) => k !== 'check' && k !== 'grid' && k !== 'wobble-grid')) ctx.rect(skip.x - 20, skip.y - 20, skip.w + 40, skip.h + 40);
  ctx.clip('evenodd');
  const scatter = (step, draw) => { // 엇갈린 행으로 흩뿌리기
    let i = 0;
    for (let row = 0, y = y0 + step / 2; y < y1; y += step, row++) {
      for (let x = (row % 2 ? step / 2 : 0) + step / 4; x < x1; x += step) draw(x, y, i++);
    }
  };
  for (const [kind, alpha] of layers) {
    ctx.globalAlpha = alpha;
    if (kind === 'dots') { // 작은 둥근 사각 도트 3색 엇갈림
      const cols = pc || [pal.accent, pal.sendLine, pal.line], s = 12 * f;
      scatter(130 * f, (x, y, i) => { ctx.fillStyle = cols[i % cols.length]; ctx.beginPath(); rr(ctx, x - s, y - s, s * 2, s * 2, 6 * f); ctx.fill(); });
    } else if (kind === 'cubes') { // 3색 둥근 사각 (기본 = accent 색상환 3등분 L .74, 크기·간격은 도트와 같음)
      const [, C, H] = rgbToOklch(rgb(pal.accent)), cols = pc || [0, 120, 240].map(d => oklch(0.74, Math.max(C, 0.12), (H + d) % 360)), s = 12 * f;
      scatter(130 * f, (x, y, i) => { ctx.fillStyle = cols[i % cols.length]; ctx.beginPath(); rr(ctx, x - s, y - s, s * 2, s * 2, 6 * f); ctx.fill(); });
    } else if (kind === 'hearts') { // 작은 하트, accent / sendLine 번갈아
      const cols = pc || [pal.accent, pal.sendLine], s = 14 * f;
      scatter(140 * f, (x, y, i) => { ctx.fillStyle = cols[i % cols.length]; heart(ctx, x, y, s); });
    } else if (kind === 'sprinkle-hearts') { // 드문드문 작은 하트: 큰 칸마다 0~1개를 칸 안 아무 데나, 크기·기울기 조금씩 (시드 고정, 4색 돌려 씀)
      const cols = pc || [[250, 0.8], [0, 0.8], [140, 0.82], [95, 0.9]].map(([h, L]) => oklch(L, 0.09, h)), cell = 460 * f, rand = mulberry32(29);
      let i = 0;
      for (let y = y0; y < y1; y += cell) for (let x = 0; x < x1; x += cell) {
        const r = [rand(), rand(), rand(), rand(), rand()]; // 칸마다 5개씩 뽑는다 (빈 칸이어도 다음 칸 값이 밀리지 않게)
        if (r[0] < 0.4) continue;
        ctx.save(); ctx.translate(x + cell * (0.15 + 0.7 * r[1]), y + cell * (0.15 + 0.7 * r[2])); ctx.rotate((r[4] - 0.5) * 0.7);
        ctx.fillStyle = cols[i++ % cols.length]; heart(ctx, 0, 0, (12 + 7 * r[3]) * f);
        ctx.restore();
      }
    } else if (kind === 'snow') { // 크고 작은 눈: 150px 칸마다 눈점 2개(반경 3~8) + 30% 확률로 큰 눈송이(반경 14~26). 시드 고정, 칸마다 10개씩 뽑는다
      // 무늬 자리 경계에 걸치는 눈(반쪽 눈송이)과 avoid 글자 자리에 닿는 눈은 통째로 뺀다
      const cell = 150 * f, rand = mulberry32(41);
      const ok = (x, y, r) => x - r >= x0 && x + r <= x1 && y - r >= y0 && y + r <= y1 && avoid.every(a => x + r < a.x || x - r > a.x + a.w || y + r < a.y || y - r > a.y + a.h);
      ctx.fillStyle = ctx.strokeStyle = (pc && pc[0]) || (dark ? '#FFFFFF' : oklch(0.82, 0.05, 240));
      ctx.lineWidth = 3 * f; ctx.lineCap = 'round';
      for (let y = y0; y < y1; y += cell) for (let x = 0; x < x1; x += cell) {
        const r = Array.from({ length: 10 }, rand);
        for (const j of [0, 3]) { const cx = x + cell * r[j], cy = y + cell * r[j + 1], rad = (3 + 5 * r[j + 2]) * f; if (ok(cx, cy, rad)) { ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill(); } }
        if (r[6] < 0.3 && ok(x + cell * r[8], y + cell * r[9], (14 + 12 * r[7]) * f + 2 * f)) flake(ctx, x + cell * r[8], y + cell * r[9], (14 + 12 * r[7]) * f, r[7]);
      }
    } else if (kind === 'xmas-lights') { // 무늬 자리 맨 위에 늘어진 꼬마전구 줄: 375px 마다 70px 처지는 줄, 46px 간격 전구 + 흐린 빛 (빨강·초록·금색)
      // 상태 막대·다이내믹 아일랜드(위 BG.safeTop) 아래에서 시작 (잠금 배경처럼 무늬 자리가 0 부터일 때 시계에 안 겹치게)
      const span = 375 * f, sag = 70 * f, top = Math.max(y0, BG.safeTop) + 24 * f, cols = pc || [XMAS.red, XMAS.green, '#E8B33A'];
      const yAt = x => { const t = (((x - x0) % span) + span) % span / span; return top + sag * 4 * t * (1 - t); };
      ctx.strokeStyle = '#3E4A3A'; ctx.lineWidth = 3 * f; ctx.beginPath(); ctx.moveTo(x0, yAt(x0));
      for (let x = x0 + 5; x <= x1; x += 5) ctx.lineTo(x, yAt(x));
      ctx.stroke();
      for (let i = 0, x = x0 + 23 * f; x < x1; x += 46 * f, i++) {
        const y = yAt(x), c = cols[i % cols.length], g = ctx.createRadialGradient(x, y + 20 * f, 0, x, y + 20 * f, 34 * f);
        g.addColorStop(0, c + '66'); g.addColorStop(1, c + '00');
        ctx.fillStyle = g; ctx.fillRect(x - 34 * f, y - 14 * f, 68 * f, 68 * f);
        ctx.fillStyle = '#3E4A3A'; ctx.fillRect(x - 4 * f, y, 8 * f, 8 * f);
        ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y + 20 * f, 8 * f, 12 * f, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFFFFF99'; ctx.beginPath(); ctx.ellipse(x - 3 * f, y + 15 * f, 2.2 * f, 4 * f, 0, 0, Math.PI * 2); ctx.fill();
      }
    } else if (kind === 'wobble-grid') { // 손그림 격자: 선마다 이음점을 조금씩 흔들고 곡선으로 이음 (시드 고정)
      const step = 96 * f, seg = 90 * f, j = 2.6 * f, rand = mulberry32(17), d = () => (rand() - 0.5) * 2 * j;
      ctx.strokeStyle = pal.line; ctx.lineWidth = 2.6 * f; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let x = step / 2; x < x1; x += step) { const p = []; for (let y = y0 - seg; y < y1 + seg; y += seg) p.push([x + d(), y]); wobble(ctx, p); }
      for (let y = y0 + step / 2; y < y1; y += step) { const p = []; for (let x = x0 - seg; x < x1 + seg; x += seg) p.push([x, y + d()]); wobble(ctx, p); }
      ctx.stroke();
    } else if (kind === 'check') { // 연한 깅엄 체크
      ctx.fillStyle = pal.sendFill;
      const p = 120 * f, w = 60 * f;
      for (let x = 0; x < x1; x += p) ctx.fillRect(x, y0, w, y1 - y0);
      for (let y = y0; y < y1; y += p) ctx.fillRect(x0, y, x1 - x0, w);
    } else if (kind === 'grid') { // 픽셀 격자 선
      const step = 48 * f, lw = 3 * f;
      ctx.fillStyle = pal.line;
      for (let x = 0; x < x1; x += step) ctx.fillRect(x, y0, lw, y1 - y0);
      for (let y = y0; y < y1; y += step) ctx.fillRect(x0, y, x1 - x0, lw);
    } else if (kind === 'stars') { // 도트 별 (십자 5칸)
      const step = 48 * f, c = 6 * f;
      ctx.fillStyle = pal.accent;
      for (let row = 0, y = y0 + step * 2; y < y1; y += step * 4, row++) {
        for (let x = (row % 2 ? step * 2 : 0) + step * 2; x < x1; x += step * 4) {
          for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) ctx.fillRect(x + dx * c - c / 2 + c / 4, y + dy * c - c / 2 + c / 4, c, c);
        }
      }
    }
  }
  ctx.restore();
}

// 작은 하트 (가운데 x,y, 크기 s). hearts·sprinkle-hearts 같이 씀
function heart(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.6, y - s * 0.1, x - s * 0.6, y - s * 1.2, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.6, y - s * 1.2, x + s * 1.6, y - s * 0.1, x, y + s * 0.9);
  ctx.closePath(); ctx.fill();
}
// 눈송이 (가운데 x,y, 반경 r, t = 0..1 회전): 6갈래 + 갈래마다 V 가지. strokeStyle·lineWidth 는 부르는 쪽
function flake(ctx, x, y, r, t) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = t + i * Math.PI / 3, c = Math.cos(a), s = Math.sin(a), bx = x + c * r * 0.6, by = y + s * r * 0.6;
    ctx.moveTo(x, y); ctx.lineTo(x + c * r, y + s * r);
    for (const d of [-0.6, 0.6]) { ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a + d) * r * 0.32, by + Math.sin(a + d) * r * 0.32); }
  }
  ctx.stroke();
}
// 점들을 지나는 부드러운 선 (가운데점까지 2차 곡선). path 만 추가, stroke 는 부르는 쪽
function wobble(ctx, p) {
  ctx.moveTo(...p[0]);
  for (let i = 1; i < p.length - 1; i++) ctx.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2);
  ctx.lineTo(...p[p.length - 1]);
}

/**
 * 흐린 파스텔 무지개 + 구름 헤이즈 (W x H 전체). 큰 원형 그라데이션을 고정 자리에 겹쳐 강한 블러처럼 보이게, 그 위에 흐린 무지개 아치.
 * ctx.filter 는 iOS 사파리 캔버스에서 안 돼서 그라데이션만 쓴다 (결정적). 색은 저채도 고정 무지개 (팔레트와 무관).
 */
function haze(ctx, W, H, kind = 'rainbow') {
  const R = Math.max(W, H), blob = (fx, fy, fr, color, a) => {
    const x = fx * W, y = fy * H, g = ctx.createRadialGradient(x, y, 0, x, y, fr * R);
    g.addColorStop(0, color + Math.round(a * 255).toString(16).padStart(2, '0')); g.addColorStop(1, color + '00');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  };
  if (kind === 'snow-night') return snowNight(ctx, W, H, blob);
  if (kind === 'xmas-glow') return xmasGlow(ctx, W, H, blob);
  ctx.save();
  for (const [fx, fy, h] of [[0.1, 0.1, 25], [0.9, 0.28, 85], [0.15, 0.5, 150], [0.85, 0.7, 230], [0.3, 0.92, 300]]) blob(fx, fy, 0.5, oklch(0.9, 0.06, h), 0.6);
  // 무지개 아치: 오른쪽 밖에 중심을 둔 원형 그라데이션 고리 (띠 사이를 겹쳐 흐리게). 화면 밖은 잘려 아치로 보인다
  const cx = 1.05 * W, cy = 0.62 * H, r = 0.9 * W, g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  const band = (h, a) => oklch(0.88, 0.09, h) + Math.round(a * 255).toString(16).padStart(2, '0');
  [[0.52, 230, 0], [0.62, 230, 0.55], [0.72, 85, 0.6], [0.8, 150, 0.55], [0.89, 20, 0.5], [1, 20, 0]].forEach(([at, h, a]) => g.addColorStop(at, band(h, a)));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (const [fx, fy, fr] of [[0.55, 0.22, 0.28], [0.2, 0.68, 0.24], [0.8, 0.95, 0.26], [0.35, 0.8, 0.22]]) blob(fx, fy, fr, '#FFFFFF', 0.8); // 구름 (아치 발치를 덮는다)
  ctx.restore();
}

// 크리스마스 헤이즈 색. HAZE_TEXT_BG = 그 바탕의 대표 색 (글자 대비 계산용, palette.textOn). 밤하늘 달빛은 위 색에 흰색 18% 섞은 값
const NIGHT = { top: oklch(0.24, 0.06, 268), bottom: oklch(0.36, 0.07, 255), hillBack: oklch(0.44, 0.04, 250), hillFront: oklch(0.5, 0.035, 245) };
const GLOW = { base: '#FFF4E4', red: oklch(0.86, 0.07, 22), green: oklch(0.88, 0.06, 150), gold: oklch(0.92, 0.07, 85) };
const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase(); };
export const HAZE_TEXT_BG = { 'snow-night': [...Object.values(NIGHT), mix(NIGHT.top, '#FFFFFF', 0.18)], 'xmas-glow': Object.values(GLOW) };

/** 눈 오는 밤: 남색 그라데이션 + 오른쪽 위 달빛 + 아래 눈 언덕 두 겹 (뒤 언덕 왼쪽, 앞 언덕 오른쪽) */
function snowNight(ctx, W, H, blob) {
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, NIGHT.top); g.addColorStop(1, NIGHT.bottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  blob(0.82, 0.1, 0.35, '#FFFFFF', 0.18);
  for (const [fx, fy, rx, ry, c] of [[0.2, 1.03, 0.8, 0.13, NIGHT.hillBack], [0.9, 1.05, 0.85, 0.11, NIGHT.hillFront]]) {
    ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(fx * W, fy * H, rx * W, ry * H, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** 크리스마스 빛: 크림을 75% 덮고 흐린 빨강·초록·금색 큰 원 + 작은 보케 14개 (시드 53) */
function xmasGlow(ctx, W, H, blob) {
  ctx.save();
  ctx.globalAlpha = 0.75; ctx.fillStyle = GLOW.base; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  const cols = [GLOW.red, GLOW.green, GLOW.gold];
  [[0.12, 0.12, 0], [0.88, 0.32, 1], [0.18, 0.62, 2], [0.85, 0.82, 0], [0.4, 0.97, 1]].forEach(([fx, fy, c]) => blob(fx, fy, 0.42, cols[c], 0.5));
  const rand = mulberry32(53), k = W / 1125;
  for (let i = 0; i < 14; i++) { const fx = rand(), fy = rand(), r = (30 + 60 * rand()) * k / Math.max(W, H); blob(fx, fy, r, cols[i % 3], 0.45); }
  ctx.restore();
}

/**
 * 사진 배경: fit(cover|contain) 로 깔고, blur(pt) 는 축소 후 확대로, dim 은 배경색으로 덮어 글자 대비를 살린다
 * (글자가 진한 색이라 밝게 덮는다). auto 면 글자 자리 [y0,y1) 의 대비가 모자랄 때 dim 을 올린다 (autoDim). -> 실제 dim.
 * ponytail: ctx.filter 는 iOS 사파리 캔버스에서 안 돼서 축소-확대 블러. 더 고와야 하면 박스 블러 3회.
 */
function drawPhoto(ctx, img, W, H, { fit, blur, dim, auto }, color, pal, y0, y1) {
  const s = fit === 'cover' ? Math.max(W / img.width, H / img.height) : Math.min(W / img.width, H / img.height);
  const dw = img.width * s, dh = img.height * s, dx = (W - dw) / 2, dy = (H - dh) / 2;
  const src = imgCanvas(img);
  if (blur > 0) {
    const q = 1 + blur * 1.5, sw = Math.max(1, Math.round(W / q)), sh = Math.max(1, Math.round(H / q));
    const small = makeCanvas(sw, sh), sctx = ctxOf(small);
    sctx.fillStyle = color; sctx.fillRect(0, 0, sw, sh);
    drawScaled(sctx, src, dx / q, dy / q, dw / q, dh / q);
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, sw, sh, 0, 0, W, H); ctx.restore();
    release(small);
  } else { ctx.save(); drawScaled(ctx, src, dx, dy, dw, dh); ctx.restore(); }
  release(src);
  if (auto) dim = autoDim(ctx, W, y0, y1, dim, color, pal);
  if (dim > 0) { ctx.save(); ctx.globalAlpha = dim; ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  return dim;
}

export const AUTO_DIM_MAX = 0.85;
/**
 * 글자 대비 자동 보정: 글자 자리 [y0,y1) 를 48x96 으로 줄여 읽고, 배경색을 d 만큼 덮었을 때 칸의 90% 이상에서
 * text 4.5:1·muted 3:1 이 되는 가장 작은 d (사용자 dim 이상, 0.05 단위, 최대 AUTO_DIM_MAX). 배경색 자체가 어두우면 못 올리니 그대로 최대.
 * ponytail: 축소 평균이라 가는 무늬는 묻힌다. 더 엄격해야 하면 칸별 최솟값으로.
 */
function autoDim(ctx, W, y0, y1, dim, color, pal) {
  const sm = makeCanvas(48, 96), sx = ctxOf(sm);
  sx.drawImage(ctx.canvas, 0, y0, W, y1 - y0, 0, 0, 48, 96);
  const d = sx.getImageData(0, 0, 48, 96).data; release(sm);
  const bg = rgb(color), lt = lumRgb(rgb(pal.text)), lm = lumRgb(rgb(pal.muted));
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const ok = t => {
    let good = 0;
    for (let i = 0; i < d.length; i += 4) {
      const L = lumRgb([0, 1, 2].map(j => d[i + j] * (1 - t) + bg[j] * t));
      if (ratio(L, lt) >= 4.5 && ratio(L, lm) >= 3) good++;
    }
    return good >= 0.9 * d.length / 4;
  };
  for (let t = dim; t < AUTO_DIM_MAX + 1e-9; t = Math.round((t + 0.05) * 100) / 100) if (ok(t)) return t;
  return Math.max(dim, AUTO_DIM_MAX);
}

// ---------- 빌드 ----------
const TABS = [['friends', 'Friends'], ['chats', 'Chats'], ['now', 'Now'], ['shopping', 'Shopping'], ['call', 'Call'], ['more', 'More']];
const TAB_KEYS = TABS.map(t => t[0]);
const SIZE = Object.fromEntries(IMAGES.map(i => [i.name, i]));

export function normalizeOptions(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (!PRESETS[o.preset]) throw new Error(`unknown preset ${o.preset}`);
  if (!LAYOUTS.includes(o.layout)) throw new Error(`unknown layout ${o.layout}`);
  for (const [k, ok] of [['charSize', CHAR_SIZES], ['bubbleShape', SHAPES], ['outline', Object.keys(OUTLINES)],
    ['outlineColor', OUTLINE_COLORS], ['deco', DECOS], ['fillTone', Object.keys(FILL_TONES)], ['groupChar', GROUP_CHARS], ['peekPos', PEEK_POS],
    ['textTone', Object.keys(TEXT_TONES)], ['keypadTone', KEYPAD_TONES]]) {
    if (!ok.includes(o[k])) throw new Error(`unknown ${k} ${o[k]}`);
  }
  if (!GRIDS.includes(Number(o.grid))) throw new Error(`grid must be 32|48|64`);
  o.grid = Number(o.grid);
  o.slotsArePixel = !!o.slotsArePixel;
  o.hat = !!o.hat;
  // 서기: 받은 말풍선 친구 캐릭터가 채팅방 왼쪽 아래에 서므로 채팅방 구석 그림 기본값은 오른쪽 아래 (안 겹치게)
  const ob = o.background || {};
  o.background = resolveBackground(o.preset, o.layout === 'stand' && !(ob.corner && ob.corner.chat) ? { ...ob, corner: { ...ob.corner, chat: 'br' } } : o.background);
  themeId(o.id, false); // 형식 검사
  return o;
}

/**
 * 면 성향 (템플릿): white/cream 이면 보낸·받은 말풍선 면을 그 색으로 (사용자 색보다 우선).
 * pastel = 보낸 쪽은 그대로, 받은 쪽은 보낸 파스텔에서 색상환 120도 돌린 연한 파스텔 (외곽선 없는 포스트잇도 흰 배경에서 보이게)
 */
export function applyFillTone(pal, tone, keep = []) {
  const f = FILL_TONES[tone];
  if (!f) return pal;
  if (f === 'xmas') { // 보낸 = 따뜻한 빨강 파스텔, 받은 = 연초록. keep = 사용자가 직접 넣은 색 키 (그 키는 사용자 값)
    const send = oklch(0.87, 0.07, 22), recv = oklch(0.95, 0.045, 150);
    const x = { sendFill: send, sendSel: shiftL(send, -0.06), sendLine: oklch(0.64, 0.14, 22), recvFill: recv, recvSel: shiftL(recv, -0.06), recvLine: oklch(0.74, 0.08, 150) };
    for (const k of keep) delete x[k];
    return { ...pal, ...x };
  }
  if (f === 'pastel') {
    const [, C, H] = rgbToOklch(rgb(pal.sendFill)), recv = oklch(0.93, Math.min(Math.max(C, 0.04), 0.05), (H + 120) % 360);
    return { ...pal, recvFill: recv, recvSel: shiftL(recv, -0.06) };
  }
  const sel = shiftL(f, -0.06);
  return { ...pal, sendFill: f, sendSel: sel, recvFill: f, recvSel: sel };
}

/** 글자 색 (템플릿): mono 면 본문·보조 글자를 무채색으로 (사용자 색보다 우선). 선택 배경·보내기 버튼은 css.js 가 meta.textTone 으로 */
export const applyTextTone = (pal, tone) => (TEXT_TONES[tone] ? { ...pal, ...TEXT_TONES[tone] } : pal);

// 레이아웃별 캐릭터 그림 변형: 올라앉기·걸치기 = 가로 크롭, 빼꼼 = 위 65%, 서기 = 전신
const VARIANT = { perch: 'perch', hang: 'perch', peek: 'peek', stand: 'full' };

const isImg = v => v && v.width > 0 && v.height > 0 && v.data && v.data.length === v.width * v.height * 4;
/**
 * assets 검사 (SPEC 2절). 모르는 이름·깨진 그림은 바로 오류 (오타가 조용히 무시되지 않게). 빈 자리(null/undefined)는 기본 그림.
 * recvBubble = 내부용 (buildCouple 상대 폰: 받은 쪽 말풍선 그림)
 */
export function checkAssets(assets) {
  const a = assets || {};
  const img = (v, what) => { if (v != null && !isImg(v)) throw new Error(`asset ${what}: not an Img {width,height,data}`); return v || null; };
  const map = (v, keys, what) => {
    v = v || {};
    for (const k of Object.keys(v)) if (!keys.includes(k)) throw new Error(`unknown ${what} slot ${k}`);
    return Object.fromEntries(keys.map(k => [k, img(v[k], `${what}.${k}`)]));
  };
  for (const k of Object.keys(a)) if (!['bgMain', 'bgChat', 'bgPasscode', 'slots', 'recvBubble'].includes(k)) throw new Error(`unknown asset ${k}`);
  const s = a.slots || {};
  // ...All = 일괄 (모든 탭 / 잠금 4칸 같은 그림). 칸마다 넣은 그림이 있으면 그게 이긴다
  const SLOT_KEYS = ['profile', 'icon', 'tabSelected', 'tabNormal', 'passcodeSelected', 'passcodeNormal', 'passcodeArt', 'cornerMain', 'cornerChat', 'bubble',
    'tabSelectedAll', 'tabNormalAll', 'passcodeAll'];
  for (const k of Object.keys(s)) if (!SLOT_KEYS.includes(k)) throw new Error(`unknown slot ${k}`);
  const four = (k, all) => {
    const v = s[k] == null ? [] : s[k];
    if (!Array.isArray(v) || v.length > 4) throw new Error(`slot ${k} must be [s1, s2, s3, s4]`);
    return [0, 1, 2, 3].map(i => img(v[i], `${k}[${i}]`) || all);
  };
  const pAll = map(s.passcodeAll, ['normal', 'selected'], 'passcodeAll');
  const tabs = (k, all) => Object.fromEntries(Object.entries(map(s[k], TAB_KEYS, k)).map(([t, v]) => [t, v || all]));
  const BL = LAYOUTS.filter(l => l !== 'none');
  return {
    bgMain: img(a.bgMain, 'bgMain'), bgChat: img(a.bgChat, 'bgChat'), bgPasscode: img(a.bgPasscode, 'bgPasscode'),
    recvBubble: map(a.recvBubble, BL, 'recvBubble'),
    slots: {
      profile: img(s.profile, 'profile'), icon: img(s.icon, 'icon'),
      tabSelected: tabs('tabSelected', img(s.tabSelectedAll, 'tabSelectedAll')), tabNormal: tabs('tabNormal', img(s.tabNormalAll, 'tabNormalAll')),
      passcodeSelected: four('passcodeSelected', pAll.selected), passcodeNormal: four('passcodeNormal', pAll.normal),
      passcodeArt: img(s.passcodeArt, 'passcodeArt'), cornerMain: img(s.cornerMain, 'cornerMain'), cornerChat: img(s.cornerChat, 'cornerChat'),
      bubble: map(s.bubble, BL, 'bubble'),
    },
  };
}

/**
 * 테마 1개: { files: Map<path, Blob>, css, meta }. charA = 보낸 쪽(내) 캐릭터, charB = 받은 쪽 (없으면 A).
 * assets (선택) = 배경 사진 + slot 그림 (SPEC 2절). slot 이 빈 자리는 예전 그대로 캐릭터로 그린다.
 */
export async function buildTheme(charA, charB, opts, assets) {
  const o = normalizeOptions(opts);
  const as = checkAssets(assets), sl = as.slots, bgo = o.background;
  const base = o.colors ? { ...derive(charA), ...o.colors } : derive(charA);
  // 키패드 = 캐릭터 대표색 (면 성향 적용 전 파스텔). charKeypad = 내부용: buildCouple 이 xmas 면을 미리 칠하기 전 값
  if (o.keypadTone === 'char') base.keypad = o.charKeypad || base.sendFill;
  const pal = applyTextTone(applyFillTone(base, o.fillTone, o.colors ? Object.keys(o.colors) : []), o.textTone);
  pal.profileBg = pal.profileBg || shiftL(pal.bg, -0.035);
  const bgColor = bgo.color || pal.bg;
  // 배경 결과 보고 (UI 안내용): 실제 dim (자동 보정 후), 경고 'text-on-bg' = 고른 배경색 위 글자 대비 4.5 미만
  const bgMeta = { dim: {}, warnings: [] };
  if (bgo.color && contrast(bgColor, pal.text) < 4.5) bgMeta.warnings.push('text-on-bg');
  // 헤이즈 위 글자 (친구탭·잠금, 사진 없을 때): 크리스마스 헤이즈면 그 바탕과 대비 맞춘 글자색 (밤하늘 = 밝게). css.js 가 그 화면 줄만 바꾼다
  const bgText = {};
  for (const [w, photo] of [['main', as.bgMain], ['passcode', as.bgPasscode]]) {
    const hz = HAZE_TEXT_BG[bgo.haze[w]];
    if (hz && !photo) bgText[w] = { ...textOn(hz, pal), bg: bgo.haze[w] === 'snow-night' ? NIGHT.bottom : null };
  }
  // 산타모자 (hat): 캐릭터·slot 그림 전부 머리 위에. 이미 도트인 slot 그림은 알파 0/255 로
  const hat = (im, binary = false) => (o.hat ? santaHat(im, { binary }) : im);
  const A = makeChar(hat(charA), o.pixelChar, o.grid);
  const B = charB ? makeChar(hat(charB), o.pixelChar, o.grid) : A;
  // slot 그림: 알파 bbox 로 자른 뒤 캐릭터와 같은 경로 (pixelChar 면 pixelize, slotsArePixel 이면 그대로 정수배)
  const arts = [];
  const art = im => {
    if (!im) return null;
    const ch = makeChar(hat(cropToAlpha(im), o.slotsArePixel), o.pixelChar || o.slotsArePixel, o.grid, o.slotsArePixel);
    arts.push(ch);
    return ch;
  };
  const files = new Map();
  const images = new Map();
  const save = async (name, c) => {
    const s = SIZE[name];
    if (!s) throw new Error(`not in spec: ${name}`);
    if (!name.startsWith('chatroomBubble') && (c.width !== s.w || c.height !== s.h)) throw new Error(`size ${name}: ${c.width}x${c.height} != ${s.w}x${s.h}`);
    images.set(name, await canvasToBlob(c));
  };

  try {
    // 테마 아이콘 162: 꽉 채운 사각 (모서리 굽히지 않음)
    {
      const c = makeCanvas(162, 162), ctx = ctxOf(c, o.pixelChar);
      ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, 162, 162);
      drawChar(ctx, art(sl.icon) || A, 'full', { x: 6, y: 8, w: 150, h: 150 }, 1);
      await save('commonIcoTheme.png', c);
    }
    const tabSel = Object.fromEntries(TAB_KEYS.map(t => [t, art(sl.tabSelected[t])]));
    const tabNor = Object.fromEntries(TAB_KEYS.map(t => [t, art(sl.tabNormal[t])]));
    const bubSend = art(sl.bubble[o.layout]);
    const bubRecv = charB ? art(as.recvBubble[o.layout]) : bubSend;
    for (const k of [2, 3]) {
      // 탭 바 배경 + 위 1pt 헤어라인
      {
        const s = SIZE[`maintabBgImage@${k}x.png`], c = makeCanvas(s.w, s.h), ctx = ctxOf(c);
        ctx.fillStyle = pal.tabBg; ctx.fillRect(0, 0, s.w, s.h);
        ctx.globalAlpha = 0.5; ctx.fillStyle = pal.line; ctx.fillRect(0, 0, s.w, k);
        await save(`maintabBgImage@${k}x.png`, c);
      }
      const tabArt = ch => { // slot 그림 하나를 38pt 탭 칸에 (배지 없음)
        const c = makeCanvas(38 * k, 38 * k);
        drawChar(ctxOf(c, ch.pixel), ch, 'full', { x: 0, y: 0, w: 38 * k, h: 38 * k }, k, { pad: ch.pixel ? 0 : 0.04 });
        return c;
      };
      for (const [kind, nm] of TABS) {
        await save(`maintabIco${nm}@${k}x.png`, tabNor[kind] ? tabArt(tabNor[kind])
          : chrome(38, 38, k, o.pixelChar, ctx => drawIcon(ctx, kind, 'stroke', pal.muted)));
        if (tabSel[kind]) { await save(`maintabIco${nm}Selected@${k}x.png`, tabArt(tabSel[kind])); continue; }
        const c = makeCanvas(38 * k, 38 * k), ctx = ctxOf(c, o.pixelChar);
        drawChar(ctx, A, 'full', { x: 0, y: 0, w: 38 * k, h: 38 * k }, k, { pad: o.pixelChar ? 0 : 0.04 });
        const badge = chrome(38, 38, k, o.pixelChar, x => {
          x.translate(23, 23); x.scale(0.38, 0.38);
          drawIcon(x, kind, 'stroke', pal.bg, 9); drawIcon(x, kind, 'fill', pal.accent, 9);
          drawIcon(x, kind, 'stroke', pal.accent, 3);
        });
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(badge, 0, 0); release(badge);
        await save(`maintabIco${nm}Selected@${k}x.png`, c);
      }
      for (const alias of ['Piccoma', 'Local']) for (const suf of ['', 'Selected']) {
        images.set(`maintabIco${alias}${suf}@${k}x.png`, images.get(`maintabIcoNow${suf}@${k}x.png`));
      }
      // 말풍선 8종. slot 말풍선 그림이 있으면 그 레이아웃 자리에 (빼꼼 slot 은 이미 빼꼼 그림이라 자르지 않음)
      for (const side of ['send', 'receive']) {
        const slot = side === 'send' ? bubSend : bubRecv;
        const ch = slot || (side === 'send' ? A : B);
        const key = slot && o.layout === 'peek' ? 'full' : VARIANT[o.layout];
        for (const [n, group] of [['01', false], ['02', true]]) {
          const b = bubbleSpec(o.layout, o.pixelBubble, group, o);
          // 02 는 groupChar 빼꼼일 때만 캐릭터 (작게, 01 과 같은 그림). 빼꼼 slot 은 이미 빼꼼 그림, 나머지는 빼꼼으로 잘라서
          const lay = group ? (b.box ? 'peek' : 'none') : o.layout;
          const gch = ch;
          const gkey = group ? (slot && o.layout === 'peek' ? 'full' : 'peek') : key;
          for (const sel of [false, true]) {
            const img = bubbleImage(b, { tail: !group, selected: sel, side, k, pixel: o.pixelBubble, outline: o.outline, outlineColor: o.outlineColor, deco: group ? 'none' : o.deco }, pal);
            const box = charBox(lay, side, b);
            let c;
            if (!box) c = imgCanvas(img);
            else if (gch.pixel) { // 픽셀 캐릭터는 순수 합성 (격자 그대로)
              c = imgCanvas(layerChar(img, fitSprite(variant(gch, gkey).sprite, box.w, box.h, k, !gch.asSprite), box, lay, k));
            } else {
              const pxBox = { x: box.x * k, y: box.y * k, w: box.w * k, h: box.h * k };
              if (lay === 'peek') { // 캐릭터 먼저, 몸통을 그 위에 (받은 쪽도 그림은 반전 안 함)
                c = makeCanvas(img.width, img.height);
                const ctx = ctxOf(c);
                drawChar(ctx, gch, gkey, pxBox, k, { align: 'bottom' });
                const bc = imgCanvas(img);
                ctx.drawImage(bc, 0, 0); release(bc);
              } else {
                c = imgCanvas(img);
                drawChar(ctxOf(c), gch, gkey, pxBox, k, { align: 'bottom' });
              }
            }
            await save(`chatroomBubble${side === 'send' ? 'Send' : 'Receive'}${n}${sel ? 'Selected' : ''}@${k}x.png`, c);
          }
        }
      }
      // 친구 추가 버튼: sendFill 알약 + 사람+플러스
      await save(`findBtnAddFriend@${k}x.png`, chrome(42, 34, k, o.pixelChar, ctx => {
        ctx.fillStyle = pal.sendFill; ctx.beginPath(); rr(ctx, 0, 0, 42, 34, 17); ctx.fill();
        ctx.fillStyle = pal.text;
        ctx.beginPath(); ctx.arc(16, 12.5, 4.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(8.5, 25.5); ctx.bezierCurveTo(8.5, 20, 12, 18, 16, 18); ctx.bezierCurveTo(20, 18, 23.5, 20, 23.5, 25.5); ctx.closePath(); ctx.fill();
        ctx.fillRect(26, 15.6, 8, 2.8); ctx.fillRect(28.6, 13, 2.8, 8);
      }));
    }

    // 배경 (@3x 만): 배경색 + (사진 | 무늬) + 구석 그림. 사진이면 헤더 330px 에 배경색 70% 띠 (아래 60px 페이드).
    // @3x 하나뿐인 그림은 격자를 맞출 짝이 없어 픽셀 캐릭터도 1칸 = c px (k=1) 로 크게 둔다
    const layers = patternLayers(bgo), pf = PATTERN_SIZES[bgo.patternSize];
    for (const [name, which, photo, slot] of [['mainBgImage@3x.png', 'main', as.bgMain, sl.cornerMain], ['chatroomBgImage@3x.png', 'chat', as.bgChat, sl.cornerChat]]) {
      const spec = BG[which], box = cornerBox(which, bgo.corner);
      const c = makeCanvas(spec.w, spec.h), ctx = ctxOf(c, o.pixelChar);
      ctx.fillStyle = bgColor; ctx.fillRect(0, 0, spec.w, spec.h);
      if (!photo && bgo.haze[which] !== 'none') haze(ctx, spec.w, spec.h, bgo.haze[which]);
      if (photo) {
        bgMeta.dim[which] = drawPhoto(ctx, photo, spec.w, spec.h, bgo.photo[which], bgColor, pal, BG.header, spec.h);
        const a = Math.round(BG.headerBand * 255).toString(16).padStart(2, '0'), g = ctx.createLinearGradient(0, BG.header, 0, BG.header + BG.headerFade);
        g.addColorStop(0, bgColor + a); g.addColorStop(1, bgColor + '00');
        ctx.save(); ctx.globalAlpha = BG.headerBand; ctx.fillStyle = bgColor; ctx.fillRect(0, 0, spec.w, BG.header); ctx.restore();
        ctx.fillStyle = g; ctx.fillRect(0, BG.header, spec.w, BG.headerFade);
      } else if (bgo.patternArea[which] === 'full') pattern(ctx, layers, pf, pal, 0, BG.header, spec.w, spec.h, box, bgo.patternColors, bgo.haze[which] === 'snow-night', bgo.haze[which] === 'snow-night' ? BG.nightText[which] : []);
      else if (bgo.patternArea[which] === 'top') pattern(ctx, layers, pf, pal, 0, BG.topBand[0], spec.w, BG.topBand[1], null, bgo.patternColors, bgo.haze[which] === 'snow-night', bgo.haze[which] === 'snow-night' ? BG.nightText[which] : []);
      if (box) {
        drawChar(ctx, art(slot) || A, 'full', box, 1, { align: box.align, alpha: box.alpha });
      }
      await save(name, c);
    }
    {
      const P = BG.passcode, c = makeCanvas(P.w, P.h), ctx = ctxOf(c, o.pixelChar);
      ctx.fillStyle = bgColor; ctx.fillRect(0, 0, P.w, P.h);
      if (!as.bgPasscode && bgo.haze.passcode !== 'none') haze(ctx, P.w, P.h, bgo.haze.passcode);
      if (as.bgPasscode) bgMeta.dim.passcode = drawPhoto(ctx, as.bgPasscode, P.w, P.h, bgo.photo.passcode, bgColor, pal, 0, P.patternEnd);
      else if (bgo.patternArea.passcode === 'full') pattern(ctx, layers, pf, pal, 0, 0, P.w, P.patternEnd, null, bgo.patternColors, bgo.haze.passcode === 'snow-night', bgo.haze.passcode === 'snow-night' ? BG.nightText.passcode : []);
      // 맨 아래 300px 는 키패드 색으로 (이음매 없음, 사진 위에서도)
      const g = ctx.createLinearGradient(0, P.gradStart, 0, P.h);
      g.addColorStop(0, pal.keypad + '00'); g.addColorStop(1, pal.keypad);
      ctx.fillStyle = g; ctx.fillRect(0, P.gradStart, P.w, P.h - P.gradStart);
      drawChar(ctx, art(sl.passcodeArt) || A, 'full', P.char, 1, { align: 'bottom' });
      await save('passcodeBgImage@3x.png', c);
    }
    // 기본 프로필 360: bg 보다 살짝 진한 틴트 + 캐릭터 (또는 profile slot)
    {
      const ch = art(sl.profile) || A;
      const c = makeCanvas(360, 360), ctx = ctxOf(c, ch.pixel);
      ctx.fillStyle = pal.profileBg; ctx.fillRect(0, 0, 360, 360);
      drawChar(ctx, ch, 'full', { x: 15, y: 24, w: 330, h: 330 }, 1, { align: 'bottom' });
      await save('profileImg01@3x.png', c);
    }
    // 잠금 비밀번호 점 132: accent 링 / Selected 1~3 빼꼼, 4 전신+반짝이 (자리별 slot 이 있으면 그 그림)
    {
      const bullet = await canvasToBlob(chrome(44, 44, 3, o.pixelChar, ctx => {
        ctx.strokeStyle = pal.accent; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(22, 22, 7, 0, Math.PI * 2); ctx.stroke();
      }));
      let peekBlob = null;
      const peek = async () => peekBlob || (peekBlob = await canvasToBlob((() => { const c = makeCanvas(132, 132); drawChar(ctxOf(c, o.pixelChar), A, 'peek', { x: 0, y: 0, w: 132, h: 132 }, 1, { align: 'bottom', pad: 0.04 }); return c; })()));
      const burst = async () => {
        const c = makeCanvas(132, 132), bctx = ctxOf(c, o.pixelChar);
        drawChar(bctx, A, 'full', { x: 6, y: 10, w: 120, h: 120 }, 1, { align: 'bottom' });
        const sparks = chrome(44, 44, 3, o.pixelChar, ctx => { ctx.fillStyle = pal.accent; ctx.beginPath(); star(ctx, 38, 6, 5); star(ctx, 6, 12, 3.5); ctx.fill(); });
        bctx.imageSmoothingEnabled = false; bctx.drawImage(sparks, 0, 0); release(sparks);
        return canvasToBlob(c);
      };
      const slot132 = ch => { const c = makeCanvas(132, 132); drawChar(ctxOf(c, ch.pixel), ch, 'full', { x: 0, y: 0, w: 132, h: 132 }, 1, { pad: 0.02 }); return canvasToBlob(c); };
      for (let i = 1; i <= 4; i++) {
        const nch = art(sl.passcodeNormal[i - 1]);
        images.set(`passcodeImgCode0${i}@3x.png`, nch ? await slot132(nch) : bullet);
        const ch = art(sl.passcodeSelected[i - 1]);
        images.set(`passcodeImgCode0${i}Selected@3x.png`, ch ? await slot132(ch) : i === 4 ? await burst() : await peek());
      }
    }
    // 키패드 눌림 180: sendFill 원 (알파 0.9). 키패드가 캐릭터 색(= sendFill)이면 흰 원
    await save('passcodeKeypadPressed@3x.png', chrome(60, 60, 3, o.pixelChar, ctx => {
      ctx.globalAlpha = 0.9; ctx.fillStyle = o.keypadTone === 'char' ? '#FFFFFF' : pal.sendFill; ctx.beginPath(); ctx.arc(30, 30, 26, 0, Math.PI * 2); ctx.fill();
    }));
  } finally {
    freeChar(A); if (B !== A) freeChar(B);
    arts.forEach(freeChar);
  }

  for (const s of IMAGES) if (!images.has(s.name)) throw new Error(`missing ${s.name}`);
  const meta = {
    bubbles: { '01': bubbleSpec(o.layout, o.pixelBubble, false, o), '02': bubbleSpec(o.layout, o.pixelBubble, true, o) },
    palette: pal,
    textTone: o.textTone,
    background: bgMeta,
    bgText,
    themeId: themeId(o.id),
    themeName: themeName(o.name),
  };
  const css = buildCss(meta);
  files.set('KakaoTalkTheme.css', new Blob([css], { type: 'text/css' }));
  for (const s of IMAGES) files.set(`Images/${s.name}`, images.get(s.name));
  return { files, css, meta };
}

/** 커플 상대 폰용 ID: 각 자리 15-n (원본과 항상 다름) */
export const partnerId = id => id.replace(/./g, c => (15 - parseInt(c, 16)).toString(16));

const fileBase = name => (String(name || '').replace(/[\\/:*?"<>|'\n\r\u2014]/g, '').trim().slice(0, 40) || 'tokku-theme');

/**
 * 커플 세트: [내 폰용(A가 보낸 쪽), 상대 폰용(B가 보낸 쪽)]. 색은 둘이 같게 (A 기준 또는 opts.colors).
 * assets 의 배경 사진은 두 폰 같이, slot 그림은 A 의 그림이라 상대 폰에서는 받은 쪽 말풍선(A 자리)에만 쓴다.
 */
export async function buildCouple(charA, charB, opts, assets) {
  const o = normalizeOptions(opts);
  const as = checkAssets(assets);
  // 색은 두 폰 같게: A 에서 파생 (+ 크리스마스 면 성향을 여기서 미리, 직접 넣은 색이 이김)
  const d = derive(charA), colors = { ...(o.fillTone === 'xmas' ? applyFillTone(d, 'xmas') : d), ...(o.colors || {}) };
  // keypadTone char: 단일 빌드처럼 xmas 면 전 sendFill (미리 칠한 빨강 파스텔이 키패드로 가지 않게)
  if (o.keypadTone === 'char') o.charKeypad = { ...d, ...(o.colors || {}) }.sendFill;
  const base = fileBase(o.name);
  const a = await buildTheme(charA, charB, { ...o, colors }, assets);
  const blobA = await packTheme(a.files);
  const b = await buildTheme(charB, charA, { ...o, colors, id: partnerId(o.id) },
    { bgMain: as.bgMain, bgChat: as.bgChat, bgPasscode: as.bgPasscode, recvBubble: as.slots.bubble });
  const blobB = await packTheme(b.files);
  return [{ name: `${base}-나.ktheme`, blob: blobA }, { name: `${base}-상대.ktheme`, blob: blobB }];
}

/** 단일 테마 파일 이름 */
export const themeFileName = opts => fileBase(opts && opts.name) + '.ktheme';
