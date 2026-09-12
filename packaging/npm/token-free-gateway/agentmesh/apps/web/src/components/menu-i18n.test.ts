import assert from "node:assert/strict";
import { test } from "node:test";
import { getMenuTranslation, MENU_TRANSLATIONS } from "./menu-i18n.js";
import { NAV_GROUPS } from "./sidebar-config.js";

test("getMenuTranslation: returns Korean translations by default and for 'ko'", () => {
	const ko = getMenuTranslation("ko");
	assert.ok(ko, "Korean menu translations should exist");
	assert.equal(ko.groups.core, "코어 & 채팅");
	assert.equal(ko.items.dashboard, "대시보드");
	assert.equal(ko.items["agent-cast"], "에이전트 캐스트");
	assert.equal(ko.items["agent-mesh"], "에이전트 메쉬");
	assert.equal(ko.items.desktop, "웹 데스크톱");
	assert.equal(ko.items.models, "LLM 모델 허브");
	assert.equal(ko.footer.peerMesh, "P2P 메쉬");
});

test("getMenuTranslation: all sidebar groups and items have valid Korean translations", () => {
	const ko = MENU_TRANSLATIONS.ko;
	for (const group of NAV_GROUPS) {
		assert.ok(
			ko.groups[group.id],
			`Expected group '${group.id}' to have a Korean translation`,
		);
		for (const item of group.items) {
			assert.ok(
				ko.items[item.id],
				`Expected item '${item.id}' in group '${group.id}' to have a Korean translation`,
			);
		}
	}
});

test("getMenuTranslation: supports 8 languages with groups and items populated", () => {
	const supportedLanguages = ["ko", "en", "ja", "zh", "es", "de", "fr", "pt"] as const;
	for (const lang of supportedLanguages) {
		const trans = getMenuTranslation(lang);
		assert.ok(trans, `Expected translation for ${lang}`);
		assert.ok(trans.groups.core, `Expected core group translation for ${lang}`);
		assert.ok(trans.items.dashboard, `Expected dashboard translation for ${lang}`);
		assert.ok(trans.footer.brandSubtitle, `Expected brand subtitle for ${lang}`);
	}
});
