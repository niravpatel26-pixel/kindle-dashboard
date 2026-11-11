#!/bin/sh
# Kindle dashboard loop: fetch a PNG, show it with eips, suspend until the next
# refresh. Runs with the Kindle UI ("framework") stopped, so nothing redraws
# over the image. To get the normal Kindle back: run stop.sh over SSH, or hold
# the power button for ~7 s to reboot (the dashboard does not auto-start).

DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/env.sh"
[ -n "$TZ_SPEC" ] && export TZ="$TZ_SPEC"   # quiet hours are judged in this zone

LOG="$DIR/logs/dash.log"
PNG="$DIR/dash.png"
TMP="$DIR/dash.tmp"
mkdir -p "$DIR/logs"
echo $$ > "$DIR/dash.pid"

# Settings from env.sh must be whole numbers; fall back to sane values rather
# than crashing the loop on an arithmetic error at 3 a.m.
num() { case "$1" in ''|*[!0-9-]*) echo "$2" ;; *) echo "$1" ;; esac; }
REFRESH_MINUTES=$(num "$REFRESH_MINUTES" 10); [ "$REFRESH_MINUTES" -lt 1 ] && REFRESH_MINUTES=1
QUIET_START=$(num "$QUIET_START" -1); QUIET_END=$(num "$QUIET_END" 7)
[ "$QUIET_START" -gt 23 ] && QUIET_START=-1
[ "$QUIET_END" -lt 0 ] && QUIET_END=0; [ "$QUIET_END" -gt 23 ] && QUIET_END=23
FULL_REFRESH_EVERY=$(num "$FULL_REFRESH_EVERY" 6); [ "$FULL_REFRESH_EVERY" -lt 1 ] && FULL_REFRESH_EVERY=1
WIFI_TIMEOUT=$(num "$WIFI_TIMEOUT" 45); [ "$WIFI_TIMEOUT" -lt 5 ] && WIFI_TIMEOUT=5
FETCH_TIMEOUT=$(num "$FETCH_TIMEOUT" 90); [ "$FETCH_TIMEOUT" -lt 10 ] && FETCH_TIMEOUT=10

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

battery() {
  b=$(gasgauge-info -c 2>/dev/null | tr -dc '0-9')
  [ -z "$b" ] && b=$(cat /sys/class/power_supply/*/capacity 2>/dev/null | head -1 | tr -dc '0-9')
  echo "$b"
}

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

# One request per cycle: wget is only used when curl is absent, never as a
# retry, so a slow server is not hit twice. The server answers with an
# X-Refresh-Seconds header saying how soon to come back (short while a train
# is close, long otherwise); NEXT_WAIT carries it to the main loop.
HDR="$DIR/dash.hdr"
NEXT_WAIT=""
fetch() {
  url="$DASH_URL?battery=$(battery)&t=$(date +%s)"
  rm -f "$TMP" "$HDR"
  if command -v curl >/dev/null 2>&1; then
    curl -s -f -m "$FETCH_TIMEOUT" -D "$HDR" -o "$TMP" "$url" 2>>"$LOG"
  else
    wget -q -T "$FETCH_TIMEOUT" -S -O "$TMP" "$url" 2>"$HDR"
  fi
  NEXT_WAIT=$(tr -d '\r' < "$HDR" 2>/dev/null | sed -n 's/^.*[Xx]-[Rr]efresh-[Ss]econds: *\([0-9]*\).*$/\1/p' | head -1)
  if [ -s "$TMP" ]; then mv "$TMP" "$PNG"; return 0; fi
  rm -f "$TMP"
  return 1
}

# eips is on every Kindle; fbink comes with the modern jailbreak toolkit.
show() {
  if command -v eips >/dev/null 2>&1; then
    if [ "$1" = "full" ]; then eips -f -g "$PNG" >/dev/null 2>&1; else eips -g "$PNG" >/dev/null 2>&1; fi
  elif command -v fbink >/dev/null 2>&1; then
    if [ "$1" = "full" ]; then fbink -q -f -g file="$PNG" >/dev/null 2>&1; else fbink -q -g file="$PNG" >/dev/null 2>&1; fi
  else
    log "neither eips nor fbink found; cannot draw"
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
  # never sleep through the start of quiet hours or past a day boundary by more than needed
  [ "$secs" -gt 43200 ] && secs=43200
  log "suspend ${secs}s"
  sync
  t0=$(date +%s)
  if [ -w /sys/class/rtc/rtc0/wakealarm ]; then
    # Never suspend without a confirmed alarm: the device would sleep until a
    # button press and the dashboard would silently stop.
    echo 0 > /sys/class/rtc/rtc0/wakealarm 2>/dev/null
    # the RTC may run ahead of or behind the system clock: set the alarm relative to the RTC's own time
    rtcnow=$(cat /sys/class/rtc/rtc0/since_epoch 2>/dev/null); [ -z "$rtcnow" ] && rtcnow=$t0
    if echo $(( rtcnow + secs )) > /sys/class/rtc/rtc0/wakealarm 2>>"$LOG" && [ "$(cat /sys/class/rtc/rtc0/wakealarm 2>/dev/null)" -gt 0 ] 2>/dev/null; then
      echo mem > /sys/power/state 2>>"$LOG"
    else
      log "could not arm the RTC alarm, sleeping instead of suspending"
      sleep "$secs"; return
    fi
  elif [ -w /sys/devices/platform/mxc_rtc.0/wakeup_enable ]; then
    if echo -n "$secs" > /sys/devices/platform/mxc_rtc.0/wakeup_enable 2>>"$LOG"; then
      echo mem > /sys/power/state 2>>"$LOG"
    else
      log "could not arm the RTC alarm, sleeping instead of suspending"
      sleep "$secs"; return
    fi
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
fails=0
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
      fails=0
      log "updated, battery $(battery)%"
    else
      fails=$((fails + 1))
      log "fetch failed ($fails in a row): $DASH_URL"
    fi
  else
    log "wifi not connected after ${WIFI_TIMEOUT}s"
  fi
  wifi_off
  sleep 2
  # the server's hint wins when ADAPTIVE=1 and it is sane; otherwise the fixed interval
  wait=$((REFRESH_MINUTES * 60))
  if [ "$ADAPTIVE" != "0" ] && [ -n "$NEXT_WAIT" ] && [ "$NEXT_WAIT" -ge 60 ] 2>/dev/null && [ "$NEXT_WAIT" -le 3600 ] 2>/dev/null; then
    wait=$NEXT_WAIT
  fi
  # back off while the server is unreachable (e.g. the Mac is asleep) to save battery
  [ "$fails" -ge 3 ] && wait=$((REFRESH_MINUTES * 60 * 3))
  suspend_for "$wait"
done
