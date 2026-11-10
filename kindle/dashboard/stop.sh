#!/bin/sh
# Stop the dashboard loop and bring the normal Kindle UI back.
DIR="$(cd "$(dirname "$0")" && pwd)"
for p in $(cat "$DIR/dash.pid" 2>/dev/null) $(ps w 2>/dev/null | grep '[d]ash\.sh' | awk '{print $1}'); do
  kill "$p" 2>/dev/null
done
rm -f "$DIR/dash.pid"
lipc-set-prop com.lab126.powerd preventScreenSaver 0 >/dev/null 2>&1
lipc-set-prop com.lab126.cmd wirelessEnable 1 >/dev/null 2>&1
/etc/init.d/framework start >/dev/null 2>&1 || initctl start framework >/dev/null 2>&1 || start framework >/dev/null 2>&1
echo "Dashboard stopped. Kindle UI restarting."
