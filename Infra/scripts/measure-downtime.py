#!/usr/bin/env python3
"""배포 중 밖에서 요청을 계속 보내 실패한 요청 수와 끊긴 시간을 잰다.

    python3 measure-downtime.py --url 'https://<도메인>/api/v1/app-update-policies?platform=android&appVersion=2.2.0' \
        --rate 5 --duration 300 --csv result.csv

요청마다 보낸 시각(KST), 응답 코드(연결 실패는 ERR), 걸린 시간을 CSV로 남기고, 끝나면 실패 수와
처음과 마지막 실패 시각, 실패가 이어진 가장 긴 구간을 출력한다. 표준 라이브러리만 쓴다.
요청은 정해진 간격으로 보내고 응답을 기다리지 않으므로, 앱이 느려져도 보내는 횟수가 줄지 않는다.
"""
import argparse
import csv
import signal
import ssl
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
results = []
lock = threading.Lock()
stop = threading.Event()


def send(url, timeout, sent_at):
    started = time.monotonic()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "yeogidam-downtime-probe"}),
                                    timeout=timeout, context=ssl.create_default_context()) as response:
            response.read()
            status = str(response.status)
    except urllib.error.HTTPError as error:
        status = str(error.code)
    except Exception as error:  # 연결 거부, 시간 초과, TLS 오류
        status = "ERR:" + type(error).__name__
    elapsed_ms = round((time.monotonic() - started) * 1000)
    with lock:
        results.append((sent_at, status, elapsed_ms))


def summarize(rows):
    rows = sorted(rows)
    failures = [row for row in rows if not row[1].startswith("2")]
    print(f"보낸 요청 {len(rows)}건, 실패 {len(failures)}건")
    if not rows:
        return
    print(f"측정 구간 {fmt(rows[0][0])} ~ {fmt(rows[-1][0])} (KST)")
    if not failures:
        print("끊긴 구간 없음")
        return
    kinds = {}
    for _, status, _ in failures:
        kinds[status] = kinds.get(status, 0) + 1
    print("실패 종류 " + ", ".join(f"{key} {value}건" for key, value in sorted(kinds.items())))
    print(f"처음 실패 {fmt(failures[0][0])}, 마지막 실패 {fmt(failures[-1][0])}")
    # 실패가 이어진 구간: 성공 사이에 낀 실패들의 처음부터 마지막까지
    windows, current = [], []
    for row in rows:
        if row[1].startswith("2"):
            if current:
                windows.append(current)
                current = []
        else:
            current.append(row)
    if current:
        windows.append(current)
    longest = max(windows, key=lambda window: window[-1][0] - window[0][0])
    span = longest[-1][0] - longest[0][0]
    print(f"실패가 이어진 구간 {len(windows)}개, 가장 긴 구간 {span:.1f}초 "
          f"({fmt(longest[0][0])} ~ {fmt(longest[-1][0])}, {len(longest)}건)")


def fmt(epoch):
    return datetime.fromtimestamp(epoch, KST).strftime("%m-%d %H:%M:%S.%f")[:-3]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--rate", type=float, default=5.0, help="초당 요청 수(운영 nginx는 IP당 초당 10회 제한)")
    parser.add_argument("--duration", type=float, default=300.0, help="초. Ctrl+C로 먼저 끝낼 수 있다")
    parser.add_argument("--timeout", type=float, default=3.0)
    parser.add_argument("--csv")
    args = parser.parse_args()
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    signal.signal(signal.SIGTERM, lambda *_: stop.set())

    interval = 1.0 / args.rate
    deadline = time.monotonic() + args.duration
    next_send = time.monotonic()
    with ThreadPoolExecutor(max_workers=int(args.rate * args.timeout) + 4) as pool:
        while not stop.is_set() and time.monotonic() < deadline:
            pool.submit(send, args.url, args.timeout, time.time())
            next_send += interval
            time.sleep(max(0.0, next_send - time.monotonic()))
    if args.csv:
        with open(args.csv, "w", newline="") as file:
            writer = csv.writer(file)
            writer.writerow(["sent_at_kst", "status", "elapsed_ms"])
            for sent_at, status, elapsed_ms in sorted(results):
                writer.writerow([fmt(sent_at), status, elapsed_ms])
    summarize(results)


if __name__ == "__main__":
    main()
