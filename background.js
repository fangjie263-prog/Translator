const DEFAULT_GPT_URL = "https://chatgpt.com/g/g-6a93053024688191a8052b050c3b114c-wsj-jin-rong-jing-yi";
const STANDARD_CHAT_URL = "https://chatgpt.com/";
const DEFAULT_PROCESSORS = [
    { id: "standard-chat", name: "ChatGPT 普通对话", type: "standard-chat", url: STANDARD_CHAT_URL },
    { id: "wsj-financial-translation-plugin", name: "WSJ 金融精译", type: "plugin", pluginName: "WSJ 金融精译", pluginId: "plugin_1bc962ea268c81919f5515c7b5f87c79" },
    { id: "investment-research-assistant", name: "Investment Research Assistant", url: "https://chatgpt.com/g/g-LSloWvsWy-investment-research-assistant", type: "custom_gpt" },
    { id: "equity-research-analyst", name: "Equity Research Analyst", url: "https://chatgpt.com/g/g-X6FymI6XX-equity-research-analyst-generative-ai-persona", type: "custom_gpt" },
    { id: "financial-news-editor", name: "Financial News Editor", url: "https://chatgpt.com/g/g-70OQniJ66-financial-news-editor", type: "custom_gpt" },
    { id: "market-analysis-gpt", name: "Market Analysis GPT", url: "https://chatgpt.com/g/g-iPIqg3Sf1-market-analysis-gpt", type: "custom_gpt" },
    { id: "10-k-wizard", name: "10-K Wizard", url: "https://chatgpt.com/g/g-S0dTMpczx-10-k-wizard", type: "custom_gpt" }
];
const DEFAULT_TASK_DEFAULTS = {
    translation: "wsj-financial-translation-plugin",
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
    translation: "builtin-translation",
    "logic-critique": "equity-research-analyst",
    "fact-check": "investment-research-assistant",
    "research-follow-up": "investment-research-assistant"
};
const TASK_DEFAULTS_VERSION = 3;
const sentTabs = new Set();
let contextMenuInitPromise = null;
const CONTEXT_MENU_ID = "wsj-translate";
const CONTEXT_MENU_CONFIG = { id: CONTEXT_MENU_ID, title: "PRA · 个人研究助手", contexts: ["all"] };
const AUTOMATION_DIAGNOSTICS_KEY = "praAutomationDiagnosticRuns";
const AUTOMATION_DIAGNOSTIC_RUN_LIMIT = 5;
const AUTOMATION_DIAGNOSTIC_EVENT_LIMIT = 60;
const AUTOMATION_DIAGNOSTIC_STAGES = new Set([
    "launchAutomation.started", "launchAutomation.tab-created", "launchAutomation.task-stored",
    "contentReady.received", "fillAndSend.sent", "fillAndSend.failed",
    "fillAndSend.received", "run.started", "plugin.branch.started", "composer.cleared",
    "composer.refreshed", "autocomplete.attempt.started", "autocomplete.at-entered", "autocomplete.attempt.result",
    "autocomplete.retry.check", "autocomplete.retry.started", "autocomplete.retry.result",
    "plugin.name.input.started", "plugin.name.input.finished", "plugin.candidate.found",
    "plugin.candidate.lookup.failed", "plugin.candidate.click.started", "plugin.candidate.click.finished",
    "plugin.chip.confirmed", "prompt.injection.started", "prompt.injection.finished",
    "sendButton.lookup.started", "sendButton.lookup.finished", "message.send.started",
    "message.send.finished", "automation.exception"
]);
const AUTOMATION_DIAGNOSTIC_DETAIL_KEYS = new Set([
    "taskId", "tabId", "processorId", "processorType", "processorName", "pluginName", "pluginId",
    "attempt", "detected", "exists", "visible", "sectionIds", "sectionId", "items",
    "retryExecuted", "retryReason", "composerConnected", "composerVisible", "composerFocused",
    "composerReplaced", "composerType", "valueLength", "onlyAt", "candidateCount",
    "candidateSectionId", "candidateTagName", "candidateRole", "candidateAriaLabel",
    "candidateListNavigationItem", "candidateMentionContent", "candidateVisible", "candidateText",
    "chipSelector", "chipTagName", "chipDisplayName", "chipVisible", "chipPreserved",
    "promptLength", "sendButtonFound", "sendButtonVisible", "sendButtonEnabled", "sections"
]);
let automationDiagnosticQueue = Promise.resolve();

