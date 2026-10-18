// 배경 지우기 벤치마크: 정답 알파가 있는 투명 PNG 캐릭터를 여러 배경에 합성 -> removeEdgeBackground -> 정답과 비교.
// 실행: node tests/keying-bench.mjs [--tol 32] [--out] [--only 케이스,..] [--src 이름,..]
//  --out  : private/keying-bench/out/<캐릭터>-<케이스>.png 저장 (합성 | 결과(자주색 위) | 오차지도: 빨강=배경 잔여, 파랑=전경 손실)
// 캐릭터 소스: public/demo/*.png(오리지널) + 코드로 그린 흰 몸통 도형 + private/keying-bench/src/*.png(로컬 전용, 커밋 안 함).
// 의존성 0 (node 내장 zlib 만). 결정적(시드 고정 난수).
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { cropToAlpha, downscale, removeEdgeBackground } from '../public/engine/keying.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const arg = k => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1]; };
const TOL = +(arg('--tol') ?? 32); // app.js TOL0 와 같은 시작값
const SAVE = process.argv.includes('--out');
const ONLY = arg('--only')?.split(','), SRC = arg('--src')?.split(',');
const S = 1024, FIT = 760; // 캔버스 한 변, 캐릭터 긴 변

// ---------- PNG 읽기/쓰기 (8비트, 비인터레이스, 색형식 2·6 만) ----------
function decodePNG(buf) {
  let p = 8, w, h, ct, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8 || d[12]) throw new Error('8비트 비인터레이스만'); }
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const bpp = { 2: 3, 6: 4 }[ct]; if (!bpp) throw new Error('색형식 ' + ct + ' 미지원');
  const raw = inflateSync(Buffer.concat(idat)), st = w * bpp, px = new Uint8Array(h * st);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (st + 1)], s = y * (st + 1) + 1, o = y * st;
    for (let x = 0; x < st; x++) {
      const a = x >= bpp ? px[o + x - bpp] : 0, b = y ? px[o - st + x] : 0, c = x >= bpp && y ? px[o - st + x - bpp] : 0;
      let v = raw[s + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[o + x] = v;
    }
  }
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = px[i * bpp]; data[i * 4 + 1] = px[i * bpp + 1]; data[i * 4 + 2] = px[i * bpp + 2]; data[i * 4 + 3] = bpp === 4 ? px[i * 4 + 3] : 255; }
  return { width: w, height: h, data };
}
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = b => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function encodePNG({ width: w, height: h, data }) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) Buffer.from(data.buffer, data.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length); b.write(t, 4, 'latin1'); d.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw, { level: 3 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- 결정적 난수 ----------
const rng = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = r => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- 캐릭터 소스 ----------
// 코드로 그린 흰 몸통 도형: 흰 몸 + 얇은 진회색 윤곽 + 눈·볼 (4배 슈퍼샘플로 반투명 경계). 흰 캐릭터 몸통 파먹힘을 커밋 가능한 그림으로 재현.
function drawBlob() {
  const W = 600, H = 560, SS = 4, d = new Uint8ClampedArray(W * H * 4);
  const ink = [60, 56, 64], body = [255, 255, 255], cheek = [255, 182, 193];
  const shade = (x, y) => {
    const ex = (x - 300) / 250, ey = (y - 300) / 230, r = Math.hypot(ex, ey); // 몸통 타원
    const ear = (cx) => Math.hypot((x - cx) / 55, (y - 95) / 70); // 귀
    const inBody = r <= 1, inEar = Math.min(ear(170), ear(430)) <= 1;
    if (!inBody && !inEar) return null;
    const edgeB = inBody && r > 1 - 6 / 240, edgeE = !inBody && Math.min(ear(170), ear(430)) > 1 - 6 / 60;
    if (edgeB || edgeE) return ink;
    if (Math.hypot(x - 230, y - 290) < 16 || Math.hypot(x - 370, y - 290) < 16) return ink; // 눈
    if (Math.hypot((x - 195) / 30, (y - 345) / 16) < 1 || Math.hypot((x - 405) / 30, (y - 345) / 16) < 1) return cheek;
    return body;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) { const c = shade(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS); if (c) { r += c[0]; g += c[1]; b += c[2]; a++; } }
    const i = (y * W + x) * 4; if (a) { d[i] = r / a; d[i + 1] = g / a; d[i + 2] = b / a; d[i + 3] = 255 * a / (SS * SS); }
  }
  return { width: W, height: H, data: d };
}
function sources() {
  const list = [];
  for (const f of readdirSync(ROOT + 'public/demo').filter(f => f.endsWith('.png'))) list.push(['demo-' + f.slice(0, -4), () => decodePNG(readFileSync(ROOT + 'public/demo/' + f))]);
  list.push(['shape-blob', drawBlob]);
  const priv = ROOT + 'private/keying-bench/src';
  if (existsSync(priv)) for (const f of readdirSync(priv).filter(f => f.endsWith('.png')).sort()) list.push(['priv-' + f.slice(0, -4), () => decodePNG(readFileSync(priv + '/' + f))]);
  return list.filter(([n]) => !SRC || SRC.some(s => n.includes(s)));
}

