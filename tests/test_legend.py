import json
import os
from unittest import TestCase

# ir/__init__.py imports aqt unless this is set, and that import happens while
# pytest is collecting, before the conftest fixture gets a chance to set it.
os.environ.setdefault("IR_TESTING", "1")

from ir.legend import buildLegendData, legendJson  # noqa: E402

DEFAULT_SETTINGS = {
    "extractKey": "x",
    "highlightKey": "h",
    "removeKey": "z",
    "undoKey": "u",
    "boldSeq": "Ctrl+B",
    "italicSeq": "Ctrl+I",
    "underlineSeq": "Ctrl+U",
    "strikeSeq": "Ctrl+S",
    "overlaySeq": "Ctrl+Shift+O",
    "quickKeys": {},
}


def settings(**overrides):
    merged = dict(DEFAULT_SETTINGS)
    merged.update(overrides)
    return merged


def groupNamed(data, name):
    return next(g for g in data["groups"] if g["name"] == name)


def keysIn(data, name):
    return [item["key"] for item in groupNamed(data, name)["items"]]


def labelsIn(data, name):
    return [item["label"] for item in groupNamed(data, name)["items"]]


class LegendDataTests(TestCase):
    def test_shows_the_configured_text_keys(self):
        data = buildLegendData(settings())

        self.assertEqual(["x", "h", "z", "u"], keysIn(data, "Text"))
        self.assertEqual(
            ["Extract", "Highlight", "Remove", "Undo"], labelsIn(data, "Text")
        )

    def test_follows_rebound_keys(self):
        data = buildLegendData(settings(extractKey="e", boldSeq="Alt+B"))

        self.assertIn("e", keysIn(data, "Text"))
        self.assertNotIn("x", keysIn(data, "Text"))
        self.assertIn("Alt+B", keysIn(data, "Format"))

    def test_omits_a_shortcut_that_has_been_cleared(self):
        data = buildLegendData(settings(strikeSeq=""))

        self.assertNotIn("", keysIn(data, "Format"))
        self.assertNotIn("Strikethrough", labelsIn(data, "Format"))

    def test_includes_zoom(self):
        data = buildLegendData(settings())

        self.assertEqual(["Ctrl++", "Ctrl+-"], keysIn(data, "View"))

    def test_lists_quick_keys_with_their_destination(self):
        data = buildLegendData(
            settings(quickKeys={"Ctrl+Alt+A": {"extractDeck": "Vocabulary"}})
        )

        self.assertEqual(["Ctrl+Alt+A"], keysIn(data, "Quick keys"))
        self.assertEqual(["Add card → Vocabulary"], labelsIn(data, "Quick keys"))

    def test_quick_key_without_a_deck_names_the_current_one(self):
        data = buildLegendData(
            settings(quickKeys={"Ctrl+Alt+B": {"extractDeck": None}})
        )

        self.assertEqual(["Add card → current deck"], labelsIn(data, "Quick keys"))

    def test_quick_keys_group_is_empty_when_none_are_defined(self):
        data = buildLegendData(settings())

        self.assertEqual([], groupNamed(data, "Quick keys")["items"])


class LegendJsonTests(TestCase):
    def test_round_trips(self):
        rendered = legendJson(settings())

        self.assertEqual(buildLegendData(settings()), json.loads(rendered))

    def test_cannot_close_the_script_element_it_is_embedded_in(self):
        # Deck names are the user's own text and land inside a <script> block.
        hostile = {"</script><script>alert(1)</script>": {"extractDeck": "x"}}
        rendered = legendJson(settings(quickKeys=hostile))

        self.assertNotIn("<", rendered)
        self.assertNotIn(">", rendered)
        self.assertIn("\\u003c", rendered)
        # Still valid data once parsed.
        self.assertIn(
            "</script><script>alert(1)</script>",
            [item["key"] for item in groupNamed(json.loads(rendered), "Quick keys")["items"]],
        )

    def test_escaping_survives_a_deck_name_with_an_ampersand(self):
        rendered = legendJson(
            settings(quickKeys={"Ctrl+Alt+C": {"extractDeck": "Books & Papers"}})
        )

        self.assertNotIn("&", rendered)
        self.assertEqual(
            ["Add card → Books & Papers"],
            labelsIn(json.loads(rendered), "Quick keys"),
        )
