const DEFAULT_GPT_URL = "https://chatgpt.com/g/g-6a93053024688191a8052b050c3b114c-wsj-jin-rong-jing-yi";
let popupWindowId = null;
const sentTabs = new Set();

function createContextMenu() {
    chrome.contextMenus.removeAll(() => chrome.contextMenus.create({
        id: "wsj-translate",
        title: "WSJ 金融精译",
        contexts: ["selection"]
    }));
}

chrome.runtime.onInstalled.addListener(async () => {
    createContextMenu();
    const saved = await chrome.storage.local.get("gptUrl");
    if (!saved.gptUrl) await chrome.storage.local.set({ gptUrl: DEFAULT_GPT_URL });
});
chrome.runtime.onStartup.addListener(createContextMenu);

function validGptUrl(value) {
    try {
        const url = new URL(value);
        return (url.hostname === "chatgpt.com" || url.hostname.endsWith(".chatgpt.com")) && url.pathname.startsWith("/g/");
    } catch (_) {
        return false;
    }
}

chrome.contextMenus.onClicked.addListener(async (info) => {
    if (info.menuItemId !== "wsj-translate") return;
    const selectedText = info.selectionText || "";
    if (!selectedText.trim()) return;

    let articleContext = null;
    try {
        articleContext = await chrome.tabs.sendMessage(info.tabId, { type: "getArticleContext" });
    } catch (_) {
        // Content script may be unavailable; selection-only V1.1.4 flow remains valid.
    }

    const requestId = crypto.randomUUID();
    await chrome.storage.local.set({ ["request_" + requestId]: {
        requestId,
        selectedText,
        articleContext,
        mode: "wsj",
        customInstruction: "",
        createdAt: Date.now()
    }});

    const popupUrl = chrome.runtime.getURL("popup.html?requestId=" + encodeURIComponent(requestId));
    try {
        const existing = popupWindowId === null ? null : await chrome.windows.get(popupWindowId, { populate: true });
        if (existing?.tabs?.[0]?.id) {
            await chrome.tabs.update(existing.tabs[0].id, { url: popupUrl, active: true });
            return;
        }
    } catch (_) {
        popupWindowId = null;
    }
    const popup = await chrome.windows.create({ url: popupUrl, type: "popup", width: 720, height: 820 });
    popupWindowId = popup.id;
});

chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === popupWindowId) popupWindowId = null;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "getRequest") {
        chrome.storage.local.get("request_" + message.requestId).then((result) => {
            sendResponse(result["request_" + message.requestId] || null);
        });
        return true;
    }
    if (message.type === "getSettings") {
        chrome.storage.local.get({ gptUrl: DEFAULT_GPT_URL }).then(sendResponse);
        return true;
    }
    if (message.type === "saveSettings") {
        const gptUrl = (message.gptUrl || "").trim();
        if (!validGptUrl(gptUrl)) {
            sendResponse({ ok: false, error: "GPT 链接无效，应为 chatgpt.com/g/ 开头的链接。" });
        } else {
            chrome.storage.local.set({ gptUrl }).then(() => sendResponse({ ok: true }));
        }
        return true;
    }
    if (message.type === "removeRequest") {
        chrome.storage.local.remove("request_" + message.requestId).then(() => sendResponse({ ok: true }));
        return true;
    }
    if (message.type === "launchAutomation") {
        launchAutomation(message).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
    }
    if (message.type === "contentReady" && _sender.tab?.id) {
        const tabId = _sender.tab.id;
        chrome.storage.local.get("translationTab_" + tabId).then(async (result) => {
            const taskId = result["translationTab_" + tabId];
            if (!taskId || sentTabs.has(tabId)) return;
            const taskResult = await chrome.storage.local.get("translationTask_" + taskId);
            const task = taskResult["translationTask_" + taskId];
            if (!task) return;
            sentTabs.add(tabId);
            try {
                await chrome.tabs.sendMessage(tabId, { type: "fillAndSend", taskId, prompt: task.prompt });
            } catch (error) {
                sentTabs.delete(tabId);
                broadcast({ type: "autoSendStatus", requestId: task.requestId, status: "failed", error: "无法向 ChatGPT 页面发送自动填充任务：" + error.message });
            }
        });
        return;
    }
    if (message.type === "autoSendStatus") {
        broadcast(message);
        if (message.status === "sent" || message.status === "failed") {
            chrome.storage.local.get("translationTask_" + message.taskId).then((result) => {
                const task = result["translationTask_" + message.taskId];
                if (task) chrome.storage.local.remove(["translationTask_" + message.taskId, "translationTab_" + task.tabId]);
            });
        }
    }
});

function broadcast(message) { chrome.runtime.sendMessage(message).catch(() => {}); }

async function launchAutomation(message) {
    const url = (message.gptUrl || "").trim();
    if (!validGptUrl(url)) return { ok: false, error: "GPT 链接无效，请先保存正确链接。" };
    const taskId = crypto.randomUUID();
    const tab = await chrome.tabs.create({ url, active: true });
    const task = { taskId, requestId: message.requestId, prompt: message.prompt, tabId: tab.id, createdAt: Date.now() };
    await chrome.storage.local.set({ ["translationTask_" + taskId]: task, ["translationTab_" + tab.id]: taskId });
    return { ok: true, taskId, tabId: tab.id };
}
