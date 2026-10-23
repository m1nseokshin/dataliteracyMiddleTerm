"""references/data/raw/ 의 공공데이터 CSV를 src/data/*.json 으로 변환한다.

실행: python3 scripts/preprocess_raw.py

산출물
  src/data/network.json     역(노드) · 구간(엣지) · 환승 엣지
  src/data/ridership.json   역 x 시간대 평일 평균 승차/하차 (수영·미남 개찰구 분리 반영)
  src/data/congestion.json  구간 x 시간대 혼잡률 (1호선 = 실측, 2~4호선 = 추정)
  src/data/service.json     구간 x 시간대 시간당 운행 열차 수 (평일 시간표)
  src/data/transfers.json   환승역별 환승시간(추정) · 편의시설 점수 · 시간대별 밀집계수
  src/data/model_fit.json   2~4호선 혼잡률 추정 모델 계수와 검증 결과
  planning/estimation_report.md   위 추정 과정을 사람이 읽는 형태로 정리 (발표 자료용)

2~4호선 혼잡률 추정 (공공데이터에 없어서 직접 설계한 모델)
  1) 보존법칙: 구간 k를 정방향으로 건너는 순유동 F(k) = sum_{j<=k} (승차_j - 하차_j)
  2) 구간 양방향 총통행 = gamma * min(왼쪽 이용량, 오른쪽 이용량)   (gamma: 0~1.5, 1호선으로 보정)
  3) 정방향 부하 = (총통행 + F) / 2,  역방향 부하 = (총통행 - F) / 2   (0 미만은 0)
  4) 혼잡률(%) = lambda * 100 * 부하 / (시간당 열차 수 * 편성 정원)   (lambda: 1호선으로 보정)
  gamma, lambda 는 1호선 실측 혼잡률에 맞춰 찾고, 2~4호선에는 각 호선의 편성 정원과 배차 횟수만 바꿔 적용한다.
"""

import csv
import glob
import json
import re
import statistics
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "references" / "data" / "raw"
OUT = ROOT / "src" / "data"
REPORT = ROOT / "planning" / "estimation_report.md"

SLOTS = {"am_peak": 8, "midday": 14, "pm_peak": 18, "night": 21}

# 편성 정원 = 전동차 주요제원(좌석+입석) x 편성 구성. 근거: references/data_research.md ⑤
CAPACITY = {1: 955, 2: 722, 3: 474, 4: 316}  # 1호선은 880~1,030의 중간값

# 환승시간(초). 공식 수치가 없어 근거 수준을 함께 기록한다. 근거: references/data_research.md ③
TRANSFER_TIME = {
    "연산": (109, "measured", "환승 안내 사인 개선 후 실측 109초(개선 전 182초), 언론 2건"),
    "덕천": (150, "range", "언론: 계단 1회, 2~3분 -> 중간값"),
    "미남": (150, "range", "위키: 최소 환승 2분대 -> 중간값, 3호선 아래 4호선 복층"),
    "수영": (120, "assumed", "계단 1회 구조(덕천과 유사)이나 수치 없음 -> 덕천보다 짧게 가정"),
    "서면": (180, "assumed", "수치 없음. 상하 교차 + 최대 혼잡역 -> 연산 실측의 약 1.65배 가정"),
    "동래": (240, "assumed", "수치 없음. 대합실 경유 구조 + 1호선-4호선 -> 연산 실측의 약 2.2배 가정"),
}


# 시간표와 역간 거리 파일의 역명 표기 차이
NAME_ALIAS = {"국제금융.부산은행": "국제금융센터.부산은행"}


def read_csv(path):
    with open(path, encoding="cp949", newline="") as f:
        return list(csv.DictReader(f))


def mmss(text):
    m, s = text.split(":")
    return int(m) * 60 + int(s)


def write_json(name, obj):
    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / name, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    print("wrote", name)


