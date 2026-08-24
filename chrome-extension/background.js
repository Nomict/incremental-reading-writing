/* The import runs here rather than in the popup, because a popup is destroyed
 * the moment it loses focus and a page with many images takes long enough for
 * that to happen. The popup subscribes to progress over a port and can go away
 * without cancelling anything; the badge reports the outcome either way.
 */
import { getConfig, checkSetup, addNote, invoke, AnkiError } from './anki.js'

const badge = function (text, colour) {
  chrome.action.setBadgeText({ text })
  if (text) {
    chrome.action.setBadgeBackgroundColor({ color: colour })
    // Long enough to notice on returning to the tab, short enough not to stick.
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 8000)
  }
}

async function extract (tabId, mode) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['vendor/Readability.js', 'content.js']
  })
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (m) => window.__irImporterExtract(m),
    args: [mode]
  })
  if (!result || !result.ok) {
    throw new Error('Could not read this page.')
  }
  return result
}

async function hasSelection (tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['vendor/Readability.js', 'content.js']
    })
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__irImporterHasSelection()
    })
    return !!result
  } catch (e) {
    return false
  }
}

// Chrome refuses injection into its own pages and the extension gallery, which
// is worth saying plainly instead of surfacing the raw failure.
function injectable (url) {
  return /^https?:/i.test(url || '')
}

async function runImport (port, { mode, title, deck, priority, importImages }) {
  const send = (type, payload) => {
    try {
      port.postMessage(Object.assign({ type }, payload))
    } catch (e) {
      /* popup closed; the import carries on regardless */
    }
  }

  try {
    const config = await getConfig()
    if (deck) config.deck = deck
    if (priority !== undefined && priority !== null) config.priority = priority
    // The popup decides this: it knows whether host access was granted.
    config.importImages = !!importImages

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab || !injectable(tab.url)) {
      throw new Error('This page cannot be imported. Open a normal web page and try again.')
    }

    send('status', { message: 'Checking Anki…' })
    const setup = await checkSetup(config)
    if (setup.problems.length) {
      throw new AnkiError(setup.problems.join('\n'), 'config')
    }

    send('status', { message: 'Reading the page…' })
    const article = await extract(tab.id, mode)
    if (title) {
      article.title = title
    }
    if (!article.content || !article.content.trim()) {
      throw new Error('Nothing to import: the page produced no content.')
    }

    const onProgress = (done, total) =>
      send('status', { message: `Importing images ${done}/${total}…` })

    send('status', { message: 'Adding the note…' })
    const { noteId, media } = await addNote(article, config, onProgress)

    badge('✓', '#2e7d32')
    send('done', {
      noteId,
      mode: article.mode,
      imagesImported: media.imported,
      imageFailures: media.failures
    })
  } catch (e) {
    badge('!', '#c62828')
    send('error', { message: e.message, kind: e.kind || 'error' })
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'import') {
    return
  }
  port.onMessage.addListener((msg) => {
    if (msg && msg.action === 'import') {
      runImport(port, msg)
    }
  })
})

// One-shot queries the popup makes while opening.
chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  ;(async () => {
    try {
      if (msg.action === 'probe') {
        const config = await getConfig()
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        const canImport = !!(tab && injectable(tab.url))
        let setup = null
        let error = null
        try {
          setup = await checkSetup(config)
        } catch (e) {
          error = { message: e.message, kind: e.kind || 'error' }
        }
        respond({
          ok: true,
          config,
          setup,
          error,
          canImport,
          tabTitle: tab ? tab.title : '',
          tabUrl: tab ? tab.url : '',
          hasSelection: canImport ? await hasSelection(tab.id) : false
        })
        return
      }
      if (msg.action === 'invoke') {
        const config = await getConfig()
        respond({ ok: true, result: await invoke(msg.name, msg.params, config) })
        return
      }
      respond({ ok: false, error: { message: `Unknown action: ${msg.action}` } })
    } catch (e) {
      respond({ ok: false, error: { message: e.message, kind: e.kind || 'error' } })
    }
  })()
  return true // reply is asynchronous
})
