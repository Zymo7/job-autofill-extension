importScripts("defaults.js");

"use strict";

const {
  CONFIG_KEY,
  createDefaultConfig,
  normalizeConfig
} = globalThis.ResumeAutofillDefaults;

const lockFallback = new Map();

async function restrictStorageAccess() {
  try {
    await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  } catch (_error) {
    // Chrome 102+ supports this API. Older Chromium builds safely fall back.
  }

  try {
    await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  } catch (_error) {
    // Session storage access restrictions are a defense-in-depth measure.
  }
}

async function ensureConfig() {
  const result = await chrome.storage.local.get(CONFIG_KEY);
  const config = result[CONFIG_KEY];
  if (!config) {
    const defaults = createDefaultConfig();
    await chrome.storage.local.set({ [CONFIG_KEY]: defaults });
    return defaults;
  }

  const normalized = normalizeConfig(config);
  if (JSON.stringify(normalized) !== JSON.stringify(config)) {
    await chrome.storage.local.set({ [CONFIG_KEY]: normalized });
  }
  return normalized;
}

function getActiveProfile(config) {
  return config.profiles.find((profile) => profile.id === config.activeProfileId)
    || config.profiles[0];
}

function maskSensitiveValue(value) {
  if (!value) {
    return "未设置";
  }
  const characters = Array.from(value);
  if (characters.length <= 2) {
    return "•".repeat(characters.length);
  }
  if (characters.length <= 7) {
    return `${characters[0]}${"•".repeat(characters.length - 2)}${characters.at(-1)}`;
  }
  const startLength = Math.min(3, Math.floor(characters.length / 3));
  const endLength = Math.min(4, Math.floor(characters.length / 3));
  return `${characters.slice(0, startLength).join("")}${"*".repeat(characters.length - startLength - endLength)}${characters.slice(-endLength).join("")}`;
}

async function getLockRecord(tabId) {
  const key = `resumeAutofillLock:${tabId}`;
  try {
    const result = await chrome.storage.session.get(key);
    return result[key] || null;
  } catch (_error) {
    return lockFallback.get(tabId) || null;
  }
}

async function setLockRecord(tabId, record) {
  const key = `resumeAutofillLock:${tabId}`;
  lockFallback.set(tabId, record);
  try {
    await chrome.storage.session.set({ [key]: record });
  } catch (_error) {
    // In-memory fallback intentionally lasts no longer than the worker lifetime.
  }
}

async function clearLockRecord(tabId) {
  const key = `resumeAutofillLock:${tabId}`;
  lockFallback.delete(tabId);
  try {
    await chrome.storage.session.remove(key);
  } catch (_error) {
    // The fallback map has already been cleared.
  }
}

async function hashPin(pin) {
  const bytes = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validatePin(pin) {
  return typeof pin === "string" && /^\d{4,8}$/.test(pin);
}

async function getPanelData(tabId) {
  const lockRecord = await getLockRecord(tabId);
  if (lockRecord) {
    return { locked: true };
  }

  const config = await ensureConfig();
  const profile = getActiveProfile(config);
  const groups = [...profile.groups]
    .sort((a, b) => a.order - b.order)
    .map((group) => ({
      id: group.id,
      name: group.name,
      order: group.order
    }));

  const fields = [...profile.fields]
    .sort((a, b) => a.order - b.order)
    .map((field) => ({
      id: field.id,
      label: field.label,
      groupId: field.groupId,
      sensitive: field.sensitive,
      preview: field.sensitive
        ? maskSensitiveValue(field.value)
        : field.value
          ? "已设置"
          : "未设置",
      formats: [...field.formats],
      order: field.order
    }));

  return {
    locked: false,
    profileName: profile.name,
    groups,
    fields
  };
}

async function getFieldValue(tabId, fieldId) {
  if (await getLockRecord(tabId)) {
    return { ok: false, code: "LOCKED", message: "面板已锁定，请先解锁" };
  }

  const config = await ensureConfig();
  const profile = getActiveProfile(config);
  const field = profile.fields.find((candidate) => candidate.id === fieldId);
  if (!field) {
    return { ok: false, code: "NOT_FOUND", message: "字段不存在或已被删除" };
  }
  if (!field.value) {
    return { ok: false, code: "EMPTY", message: `“${field.label}”尚未设置` };
  }

  return {
    ok: true,
    field: {
      id: field.id,
      label: field.label,
      value: field.value
    }
  };
}

async function handleMessage(message, sender) {
  const tabId = sender.tab && sender.tab.id;
  switch (message && message.type) {
    case "panel:get-data":
      if (typeof tabId !== "number") {
        return { ok: false, message: "无法确定当前标签页" };
      }
      return { ok: true, data: await getPanelData(tabId) };

    case "field:get-value":
      if (typeof tabId !== "number" || typeof message.fieldId !== "string") {
        return { ok: false, message: "字段请求无效" };
      }
      return getFieldValue(tabId, message.fieldId);

    case "panel:lock":
      if (typeof tabId !== "number" || !validatePin(message.pin)) {
        return { ok: false, message: "PIN 必须为 4～8 位数字" };
      }
      await setLockRecord(tabId, { hash: await hashPin(message.pin) });
      return { ok: true };

    case "panel:unlock": {
      if (typeof tabId !== "number" || !validatePin(message.pin)) {
        return { ok: false, message: "请输入 4～8 位数字 PIN" };
      }
      const lockRecord = await getLockRecord(tabId);
      if (!lockRecord) {
        return { ok: true };
      }
      if (lockRecord.hash !== await hashPin(message.pin)) {
        return { ok: false, message: "PIN 不正确" };
      }
      await clearLockRecord(tabId);
      return { ok: true };
    }

    case "options:open":
      await chrome.runtime.openOptionsPage();
      return { ok: true };

    default:
      return { ok: false, message: "未知消息类型" };
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void restrictStorageAccess();
  void ensureConfig();
});

chrome.runtime.onStartup.addListener(() => {
  void restrictStorageAccess();
  void ensureConfig();
});

void restrictStorageAccess();
void ensureConfig();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(() => sendResponse({ ok: false, message: "扩展后台处理失败，请重试" }));
  return true;
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) {
    return;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content-style.js", "content.js"]
    });
    await chrome.tabs.sendMessage(tab.id, { type: "panel:toggle" });
    await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
  } catch (_error) {
    await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#b42318" });
    await chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
    setTimeout(() => {
      void chrome.action.setBadgeText({ tabId: tab.id, text: "" });
    }, 3000);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void clearLockRecord(tabId);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[CONFIG_KEY]) {
    return;
  }
  chrome.tabs.query({}).then((tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: "panel:config-changed" }).catch(() => {});
      }
    }
  });
});
