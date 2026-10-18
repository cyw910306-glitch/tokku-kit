// 캐릭터 -> 1px = 1칸 도트 스프라이트, 그리고 스프라이트 배치용 nearest 도구. DOM 없음.
import { kmeans } from './palette.js';
import { crop } from './keying.js';

const luma = (r, g, b) => r * 0.3 + g * 0.59 + b * 0.11;

/**
 * 긴 변 grid 칸으로 격자화. 칸마다 알파 가중 평균, 어두운 선(칸의 22% 이상이 luma < 90)은 선 색 우선,
 * 알파 127 기준 이진화, k-means colors 색, 바깥 1칸 외곽선(가장 어두운 색). 결과는 사방 1칸 여백 포함.
 */
export function pixelize(img, grid = 48, { colors = 16 } = {}) {
  const { width: w, height: h, data: d } = img;
  const cs = Math.max(w, h) / grid;
  const gw = Math.max(1, Math.round(w / cs)), gh = Math.max(1, Math.round(h / cs));
  const cells = new Float64Array(gw * gh * 3);
  const on = new Uint8Array(gw * gh);
  for (let cy = 0; cy < gh; cy++) {
    const ya = Math.floor(cy * h / gh), yb = Math.max(ya + 1, Math.floor((cy + 1) * h / gh));
    for (let cx = 0; cx < gw; cx++) {
      const xa = Math.floor(cx * w / gw), xb = Math.max(xa + 1, Math.floor((cx + 1) * w / gw));
      let r = 0, g = 0, b = 0, a = 0, n = 0, op = 0, dk = 0, dr = 0, dg = 0, db = 0;
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
        const i = (y * w + x) * 4, al = d[i + 3];
        r += d[i] * al; g += d[i + 1] * al; b += d[i + 2] * al; a += al; n++;
        if (al > 127) {
          op++;
          if (luma(d[i], d[i + 1], d[i + 2]) < 90) { dk++; dr += d[i]; dg += d[i + 1]; db += d[i + 2]; }
        }
      }
      const c = cy * gw + cx;
      if (a / n < 127.5) continue;
      on[c] = 1;
      if (dk && dk >= op * 0.22) { cells[c * 3] = dr / dk; cells[c * 3 + 1] = dg / dk; cells[c * 3 + 2] = db / dk; }
      else { cells[c * 3] = r / a; cells[c * 3 + 1] = g / a; cells[c * 3 + 2] = b / a; }
    }
  }
  const idx = [];
  for (let c = 0; c < gw * gh; c++) if (on[c]) idx.push(c);
  const W = gw + 2, H = gh + 2;
  const out = new Uint8ClampedArray(W * H * 4);
  if (!idx.length) return { width: W, height: H, data: out };
  const pts = new Float64Array(idx.length * 3);
  idx.forEach((c, i) => { pts[i * 3] = cells[c * 3]; pts[i * 3 + 1] = cells[c * 3 + 1]; pts[i * 3 + 2] = cells[c * 3 + 2]; });
  const { centers, labels } = kmeans(pts, colors, { seed: 11 });
  const pal = centers.map(c => c.map(Math.round));
  const dark = pal.reduce((m, c) => (luma(...c) < luma(...m) ? c : m), pal[0]);
  const put = (x, y, c) => { const o = (y * W + x) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255; };
  idx.forEach((c, i) => put(c % gw + 1, Math.floor(c / gw) + 1, pal[labels[i]]));
  // 외곽선: 불투명 칸과 4방향으로 닿는 투명 칸
  const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && out[(y * W + x) * 4 + 3] === 255;
  const ring = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!solid(x, y) && (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1))) ring.push([x, y]);
  }
  for (const [x, y] of ring) put(x, y, dark);
  return { width: W, height: H, data: out };
}

/** nearest 확대·축소 */
export function scaleNearest(img, W, H) {
  const { width: w, height: h, data: d } = img;
  const out = new Uint8ClampedArray(W * H * 4);
  const u32 = new Uint32Array(out.buffer), s32 = new Uint32Array(d.buffer, d.byteOffset, w * h);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(h - 1, Math.floor(y * h / H));
    for (let x = 0; x < W; x++) u32[y * W + x] = s32[sy * w + Math.min(w - 1, Math.floor(x * w / W))];
  }
  return { width: W, height: H, data: out };
}

/**
 * 2x2 -> 1칸. 어두운 선이 절반 이상이면 선 우선, 아니면 최빈색 (기준 구현 _half).
 * lines=false = 최빈색만 (이미 외곽선이 있는 완성 스프라이트를 여러 번 줄일 때: 선 우선이면 선만 남아 덩어리가 된다)
 */
export function half(sp, lines = true) {
  const W = Math.ceil(sp.width / 2), H = Math.ceil(sp.height / 2);
  const out = new Uint8ClampedArray(W * H * 4), d = sp.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const px = [];
    for (const [i, j] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
      const sx = x * 2 + i, sy = y * 2 + j;
      if (sx >= sp.width || sy >= sp.height) continue;
      const o = (sy * sp.width + sx) * 4;
      if (d[o + 3] > 127) px.push([d[o], d[o + 1], d[o + 2]]);
    }
    if (px.length < 2) continue;
    const dark = px.filter(p => luma(...p) < 70);
    let c;
    if (lines && dark.length * 2 >= px.length) c = dark[0];
    else {
      const cnt = new Map();
      for (const p of px) { const k = p.join(); cnt.set(k, (cnt.get(k) || 0) + 1); }
      const top = [...cnt].sort((a, b) => b[1] - a[1])[0][0];
      c = top.split(',').map(Number);
    }
    const o = (y * W + x) * 4;
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
  }
  return { width: W, height: H, data: out };
}

/**
 * 스프라이트를 (bw x bh) pt 상자에 맞춘 @k 이미지. 1칸 = c pt 정수배 nearest 라 @2x/@3x 가 같은 격자.
 * c=1 도 안 들어가면 0.7배까지 nearest 축소, 그보다 작아야 하면 반 해상도로.
 */
export function fitSprite(sp, bw, bh, k, lines = true) {
  const c = Math.floor(Math.min(bw / sp.width, bh / sp.height));
  if (c >= 1) return scaleNearest(sp, sp.width * c * k, sp.height * c * k);
  let f = Math.min(bw / sp.width, bh / sp.height);
  while (f < 0.7 && sp.width > 2 && sp.height > 2) { sp = half(sp, lines); f = Math.min(bw / sp.width, bh / sp.height); }
  if (f >= 1) return scaleNearest(sp, sp.width * k, sp.height * k);
  const w = Math.max(1, Math.floor(sp.width * f)), h = Math.max(1, Math.floor(sp.height * f));
  return scaleNearest(scaleNearest(sp, w, h), w * k, h * k);
}

/** 1pt=1px 로 그린 코드 도형: 알파 이진화(110) 후 nearest k배 (기준 구현 chrome) */
export function binarizeScale(img, k) {
  const d = new Uint8ClampedArray(img.data);
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 110 ? 255 : 0;
  return scaleNearest({ width: img.width, height: img.height, data: d }, img.width * k, img.height * k);
}

/** 가운데 가로 비율 f 만 남기기 (칸 단위로도 사용) */
export function centerCropX(img, f) {
  const cut = Math.floor(img.width * (1 - f) / 2);
  return crop(img, cut, 0, img.width - cut * 2, img.height);
}

