// 엔진 단위 테스트 (SPEC 6절). node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { IMAGES } from '../public/engine/spec.js';
import { LAYOUTS, CHAR_SIZES, SHAPES, OUTLINES, DECOS, TEMPLATES, DEFAULTS, BUBBLES, bubbleGeometry, bubbleSpec, charBox, decoBox, checkInvariants, checkBubble, PEEK_CROP } from '../public/engine/presets.js';
import { derive, contrast, rgbToOklch, rgb } from '../public/engine/palette.js';
import { pixelize, fitSprite, scaleNearest, binarizeScale } from '../public/engine/pixelize.js';
import { removeEdgeBackground, prepareCharacter, transparentRatio } from '../public/engine/keying.js';
import { bubbleImage, pixelBubbleCells, stretchProfiles, capFor, composite, bubbleRules, layerChar } from '../public/engine/bubble.js';
import { normalizeOptions, applyFillTone } from '../public/engine/render.js';
import { buildCss, themeId, themeName } from '../public/engine/css.js';
import { packTheme } from '../public/engine/pack.js';
import * as api from '../public/engine/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- 테스트 그림 ----------
function makeImg(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(fn(x, y), (y * w + x) * 4);
  return { width: w, height: h, data };
}
// 투명 바탕 위 그라데이션 원 + 검은 눈 + 부드러운 가장자리
const blob = (w = 200, h = 160, hue = [230, 120, 160]) => makeImg(w, h, (x, y) => {
  const d = Math.hypot((x - w / 2) / (w * 0.45), (y - h / 2) / (h * 0.45));
  if (d > 1) return [0, 0, 0, 0];
  if (Math.hypot(x - w * 0.38, y - h * 0.45) < 6 || Math.hypot(x - w * 0.62, y - h * 0.45) < 6) return [20, 15, 18, 255];
  const t = y / h;
  return [hue[0] * (1 - t * 0.3), hue[1] + t * 40, hue[2], d > 0.95 ? 140 : 255];
});
const colorsOf = img => { const s = new Set(); for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]) s.add(img.data.slice(i, i + 3).join()); return s; };
const alphasOf = img => { const s = new Set(); for (let i = 3; i < img.data.length; i += 4) s.add(img.data[i]); return s; };

const PAL = derive(blob());

// ---------- spec ----------
// 공식 샘플 그림(카카오 캐릭터)은 저장소에 없다. 이름·크기 목록(tests/fixtures/ref-images.json, gen-spec 이 만든 것)과 맞춰 본다.
// 관리자 PC 에 ref/Images 가 있으면 그 실제 파일과도 맞춰 본다.
test('spec: 66 images, names and sizes equal the official sample manifest (and ref/Images IHDR if present)', () => {
  const man = JSON.parse(readFileSync(join(ROOT, 'tests', 'fixtures', 'ref-images.json'), 'utf8'));
  assert.equal(IMAGES.length, 66);
  assert.deepEqual(IMAGES, man);
  const dir = join(ROOT, 'ref', 'Images');
  if (!existsSync(dir)) return;
  assert.deepEqual(IMAGES.map(i => i.name), readdirSync(dir).filter(f => f.endsWith('.png')).sort());
  for (const i of IMAGES) {
    const b = readFileSync(join(dir, i.name));
    assert.deepEqual([i.w, i.h], [b.readUInt32BE(16), b.readUInt32BE(20)], i.name);
  }
});

// ---------- pixelize ----------
test('pixelize: alpha 0/255 only, colors <= K+2, long side = grid (+1 cell outline each side)', () => {
  for (const grid of [32, 48, 64]) for (const colors of [8, 16]) {
    const sp = pixelize(blob(300, 200), grid, { colors });
    assert.equal(Math.max(sp.width, sp.height), grid + 2);
    assert.deepEqual([...alphasOf(sp)].sort((a, b) => a - b), [0, 255]);
    assert.ok(colorsOf(sp).size <= colors + 2, `colors ${colorsOf(sp).size} > ${colors + 2}`);
  }
});

test('pixelize: outline is the darkest palette color and the eyes (dark lines) survive', () => {
  const sp = pixelize(blob(300, 200), 48);
  const lum = c => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  // 맨 윗줄 첫 불투명 칸 = 외곽선
  let edge = null;
  for (let i = 0; i < sp.data.length && !edge; i += 4) if (sp.data[i + 3]) edge = [...sp.data.slice(i, i + 3)];
  const darkest = Math.min(...[...colorsOf(sp)].map(s => lum(s.split(',').map(Number))));
  assert.equal(lum(edge), darkest);
  assert.ok(darkest < 60, 'dark eye color kept in palette');
});

test('pixelize placement: integer multiple nearest, same cell grid at @2x and @3x', () => {
  const sp = pixelize(blob(), 32);
  for (const [bw, bh] of [[40, 26], [24, 24], [38, 38], [107, 107]]) {
    const a = fitSprite(sp, bw, bh, 2), b = fitSprite(sp, bw, bh, 3);
    assert.equal(a.width / 2, b.width / 3);
    assert.equal(a.height / 2, b.height / 3);
    assert.ok(a.width / 2 <= bw && a.height / 2 <= bh, `fits ${bw}x${bh}`);
    // 격자 정확성: @3x 를 칸(3px) 단위로 줄였다 늘리면 그대로
    const cells = scaleNearest(b, b.width / 3, b.height / 3);
    assert.deepEqual(scaleNearest(cells, b.width, b.height).data, b.data);
  }
  const bin = binarizeScale(blob(20, 20), 3);
  assert.ok([...alphasOf(bin)].every(a => a === 0 || a === 255));
});

// ---------- presets ----------
const OUTS = Object.keys(OUTLINES);
const pickB = ({ W, H, X, Y, top, ins }) => ({ W, H, X, Y, top, ins });
// 모든 layout x charSize x shape x pixel x group 의 말풍선 규격 (pixel 이면 shape 무시라도 다 돈다)
function* allSpecs() {
  for (const layout of LAYOUTS) for (const charSize of CHAR_SIZES) for (const bubbleShape of SHAPES)
    for (const pixel of [false, true]) for (const group of [false, true]) {
      const o = { charSize, bubbleShape };
      yield { layout, pixel, group, o, b: bubbleSpec(layout, pixel, group, o), tag: `${layout}/${charSize}/${bubbleShape} pixel=${pixel} group=${group}` };
    }
}

test('presets: invariants hold for every layout x charSize x shape x pixel x group x outline', () => {
  let n = 0;
  for (const { layout, pixel, group, o, tag } of allSpecs()) for (const outline of OUTS) {
    assert.deepEqual(checkInvariants(layout, pixel, group, { ...o, outline }), [], `${tag} ${outline}`);
    n++;
  }
  assert.equal(n, LAYOUTS.length * CHAR_SIZES.length * SHAPES.length * 2 * 2 * OUTS.length);
});

test('presets: table values (SPEC 3) and receive cap X = W - X - 1, insets mirrored', () => {
  assert.deepEqual(pickB(bubbleSpec('none', false, false)), { W: 40, H: 35, X: 17, Y: 17, top: 0, ins: [10, 11, 7, 17] });
  assert.deepEqual(pickB(bubbleSpec('perch', true, true)), { W: 40, H: 36, X: 16, Y: 16, top: 0, ins: [10, 12, 8, 18] });
  // stand 02 = 01 과 같은 폭, 캐릭터 자리만큼 오른쪽(받은 쪽 왼쪽) 투명 띠
  assert.deepEqual(pickB(bubbleSpec('stand', true, true)), { W: 72, H: 36, X: 16, Y: 16, top: 0, ins: [10, 12, 8, 50] });
  assert.deepEqual(pickB(bubbleSpec('perch', true, false)), { W: 64, H: 58, X: 44, Y: 32, top: 16, ins: [28, 33, 10, 19] });
  assert.deepEqual(pickB(bubbleSpec('stand', false, false)), { W: 72, H: 80, X: 14, Y: 60, top: 44, ins: [54, 11, 8, 49] });
  // bubbleGeometry: perch/m/round = 기존 표, none 은 크기·모양과 상관없이 기존 표
  assert.deepEqual(pickB(bubbleGeometry('perch', 'm', 'round', false)), { W: 64, H: 58, X: 44, Y: 32, top: 16, ins: [28, 33, 10, 19] });
  assert.deepEqual(bubbleGeometry('perch', 'm', 'round', false).box, { x: 2, y: 0, w: 40, h: 26 });
  assert.deepEqual(bubbleGeometry('stand', 'm', 'round', false).box, { x: 36, y: 0, w: 36, h: 36 });
  for (const cs of CHAR_SIZES) for (const sh of SHAPES) {
    assert.deepEqual(pickB(bubbleGeometry('none', cs, sh, false)), BUBBLES.round);
    assert.deepEqual(pickB(bubbleGeometry('none', cs, sh, true)), BUBBLES.pixel);
  }
  assert.equal(bubbleGeometry('none', 'm', 'round').r, 12);
  assert.equal(bubbleGeometry('perch', 'm', 'round').r, 10);
  assert.equal(bubbleGeometry('perch', 'm', 'soft').r, 6);
  assert.equal(bubbleGeometry('perch', 'm', 'square').r, 2);
  // 크기가 바뀌면 규격도 바뀜 (s < m < l)
  for (const layout of LAYOUTS.filter(l => l !== 'none')) {
    const [s, m, l] = CHAR_SIZES.map(cs => bubbleGeometry(layout, cs));
    assert.ok(s.box.w < m.box.w && m.box.w < l.box.w && s.H < m.H && m.H < l.H, layout);
  }
  for (const { b, group, pixel } of allSpecs()) {
    const c = capFor(b, 'receive');
    assert.equal(c.X, b.W - b.X - 1);
    assert.deepEqual(c.ins, [b.ins[0], b.ins[3], b.ins[2], b.ins[1]]);
    if (group) assert.equal(b.box, null);
    if (group) assert.equal(b.deco, null);
    if (pixel) assert.ok(b.W % 2 === 0 && b.H % 2 === 0 && b.top % 2 === 0);
  }
  assert.deepEqual(charBox('perch', 'receive', BUBBLES.perch), null, 'table rows carry no box');
  assert.deepEqual(charBox('perch', 'receive', bubbleGeometry('perch')), { x: 64 - 2 - 40, y: 0, w: 40, h: 26 });
  assert.throws(() => bubbleGeometry('perch', 'xl'));
  assert.throws(() => bubbleGeometry('perch', 'm', 'blob'));
  assert.throws(() => bubbleGeometry('sit'));
});

test('presets: checker catches a broken preset', () => {
  const b = bubbleGeometry('perch');
  assert.deepEqual(checkBubble(b, false), []);
  assert.ok(checkBubble({ ...b, X: 42 }, false).some(e => e.includes('char')), 'char touches column');
  assert.ok(checkBubble({ ...b, Y: b.top + 10 }, false).some(e => e.includes('row')), 'corner/tail touches row');
  assert.ok(checkBubble({ ...b, ins: [b.ins[0], b.ins[1] - 4, b.ins[2], b.ins[3]] }, false).some(e => e.includes('left+right')));
  assert.ok(checkBubble({ ...b, ins: [10, b.ins[1], b.ins[2], b.ins[3]] }, false).some(e => e.includes('text area overlaps character')));
  assert.ok(checkBubble({ ...b, deco: { x: b.X - 2, y: 2, s: 8 } }, false).some(e => e.includes('deco')));
});