function boundedDiagnosticString(value, maxLength = 300) {
    return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function sanitizeDiagnosticAttributes(attributes) {
    if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) return {};
    const safe = {};
    for (const [name, value] of Object.entries(attributes).slice(0, 12)) {
        if (typeof value !== "string" || !(name === "class" || name === "role" || name === "title" || name === "type" || name.startsWith("data-") || name.startsWith("aria-"))) continue;
        safe[name] = boundedDiagnosticString(value, 120);
    }
    return safe;
}

function sanitizeCandidateStructure(structure) {
    if (!structure || typeof structure !== "object" || Array.isArray(structure)) return undefined;
    const sanitizeNode = (node) => ({
        tagName: boundedDiagnosticString(node?.tagName, 20),
        attributes: sanitizeDiagnosticAttributes(node?.attributes),
        ...(Number.isFinite(node?.svgPathCount) ? { svgPathCount: node.svgPathCount } : {})
    });
    return {
        buttonAttributes: sanitizeDiagnosticAttributes(structure.buttonAttributes),
        descendants: Array.isArray(structure.descendants) ? structure.descendants.slice(0, 12).map(sanitizeNode) : [],
        ancestors: Array.isArray(structure.ancestors) ? structure.ancestors.slice(0, 3).map(sanitizeNode) : []
    };
}

function sanitizeDiagnosticDetails(details) {
    if (!details || typeof details !== "object" || Array.isArray(details)) return {};
    const clean = {};
    for (const [key, value] of Object.entries(details)) {
        if (!AUTOMATION_DIAGNOSTIC_DETAIL_KEYS.has(key)) continue;
        if (typeof value === "string") clean[key] = boundedDiagnosticString(value, key === "candidateText" ? 400 : 160);
        else if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) clean[key] = value;
        else if (key === "sectionIds" && Array.isArray(value)) {
            clean[key] = value.filter((item) => typeof item === "string").slice(0, 10).map((item) => item.slice(0, 80));
        } else if (key === "sections" && Array.isArray(value)) {
            clean[key] = value.slice(0, 8).map((section) => ({
                sectionId: boundedDiagnosticString(section?.sectionId, 80),
                items: boundedDiagnosticString(section?.items, 80),
                visible: Boolean(section?.visible),
                matchingButtons: Array.isArray(section?.matchingButtons) ? section.matchingButtons.slice(0, 5).map((button) => ({
                    tagName: boundedDiagnosticString(button?.tagName, 30),
                    role: boundedDiagnosticString(button?.role, 50),
                    ariaLabel: boundedDiagnosticString(button?.ariaLabel, 120),
                    listNavigationItem: boundedDiagnosticString(button?.listNavigationItem, 40),
                    mentionContent: boundedDiagnosticString(button?.mentionContent, 40),
                    visible: Boolean(button?.visible),
                    text: boundedDiagnosticString(button?.text, 400),
                    structure: sanitizeCandidateStructure(button?.structure)
                })) : []
            }));
        }
    }
    return clean;
}

function recordAutomationDiagnostic(requestId, stage, result, details = {}, error = "", stack = "", createRun = false) {
    if (typeof requestId !== "string" || !requestId || !AUTOMATION_DIAGNOSTIC_STAGES.has(stage)) return Promise.resolve(false);
    const event = {
        requestId,
        stage,
        timestamp: new Date().toISOString(),
        result: boundedDiagnosticString(result, 40),
        details: sanitizeDiagnosticDetails(details)
    };
    if (error) event.error = boundedDiagnosticString(String(error), 400);
    if (stack) event.stack = boundedDiagnosticString(String(stack), 1200);

    const write = automationDiagnosticQueue.then(async () => {
        const saved = await chrome.storage.local.get(AUTOMATION_DIAGNOSTICS_KEY);
        const runs = Array.isArray(saved[AUTOMATION_DIAGNOSTICS_KEY]) ? saved[AUTOMATION_DIAGNOSTICS_KEY] : [];
        let run = runs.find((item) => item?.requestId === requestId);
        if (!run && createRun) {
            run = { requestId, startedAt: event.timestamp, updatedAt: event.timestamp, events: [] };
            runs.unshift(run);
        }
        if (!run) return false;
        run.events = Array.isArray(run.events) ? run.events : [];
        run.events.push(event);
        run.events = run.events.slice(-AUTOMATION_DIAGNOSTIC_EVENT_LIMIT);
        run.updatedAt = event.timestamp;
        await chrome.storage.local.set({ [AUTOMATION_DIAGNOSTICS_KEY]: runs.slice(0, AUTOMATION_DIAGNOSTIC_RUN_LIMIT) });
        return true;
    });
    automationDiagnosticQueue = write.catch((diagnosticError) => {
        console.warn("[WSJ Diagnostics] log write failed", diagnosticError?.message || "unknown error");
    });
    return write;
}

