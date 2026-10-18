// 배경 지우기: 네 변에서 시작해 연결된 배경색 영역만 투명으로 (BFS). DOM 없음.

/** 투명(알파 < 128) 픽셀 비율 */
export function transparentRatio(img) {
  const d = img.data, n = d.length / 4;
  let t = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 128) t++;
  return t / n;
}

// 네 변 픽셀의 최빈색 (채널당 4비트 양자화 후 그 칸의 평균)
function edgeColor(img) {
  const { width: w, height: h, data: d } = img;
  const bins = new Map();
  const add = i => {
    const key = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | d[i + 2] >> 4;
    const b = bins.get(key) || [0, 0, 0, 0];
    b[0] += d[i]; b[1] += d[i + 1]; b[2] += d[i + 2]; b[3]++;
    bins.set(key, b);
  };
  for (let x = 0; x < w; x++) { add(x * 4); add(((h - 1) * w + x) * 4); }
  for (let y = 1; y < h - 1; y++) { add(y * w * 4); add((y * w + w - 1) * 4); }
  let top = null;
  for (const b of bins.values()) if (!top || b[3] > top[3]) top = b;
  return [top[0] / top[3], top[1] / top[3], top[2] / top[3]];
}

// 창 안(2r+1 정사각)이 전부 1 이면 1 (밖은 1 로 침). 누적 개수로 O(n)
function boxAll(m, w, h, r) {
  const t = new Uint8Array(w * h), o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const b = y * w; let z = 0;
    for (let x = 0; x < Math.min(r, w); x++) z += !m[b + x];
    for (let x = 0; x < w; x++) { if (x + r < w) z += !m[b + x + r]; if (x > r) z -= !m[b + x - r - 1]; t[b + x] = z === 0; }
  }
  for (let x = 0; x < w; x++) {
    let z = 0;
    for (let y = 0; y < Math.min(r, h); y++) z += !t[y * w + x];
    for (let y = 0; y < h; y++) { if (y + r < h) z += !t[(y + r) * w + x]; if (y > r) z -= !t[(y - r - 1) * w + x]; o[y * w + x] = z === 0; }
  }
  return o;
}

const dist2 = (d, i, j) => { const a = d[i] - d[j], b = d[i + 1] - d[j + 1], c = d[i + 2] - d[j + 2]; return a * a + b * b + c * c; };

/**
 * 가장자리와 이어진 배경만 지운다. 안쪽에 같은 색이 있어도 이어져 있지 않으면 보존.
 * 알파는 0/255 (페더 없음). 이미 투명 PNG(투명 >= 5%)면 복사본을 그대로 돌려준다.
 * 배경색과 비슷한 털·옷이 윤곽 틈으로 이어져 속이 파이는 것을 막으려고 두 가지를 더 건다.
 *  1) 침식: 배경 후보(시작색과 거리 <= tol)를 r 칸 깎은 '알맹이'에서만 번진다. 폭 2r 이하 틈은 못 지나간다.
 *     번진 영역을 다시 r 칸 넓혀 배경 후보와 겹치는 곳만 지운다(윤곽은 원래대로).
 *  2) 이음새: 이웃으로 넘어갈 때 색 차이가 배경 잡음(테두리 이웃 차이 중앙값 x1.5, 최소 4)보다 크면 안 넘어간다.
 * ponytail: 배경 잡음이 큰 사진은 낮은 tol 에서 덜 지워진다(슬라이더를 올리면 됨). 그라데이션이 큰 배경은 tol 로만 버팀.
 */