# ---------------------------------------------------------------- 네트워크
def build_network():
    rows = read_csv(next(RAW.glob("*역간 거리 및 소요시간*.csv")))
    lines = defaultdict(list)  # line -> [station dict, ...] (역번호 순)
    for r in rows:
        line = int(r["호선"])
        lines[line].append({
            "id": str(int(r["역번호"])),
            "name": r["역명"],
            "line": line,
            "order": len(lines[line]),
            "sec": mmss(r["소요시간(분)"]),
            "km": float(r["역간거리(km)"]),
        })

    stations, edges = [], []
    for line, items in lines.items():
        for i, st in enumerate(items):
            stations.append({"id": st["id"], "name": st["name"], "line": line, "order": i})
            if i > 0:
                edges.append({
                    "from": items[i - 1]["id"], "to": st["id"], "line": line,
                    "type": "ride", "time_sec": st["sec"], "km": st["km"],
                })

    by_name = defaultdict(list)
    for st in stations:
        by_name[st["name"]].append(st)
    transfers = []
    for name, group in by_name.items():
        if len(group) < 2:
            continue
        group.sort(key=lambda s: s["line"])
        for a in range(len(group)):
            for b in range(a + 1, len(group)):
                transfers.append((name, group[a], group[b]))
    return lines, stations, edges, transfers


# ---------------------------------------------------------------- 승하차
def hour_col(h):
    return f"{h:02d}시-{(h + 1) % 24:02d}시" if h < 23 else "23시-24시"


def weekday_dates(rows):
    """월~금 중 전 노선 합계가 평소보다 크게 낮은 날(공휴일 추정)을 제외한다."""
    daily = defaultdict(float)
    dow = {}
    for r in rows:
        daily[r["년월일"]] += float(r["합계"])
        dow[r["년월일"]] = r["요일"]
    wk = {d: v for d, v in daily.items() if dow[d] in "월화수목금"}
    med = statistics.median(wk.values())
    keep = {d for d, v in wk.items() if v >= 0.85 * med}
    dropped = sorted(set(wk) - keep)
    return keep, dropped


def build_ridership(lines):
    rows = read_csv(next(RAW.glob("*시간대별 승하차인원*.csv")))
    keep, dropped = weekday_dates(rows)
    acc = defaultdict(lambda: defaultdict(list))  # (id, kind) -> slot -> [values]
    for r in rows:
        if r["년월일"] not in keep:
            continue
        sid = str(int(r["역번호"]))
        for slot, h in SLOTS.items():
            acc[(sid, r["구분"])][slot].append(float(r[hour_col(h)]))
    mean = lambda v: sum(v) / len(v)

    ride = {}  # (id, slot) -> {"board":, "alight":, "split": bool}
    for (sid, kind), per_slot in acc.items():
        for slot, vals in per_slot.items():
            d = ride.setdefault((sid, slot), {"board": 0.0, "alight": 0.0, "split": False})
            d["board" if kind == "승차" else "alight"] = mean(vals)

    # 개찰구가 합쳐진 역(수영: 2+3호선, 미남: 3+4호선)을 이웃 역 이용량 비율로 나눈다
    all_ids = {st["id"]: st for items in lines.values() for st in items}
    present = {sid for sid, _ in ride}
    missing = [sid for sid in all_ids if sid not in present]
    split_log = []
    for mid in missing:
        st = all_ids[mid]
        holder = next(s for s in all_ids.values() if s["name"] == st["name"] and s["id"] in present)

        def neighbor_volume(station, slot):
            items = lines[station["line"]]
            vols = []
            for j in (station["order"] - 1, station["order"] + 1):
                if 0 <= j < len(items) and items[j]["id"] in present and items[j]["name"] != st["name"]:
                    d = ride[(items[j]["id"], slot)]
                    vols.append(d["board"] + d["alight"])
            return sum(vols) / len(vols)

        for slot in SLOTS:
            v_hold, v_miss = neighbor_volume(holder, slot), neighbor_volume(st, slot)
            share = v_miss / (v_hold + v_miss)
            d = ride[(holder["id"], slot)]
            ride[(mid, slot)] = {"board": d["board"] * share, "alight": d["alight"] * share, "split": True}
            d["board"] *= 1 - share
            d["alight"] *= 1 - share
            d["split"] = True
            split_log.append((st["name"], slot, holder["line"], st["line"], round(1 - share, 3), round(share, 3)))

    records = []
    for (sid, slot), d in sorted(ride.items(), key=lambda x: (int(x[0][0]), x[0][1])):
        st = all_ids.get(sid)
        if st is None:
            continue
        records.append({"id": sid, "name": st["name"], "line": st["line"], "slot": slot,
                        "board": round(d["board"], 1), "alight": round(d["alight"], 1), "split": d["split"]})
    meta = {"source": "부산교통공사_시간대별 승하차인원 (2026-01~08)", "aggregation": "평일 평균",
            "weekdays_used": len(keep), "excluded_weekdays(공휴일 추정)": dropped}
    return ride, records, meta, split_log


