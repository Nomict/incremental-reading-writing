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

// IR_LEGEND is set in the Python code, from the user's own key settings, so
// the legend always shows the bindings that are actually in effect.

const IR_LEGEND_STYLE_ID = "ir-legend-style";
const IR_LEGEND_ID = "ir-legend";
const IR_LEGEND_COLLAPSED_KEY = "ir-legend-collapsed";

// The stylesheet is added once per webview, not once per card. The reviewer
// page is not reloaded between cards, so appending it on every render would
// pile up a duplicate <style> for every card seen in a session.
function addLegendStyles() {
    if (document.getElementById(IR_LEGEND_STYLE_ID)) {
        return;
    }

    const style = document.createElement("style");
    style.id = IR_LEGEND_STYLE_ID;
    // Colours follow Anki's own theme via the nightMode body class rather than
    // the OS setting, since Anki can be dark on a light desktop.
    style.textContent = `
        #${IR_LEGEND_ID} {
            position: fixed;
            bottom: 16px;
            left: 16px;
            z-index: 1000;
            max-width: 260px;
            max-height: 70vh;
            overflow-y: auto;
            margin: auto;
            padding: 0;
            border: 1px solid #ddd;
            border-radius: 5px;
            background-color: #fff;
            color: #333;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
            font-size: 12px;
            line-height: 1.5;
            text-align: left;
            opacity: 0.45;
            transition: opacity 0.3s;
            user-select: none;
        }

        #${IR_LEGEND_ID}:hover {
            opacity: 1;
        }

        body.nightMode #${IR_LEGEND_ID},
        body.night_mode #${IR_LEGEND_ID} {
            border-color: #4a4a50;
            background-color: #2a2a2f;
            color: #e0e0e4;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.4);
        }

        #${IR_LEGEND_ID} .ir-legend-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin: auto;
            padding: 4px 8px 4px 10px;
            border-bottom: 1px solid #ddd;
            background-color: #f5f5f5;
            font-weight: bold;
            cursor: pointer;
        }

        body.nightMode #${IR_LEGEND_ID} .ir-legend-header,
        body.night_mode #${IR_LEGEND_ID} .ir-legend-header {
            border-bottom-color: #4a4a50;
            background-color: #34343a;
        }

        #${IR_LEGEND_ID} .ir-legend-body {
            margin: auto;
            padding: 6px 10px 8px;
        }

        #${IR_LEGEND_ID} .ir-legend-group {
            margin-top: 6px;
            opacity: 0.65;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }

        #${IR_LEGEND_ID} .ir-legend-group:first-child {
            margin-top: 0;
        }

        #${IR_LEGEND_ID} .ir-legend-row {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 10px;
        }

        #${IR_LEGEND_ID} .ir-legend-label {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        #${IR_LEGEND_ID} .ir-legend-keys {
            flex: none;
            white-space: nowrap;
        }

        #${IR_LEGEND_ID} kbd {
            display: inline-block;
            min-width: 12px;
            padding: 0 4px;
            border: 1px solid #ccc;
            border-bottom-width: 2px;
            border-radius: 3px;
            background-color: #fafafa;
            color: #222;
            font-family: inherit;
            font-size: 11px;
            text-align: center;
        }

        body.nightMode #${IR_LEGEND_ID} kbd,
        body.night_mode #${IR_LEGEND_ID} kbd {
            border-color: #56565e;
            background-color: #3c3c43;
            color: #f0f0f4;
        }

        #${IR_LEGEND_ID} .ir-legend-plus {
            opacity: 0.5;
            padding: 0 1px;
        }

        #${IR_LEGEND_ID}.ir-legend-collapsed .ir-legend-body {
            display: none;
        }
    `;

    document.head.appendChild(style);
}

function isLegendCollapsed() {
    try {
        return window.localStorage.getItem(IR_LEGEND_COLLAPSED_KEY) === "1";
    } catch (e) {
        // Storage can be unavailable; a legend that will not remember its
        // state is better than one that throws on the way in.
        return false;
    }
}

