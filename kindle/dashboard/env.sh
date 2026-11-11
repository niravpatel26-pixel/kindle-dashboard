# Kindle dashboard settings. Plain POSIX sh, sourced by dash.sh.

# Where the dashboard server is. Plain http on your LAN (the Kindle's built-in
# curl is too old for modern TLS). The loop appends ?battery=NN itself.
DASH_URL="http://192.168.1.10:8080/dashboard.png"

# Minutes between refreshes during the day (whole number). Every refresh =
# ~20-40 s of Wi-Fi. 10 min ≈ a week or two of battery; 60 min ≈ a month.
# After three failed fetches in a row the loop waits three times as long.
REFRESH_MINUTES=10

# Quiet hours (24h clock): no Wi-Fi, no refresh, last image stays on screen.
# Set QUIET_START=-1 to disable.
QUIET_START=23
QUIET_END=7

# The loop's clock. The Kindle's shell usually runs in UTC, so give it your
# zone as a POSIX TZ string (works without zoneinfo files). Toronto/Eastern:
#   EST5EDT,M3.2.0,M11.1.0     Pacific: PST8PDT,M3.2.0,M11.1.0
#   Central: CST6CDT,M3.2.0,M11.1.0   UK: GMT0BST,M3.5.0/1,M10.5.0   CET: CET-1CEST,M3.5.0,M10.5.0/3
TZ_SPEC="EST5EDT,M3.2.0,M11.1.0"

# 1 = let the server shorten the wait while a train is close (2 min within
# 15 min of departure, 5 min within 45, else REFRESH_MINUTES). 0 = fixed.
ADAPTIVE=1

# Do a full flashing refresh every N updates to clear e-ink ghosting.
FULL_REFRESH_EVERY=6

# Seconds to wait for Wi-Fi to connect before giving up for this cycle.
WIFI_TIMEOUT=45

# Seconds to wait for the server to answer. Keep above the server's render time.
FETCH_TIMEOUT=90

# 1 = leave Wi-Fi on between refreshes (worse battery, lets SSH reach the Kindle).
WIFI_ALWAYS_ON=0

# Tap controls. A sleeping Kindle cannot be woken by touch, so: press the
# power button, then tap within TAP_WINDOW seconds (each tap extends it).
#   left half  = Going      right half = Returning      top band = Auto
# Every tap also refreshes the board at once. The loop also listens right
# after Dashboard: Start. Set TAP_WINDOW=0 to turn tap controls off.
TAP_WINDOW=25
# Touch panel size in its own units (PW3/PW4/KT5: same as the screen) and
# how the panel is turned relative to the page: 0 for an upright Kindle,
# 90 or 270 for a sideways mount. Raw taps are written to logs/dash.log,
# so if the zones feel wrong, read the numbers there and adjust these.
TOUCH_W=1072
TOUCH_H=1448
TOUCH_ROTATE=0
# Leave empty to find the touchscreen automatically. Paperwhite 4 (Wi-Fi):
# /dev/input/event2; most older models: /dev/input/event1.
TOUCH_DEV=""

# How to sleep between refreshes. "auto" tries, in order: the Kindle's own
# power manager (what KOReader uses: powerd suspends and sets the RTC alarm),
# then the kernel's RTC alarm files, then plain sleep. Force one for testing:
# powerd | sysfs | sleep.
SUSPEND_METHOD=auto

# 1 = plain sleep instead of suspend-to-RAM (use while testing over SSH).
DEBUG=0
