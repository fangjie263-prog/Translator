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
    let currentTaskId = "";
    let currentRequestId = "";
    function reportDiagnostic(requestId, stage, result, details = {}, error = null) {
        if (!requestId) return;
        const message = {
            type: "praAutomationDiagnosticEvent",
            requestId,
            stage,
            result,
            details
        };
        if (error) {
            message.error = error.message || String(error);
            message.stack = error.stack || "";
        }
        chrome.runtime.sendMessage(message).catch(() => {});
    }
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
        const targetName = normalized(pluginName);
        for (const section of document.querySelectorAll("[data-mention-section-id]")) {
            if (!visible(section)) continue;
            for (const button of section.querySelectorAll("button")) {
                if (!visible(button)) continue;
                const exactNameMatch = visibleText(button) === targetName ||
                    [...button.querySelectorAll("*")].some((element) => visible(element) && visibleText(element) === targetName);
                if (exactNameMatch) return button;
            }
        }
        return null;
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
                    displayName: chip.getAttribute("app-mention-display-name"),
                    selector: '[data-appearance="inline-mention"][app-mention-display-name]'
                });
                reportDiagnostic(currentRequestId, "plugin.chip.confirmed", "success", {
                    chipSelector: '[data-appearance="inline-mention"][app-mention-display-name]',
                    chipTagName: chip.tagName,
                    chipDisplayName: chip.getAttribute("app-mention-display-name"),
                    chipVisible: visible(chip)
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
        const isUsableComposer = (element) => Boolean(
            element && element.isConnected && visible(element) &&
            typeof element.focus === "function" && !element.disabled
        );
        const waitForPluginAutocomplete = async () => {
            const deadline = Date.now() + 3000;
            while (Date.now() < deadline) {
                const section = document.querySelector('[data-mention-section-id="plugins"]');
                if (section && visible(section)) return true;
                await sleep(100);
            }
            const section = document.querySelector('[data-mention-section-id="plugins"]');
            return Boolean(section && visible(section));
        };

        const composerType = input.tagName === "TEXTAREA" ? "textarea" : "contenteditable";
        console.log("[WSJ Mention] composer found", { composerType });
        setInput(input, "");
        console.log("[WSJ Mention] composer cleared", { connected: input.isConnected });
        reportDiagnostic(currentRequestId, "composer.cleared", "success", {
            composerType,
            composerConnected: input.isConnected,
            valueLength: inputValue(input).length
        });
        let currentInput = inputElement();
        if (!currentInput || !currentInput.isConnected) {
            throw new Error("清空 composer 后未找到有效的 ChatGPT 输入框。");
        }
        if (currentInput !== input) {
            console.log("[WSJ Mention] composer refreshed");
            reportDiagnostic(currentRequestId, "composer.refreshed", "replaced", {
                composerType: currentInput.tagName === "TEXTAREA" ? "textarea" : "contenteditable",
                composerConnected: currentInput.isConnected,
                composerVisible: visible(currentInput)
            });
        }

        console.log("[WSJ Mention] attempt 1");
        reportDiagnostic(currentRequestId, "autocomplete.attempt.started", "started", { attempt: 1 });
        currentInput.focus();
        placeCaretAtEnd(currentInput);
        insertText(currentInput, "@");
        console.log("[WSJ Mention] @ entered", { valueLength: inputValue(currentInput).length });
        reportDiagnostic(currentRequestId, "autocomplete.at-entered", "inserted", {
            attempt: 1,
            composerFocused: document.activeElement === currentInput,
            valueLength: inputValue(currentInput).length,
            onlyAt: inputValue(currentInput).trim() === "@"
        });
        const firstAutocompleteDetected = await waitForPluginAutocomplete();
        const firstPluginSection = document.querySelector('[data-mention-section-id="plugins"]');
        console.log("[WSJ Mention] attempt 1 autocomplete result", {
            detected: firstAutocompleteDetected,
            visible: visible(firstPluginSection),
            sectionIds: [...document.querySelectorAll("[data-mention-section-id]")]
                .map((section) => section.getAttribute("data-mention-section-id"))
        });
        reportDiagnostic(currentRequestId, "autocomplete.attempt.result", firstAutocompleteDetected ? "detected" : "not-detected", {
            attempt: 1,
            exists: Boolean(firstPluginSection),
            visible: visible(firstPluginSection),
            sectionIds: [...document.querySelectorAll("[data-mention-section-id]")]
                .map((section) => section.getAttribute("data-mention-section-id"))
        });
        if (firstAutocompleteDetected) {
            console.log("[WSJ Mention] autocomplete detected after @");
        } else {
            console.warn("[WSJ Mention] Plugin section not visible after @; entering plugin name to filter autocomplete");
            reportDiagnostic(currentRequestId, "autocomplete.query-fallback", "continue-with-plugin-name", {
                attempt: 1,
                pluginSectionExists: Boolean(firstPluginSection),
                pluginSectionVisible: visible(firstPluginSection),
                sectionIds: [...document.querySelectorAll("[data-mention-section-id]")]
                    .map((section) => section.getAttribute("data-mention-section-id")),
                composerFocused: document.activeElement === currentInput,
                composerConnected: currentInput.isConnected
            });
        }
        const composerBeforePluginName = inputElement();
        if (!isUsableComposer(composerBeforePluginName) || inputValue(composerBeforePluginName).trim() !== "@") {
            reportDiagnostic(currentRequestId, "plugin.name.input.started", "aborted", {
                reason: "composer-unusable-or-content-changed",
                composerConnected: Boolean(composerBeforePluginName?.isConnected),
                composerVisible: visible(composerBeforePluginName),
                valueLength: composerBeforePluginName ? inputValue(composerBeforePluginName).length : 0
            });
            throw new Error("输入 @ 后 ChatGPT composer 已变化，已停止插件名称输入。");
        }
        if (composerBeforePluginName !== currentInput) {
            console.log("[WSJ Mention] composer refreshed before plugin name");
        }
        currentInput = composerBeforePluginName;
        currentInput.focus();
        placeCaretAtEnd(currentInput);
        console.log("[WSJ Mention] entering plugin name", { pluginName });
        reportDiagnostic(currentRequestId, "plugin.name.input.started", "started", { pluginName });
        for (const character of pluginName) {
            insertText(currentInput, character);
            await sleep(50);
        }
        console.log("[WSJ Mention] plugin name entered", { valueLength: inputValue(currentInput).length });
        reportDiagnostic(currentRequestId, "plugin.name.input.finished", "success", {
            composerConnected: currentInput.isConnected,
            composerFocused: document.activeElement === currentInput,
            valueLength: inputValue(currentInput).length
        });
        return currentInput;
    }
    async function insertPromptAfterPluginChip(input, prompt, pluginName) {
        await waitForPluginSelected(pluginName);
        reportDiagnostic(currentRequestId, "prompt.injection.started", "started", { promptLength: prompt.length });
        input.focus();
        placeCaretAtEnd(input);
        insertText(input, ` ${prompt}`);
        const preservedChip = findPluginChip(pluginName);
        if (!preservedChip) {
            reportDiagnostic(currentRequestId, "prompt.injection.finished", "failed", { promptLength: prompt.length, chipPreserved: false });
            throw new Error("Prompt 注入后 Plugin chip 丢失");
        }
        console.log("[WSJ Mention] prompt injected", { textLength: inputValue(input).length });
        console.log("[WSJ Mention] plugin chip preserved", { displayName: preservedChip.getAttribute("app-mention-display-name") });
        reportDiagnostic(currentRequestId, "prompt.injection.finished", "success", {
            promptLength: prompt.length,
            chipPreserved: true,
            chipDisplayName: preservedChip.getAttribute("app-mention-display-name")
        });
    }
    async function selectPlugin(input, pluginName) {
        if (!input) throw new Error("未找到 ChatGPT 输入框，请确认已登录。");
        console.log("[WSJ Mention] selectPlugin started", { pluginName });
        sendStatus(currentTaskId, currentRequestId, "working", `正在搜索 ChatGPT 插件：${pluginName}……`);
        const currentInput = await triggerPluginMention(input, pluginName);
        const inspectMentionSections = () => {
            let remainingCandidates = 4;
            return [...document.querySelectorAll("[data-mention-section-id]")].slice(0, 8).map((section) => {
                const matchingButtons = remainingCandidates > 0
                    ? [...section.querySelectorAll("button")]
                        .filter((button) => visibleText(button).includes(normalized(pluginName)))
                        .slice(0, remainingCandidates)
                    : [];
                remainingCandidates -= matchingButtons.length;
                return {
                    sectionId: section.getAttribute("data-mention-section-id"),
                    items: section.getAttribute("data-mention-section-items"),
                    visible: visible(section),
                    matchingButtons: matchingButtons.map((button) => ({
                        tagName: button.tagName,
                        role: button.getAttribute("role"),
                        ariaLabel: button.getAttribute("aria-label"),
                        listNavigationItem: button.getAttribute("data-list-navigation-item"),
                        mentionContent: button.getAttribute("data-mention-content"),
                        visible: visible(button),
                        text: button.innerText || button.textContent || ""
                    }))
                };
            });
        };
        const deadline = Date.now() + 10000;
        let result = null;
        while (Date.now() < deadline && !(result = findPluginResult(pluginName))) await sleep(200);
        if (!result) {
            const sections = inspectMentionSections();
            console.warn("[WSJ Mention] plugin candidate lookup failed", {
                pluginName,
                sections
            });
            reportDiagnostic(currentRequestId, "plugin.candidate.lookup.failed", "not-found", { pluginName, sections });
            throw new Error(`未找到 ChatGPT 插件：${pluginName}`);
        }
        const candidateDetails = {
            candidateSectionId: result.closest("[data-mention-section-id]")?.getAttribute("data-mention-section-id") || "",
            candidateTagName: result.tagName,
            candidateRole: result.getAttribute("role") || "",
            candidateListNavigationItem: result.getAttribute("data-list-navigation-item") || "",
            candidateAriaLabel: result.getAttribute("aria-label") || "",
            candidateMentionContent: result.getAttribute("data-mention-content") || "",
            candidateVisible: visible(result),
            candidateText: result.innerText || result.textContent || ""
        };
        console.log("[WSJ Mention] WSJ candidate found", {
            ...candidateDetails
        });
        reportDiagnostic(currentRequestId, "plugin.candidate.found", "success", {
            ...candidateDetails,
            sections: inspectMentionSections()
        });
        reportDiagnostic(currentRequestId, "plugin.candidate.click.started", "started", candidateDetails);
        try {
            result.click();
        } catch (error) {
            reportDiagnostic(currentRequestId, "plugin.candidate.click.finished", "failed", candidateDetails, error);
            throw new Error(`找到插件但无法选择：${pluginName}`);
        }
        console.log("[WSJ Mention] plugin selected");
        reportDiagnostic(currentRequestId, "plugin.candidate.click.finished", "clicked", candidateDetails);
        await waitForPluginSelected(pluginName, 10000);
        return currentInput;
    }

    async function run(taskId, requestId, prompt, processorType, pluginName, processorId, processorName) {
        currentTaskId = taskId;
        currentRequestId = requestId;
        console.log("[WSJ Mention] run started", { taskId, requestId, processorType, pluginName });
        reportDiagnostic(requestId, "run.started", "started", { taskId, processorId, processorType, processorName, pluginName });
        sendStatus(taskId, requestId, "working", "正在等待 ChatGPT 输入框……");
        const deadline = Date.now() + 10000;
        let input;
        while (Date.now() < deadline && !(input = inputElement())) await sleep(200);
        if (!input) throw new Error("未找到 ChatGPT 输入框，请确认已登录。");

        const selectedPluginName = pluginName || "WSJ 金融精译";
        if (processorType === "plugin") {
            console.log("[WSJ Mention] plugin branch started", { processorType, pluginName: selectedPluginName });
            reportDiagnostic(requestId, "plugin.branch.started", "started", { taskId, processorId, processorType, processorName, pluginName: selectedPluginName });
            input = await selectPlugin(input, selectedPluginName);
        }
        sendStatus(taskId, requestId, "working", processorType === "plugin" ? "插件已选择，正在填入 Prompt……" : "正在填入 Prompt……");
        if (processorType === "plugin") await insertPromptAfterPluginChip(input, prompt, selectedPluginName);
        else setInput(input, prompt);
        sendStatus(taskId, requestId, "working", "Prompt 已填入，正在等待 Send button 变为可用……");
        reportDiagnostic(requestId, "sendButton.lookup.started", "started", { taskId, processorId, processorType });
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
        reportDiagnostic(requestId, "sendButton.lookup.finished", button ? "found" : "not-found", {
            sendButtonFound: Boolean(button),
            sendButtonVisible: visible(button),
            sendButtonEnabled: Boolean(button && enabled(button))
        });
        if (!button) throw new Error(processorType === "plugin" ? "Prompt 已填充，但未找到发送按钮" : "Prompt 已自动填入，但发送按钮未能自动触发，请手动点击右下角 ↑。");
        reportDiagnostic(requestId, "message.send.started", "started", { taskId, processorType });
        button.click();
        if (processorType === "plugin") console.log("[WSJ Mention] message sent");
        reportDiagnostic(requestId, "message.send.finished", "clicked", { taskId, processorType });
        sendStatus(taskId, requestId, "sent", "Prompt 已自动发送，正在等待 ChatGPT 翻译……");
    }

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type !== "fillAndSend") return;
        console.log("[WSJ Mention] fillAndSend received", {
            taskId: message.taskId,
            requestId: message.requestId,
            processorType: message.processorType,
            pluginName: message.pluginName,
            pluginId: message.pluginId
        });
        reportDiagnostic(message.requestId, "fillAndSend.received", "received", {
            taskId: message.taskId,
            processorId: message.processorId,
            processorType: message.processorType,
            processorName: message.processorName,
            pluginName: message.pluginName,
            pluginId: message.pluginId
        });
        run(message.taskId, message.requestId, message.prompt, message.processorType, message.pluginName, message.processorId, message.processorName)
            .catch((error) => {
                console.error("[WSJ Mention] fillAndSend failed", {
                    taskId: message.taskId,
                    requestId: message.requestId,
                    error: error.message
                });
                reportDiagnostic(message.requestId, "automation.exception", "failed", {
                    taskId: message.taskId,
                    processorId: message.processorId,
                    processorType: message.processorType,
                    processorName: message.processorName,
                    pluginName: message.pluginName,
                    pluginId: message.pluginId
                }, error);
                sendStatus(message.taskId, message.requestId, "failed", "自动发送失败", error.message);
            })
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
