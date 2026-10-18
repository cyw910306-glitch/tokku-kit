// E2E (SPEC 6절): public/ 를 python3 http.server 로 띄우고 playwright@1.48.2 헤드리스(chromium, webkit)로
// 엔진을 페이지 안에서 불러 데모 젤리로 layout x pixelBubble x charSize 표본 + 템플릿 전부 + 커플 .ktheme 를 만든 뒤 verify_ktheme.py 로 검사.
// 페이지 검사: 390/1280px 가로 스크롤 없음, 콘솔 에러 0, 목업 말풍선 이미지 로드, UI 흐름(꾸미기 토글 → 무료 받기 다운로드), 친구 캐릭터(받은 말풍선)·상대 폰용,
// v1 프로젝트 불러오기, 배경(무늬·사진·구석)·자리별 그림이 엔진 인자로 넘어가는지, v3 저장/불러오기, ?pack= 캐릭터 팩(테스트 팩은 public 밖 tests/fixtures/pack 을 라우팅).
// usage: node tests/e2e.mjs [chromium|webkit ...]   (창은 절대 띄우지 않는다: headless 고정)
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tests', 'out');
const PW_DIR = join(ROOT, 'tests', '.pw'); // playwright@1.48.2 고정 설치 위치 (배포 범위 밖)
const PORT = 8791;
const BASE = `http://127.0.0.1:${PORT}`;
const ID = 'a1b2c3d4e5f6';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function loadPlaywright() {
  const req = () => createRequire(join(PW_DIR, 'package.json'))('playwright');
  try { return req(); } catch {}
  log('playwright@1.48.2 설치 중 (tests/.pw)');
  mkdirSync(PW_DIR, { recursive: true });
  const r = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--prefix', PW_DIR, 'playwright@1.48.2'], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('playwright 설치 실패');
  return req();
}

async function launch(pw, name) {
  try { return await pw[name].launch({ headless: true }); } catch (e) {
    if (!/Executable doesn't exist/.test(e.message)) throw e;
    log(`${name} 브라우저 설치 중`);
    spawnSync('npx', ['-y', 'playwright@1.48.2', 'install', name], { stdio: 'inherit' });
    return pw[name].launch({ headless: true });
  }
}

async function waitServer() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + '/index.html')).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('http.server 가 안 뜸');
}

// UI 가 엔진에 실제로 넘긴 인자를 기록하는 얇은 껍데기 (/engine/index.js 요청만 바꿔치기, 진짜는 ?real)
const SHIM = `export * from '/engine/index.js?real';
import * as R from '/engine/index.js?real';
const rec = (kind, a) => (window.__calls ||= []).push({ kind, bg: a[2] && a[2].background, preset: a[2] && a[2].preset, trial: a[2] && a[2].trial, friend: !!a[1],
  o: a[2] && { layout: a[2].layout, charSize: a[2].charSize, pixelChar: a[2].pixelChar, slotsArePixel: a[2].slotsArePixel, name: a[2].name, accent: a[2].colors && a[2].colors.accent },
  assets: a[3] ? { keys: Object.keys(a[3]).filter(k => k !== 'slots' && a[3][k]), slots: Object.keys(a[3].slots || {}), sel: Object.keys((a[3].slots || {}).tabSelected || {}) } : null });
export async function buildTheme(...a) { rec('theme', a); return R.buildTheme(...a); }
export async function buildCouple(...a) { rec('couple', a); return R.buildCouple(...a); }`;

// UI 흐름에서 고른 배경·자리별 그림이 엔진 인자에 그대로 들어갔는지
const wantBg = c => !!(c && c.bg && c.bg.pattern === 'grid+stars' && c.preset === 'retro-game' && c.bg.corner.main === 'tl' && c.bg.corner.chat === 'none' && c.bg.corner.size === 'l'
  && c.bg.photo.main.fit === 'contain' && c.bg.photo.main.blur === 4 && c.assets && c.assets.keys.join() === 'bgMain'
  && ['profile', 'tabSelected', 'passcodeSelected'].every(k => c.assets.slots.includes(k)) && c.assets.sel.join() === 'chats');