test('deco: slot sits in a top cap (never touches stretch column/row, never in text, opposite the character)', () => {
  for (const { b, group, layout, tag } of allSpecs()) {
    if (group) continue;
    for (const side of ['send', 'receive']) {
      const d = decoBox(side, b), { X, Y, ins: [t, l, bo, r] } = capFor(b, side);
      assert.ok(d, tag);
      assert.ok(d.x + d.s <= X - 1 || d.x >= X + 2, `${tag} ${side}: deco x ${d.x}..${d.x + d.s} vs column ${X}`);
      assert.ok(d.y + d.s <= Y - 1, `${tag} ${side}: deco below row`);
      assert.ok(d.x >= 0 && d.y >= 0 && d.x + d.s <= b.W, `${tag} ${side}: deco in image`);
      assert.ok(d.y + d.s <= t || d.x + d.s <= l || d.x >= b.W - r, `${tag} ${side}: deco in text area`);
      const c = charBox(layout, side, b);
      if (c) assert.ok(d.x + d.s <= c.x || d.x >= c.x + c.w || d.y + d.s <= c.y || d.y >= c.y + c.h, `${tag} ${side}: deco on character`);
    }
  }
});

// ---------- 말풍선 래스터 (기준 구현 verify 와 같은 늘이는 점 검사) ----------
test('bubbles: stretch column X and row Y uniform with character + deco on, every layout x size x shape x pixel x group x side x outline x k', () => {
  const sprite = pixelize(blob(), 48);
  const peekSprite = { ...sprite, ...centerTop(sprite) };
  const seen = new Set();
  let i = 0;
  for (const { layout, pixel, group, o, b, tag: t0 } of allSpecs()) {
    for (const side of ['send', 'receive']) for (const outline of OUTS) for (const k of [2, 3]) {
      const deco = group ? 'none' : DECOS[1 + (i++ % 4)];
      const outlineColor = i % 2 ? 'dark' : 'auto';
      const key = JSON.stringify([b, pixel, group, side, outline, k, deco, outlineColor, group ? '' : layout]);
      if (seen.has(key)) continue; // 같은 그림 (02, pixel 의 shape) 은 한 번만
      seen.add(key);
      const selected = i % 3 === 0;
      let img = bubbleImage(b, { tail: !group, selected, side, k, pixel, outline, outlineColor, deco }, PAL);
      assert.equal(img.width, b.W * k); assert.equal(img.height, b.H * k);
      const box = !group && charBox(layout, side, b);
      if (box) img = layerChar(img, fitSprite(layout === 'peek' ? peekSprite : sprite, box.w, box.h, k), box, layout, k);
      const { X, Y } = capFor(b, side);
      const tag = `${t0} ${side} ${outline} ${deco} sel=${selected} @${k}x`;
      assert.deepEqual(stretchProfiles(img, X, Y, k), { cols: 1, rows: 1 }, tag);
      if (pixel && !box) assert.ok([...alphasOf(img)].every(a => a === 0 || a === 255), `soft alpha ${tag}`);
    }
  }
  assert.ok(seen.size > 500, `rendered ${seen.size}`);
});
function centerTop(sp) { const h = Math.max(1, Math.round(sp.height * PEEK_CROP)), d = sp.data.slice(0, sp.width * h * 4); return { height: h, data: d }; }

test('layering: perch/hang in front, peek behind the body (only the top shows), hang paws reach over the border with no hidden band', () => {
  const k = 3, solid = makeImg(30, 30, () => [0, 0, 255, 255]);
  const blue = (img, x, y) => { const o = (Math.round(y * k) * img.width + Math.round(x * k)) * 4; return img.data[o] === 0 && img.data[o + 1] === 0 && img.data[o + 2] === 255; };
  for (const layout of ['perch', 'peek', 'hang']) {
    const b = bubbleSpec(layout, false, false), box = charBox(layout, 'send', b);
    const sp = scaleNearest(solid, box.w * k, box.h * k);
    const img = layerChar(bubbleImage(b, { tail: true, selected: false, side: 'send', k, pixel: false }, PAL), sp, box, layout, k);
    const cx = box.x + box.w / 2;
    assert.ok(blue(img, cx, b.top / 2), `${layout}: part above the body shows`);
    const mid = (b.top + 2 + box.y + box.h) / 2; // 몸통 윗변 아래, 상자 바닥 위
    assert.equal(blue(img, cx, mid), layout !== 'peek', `${layout}: middle in front?`);
    assert.equal(blue(img, cx, box.y + box.h - 0.5), layout !== 'peek', `${layout}: bottom strip in front?`);
  }
  // 걸치기: 모든 크기·모양에서 상자 위부터 바닥까지 캐릭터가 끊기지 않음 (테두리에 가려 앞발이 떨어져 보이는 띠 없음), 앞발은 몸통 위로 18% 안팎
  for (const charSize of CHAR_SIZES) for (const pixel of [false, true]) for (const outline of OUTS) {
    const b = bubbleSpec('hang', pixel, false, { charSize }), box = charBox('hang', 'send', b);
    const img = layerChar(bubbleImage(b, { tail: true, selected: false, side: 'send', k, pixel, outline, outlineColor: 'dark' }, PAL), scaleNearest(solid, box.w * k, box.h * k), box, 'hang', k);
    const gap = []; for (let py = 0; py < box.h * k; py++) if (!blue(img, box.x + box.w / 2, py / k)) gap.push(py);
    assert.deepEqual(gap, [], `hang ${charSize} ${pixel ? 'pixel' : 'round'} ${outline}: hidden rows`);
    const over = (box.y + box.h - b.top) / box.h;
    assert.ok(over >= 0.12 && over <= 0.25, `hang ${charSize}: paws over ${over}`);
  }
  // 받은 쪽: 상자만 옮겨지고 그림은 안 뒤집힌다 (왼쪽 절반만 빨강인 그림)
  const half = makeImg(20, 20, x => (x < 10 ? [255, 0, 0, 255] : [0, 255, 0, 255]));
  const b = bubbleSpec('peek', false, false), box = charBox('peek', 'receive', b);
  const sp = scaleNearest(half, box.w * k, box.h * k);
  const img = layerChar(bubbleImage(b, { tail: true, selected: false, side: 'receive', k, pixel: false }, PAL), sp, box, 'peek', k);
  const at = x => img.data[(1 * img.width + Math.round(x * k)) * 4];
  assert.equal(at(box.x + 1), 255); assert.equal(at(box.x + box.w - 1), 0);
});

test('stand: follow-up (02) bubble body starts at the same x as the first (01) bubble body, both sides', () => {
  for (const charSize of CHAR_SIZES) for (const pixel of [false, true]) for (const k of [2, 3]) {
    const o = { charSize }, b1 = bubbleSpec('stand', pixel, false, o), b2 = bubbleSpec('stand', pixel, true, o), tag = `${charSize} ${pixel ? 'pixel' : 'round'} @${k}x`;
    assert.equal(b2.W, b1.W, tag);
    assert.equal(capFor(b2, 'receive').ins[1], capFor(b1, 'receive').ins[1], `${tag}: text starts at the same x`);
    for (const side of ['receive', 'send']) {
      const edge = b => { // 늘이는 행에서 첫 불투명 픽셀 x (받은 쪽 왼쪽 끝) / 마지막 (보낸 쪽 오른쪽 끝)
        const img = bubbleImage(b, { tail: false, selected: false, side, k, pixel }, PAL), y = b.Y * k, xs = []; // 늘이는 행 = 몸통 곧은 변
        for (let x = 0; x < img.width; x++) if (img.data[(y * img.width + x) * 4 + 3] > 128) xs.push(x);
        return side === 'receive' ? xs[0] : xs.at(-1);
      };
      assert.equal(edge(b2), edge(b1), `${tag} ${side}`);
    }
  }
});

test('stand (프사 옆 꼬마): reference layout. 받은 쪽 = 캐릭터 왼쪽 위, 몸통 아래 오른쪽, 꼬리가 캐릭터 쪽으로; 보낸 쪽 = 거울', () => {
  const H = { s: 28, m: 36, l: 46 };
  for (const charSize of CHAR_SIZES) for (const pixel of [false, true]) for (const outline of OUTS) {
    const b = bubbleSpec('stand', pixel, false, { charSize }), tag = `stand ${charSize} ${pixel ? 'pixel' : 'round'} ${outline}`;
    assert.equal(b.box.h, H[charSize], `${tag}: character height (프사 크기 정도)`);
    const r = charBox('stand', 'receive', b), s = charBox('stand', 'send', b);
    assert.deepEqual([r.x, r.y], [0, 0], `${tag}: receive character at top left (프사 바로 옆)`);
    assert.deepEqual([s.x + s.w, s.y], [b.W, 0], `${tag}: send character at top right outside`);
    assert.ok(b.box.y + b.box.h <= b.top - 2, `${tag}: character stands above the body`);
    assert.ok(b.W - b.bx >= r.x + r.w, `${tag}: receive body starts right of the character`);
    // 그림으로: 받은 쪽에서 몸통 윗변 위, 몸통 왼쪽 끝 언저리에 꼬리 픽셀이 있다 (캐릭터 발밑을 향해 위·왼쪽)
    const k = 3, img = bubbleImage(b, { tail: true, selected: false, side: 'receive', k, pixel, outline, outlineColor: 'dark' }, PAL);
    const x0 = b.W - b.bx, opaque = (x, y) => img.data[((y * img.width) + x) * 4 + 3] > 200;
    let up = 0, left = 0;
    for (let y = (b.top - 6) * k; y < b.top * k; y++) for (let x = (x0 - 8) * k; x < (x0 + 12) * k; x++) if (opaque(x, y)) { up++; if (x < x0 * k) left++; }
    assert.ok(up > 0 && left > 0, `${tag}: tail rises up-left toward the character (${up}, ${left})`);
    for (let y = 0; y < (b.box.h) * k; y++) for (let x = 0; x < img.width; x++) assert.ok(!opaque(x, y), `${tag}: nothing but the character above the tail`);
  }
  assert.equal(TEMPLATES.find(t => t.id === 'near-profile').opts.charSize, 'l');
});

test('no trial mode (무료 정식 품질 하나뿐): plain id and name, no trial option', () => {
  assert.ok(!('trial' in DEFAULTS));
  assert.equal(themeId('a1b2c3d4e5f6'), 'com.kakao.talk.theme.tokkua1b2c3d4e5f6');
  assert.equal(themeName('나의 테마'), '나의 테마');
});