export function removeEdgeBackground(img, tol = 24) {
  const { width: w, height: h } = img, n = w * h;
  const data = new Uint8ClampedArray(img.data);
  const out = { width: w, height: h, data };
  if (transparentRatio(img) >= 0.05) return out;
  const [br, bg, bb] = edgeColor(img), t2 = tol * tol;
  const near = new Uint8Array(n);
  for (let p = 0; p < n; p++) { const i = p * 4, r = data[i] - br, g = data[i + 1] - bg, b = data[i + 2] - bb; near[p] = r * r + g * g + b * b <= t2; }
  const ds = [];
  for (let x = 1; x < w; x++) ds.push(dist2(data, x * 4, x * 4 - 4), dist2(data, ((h - 1) * w + x) * 4, ((h - 1) * w + x) * 4 - 4));
  for (let y = 1; y < h; y++) ds.push(dist2(data, y * w * 4, (y - 1) * w * 4), dist2(data, (y * w + w - 1) * 4, ((y - 1) * w + w - 1) * 4));
  ds.sort((a, b) => a - b);
  const step = Math.max(4, 1.5 * Math.sqrt(ds[ds.length >> 1] || 0)), s2 = step * step;
  const R = Math.max(1, Math.round(Math.max(w, h) / 300));
  const core = boxAll(near, w, h, R);
  const fill = new Uint8Array(n), queue = new Int32Array(n);
  let head = 0, tail = 0;
  const push = (p, from) => {
    if (fill[p] || !core[p] || (from >= 0 && dist2(data, p * 4, from * 4) > s2)) return;
    fill[p] = 1; queue[tail++] = p;
  };
  for (let x = 0; x < w; x++) { push(x, -1); push((h - 1) * w + x, -1); }
  for (let y = 0; y < h; y++) { push(y * w, -1); push(y * w + w - 1, -1); }
  while (head < tail) {
    const p = queue[head++], x = p % w;
    if (x > 0) push(p - 1, p);
    if (x < w - 1) push(p + 1, p);
    if (p >= w) push(p - w, p);
    if (p < w * (h - 1)) push(p + w, p);
  }
  const keep = boxAll(fill.map(v => !v), w, h, R); // 0 = 번진 영역에서 r 칸 안
  for (let p = 0; p < n; p++) if (!keep[p] && near[p]) data[p * 4 + 3] = 0;
  return out;
}

/** 알파 > 10 인 영역의 bbox 로 자르기 (없으면 원본) */
export function cropToAlpha(img, thr = 10) {
  const { width: w, height: h, data: d } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return { width: w, height: h, data: new Uint8ClampedArray(d) };
  return crop(img, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

export function crop(img, x0, y0, cw, ch) {
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) out.set(img.data.subarray(((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x0 + cw) * 4), y * cw * 4);
  return { width: cw, height: ch, data: out };
}

/** 면적 평균 축소 (긴 변 max 이하로). 알파 가중이라 투명 가장자리가 검게 번지지 않음 */
export function downscale(img, max = 1024) {
  const { width: w, height: h, data: d } = img;
  const s = max / Math.max(w, h);
  if (s >= 1) return img;
  const W = Math.max(1, Math.round(w * s)), H = Math.max(1, Math.round(h * s));
  const out = new Uint8ClampedArray(W * H * 4);
  for (let Y = 0; Y < H; Y++) {
    const ya = Math.floor(Y * h / H), yb = Math.max(ya + 1, Math.floor((Y + 1) * h / H));
    for (let X = 0; X < W; X++) {
      const xa = Math.floor(X * w / W), xb = Math.max(xa + 1, Math.floor((X + 1) * w / W));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
        const i = (y * w + x) * 4, al = d[i + 3];
        r += d[i] * al; g += d[i + 1] * al; b += d[i + 2] * al; a += al; n++;
      }
      const o = (Y * W + X) * 4;
      if (a) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; }
      out[o + 3] = a / n;
    }
  }
  return { width: W, height: H, data: out };
}

/** 사진 -> 캐릭터: 크면 줄이고, 투명이 아니면 가장자리 배경 지우기, 알파 bbox 크롭 */
export function prepareCharacter(img, { tolerance = 24 } = {}) {
  let im = downscale(img, 1024);
  if (transparentRatio(im) < 0.05) im = removeEdgeBackground(im, tolerance);
  return cropToAlpha(im);
}
