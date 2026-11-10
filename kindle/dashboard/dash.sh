#!/bin/sh
# Kindle dashboard loop: fetch a PNG, show it with eips, suspend until the next
# refresh. Runs with the Kindle UI ("framework") stopped, so nothing redraws
# over the image. To get the normal Kindle back: run stop.sh over SSH, or hold
# the power button for ~7 s to reboot (the dashboard does not auto-start).

DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/env.sh"

LOG="$DIR/logs/dash.log"
PNG="$DIR/dash.png"
TMP="$DIR/dash.tmp"
mkdir -p "$DIR/logs"
echo $$ > "$DIR/dash.pid"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

battery() { gasgauge-info -c 2>/dev/null | tr -dc '0-9'; }

wifi_on() {
  lipc-set-prop com.lab126.cmd wirelessEnable 1 >/dev/null 2>&1
  i=0
  while [ "$i" -lt "$WIFI_TIMEOUT" ]; do
    [ "$(lipc-get-prop com.lab126.wifid cmState 2>/dev/null)" = "CONNECTED" ] && return 0
    sleep 1
    i=$((i + 1))
  done
  return 1
}

wifi_off() {
  [ "$WIFI_ALWAYS_ON" = "1" ] && return 0
  lipc-set-prop com.lab126.cmd wirelessEnable 0 >/dev/null 2>&1
}

fetch() {
  url="$DASH_URL?battery=$(battery)&t=$(date +%s)"
  rm -f "$TMP"
  if curl -s -f -m 60 -o "$TMP" "$url" 2>>"$LOG" || wget -q -T 60 -O "$TMP" "$url" 2>>"$LOG"; then
    if [ -s "$TMP" ]; then mv "$TMP" "$PNG"; return 0; fi
  fi
  rm -f "$TMP"
  return 1
}

show() {
  if [ "$1" = "full" ]; then eips -f -g "$PNG" >/dev/null 2>&1
  else eips -g "$PNG" >/dev/null 2>&1
  fi
}

# seconds since local midnight
day_secs() {
  h=$(date +%H | sed 's/^0//'); m=$(date +%M | sed 's/^0//'); s=$(date +%S | sed 's/^0//')
  echo $(( ${h:-0} * 3600 + ${m:-0} * 60 + ${s:-0} ))
}

in_quiet_hours() {
  [ "$QUIET_START" -lt 0 ] && return 1
  h=$(date +%H | sed 's/^0//'); h=${h:-0}
  if [ "$QUIET_START" -gt "$QUIET_END" ]; then
    [ "$h" -ge "$QUIET_START" ] || [ "$h" -lt "$QUIET_END" ]
  else
    [ "$h" -ge "$QUIET_START" ] && [ "$h" -lt "$QUIET_END" ]
  fi
}

secs_until_quiet_end() {
  now=$(day_secs); end=$((QUIET_END * 3600))
  if [ "$end" -gt "$now" ]; then echo $((end - now)); else echo $((86400 - now + end)); fi
}

# Suspend to RAM with an RTC alarm. Tries the interfaces different Kindle
# kernels expose. If suspend returns early (USB plugged in, button press), sleep
# out the remainder so we never spin.
suspend_for() {
  secs=$1
  [ "$secs" -lt 20 ] && secs=20
  if [ "$DEBUG" = "1" ]; then log "debug sleep ${secs}s"; sleep "$secs"; return; fi
  log "suspend ${secs}s"
  sync
  t0=$(date +%s)
  if [ -w /sys/class/rtc/rtc0/wakealarm ]; then
    echo 0 > /sys/class/rtc/rtc0/wakealarm
    echo $(( t0 + secs )) > /sys/class/rtc/rtc0/wakealarm
    echo mem > /sys/power/state 2>>"$LOG"
  elif [ -w /sys/devices/platform/mxc_rtc.0/wakeup_enable ]; then
    echo -n "$secs" > /sys/devices/platform/mxc_rtc.0/wakeup_enable
    echo mem > /sys/power/state 2>>"$LOG"
  elif command -v rtcwake >/dev/null 2>&1; then
    rtcwake -m mem -s "$secs" >>"$LOG" 2>&1
  else
    log "no RTC wake interface found, using sleep"
    sleep "$secs"
    return
  fi
  el=$(( $(date +%s) - t0 ))
  if [ "$el" -lt "$secs" ]; then
    rem=$(( secs - el ))
    log "woke early after ${el}s, sleeping ${rem}s more"
    sleep "$rem"
  fi
}

init() {
  log "=== dashboard start (url $DASH_URL, every ${REFRESH_MINUTES}m, quiet ${QUIET_START}-${QUIET_END}) ==="
  sleep 3   # let the scriptlet runner finish drawing before we take the screen
  /etc/init.d/framework stop >>"$LOG" 2>&1 || initctl stop framework >>"$LOG" 2>&1 || stop framework >>"$LOG" 2>&1
  lipc-set-prop com.lab126.powerd preventScreenSaver 1 >/dev/null 2>&1
  echo powersave > /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null
  eips -c >/dev/null 2>&1
}

n=0
init
while true; do
  if in_quiet_hours; then
    wifi_off
    suspend_for "$(secs_until_quiet_end)"
    n=0
    continue
  fi
  if wifi_on; then
    if fetch; then
      if [ $((n % FULL_REFRESH_EVERY)) -eq 0 ]; then show full; else show; fi
      n=$((n + 1))
      log "updated, battery $(battery)%"
    else
      log "fetch failed: $DASH_URL"
    fi
  else
    log "wifi not connected after ${WIFI_TIMEOUT}s"
  fi
  wifi_off
  sleep 2
  suspend_for $((REFRESH_MINUTES * 60))
done