# ---------------------------------------------------------------- 운행 횟수
def build_service(lines):
    rows = read_csv(next(RAW.glob("*운행 정보*.csv")))
    name_to = {ln: {s["name"]: s for s in items} for ln, items in lines.items()}
    count = defaultdict(int)  # (line, from_id, to_id, slot) -> trains
    unmatched = set()
    for r in rows:
        if r["요일구분"] != "평일":
            continue
        line = int(r["노선명"].split("호선")[0].split()[-1])
        names = [NAME_ALIAS.get(p.split("-", 1)[1], p.split("-", 1)[1]) for p in r["운행구간정거장"].split("+")]
        dep = [p.split("-", 1)[1] for p in r["정거장출발시각"].split("+")]
        arr = [p.split("-", 1)[1] for p in r["정거장도착시각"].split("+")]
        for i in range(len(names) - 1):
            a, b = name_to[line].get(names[i]), name_to[line].get(names[i + 1])
            if a is None or b is None:
                unmatched.add((line, names[i] if a is None else names[i + 1]))
                continue
            t = dep[i] if dep[i] not in ("", "-") else arr[i]
            hour = int(t.split(":")[0]) % 24
            for slot, h in SLOTS.items():
                if hour == h:
                    count[(line, a["id"], b["id"], slot)] += 1
    records = [{"line": k[0], "from": k[1], "to": k[2], "slot": k[3], "trains_per_hour": v}
               for k, v in sorted(count.items())]
    return count, records, unmatched


# ---------------------------------------------------------------- 혼잡도
def load_line1_observed(lines):
    items = lines[1]
    idx = {s["name"]: s["order"] for s in items}
    acc = defaultdict(list)  # (from_order, to_order, slot) -> [(mean_car, max_car)]
    unmatched = set()
    for path in sorted(glob.glob(str(RAW / "congestion_line1" / "*.csv"))):
        for r in read_csv(path):
            hour = int(r["시간"].split(":")[0])
            slot = next((s for s, h in SLOTS.items() if h == hour), None)
            if slot is None:
                continue
            if r["역"] not in idx or r["행선지"] not in idx:
                unmatched.add(r.get("역") if r["역"] not in idx else r["행선지"])
                continue
            k, dest = idx[r["역"]], idx[r["행선지"]]
            nxt = k + 1 if dest > k else k - 1
            if not 0 <= nxt < len(items):
                continue
            cars = [float(r[f"{c}호차"]) for c in range(1, 9) if r[f"{c}호차"] != ""]
            if cars:
                acc[(k, nxt, slot)].append((sum(cars) / len(cars), max(cars)))
    obs = {}
    for key, vals in acc.items():
        obs[key] = (sum(v[0] for v in vals) / len(vals), sum(v[1] for v in vals) / len(vals), len(vals))
    return obs, unmatched


