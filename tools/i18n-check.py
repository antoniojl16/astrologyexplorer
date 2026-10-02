#!/usr/bin/env python3
"""Check the interface translations (see i18n.js).

    python3 tools/i18n-check.py                  summary: missing / unused / broken per language
    python3 tools/i18n-check.py --missing es     the strings Spanish lacks, as JSON to translate
    python3 tools/i18n-check.py --merge es f.json
                                                 add the translations in f.json to i18n/es.js
    python3 tools/i18n-check.py --prune          also drop unused strings when rewriting

The English strings are collected from the code: the literal arguments of t("…"), N_("…") and
tn(count, "…", "…") in the app's scripts, and the static text of index.html (the same
text nodes and attributes i18nTranslatePage() translates). A tn() string's translation
is an object {one, other, …}; every other translation is a string, and must keep the
English {placeholders}.
"""
import json, os, re, sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = {"i18n.js", "roads.js", "places.js", "astronomy-engine.js", "tz-history.js"}
LANGUAGES = ["es", "de", "hu"]


def js_string(text, i):
    """The JS string literal starting at text[i]: (value, end), or None if it isn't one
    (or is a template with ${…} in it)."""
    quote = text[i]
    if quote not in "'\"`":
        return None
    out, j = [], i + 1
    while j < len(text):
        c = text[j]
        if c == "\\":
            n = text[j + 1]
            out.append({"n": "\n", "t": "\t"}.get(n, n))
            j += 2
            continue
        if c == quote:
            return "".join(out), j + 1
        if quote == "`" and text.startswith("${", j):
            return None
        out.append(c)
        j += 1
    return None


def skip_space(text, i):
    while i < len(text) and text[i] in " \t\r\n":
        i += 1
    return i


def skip_argument(text, i):
    """Skips one call argument (to the comma that ends it)."""
    depth = 0
    while i < len(text):
        c = text[i]
        if c in "([{":
            depth += 1
        elif c in ")]}":
            if depth == 0:
                return i
            depth -= 1
        elif c == "," and depth == 0:
            return i
        elif c in "'\"`":
            literal = js_string(text, i)
            if literal is None:  # a template with ${…}: skip to its closing backtick
                i = text.index("`", i + 1)
            else:
                i = literal[1] - 1
        i += 1
    return i


def code_strings():
    """{english: (file, is_plural)} in order of first appearance."""
    found = {}
    names = sorted(name for name in os.listdir(ROOT) if name.endswith(".js") and name not in SKIP)
    for name in names:
        text = open(os.path.join(ROOT, name), encoding="utf-8").read()
        for match in re.finditer(r"(?<![\w.$])(tn?|N_)\(", text):
            i = skip_space(text, match.end())
            if match.group(1) == "tn":
                i = skip_argument(text, i)
                if i >= len(text) or text[i] != ",":
                    continue
                one = js_string(text, skip_space(text, i + 1))
                if not one:
                    continue
                i = skip_space(text, one[1])
                if text[i] != ",":
                    continue
                other = js_string(text, skip_space(text, i + 1))
                if other:
                    found.setdefault(other[0], (name, True))
            else:
                literal = js_string(text, i)
                if literal:
                    found.setdefault(literal[0], (name, False))
    return found


def normalize(text):
    return re.sub(r"\s+", " ", text).strip()


def translatable(text):
    text = normalize(text)
    return len(text) > 1 and re.search(r"[^\W\d_]", text) is not None


class PageText(HTMLParser):
    """The text i18nTranslatePage() looks up, in document order."""
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}

    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.source, self.found, self.stack = source, [], []
        self.in_body = False

    def skipping(self):
        return any(entry["skip"] for entry in self.stack)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "body":
            self.in_body = True
        if not self.in_body:
            return
        skip = attrs.get("translate") == "no" or tag in ("script", "style") or self.skipping()
        if not skip:
            for name in ("title", "placeholder", "aria-label"):
                if attrs.get(name) and translatable(attrs[name]):
                    self.found.append(normalize(attrs[name]))
        if tag in self.VOID:
            return
        entry = {"tag": tag, "skip": skip, "html": None}
        if "data-i18n-html" in attrs and not skip:
            entry["html"] = self.getpos()
            entry["start"] = self.offset_of(self.getpos()) + len(self.get_starttag_text())
            entry["skip"] = True
        self.stack.append(entry)

    def offset_of(self, position):
        line, column = position
        lines = self.source.split("\n")
        return sum(len(item) + 1 for item in lines[: line - 1]) + column

    def handle_endtag(self, tag):
        if tag in self.VOID or not self.in_body:
            return
        while self.stack:
            entry = self.stack.pop()
            if entry["html"] is not None:
                inner = self.source[entry["start"] : self.offset_of(self.getpos())]
                self.found.append(normalize(inner))
            if entry["tag"] == tag:
                break

    def handle_data(self, data):
        if self.in_body and not self.skipping() and translatable(data):
            self.found.append(normalize(data))


