/* global Readability */

/* Runs in the page on demand and hands back the article.
 *
 * The point of extracting here rather than fetching the URL from Anki is that
 * this document has already been through the browser: scripts have run, the
 * session is the user's own, and any bot check was passed by a person. What is
 * on screen is what gets imported.
 */
(() => {
  // Injected more than once if the popup is reopened; only define once.
  if (window.__irImporterExtract) {
    return
  }

  const ABSOLUTE_ATTRS = ['src', 'href', 'poster']

  // Readability rewrites relative URLs against the document's base, but only
  // inside what it keeps. Full-page mode gets the same treatment by hand, so a
  // note never carries a link that resolves against the collection folder.
  const absolutise = function (root, baseUrl) {
    for (const attr of ABSOLUTE_ATTRS) {
      for (const el of root.querySelectorAll(`[${attr}]`)) {
        const raw = el.getAttribute(attr)
        if (!raw || raw.startsWith('#') || raw.startsWith('data:')) {
          continue
        }
        try {
          el.setAttribute(attr, new URL(raw, baseUrl).href)
        } catch (e) {
          /* leave anything unparseable alone */
        }
      }
    }
    // srcset routinely carries relative or malformed candidates; the note only
    // needs one resolved src, which is already set.
    for (const el of root.querySelectorAll('[srcset]')) {
      el.removeAttribute('srcset')
    }
  }

  const STRIP = 'script, style, noscript, iframe, object, embed, link, meta, form, nav'

  const fullPage = function () {
    const clone = document.cloneNode(true)
    for (const el of clone.querySelectorAll(STRIP)) {
      el.remove()
    }
    const body = clone.body || clone.documentElement
    absolutise(body, document.baseURI)
    return {
      title: document.title || location.href,
      content: body.innerHTML,
      excerpt: '',
      byline: '',
      siteName: location.hostname
    }
  }

  const article = function () {
    if (typeof Readability !== 'function') {
      return null
    }
    // Readability mutates the document it is handed, so give it a copy.
    let parsed = null
    try {
      parsed = new Readability(document.cloneNode(true)).parse()
    } catch (e) {
      return null
    }
    if (!parsed || !parsed.content) {
      return null
    }
    const holder = document.createElement('div')
    holder.innerHTML = parsed.content
    for (const el of holder.querySelectorAll(STRIP)) {
      el.remove()
    }
    absolutise(holder, document.baseURI)
    return {
      title: parsed.title || document.title || location.href,
      content: holder.innerHTML,
      excerpt: parsed.excerpt || '',
      byline: parsed.byline || '',
      siteName: parsed.siteName || location.hostname
    }
  }

  window.__irImporterExtract = function (mode) {
    const selection = window.getSelection()
    if (mode === 'selection' && selection && !selection.isCollapsed) {
      const holder = document.createElement('div')
      for (let i = 0; i < selection.rangeCount; i++) {
        holder.appendChild(selection.getRangeAt(i).cloneContents())
      }
      for (const el of holder.querySelectorAll(STRIP)) {
        el.remove()
      }
      absolutise(holder, document.baseURI)
      return {
        ok: true,
        url: location.href,
        mode: 'selection',
        title: document.title || location.href,
        content: holder.innerHTML,
        excerpt: '',
        byline: '',
        siteName: location.hostname
      }
    }

    let result = mode === 'full' ? fullPage() : article()
    let usedMode = mode === 'full' ? 'full' : 'article'
    if (!result) {
      // Readability declines on pages that are not articles. Falling back is
      // better than refusing: the user asked for this page specifically.
      result = fullPage()
      usedMode = 'full-fallback'
    }
    return Object.assign({ ok: true, url: location.href, mode: usedMode }, result)
  }

  window.__irImporterHasSelection = function () {
    const s = window.getSelection()
    return !!(s && !s.isCollapsed && s.toString().trim())
  }
})()
