#!/usr/bin/env python3
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

"""Builds the installable .ankiaddon, and checks it before handing it over.

Anki installs an add-on from a zip whose root holds manifest.json and the
package's __init__.py -- the contents of ir/, not the ir/ directory itself.
Getting that wrong produces a file Anki rejects with an unhelpful message, so
the structure is asserted here rather than discovered later.

Run it with no arguments from the repository root:

    python3 scripts/build_addon.py
"""

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKAGE_DIR = ROOT / "ir"

# Shipped alongside the package so the licence travels with the add-on.
EXTRA_FILES = ["LICENSE.md"]

EXCLUDED_DIRS = {"__pycache__", ".mypy_cache", ".ropeproject", ".pytest_cache"}
EXCLUDED_SUFFIXES = {".pyc", ".pyo"}

# Anki imports the add-on directory as a Python package, and the reviewer
# scripts are loaded by name, so a missing one fails only at review time.
REQUIRED_IN_ZIP = [
    "manifest.json",
    "__init__.py",
    "main.py",
    "view.py",
    "text.py",
    "legend.py",
    "settings.py",
    "web/gutters.js",
    "web/shortcut_legend.js",
    "web/table_of_contents.js",
    "web/scroll.js",
    "web/text.js",
    "web/model.css",
]


def version() -> str:
    source = (PACKAGE_DIR / "_version.py").read_text(encoding="utf-8")
    match = re.search(r'__version__\s*=\s*"([^"]+)"', source)
    if not match:
        raise SystemExit("could not read __version__ from ir/_version.py")
    return match.group(1)


def included(path: Path) -> bool:
    if any(part in EXCLUDED_DIRS for part in path.parts):
        return False
    return path.suffix not in EXCLUDED_SUFFIXES


def build(out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / f"incremental-reading-{version()}.ankiaddon"
    if target.exists():
        target.unlink()

    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(PACKAGE_DIR.rglob("*")):
            if not path.is_file() or not included(path.relative_to(PACKAGE_DIR)):
                continue
            # Written at its path inside ir/, so manifest.json lands at the root.
            archive.write(path, path.relative_to(PACKAGE_DIR).as_posix())

        for name in EXTRA_FILES:
            source = ROOT / name
            if source.is_file():
                archive.write(source, name)

    return target


def verify(target: Path) -> None:
    problems = []

    with zipfile.ZipFile(target) as archive:
        if archive.testzip() is not None:
            problems.append("the archive is corrupt")

        names = archive.namelist()

        for required in REQUIRED_IN_ZIP:
            if required not in names:
                problems.append(f"{required} is missing from the archive root")

        junk = [n for n in names if "__pycache__" in n or n.endswith((".pyc", ".pyo"))]
        if junk:
            problems.append(f"compiled leftovers were included: {junk[:3]}")

        if "ir/manifest.json" in names or any(n.startswith("ir/") for n in names):
            problems.append(
                "the ir/ directory was zipped instead of its contents; "
                "Anki needs manifest.json at the root"
            )

        if "manifest.json" in names:
            manifest = json.loads(archive.read("manifest.json"))
            package = manifest.get("package", "")

            # Anki does __import__(dir_name), so the package has to be importable.
            if not package.isidentifier():
                problems.append(
                    f'package "{package}" is not a valid Python module name, '
                    "so Anki cannot import it"
                )
            # A numeric name is treated as an AnkiWeb id and gets overwritten by
            # AnkiWeb updates, which would silently undo this build.
            if package.isdigit():
                problems.append(
                    f'package "{package}" looks like an AnkiWeb id, so AnkiWeb '
                    "updates would replace this build"
                )
            if not manifest.get("name"):
                problems.append("the manifest has no name")

    if problems:
        print(f"{target.name} is not installable:", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        raise SystemExit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        default=str(ROOT / "dist"),
        help="directory to write the .ankiaddon into (default: dist)",
    )
    args = parser.parse_args()

    target = build(Path(args.out))
    verify(target)

    with zipfile.ZipFile(target) as archive:
        count = len(archive.namelist())
    size = target.stat().st_size / 1024

    print(f"built {target}")
    print(f"  {count} files, {size:.0f} KB")
    print("  install with Tools -> Add-ons -> Install from file")


if __name__ == "__main__":
    main()