test('outline: thin < normal < thick (round line px), pixel thick = 2 cells, dark = palette.text', () => {
  const b = bubbleSpec('none', false, false), k = 3;
  const lineRun = img => { // 가운데 행, 왼쪽에서 면 색이 나올 때까지 불투명 픽셀 수
    const y = b.Y * k, F = rgb(PAL.sendFill).join();
    let n = 0;
    for (let x = 0; x < img.width; x++) { const o = (y * img.width + x) * 4; if (!img.data[o + 3]) continue; if (img.data.slice(o, o + 3).join() === F) break; n++; }
    return n;
  };
  const runs = OUTS.map(outline => lineRun(bubbleImage(b, { tail: true, selected: false, side: 'send', k, pixel: false, outline }, PAL)));
  assert.ok(runs[0] < runs[1] && runs[1] < runs[2], `runs ${runs}`);
  const dark = bubbleImage(b, { tail: true, selected: false, side: 'send', k, pixel: false, outlineColor: 'dark' }, PAL);
  assert.ok(colorsOf(dark).has(rgb(PAL.text).join()));
  const pb = bubbleSpec('none', true, false);
  const cellRun = outline => { const c = pixelBubbleCells(pb, { tail: true, selected: false, side: 'send', outline }, PAL); const y = 9, T = rgb(PAL.text).join(); let n = 0; for (let x = 0; x < c.width; x++) if (c.data.slice((y * c.width + x) * 4, (y * c.width + x) * 4 + 3).join() === T) n++; else if (n) break; return n; };
  assert.equal(cellRun('normal'), 1); assert.equal(cellRun('thick'), 2);
});

test('fillTone + templates: every template normalizes, passes invariants and renders all 8 bubbles', () => {
  assert.equal(applyFillTone(PAL, 'palette'), PAL);
  assert.equal(applyFillTone(PAL, 'white').sendFill, '#FFFFFF');
  assert.equal(applyFillTone(PAL, 'white').recvFill, '#FFFFFF');
  assert.ok(contrast(PAL.text, applyFillTone(PAL, 'cream').sendFill) >= 4.5);
  assert.ok(TEMPLATES.length >= 8);
  const ids = TEMPLATES.map(t => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['near-profile', 'peek-sparkle', 'hang', 'perch', 'pixel-dot', 'simple']) assert.ok(ids.includes(id), id);
  const want = { 'near-profile': { layout: 'stand', charSize: 'l', fillTone: 'white', outline: 'thick', outlineColor: 'dark' },
    'peek-sparkle': { layout: 'peek', fillTone: 'cream', outline: 'normal', outlineColor: 'dark', deco: 'sparkle' },
    hang: { layout: 'hang' }, perch: { layout: 'perch' }, 'pixel-dot': { pixelChar: true, pixelBubble: true }, simple: { layout: 'none' } };
  for (const [id, w] of Object.entries(want)) for (const [k, v] of Object.entries(w)) assert.equal(TEMPLATES.find(t => t.id === id).opts[k], v, `${id}.${k}`);
  const sprite = pixelize(blob(), 32);
  for (const t of TEMPLATES) {
    assert.ok(t.name && t.desc && !/\u2014/.test(t.name + t.desc), t.id);
    assert.ok(!('colors' in t.opts) && !('preset' in t.opts), `${t.id}: no forced colors`);
    assert.ok(t.thumb === `templates/${t.id}.png` && existsSync(join(ROOT, 'public', t.thumb)), `${t.id}: thumb (node tests/gen-thumbs.mjs)`);
    const o = normalizeOptions({ ...DEFAULTS, ...t.opts, id: 'a1b2c3d4e5f6' });
    const pal = applyFillTone(PAL, o.fillTone);
    for (const group of [false, true]) {
      assert.deepEqual(checkInvariants(o.layout, o.pixelBubble, group, o), [], t.id);
      const b = bubbleSpec(o.layout, o.pixelBubble, group, o);
      for (const side of ['send', 'receive']) for (const k of [2, 3]) {
        let img = bubbleImage(b, { tail: !group, selected: false, side, k, pixel: o.pixelBubble, outline: o.outline, outlineColor: o.outlineColor, deco: group ? 'none' : o.deco }, pal);
        const box = !group && charBox(o.layout, side, b);
        if (box) img = layerChar(img, fitSprite(sprite, box.w, box.h, k), box, o.layout, k);
        const { X, Y } = capFor(b, side);
        assert.deepEqual(stretchProfiles(img, X, Y, k), { cols: 1, rows: 1 }, `${t.id} ${side} group=${group} @${k}x`);
      }
    }
    const css = buildCss({ bubbles: { '01': bubbleSpec(o.layout, o.pixelBubble, false, o), '02': bubbleSpec(o.layout, o.pixelBubble, true, o) }, palette: pal, themeId: themeId(o.id, false), themeName: themeName(t.name, false) });
    assert.match(css, /MessageCellStyle-Send/);
  }
  assert.throws(() => normalizeOptions({ layout: 'peek', deco: 'flower' }));
  assert.throws(() => normalizeOptions({ charSize: 'xl' }));
  assert.throws(() => normalizeOptions({ fillTone: 'pink' }));
  assert.doesNotThrow(() => normalizeOptions({ name: 'old project without new keys', layout: 'stand' }));
});

test('pixel bubble: 2pt cells, outline = text color, shadow = palette.shadow', () => {
  const b = bubbleSpec('none', true, false);
  const cells = pixelBubbleCells(b, { tail: true, selected: false, side: 'send' }, PAL);
  assert.deepEqual([cells.width, cells.height], [20, 18]);
  const cs = colorsOf(cells);
  assert.ok(cs.has(rgb(PAL.text).join()) && cs.has(rgb(PAL.shadow).join()) && cs.has(rgb(PAL.sendFill).join()));
});

// ---------- palette ----------
test('palette: WCAG text 4.5 / accent 4.5 / muted 3 / recvLine 1.8, bg light, deterministic', () => {
  const hues = [[230, 120, 160], [60, 110, 230], [250, 210, 40], [40, 160, 70], [120, 120, 120], [30, 30, 30], [250, 250, 250], [200, 40, 30]];
  for (const h of hues) {
    const p = derive(blob(200, 160, h));
    for (const k of ['bg', 'tabBg', 'line', 'text', 'muted', 'accent', 'sendFill', 'sendSel', 'sendLine', 'recvFill', 'recvSel', 'recvLine', 'keypad', 'shadow']) assert.match(p[k], /^#[0-9A-F]{6}$/, k);
    const tag = h.join();
    assert.ok(contrast(p.text, p.bg) >= 4.5, `text/bg ${tag}`);
    assert.ok(contrast(p.text, p.sendFill) >= 4.5, `text/sendFill ${tag}`);
    assert.ok(contrast(p.text, p.recvFill) >= 4.5, `text/recvFill ${tag}`);
    assert.ok(contrast(p.accent, p.bg) >= 4.5, `accent/bg ${tag}`);
    assert.ok(contrast(p.muted, p.bg) >= 3, `muted/bg ${tag}`);
    assert.ok(contrast(p.recvLine, p.bg) >= 1.8, `recvLine/bg ${tag}`);
    assert.ok(rgbToOklch(rgb(p.bg))[0] >= 0.96, `bg L ${tag}`);
    assert.equal(p.recvFill, '#FFFFFF');
    assert.deepEqual(derive(blob(200, 160, h)), p);
  }
  // 완전 투명 그림도 터지지 않음
  assert.match(derive(makeImg(10, 10, () => [0, 0, 0, 0])).bg, /^#/);
});

// ---------- keying ----------
test('keying: removes only edge-connected background, keeps same color inside, alpha 0/255', () => {
  // 흰 바탕, 가운데 빨간 사각, 그 안에 흰 구멍 (가장자리와 안 이어짐)
  const img = makeImg(60, 60, (x, y) => {
    const inRed = x >= 15 && x < 45 && y >= 15 && y < 45, hole = x >= 25 && x < 35 && y >= 25 && y < 35;
    return inRed && !hole ? [220, 30, 40, 255] : [250 + (x % 3) - 1, 250, 250, 255];
  });
  const out = removeEdgeBackground(img, 24);
  const a = (x, y) => out.data[(y * 60 + x) * 4 + 3];
  assert.equal(a(0, 0), 0); assert.equal(a(59, 30), 0); assert.equal(a(14, 30), 0);
  assert.equal(a(20, 20), 255); // 빨강
  assert.equal(a(30, 30), 255); // 안쪽 흰 구멍 보존
  assert.ok([...alphasOf(out)].every(v => v === 0 || v === 255));
  assert.deepEqual(img.data.slice(0, 4), new Uint8ClampedArray([249, 250, 250, 255]), 'input untouched');
});

test('keying: already-transparent PNG (>= 5%) is skipped; prepareCharacter crops to bbox', () => {
  const t = blob(100, 80);
  assert.ok(transparentRatio(t) >= 0.05);
  assert.deepEqual(removeEdgeBackground(t, 24).data, t.data);
  const pc = prepareCharacter(t);
  assert.ok(pc.width <= 92 && pc.height <= 74 && pc.width > 80);
  // 불투명 사진: 배경이 지워지고 bbox 로 잘림
  const photo = makeImg(80, 80, (x, y) => (Math.hypot(x - 40, y - 40) < 20 ? [30, 90, 200, 255] : [240, 240, 235, 255]));
  const pp = prepareCharacter(photo, { tolerance: 24 });
  assert.ok(pp.width <= 41 && pp.height <= 41);
  // 큰 사진은 긴 변 1024 이하로
  const big = prepareCharacter(makeImg(1500, 300, () => [10, 10, 10, 255]));
  assert.ok(Math.max(big.width, big.height) <= 1024);
});

test('keying: similar-color subject with a gap in its outline keeps its interior (noisy light background)', () => {
  // 밝은 베이지 바탕(세로 그라데이션 + 잡음) 위 비슷한 색 타원, 진한 윤곽에 폭 36px 틈
  let seed = 1; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const noise = () => (rnd() + rnd() + rnd() + rnd() + rnd() + rnd() - 3) * 4.2; // 시그마 약 3
  const W = 300, inside = (x, y) => Math.hypot((x - 150) / 90, (y - 150) / 114);
  const img = makeImg(W, W, (x, y) => {
    const e = inside(x, y), g = y / W * 14;
    const c = e < 0.96 ? [214, 196, 176] : e < 1.04 && Math.abs(x - 240) >= 18 ? [120, 90, 70] : [228 - g, 218 - g, 206 - g];
    return [...c.map(v => v + noise()), 255];
  });
  for (const tol of [24, 32, 40]) {
    const out = removeEdgeBackground(img, tol);
    let inKept = 0, inAll = 0, bgClear = 0, bgAll = 0;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const e = inside(x, y), a = out.data[(y * W + x) * 4 + 3];
      if (e < 0.9) { inAll++; if (a) inKept++; } else if (e > 1.1) { bgAll++; if (!a) bgClear++; }
    }
    assert.ok(inKept / inAll > 0.99, `tol ${tol}: interior kept ${(inKept / inAll * 100).toFixed(1)}%`);
    if (tol >= 32) assert.ok(bgClear / bgAll > 0.95, `tol ${tol}: background cleared ${(bgClear / bgAll * 100).toFixed(1)}%`);
  }
});

test('keying: real photo (light fur on beige) keeps the body at every slider value', () => {
  // tests/fixtures/jelly-photo-512.rgb.gz = assets-src/jelly-photo.jpg 를 342x512 로 줄인 RGB (앞 4바이트 = 폭, 높이 u16le)
  const buf = gunzipSync(readFileSync(join(ROOT, 'tests', 'fixtures', 'jelly-photo-512.rgb.gz')));
  const w = buf.readUInt16LE(0), h = buf.readUInt16LE(2);
  const img = makeImg(w, h, (x, y) => { const i = 4 + (y * w + x) * 3; return [buf[i], buf[i + 1], buf[i + 2], 255]; });
  // 머리, 가슴, 배, 앞다리 둘, 뒷다리, 옆구리, 정수리 (9x9 상자 전부 불투명이어야)
  const body = [[165, 240], [170, 345], [180, 380], [150, 420], [200, 420], [230, 410], [140, 300], [165, 200]];
  for (let tol = 0; tol <= 40; tol += 8) {
    const out = removeEdgeBackground(img, tol);
    let clear = 0; for (let i = 3; i < out.data.length; i += 4) if (!out.data[i]) clear++;
    if (tol >= 16) assert.ok(clear / (w * h) > 0.8 && clear / (w * h) < 0.86, `tol ${tol}: cleared ${(clear / (w * h) * 100).toFixed(1)}%`);
    for (const [x, y] of body) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++)
      assert.equal(out.data[((y + dy) * w + x + dx) * 4 + 3], 255, `tol ${tol}: body hole at ${x + dx},${y + dy}`);
  }
});

