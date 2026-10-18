// 배경 지우기 벤치 핵심 케이스 고정: 오리지널 데모(public/demo) + 코드로 그린 흰 몸통 도형만 (private 소스는 안 씀).
// 12개 배경(순백·크림·그라데이션·체커·JPEG·점무늬·줄무늬·사진 질감·그림자·잘린 상반신) x 3 소스 = 36건, tol 32(앱 시작값).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bench = fileURLToPath(new URL('./keying-bench.mjs', import.meta.url));

test('keying bench: every background case keeps the body and clears the background (demo + shape)', () => {
  const txt = execFileSync(process.execPath, [bench, '--src', 'demo,shape', '--tol', '32'], { encoding: 'utf8' });
  const rows = [...txt.matchAll(/^((?:demo|shape)-\S+)\s+(\S+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+\d+$/gm)];
  assert.equal(rows.length, 36, txt);
  for (const [, src, cs, iou, bgRes, fgLoss] of rows) {
    const tag = `${src} ${cs}: IoU ${iou} 배경잔여 ${bgRes} 전경손실 ${fgLoss}`;
    assert.ok(+iou >= 95, tag); // 옛 구현: 체커 28, 세로 그라데이션 50, 사진 질감 35
    assert.ok(+bgRes <= 2, tag);
    assert.ok(+fgLoss <= 2, tag);
  }
  const score = +txt.match(/총점 ([\d.]+)/)[1];
  assert.ok(score >= 92, `총점 ${score}`); // 옛 구현 48.7, 현재 94.0
});

test('keying: isolated noise specks on the background are cleared so the crop stays tight', async () => {
  const { prepareCharacter } = await import('../public/engine/keying.js');
  const W = 300, data = new Uint8ClampedArray(W * W * 4);
  for (let p = 0; p < W * W; p++) {
    const x = p % W, y = (p / W) | 0, blob = Math.hypot(x - 150, y - 150) < 40;
    const speck = !blob && x % 37 === 5 && y % 41 === 7; // JPEG 잡음처럼 바탕에 흩어진 외톨이 점
    const c = blob ? [200, 60, 80] : speck ? [200, 196, 190] : [236, 230, 222];
    data.set([...c, 255], p * 4);
  }
  const out = prepareCharacter({ width: W, height: W, data }, { tolerance: 32 });
  assert.ok(out.width <= 84 && out.height <= 84, `crop ${out.width}x${out.height}`);
});

// 손보기: 영역 지우기/살리기 + 붓 + edits 재생이 결정적이고 prepareCharacter 에 그대로 반영되는지
test('keying: eraseRegion / restoreRegion / brush edits', async () => {
  const K = await import('../public/engine/keying.js');
  // 40x20: 왼쪽 반 빨강, 오른쪽 반 회색 그림자, (30,10) 근처 2px 흰 점(그림자 속 다른 색)
  const W = 40, H = 20, data = new Uint8ClampedArray(W * H * 4);
  for (let p = 0; p < W * H; p++) { const x = p % W, y = (p / W) | 0; data.set(x < 20 ? [200, 40, 60, 255] : Math.abs(x - 30) < 2 && Math.abs(y - 10) < 2 ? [255, 255, 255, 255] : [120, 120, 125, 255], p * 4); }
  const orig = { width: W, height: H, data };
  const a = i => i * 4 + 3;
  const er = K.eraseRegion(orig, 25, 5, 20);
  assert.equal(er.data[a(25 + 5 * W)], 0, '탭한 그림자');
  assert.equal(er.data[a(39 + 19 * W)], 0, '이어진 그림자 끝');
  assert.equal(er.data[a(30 + 10 * W)], 255, '색이 다른 점은 남는다');
  assert.equal(er.data[a(5 + 5 * W)], 255, '빨강은 남는다');
  assert.equal(orig.data[a(25 + 5 * W)], 255, '원본은 그대로');
  assert.deepEqual(K.eraseRegion(er, 25, 5, 20).data, er.data, '이미 투명한 곳 탭 = 변화 없음');
  assert.deepEqual(K.eraseRegion(orig, 25, 5, 20).data, er.data, '결정적');
  assert.deepEqual(K.restoreRegion(orig, er, 22, 3, 20).data, er.data, '그림 가장자리에 닿는 영역 = 배경이라 안 살림');
  const ed = K.eraseRegion(orig, 30, 10, 20); // 그림자 속 흰 점(가장자리에 안 닿음)
  assert.equal(ed.data[a(30 + 10 * W)], 0);
  assert.deepEqual(K.restoreRegion(orig, ed, 30, 10, 20).data, orig.data, '안쪽 영역 되살리기 = 원본');
  assert.deepEqual(K.restoreRegion(orig, er, 5, 5, 20).data, er.data, '안 지운 곳 탭 = 변화 없음');
  // 붓: 지우개로 빨강 가운데 가로줄, 되살리기 붓으로 반만 복원
  const be = K.applyEdits(orig, orig, [{ t: 'be', r: 2, p: [2, 10, 17, 10] }]);
  assert.equal(be.data[a(10 + 10 * W)], 0); assert.equal(be.data[a(10 + 14 * W)], 255);
  const br = K.applyEdits(orig, orig, [{ t: 'be', r: 2, p: [2, 10, 17, 10] }, { t: 'br', r: 3, p: [2, 10, 9, 10] }]);
  assert.equal(br.data[a(5 + 10 * W)], 255); assert.equal(br.data[a(15 + 10 * W)], 0);
  // stamp 는 바뀐 픽셀 수를 돌려준다(빈 붓질은 0 = 기록 안 함)
  const st = K.applyEdits(orig, orig, []);
  assert.ok(K.stamp(st, orig, 5, 5, 5, 5, 2) > 0); assert.equal(K.stamp(st, orig, 5, 5, 5, 5, 2), 0, '이미 지운 곳');
  assert.equal(K.stamp(orig, orig, 30, 10, 30, 10, 2, true), 0, '안 지운 곳 되살리기');
  // prepareCharacter(edits) (tolerance 0 = 자동 지우기 끔): 그림자 지우면 크롭이 빨강+흰 점 쪽으로 줄어든다
  const pc = K.prepareCharacter(orig, { tolerance: 0, edits: [{ t: 'e', x: 25, y: 5, tol: 20 }, { t: 'be', r: 3, p: [30, 10] }] });
  assert.equal(pc.width, 20); assert.equal(pc.height, 20);
  assert.deepEqual(K.prepareCharacter(orig, { tolerance: 32, edits: [] }), K.prepareCharacter(orig, { tolerance: 32 }));
});

// 흰 배경 위 흰 테두리: 자동 지우기가 테두리까지 먹은 뒤 테두리를 톡 되살리기 해도 흰 배경 전체가 돌아오지 않는다
test('keying: restoreRegion on a white outline over a white background does not bring the background back', async () => {
  const K = await import('../public/engine/keying.js');
  const W = 600, data = new Uint8ClampedArray(W * W * 4);
  for (let p = 0; p < W * W; p++) { const r = Math.hypot(p % W - 300, ((p / W) | 0) - 300); data.set(r < 150 ? [240, 150, 180, 255] : [255, 255, 255, 255], p * 4); } // 분홍 몸통 + 흰 테두리(r150~168) = 흰 배경과 같은 색
  const img = { width: W, height: W, data }, base = K.keyBase(img, 32), orig = K.downscale(img, 1024);
  const op = im => { let n = 0; for (let i = 3; i < im.data.length; i += 4) n += im.data[i] > 10; return n; };
  assert.equal(base.data[(300 * W + 459) * 4 + 3], 0, '테두리는 배경과 함께 지워진다(이 케이스의 전제)');
  const rs = K.restoreRegion(orig, base, 459, 300, 36);
  assert.equal(op(rs), op(base), '배경까지 이어진 영역은 안 살림');
});
