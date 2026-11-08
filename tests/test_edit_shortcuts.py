import json
import os
from unittest import TestCase

# ir/__init__.py imports aqt unless this is set, and that import happens while
# pytest is collecting, before the conftest fixture gets a chance to set it.
os.environ.setdefault("IR_TESTING", "1")

from ir.edit_shortcuts import (  # noqa: E402
    COMMAND_KEYS,
    parseCommand,
    shortcutsJson,
)

DEFAULT_SETTINGS = {"extractKey": "x", "highlightKey": "h", "removeKey": "z"}


def settings(**overrides):
    merged = dict(DEFAULT_SETTINGS)
    merged.update(overrides)
    return merged


class ShortcutsJsonTests(TestCase):
    def test_sends_the_configured_keys(self):
        sent = json.loads(shortcutsJson(settings()))

        self.assertEqual({"extract": "x", "highlight": "h", "remove": "z"}, sent)

    def test_follows_a_rebound_key(self):
        sent = json.loads(shortcutsJson(settings(extractKey="E")))

        self.assertEqual("E", sent["extract"])

    def test_omits_a_cleared_key(self):
        sent = json.loads(shortcutsJson(settings(removeKey="")))

        self.assertNotIn("remove", sent)

    def test_does_not_offer_undo(self):
        # Undo needs no selection and calls mw.reset(), which would pull the
        # reviewer off the card mid-edit.
        self.assertNotIn("undo", COMMAND_KEYS)
        self.assertNotIn("undo", json.loads(shortcutsJson(settings())))

    def test_cannot_close_the_script_element_it_is_embedded_in(self):
        rendered = shortcutsJson(settings(extractKey="</script>"))

        self.assertNotIn("<", rendered)
        self.assertNotIn(">", rendered)


class ParseCommandTests(TestCase):
    def test_recognises_each_command(self):
        for command in COMMAND_KEYS:
            self.assertEqual(command, parseCommand(f"ir:{command}"))

    def test_ignores_other_add_ons_messages(self):
        for message in ["EFDRC!reload", "EFDRC#1#2#3", "ans", "", "ir"]:
            self.assertIsNone(parseCommand(message))

    def test_ignores_an_unknown_command(self):
        # Nothing arbitrary should reach getattr on the text manager.
        for message in ["ir:undo", "ir:save", "ir:__class__", "ir:create"]:
            self.assertIsNone(parseCommand(message))

    def test_ignores_a_non_string_message(self):
        for message in [None, 42, {"a": 1}]:
            self.assertIsNone(parseCommand(message))
