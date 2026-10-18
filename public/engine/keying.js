// 배경 지우기: 네 변에서 시작해 '배경 기준색'을 따라 번지는 BFS + 테두리 다색 팔레트 + 그림자 + 경계 소프트 매트. DOM 없음.

/** 투명(알파 < 128) 픽셀 비율 */
export function transparentRatio(img) {
  const d = img.data, n = d.length / 4;
  let t = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 128) t++;
  return t / n;
}

const d2 = (a, b, c) => a * a + b * b + c * c;

// 네 변 픽셀 목록 (중복 없이, 시계 방향)
function borderIdx(w, h) {
  const b = [];
  for (let x = 0; x < w; x++) b.push(x);
  for (let y = 1; y < h; y++) b.push(y * w + w - 1);
  for (let x = w - 2; x >= 0; x--) b.push((h - 1) * w + x);
  for (let y = h - 2; y > 0; y--) b.push(y * w);
  return b;
}

// 테두리 팔레트: 4비트 칸 최빈 순으로 후보를 잡고, 반경 th 안 평균으로 두 번 당겨 '정확한' 배경색으로 (흰 몸통 252 가 흰 배경 255 평균을 끌어내리지 않게)
function borderPalette(d, bi, th, w, h) {
  const bins = new Map(), side = new Map();
  for (let j = 0; j < bi.length; j++) {
    const p = bi[j], i = p * 4, k = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | d[i + 2] >> 4;
    bins.set(k, (bins.get(k) || 0) + 1);
    const x = p % w, y = (p / w) | 0, sd = y === 0 ? 0 : x === w - 1 ? 1 : y === h - 1 ? 2 : 3; // 위·오른쪽·아래·왼쪽
    const s = side.get(k) || [0, 0, 0, 0]; s[sd]++; side.set(k, s);
  }
  const order = [...bins].sort((a, b) => b[1] - a[1]), pal = [], t2 = th * th;
  for (const [k, cnt] of order) {
    if (cnt < bi.length * 0.03 || pal.length >= 8) break;
    // 세 변 이상에 (그 변의 3% 이상) 나와야 배경색. 한 변에 걸친 머리카락·몸통 색은 팔레트에서 뺀다
    const sd = side.get(k); if ([w, h, w, h].filter((len, j) => sd[j] >= len * 0.03).length < 3) continue;
    let c = null;
    for (let it = 0; it < 3; it++) { // 첫 번은 그 칸 픽셀 평균, 다음 두 번은 반경 th 안 평균
      let s0 = 0, s1 = 0, s2 = 0, m = 0;
      for (const p of bi) {
        const i = p * 4;
        if (c ? d2(d[i] - c[0], d[i + 1] - c[1], d[i + 2] - c[2]) <= t2 : ((d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | d[i + 2] >> 4) === k) { s0 += d[i]; s1 += d[i + 1]; s2 += d[i + 2]; m++; }
      }
      if (!m) break;
      c = [s0 / m, s1 / m, s2 / m];
    }
    if (pal.every(q => d2(q[0] - c[0], q[1] - c[1], q[2] - c[2]) > t2)) pal.push(c);
  }
  return pal;
}

/**
 * 가장자리와 이어진 배경만 지운다. 이미 투명 PNG(투명 >= 5%)면 복사본을 그대로 돌려준다.
 *  1) 기준색 번짐: 각 배경 픽셀은 기준색 ref 를 갖고, 이웃은 ref 와의 거리 <= th 일 때만 들어온다.
 *     ref 는 새 픽셀 쪽으로 1/4 씩만 따라가서 완만한 그라데이션·그림자는 따라가되, 2~3px 경계를 타고 흰 몸통으로 새지는 않는다.
 *     th = tol/10 + 테두리 잡음x1.5. ref 이동은 테두리에서 잰 기울기(x2)로 제한해 평평한 배경에선 거의 안 움직인다. 이웃 차이가 아니라 '배경 기준색과의 거리'로 막는 게 핵심 (흰 배경 255 vs 흰 몸통 252 도 갈림).
 *  2) 팔레트 점프: 테두리에 3% 이상, 세 변 이상에 나오는 색(최대 8)과 th 안이면 ref 와 멀어도 들어온다 (체커·줄무늬·점무늬).
 *     팔레트가 테두리 절반도 못 덮으면(사진 배경) 테두리 전체가 씨앗.
 *  그림자: ref 를 같은 비율로 어둡게 한 색이면서 계속 어두워지는 완만한 띠는 따라 들어간다(잡음 없는 그림만).
 *  구멍: 팔레트 두 색 이상이 섞인 갇힌 덩어리(체커가 보이는 팔 사이)만 지운다. 단색 구멍은 흰 몸통과 못 가르니 남긴다.
 *  3) 소프트 매트: 배경과 2px 안의 전경 픽셀은 알파 = (색 - 배경) 을 (안쪽 전경색 - 배경) 에 투영한 비율, 색에서 배경을 걷어낸다.
 */
export function removeEdgeBackground(img, tol = 24) {
  const { width: w, height: h } = img, n = w * h;
  const data = new Uint8ClampedArray(img.data);
  const out = { width: w, height: h, data };
  if (transparentRatio(img) >= 0.05 || tol <= 0 || w < 3 || h < 3) return out;
  const bi = borderIdx(w, h);
  // 테두리 잡음: 테두리 이웃끼리 거리의 중앙값
  const ds = new Float32Array(bi.length);
  for (let k = 0; k < bi.length; k++) { const i = bi[k] * 4, j = bi[(k + 1) % bi.length] * 4; ds[k] = Math.sqrt(d2(data[i] - data[j], data[i + 1] - data[j + 1], data[i + 2] - data[j + 2])); }
  ds.sort();
  const noise = Math.max(ds[ds.length >> 1], ds[Math.floor(ds.length * 0.75)] / 2);
  // 테두리 기울기: 테두리를 9칸 평균으로 다듬은 뒤 k 칸 떨어진 거리/k 의 중앙값 (k=16..40 중 최소: 체커·줄무늬 주기는 0 이 된다).
  // 배경이 평평하면 ref 가 거의 안 움직여 흰 몸통으로 못 샌다
  const L = bi.length, sm = new Float32Array(L * 3);
  for (let k = 0; k < L; k++) for (let c = 0; c < 3; c++) { let s = 0; for (let j = -4; j <= 4; j++) s += data[bi[(k + j + L) % L] * 4 + c]; sm[k * 3 + c] = s / 9; }
  let rate = Infinity;
  for (let off = 16; off <= 40; off += 4) {
    const gs = new Float32Array(L);
    for (let k = 0; k < L; k++) { const a = k * 3, b = ((k + off) % L) * 3; gs[k] = Math.sqrt(d2(sm[a] - sm[b], sm[a + 1] - sm[b + 1], sm[a + 2] - sm[b + 2])) / off; }
    gs.sort(); rate = Math.min(rate, gs[L >> 1]);
  }
  const drift = 0.05 + 2 * rate;
  const th = tol / 10 + 1.5 * noise, t2 = th * th;
  const pal = borderPalette(data, bi, th, w, h);
  const palHit = (i) => { for (const q of pal) if (d2(data[i] - q[0], data[i + 1] - q[1], data[i + 2] - q[2]) <= t2) return q; return null; };

  const bgm = new Uint8Array(n), ref = new Float32Array(n * 3), queue = new Int32Array(n);
  let head = 0, tail = 0;
  const LAM = 0.25, sStep = noise <= 1.5 ? 2 : 0; // ponytail: 잡음 큰(JPEG) 그림의 그림자는 남는다
  const take = (p, r0, r1, r2) => { bgm[p] = 1; ref[p * 3] = r0; ref[p * 3 + 1] = r1; ref[p * 3 + 2] = r2; queue[tail++] = p; };
  let hits = 0;
  for (const p of bi) { const q = palHit(p * 4); if (q && !bgm[p]) { take(p, q[0], q[1], q[2]); hits++; } }
  // 팔레트가 테두리 절반도 못 덮으면(사진·얼룩 배경) 테두리 전체를 제 색으로 씨앗 삼는다.
  // ponytail: 이때는 테두리에 닿은 캐릭터 부분도 씨앗이 된다. 사진 배경 + 잘린 캐릭터가 흔해지면 테두리 구간별 판정 추가
  if (hits < bi.length / 2) for (const p of bi) if (!bgm[p]) take(p, data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
  const tryP = (p, q) => {
    if (bgm[p]) return;
    const i = p * 4, a = q * 3, e0 = data[i] - ref[a], e1 = data[i + 1] - ref[a + 1], e2 = data[i + 2] - ref[a + 2];
    const e = d2(e0, e1, e2);
    if (e <= t2) { const f = Math.min(LAM, drift / Math.sqrt(e || 1)); return take(p, ref[a] + f * e0, ref[a + 1] + f * e1, ref[a + 2] + f * e2); }
    const c = palHit(i);
    if (c) return take(p, c[0], c[1], c[2]);
    // 그림자: ref(배경색)를 같은 비율로 어둡게 한 색(e = t*ref, t<0)이고 이웃과 완만하면(<= sStep) 지운다. ref 는 그대로 둔다.
    // 얕은 곳(채널당 15 미만)은 이웃보다 더 어두워질 때만 들어온다: 그림자 띠는 계속 어두워지고,
    // 흰 몸통 경계(255 -> 252 후 평평)는 2~3px 만에 멈춘다. 잡음 큰 사진에서는 끈다
    if (!sStep) return;
    const rr = d2(ref[a], ref[a + 1], ref[a + 2]), t = (e0 * ref[a] + e1 * ref[a + 1] + e2 * ref[a + 2]) / (rr || 1);
    if (t >= 0 || t < -0.7) return;
    const j = q * 4, f0 = e0 - t * ref[a], f1 = e1 - t * ref[a + 1], f2 = e2 - t * ref[a + 2];
    if (d2(f0, f1, f2) > (2 + 0.1 * Math.sqrt(e)) ** 2 || d2(data[i] - data[j], data[i + 1] - data[j + 1], data[i + 2] - data[j + 2]) > sStep * sStep) return;
    if (-t * Math.sqrt(rr / 3) < 15 && data[i] + data[i + 1] + data[i + 2] >= data[j] + data[j + 1] + data[j + 2]) return;
    take(p, ref[a], ref[a + 1], ref[a + 2]);
  };
  while (head < tail) {
    const p = queue[head++], x = p % w;
    if (x > 0) tryP(p - 1, p);
    if (x < w - 1) tryP(p + 1, p);
    if (p >= w) tryP(p - w, p);
    if (p < n - w) tryP(p + w, p);
  }
  if (pal.length >= 2) holes(data, bgm, ref, w, h, pal, t2);
  specks(data, bgm, ref, w, h);
  matte(data, bgm, ref, w, h, th * 1.25); // 매트 눈금은 조금 넉넉히 (링잉 점을 더 옅게)
  return out;
}

// 티끌: 배경에 둘러싸인 작은 전경 덩어리(사진 잡음·JPEG 점, 이미지의 1/20000 또는 16px 미만)는 배경으로.
// 이게 남으면 cropToAlpha 의 bbox 가 사진 전체로 커져 캐릭터가 작게 들어간다.
// ponytail: 의도한 아주 작은 떨어진 조각(반짝이 점)도 지워진다. 문제 되면 색 대비 조건 추가
function specks(data, bgm, ref, w, h) {
  const n = w * h, min = Math.max(16, n / 20000), seen = new Uint8Array(n), comp = new Int32Array(Math.ceil(min));
  const stack = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (bgm[s] || seen[s]) continue;
    let top = 0, c = 0; stack[top++] = s; seen[s] = 1;
    while (top) {
      const p = stack[--top], x = p % w;
      if (c < comp.length) comp[c] = p;
      c++;
      const go = q => { if (!bgm[q] && !seen[q]) { seen[q] = 1; stack[top++] = q; } };
      if (x > 0) go(p - 1);
      if (x < w - 1) go(p + 1);
      if (p >= w) go(p - w);
      if (p < n - w) go(p + w);
    }
    if (c >= min) continue;
    for (let k = 0; k < c; k++) { const p = comp[k]; bgm[p] = 1; ref[p * 3] = data[p * 4]; ref[p * 3 + 1] = data[p * 4 + 1]; ref[p * 3 + 2] = data[p * 4 + 2]; }
  }
}

// 갇힌 배경(팔 사이 구멍): 팔레트 색만으로 된 덩어리 중 두 가지 이상 팔레트 색이 각각 15% 이상 섞인 것(체커·줄무늬가 보이는 구멍)만 지운다.
// 단색 배경의 구멍은 흰 몸통·눈 하이라이트와 구별이 안 되니 남긴다 ("윤곽선 안은 전경").
function holes(data, bgm, ref, w, h, pal, t2) {
  const n = w * h, lab = new Int8Array(n).fill(-1), seen = new Uint8Array(n), stack = new Int32Array(n), comp = [];
  for (let p = 0; p < n; p++) {
    if (bgm[p]) continue;
    const i = p * 4;
    for (let k = 0; k < pal.length; k++) { const q = pal[k]; if (d2(data[i] - q[0], data[i + 1] - q[1], data[i + 2] - q[2]) <= t2) { lab[p] = k; break; } }
  }
  for (let s = 0; s < n; s++) {
    if (lab[s] < 0 || seen[s]) continue;
    let top = 0; stack[top++] = s; seen[s] = 1; comp.length = 0;
    const cnt = new Array(pal.length).fill(0);
    while (top) {
      const p = stack[--top], x = p % w; comp.push(p); cnt[lab[p]]++;
      const go = q => { if (lab[q] >= 0 && !seen[q]) { seen[q] = 1; stack[top++] = q; } };
      if (x > 0) go(p - 1);
      if (x < w - 1) go(p + 1);
      if (p >= w) go(p - w);
      if (p < n - w) go(p + w);
    }
    if (comp.length < 64 || cnt.filter(c => c >= comp.length * 0.15).length < 2) continue;
    for (const p of comp) { const q = pal[lab[p]]; bgm[p] = 1; ref[p * 3] = q[0]; ref[p * 3 + 1] = q[1]; ref[p * 3 + 2] = q[2]; }
  }
}

// 경계 소프트 매트. dist: 배경까지 체비셰프 거리(0=배경, 1~2 = 띠, 3 = 띠 바로 안쪽)
function matte(data, bgm, ref, w, h, th) {
  const n = w * h, dist = new Uint8Array(n).fill(255), queue = new Int32Array(n);
  let head = 0, tail = 0;
  for (let p = 0; p < n; p++) if (bgm[p]) dist[p] = 0;
  for (let p = 0; p < n; p++) { // 배경에 8방향으로 닿은 전경 = 1, 거기서 너비 우선으로 3 까지
    if (!dist[p]) continue;
    const x = p % w, y = (p / w) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < w && Y < h && !dist[Y * w + X] && dist[p] === 255) { dist[p] = 1; queue[tail++] = p; }
    }
  }
  while (head < tail) {
    const p = queue[head++], k = dist[p] + 1;
    if (k > 3) continue;
    const x = p % w, y = (p / w) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx, Y = y + dy, q = Y * w + X;
      if (X >= 0 && Y >= 0 && X < w && Y < h && dist[q] === 255) { dist[q] = k; queue[tail++] = q; }
    }
  }
  for (let p = 0; p < n; p++) {
    if (!dist[p]) { data[p * 4 + 3] = 0; continue; }
    if (dist[p] > 2) continue;
    const x = p % w, y = (p / w) | 0;
    let b0 = 0, b1 = 0, b2 = 0, bn = 0, f0 = 0, f1 = 0, f2 = 0, fn = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
      const q = Y * w + X;
      if (!dist[q]) { b0 += ref[q * 3]; b1 += ref[q * 3 + 1]; b2 += ref[q * 3 + 2]; bn++; }
      else if (dist[q] === 3) { f0 += data[q * 4]; f1 += data[q * 4 + 1]; f2 += data[q * 4 + 2]; fn++; }
    }
    if (!bn) continue;
    b0 /= bn; b1 /= bn; b2 /= bn;
    const i = p * 4, c0 = data[i] - b0, c1 = data[i + 1] - b1, c2 = data[i + 2] - b2;
    if (dist[p] > 1 && d2(c0, c1, c2) <= th * th) continue; // 배경색인데 번짐이 못 닿은 곳(테두리선 안쪽 흰 테두리): 진짜 경계에 막힌 전경
    if (!fn) { // 안쪽 전경이 없는 가는 조각(JPEG 링잉 점, 수염): 배경과 멀수록 진하게
      const a = Math.min(1, Math.max(0, (Math.sqrt(d2(c0, c1, c2)) - th) / (2 * th)));
      if (a < 0.04) data[i + 3] = 0; else if (a < 1) data[i + 3] = Math.round(a * 255);
      continue;
    }
    f0 = f0 / fn - b0; f1 = f1 / fn - b1; f2 = f2 / fn - b2;
    const ff = d2(f0, f1, f2);
    if (ff < 4 * th * th) continue; // 안쪽과 배경 대비가 작으면 추정 불가: 불투명 유지
    let a = Math.min(1, Math.max(0, (c0 * f0 + c1 * f1 + c2 * f2) / ff));
    // 배경-안쪽색 직선에서 멀면(흰 테두리 같은 제3의 색) 투영이 틀린다: 배경과의 거리로도 재서 큰 쪽
    const r0 = c0 - a * f0, r1 = c1 - a * f1, r2 = c2 - a * f2;
    if (d2(r0, r1, r2) > 4 * th * th) a = Math.max(a, Math.min(1, (Math.sqrt(d2(c0, c1, c2)) - th) / (2 * th)));
    if (a >= 0.98) continue;
    if (a < 0.04) { data[i + 3] = 0; continue; }
    data[i] = b0 + c0 / a; data[i + 1] = b1 + c1 / a; data[i + 2] = b2 + c2 / a; // 배경색 걷어내기 (Uint8Clamped 가 자름)
    data[i + 3] = Math.round(a * 255);
  }
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

