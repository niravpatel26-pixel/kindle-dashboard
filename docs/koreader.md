# KOReader: the reader

The goal is a quiet page on e-ink: your PDFs and EPUBs reflowed into type
you choose, wide margins, nothing on screen but the text. KOReader is the
engine that does this on the Kindle. It reflows PDFs on-device, renders EPUBs
with real typography, and has highlights, notes, dictionaries and a plugin
system. We don't rebuild the reader; we set it up to look right and give it
a shelf.

## Install (after the jailbreak)

On the Kindle home screen, with Wi-Fi on, type into the search box:

```
;kpm update
;kpm install koreader
```

Launch with `;kpm launch koreader` or tap the KOReader entry in the library.

## The shelf: your Mac's books, over Wi-Fi

The dashboard server also publishes an OPDS catalogue of the folders listed
under `library.paths` (default: the `books/` folder in this repo; add your own
folders in `dashboard/config.local.json`). Drop any EPUB or PDF into one of
those folders and it appears on the Kindle.

On the Kindle, in KOReader: **Tools → OPDS catalog → + (add)**, name it
"Mac library", URL `http://<mac-ip>:8080/opds` (the server prints the exact
URL when it starts). Open the catalogue, tap a book, it downloads to the
Kindle. Project Gutenberg and Standard Ebooks are already in KOReader's OPDS
list for the classics.

## A clean page

1. **Fonts**: copy `kindle/koreader/fonts/` into `koreader/fonts/` on the
   Kindle (USB, or `scp -P 2222 -r kindle/koreader/fonts/* root@<kindle-ip>:/mnt/us/koreader/fonts/`).
   That gives KOReader **Newsreader**, a book serif under the SIL Open Font
   License. Then in any EPUB: tap the top, **Aa → Font → Newsreader**.
2. **Page**: in the same **Aa** menu set margins wide (left/right ~ 25–30,
   top/bottom ~ 20), line spacing 110–115%, font size to taste (Newsreader reads
   well at 24–26 on this 300 ppi screen), justification on, hyphenation on.
   Tap **Save as default** so every book opens this way.
3. **Nothing but the page**: **Settings → Status bar**: turn everything off
   except the progress bar, or hide it entirely (tap the bottom edge toggles it).
   **Settings → Screen → E-ink refresh**: full refresh every 6 pages.
4. **PDFs that reflow**: open a PDF, tap the top, **Reflow →
   on**. KOReader runs k2pdfopt on-device: it re-wraps the PDF's columns into
   screen-width text. Set zoom and margins once; it remembers per document.
   For scanned PDFs leave reflow off and use **Page crop → auto**.
5. **Gestures**: **Settings → Taps and gestures**: left/right halves turn pages,
   two-finger swipe down toggles the frontlight, long-press a word for the
   dictionary (download one under **Tools → Dictionary**), highlight by
   long-press and drag. Highlights and notes export as text from the book's
   **Bookmarks** menu.

## Also worth turning on

- **SSH server** (Tools → SSH server → Start): `ssh -p 2222 root@<kindle-ip>`,
  no password by default. Easiest way to copy the dashboard files and to run
  `stop.sh` without rebooting.
- **Calibre wireless** if you keep a Calibre library: Tools → Calibre → start
  wireless connection, then connect from Calibre on the Mac.
- **Reading statistics** (Tools → Reading statistics): pages, time, books. Its
  database could feed a "currently reading" panel on the dashboard later.