// ---------- CSS ----------
const metaFor = (layout, pixel) => ({
  bubbles: { '01': bubbleSpec(layout, pixel, false), '02': bubbleSpec(layout, pixel, true) },
  palette: PAL, themeId: themeId('a1b2c3d4e5f6'), themeName: themeName("나의 '테마'"),
});

test('css: tokens filled, manifest, id format, every referenced image exists', () => {
  const css = buildCss(metaFor('perch', true));
  assert.ok(!css.includes('{{'));
  assert.ok(!css.includes('\u2014'));
  assert.match(css, /-kakaotalk-theme-id: 'com\.kakao\.talk\.theme\.tokku[0-9a-f]{12}';/);
  assert.match(css, /-kakaotalk-theme-name: '나의 테마';/);
  assert.match(css, /-kakaotalk-theme-version: '26\.8\.0';/);
  assert.match(css, /-kakaotalk-theme-url: 'https:\/\/tokku-kit\.vercel\.app';/);
  assert.match(css, /-kakaotalk-author-name: 'Tokku Kit';/);
  const names = new Set(IMAGES.map(i => i.name.replace(/@\dx\.png$|\.png$/, '')));
  for (const [, n] of css.matchAll(/'([A-Za-z0-9]+)\.png'/g)) assert.ok(names.has(n), n);
  assert.throws(() => themeId('xyz', false));
  assert.equal(themeId('a1b2c3d4e5f6', false), 'com.kakao.talk.theme.tokkua1b2c3d4e5f6');
});

// 기준 구현(파이썬) 산출물이 옆 폴더에 있는 관리자 PC 에서만 돈다
test('css: bubble cap/insets equal the reference implementation dist (same presets)', (t) => {
  const dist = process.env.TOKKU_REF_DIST; // 기준 구현 산출물 폴더 (없으면 건너뜀)
  if (!existsSync(dist)) return t.skip('reference dist not found');
  const grab = css => [...css.matchAll(/'chatroomBubble\w+\.png' \d+px \d+px|-ios-(?:group-)?title-edgeinsets: [\dpx ]+/g)].map(m => m[0]).join('\n');
  for (const slug of ['ir0', 'ip0', 'ir1', 'ip1', 'pr0', 'pp0', 'pr1', 'pp1']) {
    const f = join(dist, slug, 'KakaoTalkTheme.css');
    if (!existsSync(f)) continue;
    const ours = buildCss(metaFor(slug[2] === '1' ? 'perch' : 'none', slug[1] === 'p'));
    assert.equal(grab(ours), grab(readFileSync(f, 'utf8')), slug);
  }
});