def segment_loads(items, ride, slot):
    """구간 k(역 k -> k+1)의 정방향/역방향 부하 재료: (순유동 F, 이용량 상한 M)."""
    n = len(items)
    b = [ride[(s["id"], slot)]["board"] for s in items]
    a = [ride[(s["id"], slot)]["alight"] for s in items]
    act = [x + y for x, y in zip(b, a)]
    out = []
    for k in range(n - 1):
        F = sum(b[j] - a[j] for j in range(k + 1))
        M = min(sum(act[: k + 1]), sum(act[k + 1:]))
        out.append((F, M))
    return out


def predict_rate(F, M, tph, cap, gamma, lam, forward):
    total = gamma * M
    load = (total + F) / 2 if forward else (total - F) / 2
    load = max(0.0, load)
    return lam * 100.0 * load / (tph * cap)


def fit_model(lines, ride, service, obs):
    """1호선 실측에 맞춰 (gamma, lambda)를 격자탐색으로 찾는다."""
    items = lines[1]
    samples = []  # (F, M, tph, forward, observed)
    for (k, nxt, slot), (mean_car, _, _) in obs.items():
        forward = nxt > k
        cut = min(k, nxt)
        F, M = segment_loads(items, ride, slot)[cut]
        sa, sb = items[k]["id"], items[nxt]["id"]
        tph = service.get((1, sa, sb, slot))
        if not tph:
            continue
        samples.append((F, M, tph, forward, mean_car, slot))

    def sse(gamma, lam, rows):
        return sum((predict_rate(F, M, t, CAPACITY[1], gamma, lam, fw) - y) ** 2 for F, M, t, fw, y, _ in rows)

    def search(rows):
        best = (1e30, 0, 0)
        for gi in range(0, 31):
            g = gi * 0.05
            for li in range(5, 151):
                lam = li * 0.02
                e = sse(g, lam, rows)
                if e < best[0]:
                    best = (e, g, lam)
        return best

    _, gamma, lam = search(samples)

    def metrics(rows, g, l):
        ys = [r[4] for r in rows]
        ps = [predict_rate(r[0], r[1], r[2], CAPACITY[1], g, l, r[3]) for r in rows]
        my = sum(ys) / len(ys)
        ss_res = sum((y - p) ** 2 for y, p in zip(ys, ps))
        ss_tot = sum((y - my) ** 2 for y in ys)
        mae = sum(abs(y - p) for y, p in zip(ys, ps)) / len(ys)
        mean_p = sum(ps) / len(ps)
        cov = sum((y - my) * (p - mean_p) for y, p in zip(ys, ps))
        corr = cov / (ss_tot ** 0.5 * sum((p - mean_p) ** 2 for p in ps) ** 0.5 + 1e-9)
        return {"n": len(rows), "r2": round(1 - ss_res / ss_tot, 3), "mae_pct_point": round(mae, 2),
                "corr": round(corr, 3), "obs_mean": round(my, 1), "pred_mean": round(mean_p, 1)}

    in_sample = metrics(samples, gamma, lam)
    cv = {}
    for slot in SLOTS:  # 한 시간대를 빼고 맞춘 뒤 빠진 시간대를 예측
        train = [r for r in samples if r[5] != slot]
        test = [r for r in samples if r[5] == slot]
        _, g, l = search(train)
        cv[slot] = metrics(test, g, l)
    return gamma, lam, in_sample, cv, samples


def build_congestion(lines, ride, service, obs, gamma, lam):
    records = []
    for line, items in lines.items():
        for slot in SLOTS:
            loads = segment_loads(items, ride, slot)
            for k in range(len(items) - 1):
                F, M = loads[k]
                for forward in (True, False):
                    a, b = (k, k + 1) if forward else (k + 1, k)
                    ida, idb = items[a]["id"], items[b]["id"]
                    tph = service.get((line, ida, idb, slot))
                    if not tph:
                        continue
                    est = predict_rate(F, M, tph, CAPACITY[line], gamma, lam, forward)
                    o = obs.get((a, b, slot)) if line == 1 else None
                    rec = {"line": line, "from": ida, "to": idb, "slot": slot,
                           "rate": round(o[0] if o else est, 1),
                           "source": "observed" if o else "estimated",
                           "estimated_rate": round(est, 1)}
                    if o:
                        rec["peak_car_rate"] = round(o[1], 1)
                    records.append(rec)
    return records


