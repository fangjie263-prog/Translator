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

    async function run(taskId, requestId, prompt) {
        sendStatus(taskId, requestId, "working", "正在等待 ChatGPT 输入框……");
        const deadline = Date.now() + 10000;
        let input;
        while (Date.now() < deadline && !(input = inputElement())) await sleep(200);
        if (!input) throw new Error("未找到 ChatGPT 输入框，请确认已登录。");

        sendStatus(taskId, requestId, "working", "正在填入 Prompt……");
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
        if (!button) throw new Error("Prompt 已自动填入，但发送按钮未能自动触发，请手动点击右下角 ↑。");
        button.click();
        sendStatus(taskId, requestId, "sent", "Prompt 已自动发送，正在等待 ChatGPT 翻译……");
    }

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type !== "fillAndSend") return;
        run(message.taskId, message.requestId, message.prompt)
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