// ---------- 손보기 (자동이 못 가른 곳을 손으로). 좌표는 downscale(img, 1024) 공간, 전부 결정적 ----------
const copyImg = img => ({ width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) });

// (x, y) 에서 4방향으로 이어진 픽셀 중 ok(p) 이고 seed 색과 거리 <= tol 인 것. src = 색을 재는 그림
function region(src, x, y, tol, ok) {
  const { width: w, height: h, data: d } = src, n = w * h, s = y * w + x;
  const hit = new Uint8Array(n);
  if (!(x >= 0 && y >= 0 && x < w && y < h) || !ok(s)) return hit;
  const r = d[s * 4], g = d[s * 4 + 1], b = d[s * 4 + 2], t2 = tol * tol, stack = new Int32Array(n);
  let top = 0; stack[top++] = s; hit[s] = 1;
  while (top) {
    const p = stack[--top], px = p % w;
    for (const q of [px > 0 ? p - 1 : -1, px < w - 1 ? p + 1 : -1, p - w, p + w]) {
      if (q < 0 || q >= n || hit[q] || !ok(q)) continue;
      const i = q * 4;
      if (d2(d[i] - r, d[i + 1] - g, d[i + 2] - b) <= t2) { hit[q] = 1; stack[top++] = q; }
    }
  }
  return hit;
}

