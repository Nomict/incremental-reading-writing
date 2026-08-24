import { DEFAULTS, getConfig, invoke, checkSetup } from './anki.js'

const $ = (id) => document.getElementById(id)

const TEXT_KEYS = ['ankiUrl', 'tags', 'priority', 'sourceFormat']
const SELECT_KEYS = [
  'deck',
  'noteType',
  'titleField',
  'textField',
  'sourceField',
  'priorityField'
]

const show = function (text, kind) {
  const box = $('message')
  box.textContent = text
  box.className = `message ${kind || ''}`
  box.hidden = false
}

const fill = function (select, values, current, { includeNone = false } = {}) {
  select.textContent = ''
  if (includeNone) {
    const none = document.createElement('option')
    none.value = ''
    none.textContent = '(none)'
    select.appendChild(none)
  }
  for (const value of values) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = value
    select.appendChild(option)
  }
  // Keep a configured value visible even when Anki no longer offers it, so
  // saving does not silently rewrite it to something else.
  if (current && !values.includes(current)) {
    const missing = document.createElement('option')
    missing.value = current
    missing.textContent = `${current} (missing)`
    select.appendChild(missing)
  }
  select.value = current || ''
}

let config = null

async function loadFields (modelName) {
  if (!modelName) {
    return []
  }
  try {
    return await invoke('modelFieldNames', { modelName }, config)
  } catch (e) {
    return []
  }
}

async function refreshFieldPickers () {
  const fields = await loadFields($('noteType').value)
  fill($('titleField'), fields, config.titleField)
  fill($('textField'), fields, config.textField)
  fill($('sourceField'), fields, config.sourceField)
  fill($('priorityField'), fields, config.priorityField, { includeNone: true })
}

async function connect () {
  const decks = await invoke('deckNames', {}, config)
  const models = await invoke('modelNames', {}, config)
  fill($('deck'), decks.sort(), config.deck)
  fill($('noteType'), models.sort(), config.noteType)
  await refreshFieldPickers()
}

async function init () {
  $('origin').textContent = `chrome-extension://${chrome.runtime.id}`
  config = await getConfig()
  for (const key of TEXT_KEYS) {
    $(key).value = config[key] != null ? config[key] : DEFAULTS[key]
  }

  try {
    await connect()
  } catch (e) {
    show(e.message, 'error')
    // Still let the fields be edited by hand while disconnected.
    for (const key of SELECT_KEYS) {
      fill($(key), [], config[key], { includeNone: key === 'priorityField' })
    }
  }
}

$('noteType').addEventListener('change', async () => {
  config.noteType = $('noteType').value
  await refreshFieldPickers()
})

$('test').addEventListener('click', async () => {
  config = Object.assign(config, { ankiUrl: $('ankiUrl').value.trim() })
  try {
    const version = await invoke('version', {}, config)
    await connect()
    show(`Connected to AnkiConnect (API version ${version}).`, 'ok')
  } catch (e) {
    show(e.message, 'error')
  }
})

$('save').addEventListener('click', async () => {
  const next = {}
  for (const key of TEXT_KEYS) {
    next[key] = $(key).value.trim()
  }
  for (const key of SELECT_KEYS) {
    next[key] = $(key).value
  }
  await chrome.storage.sync.set(next)
  config = await getConfig()

  try {
    const setup = await checkSetup(config)
    if (setup.problems.length) {
      show('Saved, but: ' + setup.problems.join(' '), 'error')
      return
    }
    show('Saved.', 'ok')
  } catch (e) {
    show(`Saved, but Anki could not be reached: ${e.message}`, 'error')
  }
})

init()
