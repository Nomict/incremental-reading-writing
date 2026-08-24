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

/* Keeps the floating panels out of the text.
 *
 * The table of contents and the shortcut legend are position:fixed, so they sit
 * over the card rather than beside it. Text underneath them cannot be read, and
 * cannot be clicked into when editing during review. Rather than move the
 * panels, this pads the body so the text stops short of them.
 *
 * Panels register the element they draw; the padding is measured from where
 * that element actually lands, not from an assumed width, so a panel that
 * changes size -- collapsing, or a long deck name -- stays accounted for.
 */
(function () {
    if (window.IRGutters) {
        return;
    }

    // Breathing room between the text and a panel.
    const GAP = 12;

    // Below this the card is not worth reading, so panels give way instead:
    // they are asked to go compact, and only then is the padding applied.
    const MIN_CONTENT_WIDTH = 320;

    const panels = {};

    function measure(side, el) {
        const panel = el.getBoundingClientRect();
        // The body's own margins are already part of this; padding is applied
        // inside it, so this edge does not move as a result of what we set.
        const body = document.body.getBoundingClientRect();

        if (side === "left") {
            return Math.max(0, panel.right + GAP - body.left);
        }
        return Math.max(0, body.right - panel.left + GAP);
    }

    function totals() {
        const wanted = { left: 0, right: 0 };
        for (const id of Object.keys(panels)) {
            const panel = panels[id];
            if (!panel.el.isConnected) {
                continue;
            }
            wanted[panel.side] = Math.max(wanted[panel.side], measure(panel.side, panel.el));
        }
        return wanted;
    }

    function setPadding(wanted) {
        document.body.style.paddingLeft = wanted.left ? wanted.left + "px" : "";
        document.body.style.paddingRight = wanted.right ? wanted.right + "px" : "";
    }

    function contentWidth(wanted) {
        return document.body.getBoundingClientRect().width - wanted.left - wanted.right;
    }

    function setCompact(compact) {
        let changed = false;
        for (const id of Object.keys(panels)) {
            const panel = panels[id];
            if (panel.setCompact && panel.compact !== compact) {
                panel.setCompact(compact);
                panel.compact = compact;
                changed = true;
            }
        }
        return changed;
    }

    function refresh() {
        if (!document.body) {
            return;
        }

        // Start from no padding so the measurement reflects the panels alone.
        setPadding({ left: 0, right: 0 });

        // A panel that has been squeezed gets a chance to expand again when the
        // window grows, before deciding whether it still needs to be compact.
        setCompact(false);

        let wanted = totals();
        if (contentWidth(wanted) < MIN_CONTENT_WIDTH && setCompact(true)) {
            wanted = totals();
        }

        setPadding(wanted);
    }

    let pending = null;
    function scheduleRefresh() {
        // Resizing fires continuously, and each refresh reads layout.
        if (pending !== null) {
            return;
        }
        pending = window.requestAnimationFrame(function () {
            pending = null;
            refresh();
        });
    }

    window.addEventListener("resize", scheduleRefresh);

    window.IRGutters = {
        /* side: "left" | "right". setCompact is optional, and is called with
         * true when there is not enough room left for the card. */
        register: function (id, side, el, setCompact) {
            panels[id] = { side: side, el: el, setCompact: setCompact, compact: false };
            refresh();
        },

        unregister: function (id) {
            delete panels[id];
            refresh();
        },

        refresh: refresh,

        // Leaves the body as it was found, for when no panel is on screen.
        reset: function () {
            for (const id of Object.keys(panels)) {
                delete panels[id];
            }
            document.body.style.paddingLeft = "";
            document.body.style.paddingRight = "";
        }
    };
})();