test('bubbleRules: 9-slice border-image per mockup rule', () => {
  const r = bubbleRules(metaFor('perch', false), { Send01: 'blob:x' });
  assert.match(r, /\.s \.b\{min-width:64px;min-height:58px;.*border-width:28px 19px 10px 33px;border-image-source:url\("blob:x"\);border-image-slice:96 57 75 132 fill;border-image-width:32px 19px 25px 44px;/);
  assert.match(r, /\.r \.b\{.*border-image-source:var\(--tk-Receive01\);border-image-slice:96 132 75 57 fill;/);
});

// ---------- pack ----------
function fakeZip() {
  const log = { files: [], gen: null };
  class Z { file(p, d, o) { log.files.push([p, o]); } async generateAsync(o) { log.gen = o; return { blob: true, type: o.mimeType }; } }
  return { Z, log };
}

test('pack: STORE for every entry, top level = KakaoTalkTheme.css + Images/, octet-stream', async () => {
  const { Z, log } = fakeZip();
  const files = new Map([['KakaoTalkTheme.css', 'x'], ...IMAGES.map(i => [`Images/${i.name}`, 'p'])]);
  const out = await packTheme(files, Z);
  assert.equal(out.type, 'application/octet-stream');
  assert.equal(log.gen.compression, 'STORE');
  assert.equal(log.files.length, 68);
  assert.deepEqual(log.files[0], ['Images/', { dir: true, compression: 'STORE', date: new Date(Date.UTC(2026, 0, 1)) }]);
  for (const [p, o] of log.files) {
    assert.equal(o.compression, 'STORE');
    assert.equal(+o.date, Date.UTC(2026, 0, 1), `${p}: fixed date (same input = same zip)`);
    assert.ok(p === 'KakaoTalkTheme.css' || p === 'Images/' || /^Images\/[^/]+\.png$/.test(p), p);
  }
  for (const bad of ['.DS_Store', '__MACOSX/a.png', 'Images/sub/a.png', 'theme/KakaoTalkTheme.css']) {
    await assert.rejects(packTheme(new Map([['KakaoTalkTheme.css', 'x'], [bad, 'y']]), Z), bad);
  }
  await assert.rejects(packTheme(new Map([['Images/a.png', 'y']]), Z));
  // ponytail: 실제 JSZip 바이트(STORE 플래그, 디렉터리 엔트리)는 tests/e2e.mjs + verify_ktheme.py 가 검사
});

test('index re-exports the SPEC 2 API', () => {
  for (const k of ['DEFAULTS', 'TEMPLATES', 'bubbleGeometry', 'prepareCharacter', 'pixelize', 'buildTheme', 'packTheme', 'buildCouple', 'bubbleRules', 'makeCanvas']) assert.equal(typeof api[k] === 'undefined', false, k);
  assert.equal(typeof api.palette.derive, 'function');
  assert.equal(typeof api.keying.removeEdgeBackground, 'function');
  assert.deepEqual(api.DEFAULTS.layout, 'perch');
  assert.deepEqual([api.DEFAULTS.charSize, api.DEFAULTS.bubbleShape, api.DEFAULTS.outline, api.DEFAULTS.outlineColor, api.DEFAULTS.deco, api.DEFAULTS.fillTone], ['m', 'round', 'normal', 'auto', 'none', 'palette']);
  assert.deepEqual(api.LAYOUTS, ['none', 'perch', 'peek', 'hang', 'stand']);
  assert.equal(api.partnerId('a1b2c3d4e5f6').length, 12);
  assert.notEqual(api.partnerId('a1b2c3d4e5f6'), 'a1b2c3d4e5f6');
});

// ---------- 렌더 (헤드리스 chromium, tests/.pw 의 playwright@1.48.2). 캔버스가 필요한 buildTheme 검사 ----------
// 없으면 건너뜀 (node tests/e2e.mjs 가 한 번 설치해 둔다). 창은 절대 안 띄움.
// 회귀 기준: tests/fixtures/render-golden.json = 배경·slot 추가 전 엔진으로 만든 66장 픽셀 해시.
// 다시 만들기: TOKKU_PUBLIC=<옛 public 폴더> UPDATE_GOLDEN=1 node --test tests/
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { after } from 'node:test';

const PUB = process.env.TOKKU_PUBLIC || join(ROOT, 'public');
const GOLDEN = join(ROOT, 'tests', 'fixtures', 'render-golden.json');
let browserP = null, server = null;
async function page() {
  if (!browserP) browserP = (async () => {
    let pw;
    try { pw = createRequire(join(ROOT, 'tests', '.pw', 'package.json'))('playwright'); } catch { return null; }
    const types = { '.js': 'text/javascript', '.png': 'image/png', '.html': 'text/html' };
    server = createServer((req, res) => {
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/') { res.setHeader('content-type', 'text/html'); return res.end('<!doctype html><meta charset="utf-8">'); }
      const f = join(PUB, p);
      if (!f.startsWith(PUB) || !existsSync(f)) { res.statusCode = 404; return res.end(); }
      res.setHeader('content-type', types[f.slice(f.lastIndexOf('.'))] || 'application/octet-stream');
      res.end(readFileSync(f));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    let browser;
    try { browser = await pw.chromium.launch({ headless: true }); } catch { server.close(); return null; }
    const pg = await browser.newPage();
    await pg.goto(`http://127.0.0.1:${server.address().port}/`);
    await pg.evaluate(async () => {
      const E = window.E = await import('/engine/index.js');
      const load = async n => E.prepareCharacter(await E.decodeImage(await (await fetch(`/demo/${n}.png`)).blob()), {});
      window.CH = { jelly: await load('jelly'), hotteok: await load('hotteok') };
      const cv = new OffscreenCanvas(1, 1), cx = cv.getContext('2d', { willReadFrequently: true });
      // 파일 -> RGBA (png) / 바이트 (css)
      window.px = async blob => {
        const bm = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        cv.width = bm.width; cv.height = bm.height; cx.clearRect(0, 0, bm.width, bm.height); cx.drawImage(bm, 0, 0);
        return { width: bm.width, height: bm.height, data: cx.getImageData(0, 0, bm.width, bm.height).data };
      };
      window.hashFiles = async files => {
        const out = {};
        for (const [p, b] of files) {
          const buf = p.endsWith('.png') ? (await window.px(b)).data : new Uint8Array(await b.arrayBuffer());
          out[p] = [...new Uint8Array(await crypto.subtle.digest('SHA-1', buf))].map(v => v.toString(16).padStart(2, '0')).join('');
        }
        return out;
      };
      // 단색 시험 그림 (slot 용). hole = 가운데 투명 칸
      window.solid = (w, h, c) => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) d.set([...c, 255], i * 4); return { width: w, height: h, data: d }; };
    });
    return { browser, pg };
  })();
  const b = await browserP;
  return b && b.pg;
}
after(async () => { const b = browserP && await browserP; if (b) await b.browser.close(); if (server) server.close(); });

const REG = {
  default: { char: ['jelly'], opts: { id: 'a1b2c3d4e5f6' } },
  retro: { char: ['jelly'], opts: { id: 'a1b2c3d4e5f6', preset: 'retro-game', layout: 'stand', pixelChar: true, pixelBubble: true, grid: 32, deco: 'star' } },
  check: { char: ['jelly', 'hotteok'], opts: { id: 'a1b2c3d4e5f6', preset: 'pastel-check', layout: 'peek', charSize: 'l', deco: 'heart' } },
  plain: { char: ['hotteok'], opts: { id: 'a1b2c3d4e5f6', preset: 'plain-minimal', layout: 'hang', pixelChar: true, grid: 48 } },
};

test('render regression: no slots / no background = same 66 images + css as before', { timeout: 120000 }, async t => {
  const pg = await page();
  if (!pg) return t.skip('playwright (tests/.pw) not installed');
  const ver = await pg.context().browser().version();
  const got = {};
  for (const [name, c] of Object.entries(REG)) {
    got[name] = await pg.evaluate(async ({ c, legacy }) => {
      const [a, b] = c.char.map(n => window.CH[n]);
      const r = legacy ? await E.buildTheme(a, b || null, c.opts) : await E.buildTheme(a, b || null, c.opts, {});
      return window.hashFiles(r.files);
    }, { c, legacy: name !== 'default' });
  }
  if (process.env.UPDATE_GOLDEN) { writeFileSync(GOLDEN, JSON.stringify({ chromium: ver, cases: got }, null, 1)); return t.skip('golden written'); }
  const g = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  if (g.chromium !== ver) return t.skip(`golden made on chromium ${g.chromium}, this is ${ver}`);
  for (const name of Object.keys(REG)) {
    const diff = Object.keys(g.cases[name]).filter(p => g.cases[name][p] !== got[name][p]);
    assert.deepEqual(diff, [], `${name}: changed files`);
  }
});

// ---------- 배경 설정·assets (순수) ----------
import { PATTERNS, PRESETS, resolveBackground, patternLayers, cornerBox, BG } from '../public/engine/presets.js';
import { checkAssets } from '../public/engine/render.js';

test('background: presets map to patterns, defaults reproduce the old look, bad values throw, idempotent', () => {
  const want = { 'cream-dots': 'dots', 'pastel-check': 'check', 'retro-game': 'grid+stars', 'plain-minimal': 'none' };
  for (const [p, pat] of Object.entries(want)) {
    const b = resolveBackground(p);
    assert.equal(b.pattern, pat, p);
    assert.deepEqual(resolveBackground(p, b), b, `${p}: idempotent`);
    assert.equal(normalizeOptions({ preset: p }).background.pattern, pat);
  }
  assert.deepEqual(patternLayers(resolveBackground('retro-game')), [['grid', 0.1], ['stars', 0.28]]);
  assert.deepEqual(patternLayers(resolveBackground('cream-dots')), [['dots', 0.24]]);
  assert.deepEqual(patternLayers(resolveBackground('plain-minimal')), []);
  assert.deepEqual(patternLayers(resolveBackground('retro-game', { patternOpacity: 0.2 })), [['grid', 0.2], ['stars', 0.56]]);
  for (const pat of PATTERNS) assert.equal(resolveBackground('cream-dots', { pattern: pat }).pattern, pat);
  const d = resolveBackground('cream-dots');
  assert.deepEqual(d.photo.main, { fit: 'cover', blur: 0, dim: 0.15, auto: true });
  assert.deepEqual(d.patternArea, { main: 'full', chat: 'full', passcode: 'full' });
  assert.equal(d.patternColors, null);
  const pc = resolveBackground('cream-dots', { patternColors: ['#3E7BE0', '#FFD23F', '#E8789A'], patternArea: { chat: 'top', passcode: 'none' } });
  assert.deepEqual(resolveBackground('cream-dots', pc), pc, 'idempotent with colors/area');
  assert.deepEqual(d.corner, { main: 'br', chat: 'bl', size: 'm', opacity: null });
  assert.equal(d.color, null);
  for (const bad of [{ pattern: 'zebra' }, { pattern: 'dots+none' }, { patternSize: 'xl' }, { patternOpacity: 2 }, { color: 'red' },
    { photo: { main: { fit: 'fill' } } }, { photo: { chat: { blur: 13 } } }, { photo: { passcode: { dim: 0.9 } } }, { patternColors: ['red'] }, { patternColors: [] }, { patternColors: ['#000000', '#000000', '#000000', '#000000'] },
    { patternArea: { chat: 'half' } }, { patternArea: { passcode: 'top' } },
    { corner: { main: 'mid' } }, { corner: { size: 'xl' } }, { corner: { opacity: 0.1 } }]) {
    assert.throws(() => resolveBackground('cream-dots', bad), JSON.stringify(bad));
  }
  assert.ok(Object.keys(PRESETS).every(p => PATTERNS.includes(PRESETS[p].pattern.split('+')[0])));
});

test('cornerBox: m + default corner = old box; 4 corners stay inside, below the header; none = null', () => {
  const c0 = resolveBackground('cream-dots').corner;
  assert.deepEqual(cornerBox('main', c0), { ...BG.main.char, align: 'bottom' });
  assert.deepEqual(cornerBox('chat', c0), { ...BG.chat.char, align: 'bottom' });
  for (const which of ['main', 'chat']) for (const size of ['s', 'm', 'l']) for (const w of ['br', 'bl', 'tr', 'tl']) {
    const b = cornerBox(which, { ...c0, [which]: w, size, opacity: 0.5 });
    assert.ok(b.x >= 0 && b.x + b.w <= 1125 && b.y >= BG.header && b.y + b.h <= 2250, `${which} ${w} ${size}`);
    assert.equal(b.x + b.w / 2 > 1125 / 2, w[1] === 'r');
    assert.equal(b.y + b.h / 2 > 2250 / 2, w[0] === 'b');
    assert.equal(b.alpha, 0.5);
  }
  assert.equal(cornerBox('main', { ...c0, main: 'none' }), null);
});

test('checkAssets: empty = all defaults, unknown names / broken images throw', () => {
  const e = checkAssets(undefined);
  assert.equal(e.bgMain, null);
  assert.deepEqual(e.slots.passcodeSelected, [null, null, null, null]);
  assert.equal(e.slots.tabSelected.friends, null);
  const img = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
  assert.equal(checkAssets({ slots: { tabNormal: { call: img } } }).slots.tabNormal.call, img);
  for (const bad of [{ bgMian: img }, { slots: { profil: img } }, { slots: { tabSelected: { home: img } } }, { slots: { bubble: { none: img } } },
    { slots: { profile: { width: 2, height: 2, data: new Uint8ClampedArray(3) } } }, { slots: { passcodeSelected: [img, img, img, img, img] } }]) {
    assert.throws(() => checkAssets(bad), JSON.stringify(Object.keys(bad)));
  }
});

// ---------- 렌더: slot · 배경 (헤드리스) ----------
// 페이지 안 시험 그림 설명: {solid:[w,h,[r,g,b]]} | {checker:[n,[r,g,b],[r,g,b]]} | {grad:[w,h]} (빨강 -> 파랑 가로 그라데이션)
async function buildProbe(pg, { char = ['jelly'], opts, assets, probes }) {
  return pg.evaluate(async ({ char, opts, assets, probes }) => {
    const mk = d => {
      if (Array.isArray(d)) return d.map(mk);
      if (!d || typeof d !== 'object') return d;
      if (d.solid) return window.solid(...d.solid);
      if (d.checker) { const [n, a, b] = d.checker, im = window.solid(n, n, a); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if ((x + y) % 2) im.data.set([...b, 255], (y * n + x) * 4); return im; }
      if (d.grad) { const [w, h] = d.grad, im = window.solid(w, h, [0, 0, 0]); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) im.data.set([255 * (1 - x / w), 40, 255 * x / w, 255], (y * w + x) * 4); return im; }
      return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, mk(v)]));
    };
    const [a, b] = char.map(n => window.CH[n]);
    const r = await E.buildTheme(a, b || null, opts, mk(assets));
    const hashes = await window.hashFiles(r.files);
    const out = { hashes, meta: r.meta, probes: [] };
    for (const p of probes || []) {
      const im = await window.px(r.files.get('Images/' + p.file));
      const { width: w, data: d } = im;
      if (p.find) { // 그 색(±6, 불투명)인 픽셀 수와 bbox
        let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 250 || Math.abs(d[i] - p.find[0]) > 6 || Math.abs(d[i + 1] - p.find[1]) > 6 || Math.abs(d[i + 2] - p.find[2]) > 6) continue;
          const x = (i / 4) % w, y = Math.floor(i / 4 / w); n++;
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
        out.probes.push({ n, box: n ? [x0, y0, x1 + 1, y1 + 1] : null });
      } else if (p.at) out.probes.push([...d.slice((p.at[1] * w + p.at[0]) * 4, (p.at[1] * w + p.at[0]) * 4 + 4)]);
      else if (p.alphas) { const s = new Set(); for (let i = 3; i < d.length; i += 4) s.add(d[i]); out.probes.push([...s].sort((x, y) => x - y)); }
      else if (p.bbox) { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (let i = 3; i < d.length; i += 4) if (d[i]) { const x = ((i - 3) / 4) % w, y = Math.floor((i - 3) / 4 / w); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } out.probes.push([x0, y0, x1 + 1, y1 + 1]); }
      else if (p.rows) { // y 범위 안 모든 픽셀이 같은 색인가 (그 색) / 아니면 null
        const [ya, yb] = p.rows, c0 = d.slice(ya * w * 4, ya * w * 4 + 4).join(); let same = true;
        for (let i = ya * w * 4; i < yb * w * 4 && same; i += 4) same = d.slice(i, i + 4).join() === c0;
        out.probes.push(same ? c0 : null);
      }
    }
    return out;
  }, { char, opts, assets, probes });
}
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const near = (a, b, t = 3) => a.every((v, i) => Math.abs(v - b[i]) <= t);

test('render slots: every slot lands in its own file, untouched files stay byte-identical to the slot-less build', { timeout: 120000 }, async t => {
  const pg = await page();
  if (!pg) return t.skip('playwright (tests/.pw) not installed');
  const g = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  if (g.chromium !== await pg.context().browser().version()) return t.skip('golden chromium mismatch');
  let n = 0;
  const col = () => { n++; return [(n * 37) % 200 + 30, (n * 91) % 200 + 30, (n * 53) % 200 + 30]; };
  const T = ['friends', 'chats', 'now', 'shopping', 'call', 'more'], NM = { friends: 'Friends', chats: 'Chats', now: 'Now', shopping: 'Shopping', call: 'Call', more: 'More' };
  const C = { profile: col(), icon: col(), passcodeArt: col(), cornerMain: col(), cornerChat: col(), perch: col(),
    tabSelected: Object.fromEntries(T.map(k => [k, col()])), tabNormal: Object.fromEntries(T.map(k => [k, col()])), pass: [col(), col(), col(), col()] };
  const sq = c => ({ solid: [60, 60, c] });
  const slots = { profile: sq(C.profile), icon: sq(C.icon), passcodeArt: sq(C.passcodeArt), cornerMain: sq(C.cornerMain), cornerChat: sq(C.cornerChat),
    bubble: { perch: sq(C.perch) }, passcodeSelected: C.pass.map(sq),
    tabSelected: Object.fromEntries(T.map(k => [k, sq(C.tabSelected[k])])), tabNormal: Object.fromEntries(T.map(k => [k, sq(C.tabNormal[k])])) };
  const where = [['profileImg01@3x.png', C.profile], ['commonIcoTheme.png', C.icon], ['passcodeBgImage@3x.png', C.passcodeArt],
    ...['Send01', 'Send01Selected', 'Receive01', 'Receive01Selected'].flatMap(s => [2, 3].map(k => [`chatroomBubble${s}@${k}x.png`, C.perch])),
    ...C.pass.map((c, i) => [`passcodeImgCode0${i + 1}Selected@3x.png`, c]),
    ...T.flatMap(k => [2, 3].flatMap(s => [[`maintabIco${NM[k]}Selected@${s}x.png`, C.tabSelected[k]], [`maintabIco${NM[k]}@${s}x.png`, C.tabNormal[k]]])),
    ...[2, 3].flatMap(s => [['', 'tabNormal'], ['Selected', 'tabSelected']].flatMap(([suf, kk]) => ['Piccoma', 'Local'].map(a => [`maintabIco${a}${suf}@${s}x.png`, C[kk].now])))];
  const opts = { ...REG.default.opts, background: { corner: { opacity: 1 } } };
  const r = await buildProbe(pg, { opts, assets: { slots }, probes: [...where.map(([file, find]) => ({ file, find })),
    { file: 'mainBgImage@3x.png', find: C.cornerMain }, { file: 'chatroomBgImage@3x.png', find: C.cornerChat }, { file: 'chatroomBubbleSend02@3x.png', find: C.perch }] });
  where.forEach(([file], i) => assert.ok(r.probes[i].n > 0, `${file}: slot color missing`));
  const [m, c, s02] = r.probes.slice(where.length);
  assert.ok(m.n > 0 && c.n > 0, 'corner slots');
  assert.equal(s02.n, 0, '02 bubble has no character');
  // slot 이 없는 자리 = slot 없이 만든 것과 같은 픽셀
  const same = ['KakaoTalkTheme.css', 'Images/findBtnAddFriend@2x.png', 'Images/findBtnAddFriend@3x.png', 'Images/maintabBgImage@3x.png', 'Images/passcodeKeypadPressed@3x.png',
    ...[1, 2, 3, 4].map(i => `Images/passcodeImgCode0${i}@3x.png`), ...['Send02', 'Receive02Selected'].flatMap(s => [2, 3].map(k => `Images/chatroomBubble${s}@${k}x.png`))];
  for (const f of same) assert.equal(r.hashes[f], g.cases.default[f], f);
  for (const f of where.map(w => 'Images/' + w[0])) assert.notEqual(r.hashes[f], g.cases.default[f], `${f} changed`);
});

