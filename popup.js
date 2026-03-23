const STORAGE_KEY = "preferredLanguage";

const translations = {
  en: {
    eyebrow: "SMART TAB ORGANIZER",
    title: "Tabs Manager",
    description:
      "Keep pages from the same website next to each other so busy windows stay easier to scan.",
    languageLabel: "Language",
    sortButton: "Organize tabs in this window",
    hint: "The first launch follows your Chrome interface language. You can change it anytime.",
    sorting: "Organizing tabs...",
    tooFewTabs: "There are not enough tabs to organize.",
    alreadySorted: "Your tabs are already organized.",
    success: "Done. Moved {count} tab(s).",
    failed: "Something went wrong. Please try again."
  },
  "zh-TW": {
    eyebrow: "智慧分頁整理",
    title: "Tabs Manager",
    description: "把相同網站的分頁排在一起，讓很多分頁的視窗也更容易閱讀。",
    languageLabel: "語言",
    sortButton: "整理目前視窗分頁",
    hint: "第一次開啟會跟隨 Chrome 介面語言，你之後也可以隨時自行調整。",
    sorting: "正在整理分頁...",
    tooFewTabs: "目前分頁數太少，不需要整理。",
    alreadySorted: "目前已經是整理好的狀態。",
    success: "整理完成，共移動 {count} 個分頁。",
    failed: "整理失敗，請稍後再試。"
  },
  ja: {
    eyebrow: "SMART TAB ORGANIZER",
    title: "Tabs Manager",
    description:
      "同じサイトのタブを隣同士に並べて、タブが多いウィンドウでも見やすく整理します。",
    languageLabel: "言語",
    sortButton: "このウィンドウのタブを整理",
    hint: "初回は Chrome の表示言語に合わせます。あとからいつでも変更できます。",
    sorting: "タブを整理しています...",
    tooFewTabs: "整理するほどタブがありません。",
    alreadySorted: "すでに整理された状態です。",
    success: "{count} 個のタブを移動して整理しました。",
    failed: "整理に失敗しました。もう一度お試しください。"
  }
};

const sortTabsButton = document.getElementById("sortTabsButton");
const statusMessage = document.getElementById("statusMessage");
const languageSelect = document.getElementById("languageSelect");

let currentLanguage = "en";

function normalizeLanguage(language) {
  const normalized = (language || "").toLowerCase();

  if (normalized.startsWith("zh")) {
    return "zh-TW";
  }

  if (normalized.startsWith("ja")) {
    return "ja";
  }

  return "en";
}

function translate(key, values = {}) {
  const template =
    translations[currentLanguage][key] ??
    translations.en[key] ??
    "";

  return template.replace(/\{(\w+)\}/g, (_, token) => values[token] ?? "");
}

function applyLanguage(language) {
  currentLanguage = language;
  document.documentElement.lang = language;

  for (const element of document.querySelectorAll("[data-i18n]")) {
    const key = element.dataset.i18n;
    element.textContent = translate(key);
  }
}

async function initializeLanguage() {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  const browserLanguage = normalizeLanguage(chrome.i18n.getUILanguage());
  const language = normalizeLanguage(stored[STORAGE_KEY] || browserLanguage);

  applyLanguage(language);
  languageSelect.value = language;
}

async function updatePreferredLanguage(language) {
  const normalizedLanguage = normalizeLanguage(language);

  applyLanguage(normalizedLanguage);
  await chrome.storage.sync.set({ [STORAGE_KEY]: normalizedLanguage });
  statusMessage.textContent = "";
}

function setStatus(message) {
  statusMessage.textContent = message;
}

function getGroupKey(urlString) {
  if (!urlString) {
    return "zzz-no-url";
  }

  try {
    const url = new URL(urlString);

    if (url.protocol === "chrome:" || url.protocol === "edge:") {
      return `zzz-${url.protocol}`;
    }

    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch (error) {
    return "zzz-invalid-url";
  }
}

async function sortCurrentWindowTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });

  if (tabs.length <= 1) {
    return { moved: 0, total: tabs.length };
  }

  const orderedTabs = [...tabs]
    .map((tab, originalPosition) => ({
      ...tab,
      originalPosition,
      groupKey: getGroupKey(tab.url)
    }))
    .sort((a, b) => {
      const groupCompare = a.groupKey.localeCompare(b.groupKey);

      if (groupCompare !== 0) {
        return groupCompare;
      }

      return a.originalPosition - b.originalPosition;
    });

  let moved = 0;

  for (let targetIndex = 0; targetIndex < orderedTabs.length; targetIndex += 1) {
    const tab = orderedTabs[targetIndex];

    if (tab.index !== targetIndex) {
      const originalIndex = tab.index;

      await chrome.tabs.move(tab.id, { index: targetIndex });
      moved += 1;

      for (const otherTab of orderedTabs) {
        if (otherTab.id === tab.id) {
          otherTab.index = targetIndex;
        } else if (otherTab.index >= targetIndex && otherTab.index < originalIndex) {
          otherTab.index += 1;
        }
      }
    }
  }

  return { moved, total: orderedTabs.length };
}

languageSelect.addEventListener("change", async (event) => {
  await updatePreferredLanguage(event.target.value);
});

sortTabsButton.addEventListener("click", async () => {
  sortTabsButton.disabled = true;
  setStatus(translate("sorting"));

  try {
    const result = await sortCurrentWindowTabs();

    if (result.total <= 1) {
      setStatus(translate("tooFewTabs"));
    } else if (result.moved === 0) {
      setStatus(translate("alreadySorted"));
    } else {
      setStatus(translate("success", { count: result.moved }));
    }
  } catch (error) {
    console.error(error);
    setStatus(translate("failed"));
  } finally {
    sortTabsButton.disabled = false;
  }
});

initializeLanguage().catch((error) => {
  console.error(error);
  applyLanguage("en");
  languageSelect.value = "en";
});
