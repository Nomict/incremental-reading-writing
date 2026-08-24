# Copyright 2026 Incremental Reading contributors
#
# Permission to use, copy, modify, and distribute this software for any purpose
# with or without fee is hereby granted, provided that the above copyright
# notice and this permission notice appear in all copies.
#
# THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
# REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
# AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
# INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
# LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
# OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
# PERFORMANCE OF THIS SOFTWARE.

"""Builds the shortcut legend shown while studying an IR card.

Kept apart from the view so it can be tested without a running Anki: it reads
the settings and returns plain data.
"""

import json

# Zoom is bound by addMenuItem rather than through the shortcut settings, so it
# is listed here rather than read back from them.
ZOOM_SHORTCUTS = [("Ctrl++", "Zoom in"), ("Ctrl+-", "Zoom out")]


def buildLegendData(settings) -> dict:
    """The shortcuts as they are actually configured, grouped for display."""
    text = [
        (settings["extractKey"], "Extract"),
        (settings["highlightKey"], "Highlight"),
        (settings["removeKey"], "Remove"),
        (settings["undoKey"], "Undo"),
    ]

    formatting = [
        (settings["boldSeq"], "Bold"),
        (settings["italicSeq"], "Italic"),
        (settings["underlineSeq"], "Underline"),
        (settings["strikeSeq"], "Strikethrough"),
        (settings["overlaySeq"], "Toggle overlay"),
    ]

    quick = [
        (keyCombo, f"Add card → {quickKey.get('extractDeck') or 'current deck'}")
        for keyCombo, quickKey in settings["quickKeys"].items()
    ]

    return {
        "title": "Shortcuts",
        "groups": [
            _group("Text", text),
            _group("Format", formatting),
            _group("View", ZOOM_SHORTCUTS),
            _group("Quick keys", quick),
        ],
    }


def _group(name: str, pairs) -> dict:
    return {
        "name": name,
        # A shortcut cleared in the settings would otherwise leave an empty key
        # floating in the legend.
        "items": [{"key": key, "label": label} for key, label in pairs if key],
    }


def legendJson(settings) -> str:
    """The legend data, safe to embed in a <script> block.

    Deck names are the user's own text, so anything that could close the script
    element early is escaped rather than trusted.
    """
    return (
        json.dumps(buildLegendData(settings))
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
    )
