# Kindle: jailbreak, KOReader, and an e-ink dashboard

Give an old Kindle a second life: a wall-mounted e-ink dashboard (clock,
weather, your GO train route with a little train that creeps toward the
platform, and a frog whose outfit follows the weather) and a reader set up
the way a reading app should feel. Everything renders on
a computer you already own; the Kindle just fetches a PNG and sleeps.

> **Status**: the renderer and server are tested on macOS. The on-device scripts
> are written against documented Kindle interfaces but have not yet run on real
> hardware (first target: a Paperwhite 10th gen). Reports and fixes welcome.

Turns an unused Kindle into a proper reader (KOReader, with your computer's
book folders served to it over Wi-Fi) and an always-on
e-ink dashboard: clock, current conditions, hourly strip, next GO trains,
forecast, battery. Rendered on the Mac, fetched by the Kindle over Wi-Fi,
suspended to RAM between refreshes.

```
docs/jailbreak.md      which jailbreak for which firmware, exact on-device steps
docs/koreader.md       the reader: install, a clean page, OPDS shelf, PDF reflow
books/                 drop EPUBs/PDFs here; the server publishes them to the Kindle
kindle/koreader/fonts  Newsreader (OFL) for KOReader
dashboard/             renderer + HTTP server (Node 22, Playwright, Open-Meteo)
kindle/dashboard/      files that go on the Kindle at /mnt/us/dashboard/
kindle/scriptlets/     .sh files that go in the Kindle's documents folder
```

## 1. Jailbreak

Read [docs/jailbreak.md](docs/jailbreak.md). Short version: fill the storage so
it cannot update, then run SpiderCat (firmware 5.16.3–5.19.5) or Véra (up to
5.19.6) from the Kindle's own browser. Then `;kpm install koreader`.

## 2. Dashboard server (on the Mac)

```bash
cd dashboard && npm install && npx playwright install chromium
```

Copy `dashboard/config.local.example.json` to `dashboard/config.local.json`
and put your own location, station, API key and book folders there (that file
is git-ignored; `config.json` holds the shipped defaults). Keys:

| key | what |
|---|---|
| `device.preset` | your model codename, e.g. `PW4`, `KT5`, `PW5` (sets the pixel size) |
| `device.orientation` | `portrait` or `landscape` (landscape rotates the image 90° for a sideways mount; set `rotate: 270` if it comes out upside down) |
| `location` | name, latitude, longitude, IANA timezone |
| `units.temperature` | `celsius` or `fahrenheit` |
| `clock.show` | `false` to hide the big clock (makes sense for hourly refreshes) |
| `clock.hour12` | `true` for 5:26 pm |
| `transit.from` | the station you leave from, e.g. `OA` (Oakville). `node src/transit.js --stations` lists codes |
| `transit.to` | where you are going, e.g. `UN` (Union). Only trains that run from → to are shown, with arrival time. Leave empty for a plain departure board |
| `transit.direction` | only without `to`: `auto` (outbound at Union, "to Union" elsewhere), `0`, `1` or `all` |
| `transit.lines` | e.g. `["LW","LE"]` to filter; empty = all rail lines |
| `transit.metrolinxKey` | optional: a free Metrolinx Open Data key adds platforms and delays |
| `library.paths` | folders of EPUBs/PDFs published to KOReader as an OPDS catalogue |

Render once to check it:

```bash
cd dashboard && node src/render.js --battery 85
```

The image lands in `dashboard/out/dashboard.png`. Test other devices without
editing config: `node src/render.js --preset KT4 --orientation landscape --out test.png`.

Run the server (keep it running; the Kindle fetches from it):

```bash
cd dashboard && npm run serve
```

It prints the URL the Kindle should use, like `http://192.168.x.x:8080/dashboard.png`,
and a browser preview at `http://localhost:8080/`. Every request re-renders with the
current time and cached weather (refetched every 10 minutes).

### GO trains

