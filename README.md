# 톡꾸 키트 (Tokku Kit)

내 그림 한 장으로 **아이폰 카카오톡 테마 파일(.ktheme)** 을 브라우저 안에서 만드는 무료·비영리 오픈소스 도구.
결제, 키, 워터마크 없음. 서버 없음 (그림은 내 기기 밖으로 나가지 않는다). ㈜카카오와 무관.

- 데모: https://tokku-kit.vercel.app
- 소스: https://github.com/cyw910306-glitch/tokku-kit
- 구현 계약서: [`docs/SPEC.md`](docs/SPEC.md) · 캐릭터 팩 형식: [`docs/PACKS.md`](docs/PACKS.md)

## 기능
- **말풍선 캐릭터**: 프사 옆 꼬마(캐릭터가 말하는 모양), 올라앉기, 빼꼼, 엎드려 걸치기. 글이 길어도 캐릭터가 찌그러지지 않게 9분할 규칙을 지킨다.
- **내 캐릭터 / 친구 캐릭터**: 보낸 말풍선엔 내 캐릭터, 받은 말풍선엔 친구 캐릭터(선택). 커플이면 상대 폰용 테마도 같이.
  카카오톡 규격상 받은 말풍선 그림은 하나뿐이라 친구마다 다른 캐릭터는 안 된다.
- **템플릿 + 더 꾸미기**: 크기, 말풍선 모양, 테두리, 장식, 바탕색, 픽셀 아트(캐릭터·말풍선), 색 15개.
- **배경 꾸미기**: 무늬 7종(겹치기), 무늬 색·크기·진하기·넣을 곳, 배경 색, 내 사진(맞춤·흐림·글자 대비 자동 덮기), 구석 캐릭터.
- **자리별 그림**: 프로필, 아이콘, 탭 12칸, 잠금 화면, 말풍선 캐릭터, 배경 구석마다 다른 그림.
- **캐릭터 팩**: `pack.json` 하나로 캐릭터·친구·자리별 그림·옵션·색을 한 번에 (`?pack=` 또는 [캐릭터 팩 불러오기]).
- 프로젝트 저장/불러오기(.json), 자랑 카드(1080x1920), 아이폰 공유 시트로 카카오톡 보내기.

## 로컬 실행
빌드 도구 없음 (바닐라 ES 모듈).
```bash
python3 -m http.server 8080 -d public     # http://localhost:8080
node scripts/gen-spec.mjs <Images 폴더>  # (규격 갱신 때 관리자만) 카카오 공식 샘플 -> spec.js + tests/fixtures/ref-images.json
```

## 테스트
```bash
node --test tests/                        # 엔진 단위 테스트 (Node 24)
node tests/e2e.mjs                        # playwright@1.48.2 헤드리스 chromium+webkit: .ktheme 생성·검사 + UI 흐름 + 캐릭터 팩
python3 scripts/verify_ktheme.py x.ktheme # .ktheme 검사기, 종료코드 0 = 통과
```
e2e 는 `tests/.pw` 에 playwright 를 처음 한 번 설치한다. 창은 띄우지 않는다(headless 고정).
카카오 공식 샘플 그림은 저장소에 없다 (카카오 캐릭터). 테스트·검사기는 이름·크기 목록 `tests/fixtures/ref-images.json` 을 쓴다.
`verify_ktheme.py` 가 보는 것: zip 최상위 구조, STORE, 이미지 66장 이름·크기, CSS 참조, 말풍선 cap·인셋과 늘이는 열·행 균일, 테마 ID 형식.

## 캐릭터 팩 만들기
[`docs/PACKS.md`](docs/PACKS.md) 참고. 요약:
```json
{ "tokkuPack": 1, "name": "우리 집 젤리", "char": "char.png", "friend": "friend.png",
  "options": { "layout": "stand" }, "slots": { "profile": "profile.png" },
  "variants": [{ "id": "i", "name": "일러스트" }, { "id": "p", "name": "픽셀", "options": { "pixelChar": true } }] }
```
`public/` 를 통째로 복사한 내 사이트에 팩 폴더를 두고 `index.html?pack=<폴더>/pack.json` 으로 연다.

## 배포 (Vercel, 정적)
```bash
npx vercel@latest --prod --yes            # outputDirectory = public
```
배포 범위는 `public/` 뿐 (`.vercelignore`). 배포 후 `/docs/SPEC.md`, `/tests/e2e.mjs` 가 404 인지 확인.

## 기여
이슈·PR 환영. 지킬 것:
- 저작권 캐릭터(애니·게임 등) 그림을 저장소·데모·테스트에 넣지 않는다. 데모는 오리지널 `public/demo/jelly.png`, `hotteok.png` 만.
- 외부 의존성 없이 바닐라 JS. 외부 스크립트는 고정 버전 CDN 만 (SPEC 0절).
- 화면 문구는 쉬운 한국어. em dash 문자 금지.
- PR 전에 `node --test tests/` 와 `node tests/e2e.mjs` 통과.

## 라이선스
코드: [MIT](LICENSE) © 2026 Tokku Kit contributors.
데모 그림(젤리·호떡)은 저장소 안에서 데모 용도로 함께 배포된다.

## 고지
- 톡꾸 키트는 ㈜카카오와 관계없는 비영리 도구다. 카카오톡은 ㈜카카오의 상표다.
- 넣는 그림의 권리와 책임은 넣는 사람에게 있다. 남의 캐릭터로 만든 테마는 개인 사용만 하고, 팔거나 퍼뜨리지 말 것.
- 카카오톡 업데이트로 사설 테마 적용 방식이 바뀌거나 막힐 수 있다.
