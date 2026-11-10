#!/bin/sh
# Fetch and show the dashboard once, without stopping the Kindle UI.
# Use it to check the URL and the image size before committing to the loop.
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/env.sh"
url="$DASH_URL?battery=$(gasgauge-info -c 2>/dev/null | tr -dc '0-9')"
echo "Fetching $url"
if curl -s -f -m 60 -o "$DIR/dash.png" "$url" || wget -q -T 60 -O "$DIR/dash.png" "$url"; then
  echo "Got $(wc -c < "$DIR/dash.png") bytes. Showing for 20 s."
  sleep 2
  eips -f -g "$DIR/dash.png"
  sleep 20
  echo "Done. Tap the screen to redraw the Kindle UI."
else
  echo "Fetch failed. Is the server running and the Kindle on Wi-Fi?"
  echo "Check DASH_URL in /mnt/us/dashboard/env.sh"
fi