function setLegendCollapsed(collapsed) {
    try {
        window.localStorage.setItem(IR_LEGEND_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch (e) {
        /* nothing to do */
    }
}

// "Ctrl+Shift+O" becomes separate <kbd> elements so it reads as keys rather
// than as a string. Built as nodes, never as innerHTML, because the labels
// include deck and note type names the user chose.
function createKeysElement(shortcut) {
    const keys = document.createElement("span");
    keys.className = "ir-legend-keys";

    const parts = String(shortcut).split("+");
    parts.forEach((part, index) => {
        if (index > 0) {
            const plus = document.createElement("span");
            plus.className = "ir-legend-plus";
            plus.textContent = "+";
            keys.appendChild(plus);
        }
        const kbd = document.createElement("kbd");
        kbd.textContent = part.trim();
        keys.appendChild(kbd);
    });

    return keys;
}

function createRowElement(item) {
    const row = document.createElement("div");
    row.className = "ir-legend-row";

    const label = document.createElement("span");
    label.className = "ir-legend-label";
    label.textContent = item.label;
    label.title = item.label;

    row.appendChild(label);
    row.appendChild(createKeysElement(item.key));
    return row;
}

function createLegendElement(data) {
    const legend = document.createElement("div");
    legend.id = IR_LEGEND_ID;

    const header = document.createElement("div");
    header.className = "ir-legend-header";

    const title = document.createElement("span");
    title.textContent = data.title;

    const toggle = document.createElement("span");
    toggle.className = "ir-legend-toggle";

    header.appendChild(title);
    header.appendChild(toggle);

    const body = document.createElement("div");
    body.className = "ir-legend-body";

    for (const group of data.groups) {
        if (!group.items.length) {
            continue;
        }
        if (group.name) {
            const heading = document.createElement("div");
            heading.className = "ir-legend-group";
            heading.textContent = group.name;
            body.appendChild(heading);
        }
        for (const item of group.items) {
            body.appendChild(createRowElement(item));
        }
    }

    legend.appendChild(header);
    legend.appendChild(body);

    const applyCollapsed = (collapsed) => {
        legend.classList.toggle("ir-legend-collapsed", collapsed);
        toggle.textContent = collapsed ? "+" : "−";
    };

    applyCollapsed(isLegendCollapsed());

    header.addEventListener("click", () => {
        const collapsed = !legend.classList.contains("ir-legend-collapsed");
        applyCollapsed(collapsed);
        setLegendCollapsed(collapsed);
        // Collapsing frees the space it was holding, so give it back.
        if (window.IRGutters) {
            window.IRGutters.refresh();
        }
    });

    // Collapsing is how the legend gets out of the way when the window is too
    // narrow for both it and a readable card.
    legend.__irSetCompact = (compact) => {
        if (compact) {
            applyCollapsed(true);
        } else {
            applyCollapsed(isLegendCollapsed());
        }
    };

    return legend;
}

function removeLegendElement() {
    const existing = document.getElementById(IR_LEGEND_ID);
    if (existing) {
        existing.remove();
    }
    if (window.IRGutters) {
        window.IRGutters.unregister(IR_LEGEND_ID);
    }
}

function createShortcutLegend() {
    removeLegendElement();

    if (typeof IR_LEGEND === "undefined" || !IR_LEGEND.groups) {
        return;
    }

    addLegendStyles();
    const legend = createLegendElement(IR_LEGEND);
    document.body.appendChild(legend);

    // Reserve the strip it occupies so the card text stops short of it rather
    // than running underneath, where it can be neither read nor clicked into.
    if (window.IRGutters) {
        window.IRGutters.register(
            IR_LEGEND_ID,
            "left",
            legend,
            legend.__irSetCompact
        );
    }
}

// The legend lives on document.body, which survives the card being replaced.
// Anki does not run this script on the answer side or on a non-IR card, so
// those renders call this to take the legend away again.
window.__irLegendRemove = removeLegendElement;

// Hook into Anki's onUpdateHook (https://addon-docs.ankiweb.net/reviewer-javascript.html)
onUpdateHook.push(createShortcutLegend);