test('render slots: bubble slot is used only for its own layout (perch/peek/hang/stand), couple partner gets it on the receive side', { timeout: 120000 }, async t => {
  const pg = await page();
  if (!pg) return t.skip('playwright (tests/.pw) not installed');
  const C = { perch: [250, 20, 20], peek: [20, 250, 20], hang: [20, 20, 250], stand: [250, 250, 20] };
  const bubble = Object.fromEntries(Object.entries(C).map(([k, c]) => [k, { solid: [40, 40, c] }]));
  for (const layout of Object.keys(C)) for (const pixel of [false, true]) {
    const probes = Object.values(C).flatMap(find => ['chatroomBubbleSend01@3x.png', 'chatroomBubbleReceive01@2x.png'].map(file => ({ file, find })));
    const r = await buildProbe(pg, { opts: { id: 'a1b2c3d4e5f6', layout, pixelChar: pixel, pixelBubble: pixel }, assets: { slots: { bubble } }, probes });
    Object.keys(C).forEach((l, i) => {
      for (const j of [0, 1]) assert.equal(r.probes[i * 2 + j].n > 0, l === layout, `${layout} pixel=${pixel}: ${l} color in ${probes[i * 2 + j].file}`);
    });
  }
  // groupChar 빼꼼: 02 도 01 과 같은 slot 그림 (기본 캐릭터로 새지 않는다)
  for (const layout of ['perch', 'hang', 'peek']) {
    const r = await buildProbe(pg, { opts: { id: 'a1b2c3d4e5f6', layout, groupChar: 'peek' }, assets: { slots: { bubble } },
      probes: ['chatroomBubbleSend02@3x.png', 'chatroomBubbleReceive02@2x.png'].map(file => ({ file, find: C[layout] })) });
    for (const p of r.probes) assert.ok(p.n > 0, `${layout} groupChar: slot color in 02`);
  }
  // 커플: 내 폰 = 보낸 쪽 slot·받은 쪽 B 기본, 상대 폰 = 받은 쪽(A 자리)만 slot, 프로필 등은 B 기본. JSZip 대신 파일 표를 돌려주는 가짜
  const r = await pg.evaluate(async () => {
    globalThis.JSZip = class { constructor() { this.files = new Map(); } file(p, d) { this.files.set(p, d); } async generateAsync() { return this.files; } };
    const red = window.solid(40, 40, [250, 20, 20]);
    const pair = await E.buildCouple(window.CH.jelly, window.CH.hotteok, { id: 'a1b2c3d4e5f6', layout: 'perch' }, { slots: { bubble: { perch: red }, profile: red } });
    const has = async (files, f) => { const { data: d } = await window.px(files.get('Images/' + f)); for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 250 && d[i] > 244 && d[i + 1] < 26 && d[i + 2] < 26) return true; return false; };
    const out = [];
    for (const { blob } of pair) for (const f of ['chatroomBubbleSend01@3x.png', 'chatroomBubbleReceive01@3x.png', 'profileImg01@3x.png']) out.push(await has(blob, f));
    delete globalThis.JSZip;
    return out;
  });
  assert.deepEqual(r, [true, false, true, false, true, false]);
});

test('render roles: charB = 받은 말풍선(친구) 캐릭터만, charA = 보낸 말풍선 + 탭·프로필·아이콘·잠금·배경 구석', { timeout: 120000 }, async t => {
  const pg = await page();
  if (!pg) return t.skip('playwright (tests/.pw) not installed');
  const A = [250, 20, 20], B = [20, 20, 250];
  const files = ['chatroomBubbleSend01@3x.png', 'chatroomBubbleSend01@2x.png', 'chatroomBubbleReceive01@3x.png', 'chatroomBubbleReceive01Selected@2x.png',
    'profileImg01@3x.png', 'commonIcoTheme.png', 'maintabIcoFriendsSelected@3x.png', 'passcodeBgImage@3x.png', 'mainBgImage@3x.png', 'chatroomBgImage@3x.png', 'passcodeImgCode04Selected@3x.png'];
  for (const layout of ['stand', 'perch']) {
    const probes = files.flatMap(file => [{ file, find: A }, { file, find: B }]);
    const r = await pg.evaluate(async ({ layout, files, A, B }) => {
      const a = window.solid(40, 40, A), b = window.solid(40, 40, B);
      const res = await E.buildTheme(a, b, { id: 'a1b2c3d4e5f6', layout, background: { corner: { opacity: 1 } } });
      const out = [];
      for (const f of files) {
        const { data: d } = await window.px(res.files.get('Images/' + f));
        const n = c => { let k = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 250 && Math.abs(d[i] - c[0]) < 7 && Math.abs(d[i + 1] - c[1]) < 7 && Math.abs(d[i + 2] - c[2]) < 7) k++; return k; };
        out.push([n(A) > 0, n(B) > 0]);
      }
      return { out, id: res.meta.themeId };
    }, { layout, files, A, B });
    files.forEach((f, i) => assert.deepEqual(r.out[i], f.includes('Receive') ? [false, true] : [true, false], `${layout} ${f}: [charA, charB]`));
    assert.doesNotMatch(r.id, /trial/, 'default build is not a trial');
  }
});

test('render slots: pixel slots are placed at integer multiples (same cell grid @2x/@3x), alpha 0/255', { timeout: 120000 }, async t => {
  const pg = await page();
  if (!pg) return t.skip('playwright (tests/.pw) not installed');
  for (const slotsArePixel of [true, false]) {
    const art = slotsArePixel ? { checker: [9, [200, 40, 90], [30, 30, 60]] } : { solid: [120, 90, [200, 40, 90]] };
    const r = await buildProbe(pg, { opts: { id: 'a1b2c3d4e5f6', pixelChar: true, slotsArePixel },
      assets: { slots: { tabSelected: { friends: art }, tabNormal: { call: art }, profile: art } },
      probes: [{ file: 'maintabIcoFriendsSelected@2x.png', bbox: 1 }, { file: 'maintabIcoFriendsSelected@3x.png', bbox: 1 },
        { file: 'maintabIcoFriendsSelected@3x.png', alphas: 1 }, { file: 'maintabIcoCall@3x.png', alphas: 1 }, { file: 'profileImg01@3x.png', find: [200, 40, 90] }] });
    const [b2, b3, a3, an] = r.probes, w2 = b2[2] - b2[0], w3 = b3[2] - b3[0];
    assert.equal(w2 / 2, w3 / 3, `slotsArePixel=${slotsArePixel}: same grid`);
    assert.equal((b3[3] - b3[1]) / 3, (b2[3] - b2[1]) / 2);
    if (slotsArePixel) assert.equal(w3 % (9 * 3), 0, `whole cells: ${w3}`);
    assert.deepEqual(a3, [0, 255]); assert.deepEqual(an, [0, 255]);
    assert.ok(r.probes[4].n > 0);
  }
});

test('render background: every pattern differs, header band plain, none = flat color, size/opacity/color apply', { timeout: 120000 }, async t => {
  const pg = await page();
  if (!pg) return t.skip('playwright (tests/.pw) not installed');
  const base = { id: 'a1b2c3d4e5f6' };
  const corner = { main: 'none', chat: 'none' };
  const hashes = new Set();
  for (const pattern of PATTERNS) {
    const r = await buildProbe(pg, { opts: { ...base, background: { pattern, corner } }, probes: [{ file: 'mainBgImage@3x.png', rows: [0, 330] }, { file: 'mainBgImage@3x.png', rows: [330, 2250] }, { file: 'passcodeBgImage@3x.png', rows: [1199, 1200] }] });
    const bg = hexRgb(r.meta.palette.bg).join() + ',255';
    assert.equal(r.probes[0], bg, `${pattern}: header plain`);
    assert.equal(r.probes[1] === bg, pattern === 'none', `${pattern}: body ${pattern === 'none' ? 'flat' : 'patterned'}`);
    assert.equal(r.probes[2], hexRgb(r.meta.palette.keypad).join() + ',255', `${pattern}: passcode bottom = keypad`);
    hashes.add(r.hashes['Images/mainBgImage@3x.png']);
  }
  assert.equal(hashes.size, PATTERNS.length);
  const v = [];
  for (const background of [{ pattern: 'hearts', patternSize: 's' }, { pattern: 'hearts', patternSize: 'l' }, { pattern: 'hearts', patternOpacity: 0.9 }, { pattern: 'none', color: '#123456' }]) {
    const r = await buildProbe(pg, { opts: { ...base, background: { ...background, corner } }, probes: [{ file: 'chatroomBgImage@3x.png', at: [5, 5] }] });
    v.push(r);
  }
  assert.equal(new Set([...v.slice(0, 3).map(r => r.hashes['Images/chatroomBgImage@3x.png']), ...hashes]).size, PATTERNS.length + 3);
  assert.deepEqual(v[3].probes[0], [0x12, 0x34, 0x56, 255]);
});