// 캐릭터를 S x S 캔버스에 배치한 정답 레이어(RGBA, 알파 = 정답). dy: 아래로 밀기(테두리 닿음 케이스)
function place(ch, dy = 0) {
  const fg = new Uint8ClampedArray(S * S * 4);
  const x0 = (S - ch.width) >> 1, y0 = ((S - ch.height) >> 1) + dy;
  for (let y = 0; y < ch.height; y++) { const Y = y0 + y; if (Y < 0 || Y >= S) continue; for (let x = 0; x < ch.width; x++) { const i = (y * ch.width + x) * 4, o = (Y * S + x0 + x) * 4; for (let k = 0; k < 4; k++) fg[o + k] = ch.data[i + k]; } }
  return { fg, box: [x0, y0, ch.width, ch.height] };
}

// ---------- 배경 케이스 ----------
// 각 케이스: bg(x,y,r) -> [r,g,b] (r: 난수), 선택적 post(합성 결과 후처리), dy, shadow
const CREAM = [250, 243, 224];
function lowNoise(seed, cells, cols) { // 저주파 다색 잡음: 격자 난수 색을 쌍선형 보간
  const r = rng(seed), g = [];
  for (let i = 0; i <= cells; i++) { g.push([]); for (let j = 0; j <= cells; j++) g[i].push(cols[Math.floor(r() * cols.length)].map(v => v + (r() - 0.5) * 40)); }
  return (x, y) => {
    const fx = x / S * cells, fy = y / S * cells, i = Math.min(cells - 1, fy | 0), j = Math.min(cells - 1, fx | 0), ty = fy - i, tx = fx - j;
    const sm = t => t * t * (3 - 2 * t), a = sm(tx), b = sm(ty);
    return [0, 1, 2].map(k => lerp(lerp(g[i][j][k], g[i][j + 1][k], a), lerp(g[i + 1][j][k], g[i + 1][j + 1][k], a), b));
  };
}
const photo = (() => { const lo = lowNoise(7, 6, [[196, 170, 140], [120, 150, 110], [170, 190, 210], [230, 210, 180], [150, 120, 100]]), hi = lowNoise(9, 40, [[0, 0, 0], [30, 30, 30]]); return (x, y) => { const a = lo(x, y), b = hi(x, y); return a.map((v, k) => v + (b[k] - 15) * 0.6); }; })();
const CASES = {
  white: { bg: () => [255, 255, 255] },
  cream: { bg: () => CREAM },
  vgrad: { bg: (x, y) => [lerp(255, 205, y / S), lerp(232, 225, y / S), lerp(238, 250, y / S)] },
  radial: { bg: (x, y) => { const t = Math.min(1, Math.hypot(x - S / 2, y - S / 2) / (S * 0.72)); return [lerp(255, 200, t), lerp(253, 205, t), lerp(245, 235, t)]; } },
  checker8: { bg: (x, y) => ((x >> 3) + (y >> 3)) & 1 ? [204, 204, 204] : [255, 255, 255] },
  checker16: { bg: (x, y) => ((x >> 4) + (y >> 4)) & 1 ? [230, 230, 230] : [255, 255, 255] },
  jpeg70: { bg: () => CREAM, post: jpegish },
  dots: { bg: (x, y) => { const cx = (Math.round(x / 36) * 36), cy = (Math.round(y / 36) * 36) + ((Math.round(x / 36) & 1) * 18); return Math.hypot(x - cx, y - cy) < 7 ? [255, 200, 214] : [255, 248, 240]; } },
  stripes: { bg: (x, y) => (((x + y) / 18) | 0) & 1 ? [214, 236, 255] : [255, 250, 225] },
  photo: { bg: photo },
  shadow: { bg: () => [255, 255, 255], shadow: true },
  cutoff: { bg: () => [255, 255, 255], dy: 260 },
};

