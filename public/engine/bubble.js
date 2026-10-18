// 말풍선 래스터 (둥근 = 4x4 슈퍼샘플, 픽셀 = 2pt 칸 격자), 늘이는 점 검사, 목업 CSS. DOM 없음.
import { roundGeometry, pixelGeometry, lineWidth, PIXEL_OUTLINE, decoBox } from './presets.js';
import { rgb } from './palette.js';
import { scaleNearest } from './pixelize.js';

const colorsFor = (pal, side, selected, outlineColor = 'auto') => {
  const c = side === 'send'
    ? { fill: selected ? pal.sendSel : pal.sendFill, line: pal.sendLine }
    : { fill: selected ? pal.recvSel : pal.recvFill, line: pal.recvLine };
  if (outlineColor === 'dark') c.line = pal.text;
  return c;
};

// 점 (x,y) 가 둥근 사각 안인가
const inRRect = (x, y, { x0, y0, x1, y1, r }) => {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1 && (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const inTri = (x, y, [[ax, ay], [bx, by], [cx, cy]]) => {
  const s1 = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
  const s2 = (cx - bx) * (y - by) - (cy - by) * (x - bx);
  const s3 = (ax - cx) * (y - cy) - (ay - cy) * (x - cx);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
};

/** inside(x,y in pt) 를 @k 픽셀 커버리지(0..1)로. ss x ss 슈퍼샘플 */
export function rasterize(Wpx, Hpx, k, inside, ss = 4) {
  const cov = new Float32Array(Wpx * Hpx);
  for (let py = 0; py < Hpx; py++) for (let px = 0; px < Wpx; px++) {
    let n = 0;
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) if (inside((px + (i + 0.5) / ss) / k, (py + (j + 0.5) / ss) / k)) n++;
    cov[py * Wpx + px] = n / (ss * ss);
  }
  return cov;
}

/**
 * 원판 최소 필터 (침식), 반경 rad px. 둥근 모서리의 안쪽 선이 같은 x·y 에서 굽기 시작해서
 * 외곽선이 굵어도 늘이는 열·행에 모서리가 번지지 않는다. 정사각 침식이 1 인 곳(안쪽)은 건너뜀.
 */
export function erode(cov, w, h, rad) {
  const sq = erodeSquare(cov, w, h, rad), out = new Float32Array(cov.length), offs = [];
  for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (dx * dx + dy * dy <= rad * rad) offs.push([dx, dy]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!cov[i] || sq[i] === 1) { out[i] = sq[i]; continue; }
    let m = 1;
    for (const [dx, dy] of offs) {
      const X = x + dx, Y = y + dy, v = X < 0 || Y < 0 || X >= w || Y >= h ? 0 : cov[Y * w + X];
      if (v < m && !(m = v)) break;
    }
    out[i] = m;
  }
  return out;
}

/** 정사각 최소 필터 (분리형, 빠름) */
function erodeSquare(cov, w, h, rad) {
  const tmp = new Float32Array(cov.length), out = new Float32Array(cov.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 1;
    for (let i = x - rad; i <= x + rad; i++) { const v = i < 0 || i >= w ? 0 : cov[y * w + i]; if (v < m) m = v; }
    tmp[y * w + x] = m;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 1;
    for (let j = y - rad; j <= y + rad; j++) { const v = j < 0 || j >= h ? 0 : tmp[j * w + x]; if (v < m) m = v; }
    out[y * w + x] = m;
  }
  return out;
}

