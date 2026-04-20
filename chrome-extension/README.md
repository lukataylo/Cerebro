# Cerebro Triage — Chrome side panel

A standalone Chrome side panel that mirrors the Cerebro triage queue and
accepts drag-and-drop email files for ingestion. No Outlook integration —
the side panel runs on any tab and links out to the full Cerebro UI on
`localhost:3000`.

```
chrome-extension/
├── manifest.json     MV3 manifest — registers the side panel
├── background.js     Toolbar click → open side panel
├── sidebar.html      Side-panel page
├── sidebar.css       Styles
├── sidebar.js        Drop, paste, poll /api/quotes, render cards
├── gen-icons.mjs     Zero-dep PNG icon generator
└── icons/            16/32/48/128 pngs
```

## What the side panel does

- **Drop zone** at the top — drag a `.eml` or `.txt` file (or click to
  browse). The file is parsed in the browser, posted to `/api/ingest`, and
  the resulting quote appears at the top of the recent list.
- **Paste fallback** — open the *"or paste an email body"* drawer to type
  / paste a subject + body directly.
- **Recent classifications** — polls `GET /api/quotes` every 5 s. Each
  card shows the assured, class, destination chip, broker, confidence and
  age. Clicking a card opens the full Cerebro app at
  `localhost:3000/?quote=<id>` in a new tab.
- **Backend status pill** — turns green when `localhost:3000/api/health`
  responds, red otherwise.

## 1. Start the backend

```bash
cd ../server
npm install   # first time only
npm start
```

Confirm `http://localhost:3000/api/health` returns `{ ok: true, ... }`.

## 2. Load the extension

1. Open Chrome → `chrome://extensions/`.
2. Top-right toggle → **Developer mode** ON.
3. **Load unpacked** → pick `/Users/lukadadiani/Documents/Cerebro/chrome-extension`.
4. The Cerebro icon appears in the toolbar — pin it for easy access.
5. Click the icon. The side panel opens on the right.

If you change `sidebar.js` / `manifest.json`, click the **reload** arrow on
the extension card. The side panel auto-refreshes.

> **Requires Chrome 114+** (the `sidePanel` API). Edge 114+ also works.

## 3. Use it

- Drop a `.eml` file on the dropzone — Cerebro classifies it within ~2 s
  and the new quote slides in at the top of the list with a yellow flash.
- Click a quote card → opens the full triage console in a new tab.
- Use **Open Cerebro queue** (top-right icon) to jump straight to the app.

## What it sends to Cerebro

| What                  | Endpoint                                       |
| --------------------- | ---------------------------------------------- |
| Health probe          | `GET  /api/health`                             |
| Recent quotes         | `GET  /api/quotes`                             |
| Ingest dropped file   | `POST /api/ingest` `{from,to,subject,body}`    |

CORS is permissive on the server (`cors()` in `server.js`). When
`ANTHROPIC_API_KEY` is set the extraction runs through Claude; otherwise
it falls back to the keyword extractor in `server/extractor.js`.

## File-type support

| Drop                        | Behaviour                                                         |
| --------------------------- | ----------------------------------------------------------------- |
| `.eml`                      | Parsed (RFC 822) → from / subject / body extracted, then ingested |
| `.txt` / plain forwarded    | Whole file becomes the body; from / subject inferred if present   |
| `.msg` (Outlook binary)     | Rejected with friendly error — re-save as `.eml`                  |
| Other (PDF / image / etc.)  | Use the **paste** drawer to type the body manually                |

PDF / image OCR is out of scope for the current backend.

## Troubleshooting

| Symptom                          | Fix                                                        |
| -------------------------------- | ---------------------------------------------------------- |
| Side panel won't open            | Chrome ≥114; click the toolbar icon (not a context menu).  |
| "Backend down" badge             | Start `server/`; check `localhost:3000/api/health`.        |
| Card list stuck on "Loading…"    | Backend reachable but `/api/quotes` errored — check server logs. |
| `.eml` parsed but body looks raw | The file uses an unusual MIME structure; paste manually.   |
| Icons missing                    | `node gen-icons.mjs` regenerates them.                     |
