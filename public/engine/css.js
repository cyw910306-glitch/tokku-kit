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

/** meta = { bubbles: {'01','02'}, palette, themeId, themeName } -> CSS */
export function buildCss(meta) {
  const pal = meta.palette;
  const tokens = {
    ...pal,
    accentDark: shiftL(pal.accent, -0.1),
    name: meta.themeName,
    id: meta.themeId,
    bubbleSend: bubbleBlock('send', meta.bubbles['01'], meta.bubbles['02'], pal),
    bubbleReceive: bubbleBlock('receive', meta.bubbles['01'], meta.bubbles['02'], pal),
  };
  return CSS_TEMPLATE.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (tokens[k] == null) throw new Error(`css token ${k} missing`);
    return tokens[k];
  });
}
