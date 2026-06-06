// ═══════════════════════════════════════════════════════════════════
// I18N — Simple key-based localization (converted to TS)
// ═══════════════════════════════════════════════════════════════════

import en from "./locales/en.json";
import zh from "./locales/zh.json";

type Locale = Record<string, string>;
const LOCALES: Record<string, Locale> = { en, zh };
const STORAGE_KEY = "dirsiz-lang";

let current = "en";

function detectLang(): string {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && LOCALES[saved]) return saved;
  for (const lang of navigator.languages || []) {
    const code = lang.split("-")[0];
    if (LOCALES[code]) return code;
  }
  return "en";
}

export function initI18n(): void {
  current = detectLang();
  applyAll();
}

export function toggleLang(): void {
  current = current === "zh" ? "en" : "zh";
  localStorage.setItem(STORAGE_KEY, current);
  applyAll();
}

export function getLang(): string {
  return current;
}

export function t(key: string, ...args: string[]): string {
  let text = LOCALES[current]?.[key] ?? LOCALES.en[key] ?? key;
  args.forEach((arg, i) => {
    text = text.replace(`{${i}}`, arg);
  });
  return text;
}

function applyAll(): void {
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    el.innerHTML = t(el.dataset.i18n!);
  }
  for (const el of document.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]")) {
    el.placeholder = t(el.dataset.i18nPlaceholder!);
  }
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n-title]")) {
    el.title = t(el.dataset.i18nTitle!);
  }
  document.documentElement.lang = current;
}
