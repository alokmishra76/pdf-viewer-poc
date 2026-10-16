# PDF Viewer POC (front end)

A React + TypeScript app that opens medical-record PDFs up to **1 GB** in a modal (document list on the left, preview on the right) without freezing the browser, using **Apryse WebViewer**.

It works with the **pdf-mock-server** project, whose API returns each PDF in one response (no streaming protocol). All the optimization happens in the browser.

---

## 1. Start the mock server first

In the `pdf-mock-server` folder (see its README):

```bash
npm install
npm run generate
npm start
```

Leave it running on port 4000.

## 2. Set up this project

You need **Node.js 20.19 or newer** (Vite 7 requires it). Check with `node -v`.

```bash
npm install
```

This also copies Apryse WebViewer's runtime files (about 175 MB) into `public/lib/webviewer`. That happens automatically after every `npm install`.

Create your settings file:

```bash
# macOS / Linux / Git Bash
cp .env.example .env

# Windows Command Prompt
copy .env.example .env
```

## 3. Run it

```bash
npm run dev
```

Open <http://localhost:5173>. The start screen checks three things before you open the modal:

- **Mock API server:** reachable through the proxy
- **Disk storage (OPFS):** the browser can save files
- **Local file server (service worker):** active

All three should show a green dot. Then click **Review chase documents**.

---

## How the CORS error is solved

The app never calls `http://localhost:4000` directly. It calls **its own origin**, for example `http://localhost:5173/api/documents`, and the Vite dev server forwards the request to the mock server behind the scenes (see `vite.config.ts`).

CORS is a browser rule about one origin calling another. Here the browser only ever talks to one origin, so a CORS error cannot happen, whatever port the app runs on. Server-to-server forwarding isn't subject to CORS.

The same idea works outside Vite:

- **Angular dev server:** add a `proxy.conf.json` that routes `/api` to `http://localhost:4000`, and start with `ng serve --proxy-config proxy.conf.json`.
- **Production:** serve the app and the API under the same domain, with a reverse proxy (nginx, a load balancer, API gateway) routing `/api` to the backend.

If the API server goes down, you get a clear message in the app ("The API server is not running…") instead of a CORS error.

---

## How it works

When you click a document:

1. **Cancel the previous download,** if any. Only one download runs at a time.
2. **Check the disk cache.** If the file is already saved on this device, go to step 5.
3. **Make room.** If the cache would exceed its limit (`VITE_CACHE_LIMIT_MB`, default 3 GB), remove the least recently opened documents first.
4. **Download to disk.** A web worker fetches the PDF and writes each chunk straight into the browser's private disk storage (OPFS) as it arrives. The file is never held in memory, and the page stays responsive. The preview shows progress, speed and time left. If no data arrives for 20 seconds, the download fails with a clear error instead of hanging.
5. **Open it.** The app reads the first kilobyte of the file to check whether it is **web-optimized (linearized)**:
   - **Web-optimized:** Apryse opens it through a local URL served by a service worker (`public/pdf-cache-sw.js`). The service worker answers byte-range requests from the file on disk, so Apryse reads only what the visible pages need.
   - **Not web-optimized:** Apryse can't read it in pieces, so the app hands it the whole file directly (about twice as fast as the range path for these files).

The Apryse viewer is created once and reused for every document, because starting it is the slowest step. Closing the modal keeps it (and any running download) alive, so reopening is instant.

### Why "web-optimized" matters

Measured in Chrome with Apryse 12, opening the 1 GB test packet already saved on the device:

| | Opens in | Data read to open | Browser memory |
|---|---|---|---|
| Web-optimized (`DOC-1006`) | about 1 s (0.2–0.3 s when reopened) | 35–110 MB | stays low (~0.4–0.9 GB, most of it Apryse itself) |
| Not web-optimized (`DOC-1007`) | 4–17 s | the whole 1 GB | up to ~1.6 GB |

The status line under the document title says which case applies. **The one backend change worth asking for** is to linearize PDFs once when they are stored. It doesn't change the API. The mock server's README explains how (`npm run linearize`).

---

## Page editing

When a document is open, the bar above the viewer has **Edit pages** and **Find blank pages**. In edit mode, the toolbar shows the current page's position and where it came from ("Originally page 400", "Copy of page 12", "Inserted blank page"), and acts on the current page:

