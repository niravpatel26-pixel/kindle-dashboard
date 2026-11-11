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

# The server's host, for a reachability ping (lipc can be slow to report after resume).
SERVER_HOST=$(echo "$DASH_URL" | sed -n 's#^[a-z]*://\([^/:]*\).*#\1#p')

wifi_on() {
  # both properties, as KOReader does: the first turns the radio on, the second
  # tells the Wi-Fi daemon to reconnect (needed after a resume)
  lipc-set-prop com.lab126.cmd wirelessEnable 1 >/dev/null 2>&1
  lipc-set-prop com.lab126.wifid enable 1 >/dev/null 2>&1
  wifi_wait && return 0
  # After a resume the daemon sometimes sits in a dead state until the radio is
  # cycled, so one more try, off and on, before giving up on this cycle.
  log "wifi: no link after ${WIFI_TIMEOUT}s (state $(lipc-get-prop com.lab126.wifid cmState 2>/dev/null)), cycling the radio"
  lipc-set-prop com.lab126.wifid enable 0 >/dev/null 2>&1
  lipc-set-prop com.lab126.cmd wirelessEnable 0 >/dev/null 2>&1
  sleep 3
  lipc-set-prop com.lab126.cmd wirelessEnable 1 >/dev/null 2>&1
  lipc-set-prop com.lab126.wifid enable 1 >/dev/null 2>&1
  wifi_wait && return 0
  log "wifi state: $(lipc-get-prop com.lab126.wifid cmState 2>/dev/null)"
  return 1
}

wifi_wait() {
  i=0
  while [ "$i" -lt "$WIFI_TIMEOUT" ]; do
    [ "$(lipc-get-prop com.lab126.wifid cmState 2>/dev/null)" = "CONNECTED" ] && return 0
    [ -n "$SERVER_HOST" ] && ping -c 1 -W 1 "$SERVER_HOST" >/dev/null 2>&1 && return 0
    sleep 1
    i=$((i + 1))
  done
  return 1
}

