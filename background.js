const DEFAULT_GPT_URL = "https://chatgpt.com/g/g-6a93053024688191a8052b050c3b114c-wsj-jin-rong-jing-yi";
const STANDARD_CHAT_URL = "https://chatgpt.com/";
const DEFAULT_PROCESSORS = [
    { id: "builtin-translation", name: "金融精译", type: "builtin", url: DEFAULT_GPT_URL },
    { id: "standard-chat", name: "ChatGPT 普通对话", type: "standard-chat", url: STANDARD_CHAT_URL },
    { id: "investment-research-assistant", name: "Investment Research Assistant", url: "https://chatgpt.com/g/g-LSloWvsWy-investment-research-assistant", type: "custom_gpt" },
    { id: "equity-research-analyst", name: "Equity Research Analyst", url: "https://chatgpt.com/g/g-X6FymI6XX-equity-research-analyst-generative-ai-persona", type: "custom_gpt" },
    { id: "financial-news-editor", name: "Financial News Editor", url: "https://chatgpt.com/g/g-70OQniJ66-financial-news-editor", type: "custom_gpt" },
    { id: "market-analysis-gpt", name: "Market Analysis GPT", url: "https://chatgpt.com/g/g-iPIqg3Sf1-market-analysis-gpt", type: "custom_gpt" },
    { id: "10-k-wizard", name: "10-K Wizard", url: "https://chatgpt.com/g/g-S0dTMpczx-10-k-wizard", type: "custom_gpt" }
];
const DEFAULT_TASK_DEFAULTS = {
    translation: "builtin-translation",
    "article-speed-read": "investment-research-assistant",
    "investment-logic": "equity-research-analyst",
    "fund-manager": "investment-research-assistant",
    "logic-critique": "standard-chat",
    "company-industry": "investment-research-assistant",
    "fact-check": "standard-chat",
    "financial-valuation": "10-k-wizard",
    "research-follow-up": "standard-chat"
};
const LEGACY_TASK_DEFAULTS = {
    ...DEFAULT_TASK_DEFAULTS,
    "logic-critique": "equity-research-analyst",
    "fact-check": "investment-research-assistant",
    "research-follow-up": "investment-research-assistant"
};
const TASK_DEFAULTS_VERSION = 2;
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
            title: "PRA · 个人研究助手",
            contexts: ["all"]
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

async function ensureProcessors() {
    const saved = await chrome.storage.local.get(["gptPresetsInitialized", "gptProcessors", "gptUrl"]);
    if (saved.gptPresetsInitialized && Array.isArray(saved.gptProcessors)) {
        if (saved.gptProcessors.some((item) => item.id === "standard-chat")) return saved.gptProcessors;
        const processors = [{ ...DEFAULT_PROCESSORS.find((item) => item.id === "standard-chat") }, ...saved.gptProcessors];
        await chrome.storage.local.set({ gptProcessors: processors });
        return processors;
    }
    const processors = DEFAULT_PROCESSORS.map((item) => ({ ...item }));
    if (saved.gptUrl) processors[0].url = saved.gptUrl;
    await chrome.storage.local.set({ gptProcessors: processors, gptPresetsInitialized: true, selectedProcessorId: "builtin-translation" });
    return processors;
}
async function ensureTaskDefaults() {
    const saved = await chrome.storage.local.get(["researchTaskDefaults", "researchTaskDefaultsVersion"]);
    const current = saved.researchTaskDefaults && typeof saved.researchTaskDefaults === "object" ? saved.researchTaskDefaults : {};
    const merged = { ...DEFAULT_TASK_DEFAULTS, ...current };
    if (Number(saved.researchTaskDefaultsVersion || 0) < TASK_DEFAULTS_VERSION) {
        for (const taskId of Object.keys(DEFAULT_TASK_DEFAULTS)) {
            if (!(taskId in current) || current[taskId] === LEGACY_TASK_DEFAULTS[taskId]) merged[taskId] = DEFAULT_TASK_DEFAULTS[taskId];
        }
    }
    if (JSON.stringify(current) !== JSON.stringify(merged) || Number(saved.researchTaskDefaultsVersion || 0) < TASK_DEFAULTS_VERSION) {
        await chrome.storage.local.set({ researchTaskDefaults: merged, researchTaskDefaultsVersion: TASK_DEFAULTS_VERSION });
    }
    return merged;
}
async function getCustomTasks() {
    const saved = await chrome.storage.local.get("customResearchTasks");
    return Array.isArray(saved.customResearchTasks)
        ? saved.customResearchTasks.filter((task) => task && task.type === "custom" && typeof task.id === "string" && typeof task.name === "string" && typeof task.prompt === "string")
        : [];
}

