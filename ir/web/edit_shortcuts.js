/*
 * Copyright 2026 Incremental Reading contributors
 *
 * Permission to use, copy, modify, and distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 * SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
 * OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 * CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

/* Makes the text commands reachable while a field is being edited.
 *
 * The commands are Qt shortcuts on the main window, and QtWebEngine hands a
 * plain letter to the focused editable instead of letting the shortcut fire.
 * So with a field focused, pressing the extract key inserts that letter and
 * the add-on never hears about it -- no Python-side check can help, because
 * nothing on the Python side runs.
 *
 * Edit Field During Review exposes registerShortcut for this: handlers it
 * registers run in the page while a field has focus, before the character is
 * inserted. Returning -1 tells it the key was not handled, so the letter is
 * typed as normal.
 *
 * IR_EDIT_SHORTCUTS is set in the Python code, from the user's own key
 * settings.
 */
(function () {
    if (typeof IR_EDIT_SHORTCUTS === "undefined") {
        return;
    }
    // Without the editing add-on there is nothing to hook, and nothing to fix:
    // no field has focus, so the Qt shortcuts work.
    if (typeof EFDRC === "undefined" || typeof EFDRC.registerShortcut !== "function") {
        return;
    }

    // Every command here acts on a selection, and typing does not begin with
    // text selected. A whitespace-only selection is a stray drag, not a target.
    function hasSelection() {
        const selection = window.getSelection();
        return !!(selection && !selection.isCollapsed && selection.toString().trim());
    }

    // The card is re-rendered on every answer and on every edit saved, and
    // EFDRC.shortcuts lives on the webview, which outlives all of that. Clear
    // the previous registrations or they accumulate -- and a rebound key would
    // otherwise keep firing under its old letter as well.
    function clearPrevious() {
        EFDRC.shortcuts = EFDRC.shortcuts.filter(function (shortcut) {
            return !shortcut.irCommand;
        });
    }

    function register(key, command) {
        if (!key) {
            return;
        }
        EFDRC.registerShortcut(key, function () {
            if (!hasSelection()) {
                // Nothing selected, so this was typing. -1 keeps the letter.
                return -1;
            }
            window.pycmd("ir:" + command);
        });
        // Tag it so the next render can take it back out again.
        EFDRC.shortcuts[EFDRC.shortcuts.length - 1].irCommand = command;
    }

    clearPrevious();
    for (const shortcut of IR_EDIT_SHORTCUTS) {
        register(shortcut.key, shortcut.command);
    }
})();
