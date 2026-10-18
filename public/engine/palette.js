// 캐릭터 그림에서 테마 색 자동 파생: k-means 주색 -> OKLCH -> WCAG 대비 보정. DOM 없음.

// ---------- 색 변환 ----------
export const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
export const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

const toLin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const fromLin = c => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function rgbToOklch([r, g, b]) {
  const [R, G, B] = [r, g, b].map(toLin);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return [L, Math.hypot(a, bb), (Math.atan2(bb, a) * 180 / Math.PI + 360) % 360];
}

function oklchToLinear(L, C, H) {
  const a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

/** OKLCH -> '#RRGGBB', sRGB 밖이면 채도를 줄여 맞춤 */
export function oklch(L, C, H) {
  L = Math.min(1, Math.max(0, L));
  const ok = c => oklchToLinear(L, c, H).every(v => v >= -1e-4 && v <= 1 + 1e-4);
  if (!ok(C)) { let lo = 0, hi = C; for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; ok(mid) ? lo = mid : hi = mid; } C = lo; }
  return hex(...oklchToLinear(L, C, H).map(v => fromLin(Math.min(1, Math.max(0, v)))));
}

/** [r,g,b] 0~255 -> 상대 휘도 */
export function lumRgb(c) {
  const [r, g, b] = c.map(toLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const luminance = h => lumRgb(rgb(h));

/** WCAG 2.2 대비율 */
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// ---------- k-means (고정 시드) ----------
export function mulberry32(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/** pts: Float64Array (n*3). k-means++ 초기화, 반복 고정. -> { centers: [[r,g,b]], counts, labels } */
export function kmeans(pts, k, { seed = 7, iters = 12 } = {}) {
  const n = pts.length / 3;
  k = Math.max(1, Math.min(k, n));
  const rand = mulberry32(seed);
  const d2 = (i, c) => { const a = pts[i * 3] - c[0], b = pts[i * 3 + 1] - c[1], e = pts[i * 3 + 2] - c[2]; return a * a + b * b + e * e; };
  const centers = [];
  const first = Math.floor(rand() * n);
  centers.push([pts[first * 3], pts[first * 3 + 1], pts[first * 3 + 2]]);
  const best = new Float64Array(n).fill(Infinity);
  while (centers.length < k) {
    let sum = 0;
    for (let i = 0; i < n; i++) { best[i] = Math.min(best[i], d2(i, centers[centers.length - 1])); sum += best[i]; }
    if (sum === 0) break; // 남은 색이 전부 같음
    let t = rand() * sum, pick = n - 1;
    for (let i = 0; i < n; i++) { t -= best[i]; if (t <= 0) { pick = i; break; } }
    centers.push([pts[pick * 3], pts[pick * 3 + 1], pts[pick * 3 + 2]]);
  }
  const labels = new Int32Array(n);
  let counts = [];
  for (let it = 0; it < iters; it++) {
    const acc = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      let bi = 0, bd = Infinity;
      for (let c = 0; c < centers.length; c++) { const d = d2(i, centers[c]); if (d < bd) { bd = d; bi = c; } }
      labels[i] = bi; const a = acc[bi]; a[0] += pts[i * 3]; a[1] += pts[i * 3 + 1]; a[2] += pts[i * 3 + 2]; a[3]++;
    }
    acc.forEach((a, c) => { if (a[3]) centers[c] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
    counts = acc.map(a => a[3]);
  }
  return { centers, counts, labels };
}

/** 불투명 픽셀 샘플 (최대 max 개, 고른 간격) */
export function samplePixels(img, max = 20000) {
  const { data } = img, n = data.length / 4;
  let opaque = 0;
  for (let i = 0; i < n; i++) if (data[i * 4 + 3] > 127) opaque++;
  const step = Math.max(1, opaque / max);
  const out = [];
  let acc = 0, seen = 0;
  for (let i = 0; i < n && out.length < max * 3; i++) {
    if (data[i * 4 + 3] <= 127) continue;
    if (seen++ >= acc) { acc += step; out.push(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]); }
  }
  return Float64Array.from(out);
}

// L 을 0.02 씩 내리며 기준 대비 만족 (어두운 쪽으로)
function darkenUntil(L, C, H, against, ratio) {
  let c = oklch(L, C, H);
  while (contrast(c, against) < ratio && L > 0) { L -= 0.02; c = oklch(L, C, H); }
  return c;
}

/** 캐릭터 그림 -> Palette */
export function derive(img) {
  const pts = samplePixels(img);
  let H = 15, C = 0.05; // 무채색 그림 기본: 따뜻한 로즈
  if (pts.length) {
    const { centers, counts } = kmeans(pts, 5);
    let best = -1;
    centers.forEach((c, i) => {
      const [l, ch, h] = rgbToOklch(c);
      const score = ch * counts[i] * (l > 0.15 && l < 0.97 ? 1 : 0.2);
      if (score > best && ch > 0.03) { best = score; H = h; C = ch; }
    });
  }
  const bg = oklch(0.975, Math.min(C * 0.25, 0.018), H);
  const p = {
    bg,
    tabBg: oklch(0.955, Math.min(C * 0.3, 0.025), H),
    line: oklch(0.55, Math.min(C, 0.1), H),
    sendFill: oklch(0.88, Math.min(C, 0.09), H),
    sendSel: oklch(0.83, Math.min(C, 0.1), H),
    sendLine: oklch(0.7, Math.min(C, 0.13), H),
    recvFill: '#FFFFFF',
    recvSel: oklch(0.93, Math.min(C * 0.4, 0.03), H),
    keypad: oklch(0.96, Math.min(C * 0.35, 0.025), H),
    shadow: oklch(0.79, Math.min(C, 0.09), H),
  };
  p.text = darkenUntil(0.27, Math.min(C, 0.05), H, p.sendFill, 4.5);
  if (contrast(p.text, bg) < 4.5) p.text = darkenUntil(0.27, Math.min(C, 0.05), H, bg, 4.5);
  p.muted = darkenUntil(0.52, Math.min(C, 0.05), H, bg, 3);
  p.accent = darkenUntil(0.5, Math.max(Math.min(C, 0.2), 0.12), H, bg, 4.5);
  // 받은 말풍선 테두리: 배경과 대비 1.8 이상
  p.recvLine = darkenUntil(0.85, Math.min(C * 0.4, 0.04), H, bg, 1.8);
  return {
    bg: p.bg, tabBg: p.tabBg, line: p.line, text: p.text, muted: p.muted, accent: p.accent,
    sendFill: p.sendFill, sendSel: p.sendSel, sendLine: p.sendLine,
    recvFill: p.recvFill, recvSel: p.recvSel, recvLine: p.recvLine, keypad: p.keypad, shadow: p.shadow,
  };
}

export const PALETTE_KEYS = ['bg', 'tabBg', 'line', 'text', 'muted', 'accent', 'sendFill', 'sendSel', 'sendLine', 'recvFill', 'recvSel', 'recvLine', 'keypad', 'shadow'];

/** OKLCH 로 밝기만 이동 (CSS 파생색·틴트용) */
export function shiftL(h, dL) {
  const [L, C, H] = rgbToOklch(rgb(h));
  return oklch(L + dL, C, H);
}