/** 둥근 말풍선 (보낸 쪽 모양) @k. 외곽선 = 바깥 커버리지, 면 = 침식 커버리지 */
export function roundBubble(b, { tail = true, selected = false, side = 'send', k = 3, outline = 'normal', outlineColor = 'auto', highlight = true }, pal) {
  const g = roundGeometry(b), W = b.W * k, H = b.H * k;
  const mask = rasterize(W, H, k, (x, y) => inRRect(x, y, g.body) || (tail && inTri(x, y, g.tail)));
  const inner = erode(mask, W, H, Math.round(lineWidth(outline, side) * k));
  const { fill, line } = colorsFor(pal, side, selected, outlineColor);
  const F = rgb(fill), L = rgb(line);
  const hl = side === 'send' && highlight
    ? rasterize(W, H, k, (x, y) => ((x - g.highlight.cx) / g.highlight.rx) ** 2 + ((y - g.highlight.cy) / g.highlight.ry) ** 2 <= 1)
    : null;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const m = mask[i];
    if (!m) continue;
    const t = inner[i] / m;
    let c = [0, 1, 2].map(j => L[j] + (F[j] - L[j]) * t);
    if (hl && hl[i]) { const a = hl[i] * (150 / 255); c = c.map(v => v + (255 - v) * a); }
    out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = m * 255;
  }
  return { width: W, height: H, data: out };
}

/** 픽셀 말풍선 칸 격자 (1px = 1칸 = 2pt): 계단 모서리, 1~2칸 외곽선(text), 오른쪽 아래 1칸 그림자, 계단 꼬리 */
export function pixelBubbleCells(b, { tail = true, selected = false, side = 'send', outline = 'normal', highlight = true }, pal) {
  const { Wc, Hc, Tc, x1, y1, r, tail: rows, ty } = pixelGeometry(b);
  const inside = new Set();
  const key = (x, y) => y * 1000 + x;
  for (let y = Tc; y <= y1; y++) for (let x = 0; x <= x1; x++) {
    const cx = Math.min(Math.max(x, r - 0.5), x1 - r + 0.5), cy = Math.min(Math.max(y, Tc + r - 0.5), y1 - r + 0.5);
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) inside.add(key(x, y));
  }
  if (tail) rows.forEach(([a, z], i) => { for (let x = a; x <= z; x++) inside.add(key(x, ty + i)); });
  const has = (x, y) => inside.has(key(x, y));
  const out = new Uint8ClampedArray(Wc * Hc * 4);
  const put = (x, y, h) => { if (x < 0 || y < 0 || x >= Wc || y >= Hc) return; const c = rgb(h), o = (y * Wc + x) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255; };
  const { fill } = colorsFor(pal, side, selected);
  for (const p of inside) { const x = p % 1000, y = Math.floor(p / 1000); if (!has(x + 1, y + 1)) put(x + 1, y + 1, pal.shadow); }
  const near = PIXEL_OUTLINE[outline] === 2 // 바깥까지 맨해튼 거리 2 이내 = 외곽선
    ? [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [1, -1], [-1, 1], [-1, -1]]
    : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const p of inside) {
    const x = p % 1000, y = Math.floor(p / 1000);
    put(x, y, near.some(([dx, dy]) => !has(x + dx, y + dy)) ? pal.text : fill);
  }
  if (side === 'send' && highlight) for (const [x, y] of [[2, Tc + 2], [3, Tc + 2], [2, Tc + 3]]) {
    if (has(x, y) && has(x + 1, y) && has(x - 1, y) && has(x, y + 1) && has(x, y - 1)) put(x, y, '#FFFFFF');
  }
  return { width: Wc, height: Hc, data: out };
}

export function pixelBubble(b, o, pal) {
  const cells = pixelBubbleCells(b, o, pal);
  return scaleNearest(cells, b.W * o.k, b.H * o.k);
}

/** 좌우 반전 */
export function mirror(img) {
  const { width: w, height: h } = img;
  const s = new Uint32Array(img.data.buffer, img.data.byteOffset, w * h), out = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = s[y * w + w - 1 - x];
  return { width: w, height: h, data: new Uint8ClampedArray(out.buffer) };
}