/** 탭한 곳 색과 비슷하게 이어진 '보이는' 영역을 투명으로 (바닥 그림자, 갇힌 배경, 얼룩). 새 그림을 돌려준다 */
export function eraseRegion(img, x, y, tol = 36) {
  const out = copyImg(img), d = out.data, hit = region(img, x, y, tol, p => d[p * 4 + 3] > 10);
  for (let p = 0; p < hit.length; p++) if (hit[p]) d[p * 4 + 3] = 0;
  return out;
}

/** 탭한 곳 원본 색과 비슷하게 이어진, 지금 원본과 달라진(지워진) 영역을 원본으로 되살린다. 새 그림을 돌려준다 */
export function restoreRegion(orig, img, x, y, tol = 36) {
  const out = copyImg(img), d = out.data, o = orig.data;
  const hit = region(orig, x, y, tol, p => o[p * 4 + 3] > 10 && d[p * 4 + 3] !== o[p * 4 + 3]), w = img.width, h = img.height;
  // 그림 가장자리에 닿으면 배경까지 이어진 것(흰 배경 위 흰 테두리 등) = 안 살린다. 테두리는 붓으로
  for (let p = 0; p < hit.length; p++) if (hit[p]) { const px = p % w, py = (p / w) | 0; if (!px || !py || px === w - 1 || py === h - 1) return out; }
  for (let p = 0; p < hit.length; p++) if (hit[p]) d.set(o.subarray(p * 4, p * 4 + 4), p * 4);
  return out;
}

