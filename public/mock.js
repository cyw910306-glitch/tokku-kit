// 폰 목업 미리보기. 실제 생성 PNG(object URL)로 그린다.
// 프레임(다이내믹 아일랜드, 상태바 SVG, 홈 인디케이터)과 말풍선 border-image 규칙은 기준 구현 목업(mockup.html)에서 가져옴.

const TABS = [['friends', '친구'], ['chat', '채팅'], ['lock', '잠금'], ['bubble', '말풍선 테스트']];
// 친구 화면 아래 탭 바 (누르면 선택 그림이 바뀐다: 자리별 탭 그림 확인용). 통화 탭은 카카오톡 설정에 따라 보여서 목업에선 뺀다
const TABBAR = [['friends', 'Friends'], ['chats', 'Chats'], ['now', 'Now'], ['shopping', 'Shopping'], ['more', 'More']];

const SBAR = '<svg width="64" height="12" viewBox="0 0 64 12" fill="#1d1a1c" aria-hidden="true"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="6" width="3" height="6" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/><path d="M29 11.5l2.4-2.6a3.4 3.4 0 0 0-4.8 0z M24.3 6.6a6.7 6.7 0 0 1 9.4 0l-1.3 1.4a4.8 4.8 0 0 0-6.8 0z M22 4.2a10 10 0 0 1 14 0l-1.3 1.4a8.1 8.1 0 0 0-11.4 0z"/><rect x="40" y="1" width="21" height="10" rx="3" fill="none" stroke="#1d1a1c" stroke-opacity=".45"/><rect x="42" y="3" width="16" height="6" rx="1.5"/><rect x="62" y="4" width="1.6" height="4" rx=".8" fill-opacity=".45"/></svg>';