// 페이지 컨텍스트: 엔진으로 빌드해 base64 로 돌려준다
async function buildInPage(page, kind, opts, withAssets = false) {
  return page.evaluate(async ({ kind, opts, withAssets }) => {
    const E = await import('/engine/index.js');
    const load = async n => E.prepareCharacter(await E.decodeImage(await (await fetch(`/demo/${n}.png`)).blob()), {});
    const b64 = blob => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result.split(',')[1]); f.readAsDataURL(blob); });
    const A = await load('jelly');
    let assets;
    if (withAssets) {
      const H = await load('hotteok');
      const photo = await E.decodeImage(await (await fetch('/og.png')).blob());
      assets = { bgMain: photo, bgChat: photo, bgPasscode: photo,
        slots: { profile: H, icon: H, tabSelected: { chats: H }, tabNormal: { friends: H }, passcodeSelected: [H, null, null, H], passcodeArt: H, cornerMain: H, bubble: { peek: H, hang: H, stand: H } } };
    }
    if (kind === 'couple') {
      const B = await load('hotteok');
      const pair = await E.buildCouple(A, B, opts, assets);
      return Promise.all(pair.map(async p => ({ name: p.name, data: await b64(p.blob) })));
    }
    const t = await E.buildTheme(A, null, opts, assets);
    return [{ name: E.themeFileName(opts), data: await b64(await E.packTheme(t.files)) }];
  }, { kind, opts, withAssets });
}

