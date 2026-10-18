# 톡꾸 키트 (Tokku Kit) · 구현 계약서 v1

이미지 한 장(선택: 커플 상대 한 장)을 넣으면 **카카오톡 iOS 테마(.ktheme)** 가 브라우저 안에서 완성되는 DIY 도구.
**무료·비영리 오픈소스** (2026-10-18 결정). 가격표·구매·라이선스 키·체험판 워터마크 없음, 누구나 정식 품질로 받는다. 목적 = 운영자 인스타 팔로워 키우기.
규격 원본: 카카오 공식 테마 가이드 26.8.0 샘플 (파일명·크기 정답). 샘플 그림은 카카오 캐릭터라 저장소에 넣지 않고, 이름·크기 목록만 `tests/fixtures/ref-images.json` 으로 둔다. CSS 뼈대: `scripts/template.css`.

## 0. 원칙 (어기면 안 됨)
- 상품명·아이콘·도메인·문구에 '카카오'·'카톡' 상표를 상품명처럼 쓰지 않는다. 설명은 "카카오톡 iOS 테마 파일(.ktheme) 제작 도구, ㈜카카오와 무관".
- 공개 사이트·저장소·데모·공유 카드에 저작권 IP 캐릭터(애니 등) 절대 금지. 사용자는 자기 이미지를 붙여 쓴다. 애니 캐릭터 예시는 운영자 인스타 홍보에서만 운영자가 직접 만들어 보여 준다. 데모 = `public/demo/jelly.png`(강아지 젤리, 오리지널), `public/demo/hotteok.png`(고양이 호떡, 오리지널).
- 이미지는 서버로 보내지 않는다. 렌더·압축 100% 브라우저. 서버 함수 없음.
- AGPL 라이브러리 금지(@imgly/background-removal 등). 외부 스크립트는 고정 버전 CDN만:
  - JSZip `https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js`
  - 폰트 Pretendard `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css`, Galmuri `https://cdn.jsdelivr.net/npm/galmuri@2.40.3/dist/galmuri.css`
- 빌드 도구 없음: 바닐라 ES 모듈(`<script type="module">`). Node 24 로 단위 테스트.
- em dash(U+2014) 문자 금지(모든 문구·주석). 반투명+blur 고정 헤더 금지(단색+헤어라인).
- 화면 문구는 한국어, 쉬운 말.

## 1. 폴더
```
public/                 # 배포 범위 (vercel outputDirectory). 이 밖은 공개 안 됨
  index.html            # 랜딩 + 빌더 (한 페이지)
  terms.html            # 이용약관·이미지 정책
  app.js                # UI 상태·단계·이벤트 (UI 담당)
  mock.js               # 폰 목업 미리보기 (UI 담당)
  og.png                # 공유 썸네일 1200x630 (UI 담당, 데모 테마 목업으로)
  demo/jelly.png demo/hotteok.png
  engine/               # 엔진 담당. 순수 함수는 DOM 없이 Node 테스트 가능해야 함
    spec.js  presets.js  pixelize.js  palette.js  keying.js  bubble.js  render.js  pack.js  index.js
scripts/template.css    # CSS 뼈대 (견본 색 -> Palette 토큰)
scripts/gen-spec.mjs    # 공식 샘플 Images 폴더(인자로 받음, 관리자만) + template.css -> public/engine/spec.js, tests/fixtures/ref-images.json
scripts/verify_ktheme.py  # .ktheme 1개 검사기 (CLI: python3 scripts/verify_ktheme.py file.ktheme)
tests/engine.test.mjs   # node --test
tests/e2e.mjs           # playwright@1.48.2 (npx), chromium+webkit 헤드리스
tests/gen-thumbs.mjs    # 템플릿 썸네일 public/templates/<id>.png (가로 480) 생성. TEMPLATES 바꾸면 다시 실행. 데모는 젤리, gen-thumbs 의 DEMO 표로 템플릿별 교체(hang = 엎드린 호떡)
vercel.json  package.json  README.md
```

