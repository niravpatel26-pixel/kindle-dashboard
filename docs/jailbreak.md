# Jailbreaking the Kindle

Status as of 10 November 2026. Jailbreaks get patched by Amazon in later firmware,
so always confirm against the official wizard right before you start:
https://kindlemodding.org/jailbreak-wizard.html

## Worked example: a Paperwhite 10th gen on 5.18.1.1.1

| | |
|---|---|
| Model | Kindle Paperwhite 10th generation (2018), codename **PW4** |
| Screen | 1072 × 1448, 300 ppi |
| Firmware | **5.18.1.1.1** |
| Storage | USB mass storage (mounts as a drive on the Mac, no MTP) |
| Jailbreak | **SpiderCat**. Verified against the official wizard's data (jailbreaks.json, 10 Nov 2026): for PW4 on 5.18.1.1.1 it returns SpiderCat first, then Sanctuary (5.16.4–5.18.3) and SpringBreak (5.18.1–5.18.1.1.1, registered devices only) as alternatives. WinterBreak stops at 5.18.0.2; Véra does not list PW4. |

### Do this now, in this order

1. **Airplane mode on.** A registered Kindle with Wi-Fi on and gigabytes free is exactly
   the state where an overnight update to 5.19/5.20 closes the window.
2. Plug the Kindle into the Mac. When it mounts at `/Volumes/Kindle`, run from this repo:
   ```
   sh tools/fill-kindle.sh
   ```
   It deletes any pending `update*.bin`, then fills the drive to ~70 MB free.
3. Eject. Device Info should now show well under 90 MB available.
4. Wi-Fi back on, make sure it actually connects (open any web page in the browser).
5. Run **SpiderCat** (section below): browser → `https://kindlemodding.org/spidercat`
   → Download → open the "SpiderCat" book from the library → wait for "Restarting GUI".
6. After it comes back: `;kpm update` then `;kpm install koreader` in the search box.
7. Delete `fill_disk` from the Kindle root (updates are blocked by the jailbreak now).

## Step 0: find out what you have

On the Kindle: **three-dot menu → Settings → Device Options → Device Info**.
Write down:

- **Serial number** (first 8 characters identify the model)
- **Firmware version** (e.g. `5.17.1.0.4`)
- Whether it is **registered** to an Amazon account
- Whether the lock screen shows **ads** or book covers

Model → screen size (you need the screen size for the dashboard; the wizard tells you the model from the serial):

| Model | Codename | Screen (px) |
|---|---|---|
| Kindle Touch (2011) | KT | 600×800 |
| Kindle 7th gen basic (2014) | KT2 | 600×800 |
| Kindle 8th gen basic (2016) | KT3 | 600×800 |
| Kindle 10th gen basic (2019) | KT4 | 600×800 |
| Kindle 11th gen (2022) | KT5 | 1072×1448 |
| Kindle 11th gen (2024) | KT6 | 1072×1448 |
| Paperwhite 1 (2012) | PW1 | 758×1024 |
| Paperwhite 2 (2013) | PW2 | 758×1024 |
| Paperwhite 3 (2015) | PW3 | 1072×1448 |
| Paperwhite 4 (2018) | PW4 | 1072×1448 |
| Paperwhite 5 (2021) | PW5 | 1236×1648 |
| Paperwhite 6 (2024) | PW6 | 1236×1648 |
| Voyage (2014) | KV | 1072×1448 |
| Oasis 1 (2016) | KOA1 | 1072×1448 |
| Oasis 2 (2017) | KOA2 | 1264×1680 |
| Oasis 3 (2019) | KOA3 | 1264×1680 |
| Scribe (2022 / 2024) | KS1 / KS2 | 1860×2480 |
| Colorsoft (2024) | CS | 1264×1680 |

## Step 1: stop it from updating (do this first, before anything else)

Amazon pushes updates whenever the Kindle touches Wi-Fi, and an update can close
the jailbreak window. Fill the storage so an update has nowhere to land.

1. Turn on **Airplane mode**.
2. Delete any file named `update*.bin` or `update.bin.tmp.partial` from the Kindle root.
3. Fill the drive until only **50–90 MB** is free:
   - USB-mass-storage Kindles (10th gen and older): plug in, copy the filler script
     from https://github.com/bastianmarin/Kindle-Filler-Disk to the root and run it
     (`chmod +x Filler.sh && ./Filler.sh` from the Kindle volume).
   - 11th gen and newer (MTP, no drive letter): copy the pre-made filler files from
     https://github.com/Crosunt223/Kindle-Filler-Disk (the `MTP` folder) to the root.
     macOS has no native MTP, so use OpenMTP (free) to copy them.
4. Check Device Info shows ~50–90 MB free.
5. Only now turn Wi-Fi back on.