| Action | What it does |
|---|---|
| **Rotate left / Rotate right** | Turns the page by 90°, e.g. a page scanned sideways |
| **Duplicate** | Inserts a copy of the page right after it |
| **Delete** | Removes the page |
| **Move to** (page number) | Moves the page to that position, e.g. page 400 to position 2 |
| **Swap with** (page number) | Swaps the page with the page at that position |
| **Blank page: Before / After** | Inserts an empty page the same size and orientation as this one |
| **Find blank pages** | Lists likely blank pages to confirm and delete (inserted blank pages are not suggested) |
| **Undo / Redo** | Steps back and forward through changes (up to 100) |

**Save changes** sends the finished page order to the server, which saves a new version. **Discard** throws the changes away. Leaving the document with unsaved changes asks first.

### How it works

1. **Edit mode loads the whole file.** Apryse can only change pages of a fully loaded document, so **Edit pages** reopens the saved copy from disk in one piece (a few seconds for 1 GB; memory stayed around 0.5–0.6 GB in testing). Normal viewing stays page by page.
2. **The editor's state is a page list.** Each page is a reference to a page of the file on disk, or a blank page, plus its rotation (`src/lib/pageList.ts`). Every action, and undo and redo, produces a new list, and `applyPageList` changes the viewer to match with the fewest Apryse operations: add new pages, remove deleted ones in one call, move only the pages that are out of order, then fix rotations.
3. **Copies and restored pages** are copied from a page already in the document when possible (under a second). Restoring a page that is no longer in the document (e.g. undoing a delete) opens the file on disk once as a "page library" (about 6 s for 1 GB; memory stays flat).
4. **Saving sends only the page order**, e.g. `{"baseVersion": 3, "pages": [{"page": 1}, {"page": 400}, {"from": 2, "to": 399}, {"blank": {"width": 612, "height": 792}}, …]}`, a few kilobytes, never the PDF. The server builds the new version.
5. **Conflicts are caught.** If someone else saved a newer version first, the server refuses and the app offers **Load latest version**.
6. **No re-download after saving.** The cache records the new version as "the file already on this device + the saved page lists" and rebuilds it when opening. Other users download the new version once, as usual.

Measured on the 1 GB, 3,093-page test document: moving, swapping, inserting a blank page, duplicating and undo each took 0.5–0.9 s; saving took 8–16 s on the server; reopening the saved version without a download took about 9 s.

### Blank-page detection

Each page is drawn as a small thumbnail and the app measures its "ink": the share of pixels clearly darker than paper, ignoring the outer margins where fax headers and footers sit. Pages under 0.5% ink are suggested. In testing, blank scans measured 0.00% and normal pages 22–29%. The threshold is `BLANK_PAGE_INK_THRESHOLD` in `src/lib/pageEdits.ts`.

It checks about 20 pages per second, so a 3,000-page document takes around 2.5 minutes. **Stop** keeps what was found so far. For production, run the same check on the server when a document is first stored, so suggestions are ready the moment it opens.

### Apryse license

Page rotation and deletion use Apryse's page manipulation API. The trial includes everything; check that your production license covers page manipulation. Apryse's own rotate and delete controls in its thumbnail panel are switched off so every change goes through the tracked toolbar.

---

## Suggested demo flow

1. Start screen: all three checks green.
2. Open the modal. Set **Simulated network** to "Office network (100 Mbps)".
3. Open **Complete Chart Packet (Full Year)**, the 1 GB web-optimized file. Show the progress bar, speed and time left. Keep Chrome's Task Manager (Shift + Esc) visible to show memory staying flat.
4. When it opens, point at the status line ("Pages load on demand: read 40 MB of 1.00 GB"). Scroll fast, then jump to the last page.
5. Open **Complete Chart Packet (not web-optimized)**, the same 1 GB content. It takes several seconds to open and memory jumps. This is the argument for linearizing on the backend.
6. Go back to the first packet: it opens from this device in well under a second.
7. Start a big download, then click another document: the first download stops at once.
8. Switch to "Flaky network" and open an unsaved document: a clear error with **Try again**.
9. **Clear saved documents** at the bottom left, e.g. to show nothing stays behind after logout.
10. Open a document, click **Edit pages**. Find and delete blank pages, rotate the sideways page 6, move a late page to position 2, insert a blank page, duplicate a page, then Undo and Redo. **Save changes**, then **Done editing**: it reopens as the new version without downloading again.

---

## Settings (`.env`)