## 2. 엔진 공개 API (`public/engine/index.js` 가 전부 re-export)
이미지 데이터 형식 `Img = { width, height, data: Uint8ClampedArray(RGBA) }` (ImageData 호환).

```js
// 옵션 (UI 가 만들어 넘김). 기본값은 DEFAULTS 로 export.
Options = {
  name: '나의 테마',            // 테마 이름 (CSS -kakaotalk-theme-name)
  id: 'a1b2c3d4e5f6',           // 12자리 hex, 프로젝트 생성 시 1회. 테마 ID = 'com.kakao.talk.theme.tokku' + id
  preset: 'cream-dots',         // 'cream-dots' | 'pastel-check' | 'retro-game' | 'plain-minimal'
  layout: 'perch',              // 말풍선 위 캐릭터: 'none' | 'perch'(올라앉기) | 'peek'(빼꼼, 몸통 뒤) | 'hang'(걸치기, 상자 아래 ~18% 만 테두리 앞으로) | 'stand'(프사 옆 꼬마)
  charSize: 'm',                // 's' | 'm' | 'l' : 말풍선 W·H·X·Y·인셋을 presets.bubbleGeometry 가 다시 계산
  bubbleShape: 'round',         // 'round'(반경 12/10) | 'soft'(6) | 'square'(2). pixelBubble 이 우선
  outline: 'normal',            // 'thin' 0.8 | 'normal' 1.2 | 'thick' 2.2 pt (받은 쪽 +0.3), 픽셀 1/1/2칸
  outlineColor: 'auto',         // 'auto'(sendLine/recvLine) | 'dark'(text)
  deco: 'none',                 // 'none' | 'sparkle' | 'heart' | 'star' | 'note' : 캐릭터 반대쪽 위 cap 안 (01 만, accent 색)
  fillTone: 'palette',          // 'palette' | 'white' | 'cream' : 말풍선 면 (사용자 색보다 우선)
  pixelChar: false, grid: 48,   // 캐릭터 픽셀화 on/off, 격자 32|48|64 (긴 변 칸 수)
  pixelBubble: false,           // 말풍선 픽셀 on/off
  colors: null,                 // null = 자동(palette.derive). 또는 Palette 객체(사용자가 스와치 수정)
  background: null,             // 배경 커스텀 (아래). null/일부만 = 프리셋 값으로 채움 (resolveBackground)
  slotsArePixel: false,         // slot 그림이 이미 픽셀 스프라이트면 true: 재격자화 없이 정수배 nearest
}
// 배경 (presets.resolveBackground 가 검사·기본값 채움. 같은 결과를 다시 넣어도 같음)
Background = {
  pattern: 'dots'|'check'|'grid'|'stars'|'hearts'|'cubes'|'none',   // '+' 로 겹침 가능. 기본 = 프리셋: cream-dots→dots, pastel-check→check, retro-game→'grid+stars', plain-minimal→none
  patternSize: 's'|'m'|'l',      // 0.75 / 1 / 1.4 배
  patternOpacity: null|0~1,      // null = 무늬 기본(PATTERN_ALPHA: dots .24, check .3, grid .1, stars .28, hearts .22, cubes .16). 겹친 무늬는 첫 무늬 기준 비율
  patternColors: null|['#RRGGBB' x1~3],   // 무늬 색 직접 (dots·cubes·hearts 가 차례로 돌려 씀). null = 팔레트 (cubes 는 accent 색상환 3등분)
  patternArea: { main|chat: 'full'|'top'|'none', passcode: 'full'|'none' },   // 무늬 넣을 곳. full = 헤더 아래 전체, top = y60~420 띠만 (BG.topBand), 기본 전부 full
  color: null|'#RRGGBB',         // null = palette.bg
  photo: { main|chat|passcode: { fit: 'cover'|'contain', blur: 0~12 (pt), dim: 0~0.8 (기본 0.15), auto: true } },   // assets 의 사진이 있을 때만. auto = 글자 대비 모자라면 dim 자동 상향 (최대 .85)
  corner: { main: 'br'|'bl'|'tr'|'tl'|'none' (기본 br), chat: (기본 bl), size: 's'|'m'|'l', opacity: null|0.15~1 (null = main .42, chat .38) },
}
// 배경 사진·자리별 그림 (전부 선택, 빈 자리 = 예전 그림). 모르는 이름·깨진 Img 는 오류 (checkAssets)
Assets = {
  bgMain, bgChat, bgPasscode,                         // 사용자 배경 사진 Img
  slots: {
    profile, icon,                                    // 기본 프로필, 테마 아이콘
    tabSelected: {friends, chats, now, shopping, call, more},  // 없으면 캐릭터 + accent 배지. 있으면 그 그림만 (배지 없음)
    tabNormal:   {friends, chats, now, shopping, call, more},  // 없으면 코드 라인 아이콘 (muted). Piccoma·Local = Now 복사
    passcodeSelected: [s1, s2, s3, s4],              // 없으면 1~3 빼꼼 크롭, 4 전신+반짝이. 있으면 132 칸 가운데 (pad 0.02)
    passcodeArt,                                      // 잠금 배경 아래 가운데 그림
    cornerMain, cornerChat,                           // 친구탭·채팅방 배경 구석 그림 (없으면 캐릭터)
    bubble: {perch, peek, hang, stand},              // 그 레이아웃일 때만 01 말풍선 캐릭터 대신. peek slot 은 이미 빼꼼 그림이라 위 65% 크롭 안 함
  },
}
Palette = { bg, tabBg, line, text, muted, accent, sendFill, sendSel, sendLine, recvFill, recvSel, recvLine, keypad, shadow, profileBg? } // '#RRGGBB'. profileBg 는 선택 (없으면 bg 틴트, meta.palette 에는 늘 채워짐). UI: 앞 5색 + '색 더 보기' 에 나머지 전부

prepareCharacter(img: Img, {tolerance=24}) -> Img        // 투명이면 그대로, 아니면 keying.removeEdgeBackground 후 bbox crop
palette.derive(img: Img) -> Palette                       // k-means(k=5) 주색 → OKLCH 파생 → WCAG 보정 (본문 4.5, 보조 3)
pixelize(img: Img, grid, {colors=16}) -> Img              // 1px = 1칸 스프라이트 (알파 0/255만, 선 보존, 외곽선 1칸)
async buildTheme(charA: Img, charB: Img|null, opts, assets?) -> { files: Map<path, Blob>, css: string, meta }
     // files 키: 'KakaoTalkTheme.css', 'Images/<name>@2x.png' ... (apeach 66장과 이름 1:1)
async packTheme(files) -> Blob                            // JSZip STORE, 최상위 = KakaoTalkTheme.css + Images/, type application/octet-stream
async buildCouple(charA, charB, opts, assets?) -> [{name, blob}, {name, blob}]   // 내 폰용(A가 보낸 쪽) / 상대 폰용(B가 보낸 쪽), id 다름
     // 배경 사진은 두 폰 같이. slot 은 A 의 그림: 내 폰 = 전부, 상대 폰 = 받은 쪽 말풍선(A 자리)에만
resolveBackground(preset, bg) -> Background   patternLayers(bg) -> [[무늬, 투명도]]   cornerBox('main'|'chat', bg.corner) -> {x,y,w,h,align,alpha}|null
checkAssets(assets) -> 빈 자리까지 채운 assets (오류면 throw)
bubbleRules(meta) -> string                                // 목업용 CSS (border-image 9분할) : mock.js 가 씀
```
- 브라우저 캔버스는 `render.js` 안의 `makeCanvas(w,h)` 하나로만 (OffscreenCanvas 우선, 없으면 document.createElement). `imageSmoothingEnabled` 는 픽셀 그림일 때 false.
- iOS 메모리: 큰 캔버스(1125x2250, 1200x1200)는 하나씩 만들고 toBlob 후 width=height=0 으로 해제.
- `meta` = { bubbles: {'01': B, '02': B} (B = {W,H,X,Y,top,ins:[t,l,b,r]} pt, 보낸 쪽 기준), palette, themeId, themeName }.