async function pageChecks(browser, bname, results) {
  for (const w of [390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push('pageerror ' + e.message));
    await page.route(u => u.pathname === '/engine/index.js' && !u.search, rt => rt.fulfill({ contentType: 'text/javascript', body: SHIM }));
    await page.goto(BASE + '/index.html', { waitUntil: 'load' });
    // 데모 자동 빌드 후 목업 말풍선(border-image) 과 img 가 실제로 로드됐는지
    await page.waitForFunction(() => document.querySelectorAll('#heroPhone img').length > 0 && [...document.querySelectorAll('#heroPhone img')].every(i => i.complete && i.naturalWidth > 0)
      && !document.querySelector('#heroPhone .wait.on'), null, { timeout: 30000 });
    await page.waitForTimeout(400); // 로딩 덮개 fade-out(0.2s) 끝난 뒤 촬영
    const mock = await page.evaluate(async () => {
      const css = [...document.querySelectorAll('#heroPhone style, #buildPhone style')].map(s => s.textContent).join('\n');
      const urls = [...new Set([...css.matchAll(/url\(["']?(blob:[^"')]+)/g)].map(m => m[1]))];
      const ok = await Promise.all(urls.map(u => new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth > 0); i.onerror = () => r(false); i.src = u; })));
      const th = [...document.querySelectorAll('#tplStrip img.th')];
      await Promise.all(th.map(i => i.decode().catch(() => 0)));
      return { bubbleUrls: urls.length, bubbleLoaded: ok.filter(Boolean).length, imgs: document.querySelectorAll('#heroPhone img, #buildPhone img').length,
        thumbs: th.length, thumbsOk: th.filter(i => i.naturalWidth === 480).length, tpls: (await import('/engine/index.js')).TEMPLATES.length };
    });
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    if (bname === 'chromium') await page.screenshot({ path: join(OUT, `shot-${w}.png`) });
    else await page.screenshot({ path: join(OUT, `shot-${bname}-${w}.png`) });
    if (mock.thumbs) await page.locator('#tplStrip').screenshot({ path: join(OUT, `shot-${bname}-templates-${w}.png`) });
    const r = { browser: bname, check: `page ${w}px`, ok: sw[0] <= sw[1] && mock.bubbleUrls > 0 && mock.bubbleLoaded === mock.bubbleUrls && mock.thumbs === mock.tpls && mock.thumbsOk === mock.tpls,
      detail: `scroll ${sw[0]}/${sw[1]}, bubble url ${mock.bubbleLoaded}/${mock.bubbleUrls}, img ${mock.imgs}, 템플릿 썸네일 ${mock.thumbsOk}/${mock.tpls}` };
    if (w === 390) {
      // UI 흐름: 데모 → 꾸미기 토글 → 무료 받기 → 다운로드 이벤트
      await page.click('#ctaMake');
      await page.click('#demoOne');
      await page.click('#builder [data-step="1"] [data-next]');
      // 템플릿 고르기 → '지금: 이름', 옵션 하나 바꾸면 '직접 꾸밈' (엔진에 TEMPLATES 가 있을 때만)
      let tpl = 'no templates';
      if (await page.locator('#tplGrid .tpl').count()) {
        await page.click('#tplGrid .tpl[data-tpl="near-profile"]');
        tpl = `${await page.getAttribute('#tplGrid .tpl[data-tpl="near-profile"]', 'aria-pressed')} ${await page.textContent('#tplState')}`;
      }
      // 3단계가 열린 채로도 가로 스크롤 없음 (좁은 화면 템플릿 줄은 자기 안에서만 넘어간다)
      const sw3 = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      if (sw3[0] > sw3[1]) { r.ok = false; r.detail += `, 3단계 scroll ${sw3[0]}/${sw3[1]}`; }
      if (!(await page.locator('#more').evaluate(d => d.open))) await page.click('#more summary');
      await page.click('[data-opt="layout"] button[data-v="stand"]');
      for (const [k, v] of [['charSize', 'l'], ['deco', 'heart'], ['outline', 'thick']]) if (await page.locator(`[data-opt="${k}"] button[data-v="${v}"]`).count()) await page.click(`[data-opt="${k}"] button[data-v="${v}"]`);
      if (tpl !== 'no templates') tpl += ` / ${await page.textContent('#tplState')}`;
      await page.click('[data-toggle="pixelChar"]');
      await page.click('[data-toggle="pixelBubble"]');
      // 배경: 레트로 무늬(격자+별), 구석 왼쪽 위·크게, 채팅방 구석 없음, 친구탭 사진(전체 보이기 + 흐림), 자리별 그림 3칸
      const FXD = join(ROOT, 'tests', 'fixtures'), HOT = join(ROOT, 'public', 'demo', 'hotteok.png');
      await page.click('#bgMore summary');
      await page.click('[data-bgk="pattern"] button[data-v="grid+stars"]');
      await page.click('[data-bgk="corner.main"] button[data-v="tl"]');
      await page.click('[data-bgk="corner.chat"] button[data-v="none"]');
      await page.click('[data-bgk="corner.size"] button[data-v="l"]');
      await page.setInputFiles('[data-photo="main"] input[type=file]', join(FXD, 'jelly-photo-900.jpg'));
      await page.waitForSelector('[data-photo="main"] .pctl:not([hidden])');
      await page.click('[data-bgk="photo.main.fit"] button[data-v="contain"]');
      await page.fill('#blur-main', '4'); await page.locator('#blur-main').dispatchEvent('input');
      await page.click('#slotMore summary');
      for (const sl of ['profile', 'tabSelected.chats', 'passcodeSelected.3']) await page.setInputFiles(`[data-slot="${sl}"] input[type=file]`, HOT);
      await page.waitForSelector('[data-slot="passcodeSelected.3"].on');
      await page.fill('#themeName', 'E2E 테마');
      const pressed = await page.getAttribute('[data-toggle="pixelChar"]', 'aria-pressed');
      await page.waitForTimeout(400); // 디바운스(300ms) 뒤 다시 그리기 시작
      await page.waitForFunction(() => !document.querySelector('#buildPhone .wait.on'), null, { timeout: 30000 });
      await page.waitForTimeout(400); // 덮개 fade-out
      await page.locator('#buildPhone').screenshot({ path: join(OUT, `shot-${bname}-builder.png`) });
      await page.locator('#builder [data-step="3"]').screenshot({ path: join(OUT, `shot-${bname}-step3.png`) });
      const prev = await page.evaluate(() => window.__calls.at(-1));
      await page.click('.stepper button[data-go="4"]');
      // v3 프로젝트 저장: 배경 옵션·사진·자리별 그림이 파일에 들어가는지
      const [pdl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.click('#saveProj')]);
      const pj = join(OUT, `${bname}-v3-project.json`);
      await pdl.saveAs(pj);
      const J = JSON.parse(readFileSync(pj, 'utf8'));
      const saveOk = J.v === 3 && Object.keys(J.photos).join() === 'main' && Object.keys(J.slots).sort().join() === 'passcodeSelected.3,profile,tabSelected.chats'
        && J.options.background.pattern === 'grid+stars' && J.options.background.corner.main === 'tl';
      results.rows.push({ browser: bname, check: '배경·자리별 그림 → 엔진 인자, v3 저장', ok: wantBg(prev) && saveOk,
        detail: `미리보기 인자 ${wantBg(prev) ? 'OK' : JSON.stringify(prev)}, 저장 v${J.v} photos [${Object.keys(J.photos)}] slots [${Object.keys(J.slots)}] ${(readFileSync(pj).length / 1024) | 0}KB` });
      results.v3 = pj;
      // 받기 화면: 무료 버튼 하나뿐, 구매·키·체험판 흔적 없음
      const free = await page.evaluate(() => ({ btns: [...document.querySelectorAll('[data-step="4"] button')].map(b => b.textContent.trim()).filter(t => /받기/.test(t)),
        junk: /체험판|라이선스 키|구매|Gumroad|정식판/.test(document.body.innerText) }));
      if (!(free.btns.join() === '테마 받기 (무료)' && !free.junk)) { r.ok = false; r.detail += `, 받기 버튼 ${JSON.stringify(free)}`; }
      // 친구 캐릭터(받은 말풍선): 넣으면 테마 1개에 친구 인자, '상대 폰용도 같이' 를 켜면 커플 2개
      await page.click('.stepper button[data-go="1"]');
      const coupleHidden0 = await page.locator('#coupleRow').isHidden();
      await page.setInputFiles('#fileB', HOT);
      await page.waitForSelector('#coupleRow:not([hidden])');
      await page.click('.stepper button[data-go="4"]');
      await page.click('#getTheme');
      await page.waitForSelector('#files .file button', { timeout: 40000 });
      const nOne = await page.locator('#files .file').count();
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.click('#files .file button')]);
      const f = join(OUT, `${bname}-ui-${dl.suggestedFilename()}`);
      await dl.saveAs(f);
      results.files.push(f);
      const tcall = await page.evaluate(() => window.__calls.at(-1));
      if (!(tcall.kind === 'theme' && tcall.friend && !tcall.trial && wantBg(tcall))) { r.ok = false; r.detail += `, 받기 인자 ${JSON.stringify(tcall)}`; }
      await page.click('.stepper button[data-go="1"]');
      await page.check('#couple');
      await page.click('.stepper button[data-go="4"]');
      await page.click('#getTheme');
      await page.waitForFunction(() => document.querySelectorAll('#files .file').length === 2, null, { timeout: 60000 });
      const ccall = await page.evaluate(() => window.__calls.at(-1));
      const [cdl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.click('#files .file:nth-child(2) button')]);
      const cf = join(OUT, `${bname}-ui-${cdl.suggestedFilename()}`);
      await cdl.saveAs(cf);
      results.files.push(cf);
      results.rows.push({ browser: bname, check: '친구 캐릭터 · 상대 폰용', ok: coupleHidden0 && nOne === 1 && ccall.kind === 'couple' && !ccall.trial,
        detail: `친구 없을 때 체크 숨김 ${coupleHidden0}, 친구만 = 파일 ${nOne}개 (${tcall.kind}, friend ${tcall.friend}), 체크 = ${ccall.kind} 2개 ${cdl.suggestedFilename()}` });
      const tplOk = tpl === 'no templates' || /^true 지금: .+ \/ 지금: 직접 꾸밈$/.test(tpl);
      results.rows.push({ browser: bname, check: 'UI 흐름', ok: pressed === 'true' && tplOk, detail: `aria-pressed=${pressed}, 템플릿 ${tpl}, download ${dl.suggestedFilename()}` });
      const sw2 = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      if (sw2[0] > sw2[1]) { r.ok = false; r.detail += `, 흐름 뒤 scroll ${sw2[0]}/${sw2[1]}`; }
    }
    if (w === 390) {
      // 사진(불투명 JPG) 경로: 키잉이 몸통을 남기는지, 단색 사진은 경고 + 받기 막힘
      const FX = join(ROOT, 'tests', 'fixtures');
      await page.click('.stepper button[data-go="1"]');
      await page.setInputFiles('#fileA', join(FX, 'jelly-photo-900.jpg'));
      await page.waitForFunction(() => /다음 단계에서 배경/.test(document.querySelector('#msg1').textContent), null, { timeout: 15000 });
      await page.click('#builder [data-step="1"] [data-next]');
      // 300x150 = 아직 안 그린 기본 캔버스
      await page.waitForFunction(() => { const c = document.querySelector('#trimList canvas'); return c && !(c.width === 300 && c.height === 150) && c.width < 900; }, null, { timeout: 20000 });
      const photo = await page.evaluate(() => {
        const cv = document.querySelector('#trimList canvas'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        let o = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) o++;
        return { w: cv.width, h: cv.height, fill: o / (cv.width * cv.height), max: document.querySelector('#trimList input[type=range]').max,
          warn: document.querySelector('#trimList figcaption').classList.contains('warn'), disabled: document.querySelector('#getTheme').disabled };
      });
      await page.click('.stepper button[data-go="1"]');
      await page.setInputFiles('#fileA', join(FX, 'plain-beige.png'));
      await page.click('.stepper button[data-go="4"]');
      await page.waitForFunction(() => document.querySelector('#getTheme').disabled && /거의 다 지워졌어요/.test(document.querySelector('#msg4').textContent), null, { timeout: 20000 });
      // 사진 크롭 안 불투명 비율: 몸통이 남으면 0.5 이상 (예전 키잉은 속이 파여 크게 떨어짐)
      results.rows.push({ browser: bname, check: '사진 키잉 + 빈 캐릭터 경고', ok: photo.fill > 0.5 && photo.max === '40' && !photo.warn && !photo.disabled,
        detail: `crop ${photo.w}x${photo.h} fill ${(photo.fill * 100).toFixed(1)}%, slider max ${photo.max}, 단색 사진 = 받기 막힘` });
      const st = await Promise.all(['og.png', 'favicon.png'].map(async p => `${p} ${(await fetch(`${BASE}/${p}`)).status}`));
      results.rows.push({ browser: bname, check: '공유 카드·아이콘', ok: st.every(x => x.endsWith(' 200')), detail: st.join(', ') });
      // 옛 v1 프로젝트(.json) 불러오기: 아는 값은 복원, 새 키는 기본값, 모르는 키는 무시
      const v1 = join(OUT, 'v1-project.json');
      writeFileSync(v1, JSON.stringify({ app: 'tokku-kit', v: 1, id: '0a0b0c0d0e0f', a: { src: 'data:image/png;base64,' + readFileSync(join(ROOT, 'public', 'demo', 'jelly.png')).toString('base64'), tol: 12 },
        options: { name: '옛 프로젝트', layout: 'perch', pixelChar: true, grid: 32, preset: 'pastel-check', bubble: 'x' } }));
      await page.setInputFiles('#fileProj', v1);
      await page.waitForFunction(() => /불러왔어요|아니에요/.test(document.querySelector('#msg1').textContent), null, { timeout: 15000 });
      const pr = sel => page.getAttribute(sel, 'aria-pressed');
      const got = { msg: await page.textContent('#msg1'), name: await page.inputValue('#themeName'), layout: await pr('[data-opt="layout"] button[data-v="perch"]'),
        pc: await pr('[data-toggle="pixelChar"]'), grid: await pr('[data-opt="grid"] button[data-v="32"]'), preset: await pr('[data-bgk="pattern"] button[data-v="check"]'),
        size: await pr('[data-opt="charSize"] button[data-v="m"]'), deco: await pr('[data-opt="deco"] button[data-v="none"]'), pb: await pr('[data-toggle="pixelBubble"]') };
      results.rows.push({ browser: bname, check: 'v1 프로젝트 불러오기', ok: got.msg === '프로젝트를 불러왔어요.' && got.name === '옛 프로젝트' && got.pb === 'false'
        && ['layout', 'pc', 'grid', 'preset', 'size', 'deco'].every(k => got[k] === 'true'), detail: JSON.stringify(got) });
      // v3 프로젝트 다시 불러오기: 배경·사진·자리별 그림 복원 + 엔진에 다시 넘어가는지
      if (results.v3) {
        const n0 = await page.evaluate(() => window.__calls.length);
        await page.setInputFiles('#fileProj', results.v3);
        await page.waitForFunction(n => /E2E 테마/.test(document.querySelector('#themeName').value) && window.__calls.length > n, n0, { timeout: 20000 });
        await page.waitForTimeout(400);
        await page.waitForFunction(() => !document.querySelector('#buildPhone .wait.on'), null, { timeout: 30000 });
        const st = await page.evaluate(() => ({ msg: document.querySelector('#msg1').textContent,
          pat: document.querySelector('[data-bgk="pattern"] button[data-v="grid+stars"]').getAttribute('aria-pressed'),
          tl: document.querySelector('[data-bgk="corner.main"] button[data-v="tl"]').getAttribute('aria-pressed'),
          photo: !document.querySelector('[data-photo="main"] .pth').hidden, slots: [...document.querySelectorAll('[data-slot].on')].map(e => e.dataset.slot).sort(), call: window.__calls.at(-1) }));
        results.rows.push({ browser: bname, check: 'v3 프로젝트 불러오기', ok: st.msg === '프로젝트를 불러왔어요.' && st.pat === 'true' && st.tl === 'true' && st.photo
          && st.slots.join() === 'passcodeSelected.3,profile,tabSelected.chats' && wantBg(st.call), detail: `무늬 ${st.pat}, 구석 tl ${st.tl}, 사진 ${st.photo}, 칸 [${st.slots}], 인자 ${wantBg(st.call) ? 'OK' : JSON.stringify(st.call)}` });
        const sw4 = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
        if (sw4[0] > sw4[1]) { r.ok = false; r.detail += `, v3 뒤 scroll ${sw4[0]}/${sw4[1]}`; }
      }
    }
    r.ok = r.ok && errs.length === 0;
    r.detail += `, console error ${errs.length}` + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : '');
    results.rows.push(r);
    await ctx.close();
  }
}

