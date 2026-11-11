#!/bin/sh
# Fetch and show the dashboard once, without stopping the Kindle UI.
# Use it to check the URL and the image size before committing to the loop.
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/env.sh"
url="$DASH_URL?battery=$(gasgauge-info -c 2>/dev/null | tr -dc '0-9')"
echo "Fetching $url"
if command -v curl >/dev/null 2>&1; then curl -s -f -m "${FETCH_TIMEOUT:-90}" -o "$DIR/dash.png" "$url"; else wget -q -T "${FETCH_TIMEOUT:-90}" -O "$DIR/dash.png" "$url"; fi
if [ -s "$DIR/dash.png" ]; then
  echo "Got $(wc -c < "$DIR/dash.png") bytes. Showing for 20 s."
  sleep 2
  eips -f -g "$DIR/dash.png"
  sleep 20
  echo "Done. Tap the screen to redraw the Kindle UI."
else
  echo "Fetch failed. Is the server running and the Kindle on Wi-Fi?"
  echo "Check DASH_URL in /mnt/us/dashboard/env.sh"
fi
