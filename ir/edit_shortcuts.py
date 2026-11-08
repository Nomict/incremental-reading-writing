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

"""The text commands, reached from the card rather than from a Qt shortcut.

With a field focused for editing, QtWebEngine gives the key to the editable and
the window shortcut never fires, so the commands are unreachable exactly when a
selection exists to act on. web/edit_shortcuts.js registers them with the
editing add-on instead and sends the command here.

Quick keys are included: they are menu actions with their own key sequences
(SettingsManager.loadMenuItems), so they are blocked in the same way, and each
one carries its own destination note type and deck. The message names which.

Undo is not offered. It needs no selection, and its mw.reset() would pull the
reviewer off the card.
"""

import json
from typing import Optional, Tuple

PREFIX = "ir:"
QUICK_KIND = "quick"

# command -> the setting holding its key
COMMAND_KEYS = {
    "extract": "extractKey",
    "highlight": "highlightKey",
    "remove": "removeKey",
}


def shortcutsJson(settings) -> str:
    """The key/command pairs for the card script.

    A quick key's command carries the key combination it was defined under,
    which is how the settings for that one are found again when it fires.
    """
    shortcuts = [
        {"key": settings[key], "command": command}
        for command, key in COMMAND_KEYS.items()
        if settings[key]
    ]

    shortcuts += [
        {"key": keyCombo, "command": f"{QUICK_KIND}:{keyCombo}"}
        for keyCombo in settings["quickKeys"]
        if keyCombo
    ]

    # Quick key combinations are the user's own text and land inside a <script>
    # element, so escape anything that could close it early.
    return (
        json.dumps(shortcuts)
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
    )


def parseCommand(message: str) -> Optional[Tuple[str, Optional[str]]]:
    """What a pycmd message asks for, or None if it is not ours.

    Returns (command, None) for a plain command, or ("quick", keyCombo) for a
    quick key. The caller checks the combination still exists, so nothing
    arbitrary reaches the text manager.
    """
    if not isinstance(message, str) or not message.startswith(PREFIX):
        return None

    body = message[len(PREFIX) :]

    if body.startswith(f"{QUICK_KIND}:"):
        keyCombo = body[len(QUICK_KIND) + 1 :]
        return (QUICK_KIND, keyCombo) if keyCombo else None

    return (body, None) if body in COMMAND_KEYS else None
