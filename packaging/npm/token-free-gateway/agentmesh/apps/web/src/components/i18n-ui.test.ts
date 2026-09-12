import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getMenuTranslation,
  MENU_TRANSLATIONS,
  type NavI18n,
} from "./menu-i18n.js";
import { SUPPORTED_LANGUAGES, SUPPORTED_LANG_CODES, useI18n, getCurrentLanguage, setLanguage } from "../i18n.js";
import { NAV_GROUPS } from "./sidebar-config.js";

test("menu-i18n: all 8 languages have complete group translations", () => {
  for (const lang of SUPPORTED_LANG_CODES) {
    const trans = getMenuTranslation(lang);
    assert.ok(trans.groups, `${lang}: groups should exist`);
    for (const group of NAV_GROUPS) {
      assert.ok(
        trans.groups[group.id],
        `${lang}: missing group '${group.id}'`,
      );
      for (const item of group.items) {
        assert.ok(
          trans.items[item.id],
          `${lang}: item '${item.id}' in group '${group.id}'`,
        );
      }
    }
  }
});

test("menu-i18n: desktop section has all required keys", () => {
  for (const lang of SUPPORTED_LANG_CODES) {
    const trans = getMenuTranslation(lang);
    assert.ok(
      trans.desktop,
      `${lang}: desktop section should exist`,
    );
    assert.ok(
      trans.desktop.searchPlaceholder,
      `${lang}: searchPlaceholder`,
    );
    assert.ok(trans.desktop.allApps, `${lang}: allApps`);
    assert.ok(trans.desktop.quickLaunch, `${lang}: quickLaunch`);
    assert.ok(trans.desktop.operator, `${lang}: operator`);
    assert.ok(trans.desktop.closeAll, `${lang}: closeAll`);
    assert.ok(trans.desktop.lock, `${lang}: lock`);
    assert.ok(trans.desktop.categories, `${lang}: categories`);
    for (const app of ["chat", "terminal", "engine", "editor", "settings", "bitterbot"]) {
      assert.ok(
        trans.desktop.apps?.[app],
        `${lang}: app '${app}'`,
      );
      assert.ok(
        trans.desktop.apps?.[app]?.name,
        `${lang}: app '${app}'.name`,
      );
      assert.ok(
        trans.desktop.apps?.[app]?.description,
        `${lang}: app '${app}'.description`,
      );
    }
  }
});

test("menu-i18n: Korean translations are non-empty and contain Hangul", () => {
  const ko = getMenuTranslation("ko");
  for (const group of NAV_GROUPS) {
    assert.ok(
      ko.groups[group.id],
      `ko: missing group '${group.id}'`,
    );
    for (const item of group.items) {
      if (ko.items[item.id]) {
        assert.ok(
          /[\uAC00-\uD7A3]/.test(ko.items[item.id] || ""),
          `ko: item '${item.id}' should contain Hangul: "${ko.items[item.id]}"`,
        );
      }
    }
  }
  assert.ok(
    /[\uAC00-\uD7A3]/.test(ko.desktop?.searchPlaceholder || ""),
    "ko: searchPlaceholder should be Hangul",
  );
  assert.ok(
    /[\uAC00-\uD7A3]/.test(ko.desktop?.allApps || ""),
    "ko: allApps should be Hangul",
  );
  assert.ok(
    /[\uAC00-\uD7A3]/.test(ko.desktop?.quickLaunch || ""),
    "ko: quickLaunch should be Hangul",
  );
  for (const [appId, app] of Object.entries(ko.desktop?.apps || {})) {
    assert.ok(
      app?.name && /[\uAC00-\uD7A3]/.test(app.name),
      `ko: app '${appId}'.name should be Hangul`,
    );
    assert.ok(
      app?.description && /[\uAC00-\uD7A3]/.test(app.description),
      `ko: app '${appId}'.description should be Hangul`,
    );
  }
});

test("i18n: SUPPORTED_LANGUAGES has 8 entries", () => {
  assert.equal(SUPPORTED_LANGUAGES.length, 8);
  assert.equal(SUPPORTED_LANG_CODES.length, 8);
});

test("i18n: SUPPORTED_LANG_CODES matches languages", () => {
  const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
  assert.deepEqual(codes, SUPPORTED_LANG_CODES);
});

test("i18n: detectInitialLanguage returns valid language", () => {
  const lang = getCurrentLanguage();
  assert.ok(
    SUPPORTED_LANG_CODES.includes(lang),
    `language '${lang}' should be supported`,
  );
});

test("i18n: MENU_TRANSLATIONS has all 8 languages", () => {
  for (const lang of SUPPORTED_LANG_CODES) {
    assert.ok(MENU_TRANSLATIONS[lang], `MENU_TRANSLATIONS['${lang}'] should exist`);
    const trans = MENU_TRANSLATIONS[lang] as NavI18n;
    assert.ok(trans.groups, `${lang}: groups`);
    assert.ok(trans.items, `${lang}: items`);
    assert.ok(trans.footer, `${lang}: footer`);
  }
});

test("i18n: setLanguage updates current language", () => {
  const original = getCurrentLanguage();
  setLanguage("en");
  assert.equal(getCurrentLanguage(), "en");
  setLanguage(original);
});

test("i18n: useI18n is a function", () => {
  assert.equal(typeof useI18n, "function");
});

test("i18n: getMenuTranslation returns consistent objects", () => {
  const ko1 = getMenuTranslation("ko");
  const ko2 = getMenuTranslation("ko");
  assert.equal(ko1.groups.core, ko2.groups.core);
  assert.equal(ko1.items.dashboard, ko2.items.dashboard);
});