# ---------------------------------------------------------------- 환승/편의시설
def build_transfers(lines, transfers, ride):
    fac_rows = read_csv(next(RAW.glob("*편의시설현황*.csv")))
    fac = defaultdict(lambda: {"elevator": 0, "escalator": 0})
    for r in fac_rows:
        key = r["구분"].replace("호선", "")
        if not key.isdigit():
            continue
        name = re.sub(r"\(\d\)$", "", r["역명"])  # 환승역은 '서면(1)'처럼 호선 표기가 붙어 있다
        f = fac[(int(key), name)]
        f["elevator"] += int(r["엘리베이터(내부)"] or 0) + int(r["엘리베이터(외부)"] or 0)
        f["escalator"] += int(r["에스컬레이터"] or 0)
    totals = sorted(v["elevator"] + v["escalator"] for v in fac.values())
    pct = lambda x: sum(1 for t in totals if t <= x) / len(totals)

    cx = defaultdict(list)
    for r in read_csv(next(RAW.glob("*대체 이동 경로*.csv"))):
        if r["환승역 여부"] == "Y" and r["경로복잡도 점수"]:
            cx[r["역명"]].append(float(r["경로복잡도 점수"]))

    name_vol = defaultdict(lambda: defaultdict(float))
    all_st = {s["id"]: s for items in lines.values() for s in items}
    for (sid, slot), d in ride.items():
        if sid in all_st:
            name_vol[all_st[sid]["name"]][slot] += d["board"] + d["alight"]
    vmax = max(v for per in name_vol.values() for v in per.values())

    out, edges = [], []
    for name, a, b in transfers:
        sec, conf, basis = TRANSFER_TIME.get(name, (None, "missing", "근거 없음"))
        f = {"elevator": 0, "escalator": 0}
        for line in (a["line"], b["line"]):
            for k in ("elevator", "escalator"):
                f[k] += fac.get((line, name), {}).get(k, 0)
        out.append({
            "station": name, "from_line": a["line"], "to_line": b["line"],
            "from_id": a["id"], "to_id": b["id"],
            "transfer_time_sec": sec, "transfer_time_basis": conf, "basis_note": basis,
            "transfer_distance_m": None,
            "facility": f, "facility_score": round(pct(f["elevator"] + f["escalator"]), 2),
            "route_complexity": round(statistics.mean(cx[name]), 2) if cx.get(name) else None,
            "crowd_factor": {s: round(name_vol[name][s] / vmax, 3) for s in SLOTS},
        })
        for x, y in ((a, b), (b, a)):
            edges.append({"from": x["id"], "to": y["id"], "type": "transfer", "time_sec": sec})
    return out, edges, fac