/** src 를 dst 의 (dx,dy) 에 source-over (비프리멀티플라이 RGBA) */
export function composite(dst, src, dx, dy) {
  const D = dst.data, S = src.data;
  for (let y = 0; y < src.height; y++) {
    const ty = y + dy; if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < src.width; x++) {
      const tx = x + dx; if (tx < 0 || tx >= dst.width) continue;
      const si = (y * src.width + x) * 4, di = (ty * dst.width + tx) * 4, sa = S[si + 3] / 255;
      if (!sa) continue;
      const da = D[di + 3] / 255, oa = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) D[di + c] = (S[si + c] * sa + D[di + c] * da * (1 - sa)) / oa;
      D[di + 3] = oa * 255;
    }
  }
  return dst;
}

// 장식 모양 (단위 상자 0..1 안인가). 픽셀 말풍선이면 5x5 도트
const inPoly = (x, y, pts) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const STAR = Array.from({ length: 10 }, (_, i) => {
  const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.21 : 0.5;
  return [0.5 + r * Math.cos(a), 0.55 + r * Math.sin(a)];
});
const DECO_SHAPES = {
  sparkle: (u, v) => Math.sqrt(Math.abs(u - 0.5) * 2) + Math.sqrt(Math.abs(v - 0.5) * 2) <= 1,
  heart: (u, v) => { const x = (u - 0.5) * 2.5, y = (0.56 - v) * 2.5, q = x * x + y * y - 1; return q * q * q - x * x * y * y * y <= 0; },
  star: (u, v) => inPoly(u, v, STAR),
  note: (u, v) => ((u - 0.33) / 0.24) ** 2 + ((v - 0.78) / 0.18) ** 2 <= 1
    || (u >= 0.47 && u <= 0.6 && v >= 0.08 && v <= 0.78)
    || inTri(u, v, [[0.47, 0.06], [0.95, 0.3], [0.47, 0.38]]),
};
const DECO_DOTS = {
  sparkle: ['..#..', '..#..', '#####', '..#..', '..#..'],
  heart: ['##.##', '#####', '#####', '.###.', '..#..'],
  star: ['..#..', '..#..', '#####', '.###.', '.#.#.'],
  note: ['..###', '..#.#', '..#..', '###..', '###..'],
};

/** 장식 그림 (s pt 정사각, @k). 픽셀이면 5x5 도트 (알파 0/255) */
export function decoImage(kind, s, k, pixel, color) {
  const n = Math.round(s * k), [R, G, B] = rgb(color), out = new Uint8ClampedArray(n * n * 4);
  const shape = DECO_SHAPES[kind];
  if (!shape) throw new Error(`unknown deco ${kind}`);
  const cov = pixel ? null : rasterize(n, n, n, shape);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const a = pixel ? (DECO_DOTS[kind][Math.floor(y * 5 / n)][Math.floor(x * 5 / n)] === '#' ? 1 : 0) : cov[y * n + x];
    if (!a) continue;
    const o = (y * n + x) * 4;
    out[o] = R; out[o + 1] = G; out[o + 2] = B; out[o + 3] = a * 255;
  }
  return { width: n, height: n, data: out };
}

/**
 * 말풍선 그림 (캐릭터 없이). 받은 쪽은 좌우 반전. 장식은 반전 뒤에 제자리에 그린다 (음표가 뒤집히지 않게).
 * deco 는 b.deco 자리가 있을 때만 (02 는 자리 없음). 몸통 안 장식이면 하이라이트는 뺀다.
 */
export function bubbleImage(b, { tail, selected, side, k, pixel, outline = 'normal', outlineColor = 'auto', deco = 'none' }, pal) {
  const d = deco && deco !== 'none' ? decoBox(side, b) : null;
  const img = (pixel ? pixelBubble : roundBubble)(b, { tail, selected, side, k, outline, outlineColor, highlight: !(d && d.inside) }, pal);
  const out = side === 'receive' ? mirror(img) : img;
  if (d) composite(out, decoImage(deco, d.s, k, pixel, pal.accent), Math.round(d.x * k), Math.round(d.y * k));
  return out;
}