Departures come from the public GO GTFS schedule (downloaded once a day,
about 10 MB, no key). With a clock on the page and trains enabled, the
forecast shows 5 days instead of 7 so everything fits. Real-time platforms
and delays need a key from the Metrolinx Open Data API; registration is free
but processed by hand (up to ten business days):
https://api.openmetrolinx.com/OpenDataAPI/Help/Registration/en . Paste it into
`transit.metrolinxKey`. Check what the panel will show for a route:

```bash
cd dashboard && node src/transit.js --from OA --to UN
```

### The frog

A frog sits beside the clock. Sun hat and sunglasses on a clear day, ice
cream when it is hot, a book under cloud, umbrella and hood in rain, toque and
mittens in snow, a lantern in fog, a telescope at night, a flying scarf when it
is windy, leaves or snow on the ground with the season, and a briefcase and a
sweat drop when your train leaves in the next seven minutes. Preview any
outfit without waiting for the weather:

```bash
cd dashboard && node src/render.js --demo snow --out demo.png
```

States: `sunny hot cloudy rain thunder snow fog night windy rush`. Hide it with
`"frog": { "show": false }` in the config.

### The reader's shelf

`npm run serve` also publishes `/opds`, a catalogue of every EPUB and PDF in
the `library.paths` folders. Add it in KOReader under Tools → OPDS catalog and
books download straight to the Kindle. Details in [docs/koreader.md](docs/koreader.md).

## 3. Kindle side

1. Put the Mac's URL in `kindle/dashboard/env.sh` (`DASH_URL`). Set `REFRESH_MINUTES`
   and quiet hours there too.
2. Copy `kindle/dashboard/` to the Kindle root so it becomes `/mnt/us/dashboard/`.
3. Copy the three files in `kindle/scriptlets/` into the Kindle's `documents/` folder.
   They show up in the library as "Dashboard: Start", "Dashboard: Test", "Dashboard: Stop".

   Over USB (10th gen and older): drag and drop. 11th gen and newer use MTP, which macOS
   cannot mount; use OpenMTP, or start KOReader's SSH server and copy with
   `scp -P 2222 -r kindle/dashboard root@<kindle-ip>:/mnt/us/` and
   `scp -P 2222 kindle/scriptlets/*.sh root@<kindle-ip>:/mnt/us/documents/`.
4. Tap **Dashboard: Test** first. It fetches once and shows the image for 20 s without
   touching the Kindle UI. If you see the dashboard, the URL and size are right.
5. Tap **Dashboard: Start**. The Kindle UI stops and the loop takes over.

Getting the normal Kindle back: hold the power button about 7 seconds to reboot
(the dashboard does not start on boot), or `ssh -p 2222 root@<kindle-ip> sh /mnt/us/dashboard/stop.sh`.

## How the loop saves battery

`kindle/dashboard/dash.sh`: stop the UI, set the CPU governor to powersave,
Wi-Fi on → fetch → `eips` the PNG → Wi-Fi off → RTC alarm → suspend to RAM.
During quiet hours (default 23:00–07:00) it suspends straight through. A full
flashing refresh every 6th update clears ghosting. Logs: `/mnt/us/dashboard/logs/dash.log`.

## Credits and licences

- Code: MIT (see LICENSE).
- Jailbreak knowledge: the [KindleModding wiki](https://kindlemodding.org/) and
  the people behind SpiderCat, Véra, Sanctuary and KPM.
- Low-power loop inspired by [pascalw/kindle-dash](https://github.com/pascalw/kindle-dash).
- Weather: [Open-Meteo](https://open-meteo.com/) (CC BY 4.0).
- GO Transit schedules: Metrolinx, Open Government Licence – Ontario.
- Icons adapted from [Lucide](https://lucide.dev/) (ISC).
- Fonts: Fraunces, Inter and Newsreader, all under the SIL Open Font License.
- Reader: [KOReader](https://koreader.rocks/) (AGPL-3.0, installed separately on the device).

## Ideas for later

- "Currently reading" panel from KOReader's statistics database
- Calendar agenda from an ICS URL
- Real-time GO status once the Metrolinx key arrives (already wired, just needs the key)
- Run the renderer on a Raspberry Pi or as a GitHub Actions cron so the Mac can sleep
  (needs an HTTPS-capable fetch on the Kindle: KOReader ships a modern curl)
