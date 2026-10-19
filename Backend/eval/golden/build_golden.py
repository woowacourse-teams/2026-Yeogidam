"""seed 데이터(woowa-prototype/seed)에서 골든셋 cases.csv를 만든다. seed는 읽기만 한다."""
import csv
import glob
import json
import pathlib
import random
import re

ADDRESS_LIKE = re.compile(r"(로|길)\s?\d+|\d+-\d+|번길|동\s?\d+")

SEED = pathlib.Path("/Users/bean/Desktop/Repository/woowa-prototype/seed")
OUT = pathlib.Path("/Users/bean/Desktop/Repository/2026-Yeogidam-eval/Backend/eval/golden/cases.csv")
TARGET = {"video": 14, "caption": 8, "image": 6, "multi": 6, "none": 6}
ZONES = ["gwangju", "busan", "seoul"]

random.seed(322)


def load_zone(zone):
    posts = {}
    for f in glob.glob(str(SEED / "zones" / zone / "data" / "posts" / "*.json")):
        for p in json.load(open(f, encoding="utf-8")):
            posts[p["code"]] = p
    parsed = {}
    for f in sorted(glob.glob(str(SEED / "zones" / zone / "data" / "parsed_chunks*" / "*.json"))):
        for rec in json.load(open(f, encoding="utf-8")):
            parsed[rec["code"]] = rec
    for f in sorted(glob.glob(str(SEED / "zones" / zone / "data" / "parsed_media*" / "*.json"))):
        rec = json.load(open(f, encoding="utf-8"))
        if isinstance(rec, dict) and "code" in rec:
            parsed[rec["code"]] = rec  # 미디어 판독 결과가 최종
    reels, places = {}, {}
    for f in sorted(glob.glob(str(SEED / "zones" / zone / "rounds" / "*" / "seed_data.json"))):
        d = json.load(open(f, encoding="utf-8"))
        for pl in d["places"]:
            places[pl["kakao_place_id"]] = pl
        for r in d["reels"]:
            reels[r["shortcode"]] = r
    return posts, parsed, reels, places


def evidence(rec):
    return sorted(set(p.get("from") or "?" for p in rec.get("places", [])))


def confidences(rec):
    return set(p.get("confidence") for p in rec.get("places", []))


def url_for(code, post, reel):
    if reel:
        return reel["canonical_url"]
    if post and post.get("media_type") == 2:
        return f"https://www.instagram.com/reel/{code}/"
    return f"https://www.instagram.com/p/{code}/"


def classify(code, post, rec, reel):
    if rec is None:
        return None
    if not rec.get("relevant"):
        return "none"
    if not reel or not reel.get("kakao_place_ids"):
        return None
    ev = evidence(rec)
    ids = reel["kakao_place_ids"]
    media_type = (post or {}).get("media_type", reel.get("media_type"))
    if len(ids) >= 3:
        return "multi"
    if ev == ["video"] and media_type == 2:
        return "video"
    if ev == ["image"] and media_type in (1, 8):
        return "image"
    if ev == ["caption"] and not rec.get("needs_media"):
        return "caption"
    return None


def main():
    pools = {k: [] for k in TARGET}
    for zone in ZONES:
        posts, parsed, reels, places = load_zone(zone)
        for code, rec in parsed.items():
            post = posts.get(code)
            reel = reels.get(code)
            kind = classify(code, post, rec, reel)
            if kind is None:
                continue
            if kind == "none" and (post or {}).get("media_type") != 2:
                continue  # 장소 없는 게시물은 릴스만 (영상 변형의 오탐을 보려고)
            if kind == "video" and "low" in confidences(rec):
                continue
            ids = reel["kakao_place_ids"] if reel else []
            names = [places.get(i, {}).get("name", "") for i in ids]
            caption_has_address = bool(ADDRESS_LIKE.search((reel or {}).get("description") or (post or {}).get("caption") or ""))
            note = ("confidence " + "/".join(sorted(confidences(rec)))) if ids else (rec.get("skip_reason") or "")
            if kind == "video":
                note += ", 캡션에 주소 " + ("있음" if caption_has_address else "없음")
            pools[kind].append({
                "_has_address": caption_has_address,
                "shortcode": code,
                "url": url_for(code, post, reel),
                "kind": kind,
                "zone": zone,
                "expected_kakao_place_ids": ";".join(ids),
                "expected_names": ";".join(names),
                "evidence": "+".join(evidence(rec)) if ids else "",
                "notes": note,
                "_prefer": 0 if zone == "gwangju" else 1,
            })
    rows = []
    for kind, n in TARGET.items():
        pool = pools[kind]
        random.shuffle(pool)
        # gwangju를 먼저 채우되 다른 zone도 섞는다: 절반 이상은 gwangju, 나머지는 섞어서
        gw = [p for p in pool if p["zone"] == "gwangju"]
        other = [p for p in pool if p["zone"] != "gwangju"]
        take = gw[: max(1, n * 2 // 3)] + other[: n - max(1, n * 2 // 3)]
        if len(take) < n:
            take = (gw + other)[:n]
        if kind == "video":
            # 캡션에 주소조차 없는 릴스를 먼저 채운다(영상 읽기가 꼭 필요한 경우)
            no_addr = [p for p in pool if not p["_has_address"]]
            with_addr = [p for p in pool if p["_has_address"]]
            take = no_addr[: min(len(no_addr), 10)] + with_addr[: n - min(len(no_addr), 10)]
        rows.extend(take)
        print(f"{kind}: pool={len(pool)} (gwangju {len(gw)}, other {len(other)}) -> {len(take)}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["case_id", "shortcode", "url", "kind", "zone", "expected_kakao_place_ids", "expected_names", "evidence", "notes"])
        for i, r in enumerate(rows, 1):
            w.writerow([f"C{i:03d}", r["shortcode"], r["url"], r["kind"], r["zone"], r["expected_kakao_place_ids"],
                        r["expected_names"], r["evidence"], r["notes"]])
    print("wrote", OUT, len(rows))


if __name__ == "__main__":
    main()
