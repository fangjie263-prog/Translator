(function () {
    if (window.__wsjTranslatorV11Loaded) return;
    window.__wsjTranslatorV11Loaded = true;

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const sendStatus = (taskId, requestId, status, text, error = "") => {
        chrome.runtime.sendMessage({ type: "autoSendStatus", taskId, requestId, status, text, error }).catch(() => {});
    };
    const inputElement = () => document.querySelector("textarea") || document.querySelector('[contenteditable="true"]');
    const inputValue = (element) => element?.tagName === "TEXTAREA" ? element.value : (element?.innerText || element?.textContent || "");
    const visible = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const enabled = (button) => !button.disabled && button.getAttribute("aria-disabled") !== "true";
    const sendButton = (input) => [...document.querySelectorAll("button")].find((button) => {
        const label = (button.getAttribute("aria-label") || "").toLowerCase();
        if (!(label.includes("send") || label.includes("发送"))) return false;
        const inputForm = input.closest("form");
        const buttonForm = button.closest("form");
        if (inputForm && buttonForm) return inputForm === buttonForm;
        let parent = input;
        for (let level = 0; parent && level < 6; level += 1, parent = parent.parentElement) {
            if (parent.contains(button)) return true;
        }
        return false;
    });
    const setInput = (element, text) => {
        element.focus();
        if (element.tagName === "TEXTAREA") {
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
            setter.call(element, text);
        } else {
            element.textContent = text;
        }
        element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    };

    const normalized = (value) => (value || "").replace(/\s+/g, " ").trim().toLowerCase();
    const visibleText = (element) => normalized(element?.innerText || element?.textContent || "");
    const hasPluginCategory = (element) => {
        const label = normalized(element.getAttribute?.("aria-label"));
        if (label === "插件" || label === "plugins" || label.includes("插件")) return true;
        return [...element.querySelectorAll?.('[role="heading"], h1, h2, h3, h4, [data-category], [aria-label]') || []]
            .some((child) => {
                const childLabel = normalized(child.getAttribute("aria-label"));
                const childText = visibleText(child);
                return (childLabel === "插件" || childLabel === "plugins" || childText === "插件" || childText === "plugins");
            });
    };
    const pluginResultCandidates = (scope, pluginName) => [...scope.querySelectorAll('[role="option"], [role="menuitem"], button, a, [data-testid*="plugin" i]')]
        .filter((element) => visible(element) && visibleText(element).includes(normalized(pluginName)));
    const findPluginResult = (pluginName) => {
        const categoryLabels = [...document.querySelectorAll('[role="heading"], h1, h2, h3, h4, [data-category], [aria-label]')]
            .filter((element) => {
                const label = normalized(element.getAttribute("aria-label"));
                const text = visibleText(element);
                return label === "插件" || label === "plugins" || text === "插件" || text === "plugins";
            });
        for (const label of categoryLabels) {
            const scope = label.closest('[role="group"], section, li') || label.parentElement;
            const candidate = scope && pluginResultCandidates(scope, pluginName)[0];
            if (candidate) return candidate;
        }
        const candidates = pluginResultCandidates(document, pluginName);
        for (const candidate of candidates) {
            let ancestor = candidate.parentElement;
            for (let level = 0; ancestor && level < 6; level += 1, ancestor = ancestor.parentElement) {
                const ancestorText = visibleText(ancestor);
                if (hasPluginCategory(ancestor) && !ancestorText.includes("定制 gpt") && !ancestorText.includes("custom gpt")) return candidate;
            }
        }
        return null;
    };
    const isPluginChip = (element, pluginName) => {
        if (!visible(element) || !visibleText(element).includes(normalized(pluginName))) return false;
        const role = element.getAttribute("role") || "";
        if (role === "option" || role === "menuitem") return false;
        if (element.closest('[role="option"], [role="menuitem"]')) return false;
        const marker = normalized(`${element.getAttribute("aria-label") || ""} ${element.getAttribute("data-testid") || ""} ${element.className || ""}`);
        return role === "button" || marker.includes("plugin") || marker.includes("chip") || marker.includes("composer") || element.tagName === "SPAN";
    };
    async function waitForPluginSelected(pluginName, timeout = 10000) {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            const chip = [...document.querySelectorAll("button, [role=button], [data-testid], [aria-label], span")]
                .find((element) => isPluginChip(element, pluginName));
            if (chip) return chip;
            await sleep(200);
        }
        throw new Error(`未能选择 ChatGPT 插件：${pluginName}`);
    }
    async function selectPlugin(pluginName) {
        const input = inputElement();
        if (!input) throw new Error("未找到 ChatGPT 输入框，请确认已登录。");
        sendStatus(currentTaskId, currentRequestId, "working", `正在搜索 ChatGPT 插件：${pluginName}……`);
        setInput(input, `@${pluginName}`);
        const deadline = Date.now() + 10000;
        let result = null;
        while (Date.now() < deadline && !(result = findPluginResult(pluginName))) await sleep(200);
        if (!result) throw new Error(`未找到 ChatGPT 插件：${pluginName}`);
        try {
            result.click();
        } catch (_) {
            throw new Error(`找到插件但无法选择：${pluginName}`);
        }
        await waitForPluginSelected(pluginName, 10000);
    }

    let currentTaskId = "";
    let currentRequestId = "";

    async function run(taskId, requestId, prompt, processorType, pluginName) {
        currentTaskId = taskId;
        currentRequestId = requestId;
        sendStatus(taskId, requestId, "working", "正在等待 ChatGPT 输入框……");
        const deadline = Date.now() + 10000;
        let input;
        while (Date.now() < deadline && !(input = inputElement())) await sleep(200);
        if (!input) throw new Error("未找到 ChatGPT 输入框，请确认已登录。");

        if (processorType === "plugin") await selectPlugin(pluginName || "WSJ 金融精译");
        sendStatus(taskId, requestId, "working", processorType === "plugin" ? "插件已选择，正在填入 Prompt……" : "正在填入 Prompt……");
        setInput(input, prompt);
        sendStatus(taskId, requestId, "working", "Prompt 已填入，正在等待 Send button 变为可用……");
        const deadlineAt = Date.now() + 8000;
        let button = null;
        while (Date.now() < deadlineAt) {
            const candidate = sendButton(input);
            if (candidate && visible(candidate) && enabled(candidate)) {
                await sleep(400);
                const stableCandidate = sendButton(input);
                if (stableCandidate === candidate && visible(stableCandidate) && enabled(stableCandidate)) {
                    button = stableCandidate;
                    break;
                }
            }
            await sleep(250);
        }
        if (!button) throw new Error(processorType === "plugin" ? "Prompt 已填充，但未找到发送按钮" : "Prompt 已自动填入，但发送按钮未能自动触发，请手动点击右下角 ↑。");
        button.click();
        sendStatus(taskId, requestId, "sent", "Prompt 已自动发送，正在等待 ChatGPT 翻译……");
    }

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type !== "fillAndSend") return;
        run(message.taskId, message.requestId, message.prompt, message.processorType, message.pluginName)
            .catch((error) => sendStatus(message.taskId, message.requestId, "failed", "自动发送失败", error.message))
            .finally(() => clearInterval(readyTimer));
    });

    let readyAttempts = 0;
    const readyTimer = setInterval(() => {
        readyAttempts += 1;
        if (readyAttempts > 20) return clearInterval(readyTimer);
        chrome.runtime.sendMessage({ type: "contentReady" }).catch(() => {});
    }, 700);
    chrome.runtime.sendMessage({ type: "contentReady" }).catch(() => {});
})();
