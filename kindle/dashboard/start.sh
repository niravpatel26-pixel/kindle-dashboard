#!/bin/sh
# Start the dashboard loop in the background.
DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$DIR/logs"
if [ -f "$DIR/dash.pid" ] && kill -0 "$(cat "$DIR/dash.pid")" 2>/dev/null; then
  echo "Dashboard already running (pid $(cat "$DIR/dash.pid"))."
  exit 0
fi
if command -v setsid >/dev/null 2>&1; then
  setsid sh "$DIR/dash.sh" >>"$DIR/logs/dash.log" 2>&1 &
else
  nohup sh "$DIR/dash.sh" >>"$DIR/logs/dash.log" 2>&1 &
fi
echo "Dashboard starting. The Kindle UI will stop in a few seconds."
echo "To get the Kindle back: hold power ~7 s to reboot, or run stop.sh over SSH."
