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
    const findPluginResult = (pluginName) => {
        const pluginSection = document.querySelector('[data-mention-section-id="plugins"]');
        if (!pluginSection || !visible(pluginSection)) return null;
        return [...pluginSection.querySelectorAll('button[data-list-navigation-item="true"]')]
            .find((element) => visible(element) && visibleText(element).includes(normalized(pluginName))) || null;
    };
    const findPluginChip = (pluginName) => [...document.querySelectorAll('[data-appearance="inline-mention"][app-mention-display-name]')]
        .find((element) => element.getAttribute("app-mention-display-name") === pluginName) || null;
    async function waitForPluginSelected(pluginName, timeout = 10000) {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            const chip = findPluginChip(pluginName);
            if (chip) {
                console.log("[WSJ Mention] plugin chip confirmed", {
                    tagName: chip.tagName,
                    text: chip.innerText || chip.textContent || "",
                    selector: '[data-appearance="inline-mention"][app-mention-display-name]'
                });
                return chip;
            }
            await sleep(200);
        }
        throw new Error(`未能选择 ChatGPT 插件：${pluginName}`);
    }
    const placeCaretAtEnd = (element) => {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    };
    const insertText = (element, text) => {
        element.focus();
        if (element.tagName === "TEXTAREA") {
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
            setter.call(element, `${element.value}${text}`);
            element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
            return;
        }
        placeCaretAtEnd(element);
        if (document.execCommand("insertText", false, text)) return;
        const selection = window.getSelection();
        const range = selection.rangeCount ? selection.getRangeAt(0) : document.createRange();
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    };
    async function triggerPluginMention(input, pluginName) {
        const composerType = input.tagName === "TEXTAREA" ? "textarea" : "contenteditable";
        console.log("[WSJ Mention] composer found", { composerType });
        setInput(input, "");
        input.focus();
        insertText(input, "@");
        console.log("[WSJ Mention] @ entered", { value: inputValue(input) });
        const autocompleteDeadline = Date.now() + 3000;
        while (Date.now() < autocompleteDeadline && !document.querySelector('[data-mention-section-id="plugins"]')) await sleep(100);
        if (!document.querySelector('[data-mention-section-id="plugins"]')) throw new Error("输入 @ 后未打开 Plugin autocomplete");
        console.log("[WSJ Mention] autocomplete opened");
        for (const character of pluginName) {
            insertText(input, character);
            await sleep(50);
        }
        console.log("[WSJ Mention] plugin name entered", { value: inputValue(input) });
    }
    async function insertPromptAfterPluginChip(input, prompt, pluginName) {
        await waitForPluginSelected(pluginName);
        input.focus();
        placeCaretAtEnd(input);
        insertText(input, ` ${prompt}`);
        const preservedChip = findPluginChip(pluginName);
        if (!preservedChip) throw new Error("Prompt 注入后 Plugin chip 丢失");
        console.log("[WSJ Mention] prompt injected", { text: inputValue(input) });
        console.log("[WSJ Mention] plugin chip preserved", { text: preservedChip.innerText || preservedChip.textContent || "" });
    }
    async function selectPlugin(pluginName) {
        const input = inputElement();
        if (!input) throw new Error("未找到 ChatGPT 输入框，请确认已登录。");
        sendStatus(currentTaskId, currentRequestId, "working", `正在搜索 ChatGPT 插件：${pluginName}……`);
        await triggerPluginMention(input, pluginName);
        const deadline = Date.now() + 10000;
        let result = null;
        while (Date.now() < deadline && !(result = findPluginResult(pluginName))) await sleep(200);
        if (!result) throw new Error(`未找到 ChatGPT 插件：${pluginName}`);
        console.log("[WSJ Mention] WSJ candidate found", { text: result.innerText || result.textContent || "" });
        try {
            result.click();
        } catch (_) {
            throw new Error(`找到插件但无法选择：${pluginName}`);
        }
        console.log("[WSJ Mention] plugin selected");
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

        const selectedPluginName = pluginName || "WSJ 金融精译";
        if (processorType === "plugin") await selectPlugin(selectedPluginName);
        sendStatus(taskId, requestId, "working", processorType === "plugin" ? "插件已选择，正在填入 Prompt……" : "正在填入 Prompt……");
        if (processorType === "plugin") await insertPromptAfterPluginChip(input, prompt, selectedPluginName);
        else setInput(input, prompt);
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
        if (processorType === "plugin") console.log("[WSJ Mention] message sent");
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