chrome.runtime.onInstalled.addListener(async () => {
    createContextMenu();
    const saved = await chrome.storage.local.get("gptUrl");
    if (!saved.gptUrl) await chrome.storage.local.set({ gptUrl: DEFAULT_GPT_URL });
    await ensureProcessors();
    await ensureTaskDefaults();
});
chrome.runtime.onStartup.addListener(() => {
    createContextMenu();
});

function validGptUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" && url.hostname === "chatgpt.com" && url.pathname.startsWith("/g/");
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
    try {
        console.log("[WSJ] requesting Article Provider context", { selectedLength: selectedText.length });
        articleContext = await chrome.tabs.sendMessage(tab.id, { type: "getArticleContext", selectedText });
        const articleText = articleContext?.text || articleContext?.sourceText || articleContext?.articleText || "";
        if ((articleContext?.type === "article" || articleContext?.sourceType === "article") && articleText.trim()) {
            sourceType = "article";
            sourceText = articleText;
        }
    } catch (error) {
        console.warn("[WSJ] Article Provider unavailable; using selection", error.message);
    }
    if (sourceType !== "article" && !selectedText.trim()) {
        console.warn("[WSJ] Article Provider returned no usable article context", { page: tab?.url || "" });
        console.warn("[WSJ] 请先选择文字，或点击‘复制全文’后再使用 WSJ 金融精译。");
        return;
    }

    const requestId = crypto.randomUUID();
    await chrome.storage.local.set({ ["request_" + requestId]: {
        requestId,
        selectedText: sourceText,
        sourceText,
        sourceType,
        articleContext,
        taskId: "translation",
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
    if (message.type === "getProcessors") {
        Promise.all([ensureProcessors(), ensureTaskDefaults(), getCustomTasks(), chrome.storage.local.get("selectedProcessorId")]).then(([processors, taskDefaults, customTasks, saved]) => {
            sendResponse({ processors, taskDefaults, customTasks, selectedProcessorId: saved.selectedProcessorId || "builtin-translation" });
        });
        return true;
    }
    if (message.type === "saveProcessors") {
        const processors = Array.isArray(message.processors) ? message.processors : [];
        if (!processors.some((item) => item.id === "builtin-translation" && item.type === "builtin")) {
            sendResponse({ ok: false, error: "必须保留内置处理器“金融精译”。" });
        } else if (!processors.some((item) => item.id === "standard-chat" && item.type === "standard-chat" && item.name === "ChatGPT 普通对话" && item.url === STANDARD_CHAT_URL)) {
            sendResponse({ ok: false, error: "必须保留系统处理器“ChatGPT 普通对话”。" });
        } else if (processors.some((item) => item.type === "custom_gpt" && !validGptUrl(item.url))) {
            sendResponse({ ok: false, error: "GPT 链接无效，应为 chatgpt.com/g/ 开头的链接。" });
        } else {
            chrome.storage.local.get("researchTaskDefaults").then((saved) => {
                const taskDefaults = { ...DEFAULT_TASK_DEFAULTS, ...(saved.researchTaskDefaults || {}) };
                const validIds = new Set(processors.map((item) => item.id));
                for (const taskId of Object.keys(taskDefaults)) {
                    if (!validIds.has(taskDefaults[taskId])) {
                        const recommended = DEFAULT_TASK_DEFAULTS[taskId];
                        taskDefaults[taskId] = validIds.has(recommended) ? recommended : "builtin-translation";
                    }
                }
                return chrome.storage.local.get("customResearchTasks").then((customSaved) => {
                    const customTasks = Array.isArray(customSaved.customResearchTasks) ? customSaved.customResearchTasks.map((task) => ({
                        ...task,
                        defaultProcessorId: validIds.has(task.defaultProcessorId) ? task.defaultProcessorId : "builtin-translation"
                    })) : [];
                    return chrome.storage.local.set({ gptProcessors: processors, gptPresetsInitialized: true, researchTaskDefaults: taskDefaults, customResearchTasks: customTasks }).then(() => sendResponse({ ok: true, taskDefaults, customTasks }));
                });
            });
        }
        return true;
    }
    if (message.type === "saveTaskDefault") {
        const taskId = message.taskId || "";
        const processorId = message.processorId || "";
        Promise.all([ensureProcessors(), ensureTaskDefaults()]).then(([processors, taskDefaults]) => {
            if (!DEFAULT_TASK_DEFAULTS[taskId]) return sendResponse({ ok: false, error: "Research Task 无效。" });
            if (!processors.some((item) => item.id === processorId)) return sendResponse({ ok: false, error: "GPT 处理器不存在。" });
            const next = { ...taskDefaults, [taskId]: processorId };
            chrome.storage.local.set({ researchTaskDefaults: next }).then(() => sendResponse({ ok: true, taskDefaults: next }));
        });
        return true;
    }
    if (message.type === "saveResearchTask") {
        const task = message.task;
        Promise.all([ensureProcessors(), getCustomTasks()]).then(([processors, customTasks]) => {
            if (!task || !task.id || !task.name?.trim() || !task.prompt?.trim()) return sendResponse({ ok: false, error: "研究任务名称和 Prompt 不能为空。" });
            if (task.type !== "custom") return sendResponse({ ok: false, error: "系统 Research Task 不能被覆盖。" });
            if (Object.prototype.hasOwnProperty.call(DEFAULT_TASK_DEFAULTS, task.id)) return sendResponse({ ok: false, error: "系统 Research Task 不能被覆盖。" });
            if (!processors.some((item) => item.id === task.defaultProcessorId)) return sendResponse({ ok: false, error: "默认 AI Processor 不存在。" });
            const nextTask = { id: task.id, name: task.name.trim(), prompt: task.prompt.trim(), defaultProcessorId: task.defaultProcessorId, type: "custom" };
            const next = customTasks.some((item) => item.id === nextTask.id)
                ? customTasks.map((item) => item.id === nextTask.id ? nextTask : item)
                : [...customTasks, nextTask];
            chrome.storage.local.set({ customResearchTasks: next }).then(() => sendResponse({ ok: true, task: nextTask, customTasks: next }));
        });
        return true;
    }
    if (message.type === "deleteResearchTask") {
        getCustomTasks().then((customTasks) => {
            const next = customTasks.filter((task) => task.id !== message.taskId);
            chrome.storage.local.set({ customResearchTasks: next }).then(() => sendResponse({ ok: true, customTasks: next }));
        });
        return true;
    }
    if (message.type === "saveSelectedProcessor") {
        chrome.storage.local.set({ selectedProcessorId: message.processorId || "builtin-translation" }).then(() => sendResponse({ ok: true }));
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
    if (url !== STANDARD_CHAT_URL && !validGptUrl(url)) return { ok: false, error: "GPT 链接无效，请先保存正确链接。" };
    const taskId = crypto.randomUUID();
    const tab = await chrome.tabs.create({ url, active: true });
    const task = { taskId, requestId: message.requestId, prompt: message.prompt, tabId: tab.id, createdAt: Date.now() };
    await chrome.storage.local.set({ ["translationTask_" + taskId]: task, ["translationTab_" + tab.id]: taskId });
    return { ok: true, taskId, tabId: tab.id };
}
