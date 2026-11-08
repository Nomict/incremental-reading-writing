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

With a field focused for editing, QtWebEngine gives a plain letter to the
editable and the window shortcut never fires, so the commands are unreachable
exactly when a selection exists to act on. web/edit_shortcuts.js registers them
with the editing add-on instead and sends the command here.

Only commands that act on a selection are offered. Undo is not: it needs no
selection, and its mw.reset() would pull the reviewer off the card.
"""

import json

PREFIX = "ir:"

# command -> the setting holding its key
COMMAND_KEYS = {
    "extract": "extractKey",
    "highlight": "highlightKey",
    "remove": "removeKey",
}


def shortcutsJson(settings) -> str:
    """The command/key pairs for the card script.

    Keys come from a fixed set of settings and are single characters, so there
    is nothing here a user could use to break out of the script element; the
    escaping is belt and braces.
    """
    shortcuts = {
        command: settings[key]
        for command, key in COMMAND_KEYS.items()
        if settings[key]
    }
    return (
        json.dumps(shortcuts)
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
    )


def parseCommand(message: str):
    """The command a pycmd message asks for, or None if it is not ours."""
    if not isinstance(message, str) or not message.startswith(PREFIX):
        return None
    command = message[len(PREFIX) :]
    return command if command in COMMAND_KEYS else None
