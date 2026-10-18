# 캐릭터 팩 (pack.json)

캐릭터 팩 = `pack.json` 하나 + 같은 폴더(같은 출처)의 PNG 그림들. 불러오면 내 캐릭터, 친구 캐릭터, 자리별 그림, 옵션, 색이 한 번에 채워지고
사용자는 그 위에서 템플릿·배경·자리별 그림을 마음대로 바꾼다. 구현: `public/app.js` 의 `loadPack`.

## 불러오는 법
- 주소: `index.html?pack=<상대 경로>` 예) `?pack=packs/mine/pack.json`. **같은 사이트 안의 상대 경로만** 받는다
  (`https:`, `//`, `/` 로 시작하는 값은 무시하고 데모로 시작). 남의 그림을 이 사이트 주소로 띄우지 못하게 하려는 것.
- 버튼: 1단계 [캐릭터 팩 불러오기] 에 pack.json 의 전체 주소(https)를 넣는다. 그 서버가 CORS 를 허용해야 한다(Vercel·GitHub Pages 정적 파일은 기본 허용).
- 그림 경로는 pack.json 위치 기준 상대 경로. **pack.json 과 다른 출처의 그림은 거부**한다. `.zip` 은 받지 않는다.
- 팩이 켜지면 상단 띠에 팩 이름, 종류 버튼(variants 가 2개 이상일 때), [팩 끄기] 가 보인다. 팩 끄기 = `?pack` 없이 처음부터.

## 형식
```json
{
  "tokkuPack": 1,
  "name": "우리 집 젤리",
  "char": "art/char.png",
  "friend": "art/friend.png",
  "options": { "layout": "stand", "charSize": "l", "preset": "cream-dots",
               "background": { "pattern": "cubes", "patternArea": { "chat": "top" } } },
  "colors": { "bg": "#FFF6EE", "accent": "#B23A64" },
  "slots": {
    "profile": "art/profile.png",
    "icon": "art/icon.png",
    "tabSelected": { "friends": "art/tab-friends.png", "chats": "art/tab-chats.png" },
    "tabNormal": { "friends": "art/tab-friends-line.png" },
    "tabSelectedAll": "art/tab-hug.png", "tabNormalAll": "art/tab-face.png",
    "passcodeSelected": ["art/p1.png", null, null, "art/p4.png"],
    "passcodeAll": { "normal": "art/lock-side.png", "selected": "art/lock-front.png" },
    "passcodeArt": "art/lock.png",
    "cornerMain": "art/corner.png", "cornerChat": "art/corner2.png",
    "bubble": { "perch": "art/perch.png", "peek": "art/peek.png", "hang": "art/hang.png", "stand": "art/stand.png" }
  },
  "slotsArePixel": false,
  "variants": [
    { "id": "i", "name": "일러스트" },
    { "id": "p", "name": "픽셀", "char": "px/char.png", "slots": { "profile": "px/profile.png" },
      "slotsArePixel": true, "options": { "pixelChar": true, "pixelBubble": true } }
  ]
}
```

| 키 | 필수 | 뜻 |
|---|---|---|
| `tokkuPack` | 예 | 형식 버전. 지금은 `1` |
| `name` | | 팩 이름 (상단 띠, 테마 이름 기본값). 40자까지 |
| `char` | 예 | 내 캐릭터 = 보낸 말풍선 그림 경로 |
| `friend` | | 친구 캐릭터 = 받은 말풍선 그림. 없으면 받은 쪽도 `char` |
| `options` | | 엔진 Options 일부 (SPEC 2절): `layout charSize bubbleShape outline outlineColor deco fillTone groupChar peekPos textTone keypadTone grid preset pixelChar pixelBubble hat name background`. 크리스마스: `hat: true`(산타모자), `fillTone: "xmas"`, `deco: "snowflake"|"holly"|"santa-hat"`, `background.pattern: "snow"|"xmas-lights"|"snow+xmas-lights"`, `background.haze: "snow-night"`(친구탭·잠금만)`|"xmas-glow"`. 모르는 값은 기본값 |
| `colors` | | Palette 일부 또는 전부 (`#RRGGBB`). 빈 키는 `char` 에서 자동. 하나라도 형식이 틀리면 전부 자동 |
| `slots` | | 자리별 그림 경로. 키는 엔진 `assets.slots` 와 같다 (`passcodeSelected` 는 4칸 배열, 빈 칸 `null`). 모르는 키는 무시. 일괄 키: `tabSelectedAll` / `tabNormalAll` (한 장으로 6탭 전부), `passcodeAll: { normal, selected }` (잠금 4칸 같은 그림). 칸마다 넣은 그림이 있으면 그 칸은 그게 우선. 안 누른 잠금 칸은 `passcodeAll.normal` 로만 (칸별 `passcodeNormal` 은 팩에서 안 읽음) |
| `slotsArePixel` | | slot 그림이 이미 도트 스프라이트면 `true` (정수배 nearest, 재격자화 안 함) |
| `variants` | | 종류 (예: 일러스트/픽셀). `{id, name}` 필수, 나머지 키(`char friend options colors slots slotsArePixel`)는 위 값을 덮는다. `slots` 는 통째로 바꾸고, `options` 는 키 단위로 덮는다. 첫 번째가 기본. 8개까지 |

- 그림은 PNG(투명 배경 권장). 투명이 아니면 가장자리 배경을 자동으로 지운다(다듬기 단계).
- 종류 버튼으로 바꿀 땐 지금 고른 템플릿·배경은 그대로 두고, 그 종류의 `options`·그림·색만 바꾼다.
- 카카오톡 규격상 받은 말풍선 그림은 하나라서 친구마다 다른 캐릭터는 안 된다. 팩에도 `friend` 는 하나.

## 권리
톡꾸 키트 공개 사이트와 저장소에는 오리지널 데모(젤리·호떡) 말고 다른 캐릭터 팩을 넣지 않는다.
팩은 그림 권리를 가진 사람이 자기 사이트에 두고 `?pack=` 로 연다(예: 같은 엔진을 복사한 개인 사이트). 그림의 권리와 책임은 팩을 만든 사람에게 있다.
