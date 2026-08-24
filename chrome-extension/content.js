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
  const STRIP = 'script, style, noscript, iframe, object, embed, link, meta, form, nav'

  // Readability rewrites relative URLs against the document's base, but only
  // inside what it keeps. The other modes get the same treatment by hand, so a
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
    // needs the one resolved src, which is already set.
    for (const el of root.querySelectorAll('[srcset]')) {
      el.removeAttribute('srcset')
    }
  }

  /* Image sources are swapped for opaque tokens here, and the caller is given
   * the token/URL pairs. The service worker that does the importing has no DOM
   * to parse HTML with, so it puts the final values back by exact string
   * replacement -- either a stored filename or, if images are not being
   * copied, the original URL. The nonce keeps a token from colliding with
   * anything in the page's own prose. */
  const tokeniseImages = function (root) {
    const nonce = Math.random().toString(36).slice(2, 10)
    const images = []
    let n = 0
    for (const img of root.querySelectorAll('img[src]')) {
      const src = img.getAttribute('src')
      if (!src || src.startsWith('data:')) {
        continue
      }
      const token = `__ir-img-${nonce}-${n++}__`
      img.setAttribute('src', token)
      images.push({ token, url: src })
    }
    return images
  }

  // Everything the three modes have in common: drop the junk, resolve URLs,
  // pull the images out, serialise.
  const finalise = function (root, extra) {
    for (const el of root.querySelectorAll(STRIP)) {
      el.remove()
    }
    absolutise(root, document.baseURI)
    const images = tokeniseImages(root)
    return Object.assign(
      {
        ok: true,
        url: location.href,
        content: root.innerHTML,
        images,
        siteName: location.hostname
      },
      extra
    )
  }

  const fullPage = function () {
    const clone = document.cloneNode(true)
    const body = clone.body || clone.documentElement
    return finalise(body, {
      mode: 'full',
      title: document.title || location.href,
      excerpt: '',
      byline: ''
    })
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
    return finalise(holder, {
      mode: 'article',
      title: parsed.title || document.title || location.href,
      excerpt: parsed.excerpt || '',
      byline: parsed.byline || ''
    })
  }

  const selection = function () {
    const sel = window.getSelection()
    const holder = document.createElement('div')
    for (let i = 0; i < sel.rangeCount; i++) {
      holder.appendChild(sel.getRangeAt(i).cloneContents())
    }
    return finalise(holder, {
      mode: 'selection',
      title: document.title || location.href,
      excerpt: '',
      byline: ''
    })
  }

  window.__irImporterExtract = function (mode) {
    const sel = window.getSelection()
    if (mode === 'selection' && sel && !sel.isCollapsed) {
      return selection()
    }
    if (mode === 'full') {
      return fullPage()
    }
    const found = article()
    if (found) {
      return found
    }
    // Readability declines on pages that are not articles. Falling back is
    // better than refusing: the user asked for this page specifically.
    return Object.assign(fullPage(), { mode: 'full-fallback' })
  }

  window.__irImporterHasSelection = function () {
    const s = window.getSelection()
    return !!(s && !s.isCollapsed && s.toString().trim())
  }
})()