| Setting | Default | Purpose |
|---|---|---|
| `API_TARGET` | `http://localhost:4000` | Where the dev-server proxy forwards `/api` |
| `VITE_API_TOKEN` | `demo-token` | Sent as `Authorization: Bearer …`; must match the mock server |
| `VITE_APRYSE_LICENSE_KEY` | empty | Empty runs WebViewer's 7-day trial (with a faint watermark) |
| `VITE_CACHE_LIMIT_MB` | `3072` | Maximum disk space for saved documents |

Restart `npm run dev` after changing `.env`.

---

## Project structure

```
src/
├─ App.tsx                     start screen with environment checks
├─ components/
│  ├─ DocumentModal.tsx        the modal: list + preview + demo controls
│  ├─ DocumentList.tsx         searchable list, arrow-key navigation, size gauge
│  └─ PreviewPane.tsx          title, facts, status line, progress and error states
├─ hooks/useDocumentPreview.ts the click → cache → download → open flow; edit-mode loading
├─ hooks/usePageEditor.ts      move, swap, insert, duplicate, delete, rotate, undo/redo, blank search, save
├─ components/PageEditToolbar.tsx  the bar above the viewer
├─ components/BlankPagesPanel.tsx  blank-page progress and results
├─ workers/downloadWorker.ts   streams the API response to disk (OPFS)
├─ download/downloadClient.ts  main-thread wrapper for the worker
├─ cache/opfsCache.ts          disk cache index, size limit, eviction, clear
├─ sw/pdfServiceWorker.ts      registers the service worker
├─ viewer/ApryseViewer.tsx     single, reused Apryse instance
├─ lib/pdfInfo.ts              web-optimized (linearized) check
├─ lib/pageList.ts             page-list model; applies a page order to the viewer; builds the save request
├─ lib/pageEdits.ts            blank-page "ink" measure
├─ api/documents.ts            list + content URL (relative: goes through the proxy)
└─ styles.css
public/
└─ pdf-cache-sw.js             serves saved PDFs from disk with byte ranges
vite.config.ts                 the /api proxy (the CORS fix)
```

---

## Moving to production

- **Same origin for the API:** route `/api` through your reverse proxy (see the CORS section).
- **HTTPS:** service workers and OPFS only work on HTTPS (or `localhost`).
- **Browser support:** current Chrome, Edge, Firefox 111+ and Safari 15.2+ support what the download worker needs.
- **Apryse license:** set `VITE_APRYSE_LICENSE_KEY` to remove the trial watermark.
- **Faster Apryse rendering (optional):** Apryse can use multithreaded WebAssembly, and pre-compressed worker files, if your server sends the right headers. See Apryse's docs on "WASM threads" and "content encoding". These are optional tuning steps and not needed for the POC.
- **Patient data:** saved documents stay in the browser's private storage for this site. Call `clearCache()` from `src/cache/opfsCache.ts` on logout or session expiry.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Mock API server: Not reachable" | Start the mock server (`npm start` in `pdf-mock-server`), or fix `API_TARGET` in `.env` and restart `npm run dev` |
| List says "The API rejected the token" | `VITE_API_TOKEN` must equal the mock server's `API_TOKEN` |
| "Local file server: Not active" | You did a hard reload (Shift+Reload), which bypasses service workers. Reload normally. Documents still open meanwhile, using more memory |
| "The document viewer didn't start" | `public/lib/webviewer` is missing. Run `npm install` again |
| Apryse says the trial expired | Get a free trial key at dev.apryse.com, or use your company key, in `VITE_APRYSE_LICENSE_KEY` |
| "Not enough storage space" | Click **Clear saved documents**, lower the number of large files kept, or free disk space |
| Download fails right away through the app, but works with curl | Check the terminal running `npm run dev` for proxy errors |

**Console messages you can ignore:** Apryse logs warnings about WebAssembly threads and `.gz`/`.br` files (optional tuning, see above), a `moment` deprecation warning, and occasional "Download Failed", "Unknown page ID" or "Cannot read properties of null (reading 'getPageRotation')" errors when a document is closed while pages are still loading (for example when switching documents quickly). None of these affect behavior.

**One real limitation:** the browser estimates available storage from the size of the whole disk, not its actual free space. On a nearly full disk, a download can fail partway. The app reports this as a storage error and removes the partial file, but keep a few GB free when demoing 1 GB files.