// JPEG 품질 70 흉내: 채널별 8x8 DCT -> 표준 휘도 양자화표(q70 배율) -> 역DCT, 더해 약한 잡음. 윤곽 주변 링잉·블록 경계가 생긴다.
function jpegish(d) {
  const Q = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99].map(q => Math.max(1, Math.round(q * 0.6)));
  const C = new Float64Array(64); for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) C[u * 8 + x] = (u ? 0.5 : Math.SQRT1_2 / 2) * Math.cos((2 * x + 1) * u * Math.PI / 16);
  const b = new Float64Array(64), t = new Float64Array(64), r = rng(70);
  for (let by = 0; by < S; by += 8) for (let bx = 0; bx < S; bx += 8) for (let k = 0; k < 3; k++) {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) b[y * 8 + x] = d[((by + y) * S + bx + x) * 4 + k] - 128;
    for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) { let s = 0; for (let y = 0; y < 8; y++) s += C[u * 8 + y] * b[y * 8 + x]; t[u * 8 + x] = s; } // 세로
    for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) { let s = 0; for (let x = 0; x < 8; x++) s += C[v * 8 + x] * t[u * 8 + x]; b[u * 8 + v] = Math.round(s / Q[u * 8 + v]) * Q[u * 8 + v]; } // 가로+양자화
    for (let y = 0; y < 8; y++) for (let v = 0; v < 8; v++) { let s = 0; for (let u = 0; u < 8; u++) s += C[u * 8 + y] * b[u * 8 + v]; t[y * 8 + v] = s; }
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { let s = 0; for (let v = 0; v < 8; v++) s += C[v * 8 + x] * t[y * 8 + v]; d[((by + y) * S + bx + x) * 4 + k] = s + 128 + gauss(r) * 2; }
  }
}

function compose(fg, box, cs) {
  const d = new Uint8ClampedArray(S * S * 4), r = rng(1);
  const [bx, by, bw, bh] = box, sx = bx + bw / 2, sy = Math.min(S - 40, by + bh - bh * 0.04), rx = bw * 0.42, ry = bh * 0.07;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4, a = fg[i + 3] / 255;
    let c = cs.bg(x, y, r);
    if (cs.shadow) { const e = Math.hypot((x - sx) / rx, (y - sy) / ry), k = 0.38 * Math.max(0, Math.min(1, (1.25 - e) / 0.6)); c = c.map(v => v * (1 - k) + 110 * k); } // 부드러운 회색 그림자
    for (let k = 0; k < 3; k++) d[i + k] = fg[i + k] * a + c[k] * (1 - a);
    d[i + 3] = 255;
  }
  if (cs.post) cs.post(d);
  return { width: S, height: S, data: d };
}

// ---------- 지표 ----------
// 정사각 창(2r+1) 안에 1 이 하나라도 있으면 1 (팽창). 누적합 O(n)
function dilate(m, r) {
  const t = new Uint8Array(S * S), o = new Uint8Array(S * S);
  for (let y = 0; y < S; y++) { let z = 0; const b = y * S; for (let x = 0; x < Math.min(r, S); x++) z += m[b + x]; for (let x = 0; x < S; x++) { if (x + r < S) z += m[b + x + r]; if (x > r) z -= m[b + x - r - 1]; t[b + x] = z > 0; } }
  for (let x = 0; x < S; x++) { let z = 0; for (let y = 0; y < Math.min(r, S); y++) z += t[y * S + x]; for (let y = 0; y < S; y++) { if (y + r < S) z += t[(y + r) * S + x]; if (y > r) z -= t[(y - r - 1) * S + x]; o[y * S + x] = z > 0; } }
  return o;
}
function metrics(gt, out) {
  const n = S * S, T = new Uint8Array(n), P = new Uint8Array(n), anyT = new Uint8Array(n);
  for (let p = 0; p < n; p++) { T[p] = gt[p * 4 + 3] >= 128; P[p] = out[p * 4 + 3] >= 128; anyT[p] = gt[p * 4 + 3] > 0; }
  const dT = dilate(T, 3), dB = dilate(T.map(v => 1 - v), 3), dAny = dilate(anyT, 3);
  let inter = 0, uni = 0, bg = 0, bgLeft = 0, fg = 0, fgLost = 0, band = 0, bandErr = 0, ring = 0, ringA = 0;
  for (let p = 0; p < n; p++) {
    const t = T[p], q = P[p], ga = gt[p * 4 + 3], pa = out[p * 4 + 3];
    inter += t & q; uni += t | q;
    if (!ga) { bg++; bgLeft += q; } // 순수 배경인데 남음
    if (t) { fg++; fgLost += 1 - q; } // 전경인데 지워짐
    if (dT[p] && dB[p]) { band++; bandErr += Math.abs(pa - ga); } // 정답 경계 +-3px
    if (dAny[p] && !anyT[p]) { ring++; ringA += pa; } // 캐릭터 바깥 1~3px: 남은 알파 = 배경색 헤일로
  }
  return { iou: inter / uni, bgRes: bgLeft / bg, fgLoss: fgLost / fg, edge: bandErr / band / 255, halo: ringA / ring / 255 };
}

