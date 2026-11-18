#!/usr/bin/env python3
"""Detect vocabulary sets and generate the vocabulary index and week pages."""

from __future__ import annotations

import ast
import html
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
WORDS_FILE = ROOT / "words.json"
SCRIPT_FILE = ROOT / "script.js"

JS_OBJECTS = re.compile(
    r"\{\s*"
    r"word\s*:\s*(['\"])(.*?)\1\s*,"
    r"\s*hint\s*:\s*(['\"])(.*?)\3\s*,"
    r"\s*definition\s*:\s*(['\"])(.*?)\5\s*"
    r"\}",
    re.DOTALL,
)


def decode_js_string(value: str) -> str:
    """Decode the simple quoted strings used by the HTML and JavaScript data."""
    try:
        return ast.literal_eval(f'"{value}"')
    except (SyntaxError, ValueError):
        return value.replace("\\'", "'").replace("\\\"", '"')


def extract_js_objects(text: str) -> list[dict[str, str]]:
    words = []
    for match in JS_OBJECTS.finditer(text):
        words.append(
            {
                "word": decode_js_string(match.group(2)),
                "hint": decode_js_string(match.group(4)),
                "definition": decode_js_string(match.group(6)),
            }
        )
    return words


def extract_embedded_json(text: str) -> list[dict[str, str]]:
    match = re.search(
        r"window\.SPELLWELL_WORDS\s*=\s*(\[[\s\S]*?\]);",
        text,
    )
    if not match:
        return []
    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError:
        return []
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    return []


def week_number_for_html(path: Path, text: str) -> int | None:
    title_match = re.search(r"<title[^>]*>(.*?)</title>", text, re.DOTALL | re.IGNORECASE)
    title = re.sub("<[^>]+>", "", title_match.group(1)) if title_match else ""
    course_match = re.search(
        r"(?:Vocab(?:ulary)?|Week)[^0-9]*(\d+)",
        f"{title} {path.stem}",
        re.IGNORECASE,
    )
    if course_match:
        return int(course_match.group(1))

    number_match = re.search(r"(?:^|[-_])(\d+)(?:$|[-_])", path.stem)
    return int(number_match.group(1)) if number_match else None


def detect_weeks() -> dict[str, list[dict[str, str]]]:
    detected: dict[str, list[dict[str, str]]] = {}

    if WORDS_FILE.exists():
        try:
            existing = json.loads(WORDS_FILE.read_text(encoding="utf-8"))
            if isinstance(existing, dict):
                for week, words in existing.items():
                    if isinstance(words, list):
                        detected[str(int(week))] = [
                            item for item in words
                            if isinstance(item, dict)
                            and all(key in item for key in ("word", "hint", "definition"))
                        ]
        except (json.JSONDecodeError, ValueError):
            print("Warning: words.json was invalid and was ignored.", file=sys.stderr)

    for path in sorted(ROOT.glob("*.html")):
        if path.name == "index.html" or re.match(r"^week[-_]?\d+\.html$", path.name, re.I):
            continue

        text = path.read_text(encoding="utf-8")
        week = week_number_for_html(path, text)
        words = extract_embedded_json(text)

        if not words:
            inline_scripts = re.findall(
                r"<script(?:[^>]*)>(.*?)</script>",
                text,
                re.DOTALL | re.IGNORECASE,
            )
            for script in inline_scripts:
                words = extract_js_objects(script)
                if words:
                    break

        if not words:
            for src_match in re.finditer(
                r"<script[^>]+src=['\"]([^'\"]+)['\"]",
                text,
                re.IGNORECASE,
            ):
                linked = (path.parent / src_match.group(1)).resolve()
                if linked.is_file():
                    words = extract_js_objects(linked.read_text(encoding="utf-8"))
                    if words:
                        break

        if week is not None and words:
            detected[str(week)] = words

    direct_script_words = extract_js_objects(SCRIPT_FILE.read_text(encoding="utf-8")) if SCRIPT_FILE.exists() else []
    if direct_script_words:
        for path in (ROOT / "index.html",):
            if path.exists():
                week = week_number_for_html(path, path.read_text(encoding="utf-8"))
                if week is not None:
                    detected.setdefault(str(week), direct_script_words)

    return dict(sorted(detected.items(), key=lambda item: int(item[0])))


def week_page(week: str, words: list[dict[str, str]]) -> str:
    data = json.dumps(words, ensure_ascii=False)
    return f"""<!doctype html>
<html lang="en">

<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#f5f5f0">
  <meta name="vocab-week" content="{html.escape(week)}">
  <title>AP Lang Vocab {html.escape(week)} — Spellwell</title>
  <link rel="stylesheet" href="style.css">
</head>

<body>
  <div class="shell">
    <header class="top">
      <div class="brand"><span class="mark">✳</span><span>spellwell</span></div>
      <div class="course">AP Lang Vocab {html.escape(week)}</div>
    </header>
    <main id="app" class="panel" aria-live="polite"></main>
  </div>
  <div id="confetti" class="confetti" aria-hidden="true"></div>
  <script>
    window.SPELLWELL_WEEK = {json.dumps(int(week))};
    window.SPELLWELL_WORDS = {data};
  </script>
  <script src="script.js"></script>
</body>

</html>
"""


def index_page(weeks: dict[str, list[dict[str, str]]]) -> str:
    links = "\n".join(
        f'        <a class="week-link" href="week-{week}.html">'
        f'<span>Week {html.escape(week)}</span><small>{len(words)} words →</small></a>'
        for week, words in weeks.items()
    )
    if not links:
        links = '<p class="sub">No vocabulary weeks detected yet.</p>'

    return f"""<!doctype html>
<html lang="en">

<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#f5f5f0">
  <title>AP Lang Vocabulary — Spellwell</title>
  <link rel="stylesheet" href="style.css">
</head>

<body>
  <div class="shell">
    <header class="top">
      <div class="brand"><span class="mark">✳</span><span>spellwell</span></div>
      <div class="course">AP Lang Vocabulary</div>
    </header>
    <main class="panel">
      <section class="screen">
        <div class="intro">
          <div class="spark">✳</div>
          <h1>Choose a vocabulary week.</h1>
          <p class="sub">Practice each AP Lang vocabulary set and try to improve your personal best.</p>
          <nav class="week-list" aria-label="Vocabulary weeks">
{links}
          </nav>
        </div>
      </section>
    </main>
  </div>
</body>

</html>
"""


def main() -> int:
    weeks = detect_weeks()
    if not weeks:
        print("No vocabulary weeks detected.", file=sys.stderr)
        return 1

    WORDS_FILE.write_text(
        json.dumps(weeks, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    for week, words in weeks.items():
        (ROOT / f"week-{week}.html").write_text(
            week_page(week, words),
            encoding="utf-8",
        )

    (ROOT / "index.html").write_text(index_page(weeks), encoding="utf-8")

    print(f"Generated words.json and {len(weeks)} week page(s):")
    for week in weeks:
        print(f"  - week-{week}.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
