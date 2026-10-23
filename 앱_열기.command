#!/bin/bash
# 더블클릭하면 로컬 서버를 띄우고 경로 탐색기를 브라우저로 연다
# (src/data/*.json을 fetch로 읽기 때문에 file:// 대신 서버가 필요하다)
# 끝낼 때는 이 터미널 창을 닫으면 된다
cd "$(dirname "$0")"

PORT=8000
while lsof -i :$PORT >/dev/null 2>&1; do PORT=$((PORT+1)); done
URL="http://localhost:$PORT/src/index.html"

echo "앱 주소: $URL"
echo "(이 창을 닫으면 서버가 종료돼요)"
(sleep 1 && open "$URL") &
python3 scripts/serve.py $PORT