# ---------------------------------------------------------------- 실행
def main():
    lines, stations, edges, transfers = build_network()
    ride, ride_records, ride_meta, split_log = build_ridership(lines)
    service, service_records, unmatched_tt = build_service(lines)
    obs, unmatched_cg = load_line1_observed(lines)
    gamma, lam, in_sample, cv, fit_samples = fit_model(lines, ride, service, obs)
    cong = build_congestion(lines, ride, service, obs, gamma, lam)
    tr, tr_edges, _ = build_transfers(lines, transfers, ride)

    write_json("network.json", {
        "meta": {"source": "부산교통공사_역간 거리 및 소요시간 정보", "time_unit": "초",
                 "note": "좌표(x, y)는 미니맵 구현 단계에서 추가"},
        "stations": stations, "edges": edges + tr_edges})
    write_json("ridership.json", {"meta": ride_meta, "records": ride_records})
    write_json("service.json", {"meta": {"source": "부산도시철도 운행 정보(시간표) 평일", "unit": "시간당 열차 수(구간 출발 기준)"},
                                "records": service_records})
    write_json("congestion.json", {
        "meta": {"unit": "혼잡률(%) = 정원 대비 승객", "observed": "1호선 2020-01~2021-08 평일 실측(호차 평균)",
                 "estimated": "2~4호선은 승하차 + 편성 정원 + 배차 횟수 기반 추정 (scripts/preprocess_raw.py 참고)"},
        "records": cong})
    write_json("transfers.json", {"meta": {"note": "환승시간은 공식 수치가 없어 근거 수준(transfer_time_basis)을 함께 표기"}, "records": tr})
    points = [{"slot": slot, "obs": round(y, 1), "pred": round(predict_rate(F, M, t, CAPACITY[1], gamma, lam, fw), 1)}
              for F, M, t, fw, y, slot in fit_samples]
    write_json("model_fit.json", {"gamma": gamma, "lambda": lam, "capacity": CAPACITY,
                                  "fit_on_line1": in_sample, "leave_one_slot_out": cv, "points": points})

    # 점검 출력
    print("stations", len(stations), "edges", len(edges), "transfers", len(tr))
    print("excluded weekdays:", ride_meta["excluded_weekdays(공휴일 추정)"])
    print("unmatched timetable names:", sorted(unmatched_tt))
    print("unmatched congestion names:", sorted(unmatched_cg))
    print("gamma, lambda:", gamma, round(lam, 2))
    print("fit:", in_sample)
    for s, m in cv.items():
        print(" cv", s, m)

    # 호선 x 시간대 최대 혼잡률 요약
    summary = defaultdict(float)
    for r in cong:
        key = (r["line"], r["slot"])
        summary[key] = max(summary[key], r["rate"])
    print("max rate by line/slot:")
    for line in (1, 2, 3, 4):
        print(" ", line, {s: round(summary[(line, s)]) for s in SLOTS})

    write_report(in_sample, cv, gamma, lam, split_log, ride_meta, tr, cong, summary)


