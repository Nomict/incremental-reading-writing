/* AnkiConnect client, shared by the popup and the options page.
 *
 * AnkiConnect listens inside Anki and answers JSON at 127.0.0.1:8765. Every
 * reply carries both `result` and `error`; a request can succeed at the HTTP
 * level and still have failed, so `error` is what decides.
 */

export const DEFAULTS = {
  ankiUrl: 'http://127.0.0.1:8765',
  deck: '',
  noteType: 'IR3',
  titleField: 'Title',
  textField: 'Text',
  sourceField: 'Source',
  priorityField: '',
  priority: '',
  // Matches the add-on's own default of "{url} ({date})".
  sourceFormat: '{url} ({date})',
  mode: 'article',
  importImages: true,
  tags: 'incremental-reading'
}

export async function getConfig () {
  const stored = await chrome.storage.sync.get(DEFAULTS)
  return Object.assign({}, DEFAULTS, stored)
}

export class AnkiError extends Error {
  constructor (message, kind) {
    super(message)
    this.kind = kind || 'anki'
  }
}

// A blocked request looks like a network failure from here, because the
// browser never surfaces the response. That is nearly always AnkiConnect's
// origin allow-list rather than Anki being shut, so say so with the exact
// string to paste.
function unreachable (url) {
  const origin = `chrome-extension://${chrome.runtime.id}`
  return new AnkiError(
    `Could not reach AnkiConnect at ${url}.\n\n` +
      'Check that Anki is running with the AnkiConnect add-on installed, and ' +
      'that this extension is allowed to talk to it:\n\n' +
      'Tools → Add-ons → AnkiConnect → Config, then add\n\n' +
      `    ${origin}\n\n` +
      'to "webCorsOriginList", and restart Anki.',
    'unreachable'
  )
}

export async function invoke (action, params, config) {
  const url = (config && config.ankiUrl) || DEFAULTS.ankiUrl
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, version: 6, params: params || {} })
    })
  } catch (e) {
    throw unreachable(url)
  }
  if (!response.ok) {
    throw new AnkiError(`AnkiConnect returned HTTP ${response.status}.`)
  }
  let payload
  try {
    payload = await response.json()
  } catch (e) {
    throw new AnkiError('AnkiConnect sent a reply that was not JSON.')
  }
  if (payload && payload.error) {
    throw new AnkiError(payload.error)
  }
  return payload ? payload.result : null
}

/* Media -------------------------------------------------------------------
 *
 * Images are fetched here rather than by asking Anki to download them. This
 * side of the wire has the session cookies and has already cleared whatever
 * bot check the site applies, which is the whole reason for importing from the
 * browser instead of from the add-on.
 */

const MAX_IMAGE_BYTES = 8 * 1024 * 1024

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp'
}

