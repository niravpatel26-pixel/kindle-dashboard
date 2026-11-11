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
TAP_WINDOW=$(num "$TAP_WINDOW" 25); [ "$TAP_WINDOW" -gt 120 ] && TAP_WINDOW=120
TOUCH_W=$(num "$TOUCH_W" 1072); TOUCH_H=$(num "$TOUCH_H" 1448); TOUCH_ROTATE=$(num "$TOUCH_ROTATE" 0)
TAPFILE="$DIR/tap.txt"
WOKE_EARLY=0

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
  if [ "$el" -lt $(( secs - 5 )) ]; then
    # Something other than the alarm woke us: the power button (or USB).
    # Treat it as "show me now": the main loop refreshes and listens for taps.
    log "woke early after ${el}s (button or USB)"
    WOKE_EARLY=1
  fi
}

# ---------- tap controls ----------
# The touchscreen is a Linux evdev node; each event is 16 bytes on this
# 32-bit ARM kernel: sec(4) usec(4) type(2) code(2) value(4). We read one
# event at a time with dd and decode it with od, which busybox provides.
find_touch() {
  [ -n "$TOUCH_DEV" ] && [ -e "$TOUCH_DEV" ] && return 0
  for e in /sys/class/input/event*; do
    [ -e "$e" ] || continue
    name=$(cat "$e/device/name" 2>/dev/null)
    case "$name" in
      *[Tt]ouch*|*[Zz]force*|*[Cc]yttsp*|*[Ee]lan*|*[Pp]ixcir*|*[Ww]acom*|*[Ff]t5*|*[Gg]oodix*)
        TOUCH_DEV="/dev/input/$(basename "$e")"; return 0 ;;
    esac
  done
  [ -e /dev/input/event1 ] && { TOUCH_DEV=/dev/input/event1; return 0; }
  return 1
}

# Runs in the background; appends "x y" to $TAPFILE when a finger lifts.
touch_reader() {
  x=0; y=0; down=0; lastsec=0; lastxy=""
  while :; do
    rec=$(dd if="$TOUCH_DEV" bs=16 count=1 2>/dev/null | od -An -tu2 -v 2>/dev/null | tr -s ' \n' ' ')
    [ -z "$rec" ] && { sleep 1; continue; }
    set -- $rec
    [ $# -lt 8 ] && continue
    type=$5; code=$6; vlo=$7; vhi=$8
    lift=0
    if [ "$type" = 3 ]; then
      case "$code" in
        0|53) [ "$vhi" = 0 ] && x=$vlo ;;                      # ABS_X / ABS_MT_POSITION_X
        1|54) [ "$vhi" = 0 ] && y=$vlo ;;                      # ABS_Y / ABS_MT_POSITION_Y
        57) [ "$vlo" = 65535 ] && [ "$vhi" = 65535 ] && lift=1 ;;   # ABS_MT_TRACKING_ID = -1
      esac
    elif [ "$type" = 1 ] && [ "$code" = 330 ]; then              # BTN_TOUCH
      [ "$vlo" = 1 ] && down=1
      [ "$vlo" = 0 ] && [ "$down" = 1 ] && { down=0; lift=1; }
    fi
    if [ "$lift" = 1 ]; then
      now=$(date +%s)
      # the same lift often arrives twice (BTN_TOUCH and TRACKING_ID): keep one per second per spot
      if [ "$now" != "$lastsec" ] || [ "$x,$y" != "$lastxy" ]; then
        echo "$x $y" >> "$TAPFILE"
        lastsec=$now; lastxy="$x,$y"
      fi
    fi
  done
}

# Map a raw tap to an action and apply it on the server, then redraw.
handle_tap() {
  x=$1; y=$2
  case "$TOUCH_ROTATE" in
    90)  nx=$y; ny=$(( TOUCH_W - x )); x=$nx; y=$ny ;;
    270) nx=$(( TOUCH_H - y )); ny=$x; x=$nx; y=$ny ;;
  esac
  if [ "$y" -lt $(( TOUCH_H / 4 )) ]; then act=auto
  elif [ "$x" -lt $(( TOUCH_W / 2 )) ]; then act=there
  else act=back
  fi
  log "tap $1 $2 -> $act"
  base=${DASH_URL%/dashboard.png}
  if command -v curl >/dev/null 2>&1; then
    curl -s -m 10 -o /dev/null -X POST -d "trip=$act" "$base/toggle" 2>>"$LOG"
  else
    wget -q -T 10 -O /dev/null --post-data "trip=$act" "$base/toggle" 2>>"$LOG"
  fi
  fetch && show
}

# Listen for taps for $1 seconds; every tap extends the window.
listen_for_taps() {
  [ "$1" -le 0 ] && return
  find_touch || { log "no touchscreen device found; tap controls off"; return; }
  : > "$TAPFILE"
  touch_reader &
  rp=$!
  log "listening for taps on $TOUCH_DEV for ${1}s"
  end=$(( $(date +%s) + $1 ))
  while [ "$(date +%s)" -lt "$end" ]; do
    if [ -s "$TAPFILE" ]; then
      read -r tx ty < "$TAPFILE"
      : > "$TAPFILE"
      handle_tap "$tx" "$ty"
      end=$(( $(date +%s) + $1 ))
    fi
    sleep 1
  done
  kill "$rp" 2>/dev/null
  wait "$rp" 2>/dev/null
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
  if in_quiet_hours && [ "$WOKE_EARLY" != 1 ]; then
    wifi_off
    suspend_for "$(secs_until_quiet_end)"
    n=0
    continue
  fi
  button=$WOKE_EARLY; WOKE_EARLY=0
  if wifi_on; then
    if fetch; then
      if [ $((n % FULL_REFRESH_EVERY)) -eq 0 ] || [ "$button" = 1 ]; then show full; else show; fi
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
  # Right after Start, and after every button wake, give the user a moment to tap.
  if [ "$n" = 1 ] || [ "$button" = 1 ]; then listen_for_taps "$TAP_WINDOW"; fi
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
