#!/usr/bin/env python3
"""톡꾸 키트 .ktheme 검사기 (SPEC 6절). 기준 구현의 verify() 를 zip 한 개 단위로 옮긴 것.

usage: python3 scripts/verify_ktheme.py file.ktheme [more.ktheme ...] [--allow-any-id] [--ref DIR]
이미지 이름·크기 기준 = tests/fixtures/ref-images.json (기본). --ref 로 공식 샘플 Images 폴더를 직접 줄 수도 있다.
종료코드 0 = 전부 통과, 1 = 문제 있음 (문제 목록을 출력).
표준 라이브러리 + Pillow 만 쓴다.
"""
import argparse, io, json, os, re, sys, zipfile
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "tests", "fixtures", "ref-images.json")
ID_RE = re.compile(r"com\.kakao\.talk\.theme\.tokku[0-9a-f]{12}")
# 말풍선 크기 (pt): 레이아웃 x 캐릭터 크기로 계산되므로 표 대신 범위 (presets.bubbleGeometry 가 만드는 값 전부 포함)
BUBBLE_MIN, BUBBLE_MAX = 30, 120
PROPS = {  # CSS 속성 -> 이미지 이름 꼬리
    "-ios-background-image": "01", "-ios-selected-background-image": "01Selected",
    "-ios-group-background-image": "02", "-ios-group-selected-background-image": "02Selected",
}


def block(css, name):
    m = re.search(r"(?m)^%s\s*\{(.*?)\}" % re.escape(name), css, re.S)
    return m.group(1) if m else None


def bubbles(css, errs):
    """{side: {'caps': {tail: (file, X, Y)}, 'ins': [t,l,b,r], 'gins': [t,l,b,r]}} (CSS 에서 읽음)."""
    out = {}
    for side in ("Send", "Receive"):
        body = block(css, f"MessageCellStyle-{side}")
        if body is None:
            errs.append(f"css: MessageCellStyle-{side} 블록 없음")
            continue
        caps = {}
        for prop, tail in PROPS.items():
            m = re.search(r"(?m)^\s*%s\s*:\s*'([A-Za-z0-9]+)\.png'\s+(\d+)px\s+(\d+)px" % re.escape(prop), body)
            if not m:
                errs.append(f"css: {side} {prop} cap 파싱 실패")
                continue
            want = f"chatroomBubble{side}{tail}"
            if m.group(1) != want:
                errs.append(f"css: {side} {prop} = {m.group(1)}, 기대 {want}")
            caps[tail] = (m.group(1), int(m.group(2)), int(m.group(3)))
        ins = {}
        for prop in ("-ios-title-edgeinsets", "-ios-group-title-edgeinsets"):
            m = re.search(r"(?m)^\s*%s\s*:\s*(\d+)px\s+(\d+)px\s+(\d+)px\s+(\d+)px" % re.escape(prop), body)
            if not m:
                errs.append(f"css: {side} {prop} 파싱 실패")
            else:
                ins[prop] = tuple(int(v) for v in m.groups())
        out[side] = {"caps": caps, "ins": ins.get("-ios-title-edgeinsets"), "gins": ins.get("-ios-group-title-edgeinsets")}
    return out


def ref_sizes(ref_dir=None):
    """{이미지 이름: (w, h)}. ref_dir 없으면 저장소의 목록 파일."""
    if ref_dir is None:
        with open(MANIFEST, encoding="utf-8") as f:
            return {i["name"]: (i["w"], i["h"]) for i in json.load(f)}
    out = {}
    for f in os.listdir(ref_dir):
        if f.endswith(".png"):
            with Image.open(os.path.join(ref_dir, f)) as im:
                out[f] = im.size
    return out