## 3. 규격 (기준 구현과 동일, 수치는 presets.js 한 곳)
- 파일 66장 = 공식 샘플(`tests/fixtures/ref-images.json`)과 이름·크기 동일. 예외: 말풍선 8종은 프리셋 크기.
- CSS 는 `scripts/template.css` 를 뼈대로 색 자리는 Palette 토큰, MessageCellStyle-Send/Receive 두 블록은 프리셋으로 생성.
  - 받은 쪽 cap X = W - X - 1, 인셋 좌우 반전.
- 말풍선 프리셋 (pt, 보낸 쪽):

| 스타일·레이아웃 | 이미지 | W×H | X Y | top | ins (t l b r) |
|---|---|---|---|---|---|
| round / none, 및 stand 말고 모든 02 (round) | 01·02 | 40×35 | 17 17 | 0 | 10 11 7 17 |
| pixel / none, 및 stand 말고 모든 02 (pixel) | 01·02 | 40×36 | 16 16 | 0 | 10 12 8 18 |
| perch (둥근·픽셀 공통) | 01 | 64×58 | 44 32 | 16 | 28 33 10 19 |
| stand (둥근) | 01 | 72×80 | 14 60 | 44 | 54 11 8 49 |
| stand (픽셀) | 01 | 72×80 | 14 60 | 44 | 54 12 8 50 |
| stand (둥근 / 픽셀) | 02 | 72×35 / 72×36 | 17 17 / 16 16 | 0 | 10 11 7 49 / 10 12 8 50 |

  - perch: 몸통 x 0~58, y 16~58 (둥근 반경 10, 40pt 짜리만 12), 꼬리 (52,18)(63.6,16.8)(57.6,29). 캐릭터 상자 x 2~42, y 0~26, 몸통 **위에** 그림(가운데 70% 가로 크롭 권장: 엎드린/옆으로 퍼진 그림 대비). 받은 쪽은 말풍선만 좌우 반전, 캐릭터 상자는 x = W-2-40 로 이동(그림 반전 안 함).
  - stand (프사 옆 꼬마, 레퍼런스 `docs/refs/ref-me-vs-friend.png`·`ref-speak-from-char.png`·`ref-stand-near-profile.png`): 캐릭터가 말하는 모양.
    보낸 쪽 기준 몸통 x 0~34 (bx), y top~H, 캐릭터 상자 x W-w~W, y 0~h (몸통 오른쪽 위 **바깥**, 몸통보다 2pt 이상 위). 꼬리는 몸통 오른쪽 위 모서리에서 위·오른쪽(캐릭터 발밑)으로 올라감:
    둥근 = 삼각 (bx-15, top+2.5)(bx+6, top-7)(bx-3, top+5), 픽셀 = 몸통 위 3칸까지 계단. top = h + 8, Y = top + 16, H = Y + 20, W = bx + 2 + w.
    받은 쪽(거울) = 친구 이름 아래 프사 바로 옆에 친구 캐릭터(상자 x 0), 몸통은 그 아래 오른쪽, 꼬리는 몸통 왼쪽 위에서 캐릭터 쪽(위·왼쪽).
    캐릭터 상자 = 프사 크기 정도: s 28, m 36, l 46 pt (정사각). 템플릿 near-profile 기본 charSize 'l'.
    02 (이어 보낸 말풍선) = none 모양을 01 과 같은 폭 W 로 늘리고 오른쪽(받은 쪽 왼쪽)에 투명 띠 pad = W - 40 을 둔다 (`b.pad`, 오른쪽 인셋 += pad).
    카카오는 01·02 그림을 같은 x 에 놓으므로 이렇게 해야 이어 보낸 말풍선 몸통과 글자가 첫 말풍선 바로 아래 같은 x 에서 시작한다 (단위 테스트로 고정).
    알려진 비용: 카카오의 말풍선 최대 폭은 그림 폭(캐릭터 자리 포함)으로 정해져서, 서기는 글자 줄 폭이 캐릭터 자리(w+2, l 이면 48pt)만큼 좁다. 긴 글은 다른 레이아웃보다 일찍 줄바꿈된다. 줄 폭이 중요하면 charSize 'm'(36pt) 이나 's'.
    채팅방 구석 그림 기본 자리는 서기일 때 오른쪽 아래 (친구 캐릭터가 서는 왼쪽 아래와 안 겹치게. 직접 고른 값은 그대로).
  - 캐릭터 역할: buildTheme(charA, charB) 의 charB = 받은 말풍선(친구) 캐릭터, charA = 보낸 말풍선(내) 캐릭터. 탭·프로필·아이콘·잠금·배경 구석은 전부 charA (렌더 테스트로 고정).
  - 카카오 규격 한계 (UI 가 화면으로 안내): 받은 말풍선 그림은 친구마다 다르게 할 수 없다. 테마 하나에 '친구 캐릭터' 하나.
  - 위 표는 charSize 'm' 값. 모든 크기·레이아웃은 `bubbleGeometry(layout, charSize, shape, pixel)` 가 계산 (perch/m = 64×58 그대로, none = 40×35/40×36 그대로). 템플릿은 `TEMPLATES` (presets.js).
  - peek: 위 65% 크롭(PEEK_CROP, 대략 턱까지)을 먼저 그리고 몸통을 그 위에. 상자 아래 2~4pt 만 몸통 뒤로 숨어 얼굴 전체가 테두리 위로 보임. hang: 상자를 높이 둬서(top = 상자 높이의 ~82%) 아래 ~18% (앞발) 만 테두리에 걸치게 앞에 그림. 몸통에 가려지는 띠가 없어야 함 (있으면 앞발이 몸에서 떨어져 보임, 단위 테스트가 막음). 둥근 외곽선은 원판 침식이라 굵어도 모서리가 늘이는 열·행으로 번지지 않음.
  - 불변식 (단위 테스트 필수): 캐릭터·모서리 곡선·꼬리는 늘이는 열 X·행 Y 에서 1pt 이상 떨어짐 / 좌우 인셋 합 ≥ W-12, 위아래 ≥ H-20 / 텍스트 영역(인셋 안쪽)이 캐릭터 상자와 겹치지 않음.
  - 검사: @k 이미지에서 열 (X-1)k ~ (X+2)k 의 세로 픽셀 열이 전부 같고, 행도 같음(기준 구현 verify 와 동일).
