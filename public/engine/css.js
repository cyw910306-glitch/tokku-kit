// KakaoTalkTheme.css 생성: spec.js 템플릿의 {{토큰}} 을 Palette 와 말풍선 프리셋으로 채운다. DOM 없음.
import { CSS_TEMPLATE } from './spec.js';
import { capFor } from './bubble.js';
import { shiftL } from './palette.js';

export const ID_PREFIX = 'com.kakao.talk.theme.tokku';

export function themeId(id) {
  if (!/^[0-9a-f]{12}$/.test(id)) throw new Error(`theme id must be 12 hex chars: ${id}`);
  return ID_PREFIX + id;
}

/** CSS 문자열 안에 들어갈 이름: 따옴표·역슬래시·중괄호·줄바꿈·em dash 제거, 40자 */
export function themeName(name) {
  return String(name || '').replace(/['"\\{}\n\r;\u2014]/g, '').trim().slice(0, 40) || '나의 테마';
}

function bubbleBlock(side, b1, b2, pal) {
  const nm = side === 'send' ? 'Send' : 'Receive';
  const c1 = capFor(b1, side), c2 = capFor(b2, side);
  const cap = c => `${c.X}px ${c.Y}px`, ins = c => c.ins.map(v => v + 'px').join(' ');
  return `MessageCellStyle-${nm}
{
    -ios-background-image: 'chatroomBubble${nm}01.png' ${cap(c1)};
    -ios-selected-background-image: 'chatroomBubble${nm}01Selected.png' ${cap(c1)};
    -ios-group-background-image: 'chatroomBubble${nm}02.png' ${cap(c2)};
    -ios-group-selected-background-image: 'chatroomBubble${nm}02Selected.png' ${cap(c2)};
    -ios-title-edgeinsets: ${ins(c1)};
    -ios-group-title-edgeinsets: ${ins(c2)};
    -ios-text-color: ${pal.text};
    -ios-selected-text-color: ${pal.text};
    -ios-unread-text-color: ${pal.accent};
}`;
}

// 무채색 글자 모드 (textTone mono): 목록 선택 배경 = 글자색 5%, 입력창 보내기·버튼·섹션 제목·공유바 이름 = 글자색 (색은 그림·면에만)
const MONO = [
  [/(-ios-selected-background-color: )\{\{accent\}\};(\s+-ios-selected-background-alpha: )0\.06;/, '$1{{text}};$20.05;'],
  [/(-ios-send-normal-background-color: )\{\{accent\}\}/, '$1{{text}}'],
  [/(-ios-send-highlighted-background-color: )\{\{accentDark\}\}/, '$1{{textDark}}'],
  [/(-ios-button-normal-foreground-color: )\{\{accent\}\}/, '$1{{text}}'],
  [/(-ios-button-highlighted-foreground-color: )\{\{accentDark\}\}/, '$1{{textDark}}'],
  [/(-ios-button-normal-background-color: )\{\{accent\}\}/, '$1{{text}}'],
  [/(SectionTitleStyle-Main\s+\{\s+border-color: \{\{line\}\};\s+border-alpha: 0\.2;\s+-ios-text-color: )\{\{accent\}\}/, '$1{{text}}'],
  [/(DirectShareBarName \{ -ios-text-color: )\{\{accent\}\}/, '$1{{text}}'],
];

// 헤이즈 위 글자 (meta.bgText.main / .passcode = { text, muted, bg }): 친구탭 머리글·목록·섹션 제목·안내 글자, 잠금 제목만 그 색.
// bg (밤하늘) 가 있으면 목록 바탕색도 그 색 (배경 그림이 없는 화면에서도 밝은 글자가 보이게). 블록 하나씩만 바꾼다
const BG_TEXT = {
  main: [
    ['HeaderStyle-Main', b => b.replace(/\{\{text\}\}/g, '{{mainText}}').replace(/\{\{muted\}\}/g, '{{mainMuted}}')],
    ['MainViewStyle-Primary', (b, t) => b.replace(/\{\{text\}\}/g, '{{mainText}}').replace(/\{\{muted\}\}/g, '{{mainMuted}}')
      .replace(/(\n\s+)background-color: \{\{bg\}\}/, t.bg ? '$1background-color: {{mainBg}}' : '$&')],
    ['SectionTitleStyle-Main', b => b.replace(/-ios-text-color: \{\{(accent|text)\}\}/, '-ios-text-color: {{mainText}}')],
    ['FeatureStyle-Primary', b => b.replace(/\{\{muted\}\}/, '{{mainMuted}}')],
  ],
  passcode: [['LabelStyle-PasscodeTitle', b => b.replace(/\{\{text\}\}/, '{{passText}}')]],
};

/** meta = { bubbles: {'01','02'}, palette, themeId, themeName, textTone?, bgText? } -> CSS */
export function buildCss(meta) {
  const pal = meta.palette;
  let tpl = CSS_TEMPLATE;
  if (meta.textTone === 'mono') for (const [re, to] of MONO) {
    if (!re.test(tpl)) throw new Error(`css template changed: ${re}`);
    tpl = tpl.replace(re, to);
  }
  const bt = meta.bgText || {};
  for (const [w, list] of Object.entries(BG_TEXT)) if (bt[w]) for (const [name, fn] of list) {
    const re = new RegExp(`(^|\\n)${name}\\s*\\{(?:[^{}]|\\{\\{\\w+\\}\\})*\\}`); // 블록 안 {{토큰}} 은 건너뜀
    if (!re.test(tpl)) throw new Error(`css template changed: ${name}`);
    tpl = tpl.replace(re, m => fn(m, bt[w]));
  }
  const tokens = {
    ...pal,
    accentDark: shiftL(pal.accent, -0.1),
    textDark: shiftL(pal.text, -0.1),
    ...(bt.main && { mainText: bt.main.text, mainMuted: bt.main.muted, mainBg: bt.main.bg }),
    ...(bt.passcode && { passText: bt.passcode.text }),
    name: meta.themeName,
    id: meta.themeId,
    bubbleSend: bubbleBlock('send', meta.bubbles['01'], meta.bubbles['02'], pal),
    bubbleReceive: bubbleBlock('receive', meta.bubbles['01'], meta.bubbles['02'], pal),
  };
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (tokens[k] == null) throw new Error(`css token ${k} missing`);
    return tokens[k];
  });
}