const CSS = `
.pm{width:100%}
.pm-tabs{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:14px}
.pm-tabs button{font-family:inherit;font-weight:600;font-size:13px;line-height:1;padding:8px 12px;border-radius:999px;border:1px solid var(--line,#E7D6CC);background:#fff;color:var(--ink,#4A3440);cursor:pointer;min-height:36px}
.pm-tabs button[aria-pressed="true"]{background:var(--ink,#4A3440);color:#fff;border-color:var(--ink,#4A3440)}
.pm-stage{position:relative;margin:0 auto;max-width:397px}
.pm .phone{position:absolute;left:11px;top:11px;width:375px;height:780px;border-radius:44px;overflow:hidden;transform-origin:0 0;background:#fff;
  box-shadow:0 0 0 11px #1d1a1c,0 0 0 12px #4a4246,0 30px 60px rgba(74,52,64,.22);font-family:-apple-system,"Apple SD Gothic Neo",Pretendard,sans-serif;color:var(--p-text)}
.pm .phone *{box-sizing:border-box;margin:0;padding:0}
.pm .island{position:absolute;top:11px;left:50%;transform:translateX(-50%);width:120px;height:34px;border-radius:20px;background:#000;z-index:20}
.pm .sbar{position:absolute;top:0;left:0;right:0;height:47px;display:flex;justify-content:space-between;align-items:center;padding:4px 30px 0 36px;font:600 15px -apple-system,sans-serif;color:#1d1a1c;z-index:19}
.pm .homeind{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);width:134px;height:5px;border-radius:3px;background:#1d1a1c;z-index:20}
.pm .scr{position:absolute;inset:0;background:var(--p-bg)}
.pm .status{height:47px}
.pm .bgimg{position:absolute;inset:0;background-position:top center;background-size:375px auto;background-repeat:no-repeat}
.pm .hdr{position:relative;display:flex;justify-content:space-between;align-items:center;padding:6px 18px 10px;font-weight:700;font-size:22px}
.pm .hdr i{font-style:normal;display:flex;gap:18px}
.pm .me,.pm .fr{position:relative;display:flex;align-items:center;gap:12px;padding:8px 18px}
.pm .me img{width:58px;height:58px;border-radius:22px}
.pm .fr img{width:44px;height:44px;border-radius:17px}
.pm .nm{font-size:15px;font-weight:600}.pm .me .nm{font-size:17px}
.pm .st{font-size:12.5px;color:var(--p-muted);margin-top:2px}
.pm .sec{position:relative;font-size:12px;color:var(--p-muted);padding:14px 18px 4px;border-top:1px solid var(--p-line);margin-top:8px}
.pm .tabbar{position:absolute;left:0;right:0;bottom:0;height:83px;background-color:var(--p-tab);background-position:top center;background-size:470px 49px;background-repeat:no-repeat;display:flex;justify-content:space-around;padding-top:5px}
.pm .tabbar img{width:38px;height:38px;cursor:pointer}
.pm .chdr{position:relative;text-align:center;font-weight:700;font-size:17px;padding:6px 0 14px}
.pm .msgs{position:relative;padding:0 12px;display:flex;flex-direction:column;gap:4px}
.pm .m{display:flex;align-items:flex-end;gap:5px;max-width:78%}
.pm .m.r{align-self:flex-start}.pm .m.s{align-self:flex-end;flex-direction:row-reverse}
.pm .b{font-size:15px;line-height:1.35;color:var(--p-text);border-style:solid;flex-shrink:0;max-width:100%}
.pm .b span{display:block;margin:-2px 0;word-break:keep-all;overflow-wrap:anywhere}
.pm .meta{font-size:10px;color:var(--p-muted);white-space:nowrap;text-align:right}
.pm .meta b{color:var(--p-accent);font-weight:700;display:block}
.pm .who{display:flex;gap:8px;align-items:flex-start}
.pm .who>div{min-width:0;flex:1;display:flex;flex-direction:column}
.pm .who img{width:38px;height:38px;border-radius:14px;flex-shrink:0}
.pm .who .nmx{font-size:12px;color:var(--p-muted);margin:0 0 3px 2px}
.pm .input{position:absolute;left:0;right:0;bottom:0;height:84px;background:#fff;display:flex;gap:10px;align-items:flex-start;padding:10px 12px}
.pm .input .plus{width:34px;height:34px;border-radius:50%;background:#F4EEEA;color:var(--p-send,var(--p-accent));font-size:24px;display:grid;place-items:center}
.pm .input .field{flex:1;height:36px;border-radius:18px;background:#F6F1EE;color:#8E7884;font-size:14px;padding:9px 14px}
.pm .input .send{width:34px;height:34px;border-radius:50%;background:var(--p-send,var(--p-accent));color:#fff;display:grid;place-items:center;font-size:15px}
.pm .art{position:absolute;top:0;left:0;width:375px;height:375px;background-position:center;background-size:cover}
.pm .pt{position:absolute;top:120px;width:100%;text-align:center;font-size:17px}
.pm .bul{position:absolute;top:160px;width:100%;display:flex;justify-content:center;gap:6px}
.pm .bul img{width:44px;height:44px}
.pm .pad{position:absolute;bottom:0;left:0;right:0;height:405px;background:var(--p-keypad);display:grid;grid-template-columns:repeat(3,1fr);padding:24px 30px 50px}
.pm .pad div{display:grid;place-items:center;font-size:28px;position:relative}
.pm .pad .on::before{content:"";position:absolute;width:60px;height:60px;background-position:center;background-size:contain;background-repeat:no-repeat;background-image:var(--p-pressed)}
.pm .pad .on span{position:relative}
.pm .lbl{position:relative;font-size:11px;color:var(--p-muted);text-align:center;margin:10px 0 2px}
.pm .wait{position:absolute;inset:0;display:grid;place-items:center;z-index:30;background:rgba(255,246,238,.82);font:600 14px Pretendard,sans-serif;color:#4A3440;opacity:0;pointer-events:none;transition:opacity .2s}
.pm .wait.on{opacity:1}
.pm .wait.solid{background:#FFF6EE}
.pm .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#B23A64;margin-right:8px;animation:pmb 1s infinite alternate}
@keyframes pmb{to{opacity:.2}}
@media (prefers-reduced-motion:reduce){.pm .dot{animation:none}}
`;

let styled = false, seq = 0;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 한쪽(보낸/받은) 말풍선 기하. 받은 쪽 cap X = W - X - 1, 인셋 좌우 반전. b = meta.bubbles['01'|'02'] */
export function bubbleGeom(b, recv) {
  const X = recv ? b.W - b.X - 1 : b.X;
  let [t, l, bo, r] = b.ins;
  if (recv) [l, r] = [r, l];
  return { W: b.W, H: b.H, X, Y: b.Y, R: b.W - X - 1, B: b.H - b.Y - 1, t, l, bo, r };
}

// SPEC 4: min-width W / min-height H, slice Y*3 (W-X-1)*3 (H-Y-1)*3 X*3 fill, 폭 Y,(W-X-1),(H-Y-1),X px, border-width = 인셋
function bubbleRule(sel, url, b, recv) {
  const g = bubbleGeom(b, recv);
  return `${sel}{min-width:${g.W}px;min-height:${g.H}px;border-width:${g.t}px ${g.r}px ${g.bo}px ${g.l}px;` +
    `border-image:url("${url}") ${g.Y * 3} ${g.R * 3} ${g.B * 3} ${g.X * 3} fill / ${g.Y}px ${g.R}px ${g.B}px ${g.X}px stretch}`;
}