- 픽셀 말풍선: 2pt 칸 격자에 직접 그림(@2x 4px, @3x 6px nearest). 계단 모서리 반경 3.6칸, 외곽선 1칸(Palette.text 계열 진한 색), 오른쪽 아래 1칸 그림자(Palette.shadow), 꼬리는 계단. 알파 0/255.
- 픽셀 캐릭터: `pixelize` 결과 스프라이트를 정수배 nearest 로만 배치 (1칸 = c pt, @2x/@3x 같은 격자). 상자에 c=1 도 안 들어가면 nearest 로 0.7배까지 줄이고, 그보다 작으면 반 해상도 (pixelize 결과는 선 우선, slotsArePixel 완성 스프라이트는 최빈색만: 선 우선으로 여러 번 줄이면 외곽선 덩어리가 된다).
- slot 그림: 알파 bbox 로 자른 뒤 캐릭터와 같은 경로. pixelChar 면 pixelize(grid), slotsArePixel 이면 그대로 스프라이트 (둘 다 정수배 nearest, @2x/@3x 같은 격자). slot 이 하나도 없고 background 가 null 이면 결과 픽셀은 이 기능 전과 같다 (회귀 테스트).
- 배경 (main/chat/passcode): 배경색(color 또는 bg) → 사진(있으면, fit·blur·dim) 또는 무늬 → 구석 그림. 사진이면 무늬는 안 깔고, main/chat 은 위 330px 에 배경색 70% 띠(제목 보이게) + 그 아래 60px 페이드(이음매 없게). auto dim: 글자 자리(main/chat 330~끝, 잠금 0~700)를 48x96 으로 줄여 읽고, 칸 90% 이상에서 text 4.5:1·muted 3:1 이 되는 가장 작은 dim(0.05 단위). 결과는 meta.background = { dim: {main,chat,passcode}, warnings } (warnings 'text-on-bg' = 고른 배경색 위 text 대비 < 4.5, UI 가 안내). dim 은 배경색으로 덮는다(글자가 진한 색이라 밝게 덮어야 대비). blur 는 축소-확대 (iOS 사파리 캔버스 filter 미지원). 잠금 맨 아래 300px 키패드 그라데이션은 사진 위에서도 유지.
- 구석 그림 자리: m + 기본 구석 = 아래 표 그대로. 아래 구석은 바닥 정렬, 위 구석(tr/tl)은 헤더 아래 40px 에서 위 정렬. 흩뿌린 무늬(dots·stars·hearts·cubes)는 구석 그림 자리를 비우고, 체크·격자가 있으면 그대로.
- 에셋 배치 (이미지 1장 → 66장):
  - commonIcoTheme 162: Palette.bg + 캐릭터 (모서리 굽히지 말 것, 꽉 채운 사각).
  - maintabBgImage: tabBg + 위 1pt 헤어라인 line.
  - 탭 비선택 6종(Friends Chats Now Shopping Call More, Piccoma·Local 은 Now 복사): 코드 라인 아이콘(사람, 말풍선, 반짝이, 쇼핑백, 전화기, 점3) Palette.muted. 선택: 캐릭터 + 오른쪽 아래 작은 accent 배지(같은 라인 아이콘 채움).
  - mainBg/chatroomBg 1125x2250 (@3x만): bg + 프리셋 패턴 + 구석 캐릭터(투명도 0.35~0.45, 목록·말풍선 글자 영역 피함: main 은 오른쪽 아래, chat 은 왼쪽 아래). 위 330px(헤더)는 무늬 없이.
  - passcodeBg 1200x1200: bg + 패턴(위쪽) + 아래 가운데 캐릭터, 맨 아래 300px 는 keypad 색으로 그라데이션(이음매 없음).
  - profileImg01 360: Palette.profileBg (없으면 bg 보다 살짝 진한 틴트) + 캐릭터.
  - passcodeImgCode01~04 132: accent 링 도트. Selected 1~3: 캐릭터 위 65% 크롭(빼꼼), 4: 전신 + 반짝이.
  - passcodeKeypadPressed 180: sendFill 원(알파 0.9).
  - findBtnAddFriend 84x68/126x102: sendFill 알약 + 사람+플러스(text).
  - 캐릭터가 픽셀이면 코드 아이콘·도트·버튼도 1pt=1px 로 그린 뒤 알파 이진화 + nearest 확대.
