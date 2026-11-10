# Kindle dashboard settings. Plain POSIX sh, sourced by dash.sh.

# Where the dashboard server is. Plain http on your LAN (the Kindle's built-in
# curl is too old for modern TLS). The loop appends ?battery=NN itself.
DASH_URL="http://192.168.1.10:8080/dashboard.png"

# Minutes between refreshes during the day. Every refresh = ~20-40 s of Wi-Fi.
# 10 min ≈ a week or two of battery; 60 min ≈ a month.
REFRESH_MINUTES=10

# Quiet hours (24h clock): no Wi-Fi, no refresh, last image stays on screen.
# Set QUIET_START=-1 to disable.
QUIET_START=23
QUIET_END=7

# Do a full flashing refresh every N updates to clear e-ink ghosting.
FULL_REFRESH_EVERY=6

# Seconds to wait for Wi-Fi to connect before giving up for this cycle.
WIFI_TIMEOUT=45

# 1 = leave Wi-Fi on between refreshes (worse battery, lets SSH reach the Kindle).
WIFI_ALWAYS_ON=0

# 1 = plain sleep instead of suspend-to-RAM (use while testing over SSH).
DEBUG=0