// 저장용 3단 이미지: 합성 | 결과(자주색 위) | 오차지도 (절반 크기)
function saveTriptych(file, img, gt, out) {
  const W = S * 3, d = new Uint8ClampedArray(W * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4, a = out[i + 3] / 255, t = gt[i + 3] >= 128, q = out[i + 3] >= 128;
    const put = (k, c) => { const o = (y * W + k * S + x) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; };
    put(0, [img.data[i], img.data[i + 1], img.data[i + 2]]);
    put(1, [0, 1, 2].map(k => out[i + k] * a + [255, 0, 255][k] * (1 - a)));
    put(2, t && !q ? [40, 90, 255] : !t && q ? [255, 40, 40] : t ? [200, 200, 200] : [255, 255, 255]);
  }
  writeFileSync(file, encodePNG(downscale({ width: W, height: S, data: d }, W / 2)));
}

// ---------- 실행 ----------
const OUT = ROOT + 'private/keying-bench/out';
if (SAVE) mkdirSync(OUT, { recursive: true });
const caseNames = Object.keys(CASES).filter(c => !ONLY || ONLY.includes(c));
const rows = [], byCase = {};
const pct = v => (v * 100).toFixed(1).padStart(5);
console.log(`tol=${TOL}  캔버스 ${S}px  (IoU 높을수록, 나머지 낮을수록 좋음)`);
console.log('소스'.padEnd(22) + '케이스'.padEnd(11) + '  IoU 배경잔여 전경손실 경계MAE 헤일로    ms');
for (const [name, load] of sources()) {
  let ch = cropToAlpha(load()); ch = downscale(ch, FIT);
  for (const c of caseNames) {
    const cs = CASES[c], { fg, box } = place(ch, cs.dy || 0), img = compose(fg, box, cs);
    const t0 = performance.now(), res = removeEdgeBackground(img, TOL), ms = performance.now() - t0;
    const m = metrics(fg, res.data); m.ms = ms;
    rows.push([name, c, m]); (byCase[c] ||= []).push(m);
    console.log(name.padEnd(22) + c.padEnd(11) + pct(m.iou) + '    ' + pct(m.bgRes) + '   ' + pct(m.fgLoss) + '   ' + pct(m.edge) + '  ' + pct(m.halo) + ms.toFixed(0).padStart(6));
    if (SAVE) saveTriptych(`${OUT}/${name}-${c}.png`, img, fg, res.data);
  }
}
const avg = (a, k) => a.reduce((s, m) => s + m[k], 0) / a.length;
console.log('\n케이스 평균'.padEnd(23) + '  IoU 배경잔여 전경손실 경계MAE 헤일로    ms');
for (const [c, a] of Object.entries(byCase)) console.log(c.padEnd(22) + pct(avg(a, 'iou')) + '    ' + pct(avg(a, 'bgRes')) + '   ' + pct(avg(a, 'fgLoss')) + '   ' + pct(avg(a, 'edge')) + '  ' + pct(avg(a, 'halo')) + avg(a, 'ms').toFixed(0).padStart(6));
// 총점: 100 x 평균(IoU x (1-경계MAE) x (1-헤일로)). IoU 가 배경 잔여·전경 손실을 함께 깎는다.
const all = rows.map(r => r[2]), score = 100 * all.reduce((s, m) => s + m.iou * (1 - m.edge) * (1 - m.halo), 0) / all.length;
console.log(`\n총점 ${score.toFixed(1)} / 100  (평균 IoU ${pct(avg(all, 'iou'))}, 평균 ${avg(all, 'ms').toFixed(0)}ms, 최대 ${Math.max(...all.map(m => m.ms)).toFixed(0)}ms, ${all.length}건)`);