const msg = (side, text, opt = {}) =>
  `<div class="m ${side}${opt.g ? ' g' : ''}"${opt.ml ? ' style="margin-left:46px"' : ''}><div class="b"><span>${text}</span></div><div class="meta">${side === 's' ? '<b>1</b>' : ''}${opt.t || '오후 4:02'}</div></div>`;
// 친구 캐릭터가 있으면 친구 프사 자리는 '진짜 친구 사진' 자리라 빈 사람 모양으로 (테마 기본 프사 = 내 캐릭터라 역할이 바뀌어 보임)
const PERSON = `<img class="ph" alt="" src="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38"><rect width="38" height="38" fill="#E9E4E6"/><circle cx="19" cy="15" r="6.5" fill="#B9AEB3"/><path d="M7 33c1.5-7 6.5-10 12-10s10.5 3 12 10z" fill="#B9AEB3"/></svg>')}">`;
const recv = (u, name, text, t, info = {}) =>
  `<div class="who">${info.friendChar ? PERSON : `<img src="${u('profileImg01')}" alt="">`}<div><div class="nmx">${esc(name)}</div>${msg('r', text, { t })}</div></div>`;

function screens(u, p, info, sel = 'friends') {
  const friend = esc(info.friend || '호떡');
  const ic = (d) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  return {
    friends: `<div class="bgimg" style="background-image:url('${u('mainBgImage')}')"></div><div class="status"></div>
      <div class="hdr">친구 <i>${ic('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>')}<img src="${u('findBtnAddFriend')}" alt="" style="width:28px;height:23px"></i></div>
      <div class="me"><img src="${u('profileImg01')}" alt=""><div><div class="nm">${esc(info.me || '나')}</div><div class="st">오늘도 귀여움 충전 완료</div></div></div>
      <div class="sec">친구 4</div>
      <div class="fr"><img src="${u('profileImg01')}" alt=""><div><div class="nm">${friend}</div><div class="st">산책 가자!</div></div></div>
      <div class="fr"><img src="${u('profileImg01')}" alt=""><div><div class="nm">콩이</div><div class="st">간식 맛집 발견</div></div></div>
      <div class="fr"><img src="${u('profileImg01')}" alt=""><div><div class="nm">회사 동기</div><div class="st">금요일 최고</div></div></div>
      <div class="fr"><img src="${u('profileImg01')}" alt=""><div><div class="nm">엄마</div><div class="st"></div></div></div>
      <div class="tabbar" style="background-image:url('${u('maintabBgImage')}')">
        ${TABBAR.map(([k, n]) => `<img src="${u('maintabIco' + n + (k === sel ? 'Selected' : ''))}" alt="" data-t="${k}">`).join('')}
      </div>`,
    chat: `<div class="bgimg" style="background-image:url('${u('chatroomBgImage')}')"></div><div class="status"></div>
      <div class="chdr">${friend}</div>
      <div class="msgs">
        ${recv(u, info.friend || '호떡', '산책 갈래?', '오후 4:02', info)}
        ${msg('r', '날씨 진짜 좋대!', { g: 1, ml: 1 })}
        ${msg('s', '좋아 좋아!!', { t: '오후 4:07' })}
        ${msg('s', '간식도 챙겨 갈게', { g: 1, t: '오후 4:07' })}
        ${recv(u, info.friend || '호떡', 'ㅋㅋ', '오후 4:08', info)}
        ${msg('s', 'ㅋ', { t: '오후 4:09' })}
      </div>
      <div class="input"><div class="plus">+</div><div class="field">메시지 입력</div><div class="send">↑</div></div>`,
    lock: `<div class="art" style="background-image:url('${u('passcodeBgImage')}')"></div>
      <div class="pt">암호를 입력해 주세요</div>
      <div class="bul">${[1, 2, 3, 4].map(i => `<img src="${u(`passcodeImgCode0${i}Selected`)}" alt="">`).join('')}</div>
      <div class="pad" style="--p-pressed:url('${u('passcodeKeypadPressed')}')">
        <div>1</div><div>2</div><div>3</div><div>4</div><div class="on"><span>5</span></div><div>6</div><div>7</div><div>8</div><div>9</div><div></div><div>0</div><div>⌫</div>
      </div>`,
    bubble: `<div class="bgimg" style="background-image:url('${u('chatroomBgImage')}')"></div><div class="status"></div>
      <div class="chdr">말풍선 테스트</div>
      <div class="msgs">
        <div class="lbl">짧은 글</div>
        ${msg('r', 'ㅋ')}${msg('s', 'ㅋ')}
        <div class="lbl">한 줄</div>
        ${msg('r', '오늘 뭐 먹을까?')}${msg('s', '떡볶이 어때?')}
        <div class="lbl">다섯 줄 (이어 보낸 말풍선)</div>
        ${msg('r', '첫째 줄<br>둘째 줄<br>셋째 줄<br>넷째 줄<br>다섯째 줄', { g: 1 })}
        ${msg('s', '하나<br>둘<br>셋<br>넷<br>다섯', { g: 1 })}
      </div>`,
  };
}