def write_report(in_sample, cv, gamma, lam, split_log, ride_meta, tr, cong, summary):
    L = ["# 📐 2~4호선 혼잡률 추정 리포트 (자동 생성)", "",
         "> `scripts/preprocess_raw.py`가 만든 문서입니다. 직접 고치지 말고 스크립트를 수정한 뒤 다시 실행하세요.", "",
         "## 1. 왜 추정이 필요한가",
         "- 공개된 열차혼잡도는 **1호선(2020-01~2021-08, 평일)** 뿐입니다. 2~4호선 혼잡도는 공공데이터에 없습니다.",
         "- 대신 **전 호선 승하차인원(2026)**, **편성 정원(전동차 제원)**, **평일 배차 횟수(시간표)** 는 공개돼 있어 이를 조합합니다.", "",
         "## 2. 모델",
         "1. 구간을 건너는 **순유동** F(k) = Σ(승차 − 하차)  ← 인원 보존법칙",
         "2. 양방향 총통행 = γ × min(구간 왼쪽 이용량, 오른쪽 이용량)",
         "3. 정방향 부하 = (총통행 + F) / 2, 역방향 부하 = (총통행 − F) / 2",
         "4. 혼잡률(%) = λ × 100 × 부하 / (시간당 열차 수 × 편성 정원)", "",
         f"1호선 실측에 맞춰 찾은 계수: **γ = {gamma:.2f}, λ = {lam:.2f}**", "",
         "## 3. 검증 (1호선, 실측 대비)",
         f"- 전체 적합: R² = {in_sample['r2']}, 상관 = {in_sample['corr']}, 평균 절대오차 = {in_sample['mae_pct_point']}%p "
         f"(n={in_sample['n']}, 실측 평균 {in_sample['obs_mean']}% / 예측 평균 {in_sample['pred_mean']}%)",
         "- 시간대 하나를 빼고 맞춘 뒤 빠진 시간대를 예측 (교차검증):", "",
         "| 시간대 | R² | 평균 절대오차(%p) | 상관 | 실측 평균 | 예측 평균 |", "| :-- | --: | --: | --: | --: | --: |"]
    for s, m in cv.items():
        L.append(f"| {s} | {m['r2']} | {m['mae_pct_point']} | {m['corr']} | {m['obs_mean']} | {m['pred_mean']} |")
    L += ["", "## 4. 추정 결과 요약 (호선·시간대별 가장 붐비는 구간의 혼잡률 %)",
          "", "| 호선 | " + " | ".join(SLOTS) + " |", "| :-: | " + " | ".join("--:" for _ in SLOTS) + " |"]
    for line in (1, 2, 3, 4):
        tag = "실측" if line == 1 else "추정"
        L.append(f"| {line}호선 ({tag}) | " + " | ".join(str(round(summary[(line, s)])) for s in SLOTS) + " |")
    L += ["", "## 5. 한계 (발표 때 반드시 언급)",
          "- 2~4호선 계수는 **1호선의 패턴이 다른 호선에도 같다**는 가정에 의존합니다. 1호선은 8량 장거리 노선이라 4량 3호선이나 경전철 4호선과 다를 수 있습니다.",
          "- 승하차 데이터는 **개찰구 기준**이라 환승 승객이 빠집니다. 환승 수요가 큰 3호선·2호선 도심 구간은 **과소추정** 가능성이 있습니다.",
          "- 1호선 실측은 **2020~2021년(코로나 시기)**, 승하차는 **2026년**입니다. 시기가 달라 λ에 이 차이가 섞여 있습니다.",
          "- 방향별 유동은 순유동(보존법칙)으로 구하고 양방향 총통행은 γ로 근사했습니다. 실제 OD 데이터가 아닙니다.",
          "- 편성 정원은 제원의 좌석+입석 기준이며 4호선은 중간차 구성을 가정했습니다.",
          "- **정확도**: 같은 시간대 안에서 구간별 높낮이(공간 패턴)는 잘 맞지만(상관 0.86~0.94), 시간대별 **절대 수준**은 평균 5~12%p 어긋납니다. 교차검증 R²가 낮은 이유입니다. 호선 간 절대 비교보다 **같은 호선·시간대 안에서의 상대 비교**에 더 믿을 만합니다.",
          "- 배차 횟수는 **2026-07-22 시간표** 기준이라 2026-08-24 낮 배차 조정(2호선 7분30초, 4호선 9분30초)이 반영돼 있지 않습니다.", "",
          "## 6. 수영·미남 개찰구 분리",
          "수영(2·3호선), 미남(3·4호선)은 개찰구가 하나라 승하차 파일에 한 행으로만 있습니다. 같은 시간대 이웃 역 이용량 비율로 나눴습니다.", "",
          "| 역 | 시간대 | 원래 호선 몫 | 분리된 호선 몫 |", "| :-- | :-- | --: | --: |"]
    for name, slot, hl, ml, sh, sm in split_log:
        L.append(f"| {name} | {slot} | {hl}호선 {sh:.0%} | {ml}호선 {sm:.0%} |")
    L += ["", "## 7. 환승시간 근거 수준", "", "| 환승역 | 구간 | 시간(초) | 근거 수준 | 비고 |", "| :-- | :-: | --: | :-- | :-- |"]
    for t in tr:
        L.append(f"| {t['station']} | {t['from_line']}↔{t['to_line']} | {t['transfer_time_sec']} | {t['transfer_time_basis']} | {t['basis_note']} |")
    L += ["", f"> 승하차 집계: 평일 {ride_meta['weekdays_used']}일 사용. `measured`=실측, `range`=보도 범위의 중간값, `assumed`=수치 없어 가정.", ""]
    REPORT.write_text("\n".join(L), encoding="utf-8")
    print("wrote", REPORT.relative_to(ROOT))


if __name__ == "__main__":
    main()