def verify(path, ref_dir=None, allow_any_id=False):
    errs = []
    try:
        z = zipfile.ZipFile(path)
    except (zipfile.BadZipFile, OSError) as e:
        return [f"zip 아님: {e}"]
    with z:
        infos = z.infolist()
        images = {}
        css = None
        for i in infos:
            n = i.filename
            if i.compress_type != zipfile.ZIP_STORED:
                errs.append(f"STORE 아님: {n}")
            if n == "KakaoTalkTheme.css":
                css = z.read(i).decode("utf-8", "replace")
            elif n == "Images/":
                pass
            elif n.startswith("Images/") and "/" not in n[7:] and n[7:]:
                images[n[7:]] = z.read(i)
            else:
                errs.append(f"최상위 구조 위반: {n}")
        if css is None:
            errs.append("KakaoTalkTheme.css 없음")
            return errs

    want = ref_sizes(ref_dir)
    ref = set(want)
    ours = set(images)
    errs += [f"missing {f}" for f in sorted(ref - ours)] + [f"extra {f}" for f in sorted(ours - ref)]

    opened = {}
    for f in sorted(ours):
        try:
            opened[f] = Image.open(io.BytesIO(images[f]))
            opened[f].load()
        except Exception as e:
            errs.append(f"PNG 열기 실패 {f}: {e}")
    for f in sorted(ref & set(opened)):
        if f.startswith("chatroomBubble"):
            continue
        a, b = opened[f].size, want[f]
        if a != b:
            errs.append(f"size {f}: {a} != {b}")

    for name in sorted(set(re.findall(r"'([A-Za-z0-9]+)\.png'", css))):
        if not any(o.startswith(name + "@") or o == name + ".png" for o in ours):
            errs.append(f"css ref without file: {name}")

    # 말풍선: 이미지 @k 크기 -> W,H pt, CSS cap/인셋과 맞춰 본다
    spec = bubbles(css, errs)
    size = {}  # (side, tail) -> (W, H)
    for side in ("Send", "Receive"):
        for tail in PROPS.values():
            wh = set()
            for k in (2, 3):
                f = f"chatroomBubble{side}{tail}@{k}x.png"
                if f not in opened:
                    continue
                w, h = opened[f].size
                if w % k or h % k:
                    errs.append(f"bubble {f}: {w}x{h} 가 {k} 의 배수 아님")
                wh.add((w // k, h // k))
            if len(wh) > 1:
                errs.append(f"bubble {side}{tail}: @2x/@3x pt 크기 다름 {sorted(wh)}")
            if wh:
                W, H = min(wh)
                size[(side, tail)] = (W, H)
                if not (BUBBLE_MIN <= W <= BUBBLE_MAX and BUBBLE_MIN <= H <= BUBBLE_MAX):
                    errs.append(f"bubble {side}{tail}: {W}x{H}pt 는 말풍선 크기 범위({BUBBLE_MIN}~{BUBBLE_MAX}) 밖")
    for side, s in spec.items():
        for tail, (_, X, Y) in s["caps"].items():
            if (side, tail) not in size:
                continue
            W, H = size[(side, tail)]
            # 늘이는 열·행과 양옆 1pt 가 이미지 안 (기준 구현 verify 의 (X-1)k ~ (X+2)k)
            if not (1 <= X <= W - 2 and 1 <= Y <= H - 2):
                errs.append(f"bubble {side}{tail}: cap ({X},{Y}) 가 {W}x{H} 밖")
                continue
            for k in (2, 3):
                f = f"chatroomBubble{side}{tail}@{k}x.png"
                if f not in opened:
                    continue
                im = opened[f].convert("RGBA")
                px = im.load()
                cols = {tuple(px[x, y] for y in range(im.height)) for x in range((X - 1) * k, (X + 2) * k)}
                rows = {tuple(px[x, y] for x in range(im.width)) for y in range((Y - 1) * k, (Y + 2) * k)}
                if len(cols) > 1 or len(rows) > 1:
                    errs.append(f"stretch not uniform: {f} cols={len(cols)} rows={len(rows)}")
        for tail, key in (("01", "ins"), ("02", "gins")):
            ins = s[key]
            if ins is None or (side, tail) not in size:
                continue
            W, H = size[(side, tail)]
            t, l, b, r = ins
            if l + r >= W or t + b >= H:
                errs.append(f"insets {side}{tail} {ins}: 글자 영역이 0 이하 ({W}x{H})")
            if l + r < W - 12 or t + b < H - 20:
                errs.append(f"insets {side}{tail} {ins}: 좌우 합 >= W-12, 위아래 합 >= H-20 위반 ({W}x{H})")
    # 보낸·받은 쪽 짝: 크기 같고, 받은 쪽 cap X = W - X - 1, 인셋 좌우 반전
    if "Send" in spec and "Receive" in spec:
        for tail in PROPS.values():
            sc, rc = spec["Send"]["caps"].get(tail), spec["Receive"]["caps"].get(tail)
            ss, rs = size.get(("Send", tail)), size.get(("Receive", tail))
            if ss and rs and ss != rs:
                errs.append(f"bubble {tail}: Send {ss} != Receive {rs}")
            if sc and rc and ss and rc[1] != ss[0] - sc[1] - 1:
                errs.append(f"cap {tail}: Receive X {rc[1]} != W-X-1 = {ss[0] - sc[1] - 1}")
            if sc and rc and sc[2] != rc[2]:
                errs.append(f"cap {tail}: Send Y {sc[2]} != Receive Y {rc[2]}")
        for key in ("ins", "gins"):
            a, b = spec["Send"][key], spec["Receive"][key]
            if a and b and (a[0], a[3], a[2], a[1]) != b:
                errs.append(f"insets {key}: Receive {b} 가 Send {a} 의 좌우 반전 아님")
        # Selected 와 기본은 같은 cap
        for side in ("Send", "Receive"):
            c = spec[side]["caps"]
            for base in ("01", "02"):
                if base in c and base + "Selected" in c and c[base][1:] != c[base + "Selected"][1:]:
                    errs.append(f"cap {side}{base}: Selected 와 다름")

    m = re.search(r"-kakaotalk-theme-id\s*:\s*'([^']*)'", css)
    if not m:
        errs.append("css: -kakaotalk-theme-id 없음")
    elif not allow_any_id and not ID_RE.fullmatch(m.group(1)):
        errs.append(f"theme id 형식 위반: {m.group(1)}")
    return errs


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("files", nargs="+")
    ap.add_argument("--allow-any-id", action="store_true", help="ID 형식 검사 건너뜀 (다른 도구로 만든 테마 확인용)")
    ap.add_argument("--ref", default=None, help="공식 샘플 Images 폴더 (기본 = tests/fixtures/ref-images.json)")
    a = ap.parse_args()
    bad = 0
    for f in a.files:
        errs = verify(f, a.ref, a.allow_any_id)
        if errs:
            bad += 1
            print(f"FAIL {f} ({len(errs)})")
            for e in errs:
                print("  - " + e)
        else:
            print(f"OK {f}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