/** 붓 한 칸: (x0,y0)-(x1,y1) 선분에서 r 안의 픽셀을 지우거나(restore=false) 원본으로. img 를 바로 고치고 바뀐 픽셀 수를 돌려준다 */
export function stamp(img, orig, x0, y0, x1, y1, r, restore = false) {
  const { width: w, height: h, data: d } = img, o = orig.data;
  const dx = x1 - x0, dy = y1 - y0, ll = dx * dx + dy * dy, r2 = r * r; let n = 0;
  const xa = Math.max(0, Math.floor(Math.min(x0, x1) - r)), xb = Math.min(w - 1, Math.ceil(Math.max(x0, x1) + r));
  const ya = Math.max(0, Math.floor(Math.min(y0, y1) - r)), yb = Math.min(h - 1, Math.ceil(Math.max(y0, y1) + r));
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    const t = ll ? Math.min(1, Math.max(0, ((x - x0) * dx + (y - y0) * dy) / ll)) : 0, ex = x - x0 - t * dx, ey = y - y0 - t * dy;
    if (ex * ex + ey * ey > r2) continue;
    const i = (y * w + x) * 4;
    if (restore) { if (d[i] !== o[i] || d[i + 1] !== o[i + 1] || d[i + 2] !== o[i + 2] || d[i + 3] !== o[i + 3]) { d.set(o.subarray(i, i + 4), i); n++; } }
    else if (d[i + 3]) { d[i + 3] = 0; n++; }
  }
  return n;
}

