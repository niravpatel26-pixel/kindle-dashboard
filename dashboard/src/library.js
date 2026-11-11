// A tiny OPDS catalogue of the books on the Mac, so KOReader on the Kindle can
// browse and download them over Wi-Fi (Tools → OPDS catalog → add the URL).
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.epub': 'application/epub+zip',
  '.pdf': 'application/pdf',
  '.mobi': 'application/x-mobipocket-ebook',
  '.azw3': 'application/x-mobi8-ebook',
  '.fb2': 'application/fb2+xml',
  '.cbz': 'application/vnd.comicbook+zip',
  '.txt': 'text/plain',
  '.html': 'text/html',
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Scan each configured folder (one level deep) for readable files.
export function scanLibrary(roots) {
  const books = [];
  roots.forEach((root, ri) => {
    if (!fs.existsSync(root)) return;
    const walk = (dir, depth) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name.startsWith('.')) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) { if (depth < 1) walk(full, depth + 1); continue; }
        const ext = path.extname(ent.name).toLowerCase();
        if (!TYPES[ext]) continue;
        const st = fs.statSync(full);
        books.push({
          id: `${ri}/${path.relative(root, full)}`,
          title: path.basename(ent.name, ext),
          file: full,
          type: TYPES[ext],
          ext,
          size: st.size,
          mtime: st.mtime,
        });
      }
    };
    try { walk(root, 0); } catch (e) { console.error(`library: cannot read ${root}: ${e.message}`); }
  });
  books.sort((a, b) => b.mtime - a.mtime);
  return books;
}

// Resolve a book id back to a file, refusing anything outside the roots.
export function resolveBook(roots, id) {
  const m = /^(\d+)\/(.+)$/.exec(id);
  if (!m) return null;
  const root = roots[Number(m[1])];
  if (!root) return null;
  const full = path.resolve(root, m[2]);
  if (!full.startsWith(path.resolve(root) + path.sep)) return null;
  if (!fs.existsSync(full) || !TYPES[path.extname(full).toLowerCase()]) return null;
  return { file: full, type: TYPES[path.extname(full).toLowerCase()] };
}

export function opdsFeed(books, { title, baseUrl }) {
  const now = new Date().toISOString();
  const entries = books.map((b) => `
  <entry>
    <title>${esc(b.title)}</title>
    <id>urn:kindle-library:${esc(b.id)}</id>
    <updated>${b.mtime.toISOString()}</updated>
    <dc:format>${esc(b.type)}</dc:format>
    <content type="text">${esc(b.ext.slice(1).toUpperCase())} · ${(b.size / 1048576).toFixed(1)} MB</content>
    <link rel="http://opds-spec.org/acquisition" type="${esc(b.type)}" href="${baseUrl}/books/${encodeURIComponent(b.id)}"/>
  </entry>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/terms/" xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>urn:kindle-library:root</id>
  <title>${esc(title)}</title>
  <updated>${now}</updated>
  <author><name>Kindle dashboard</name></author>
  <link rel="self" href="${baseUrl}/opds" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <link rel="start" href="${baseUrl}/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>${entries}
</feed>`;
}