def page_strings():
    source = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    parser = PageText(source)
    parser.feed(source)
    return parser.found


def all_strings():
    strings = {key: value for key, value in code_strings().items()}
    for text in page_strings():
        strings.setdefault(text, ("index.html", False))
    return strings


def language_path(code):
    return os.path.join(ROOT, "i18n", f"{code}.js")


HEADER = """// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// {name} interface strings, keyed by the English (see i18n.js). Maintained with
// tools/i18n-check.py; the JSON between the braces must stay valid JSON.
Object.assign(I18N_TRANSLATIONS, """
NAMES = {"es": "Spanish", "de": "German", "hu": "Hungarian"}


def load(code):
    path = language_path(code)
    if not os.path.exists(path):
        return {}
    text = open(path, encoding="utf-8").read()
    return json.loads(text[text.index("{", text.index("Object.assign")) : text.rindex("}") + 1])


def save(code, table, strings, prune):
    ordered = {key: table[key] for key in strings if key in table}
    if not prune:
        ordered.update({key: value for key, value in table.items() if key not in ordered})
    os.makedirs(os.path.dirname(language_path(code)), exist_ok=True)
    body = json.dumps(ordered, ensure_ascii=False, indent=0)
    with open(language_path(code), "w", encoding="utf-8") as file:
        file.write(HEADER.format(name=NAMES[code]) + body + ");\n")


def placeholders(text):
    return sorted(set(re.findall(r"\{(\w+)\}", text)))


def problems(strings, table):
    found = []
    for key, value in table.items():
        if key not in strings:
            continue
        plural = strings[key][1]
        values = value.values() if isinstance(value, dict) else [value]
        if plural and not isinstance(value, (dict, str)):
            found.append((key, "plural translation should be an object"))
        if not plural and not isinstance(value, str):
            found.append((key, "translation should be a string"))
        expected = placeholders(key) + (["n"] if plural and "n" not in placeholders(key) else [])
        for item in values:
            extra = set(placeholders(item)) - set(expected)
            if extra:
                found.append((key, f"unknown placeholder {sorted(extra)}"))
            if not plural:
                gone = set(placeholders(key)) - set(placeholders(item))
                if gone:
                    found.append((key, f"drops placeholder {sorted(gone)}"))
    return found


def main(args):
    strings = all_strings()
    prune = "--prune" in args
    if "--missing" in args:
        code = args[args.index("--missing") + 1]
        table = load(code)
        missing = {}
        for key, (name, plural) in strings.items():
            if key not in table:
                missing[key] = {"one": "", "other": ""} if plural else ""
        print(json.dumps(missing, ensure_ascii=False, indent=1))
        return
    if "--merge" in args:
        code = args[args.index("--merge") + 1]
        additions = json.load(open(args[args.index("--merge") + 2], encoding="utf-8"))
        table = load(code)
        table.update({key: value for key, value in additions.items() if value})
        save(code, table, strings, prune)
        print(f"{code}: merged {len(additions)}")
        return
    print(f"{len(strings)} English strings")
    for code in LANGUAGES:
        table = load(code)
        if prune:
            save(code, table, strings, True)
        missing = [key for key in strings if key not in table]
        unused = [key for key in table if key not in strings]
        print(f"{code}: {len(table)} translated, {len(missing)} missing, {len(unused)} unused")
        for key, problem in problems(strings, table):
            print(f"  {problem}: {key[:80]!r}")


if __name__ == "__main__":
    main(sys.argv[1:])
