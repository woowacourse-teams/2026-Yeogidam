#!/bin/bash
# 사용: measure.sh <commit> <scenario> <회수> <실행 후 대기초>
# 커밋 빌드를 설치하고 cold start를 반복한다. 실행 시각을 runs.csv에 남긴다.
set -u
S=$(dirname "$0"); C=$1; SC=$2; N=$3; WAIT=$4
DEV=8DBF02BF-BA09-5409-8265-ABF8F6376B7A; BID=com.yeogidamm.app
[ -d "$S/apps/$C.app" ] || { echo "no app for $C"; exit 1; }
xcrun devicectl device install app --device $DEV "$S/apps/$C.app" >/dev/null 2>&1 || { echo "install failed"; exit 1; }
# 설치 직후 첫 실행은 dyld 캐시 등으로 느려 측정에서 뺀다
xcrun devicectl device process launch --device $DEV --terminate-existing --json-output "$S/l.json" $BID >/dev/null 2>&1
sleep "$WAIT"
[ -f "$S/runs.csv" ] || echo "commit,scenario,run,launched_at_utc" > "$S/runs.csv"
for i in $(seq 1 "$N"); do
  PID=$(python3 -c "import json;print(json.load(open('$S/l.json'))['result']['process']['processIdentifier'])" 2>/dev/null)
  [ -n "$PID" ] && xcrun devicectl device process terminate --device $DEV --pid "$PID" >/dev/null 2>&1
  sleep 3
  T=$(date -u +%Y-%m-%dT%H:%M:%S)
  if ! xcrun devicectl device process launch --device $DEV --json-output "$S/l.json" $BID >/dev/null 2>&1; then
    echo "launch failed (run $i) - iPhone 잠금 확인"; exit 1
  fi
  echo "$C,$SC,$i,$T" >> "$S/runs.csv"; echo "$C $SC run $i $T"
  sleep "$WAIT"
done
PID=$(python3 -c "import json;print(json.load(open('$S/l.json'))['result']['process']['processIdentifier'])" 2>/dev/null)
[ -n "$PID" ] && xcrun devicectl device process terminate --device $DEV --pid "$PID" >/dev/null 2>&1
echo "DONE $C $SC"