wifi_off() {
  [ "$WIFI_ALWAYS_ON" = "1" ] && return 0
  lipc-set-prop com.lab126.wifid enable 0 >/dev/null 2>&1
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

# Sleep until the next refresh. Three methods, tried in order under "auto":
#   powerd  the Kindle's own power manager suspends and arms the RTC (what
#           KOReader does on every modern Kindle)
#   sysfs   the kernel's RTC alarm file plus /sys/power/state
#   sleep   stay awake (last resort, costs battery)
# Each method sets SUSPENDED=1 only when the clock jumped while the script was
# frozen, i.e. the device really slept. A short real sleep means the power
# button woke us (WOKE_EARLY=1: refresh now and listen for taps); a method
# that returned without sleeping is a failure, and we wait out the interval
# awake rather than spinning.
SUSPENDED=0
suspend_for() {
  secs=$1
  [ "$secs" -lt 20 ] && secs=20
  if [ "$DEBUG" = "1" ]; then log "debug sleep ${secs}s"; sleep "$secs"; return; fi
  # Cap a single suspend under an hour: longer ones can turn into hibernation
  # on newer Kindles, which is slow to resume. The loop just goes back to sleep.
  [ "$secs" -gt 3300 ] && secs=3300
  log "suspend ${secs}s (method $SUSPEND_METHOD)"
  sync
  SUSPENDED=0
  t0=$(date +%s)
  if [ "$SUSPEND_METHOD" = "sleep" ]; then sleep "$secs"; return; fi
  if [ "$SUSPEND_METHOD" != "sysfs" ] && command -v lipc-set-prop >/dev/null 2>&1; then
    suspend_via_powerd "$secs"
  fi
  if [ "$SUSPENDED" = 0 ] && [ "$SUSPEND_METHOD" != "powerd" ]; then
    suspend_via_sysfs "$secs"
  fi
  el=$(( $(date +%s) - t0 ))
  if [ "$SUSPENDED" = 0 ]; then
    rem=$(( secs - el )); [ "$rem" -lt 0 ] && rem=0
    log "did not suspend; waiting ${rem}s awake"
    [ "$rem" -gt 0 ] && sleep "$rem"
  elif [ "$el" -lt $(( secs - 5 )) ]; then
    log "woke early after ${el}s (button or USB)"
    WOKE_EARLY=1
  fi
}

# powerd: a simulated power-button press puts it into "readyToSuspend" for
# about ten seconds; the RTC alarm may only be set during that window, in
# seconds from now; powerd then suspends and the script is frozen until resume.
suspend_via_powerd() {
  secs=$1
  # The hold we keep while awake would stop powerd from honouring the press.
  lipc-set-prop com.lab126.powerd preventScreenSaver 0 >/dev/null 2>&1
  if ! lipc-set-prop com.lab126.powerd powerButton 1 >>"$LOG" 2>&1; then
    log "powerd: powerButton refused"
    lipc-set-prop com.lab126.powerd preventScreenSaver 1 >/dev/null 2>&1
    return 1
  fi
  i=0
  while [ "$i" -lt 15 ]; do
    [ "$(lipc-get-prop com.lab126.powerd state 2>/dev/null)" = "readyToSuspend" ] && break
    sleep 1; i=$((i + 1))
  done
  if ! lipc-set-prop com.lab126.powerd rtcWakeup "$secs" >>"$LOG" 2>&1; then
    log "powerd: rtcWakeup refused (state $(lipc-get-prop com.lab126.powerd state 2>/dev/null))"
    lipc-set-prop com.lab126.powerd preventScreenSaver 1 >/dev/null 2>&1
    return 1
  fi
  ts=$(date +%s); iters=0
  while :; do
    sleep 5; iters=$((iters + 1))
    el=$(( $(date +%s) - ts ))
    if [ "$el" -gt $(( iters * 5 + 10 )) ]; then SUSPENDED=1; break; fi   # time jumped: we were asleep
    [ "$el" -ge "$secs" ] && break
    if [ "$iters" -ge 9 ]; then
      log "powerd: did not suspend within 45s (state $(lipc-get-prop com.lab126.powerd state 2>/dev/null))"
      lipc-set-prop com.lab126.powerd preventScreenSaver 1 >/dev/null 2>&1
      return 1
    fi
  done
  # Awake again: hold powerd off until the next cycle's own press, or it may
  # put the device straight back to sleep before the fetch is done.
  lipc-set-prop com.lab126.powerd preventScreenSaver 1 >/dev/null 2>&1
  [ "$SUSPENDED" = 1 ] && log "slept ${el}s via powerd (state $(lipc-get-prop com.lab126.powerd state 2>/dev/null))"
  return 0
}

suspend_via_sysfs() {
  secs=$1
  t1=$(date +%s)
  # Kindles carry more than one RTC; only the one marked wakeup-capable can
  # bring the device back, so prefer it over rtc0.
  rtc=""
  for d in /sys/class/rtc/rtc*; do
    [ -w "$d/wakealarm" ] || continue
    [ -z "$rtc" ] && rtc=$d
    [ "$(cat "$d/device/power/wakeup" 2>/dev/null)" = "enabled" ] && { rtc=$d; break; }
  done
  if [ -n "$rtc" ]; then
    echo 0 > "$rtc/wakealarm" 2>/dev/null
    rtcnow=$(cat "$rtc/since_epoch" 2>/dev/null); [ -z "$rtcnow" ] && rtcnow=$t1
    if echo $(( rtcnow + secs )) > "$rtc/wakealarm" 2>>"$LOG" && [ "$(cat "$rtc/wakealarm" 2>/dev/null)" -gt 0 ] 2>/dev/null; then
      log "sysfs: alarm on ${rtc##*/}"
      echo mem > /sys/power/state 2>>"$LOG"
    else
      log "sysfs: could not arm ${rtc##*/} alarm"; return 1
    fi
  elif [ -w /sys/devices/platform/mxc_rtc.0/wakeup_enable ]; then
    if echo -n "$secs" > /sys/devices/platform/mxc_rtc.0/wakeup_enable 2>>"$LOG"; then
      echo mem > /sys/power/state 2>>"$LOG"
    else
      log "sysfs: could not arm mxc_rtc alarm"; return 1
    fi
  elif command -v rtcwake >/dev/null 2>&1; then
    rtcwake -m mem -s "$secs" >>"$LOG" 2>&1
  else
    log "sysfs: no RTC interface found"; return 1
  fi
  # "echo mem" only returns after resume; a near-instant return means it failed
  [ $(( $(date +%s) - t1 )) -ge 10 ] && SUSPENDED=1
  return 0
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
  for d in /dev/input/event2 /dev/input/event1; do [ -e "$d" ] && { TOUCH_DEV=$d; return 0; }; done
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
  # upstart on firmware 5.x; the older forms are for the sake of old models
  stop framework >>"$LOG" 2>&1 || initctl stop framework >>"$LOG" 2>&1 || /etc/init.d/framework stop >>"$LOG" 2>&1
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
