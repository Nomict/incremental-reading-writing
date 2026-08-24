const $ = (id) => document.getElementById(id)

const show = function (text, kind) {
  const box = $('message')
  box.textContent = text
  box.className = `message ${kind || ''}`
  box.hidden = false
}

const hideMessage = () => { $('message').hidden = true }

const setBusy = function (busy) {
  $('import').disabled = busy
  $('import').textContent = busy ? 'Working…' : 'Import'
}

let config = null

async function init () {
  const probe = await chrome.runtime.sendMessage({ action: 'probe' })
  if (!probe || !probe.ok) {
    show((probe && probe.error && probe.error.message) || 'Something went wrong.', 'error')
    $('form').hidden = true
    return
  }
  config = probe.config

  if (!probe.canImport) {
    show('This page cannot be imported. Open a normal web page and try again.', 'error')
    $('form').hidden = true
    return
  }

  // Anki unreachable or misconfigured: say so up front rather than letting the
  // user fill the form and fail at the end.
  if (probe.error) {
    show(probe.error.message, 'error')
    $('form').hidden = true
    return
  }
  if (probe.setup && probe.setup.problems.length) {
    show(probe.setup.problems.join('\n') + '\n\nOpen Settings to fix this.', 'error')
    $('form').hidden = true
    return
  }

  $('title').value = probe.tabTitle || ''
  $('images').checked = !!config.importImages
  $('mode').value = config.mode || 'article'

  if (!probe.hasSelection) {
    // Offering it when there is nothing selected only invites an empty note.
    $('mode').querySelector('option[value="selection"]').disabled = true
    if ($('mode').value === 'selection') {
      $('mode').value = 'article'
    }
  }

  const deck = $('deck')
  for (const name of probe.setup.decks) {
    const option = document.createElement('option')
    option.value = name
    option.textContent = name
    deck.appendChild(option)
  }
  deck.value = config.deck

  if (config.priorityField) {
    $('priority-row').hidden = false
    $('priority').value = config.priority || ''
  }

  $('title').focus()
  $('title').select()
}

// Downloading images means fetching from whatever hosts the page uses, which
// needs host access. Asking for it at install time would put an "access all
// websites" warning on the extension, so it is requested here instead, on the
// click, and only when images are actually wanted. Declining is fine: the
// import proceeds with images left pointing at the website.
async function ensureImagePermission () {
  if (!$('images').checked) {
    return false
  }
  const origins = ['<all_urls>']
  if (await chrome.permissions.contains({ origins })) {
    return true
  }
  try {
    return await chrome.permissions.request({ origins })
  } catch (e) {
    return false
  }
}

async function runImport () {
  hideMessage()

  let withImages = $('images').checked
  if (withImages) {
    withImages = await ensureImagePermission()
    if (!withImages) {
      show(
        'Importing without copying images: access to the site was not granted, ' +
          'so images will keep pointing at the website.',
        'info'
      )
    }
  }

  setBusy(true)

  const port = chrome.runtime.connect({ name: 'import' })
  port.onMessage.addListener((msg) => {
    if (msg.type === 'status') {
      show(msg.message, 'info')
      return
    }
    if (msg.type === 'done') {
      setBusy(false)
      const bits = ['Added to Anki.']
      if (msg.mode === 'full-fallback') {
        bits.push('Readability found no article here, so the whole page was imported.')
      }
      if (msg.imagesImported) {
        bits.push(`${msg.imagesImported} image(s) copied in.`)
      }
      if (msg.imageFailures && msg.imageFailures.length) {
        bits.push(
          `${msg.imageFailures.length} image(s) could not be fetched and still ` +
            'point at the website.'
        )
      }
      show(bits.join(' '), 'ok')
      port.disconnect()
      return
    }
    if (msg.type === 'error') {
      setBusy(false)
      show(msg.message, 'error')
      port.disconnect()
    }
  })

  port.postMessage({
    action: 'import',
    mode: $('mode').value,
    title: $('title').value.trim(),
    deck: $('deck').value,
    importImages: withImages,
    priority: $('priority') ? $('priority').value.trim() : ''
  })

  // Remember the choices that are worth remembering.
  chrome.storage.sync.set({
    deck: $('deck').value,
    mode: $('mode').value,
    importImages: $('images').checked
  })
}

$('import').addEventListener('click', runImport)
$('images').addEventListener('change', () =>
  chrome.storage.sync.set({ importImages: $('images').checked })
)
$('options').addEventListener('click', (e) => {
  e.preventDefault()
  chrome.runtime.openOptionsPage()
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !$('import').disabled) {
    runImport()
  }
})

init()
