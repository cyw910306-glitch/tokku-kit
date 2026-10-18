// 템플릿 썸네일 생성: public/ 를 python3 http.server(8792)로 띄우고 playwright@1.48.2 chromium 헤드리스로
// 내 캐릭터(기본 젤리, DEMO 표에 있으면 그 캐릭터) + 친구 캐릭터(호떡) + 각 TEMPLATE 를 엔진으로 빌드, 폭 240 으로 줄인 채팅 목업에 말풍선 3개(받은 01 + 보낸 01 + 보낸 02)를
// 그려 캡처해 public/templates/<id>.png (가로 480, @2x) 로 저장. pngquant 가 있으면 압축.
// usage: node tests/gen-thumbs.mjs [id ...]   (창은 띄우지 않는다)
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'templates');
const PORT = 8792, BASE = `http://127.0.0.1:${PORT}`, W = 480, PW = 240, PH = 220; // PW·PH = 캡처 폭·최소 높이 (CSS px). 카드 비율을 맞추려고 높이를 고정
// 템플릿마다 자리를 가장 잘 보여 주는 데모: 걸치기는 엎드린 호떡이어야 앞발이 테두리에 걸친 모양이 보인다
const DEMO = { hang: 'hotteok' };
const pw = createRequire(join(ROOT, 'tests', '.pw', 'package.json'))('playwright'); // e2e.mjs 가 설치해 둔 고정 버전

mkdirSync(OUT, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', join(ROOT, 'public')], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(BASE + '/index.html')).ok) break; } catch {}
    if (i > 50) throw new Error('http.server 가 안 뜸');
    await new Promise(r => setTimeout(r, 200));
  }
  browser = await pw.chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: W / PW });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/terms.html'); // 가벼운 같은 출처 페이지 (앱 스크립트 없이 엔진·목업만 쓴다)
  const ids = await page.evaluate(() => import('/engine/index.js').then(E => E.TEMPLATES.map(t => t.id)));
  const want = process.argv.slice(2).length ? process.argv.slice(2) : ids;
  for (const id of want) {
    const clip = await page.evaluate(async ([id, PW, PH, demo]) => {
      const E = await import('/engine/index.js'), { createPhone } = await import('/mock.js');
      const t = E.TEMPLATES.find(x => x.id === id);
      const load = async n => E.prepareCharacter(await E.decodeImage(await (await fetch(`/demo/${n}.png`)).blob()), {});
      const A = await load(demo), B = await load('hotteok'); // 내 = 젤리(또는 DEMO), 친구 = 호떡: 받은 말풍선엔 친구 캐릭터가 선다
      const { files, meta } = await E.buildTheme(A, B, { ...E.DEFAULTS, ...t.opts, background: t.bg || null, name: t.name, id: '0123456789ab' });
      const urls = new Map([...files].map(([k, v]) => [k, URL.createObjectURL(v)]));
      const u = n => urls.get(`Images/${n}@3x.png`) || urls.get(`Images/${n}@2x.png`) || urls.get(`Images/${n}.png`) || '';
      document.body.innerHTML = '<div id="h" style="width:397px;margin:0"></div>';
      document.body.style.margin = '0';
      const ph = createPhone(document.querySelector('#h'), { tab: 'chat' });
      ph.render(u, meta, { me: '젤리', friend: '호떡', friendChar: true, rules: E.bubbleRules });
      ph.setLoading(false);
      await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
      await new Promise(r => setTimeout(r, 300)); // 덮개 fade-out + border-image 로드
      const phone = document.querySelector('.phone'), msgs = document.querySelector('.msgs');
      phone.style.width = PW + 'px';
      msgs.style.paddingTop = '10px';
      const mk = h => { const d = document.createElement('div'); d.innerHTML = h; return d.firstElementChild; };
      const t0 = msgs.querySelector('.meta').textContent;
      msgs.replaceChildren(msgs.querySelector('.who'),
        mk(`<div class="m s"><div class="b"><span>좋아 좋아!!</span></div><div class="meta"><b>1</b>${t0}</div></div>`),
        mk(`<div class="m s g"><div class="b"><span>간식 챙길게</span></div><div class="meta"><b>1</b>${t0}</div></div>`));
      msgs.querySelector('.who .b span').textContent = '산책 갈래?';
      await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
      // 카드는 12:11 (PW×PH) 로 위에서 잘라 보여 준다. 키 큰 자리(프사 옆 꼬마)는 대화를 줄여 넣어 마지막 말풍선이 잘리지 않게
      const tall = () => msgs.lastElementChild.getBoundingClientRect().bottom + 8 - msgs.getBoundingClientRect().top;
      for (let i = 0; i < 3 && tall() > PH + 0.5; i++) msgs.style.zoom = (parseFloat(msgs.style.zoom) || 1) * PH / tall();
      const scr = phone.getBoundingClientRect(), r = msgs.getBoundingClientRect();
      return { x: scr.left, y: r.top, width: PW, height: Math.max(PH, tall()) };
    }, [id, PW, PH, DEMO[id] || 'jelly']);
    const f = join(OUT, `${id}.png`);
    await page.screenshot({ path: f, clip });
    const q = spawnSync('pngquant', ['--force', '--skip-if-larger', '--quality=70-95', '--speed=3', '--ext', '.png', f]);
    console.log(id, `${Math.round(clip.height * W / PW)}px tall`, `${(statSync(f).size / 1024).toFixed(1)}KB`, q.error ? '(pngquant 없음)' : '');
  }
  console.log(`console error ${errs.length}` + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  if (errs.length) process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill();
}
