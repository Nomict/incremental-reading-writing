# Copyright 2013 Tiago Barroso
# Copyright 2013 Frank Kmiec
# Copyright 2013-2016 Aleksej
# Copyright 2017 Christian Weiß
# Copyright 2018 Timothée Chauvin
# Copyright 2017-2019 Joseph Lorimer <joseph@lorimer.me>
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

from collections import defaultdict

from anki.decks import DeckId
from anki.notes import Note
from aqt import mw
from aqt.addcards import AddCards
from aqt.editcurrent import EditCurrent
from aqt.utils import getText, showInfo, showWarning, tooltip

from .settings import SettingsManager
from .util import fixImages, getField, setField

SCHEDULE_EXTRACT = 0


class TextManager:
    _history = defaultdict(list)
    _settings: SettingsManager = None

    # True while the caret sits in a field with nothing selected. That is
    # typing, and the text commands are bound to bare letters, so they have to
    # stay out of the way.
    #
    # Focus alone is not the test. With the editing add-on's ctrl_click option
    # off, every field is permanently contenteditable, and selecting text means
    # clicking in it -- so the field is always focused at the moment a command
    # is wanted, and gating on focus made extract impossible for those users.
    # A selection is the signal instead: every one of these commands acts on
    # one, and typing does not begin with text selected.
    _IS_TYPING_JS = """
(function () {
    var active = document.activeElement;
    var inField = !!(
        document.hasFocus() &&
        active && active.closest && active.closest("[data-EFDRCfield]")
    );
    if (!inField) {
        return false;
    }
    var selection = window.getSelection();
    return !selection || selection.isCollapsed || !selection.toString().trim();
})()
"""

    # True while a field is focused at all, selection or not. Only undo uses
    # this: it needs no selection, and its mw.reset() pulls the reviewer to
    # another card, which would take unsaved typing with it.
    _IS_EDITING_JS = """
(function () {
    if (document.querySelector("#qa[data-efdrc-editing]")) {
        return true;
    }
    if (!document.hasFocus()) {
        return false;
    }
    var active = document.activeElement;
    return !!(active && active.closest && active.closest("[data-EFDRCfield]"));
})()
"""

    def changeProfile(self, settings: SettingsManager):
        self._settings = settings

    def _evalUnlessTyping(self, script):
        """Run script against the current card, unless the user is typing."""
        mw.web.eval(f"if (!{self._IS_TYPING_JS}) {{ {script} }}")

    def highlight(self, bgColor=None, textColor=None):
        if not bgColor:
            bgColor = self._settings["highlightBgColor"]
        if not textColor:
            textColor = self._settings["highlightTextColor"]

        script = f"highlight('{bgColor}', '{textColor}')"
        self._evalUnlessTyping(script)
        self.save()

    def format(self, style):
        self._evalUnlessTyping(f"format('{style}')")
        self.save()

    def toggleOverlay(self):
        self._evalUnlessTyping("toggleOverlay()")
        self.save()

    def extract(self, settings=None):
        if mw.state != "review":
            return

        if not settings:
            settings = self._settings

        getText = "getPlainText()" if settings["plainText"] else "getHtmlText()"

        def callback(text):
            # None means the caret is in a field with nothing selected, so the
            # key press was typing. Say nothing and leave the text alone.
            if text is None:
                return

            if not text and not settings["editExtract"]:
                showInfo("Please select some text to extract.")
                return

            self.create(text, settings)

        # getHtmlText() reads range 0, so guard the empty selection here too.
        mw.web.evalWithCallback(
            f"{self._IS_TYPING_JS}"
            f" ? null"
            f" : (window.getSelection().rangeCount ? ({getText} || '') : '')",
            callback,
        )

    def create(self, text, settings):
        currentCard = mw.reviewer.card
        currentNote = currentCard.note()
        model = mw.col.models.by_name(settings["modelName"])
        newNote = Note(mw.col, model)
        newNote.tags = currentNote.tags
        setField(newNote, settings["textField"], fixImages(text))

        if settings["extractDeck"]:
            deck = mw.col.decks.by_name(settings["extractDeck"])
            if not deck:
                showWarning(
                    "Destination deck no longer exists. Please update your settings."
                )
                return
            did = deck["id"]
        else:
            did = currentCard.did

        if settings["isQuickKey"]:
            newNote.tags += settings["tags"]

            if settings["sourceField"]:
                setField(
                    newNote,
                    settings["sourceField"],
                    getField(currentNote, self._settings["sourceField"]),
                )

            if settings["editExtract"]:
                highlight = self._editExtract(newNote, did, settings)
            else:
                highlight = True
                newNote.note_type()["did"] = did
                mw.col.addNote(newNote)
        else:
            if settings["copyTitle"]:
                title = getField(currentNote, settings["titleField"])
            else:
                title = ""

            setField(
                newNote,
                settings["sourceField"],
                getField(currentNote, settings["sourceField"]),
            )
            if settings["prioEnabled"]:
                setField(
                    newNote,
                    settings["prioField"],
                    getField(currentNote, settings["prioField"]),
                )

            if settings["editExtract"]:
                setField(newNote, settings["titleField"], title)
                highlight = self._editExtract(newNote, did, settings)
            else:
                highlight = self._getTitle(newNote, did, title, settings)

            if settings["scheduleExtract"] and not settings["prioEnabled"]:
                cards = newNote.cards()
                if cards:
                    mw.readingManager.scheduler.answer(cards[0], SCHEDULE_EXTRACT)

        if highlight:
            self.highlight(settings["extractBgColor"], settings["extractTextColor"])

        if settings["editSource"]:
            EditCurrent(mw)

    def _editExtract(self, note: Note, deckId: DeckId, settings: SettingsManager):
        def onAdd():
            self.highlight(settings["extractBgColor"], settings["extractTextColor"])

        addCards = AddCards(mw)
        addCards.set_note(note, deckId)
        addCards.addButton.clicked.connect(onAdd)

        # Do not highlight immediately, but only after the card is added
        return False

    def _getTitle(self, note, did, title, settings):
        title, accepted = getText("Enter title", title="Extract Text", default=title)

        if accepted:
            setField(note, settings["titleField"], title)
            note.note_type()["did"] = did
            mw.col.addNote(note)

        return accepted

    def remove(self):
        self._evalUnlessTyping("removeText()")
        self.save()

    def undo(self):
        # This one touches no DOM, so the check has to be made explicitly.
        # mw.reset() below would otherwise pull the reviewer to another card
        # mid-sentence and take any unsaved edit with it.
        def callback(editing):
            if editing:
                return

            note = mw.reviewer.card.note()

            if note.id not in self._history or not self._history[note.id]:
                showInfo("No undo history for this note.")
                return

            note["Text"] = self._history[note.id].pop()
            # note.flush()
            mw.col.update_note(note)
            mw.reset()
            tooltip("Undone")

        mw.web.evalWithCallback(self._IS_EDITING_JS, callback)

    # Reads back the text container's HTML. If another add-on (e.g. Edit Field
    # During Review) has wrapped the field in its own element, read the inside
    # of that wrapper, so its markup -- attributes and inline handlers and all
    # -- is never stored in the field.
    #
    # This runs while a field is being edited too, which is deliberate. The
    # wrapper holds the raw field value mid-edit, so the inside of it is
    # exactly what belongs in the note; refusing to read it was what lost a
    # highlight applied to selected text with the field focused.
    _READ_TEXT_JS = """
(function () {
    var container = document.getElementsByClassName("ir-text")[0];
    if (!container) {
        return null;
    }
    var field = container.querySelector("[data-EFDRCfield]");
    return field ? field.innerHTML : container.innerHTML;
})();
"""

    def save(self):
        def callback(text):
            if not text:
                return

            note = mw.reviewer.card.note()
            # A command that was suppressed still reaches here, so an unchanged
            # field must not churn the note or stack up undo history.
            if note["Text"] == text:
                return

            self._history[note.id].append(note["Text"])
            note["Text"] = text
            # note.flush()
            mw.col.update_note(note)

        mw.web.evalWithCallback(self._READ_TEXT_JS, callback)