/**
 * 캐릭터 스프라이트(@k, 정수배)를 말풍선에 얹기 (순수 합성, 픽셀 캐릭터와 테스트가 쓴다). 상자 아래·가운데 정렬.
 * perch/hang/stand = 몸통 앞 (hang 은 상자가 높이 있어 앞발만 테두리에 걸친다). peek = 몸통 뒤 (위로 나온 부분만 보임).
 */
export function layerChar(bubble, sp, box, layout, k) {
  const x = (box.x + Math.floor((box.w - sp.width / k) / 2)) * k, y = (box.y + box.h - sp.height / k) * k;
  if (layout !== 'peek') return composite(bubble, sp, x, y);
  const out = { width: bubble.width, height: bubble.height, data: new Uint8ClampedArray(bubble.data.length) };
  composite(out, sp, x, y);
  return composite(out, bubble, 0, 0);
}

/** CSS cap / 인셋 (받은 쪽: cap X = W - X - 1, 인셋 좌우 반전) */
export function capFor(b, side) {
  const X = side === 'send' ? b.X : b.W - b.X - 1;
  let [t, l, bo, r] = b.ins;
  if (side === 'receive') [l, r] = [r, l];
  return { X, Y: b.Y, ins: [t, l, bo, r] };
}

/**
 * 늘이는 점 검사 (기준 구현 verify): @k 이미지에서 열 (X-1)k ~ (X+2)k-1 의 세로 픽셀 열이 전부 같고 행도 같아야.
 * -> { cols, rows } 서로 다른 열·행 프로필 수 (둘 다 1 이면 통과)
 */
export function stretchProfiles(img, X, Y, k) {
  const { width: w, height: h } = img;
  const px = new Uint32Array(img.data.buffer, img.data.byteOffset, w * h);
  const cols = new Set(), rows = new Set();
  for (let x = (X - 1) * k; x < (X + 2) * k; x++) { let s = ''; for (let y = 0; y < h; y++) s += px[y * w + x] + ','; cols.add(s); }
  for (let y = (Y - 1) * k; y < (Y + 2) * k; y++) rows.add(Array.prototype.join.call(px.subarray(y * w, y * w + w)));
  return { cols: cols.size, rows: rows.size };
}

/**
 * 목업용 CSS (border-image 9분할, 기준 구현 목업 규칙). 선택자 .s .b / .s.g .b / .r .b / .r.g .b.
 * urls = { Send01, Send02, Receive01, Receive02 } (@3x object URL). 없으면 var(--tk-Send01) 등을 쓴다.
 */
export function bubbleRules(meta, urls = null, scope = '') {
  const rule = (sel, file, b, side) => {
    const { X, ins: [t, l, bo, r] } = capFor(b, side);
    const R = b.W - X - 1, B = b.H - b.Y - 1;
    const src = urls && urls[file] ? `url("${urls[file]}")` : `var(--tk-${file})`;
    return `${scope}${sel}{min-width:${b.W}px;min-height:${b.H}px;flex-shrink:0;box-sizing:border-box;border-style:solid;`
      + `border-width:${t}px ${r}px ${bo}px ${l}px;border-image-source:${src};`
      + `border-image-slice:${b.Y * 3} ${R * 3} ${B * 3} ${X * 3} fill;border-image-width:${b.Y}px ${R}px ${B}px ${X}px;border-image-repeat:stretch;}`;
  };
  const { '01': b1, '02': b2 } = meta.bubbles;
  return rule('.s .b', 'Send01', b1, 'send') + '\n' + rule('.s.g .b', 'Send02', b2, 'send') + '\n'
    + rule('.r .b', 'Receive01', b1, 'receive') + '\n' + rule('.r.g .b', 'Receive02', b2, 'receive') + '\n';
}
