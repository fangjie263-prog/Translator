const DEFAULT_GPT_URL = "https://chatgpt.com/g/g-6a93053024688191a8052b050c3b114c-wsj-jin-rong-jing-yi";
let popupWindowId = null;
const sentTabs = new Set();

function createContextMenu() {
    console.log("[WSJ] createContextMenu started");
    chrome.contextMenus.removeAll(() => {
        if (chrome.runtime.lastError) {
            console.error("[WSJ] contextMenus.removeAll:", chrome.runtime.lastError.message);
        } else {
            console.log("[WSJ] contextMenus.removeAll completed");
        }
        chrome.contextMenus.create({
            id: "wsj-translate",
            title: "WSJ 金融精译",
            contexts: ["all"],
            documentUrlPatterns: [
                "http://127.0.0.1/*",
                "http://localhost/*"
            ]
        }, () => {
            if (chrome.runtime.lastError) {
                console.error("[WSJ] context menu create failed:", chrome.runtime.lastError.message);
            } else {
                console.log("[WSJ] context menu created: wsj-translate");
            }
        });
    });
}

createContextMenu();

chrome.runtime.onInstalled.addListener(async () => {
    createContextMenu();
    const saved = await chrome.storage.local.get("gptUrl");
    if (!saved.gptUrl) await chrome.storage.local.set({ gptUrl: DEFAULT_GPT_URL });
});
chrome.runtime.onStartup.addListener(() => {
    createContextMenu();
});

function validGptUrl(value) {
    try {
        const url = new URL(value);
        return (url.hostname === "chatgpt.com" || url.hostname.endsWith(".chatgpt.com")) && url.pathname.startsWith("/g/");
    } catch (_) {
        return false;
    }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const selectedText = info.selectionText || "";
    console.log("[WSJ] context menu clicked", {
        tabId: tab?.id,
        selectionTextPresent: Boolean(selectedText.trim()),
        selectionLength: selectedText.length,
        page: tab?.url || ""
    });
    if (info.menuItemId !== "wsj-translate") return;
    if (!tab || typeof tab.id !== "number") {
        console.error("[WSJ] context menu clicked without valid tab.id");
        return;
    }

    let articleContext = null;
    let sourceType = "selection";
    let sourceText = selectedText;
    if (!selectedText.trim()) {
        console.log("[WSJ] no selection, requesting article context");
        try {
            console.log("[WSJ] getArticleContext sendMessage", { tabId: tab.id });
            articleContext = await chrome.tabs.sendMessage(tab.id, { type: "getArticleContext" });
            console.log("[WSJ] getArticleContext response", {
                source: articleContext?.source || null,
                title: articleContext?.title || null,
                articleId: articleContext?.articleId || null,
                textLength: (articleContext?.text || articleContext?.sourceText || articleContext?.articleText || "").length
            });
        } catch (error) {
            console.error("[WSJ] getArticleContext failed:", error.message);
        }
        const articleText = articleContext?.text || articleContext?.sourceText || articleContext?.articleText || "";
        if (articleText.trim()) {
            sourceType = "article";
            sourceText = articleText;
            console.log("[WSJ] article sourceText", { sourceType, textLength: sourceText.length });
        } else {
            console.warn("[WSJ] Article Provider returned no usable article context", { page: tab?.url || "" });
            console.warn("[WSJ] 请先选择文字，或点击‘复制全文’后再使用 WSJ 金融精译。");
            return;
        }
    }

    const requestId = crypto.randomUUID();
    await chrome.storage.local.set({ ["request_" + requestId]: {
        requestId,
        selectedText: sourceText,
        sourceText,
        sourceType,
        articleContext,
        mode: "wsj",
        customInstruction: "",
        createdAt: Date.now()
    }});
    console.log("[WSJ] request stored", {
        requestId,
        sourceType,
        sourceTextLength: sourceText.length,
        selectedTextLength: sourceText.length,
        articleContext: articleContext ? {
            source: articleContext.source || null,
            title: articleContext.title || null,
            articleId: articleContext.articleId || null,
            textLength: (articleContext.text || articleContext.sourceText || articleContext.articleText || "").length
        } : null
    });

    const popupUrl = chrome.runtime.getURL("popup.html?requestId=" + encodeURIComponent(requestId));
    console.log("[WSJ] popup URL", popupUrl);
    try {
        const existing = popupWindowId === null ? null : await chrome.windows.get(popupWindowId, { populate: true });
        if (existing?.tabs?.[0]?.id) {
            await chrome.tabs.update(existing.tabs[0].id, { url: popupUrl, active: true });
            return;
        }
    } catch (_) {
        popupWindowId = null;
    }
    try {
        const popup = await chrome.windows.create({ url: popupUrl, type: "popup", width: 720, height: 820 });
        popupWindowId = popup.id;
        console.log("[WSJ] popup window created", { windowId: popupWindowId });
    } catch (error) {
        console.error("[WSJ] popup window create failed:", error.message);
    }
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