- 프리셋 4종 (색은 Palette 에서, 패턴만 다름): cream-dots(작은 둥근 사각 도트 3색 엇갈림), pastel-check(연한 체크), retro-game(픽셀 격자 선 + 별 도트, 픽셀 UI 어울림), plain-minimal(무늬 없음).
- 무늬 7종: dots(위), check(위), grid(격자 선), stars(십자 5칸 도트 별), hearts(작은 하트, accent/sendLine 번갈아), cubes(3색 둥근 사각, 크기·간격은 dots 와 같음. 기본 색 = accent 색상환 3등분 L .74, patternColors 로 직접), none.
- 키잉(`keying.removeEdgeBackground(img, tol)`): **네 변에서 시작하는 연결 영역만** 지움(BFS), 시작색과 RGB 거리 ≤ tol. 안쪽 같은 색은 안 지움. 가장자리 1px 페더 금지(알파 0/255). 투명 픽셀이 5% 이상이면 이미 투명 PNG 로 보고 건너뜀.
- palette: 불투명 픽셀 샘플 ≤ 20000, k=5 k-means(고정 시드), 채도×빈도로 주색. OKLCH 로 bg(L≥0.96, C 낮게), sendFill(주색 L 0.88), line(L 0.55), text(L 0.27), muted(text 와 bg 사이, bg 대비 ≥ 3), accent(주색 L 0.5, bg 대비 ≥ 4.5). recvFill #FFFFFF, recvLine 은 bg 와 대비 ≥ 1.8 되게.
- CSS ManifestStyle: name, version '26.8.0', url 'https://tokku-kit.vercel.app', author 'Tokku Kit', id.

