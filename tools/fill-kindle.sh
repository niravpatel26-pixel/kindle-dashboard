#!/bin/sh
# Fill the Kindle's USB drive so an Amazon update has nowhere to land.
# Leaves ~70 MB free. Run on the Mac with the Kindle plugged in and in airplane mode.
# Usage: sh tools/fill-kindle.sh [/Volumes/Kindle] [free_mb_to_leave]
set -e
VOL="${1:-/Volumes/Kindle}"
LEAVE_MB="${2:-70}"
if [ ! -d "$VOL" ]; then
  echo "Kindle not found at $VOL. Plug it in over USB and wait for it to mount."; exit 1
fi
for f in "$VOL"/update*.bin "$VOL"/update.bin.tmp.partial; do
  [ -e "$f" ] && { echo "Deleting pending update file: $f"; rm -f "$f"; }
done
mkdir -p "$VOL/fill_disk"
free_mb() { df -m "$VOL" | awk 'NR==2 {print $4}'; }
i=0
echo "Free before: $(free_mb) MB"
# Big chunks first (FAT32 max is 4 GB per file), then 100 MB, then 10 MB steps.
for size in 1000 100 10; do
  while [ "$(free_mb)" -gt $((LEAVE_MB + size)) ]; do
    i=$((i + 1))
    dd if=/dev/zero of="$VOL/fill_disk/fill_$i.bin" bs=1m count="$size" status=none
  done
done
sync
echo "Free after: $(free_mb) MB (target ~${LEAVE_MB} MB). Files are in $VOL/fill_disk/"
echo "Eject the Kindle, check Device Info shows under ~90 MB free, then turn Wi-Fi back on and jailbreak."
echo "After the jailbreak says updates are blocked, delete the fill_disk folder."