// ?pack= 캐릭터 팩: 캐릭터·친구·자리별 그림·옵션·색이 채워지고, 종류(픽셀)로 바꾸면 고른 모양은 두고 그림·옵션만, 팩 끄기, 바깥 주소는 거부
const PACK_DIR = join(ROOT, 'tests', 'fixtures', 'pack');
async function packChecks(browser, bname, results) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror ' + e.message));
  await page.route(u => u.pathname === '/engine/index.js' && !u.search, rt => rt.fulfill({ contentType: 'text/javascript', body: SHIM }));
  await page.route(u => u.pathname.startsWith('/__testpack/'), rt => {
    const f = join(PACK_DIR, new URL(rt.request().url()).pathname.slice('/__testpack/'.length));
    return existsSync(f) ? rt.fulfill({ path: f }) : rt.fulfill({ status: 404, body: '' });
  });
  const settled = async () => {
    await page.waitForTimeout(400);
    await page.waitForFunction(() => window.__calls && window.__calls.length && !document.querySelector('#buildPhone .wait.on'), null, { timeout: 30000 });
  };
  await page.goto(BASE + '/index.html?pack=__testpack/pack.json', { waitUntil: 'load' });
  await page.waitForSelector('#packBar:not([hidden])', { timeout: 20000 });
  await settled();
  const st = () => page.evaluate(() => ({ name: document.querySelector('#packName').textContent, vars: [...document.querySelectorAll('#packVars button')].map(b => `${b.textContent}:${b.getAttribute('aria-pressed')}`),
    slots: [...document.querySelectorAll('[data-slot].on')].map(e => e.dataset.slot).sort().join(), friend: !document.querySelector('#thumbB').hidden,
    theme: document.querySelector('#themeName').value, call: window.__calls.at(-1), sw: [document.documentElement.scrollWidth, document.documentElement.clientWidth] }));
  const a = await st();
  await page.locator('#heroPhone').screenshot({ path: join(OUT, `shot-${bname}-pack-hero.png`) });
  const c = a.call;
  const okA = a.name === '테스트 팩' && a.vars.join() === '일러스트:true,픽셀:false' && a.slots === 'bubble.stand,passcodeSelected.3,profile,tabSelected.chats' && a.friend && a.theme === '테스트 팩'
    && c.friend && c.o.layout === 'stand' && c.o.charSize === 'l' && c.o.accent === '#3366CC' && c.bg.pattern === 'cubes' && !c.o.pixelChar && !c.o.slotsArePixel
    && c.assets.slots.sort().join() === 'bubble,passcodeSelected,profile,tabSelected' && a.sw[0] <= a.sw[1];
  // 종류 바꾸기: 픽셀 (사용자가 바꾼 크기 '보통' 은 그대로)
  if (!(await page.locator('#more').evaluate(d => d.open))) { await page.click('.stepper button[data-go="3"]'); await page.click('#more summary'); }
  await page.click('[data-opt="charSize"] button[data-v="m"]');
  const n0 = await page.evaluate(() => window.__calls.length);
  await page.click('#packVars button:nth-child(2)');
  await page.waitForFunction(n => window.__calls.length > n && window.__calls.at(-1).o.pixelChar, n0, { timeout: 20000 });
  await settled();
  const b = await st();
  const okB = b.vars.join() === '일러스트:false,픽셀:true' && b.slots === 'profile' && b.call.o.slotsArePixel && b.call.o.layout === 'stand' && b.call.o.charSize === 'm' && b.call.friend;
  await page.click('#packOff');
  await page.waitForFunction(() => !location.search && document.querySelector('#packBar').hidden, null, { timeout: 15000 });
  // 바깥 주소 ?pack= 은 불러오지 않고 데모로 시작 (안내 띠)
  await page.goto(BASE + '/index.html?pack=https://example.com/pack.json', { waitUntil: 'load' });
  await page.waitForFunction(() => !document.querySelector('#engineNote').hidden, null, { timeout: 15000 });
  const ext = await page.evaluate(() => ({ bar: document.querySelector('#packBar').hidden, note: document.querySelector('#engineNoteText').textContent }));
  const okC = ext.bar && /팩을 불러오지 못해서/.test(ext.note);
  results.rows.push({ browser: bname, check: '캐릭터 팩 ?pack=', ok: okA && okB && okC && errs.length === 0,
    detail: `팩 ${okA ? 'OK' : JSON.stringify(a)}, 픽셀 종류 ${okB ? 'OK' : JSON.stringify(b)}, 팩 끄기 OK, 바깥 주소 거부 ${okC}, scroll ${a.sw.join('/')}, console error ${errs.length}` + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : '') });
  await ctx.close();
}