async function sha1Hex (buffer) {
  const digest = await crypto.subtle.digest('SHA-1', buffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function toBase64 (buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  // Chunked: String.fromCharCode(...bytes) blows the argument limit on any
  // image worth importing.
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

// Content-addressed, so re-importing a page does not pile up duplicates and
// two pages sharing an image share one file. Basenames from the source URL
// collide constantly ("image.jpg"), which is why they are not used.
async function storeImage (src, config) {
  const response = await fetch(src, { credentials: 'include' })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength === 0) {
    throw new Error('empty response')
  }
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB`)
  }
  const type = (response.headers.get('Content-Type') || '').split(';')[0].trim()
  let ext = EXT_BY_TYPE[type]
  if (!ext) {
    const guess = new URL(src).pathname.split('.').pop()
    ext = /^[a-z0-9]{2,5}$/i.test(guess) ? guess.toLowerCase() : 'jpg'
  }
  const filename = `ir-${(await sha1Hex(buffer)).slice(0, 16)}.${ext}`
  await invoke('storeMediaFile', { filename, data: toBase64(buffer) }, config)
  return filename
}

/* Anki resolves a bare filename against collection.media, so rewriting src to
 * the stored name is what makes the image survive the page going away. Any
 * image that cannot be fetched keeps its original absolute URL: the note still
 * renders online, which beats a broken reference. */
export async function localiseImages (html, config, onProgress) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const images = Array.from(doc.querySelectorAll('img[src]')).filter((img) => {
    const src = img.getAttribute('src')
    return src && !src.startsWith('data:')
  })

  const failures = []
  const seen = new Map()
  for (let i = 0; i < images.length; i++) {
    const img = images[i]
    const src = img.getAttribute('src')
    if (onProgress) {
      onProgress(i + 1, images.length)
    }
    if (seen.has(src)) {
      img.setAttribute('src', seen.get(src))
      continue
    }
    try {
      const filename = await storeImage(src, config)
      seen.set(src, filename)
      img.setAttribute('src', filename)
    } catch (e) {
      failures.push(`${src} (${e.message})`)
    }
  }
  return { html: doc.body.innerHTML, imported: seen.size, failures }
}

/* Note assembly ----------------------------------------------------------- */

function today () {
  // The add-on writes date.today(), which stringifies as YYYY-MM-DD.
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function escapeHtml (text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Mirrors BaseImporter._createNote: the URL goes in as an anchor, then the
// format string is filled. Notes made here are indistinguishable from the
// add-on's own.
export function formatSource (url, format) {
  const anchor = `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`
  return (format || DEFAULTS.sourceFormat)
    .replace(/\{url\}/g, anchor)
    .replace(/\{date\}/g, today())
}

export function buildFields (article, config) {
  const fields = {}
  fields[config.titleField] = article.title || article.url
  fields[config.textField] = article.content
  fields[config.sourceField] = formatSource(article.url, config.sourceFormat)
  if (config.priorityField && config.priority) {
    fields[config.priorityField] = config.priority
  }
  return fields
}

export async function addNote (article, config, onProgress) {
  let content = article.content
  let media = { imported: 0, failures: [] }
  if (config.importImages) {
    media = await localiseImages(content, config, onProgress)
    content = media.html
  }

  const fields = buildFields(Object.assign({}, article, { content }), config)
  const tags = (config.tags || '')
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)

  const noteId = await invoke(
    'addNote',
    {
      note: {
        deckName: config.deck,
        modelName: config.noteType,
        fields,
        tags,
        options: { allowDuplicate: false, duplicateScope: 'deck' }
      }
    },
    config
  )
  return { noteId, media }
}

/* Validation used by both the popup and the options page, so a misconfigured
 * field mapping is reported before a note is attempted rather than as a raw
 * AnkiConnect error afterwards. */
export async function checkSetup (config) {
  const problems = []
  await invoke('version', {}, config)

  const decks = await invoke('deckNames', {}, config)
  if (!config.deck) {
    problems.push('No destination deck chosen.')
  } else if (!decks.includes(config.deck)) {
    problems.push(`Deck "${config.deck}" no longer exists.`)
  }

  const models = await invoke('modelNames', {}, config)
  if (!models.includes(config.noteType)) {
    problems.push(
      `Note type "${config.noteType}" does not exist. Open the Incremental ` +
        'Reading add-on once so it can create its note type, or pick another.'
    )
    return { problems, decks, models, fields: [] }
  }

  const fields = await invoke(
    'modelFieldNames',
    { modelName: config.noteType },
    config
  )
  for (const [label, name] of [
    ['Title', config.titleField],
    ['Text', config.textField],
    ['Source', config.sourceField]
  ]) {
    if (!name) {
      problems.push(`${label} field is not set.`)
    } else if (!fields.includes(name)) {
      problems.push(`${label} field "${name}" is not in "${config.noteType}".`)
    }
  }
  if (config.priorityField && !fields.includes(config.priorityField)) {
    problems.push(`Priority field "${config.priorityField}" is not in "${config.noteType}".`)
  }

  return { problems, decks, models, fields }
}
