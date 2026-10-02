// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// Interface languages. English is the source language: every visible string is written
// in English in the code and passed through t() (or tn() when it depends on a count), and
// each language file, i18n/<code>.js, maps those English strings to its translations.
// Anything not translated yet shows in English, so a new or reworded string never
// blocks a release; tools/i18n-check.py lists what each language is missing.
//
// The static text in index.html is translated once, before the app scripts run, by
// i18nTranslatePage(): text nodes, titles, placeholders and aria-labels, except inside
// translate="no"; an element marked data-i18n-html is translated as a whole, markup
// included, so a sentence with links or emphasis stays one string.
//
// Changing the language reloads the page: everything is rendered in one language.

const I18N_LANGUAGES = [
  { code: "en", name: "English", locale: "en-US" },
  { code: "es", name: "Español", locale: "es" },
  { code: "de", name: "Deutsch", locale: "de-DE" },
  { code: "hu", name: "Magyar", locale: "hu-HU" }
];
const I18N_STORAGE_KEY = "orbital-study-language";
// Filled by the language file; values are strings, or for tn() keys {one, other, …}.
const I18N_TRANSLATIONS = {};

// The saved choice, else the first of the browser's languages the app has, else English.
const LANG = (() => {
  const codes = I18N_LANGUAGES.map((language) => language.code);
  try {
    const saved = localStorage.getItem(I18N_STORAGE_KEY);
    if (codes.includes(saved)) return saved;
  } catch {}
  for (const tag of navigator.languages || [navigator.language || "en"]) {
    const code = String(tag).slice(0, 2).toLowerCase();
    if (codes.includes(code)) return code;
  }
  return "en";
})();
// For Intl date and number formats.
const LOCALE = I18N_LANGUAGES.find((language) => language.code === LANG).locale;
document.documentElement.lang = LANG;
// The language file has to be in place before the app scripts render anything, and this
// is the one way to load a script synchronously from a script in the head.
if (LANG !== "en") document.write(`<script src="i18n/${LANG}.js?v=${ORBITAL_VERSION}"><\/script>`);

// Strings looked up but not translated (for the developer console and tests).
const i18nMissing = new Set();

function i18nLookup(key) {
  if (LANG === "en") return undefined;
  const value = I18N_TRANSLATIONS[key];
  if (value === undefined) i18nMissing.add(key);
  return value;
}

function i18nFill(text, vars) {
  return vars ? text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? vars[name] : match)) : text;
}

// t("Chart library"), t("Born in {place}", {place}). A key may end in "@@context" when the
// same English needs different translations (t("Open@@verb")); English shows the part
// before the "@@".
function t(text, vars) {
  const value = i18nLookup(text);
  return i18nFill(typeof value === "string" ? value : text.split("@@")[0], vars);
}

// tn(count, "{n} chart", "{n} charts"): the English plural is the key, and a language's
// value is {one, other} (plus few/many where the language has them), chosen by
// Intl.PluralRules; {n} is the count.
function tn(count, one, other, vars) {
  const all = { n: count, ...vars };
  const value = i18nLookup(other);
  if (value && typeof value === "object") {
    const category = new Intl.PluralRules(LOCALE).select(count);
    return i18nFill(value[category] ?? value.other, all);
  }
  if (typeof value === "string") return i18nFill(value, all);
  return i18nFill((count === 1 ? one : other).split("@@")[0], all);
}

// Marks an English name for translation without translating it: for data the code also
// uses as an identifier (signs, planets, Human Design terms…), shown later with tName().
// tools/i18n-check.py collects N_("…") strings like t("…") ones.
function N_(text) {
  return text;
}

// A display name for a stored English value (a sign, planet, system or the like) that
// the code also uses as an identifier; the stored value itself never changes.
function tName(name) {
  return name == null || name === "" ? name : t(String(name));
}

const I18N_ATTRIBUTES = ["title", "placeholder", "aria-label"];

function i18nNormalize(text) {
  return text.replace(/\s+/g, " ").trim();
}

// Text with a letter in it, other than a single character (key names like N or J).
function i18nTranslatable(text) {
  const normalized = i18nNormalize(text);
  return normalized.length > 1 && /\p{L}/u.test(normalized);
}

function i18nTranslatePage(root = document.body) {
  if (LANG === "en") return;
  const visit = (element) => {
    if (element.getAttribute("translate") === "no" || ["SCRIPT", "STYLE"].includes(element.tagName)) return;
    I18N_ATTRIBUTES.forEach((name) => {
      const text = element.getAttribute(name);
      if (text && i18nTranslatable(text)) element.setAttribute(name, t(i18nNormalize(text)));
    });
    if (element.hasAttribute("data-i18n-html")) {
      element.innerHTML = t(i18nNormalize(element.innerHTML));
      return;
    }
    element.childNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) visit(node);
      else if (node.nodeType === Node.TEXT_NODE && i18nTranslatable(node.nodeValue)) {
        const text = node.nodeValue;
        const lead = text.match(/^\s*/)[0];
        const trail = text.match(/\s*$/)[0];
        node.nodeValue = lead + t(i18nNormalize(text)) + trail;
      }
    });
  };
  visit(root);
}

// The language picker in the top bar: the code shows, the native select opens over it.
function i18nBindPicker() {
  const select = document.getElementById("languageSelect");
  if (!select) return;
  select.innerHTML = I18N_LANGUAGES.map((language) => `<option value="${language.code}"${language.code === LANG ? " selected" : ""}>${language.name}</option>`).join("");
  document.getElementById("languageCode").textContent = LANG.toUpperCase();
  select.addEventListener("change", () => {
    try { localStorage.setItem(I18N_STORAGE_KEY, select.value); } catch {}
    location.reload();
  });
}