async function buildChecks(browser, bname, results) {
  const page = await (await browser.newContext()).newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror ' + e.message));
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.JSZip, null, { timeout: 20000 });
  const jobs = [];
  // layout 5 x pixelBubble 2 x charSize 3 (none 은 크기 무관이라 m 만). 나머지 옵션은 돌려 가며 표본으로
  const E = await page.evaluate(async () => { const E = await import('/engine/index.js'); return { L: E.LAYOUTS, S: E.CHAR_SIZES, SH: E.SHAPES, O: Object.keys(E.OUTLINES), D: E.DECOS, F: Object.keys(E.FILL_TONES), T: E.TEMPLATES }; });
  let n = 0;
  for (const layout of E.L) for (const pixelBubble of [false, true]) for (const charSize of layout === 'none' ? ['m'] : E.S) {
    const i = n++, pixelChar = i % 3 === 1;
    jobs.push(['single', { name: `젤리 ${layout} ${charSize}${pixelChar ? ' pc' : ''}${pixelBubble ? ' pb' : ''}`, id: ID, layout, charSize, pixelChar, pixelBubble,
      bubbleShape: E.SH[i % E.SH.length], outline: E.O[i % E.O.length], outlineColor: i % 2 ? 'dark' : 'auto', deco: E.D[i % E.D.length], fillTone: E.F[i % E.F.length], preset: 'cream-dots' }]);
  }
  for (const t of E.T) jobs.push(['single', { ...t.opts, name: `템플릿 ${t.id}`, id: ID, preset: 'pastel-check' }]);
  jobs.push(['couple', { name: '젤리 호떡', id: ID, layout: 'perch', preset: 'pastel-check' }]);
  jobs.push(['single', { name: '젤리 레트로 픽셀', id: ID, layout: 'perch', preset: 'retro-game', pixelChar: true, pixelBubble: true }]);
  // 배경 커스텀 + 사진 + 자리별 그림 (일반 / 픽셀 / 커플)
  const BG = { pattern: 'cubes', patternSize: 'l', color: '#F4E9DD', photo: { chat: { fit: 'contain', blur: 6, dim: 0.3 } }, corner: { main: 'tl', chat: 'none', size: 's', opacity: 0.6 } };
  jobs.push(['single', { name: '젤리 배경 사진', id: ID, layout: 'peek', preset: 'cream-dots', background: BG }, true]);
  jobs.push(['single', { name: '젤리 배경 픽셀', id: ID, layout: 'hang', preset: 'cream-dots', pixelChar: true, pixelBubble: true, background: { ...BG, pattern: 'hearts' } }, true]);
  jobs.push(['couple', { name: '젤리 호떡 배경', id: ID, layout: 'stand', preset: 'cream-dots', background: { ...BG, pattern: 'grid+stars' } }, true]);
  for (const [kind, opts, withAssets] of jobs) {
    const t0 = Date.now();
    for (const { name, data } of await buildInPage(page, kind, opts, withAssets)) {
      const f = join(OUT, `${bname}-${name}`);
      writeFileSync(f, Buffer.from(data, 'base64'));
      results.files.push(f);
    }
    log(bname, kind, opts.name, `${Date.now() - t0}ms`);
  }
  results.rows.push({ browser: bname, check: `엔진 빌드 ${jobs.length}건`, ok: errs.length === 0, detail: `console error ${errs.length}` + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : '') });
  await page.context().close();
}

const which = process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'webkit'];
mkdirSync(OUT, { recursive: true });
const pw = await loadPlaywright();
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', join(ROOT, 'public')], { stdio: 'ignore' });
let fail = false;
try {
  await waitServer();
  for (const bname of which) {
    const results = { rows: [], files: [] };
    const browser = await launch(pw, bname);
    try {
      await buildChecks(browser, bname, results);
      await pageChecks(browser, bname, results);
      await packChecks(browser, bname, results);
    } finally { await browser.close(); }
    const v = spawnSync('python3', [join(ROOT, 'scripts', 'verify_ktheme.py'), ...results.files], { encoding: 'utf8' });
    const bad = v.stdout.split('\n').filter(l => /FAIL/.test(l));
    results.rows.push({ browser: bname, check: `verify_ktheme ${results.files.length}개`, ok: v.status === 0, detail: v.status === 0 ? 'all OK' : bad.join(' | ') + v.stderr });
    for (const r of results.rows) { console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.browser}  ${r.check}  (${r.detail})`); if (!r.ok) fail = true; }
  }
} finally { server.kill(); }
process.exit(fail ? 1 : 0);