test('render background: photo cover/contain + dim + header band, passcode bottom keypad, corners 4 ways + none', { timeout: 120000 }, async t => {
  const pg = await page();
  if (!pg) return t.skip('playwright (tests/.pw) not installed');
  const photo = { grad: [300, 200] }, assets = { bgMain: photo, bgChat: photo, bgPasscode: photo };
  const corner = { main: 'none', chat: 'none' };
  const probes = [{ file: 'mainBgImage@3x.png', at: [562, 100] }, { file: 'mainBgImage@3x.png', at: [562, 1200] }, { file: 'mainBgImage@3x.png', at: [562, 2100] },
    { file: 'passcodeBgImage@3x.png', rows: [1199, 1200] }, { file: 'passcodeBgImage@3x.png', at: [5, 300] }];
  const cover = await buildProbe(pg, { opts: { id: 'a1b2c3d4e5f6', background: { corner } }, assets, probes });
  const bg = hexRgb(cover.meta.palette.bg), ph = [255 * (1 - 150 / 300), 40, 255 * 150 / 300]; // 가운데 열 색
  const mix = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);
  const dm = cover.meta.background.dim.main;
  assert.ok(dm >= 0.15 && dm <= 0.85, `auto dim ${dm}`);
  const body = mix(ph, bg, dm);
  assert.ok(near(cover.probes[1].slice(0, 3), body, 4), `body = photo dimmed ${dm}: ${cover.probes[1]} vs ${body}`);
  assert.ok(near(cover.probes[0].slice(0, 3), mix(body, bg, 0.7), 4), `header band: ${cover.probes[0]}`);
  assert.equal(cover.probes[3], hexRgb(cover.meta.palette.keypad).join() + ',255', 'passcode bottom = keypad');
  assert.ok(!near(cover.probes[4].slice(0, 3), bg, 20), 'passcode photo shows');
  const contain = await buildProbe(pg, { opts: { id: 'a1b2c3d4e5f6', background: { corner, photo: { main: { fit: 'contain', dim: 0, auto: false } } } }, assets, probes });
  assert.deepEqual(contain.probes[2].slice(0, 3), bg, 'contain: outside photo = bg');
  assert.ok(near(contain.probes[1].slice(0, 3), ph, 4), `contain dim 0: ${contain.probes[1]}`);
  assert.equal(contain.meta.background.dim.main, 0, 'auto off keeps dim');
  const blur = await buildProbe(pg, { opts: { id: 'a1b2c3d4e5f6', background: { corner, photo: { main: { blur: 8 } } } }, assets, probes: [] });
  assert.notEqual(blur.hashes['Images/mainBgImage@3x.png'], cover.hashes['Images/mainBgImage@3x.png']);
  // 구석 4방향 + 없음 (slot 색으로 위치 확인), 사진 위에서도
  const red = [250, 20, 20];
  for (const w of ['br', 'bl', 'tr', 'tl', 'none']) {
    const r = await buildProbe(pg, { opts: { id: 'a1b2c3d4e5f6', background: { corner: { main: w, chat: w, opacity: 1, size: 's' } } },
      assets: { bgMain: photo, slots: { cornerMain: { solid: [50, 50, red] }, cornerChat: { solid: [50, 50, red] } } },
      probes: [{ file: 'mainBgImage@3x.png', find: red }, { file: 'chatroomBgImage@3x.png', find: red }] });
    for (const p of r.probes) {
      if (w === 'none') { assert.equal(p.n, 0, 'none: no corner art'); continue; }
      const cx = (p.box[0] + p.box[2]) / 2, cy = (p.box[1] + p.box[3]) / 2;
      assert.equal(cx > 562, w[1] === 'r', `${w} x`); assert.equal(cy > 1125, w[0] === 'b', `${w} y`);
      assert.ok(p.box[1] >= 330, `${w}: below header`);
    }
  }
});

test('render background: patternColors, patternArea top/none, auto dim on a dark photo, header fade, dark bg color warning', { timeout: 120000 }, async t => {
  const pg = await page();
  if (!pg) return t.skip('playwright (tests/.pw) not installed');
  const base = { id: 'a1b2c3d4e5f6' }, corner = { main: 'none', chat: 'none' };
  const cols = ['#3E7BE0', '#FFD23F', '#E8789A'];
  // 큐브 3색 직접 (진하기 1 이라 그 색 그대로 찍힘), 채팅방 = 위 띠만, 잠금 = 무늬 없음
  const r = await buildProbe(pg, { opts: { ...base, background: { pattern: 'cubes', patternOpacity: 1, patternColors: cols, patternArea: { chat: 'top', passcode: 'none' }, corner } },
    probes: [...cols.map(c => ({ file: 'mainBgImage@3x.png', find: hexRgb(c) })), { file: 'chatroomBgImage@3x.png', find: hexRgb(cols[0]) }, { file: 'chatroomBgImage@3x.png', rows: [430, 2250] },
      { file: 'passcodeBgImage@3x.png', rows: [0, 690] }] });
  for (const [i, p] of r.probes.slice(0, 3).entries()) assert.ok(p.n > 1000, `cube color ${cols[i]}: ${p.n}`);
  const top = r.probes[3];
  assert.ok(top.n > 0 && top.box[1] >= 60 - 13 && top.box[3] <= 420 + 13, `chat top band only: ${JSON.stringify(top.box)}`);
  assert.equal(r.probes[4], hexRgb(r.meta.palette.bg).join() + ',255', 'chat below band plain');
  assert.equal(r.probes[5], hexRgb(r.meta.palette.bg).join() + ',255', 'passcode none = plain');
  // 어두운 사진: 자동 dim 이 글자 대비를 맞춘다 (기본 0.15 로는 모자람). 헤더 띠 아래는 페이드 (330 과 389 가 다름, 이음매 없음)
  const dark = { solid: [64, 64, [40, 42, 55]] };
  const d = await buildProbe(pg, { opts: { ...base, background: { corner } }, assets: { bgMain: dark, bgChat: dark, bgPasscode: dark },
    probes: [{ file: 'mainBgImage@3x.png', at: [562, 1200] }, { file: 'mainBgImage@3x.png', at: [562, 329] }, { file: 'mainBgImage@3x.png', at: [562, 340] }, { file: 'mainBgImage@3x.png', at: [562, 395] }] });
  const lum = c => { const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; const [a, b, e] = c.map(f); return 0.2126 * a + 0.7152 * b + 0.0722 * e; };
  const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const w of ['main', 'chat', 'passcode']) assert.ok(d.meta.background.dim[w] > 0.15, `${w} auto dim raised: ${d.meta.background.dim[w]}`);
  assert.ok(cr(d.probes[0].slice(0, 3), hexRgb(d.meta.palette.text)) >= 4.5, `text contrast on dark photo: ${d.probes[0]}`);
  const L = p => lum(p.slice(0, 3));
  assert.ok(L(d.probes[1]) > L(d.probes[2]) && L(d.probes[2]) > L(d.probes[3]), `header fade: ${d.probes[1]} > ${d.probes[2]} > ${d.probes[3]}`);
  assert.ok(near(d.probes[3].slice(0, 3), d.probes[0].slice(0, 3), 2), 'fade ends at the dimmed photo');
  assert.deepEqual(d.meta.background.warnings, []);
  const w = await buildProbe(pg, { opts: { ...base, background: { color: '#202020', corner } }, probes: [] });
  assert.deepEqual(w.meta.background.warnings, ['text-on-bg']);
});

test('render pixel slots: a big pre-made sprite shrunk into a small box keeps its colors (no outline-only lump)', { timeout: 120000 }, async t => {
  const pg = await page();
  if (!pg) return t.skip('playwright (tests/.pw) not installed');
  // 96칸 스프라이트: 진한 세로줄이 한 칸 걸러 (2x2 마다 선 2칸 = 선 우선이면 전부 선). 28pt 서기(s) 상자로 줄여도 분홍이 남아야
  const n = 96, ink = [40, 20, 30], pink = [240, 140, 170];
  const r = await pg.evaluate(async ({ n, ink, pink }) => {
    const sp = window.solid(n, n, pink);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (x < 2 || y < 2 || x >= n - 2 || y >= n - 2 || x % 2 === 1) sp.data.set([...ink, 255], (y * n + x) * 4);
    const b = await E.buildTheme(window.CH.jelly, null, { id: 'a1b2c3d4e5f6', layout: 'stand', charSize: 's', pixelChar: true, pixelBubble: true, slotsArePixel: true }, { slots: { bubble: { stand: sp } } });
    const im = await window.px(b.files.get('Images/chatroomBubbleSend01@3x.png'));
    let pk = 0, dk = 0;
    for (let i = 0; i < im.data.length; i += 4) {
      const [r, g, bb, a] = im.data.slice(i, i + 4); if (a < 250) continue;
      if (Math.abs(r - pink[0]) < 8 && Math.abs(g - pink[1]) < 8 && Math.abs(bb - pink[2]) < 8) pk++;
    }
    return { pk };
  }, { n, ink, pink });
  assert.ok(r.pk > 200, `pink cells survive: ${r.pk}`);
});

// ---------- 포스트잇 · 빼꼼 가운데 · 02 빼꼼 · 무채색 글자 · 키패드 캐릭터 색 · 일괄 slot · 새 무늬 ----------
import { applyTextTone } from '../public/engine/render.js';

test('note (포스트잇): no tail, no highlight, square corners; outline none = fill only (both sides), invariants hold', () => {
  for (const layout of LAYOUTS) for (const outline of OUTS) for (const group of [false, true]) {
    const o = { bubbleShape: 'note', outline }, b = bubbleSpec(layout, false, group, o);
    assert.deepEqual(checkInvariants(layout, false, group, o), [], `${layout} ${outline} ${group}`);
    assert.ok(!features(b, false, outline).some(f => f.kind === 'tail' || f.kind === 'highlight'), `${layout}: no tail/highlight feature`);
    for (const side of ['send', 'receive']) {
      const k = 3, img = bubbleImage(b, { tail: !group, selected: false, side, k, pixel: false, outline }, PAL);
      const F = rgb(side === 'send' ? PAL.sendFill : PAL.recvFill).join(), at = (x, y) => img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4);
      // 몸통 오른쪽(받은 쪽 왼쪽) 6pt = 꼬리 자리는 비어 있음
      const tailX = side === 'send' ? (b.W - (b.pad || 0) - 3) * k : 3 * k;
      if (!b.bx) for (let y = 0; y < img.height; y++) assert.equal(at(tailX, y)[3], 0, `${layout} ${side}: tail column empty`);
      if (outline === 'none') { // 불투명 픽셀은 전부 면 색
        for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]) assert.equal([...img.data.slice(i, i + 3)].join(), F, `${layout} ${side}: fill only`);
        const x0 = side === 'send' ? k : img.width - 1 - k; // 몸통 모서리에서 1pt 안: 둥근 모서리면 밖, 각진 모서리면 안
        assert.equal(at(x0, (b.top + 1) * k)[3], 255, `${layout} ${side}: square corner`);
      }
    }
  }
  assert.equal(bubbleGeometry('none', 'm', 'note').r, 0);
  assert.equal(bubbleGeometry('none', 'm', 'note', true).note, undefined, 'pixel bubble wins over note');
  assert.equal(OUTLINES.none, 0);
});
import { features } from '../public/engine/presets.js';