function isPRApopupSender(sender) {
    if (sender?.id !== chrome.runtime.id || typeof sender.url !== "string") return false;
    try {
        const url = new URL(sender.url);
        return url.protocol === "chrome-extension:" && url.host === chrome.runtime.id && url.pathname === "/popup.html";
    } catch (_) {
        return false;
    }
}

function isChatGPTContentSender(sender) {
    if (sender?.id !== chrome.runtime.id || !sender.tab?.id) return false;
    try {
        const url = new URL(sender.url || sender.tab.url || "");
        return url.protocol === "https:" && (url.hostname === "chatgpt.com" || url.hostname.endsWith(".chatgpt.com"));
    } catch (_) {
        return false;
    }
}

function ensureContextMenu() {
    if (contextMenuInitPromise) return contextMenuInitPromise;
    console.log("[WSJ] ensureContextMenu started");
    contextMenuInitPromise = new Promise((resolve) => {
        chrome.contextMenus.update(CONTEXT_MENU_ID, {
            title: CONTEXT_MENU_CONFIG.title,
            contexts: CONTEXT_MENU_CONFIG.contexts
        }, () => {
            if (chrome.runtime.lastError) {
                const updateError = chrome.runtime.lastError.message;
                console.warn("[WSJ] context menu update unavailable; attempting create:", updateError);
                chrome.contextMenus.create(CONTEXT_MENU_CONFIG, () => {
                    if (!chrome.runtime.lastError) {
                        console.log("[WSJ] context menu created: wsj-translate");
                        resolve(true);
                        return;
                    }
                    const createError = chrome.runtime.lastError.message;
                    if (!/duplicate id|already exists/i.test(createError)) {
                        console.error("[WSJ] context menu create failed:", createError);
                        resolve(false);
                        return;
                    }
                    chrome.contextMenus.update(CONTEXT_MENU_ID, {
                        title: CONTEXT_MENU_CONFIG.title,
                        contexts: CONTEXT_MENU_CONFIG.contexts
                    }, () => {
                        if (chrome.runtime.lastError) {
                            console.error("[WSJ] context menu duplicate recovery failed:", chrome.runtime.lastError.message);
                            resolve(false);
                        } else {
                            console.log("[WSJ] context menu duplicate recovered by update: wsj-translate");
                            resolve(true);
                        }
                    });
                });
            } else {
                console.log("[WSJ] context menu updated: wsj-translate");
                resolve(true);
            }
        });
    }).finally(() => {
        contextMenuInitPromise = null;
    });
    return contextMenuInitPromise;
}

ensureContextMenu();