## 4. UI (index.html + app.js + mock.js)
- 한 페이지: ①랜딩 히어로(데모 젤리 테마 폰 목업 + [내 사진으로 만들기]) ②빌더 ③특징 3개(말풍선 위 캐릭터 / 픽셀 / 커플) ④무료·오픈소스 안내 ⑤FAQ(설치 방법, iOS 전용) ⑥푸터(약관 링크, ㈜카카오와 무관 고지).
- 빌더 단계: 1 사진 넣기(내 캐릭터 필수, 상대 선택=커플) → 2 다듬기(투명 아니면 키잉 허용치 슬라이더 + 체커보드 미리보기, 투명이면 자동 건너뜀) → 3 꾸미기(프리셋 4, 말풍선 위 캐릭터 없음/올라앉기/바깥 서기, 캐릭터 픽셀 토글+격자 32/48/64, 말풍선 픽셀 토글, 색 스와치 5개 탭해서 바꾸기(input type=color), 테마 이름) → 4 받기.
- 미리보기: 폰 목업 탭 4개(친구 / 채팅 / 잠금 / 말풍선 테스트). 말풍선 테스트에 'ㅋ', 한 줄, 다섯 줄 메시지. 옵션 바꿀 때마다 디바운스(300ms) 후 buildTheme 다시 → object URL 교체(이전 URL revoke). 모바일: 단계 아래 미리보기, 데스크톱(≥960px): 오른쪽 고정.
- 목업은 실제 생성 PNG 로 그림 (기준 구현 목업의 레이아웃·말풍선 border-image 규칙 재사용: min-width W / min-height H, slice = Y·3, (W-X-1)·3, (H-Y-1)·3, X·3 fill, 폭 Y,(W-X-1),(H-Y-1),X px, border-width = 인셋).
- 받기:
  - [테마 받기] → 정식 품질로 빌드 → 다운로드. 가격표·구매 없음.
  - 커플이면 파일 2개.
  - 내려받기: iOS 이고 `navigator.canShare({files})` 되면 [카카오톡으로 보내기(공유)] 를 1순위 버튼으로 (공유 시트 → 카카오톡 → 나에게). 아니면 a[download] blob. PC 는 다운로드 + "PC 카카오톡 나와의 채팅에 끌어 놓기 → 아이폰에서 파일 탭" 안내.
  - 설치 안내 카드(그림 없이 단계 4개), ".zip 으로 바뀌면 이름 끝을 .ktheme 로" 포함.
