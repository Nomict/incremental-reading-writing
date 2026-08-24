# Incremental Reading Importer

A Chrome extension that sends the page you are reading to Anki as an
Incremental Reading note.

## Why this exists

The add-on's own *Import Webpage* fetches the URL from inside Anki with
`requests`. That request announces itself as `IR/<version>`, runs no
JavaScript, and carries none of your cookies, so sites behind a bot check or
rendered client-side return an interstitial — which the add-on then imports as
the article. That is where cards reading "Just a moment…" come from.

Importing from the browser sidesteps all of it. The page in your tab has
already been fetched with your session, had its scripts run, and passed any
bot check by virtue of a human being there. What is on screen is what gets
imported.

## Setup

**1. Install AnkiConnect** in Anki (*Tools → Add-ons → Get Add-ons*, code
`2055492159`) and restart.

**2. Load this extension.** Open `chrome://extensions`, turn on *Developer
mode*, choose *Load unpacked*, and select this `chrome-extension` folder.

**3. Let AnkiConnect accept requests from it.** This is the step that catches
people out — without it every import fails as if Anki were closed. In Anki go
to *Tools → Add-ons → AnkiConnect → Config* and add the extension's origin to
`webCorsOriginList`:

```json
{
  "webCorsOriginList": [
    "http://localhost",
    "chrome-extension://YOUR_EXTENSION_ID"
  ]
}
```

The extension's settings page shows the exact string to paste. Restart Anki
afterwards.

**4. Open the extension's settings** and pick a deck. The note type defaults to
`IR3` with fields `Title` / `Text` / `Source`, matching the add-on. If you have
renamed anything, or enabled the priority field, set that here.

## Use

Click the toolbar button, or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd>
(<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> on macOS).

- **Article only** — runs Mozilla's Readability, the engine behind Firefox
  Reader Mode, and imports the article without the navigation, sidebars and
  footers. This is the default. On a page Readability does not consider an
  article it falls back to the whole page and tells you so.
- **Whole page** — everything, minus the tags the add-on itself discards
  (`script`, `iframe`, `nav`).
- **Selected text** — just what you have selected. Only offered when something
  is selected.

Relative URLs are made absolute, so links and images still resolve once the
note is in Anki.

## Images

With *Copy images into the collection* ticked, images are fetched by the
browser — with your cookies, from a session the site has already accepted —
and stored in Anki via `storeMediaFile`. Filenames are content-addressed
(`ir-<hash>.<ext>`), so re-importing a page does not accumulate duplicates and
two pages sharing an image share one file.

This needs permission to read the sites images are served from. Rather than
requesting that at install time, which would put an "access all websites"
warning on the extension, it is requested the first time you import with images
enabled. **Declining is fine** — the import still runs, and images keep
pointing at the website. They will render while you are online and break if the
page goes away.

Images over 8 MB are skipped. Any image that cannot be fetched keeps its
original URL rather than becoming a broken reference, and the popup reports how
many.

## Notes it creates

Identical to the add-on's own imports. `Source` is built the same way
`BaseImporter._createNote` builds it — the URL as an anchor, run through your
`sourceFormat` setting, which defaults to `{url} ({date})`:

```html
<a href="https://example.org/x">https://example.org/x</a> (2026-08-24)
```

Notes are tagged `incremental-reading` by default; change or clear that in
settings. Duplicates are refused within the destination deck.

## Third-party code

`vendor/Readability.js` is Mozilla's [Readability](https://github.com/mozilla/readability)
0.6.0, Apache-2.0. Its licence is alongside it in
`vendor/Readability-LICENSE.md`.