Delete the filler **after** the jailbreak reports that updates are blocked.

## Step 2: pick the jailbreak

All three current methods run entirely on the Kindle through its web browser.
No computer, no cable.

| Your firmware | Method | Supported models |
|---|---|---|
| 5.17.1 → **5.19.6** (latest) | **Véra** | KT6, PW6, Colorsoft, Scribe 1 & 2 up to 5.19.6; KT5, PW5 only up to 5.19.2 |
| 5.16.3 → 5.19.5 | **SpiderCat** | KOA3, KT4, PW4, KT5, PW5, KT6, PW6, CS, KS1, KS2 |
| 5.16.4 → 5.18.3 | **Sanctuary** | any model in range, works on blacklisted devices |
| ≤ 5.18.0 | WinterBreak | older models, see wiki |
| ≤ 5.16.2.1.1 | LanguageBreak | older models |
| 7th gen and older | Legacy methods (serial cable or older exploits) | KT2, PW1, PW2, KV: see "Legacy" on the wiki |

Rule of thumb: if the firmware is 5.19.6 use Véra; if 5.16.3–5.19.5 use SpiderCat
(simplest); if older, WinterBreak or legacy. **5.20.x has no public jailbreak yet.**

### SpiderCat (easiest, 5.16.3 – 5.19.5)

1. Keep Wi-Fi **on** and connected the whole time.
2. Open the Kindle web browser (three-dot menu → Web Browser).
3. Go to `https://kindlemodding.org/spidercat` and tap **Download SpiderCat**.
4. Close the browser, open the library, tap the book called **SpiderCat**.
5. Blank page for a few seconds, then text scrolls. Ignore "application error" pop-ups.
6. Wait for **Restarting GUI**. Screen may stay white for a few minutes. Done.

### Véra (5.17.1 – 5.19.6)

1. Wi-Fi on. Browser → `https://kindlemodding.org/vera`.
2. Pick your model and firmware from the dropdowns. Download **both** books:
   the *Font Calibration* book and the device-specific *Véra* book. Close the browser with X.
3. Open **Font Calibration**, tap the top of the page, tap **Aa**:
   Font = Bookerly, Bold = 0, Size = maximum, Line spacing = 2 (or "medium"). Save as a theme.
4. Exit the book (tap top-left corner three times).
5. Open the **Véra** book. Text flows, then **RESTARTING GUI**. Delete both books afterwards.

### Sanctuary (5.16.4 – 5.18.3)

1. Wi-Fi on. Browser → `http://sanctuary.skyvincent.com/` (must be **http**).
2. Run the compatibility check at `/scroll`, then the port scan (up to 20 min).
3. Enter the device ID, Connect, wait for **Downloads Done**.
4. Close the browser. Settings → Help → Getting Started launches the jailbreak.

## Step 3: after the jailbreak

Modern jailbreaks install:
- **update blocking** (OTA disabled; you can delete the filler files now)
- **KPM**, a package manager driven from the home-screen search box
- **scriptlets**: any `.sh` file in the `documents` folder shows up as a book in the
  library and runs when tapped (this is how the dashboard launches; KUAL is obsolete)

Install KOReader (type these into the search box on the home screen, Wi-Fi on):

```
;kpm update
;kpm install koreader
```

Launch it with `;kpm launch koreader` or by tapping the KOReader scriptlet.

## Things not to do

- Do **not** factory reset a jailbroken Kindle on a whim. Removal is a three-step
  procedure on the wiki (removal scriptlet → factory reset → push a firmware .bin).
- Do not delete unfamiliar `.bin` files after the jailbreak; part of the toolkit lives there.
- Do not open the Kindle Store before updates are blocked.

## Sources

- KindleModding wiki index: https://kindlemodding.org/jailbreaking/
- Wizard: https://kindlemodding.org/jailbreak-wizard.html
- Prevent updates: https://kindlemodding.org/jailbreaking/prevent-auto-update/
- Véra: https://kindlemodding.org/jailbreaking/Vera/
- SpiderCat: https://kindlemodding.org/jailbreaking/SpiderCat/
- KOReader via KPM: https://kindlemodding.org/jailbreaking/whats-next/getting-koreader/
- Scriptlets: https://kindlemodding.org/kindle-dev/scriptlets.html
- Véra model table: https://blog.the-ebook-reader.com/2026/08/14/how-to-jailbreak-kindles-and-install-koreader-using-vera-video/
- SpiderCat write-ups: https://en.bookfere.com/post/kindle-spidercat-jailbreak.html , https://terminalbytes.com/spidercat-kindle-jailbreak-2026/
- Sanctuary write-up: https://terminalbytes.com/sanctuary-kindle-jailbreak-koreader-2026/