- 프로젝트 저장/불러오기: .json (원본 dataURL, options, id).
- 공유 카드: [자랑하기] → 채팅 목업 PNG 1080x1920(캔버스로 직접 그림, 사이트 주소 작게).
- 접근성: 버튼은 button, 토글은 aria-pressed, 대비 4.5, 포커스 링.
- 디자인: 크림 #FFF6EE 바탕, 진한 자두 #4A3440 글자, 포인트 #B23A64. 제목 Galmuri11(픽셀), 본문 Pretendard. 귀엽고 깔끔. 헤더 단색.

## 5. API
- 없음 (2026-10-18 무료·비영리 전환으로 `api/license.js`·Gumroad 확인 제거). `vercel.json`: outputDirectory public, `/engine/*` 캐시 1일, 보안 헤더(X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin).

## 6. 테스트·검증 (통과해야 완료)
- `node --test tests/` : pixelize(알파 0/255, 색수 ≤ colors+2), presets 불변식 4개(모든 레이아웃×스타일), palette WCAG, keying(가장자리 연결만 지움, 안쪽 같은 색 보존), pack(STORE, 최상위 구조), 배경 설정·구석 자리·assets 검사.
  - 렌더 검사(tests/.pw 의 playwright 로 헤드리스 chromium, 없으면 건너뜀): 회귀 = slot·배경 없이 만든 66장+CSS 픽셀 해시가 `tests/fixtures/render-golden.json`(기능 추가 전 엔진, chromium 130. 2026-10-18 stand 재설계로 retro 케이스의 01 말풍선 8장+CSS 만 다시 찍음, 나머지 3 케이스는 그대로. 같은 날 체험판 제거로 default·plain 의 배경 3장+CSS 다시 찍음. 같은 날 stand 02 정렬(pad)·서기 채팅방 구석 기본 오른쪽 아래로 retro 의 02 말풍선 8장+채팅방 배경+CSS 다시 찍음) 과 같음 / charB 는 받은 말풍선에만, 나머지는 charA / stand 레퍼런스 배치 / 체험판 모드 없음 / slot 마다 제 파일에만 쓰이고 나머지는 그대로 / 말풍선 slot 은 제 레이아웃에만, 커플 상대 폰은 받은 쪽에만 / 픽셀 slot 정수배·알파 0/255 / 무늬 7종 서로 다름·헤더 민무늬·none 단색·잠금 맨 아래 keypad / 사진 cover·contain·dim·헤더 띠·blur / 구석 4방향·none.
  - 골든 다시 만들기(엔진 그림을 일부러 바꿨을 때만): `TOKKU_PUBLIC=<옛 public> UPDATE_GOLDEN=1 node --test tests/`.