test('peekPos center: character centered on the min-width body, column right of it, text frame centered; corner unchanged', () => {
  for (const charSize of CHAR_SIZES) for (const bubbleShape of SHAPES) for (const pixel of [false, true]) for (const outline of OUTS) {
    const o = { charSize, bubbleShape, outline, peekPos: 'center' }, b = bubbleSpec('peek', pixel, false, o), tag = `${charSize} ${bubbleShape} ${pixel} ${outline}`;
    assert.deepEqual(checkInvariants('peek', pixel, false, o), [], tag);
    assert.equal(b.box.x + b.box.w / 2, (b.W - 6) / 2, `${tag}: centered`);
    assert.ok(b.X >= b.box.x + b.box.w + 1, `${tag}: column right of the box`);
    assert.equal(b.ins[1] + 6, (b.W - 6) / 2, `${tag}: text frame centered`);
  }
  assert.deepEqual(bubbleSpec('peek', false, false, { peekPos: 'corner' }), bubbleSpec('peek', false, false, {}));
  assert.deepEqual(bubbleSpec('perch', false, false, { peekPos: 'center' }), bubbleSpec('perch', false, false, {}), 'only peek moves');
  assert.throws(() => bubbleGeometry('peek', 'm', 'round', false, 'left'));
  assert.throws(() => normalizeOptions({ peekPos: 'left' }));
});

test('groupChar peek: 02 gets a small peek box, body tail edge stays aligned with 01, invariants hold; stand/none default unchanged', () => {
  for (const layout of LAYOUTS) for (const pixel of [false, true]) for (const peekPos of ['corner', 'center']) for (const bubbleShape of SHAPES) {
    const o = { groupChar: 'peek', peekPos, bubbleShape }, b2 = bubbleSpec(layout, pixel, true, o), tag = `${layout} ${pixel} ${peekPos} ${bubbleShape}`;
    assert.deepEqual(checkInvariants(layout, pixel, true, o), [], tag);
    if (layout === 'stand') { assert.deepEqual(b2, bubbleSpec('stand', pixel, true, { bubbleShape }), `${tag}: stand keeps its padded 02`); continue; }
    assert.ok(b2.box && b2.box.w < bubbleGeometry('peek', 's').box.w && b2.deco === null, `${tag}: small box, no deco`);
    for (const side of ['send', 'receive']) for (const k of [2, 3]) {
      const edge = (b, group) => { // 늘이는 행에서 몸통 꼬리 쪽 끝 (그림 가장자리에서 떨어진 거리)
        const img = bubbleImage(b, { tail: false, selected: false, side, k, pixel, outline: 'normal' }, PAL), y = b.Y * k, xs = [];
        for (let x = 0; x < img.width; x++) if (img.data[(y * img.width + x) * 4 + 3] > 128) xs.push(x);
        return side === 'send' ? img.width - 1 - xs.at(-1) : xs[0];
      };
      assert.equal(edge(b2, true), edge(bubbleSpec(layout, pixel, false, o), false), `${tag} ${side} @${k}x: 02 body edge = 01 body edge`);
    }
  }
  assert.equal(bubbleSpec('perch', false, true, { groupChar: 'none' }).box, null);
  assert.throws(() => normalizeOptions({ groupChar: 'stand' }));
});

test('textTone mono / fillTone pastel / keypadTone: WCAG holds for many hues, css swaps selection + send button only in mono', () => {
  for (let h = 0; h < 360; h += 30) {
    const img = blob(120, 100, [Math.round(127 + 120 * Math.cos(h * Math.PI / 180)), Math.round(127 + 120 * Math.cos((h - 120) * Math.PI / 180)), Math.round(127 + 120 * Math.cos((h + 120) * Math.PI / 180))]);
    const pal = applyTextTone(applyFillTone(derive(img), 'pastel'), 'mono');
    assert.equal(pal.text, '#383838'); assert.equal(pal.muted, '#5E5E5E');
    for (const k of ['bg', 'sendFill', 'recvFill', 'sendSel', 'recvSel', 'keypad', 'tabBg']) assert.ok(contrast(pal.text, pal[k]) >= 4.5, `hue ${h}: text on ${k} ${contrast(pal.text, pal[k])}`);
    assert.ok(contrast(pal.muted, pal.bg) >= 3, `hue ${h}: muted`);
    assert.notEqual(pal.recvFill, '#FFFFFF', 'pastel receive is tinted');
    assert.ok(contrast(pal.text, derive(img).sendFill) >= 4.5, `hue ${h}: keypad = sendFill readable`);
  }
  assert.equal(applyTextTone(PAL, 'palette'), PAL);
  const meta = { bubbles: { '01': bubbleSpec('peek', false, false), '02': bubbleSpec('peek', false, true) }, palette: applyTextTone(PAL, 'mono'), themeId: themeId('a1b2c3d4e5f6'), themeName: 'x' };
  const plain = buildCss({ ...meta, palette: PAL }), mono = buildCss({ ...meta, textTone: 'mono' });
  assert.equal(buildCss({ ...meta, palette: PAL, textTone: 'palette' }), plain, 'palette mode = old css');
  assert.match(mono, /-ios-selected-background-color: #383838;\s+-ios-selected-background-alpha: 0\.05;/);
  assert.match(mono, /-ios-send-normal-background-color: #383838;/);
  assert.match(mono, /SectionTitleStyle-Main\s+\{[^}]*?-ios-text-color: #383838;/);
  assert.match(mono, /DirectShareBarName \{ -ios-text-color: #383838; \}/);
  assert.match(plain, new RegExp(`-ios-send-normal-background-color: ${PAL.accent};`));
  assert.ok(!/\{\{/.test(mono));
  for (const bad of [{ textTone: 'gray' }, { keypadTone: 'red' }, { fillTone: 'neon' }]) assert.throws(() => normalizeOptions(bad));
});

test('checkAssets: ...All fills every tab / all 4 lock cells, a per-cell picture wins; passcodeNormal; bad keys throw', () => {
  const a = { width: 2, height: 2, data: new Uint8ClampedArray(16) }, b = { width: 3, height: 1, data: new Uint8ClampedArray(12) };
  const s = checkAssets({ slots: { tabSelectedAll: a, tabSelected: { chats: b }, tabNormalAll: b, passcodeAll: { normal: a, selected: b }, passcodeSelected: [a] } }).slots;
  assert.deepEqual(Object.values(s.tabSelected).map(v => v === a ? 'a' : 'b'), ['a', 'b', 'a', 'a', 'a', 'a']);
  assert.ok(Object.values(s.tabNormal).every(v => v === b));
  assert.deepEqual(s.passcodeNormal, [a, a, a, a]);
  assert.deepEqual(s.passcodeSelected, [a, b, b, b]);
  assert.ok(!('tabSelectedAll' in s) && !('passcodeAll' in s), 'expanded, not passed on');
  assert.deepEqual(checkAssets({}).slots.passcodeNormal, [null, null, null, null]);
  for (const bad of [{ passcodeAll: { pressed: a } }, { tabNormalAll: { width: 1 } }, { passcodeNormal: [a, a, a, a, a] }]) assert.throws(() => checkAssets({ slots: bad }), JSON.stringify(Object.keys(bad)));
});

test('background: new patterns + haze resolve, defaults stay none, bad haze throws; sticky templates carry a valid bg', () => {
  for (const p of ['wobble-grid', 'sprinkle-hearts', 'wobble-grid+sprinkle-hearts']) assert.equal(resolveBackground('cream-dots', { pattern: p }).pattern, p);
  assert.deepEqual(resolveBackground('cream-dots').haze, { main: 'none', chat: 'none', passcode: 'none' });
  const h = resolveBackground('cream-dots', { haze: { main: 'rainbow' } });
  assert.deepEqual(h.haze, { main: 'rainbow', chat: 'none', passcode: 'none' });
  assert.deepEqual(resolveBackground('cream-dots', h), h, 'idempotent');
  assert.throws(() => resolveBackground('cream-dots', { haze: { chat: 'fog' } }));
  for (const id of ['sticky-peek', 'sticky-perch']) {
    const t = TEMPLATES.find(x => x.id === id);
    assert.ok(t && t.bg, id);
    const o = normalizeOptions({ ...DEFAULTS, ...t.opts, background: t.bg, id: 'a1b2c3d4e5f6' });
    assert.equal(o.bubbleShape, 'note'); assert.equal(o.outline, 'none'); assert.equal(o.textTone, 'mono'); assert.equal(o.keypadTone, 'char');
    assert.equal(o.background.haze.main, 'rainbow');
  }
  const sp = TEMPLATES.find(x => x.id === 'sticky-peek').opts;
  assert.deepEqual([sp.layout, sp.peekPos, sp.groupChar], ['peek', 'center', 'peek']);
  assert.equal(TEMPLATES.find(x => x.id === 'sticky-perch').opts.layout, 'perch');
});

test('render sticky: same input = same bytes, new patterns + haze draw, keypad = sendFill with white press, 02 peek, ...All slots land', { timeout: 120000 }, async t => {
  const pg = await page();
  if (!pg) return t.skip('playwright (tests/.pw) not installed');
  const tp = TEMPLATES.find(x => x.id === 'sticky-peek');
  const opts = { ...tp.opts, background: tp.bg, id: 'a1b2c3d4e5f6' };
  const A = [10, 200, 90], B = [200, 30, 160];
  const assets = { slots: { tabNormalAll: { solid: [40, 40, A] }, passcodeAll: { normal: { solid: [40, 40, B] } } } };
  const probes = [{ file: 'passcodeBgImage@3x.png', at: [600, 1199] }, { file: 'passcodeKeypadPressed@3x.png', at: [90, 90] },
    ...['Friends', 'Chats', 'Now', 'Shopping', 'Call', 'More'].map(n => ({ file: `maintabIco${n}@3x.png`, find: A })),
    ...[1, 2, 3, 4].map(i => ({ file: `passcodeImgCode0${i}@3x.png`, find: B })),
    { file: 'chatroomBubbleSend02@3x.png', bbox: 1 }, { file: 'mainBgImage@3x.png', rows: [0, 330] }];
  const r1 = await buildProbe(pg, { char: ['jelly', 'hotteok'], opts, assets, probes });
  const r2 = await buildProbe(pg, { char: ['jelly', 'hotteok'], opts, assets, probes });
  assert.deepEqual(r1.hashes, r2.hashes, 'deterministic');
  const pal = r1.meta.palette;
  assert.equal(pal.keypad, pal.sendFill, 'keypad = sendFill (캐릭터 대표색)');
  assert.ok(near(r1.probes[0], [...hexRgb(pal.keypad), 255]), `passcode bottom = keypad ${r1.probes[0]}`);
  assert.ok(near(r1.probes[1].slice(0, 3), [255, 255, 255]), 'keypad press = white');
  r1.probes.slice(2, 12).forEach((p, i) => assert.ok(p.n > 0, `slot ...All probe ${i}`));
  const b2 = r1.meta.bubbles['02'], bb = r1.probes[12];
  assert.ok(bb[1] < b2.top * 3, '02: character above the body');
  assert.equal(r1.probes[13], null, 'haze: header is not flat (rainbow wash)');
  assert.match(await pg.evaluate(async o => { const r = await E.buildTheme(window.CH.jelly, null, o); return r.css; }, opts), /-ios-send-normal-background-color: #383838;/);
  // 무늬·헤이즈마다 다른 그림, 헤이즈 없는 기본은 그대로
  const hs = new Set();
  for (const background of [{ pattern: 'wobble-grid' }, { pattern: 'sprinkle-hearts' }, { pattern: 'none', haze: { chat: 'rainbow' } }, { pattern: 'none' }]) {
    const r = await buildProbe(pg, { opts: { id: 'a1b2c3d4e5f6', background: { ...background, corner: { main: 'none', chat: 'none' } } } });
    hs.add(r.hashes['Images/chatroomBgImage@3x.png']);
  }
  assert.equal(hs.size, 4);
});
