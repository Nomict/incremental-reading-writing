import json
import os
from unittest import TestCase

# ir/__init__.py imports aqt unless this is set, and that import happens while
# pytest is collecting, before the conftest fixture gets a chance to set it.
os.environ.setdefault("IR_TESTING", "1")

from ir.edit_shortcuts import (  # noqa: E402
    COMMAND_KEYS,
    QUICK_KIND,
    parseCommand,
    shortcutsJson,
)

DEFAULT_SETTINGS = {
    "extractKey": "x",
    "highlightKey": "h",
    "removeKey": "z",
    "quickKeys": {},
}


def byCommand(rendered):
    return {entry["command"]: entry["key"] for entry in json.loads(rendered)}


def settings(**overrides):
    merged = dict(DEFAULT_SETTINGS)
    merged.update(overrides)
    return merged


class ShortcutsJsonTests(TestCase):
    def test_sends_the_configured_keys(self):
        sent = byCommand(shortcutsJson(settings()))

        self.assertEqual({"extract": "x", "highlight": "h", "remove": "z"}, sent)

    def test_follows_a_rebound_key(self):
        sent = byCommand(shortcutsJson(settings(extractKey="E")))

        self.assertEqual("E", sent["extract"])

    def test_omits_a_cleared_key(self):
        sent = byCommand(shortcutsJson(settings(removeKey="")))

        self.assertNotIn("remove", sent)

    def test_does_not_offer_undo(self):
        # Undo needs no selection and calls mw.reset(), which would pull the
        # reviewer off the card mid-edit.
        self.assertNotIn("undo", COMMAND_KEYS)
        self.assertNotIn("undo", byCommand(shortcutsJson(settings())))

    def test_cannot_close_the_script_element_it_is_embedded_in(self):
        rendered = shortcutsJson(settings(extractKey="</script>"))

        self.assertNotIn("<", rendered)
        self.assertNotIn(">", rendered)


class ParseCommandTests(TestCase):
    def test_recognises_each_command(self):
        for command in COMMAND_KEYS:
            self.assertEqual((command, None), parseCommand(f"ir:{command}"))

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


class QuickKeyTests(TestCase):
    QUICK = {
        "Ctrl+Alt+A": {"modelName": "Cloze", "extractDeck": "Vocabulary"},
        "Ctrl+Shift+B": {"modelName": "Basic", "extractDeck": "Facts"},
    }

    def test_quick_keys_are_offered_alongside_the_plain_commands(self):
        # They are menu actions with their own key sequences, so a focused
        # field blocks them exactly as it blocks the others.
        sent = byCommand(shortcutsJson(settings(quickKeys=self.QUICK)))

        self.assertEqual("Ctrl+Alt+A", sent["quick:Ctrl+Alt+A"])
        self.assertEqual("Ctrl+Shift+B", sent["quick:Ctrl+Shift+B"])
        self.assertEqual("x", sent["extract"])

    def test_no_quick_entries_when_none_are_defined(self):
        sent = byCommand(shortcutsJson(settings()))

        self.assertEqual([], [c for c in sent if c.startswith("quick:")])

    def test_parses_a_quick_key_back_to_its_combination(self):
        self.assertEqual(
            (QUICK_KIND, "Ctrl+Alt+A"), parseCommand("ir:quick:Ctrl+Alt+A")
        )

    def test_a_combination_containing_a_colon_survives(self):
        # The combination is everything after the first "quick:", so a key
        # named with a colon still round-trips.
        self.assertEqual((QUICK_KIND, "Ctrl+:"), parseCommand("ir:quick:Ctrl+:"))

    def test_rejects_a_quick_key_with_no_combination(self):
        self.assertIsNone(parseCommand("ir:quick:"))

    def test_plain_commands_still_parse_without_a_combination(self):
        self.assertEqual(("extract", None), parseCommand("ir:extract"))