- `scripts/verify_ktheme.py x.ktheme` : zip 최상위 = KakaoTalkTheme.css + Images/ 만, 모든 엔트리 STORE, 파일 집합 = ref 66장, 말풍선 외 크기 = ref, CSS 참조 파일 존재, CSS 말풍선 cap/인셋 파싱 후 이미지 크기와 일치 + 늘이는 열·행 균일, ID 형식 `com.kakao.talk.theme.tokku[0-9a-f]{12}`.
- `tests/e2e.mjs` (npx playwright@1.48.2, chromium + webkit 헤드리스, 창 띄우지 말 것): `python3 -m http.server` 로 public/ 서빙 → 데모 젤리로 layout 5 × pixelBubble 2 × charSize 3 표본(none 은 m 만, 모양·외곽선·장식·면 성향은 돌려 가며) 26 + TEMPLATES 전부 + 커플 1 + 레트로 픽셀 1 + 배경·사진·자리별 그림 3(일반, 픽셀, 커플) 을 엔진으로 빌드해 .ktheme 저장 → 전부 verify_ktheme.py 통과. 390px 폭에서 가로 스크롤 없음, 콘솔 에러 0, 랜딩 템플릿 썸네일 전부 로드, 옛 v1 프로젝트 .json 불러오기. UI 흐름에서 레트로 무늬(grid+stars)·구석 왼쪽 위·친구탭 사진·자리별 그림 3칸을 고른 뒤 엔진에 실제로 넘어간 인자(/engine/index.js 를 기록용 껍데기로 바꿔치기)를 확인하고, v3 프로젝트 저장 → 다시 불러오기로 복원.