/**
 * host 안에 탭 4개 + 폰 하나를 만든다.
 * render(u, meta, info): u = name => object URL ('mainBgImage' 처럼 크기 접미사 없이), meta = buildTheme 의 meta.
 * info.rules 가 있으면(엔진 bubbleRules) 그걸로 말풍선 CSS 를 만들고, 없으면 같은 규칙의 자체 구현을 쓴다.
 */
export function createPhone(host, { tab = 'chat', label = '테마 미리보기' } = {}) {
  if (!styled) { const s = document.createElement('style'); s.textContent = CSS; document.head.append(s); styled = true; }
  const cls = 'pm' + (++seq);
  host.classList.add('pm', cls);
  host.innerHTML = `<div class="pm-tabs" role="group" aria-label="${esc(label)} 화면 고르기">${TABS.map(([k, t]) => `<button type="button" data-tab="${k}" aria-pressed="${k === tab}">${t}</button>`).join('')}</div>
    <div class="pm-stage"><div class="phone" role="img" aria-label="${esc(label)}"><style></style><div class="scr"></div>
      <div class="island"></div><div class="sbar"><span>9:41</span>${SBAR}</div><div class="homeind"></div>
      <div class="wait on solid"><span><i class="dot"></i><span class="wt">미리보기를 준비하고 있어요</span></span></div></div></div>`;
  const stage = host.querySelector('.pm-stage'), phone = host.querySelector('.phone'), scr = host.querySelector('.scr');
  const style = phone.querySelector('style'), wait = host.querySelector('.wait');
  let html = null, last = null, sel = 'friends';
  const show = () => { if (html) scr.innerHTML = html[tab]; };
  scr.addEventListener('click', e => {
    const t = e.target.closest('.tabbar img[data-t]'); if (!t || !last) return;
    sel = t.dataset.t; html = screens(...last, sel); show();
  });
  host.querySelector('.pm-tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]'); if (!b) return;
    tab = b.dataset.tab;
    host.querySelectorAll('.pm-tabs button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    show();
  });
  let lastW = -1;
  const fit = () => {
    const w = stage.clientWidth; if (w === lastW) return; lastW = w;
    const s = Math.min(1, (w - 22) / 375) || 1;
    phone.style.transform = `scale(${s})`;
    stage.style.height = (780 * s + 22) + 'px';
  };
  new ResizeObserver(() => requestAnimationFrame(fit)).observe(stage); fit();

  return {
    render(u, meta, info = {}) {
      const p = meta.palette;
      phone.style.cssText += `;--p-bg:${p.bg};--p-tab:${p.tabBg};--p-text:${p.text};--p-muted:${p.muted};--p-accent:${p.accent};--p-line:${p.line};--p-keypad:${p.keypad};--p-send:${meta.textTone === 'mono' ? p.text : p.accent}`;
      const q = `.${cls} `, B = meta.bubbles;
      const files = Object.fromEntries(['Send01', 'Send02', 'Receive01', 'Receive02'].map(f => [f, u('chatroomBubble' + f)]));
      style.textContent = info.rules ? info.rules(meta, files, q) : bubbleRule(q + '.s .b', u('chatroomBubbleSend01'), B['01'], false) + bubbleRule(q + '.s.g .b', u('chatroomBubbleSend02'), B['02'], false) +
        bubbleRule(q + '.r .b', u('chatroomBubbleReceive01'), B['01'], true) + bubbleRule(q + '.r.g .b', u('chatroomBubbleReceive02'), B['02'], true);
      last = [u, p, info];
      html = screens(u, p, info, sel);
      show();
    },
    setLoading(on, text) {
      if (text) wait.querySelector('.wt').textContent = text;
      wait.classList.toggle('on', !!on);
      if (!on) wait.classList.remove('solid');
    },
    setTab(t) { host.querySelector(`.pm-tabs button[data-tab="${t}"]`)?.click(); },
  };
}
