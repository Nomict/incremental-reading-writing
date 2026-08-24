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

    # True while a field is focused for editing by an add-on such as Edit Field
    # During Review. The text commands are bound to bare letters, which are also
    # ordinary typing, so they must do nothing while a field has the caret.
    # Written as a self-contained expression so it can be embedded in other
    # snippets. The activeElement branch only applies when the page itself has
    # focus, so a field left active behind a dialog does not count as editing.
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

    def _evalUnlessEditing(self, script):
        """Run script against the current card, unless a field is being edited."""
        mw.web.eval(f"if (!{self._IS_EDITING_JS}) {{ {script} }}")

    def highlight(self, bgColor=None, textColor=None):
        if not bgColor:
            bgColor = self._settings["highlightBgColor"]
        if not textColor:
            textColor = self._settings["highlightTextColor"]

        script = f"highlight('{bgColor}', '{textColor}')"
        self._evalUnlessEditing(script)
        self.save()

    def format(self, style):
        self._evalUnlessEditing(f"format('{style}')")
        self.save()

    def toggleOverlay(self):
        self._evalUnlessEditing("toggleOverlay()")
        self.save()

    def extract(self, settings=None):
        if mw.state != "review":
            return

        if not settings:
            settings = self._settings

        getText = "getPlainText()" if settings["plainText"] else "getHtmlText()"

        def callback(text):
            # None means a field is being edited, so the key press was typing
            # rather than a command. Say nothing and leave the text alone.
            if text is None:
                return

            if not text and not settings["editExtract"]:
                showInfo("Please select some text to extract.")
                return

            self.create(text, settings)

        # getHtmlText() reads range 0, so guard the empty selection here too.
        mw.web.evalWithCallback(
            f"{self._IS_EDITING_JS}"
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
        self._evalUnlessEditing("removeText()")
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
    # of that wrapper instead, so its markup is never stored in the field. The
    # editing flag is passed in rather than tested here, to keep one definition
    # of what editing means; mid-edit the wrapper holds the raw field value and
    # the editing add-on owns saving it.
    _READ_TEXT_JS = """
(function (editing) {
    if (editing) {
        return null;
    }
    var container = document.getElementsByClassName("ir-text")[0];
    if (!container) {
        return null;
    }
    var field = container.querySelector("[data-EFDRCfield]");
    return field ? field.innerHTML : container.innerHTML;
})(%s);
"""

    def save(self):
        def callback(text):
            if text:
                note = mw.reviewer.card.note()
                self._history[note.id].append(note["Text"])
                note["Text"] = text
                # note.flush()
                mw.col.update_note(note)

        mw.web.evalWithCallback(self._READ_TEXT_JS % self._IS_EDITING_JS, callback)