async function ensureProcessors() {
    const saved = await chrome.storage.local.get(["gptPresetsInitialized", "gptProcessors", "gptUrl", "selectedProcessorId"]);
    if (saved.gptPresetsInitialized && Array.isArray(saved.gptProcessors)) {
        const processors = normalizeProcessors(saved.gptProcessors);
        const nextSelected = saved.selectedProcessorId === "builtin-translation" || !processors.some((item) => item.id === saved.selectedProcessorId)
            ? "standard-chat"
            : saved.selectedProcessorId;
        if (JSON.stringify(processors) !== JSON.stringify(saved.gptProcessors) || nextSelected !== saved.selectedProcessorId) {
            await chrome.storage.local.set({ gptProcessors: processors, selectedProcessorId: nextSelected });
        }
        return processors;
    }
    const processors = DEFAULT_PROCESSORS.map((item) => ({ ...item }));
    await chrome.storage.local.set({ gptProcessors: processors, gptPresetsInitialized: true, selectedProcessorId: "standard-chat" });
    return processors;
}
function normalizeProcessors(processors) {
    const savedById = new Map(processors.filter((item) => item?.id && item.id !== "builtin-translation").map((item) => [item.id, item]));
    const ordered = DEFAULT_PROCESSORS.map((item) => item.id === "wsj-financial-translation-plugin"
        ? { ...item }
        : savedById.get(item.id) || { ...item });
    const defaultIds = new Set(DEFAULT_PROCESSORS.map((item) => item.id));
    return [...ordered, ...processors.filter((item) => item?.id && item.id !== "builtin-translation" && !defaultIds.has(item.id))];
}
async function ensureTaskDefaults() {
    const saved = await chrome.storage.local.get(["researchTaskDefaults", "researchTaskDefaultsVersion"]);
    const processors = await ensureProcessors();
    const validProcessorIds = new Set(processors.map((item) => item.id));
    const current = saved.researchTaskDefaults && typeof saved.researchTaskDefaults === "object" ? saved.researchTaskDefaults : {};
    const merged = { ...DEFAULT_TASK_DEFAULTS, ...current };
    if (Number(saved.researchTaskDefaultsVersion || 0) < TASK_DEFAULTS_VERSION) {
        for (const taskId of Object.keys(DEFAULT_TASK_DEFAULTS)) {
            if (!(taskId in current) || current[taskId] === LEGACY_TASK_DEFAULTS[taskId]) merged[taskId] = DEFAULT_TASK_DEFAULTS[taskId];
        }
    }
    for (const taskId of Object.keys(DEFAULT_TASK_DEFAULTS)) {
        if (!validProcessorIds.has(merged[taskId])) {
            const canonicalDefault = DEFAULT_TASK_DEFAULTS[taskId];
            merged[taskId] = validProcessorIds.has(canonicalDefault) ? canonicalDefault : "standard-chat";
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
    ensureContextMenu();
    const saved = await chrome.storage.local.get("gptUrl");
    if (!saved.gptUrl) await chrome.storage.local.set({ gptUrl: DEFAULT_GPT_URL });
    await ensureProcessors();
    await ensureTaskDefaults();
});
chrome.runtime.onStartup.addListener(() => {
    ensureContextMenu();
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
        const popup = await chrome.windows.create({ url: popupUrl, type: "popup", width: 720, height: 820, focused: true });
        console.log("[WSJ] popup window created", { windowId: popup.id, focused: true });
    } catch (error) {
        console.error("[WSJ] popup window create failed:", error.message);
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "getPraAutomationDiagnosticRuns") {
        if (!isPRApopupSender(sender)) {
            sendResponse({ ok: false, error: "仅 PRA Popup 可读取诊断日志。" });
            return;
        }
        automationDiagnosticQueue.then(() => chrome.storage.local.get(AUTOMATION_DIAGNOSTICS_KEY)).then((saved) => {
            const runs = Array.isArray(saved[AUTOMATION_DIAGNOSTICS_KEY]) ? saved[AUTOMATION_DIAGNOSTICS_KEY] : [];
            sendResponse({ ok: true, runs: runs.slice(0, AUTOMATION_DIAGNOSTIC_RUN_LIMIT) });
        }).catch(() => sendResponse({ ok: false, error: "读取诊断日志失败。" }));
        return true;
    }
    if (message.type === "praAutomationDiagnosticEvent") {
        if (!isChatGPTContentSender(sender) || !AUTOMATION_DIAGNOSTIC_STAGES.has(message.stage)) return;
        recordAutomationDiagnostic(
            message.requestId,
            message.stage,
            message.result,
            message.details,
            message.error,
            message.stack
        ).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
        return true;
    }
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
            sendResponse({ processors, taskDefaults, customTasks, selectedProcessorId: saved.selectedProcessorId || "standard-chat" });
        });
        return true;
    }
    if (message.type === "saveProcessors") {
        const processors = normalizeProcessors(Array.isArray(message.processors) ? message.processors : []);
        if (!processors.some((item) => item.id === "wsj-financial-translation-plugin" && item.type === "plugin" && item.name === "WSJ 金融精译")) {
            sendResponse({ ok: false, error: "必须保留 Plugin 处理器“WSJ 金融精译”。" });
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
                        taskDefaults[taskId] = validIds.has(recommended) ? recommended : "standard-chat";
                    }
                }
                return chrome.storage.local.get("customResearchTasks").then((customSaved) => {
                    const customTasks = Array.isArray(customSaved.customResearchTasks) ? customSaved.customResearchTasks.map((task) => ({
                        ...task,
                        defaultProcessorId: validIds.has(task.defaultProcessorId) ? task.defaultProcessorId : "standard-chat"
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
        chrome.storage.local.set({ selectedProcessorId: message.processorId || "standard-chat" }).then(() => sendResponse({ ok: true }));
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
        launchAutomation(message).then(sendResponse).catch(async (error) => {
            await recordAutomationDiagnostic(message.requestId, "automation.exception", "failed", {
                processorId: message.processorId || "",
                processorType: message.processorType || "custom_gpt",
                processorName: message.processorName || ""
            }, error.message, error.stack).catch(() => {});
            sendResponse({ ok: false, error: error.message });
        });
        return true;
    }
    if (message.type === "contentReady" && sender.tab?.id) {
        const tabId = sender.tab.id;
        chrome.storage.local.get("translationTab_" + tabId).then(async (result) => {
            const taskId = result["translationTab_" + tabId];
            if (!taskId || sentTabs.has(tabId)) return;
            const taskResult = await chrome.storage.local.get("translationTask_" + taskId);
            const task = taskResult["translationTask_" + taskId];
            if (!task) return;
            sentTabs.add(tabId);
            recordAutomationDiagnostic(task.requestId, "contentReady.received", "success", {
                taskId,
                tabId,
                processorId: task.processorId,
                processorType: task.processorType,
                processorName: task.processorName,
                pluginName: task.pluginName,
                pluginId: task.pluginId
            }).catch(() => {});
            try {
                console.log("[WSJ] sending fillAndSend", {
                    tabId,
                    taskId,
                    requestId: task.requestId,
                    processorType: task.processorType,
                    pluginName: task.pluginName,
                    pluginId: task.pluginId
                });
                await chrome.tabs.sendMessage(tabId, {
                    type: "fillAndSend",
                    taskId,
                    requestId: task.requestId,
                    prompt: task.prompt,
                    processorId: task.processorId,
                    processorType: task.processorType,
                    processorName: task.processorName,
                    pluginName: task.pluginName,
                    pluginId: task.pluginId
                });
                await recordAutomationDiagnostic(task.requestId, "fillAndSend.sent", "success", {
                    taskId,
                    tabId,
                    processorId: task.processorId,
                    processorType: task.processorType,
                    processorName: task.processorName,
                    pluginName: task.pluginName,
                    pluginId: task.pluginId
                }).catch(() => {});
            } catch (error) {
                sentTabs.delete(tabId);
                console.error("[WSJ] fillAndSend delivery failed", { tabId, taskId, requestId: task.requestId, error: error.message });
                await recordAutomationDiagnostic(task.requestId, "fillAndSend.failed", "failed", { taskId, tabId }, error.message, error.stack).catch(() => {});
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
    const processorType = message.processorType || "custom_gpt";
    const requestId = typeof message.requestId === "string" && message.requestId ? message.requestId : crypto.randomUUID();
    const processorId = typeof message.processorId === "string" ? message.processorId : "";
    const processorName = typeof message.processorName === "string" ? message.processorName : "";
    console.log("[WSJ] launchAutomation received", {
        requestId,
        processorId,
        processorType,
        processorName,
        pluginName: message.pluginName || "",
        pluginId: message.pluginId || ""
    });
    recordAutomationDiagnostic(requestId, "launchAutomation.started", "started", {
        processorId,
        processorType,
        processorName,
        pluginName: message.pluginName || "",
        pluginId: message.pluginId || ""
    }, "", "", true).catch(() => {});
    const url = processorType === "plugin" ? STANDARD_CHAT_URL : (message.gptUrl || "").trim();
    if (processorType !== "plugin" && url !== STANDARD_CHAT_URL && !validGptUrl(url)) {
        const error = "GPT 链接无效，请先保存正确链接。";
        await recordAutomationDiagnostic(requestId, "launchAutomation.started", "failed", { processorId, processorType, processorName }, error).catch(() => {});
        return { ok: false, error };
    }
    const taskId = crypto.randomUUID();
    let tab;
    try {
        tab = await chrome.tabs.create({ url, active: true });
        recordAutomationDiagnostic(requestId, "launchAutomation.tab-created", "success", {
            taskId,
            tabId: tab.id,
            processorId,
            processorType,
            processorName
        }).catch(() => {});
    } catch (error) {
        await recordAutomationDiagnostic(requestId, "launchAutomation.tab-created", "failed", { taskId, processorId, processorType, processorName }, error.message, error.stack).catch(() => {});
        throw error;
    }
    const task = {
        taskId,
        requestId,
        prompt: message.prompt,
        tabId: tab.id,
        processorId,
        processorType,
        processorName,
        pluginName: message.pluginName || "",
        pluginId: message.pluginId || "",
        createdAt: Date.now()
    };
    await chrome.storage.local.set({ ["translationTask_" + taskId]: task, ["translationTab_" + tab.id]: taskId });
    recordAutomationDiagnostic(requestId, "launchAutomation.task-stored", "success", { taskId, tabId: tab.id }).catch(() => {});
    console.log("[WSJ] automation task created", {
        tabId: tab.id,
        taskId,
        requestId,
        processorId: task.processorId,
        processorType: task.processorType,
        processorName: task.processorName,
        pluginName: task.pluginName,
        pluginId: task.pluginId
    });
    return { ok: true, taskId, tabId: tab.id };
}