/** 손보기 한 단계. e = {t:'e'|'r', x, y, tol} (영역 지우기/살리기) | {t:'be'|'br', r, p:[x0,y0,x1,y1,...]} (붓 지우개/되살리기) */
export function applyEdit(img, orig, e) {
  if (e.t === 'e') return eraseRegion(img, e.x, e.y, e.tol);
  if (e.t === 'r') return restoreRegion(orig, img, e.x, e.y, e.tol);
  const p = e.p, re = e.t === 'br';
  for (let i = 0; i + 1 < p.length; i += 2) stamp(img, orig, p[Math.max(0, i - 2)], p[Math.max(1, i - 1)], p[i], p[i + 1], e.r, re);
  return img;
}

/** base(키잉된 그림)에 edits 를 차례로. orig = 키잉 전 같은 크기 그림. base 는 안 건드린다 */
export function applyEdits(base, orig, edits = []) {
  let im = copyImg(base);
  for (const e of edits) im = applyEdit(im, orig, e);
  return im;
}

/** 줄이기 + (투명이 아니면) 배경 지우기, 크롭 전. 손보기 화면이 이 그림 위에서 고친다 */
export function keyBase(img, tolerance = 24) {
  const im = downscale(img, 1024);
  return transparentRatio(im) < 0.05 ? removeEdgeBackground(im, tolerance) : im;
}

/** 사진 -> 캐릭터: 크면 줄이고, 투명이 아니면 가장자리 배경 지우기, 손보기(edits) 적용, 알파 bbox 크롭 */
export function prepareCharacter(img, { tolerance = 24, edits = null } = {}) {
  const im = keyBase(img, tolerance);
  return cropToAlpha(edits && edits.length ? applyEdits(im, downscale(img, 1024), edits) : im);
}
