const requestId = new URLSearchParams(window.location.search).get("requestId") || "";
let selectedText = "";
let processors = [];
let researchTasks = [];
let taskDefaults = {};
let customTasks = [];
let selectedProcessorId = "builtin-translation";
let editingTaskId = null;
let lastTaskId = "translation";
let editingProcessorId = null;

const originalElement = document.getElementById("original");
const modeElement = document.getElementById("mode");
const customInstructionElement = document.getElementById("customInstruction");
const promptElement = document.getElementById("prompt");
const resultElement = document.getElementById("result");
const statusElement = document.getElementById("status");
const processorSelect = document.getElementById("processorSelect");
const processorList = document.getElementById("processorList");
const processorEditor = document.getElementById("processorEditor");
const processorName = document.getElementById("processorName");
const processorUrl = document.getElementById("processorUrl");
const processorError = document.getElementById("processorError");
const taskEditor = document.getElementById("taskEditor");
const taskName = document.getElementById("taskName");
const taskPrompt = document.getElementById("taskPrompt");
const taskError = document.getElementById("taskError");
const editTaskButton = document.getElementById("editTaskButton");
const deleteTaskButton = document.getElementById("deleteTaskButton");

function buildPrompt() {
    const task = researchTasks.find((item) => item.id === modeElement.value) || researchTasks[0];
    const custom = customInstructionElement.value.trim() ? `\n\n【补充要求】\n${customInstructionElement.value.trim()}` : "";
    return `${task?.prompt || ""}${custom}\n\n【用户材料】\n${selectedText}`;
}
function updatePrompt() { promptElement.textContent = buildPrompt(); }
function showStatus(text) { statusElement.textContent = text; }
function sendMessage(message, callback) { chrome.runtime.sendMessage(message, callback); }

function selectedProcessor() { return processors.find((item) => item.id === selectedProcessorId) || processors[0]; }
function renderProcessors() {
    processorSelect.replaceChildren();
    processors.forEach((item) => {
        const option = new Option(item.name, item.id);
        processorSelect.add(option);
    });
    if (!processors.some((item) => item.id === selectedProcessorId)) selectedProcessorId = processors[0]?.id || "builtin-translation";
    processorSelect.value = selectedProcessorId;
    processorList.replaceChildren();
    processors.filter((item) => item.type === "custom_gpt").forEach((item) => {
        const row = document.createElement("div");
        row.className = "processor-row";
        const label = document.createElement("span");
        label.textContent = item.name;
        const edit = document.createElement("button");
        edit.textContent = "编辑";
        edit.onclick = () => openEditor(item);
        const remove = document.createElement("button");
        remove.textContent = "删除";
        remove.onclick = () => removeProcessor(item.id);
        row.append(label, edit, remove);
        processorList.append(row);
    });
    if (researchTasks.length) renderResearchTasks();
}
function renderResearchTasks() {
    const current = lastTaskId;
    modeElement.replaceChildren();
    researchTasks.forEach((task) => modeElement.add(new Option(task.name, task.id)));
    modeElement.add(new Option("────────────", "__separator__"));
    modeElement.add(new Option("＋ 新增研究任务", "__new__"));
    modeElement.value = researchTasks.some((task) => task.id === current) ? current : (researchTasks[0]?.id || "translation");
    const custom = customTasks.some((task) => task.id === modeElement.value);
    editTaskButton.hidden = !custom;
    deleteTaskButton.hidden = !custom;
}
function applyTaskDefault() {
    const task = researchTasks.find((item) => item.id === modeElement.value);
    const processorId = taskDefaults[task?.id] || task?.defaultProcessorId;
    if (!processorId || !processors.some((item) => item.id === processorId)) return;
    selectedProcessorId = processorId;
    processorSelect.value = processorId;
    sendMessage({ type: "saveSelectedProcessor", processorId });
}
function openTaskEditor(task = null) {
    editingTaskId = task?.id || null;
    taskName.value = task?.name || "";
    taskPrompt.value = task?.prompt || "";
    taskError.textContent = "";
    taskEditor.hidden = false;
    taskName.focus();
}
function closeTaskEditor() { taskEditor.hidden = true; editingTaskId = null; taskError.textContent = ""; }
function saveTask() {
    const name = taskName.value.trim();
    const prompt = taskPrompt.value.trim();
    if (!name || !prompt) return taskError.textContent = "任务名称和 Research Prompt 不能为空。";
    const existingTask = customTasks.find((item) => item.id === editingTaskId);
    const defaultProcessorId = existingTask?.defaultProcessorId || selectedProcessorId || "standard-chat";
    const task = { id: editingTaskId || (crypto.randomUUID ? crypto.randomUUID() : "task-" + Date.now()), name, prompt, defaultProcessorId, type: "custom" };
    sendMessage({ type: "saveResearchTask", task }, (result) => {
        if (!result?.ok) return taskError.textContent = result?.error || "任务保存失败。";
        customTasks = result.customTasks || customTasks;
        researchTasks = [...researchTasks.filter((item) => item.type === "system"), ...customTasks];
        lastTaskId = task.id;
        renderResearchTasks();
        applyTaskDefault();
        closeTaskEditor();
        updatePrompt();
        showStatus("Research Task 已保存。" );
    });
}
function deleteTask() {
    const task = customTasks.find((item) => item.id === modeElement.value);
    if (!task || !confirm(`确定删除研究任务“${task.name}”吗？`)) return;
    sendMessage({ type: "deleteResearchTask", taskId: task.id }, (result) => {
        if (!result?.ok) return showStatus(result?.error || "任务删除失败。" );
        customTasks = result.customTasks || [];
        researchTasks = researchTasks.filter((item) => item.id !== task.id);
        lastTaskId = researchTasks[0]?.id || "translation";
        renderResearchTasks();
        applyTaskDefault();
        updatePrompt();
        showStatus("Research Task 已删除。" );
    });
}
function openEditor(item = null) {
    editingProcessorId = item?.id || null;
    processorName.value = item?.name || "";
    processorUrl.value = item?.url || "";
    processorError.textContent = "";
    processorEditor.hidden = false;
    processorName.focus();
}
function closeEditor() { processorEditor.hidden = true; editingProcessorId = null; processorError.textContent = ""; }
function saveProcessor() {
    const name = processorName.value.trim();
    const url = processorUrl.value.trim();
    if (!name) return processorError.textContent = "请输入 GPT 名称。";
    if (!/^https:\/\/chatgpt\.com\/g\//i.test(url)) return processorError.textContent = "GPT URL 必须以 https://chatgpt.com/g/ 开头。";
    const id = editingProcessorId || (crypto.randomUUID ? crypto.randomUUID() : "custom-" + Date.now());
    const updated = { id, name, url, type: "custom_gpt" };
    processors = editingProcessorId ? processors.map((item) => item.id === id ? updated : item) : [...processors, updated];
    sendMessage({ type: "saveProcessors", processors }, (result) => {
        if (!result?.ok) return processorError.textContent = result?.error || "保存失败。";
        selectedProcessorId = id;
        sendMessage({ type: "saveSelectedProcessor", processorId: selectedProcessorId });
        renderProcessors();
        closeEditor();
        showStatus("GPT 配置已保存。" );
    });
}
function removeProcessor(id) {
    processors = processors.filter((item) => item.id !== id);
    sendMessage({ type: "saveProcessors", processors }, (result) => {
        if (!result?.ok) return showStatus(result?.error || "删除失败。" );
        if (selectedProcessorId === id) selectedProcessorId = "builtin-translation";
        taskDefaults = result.taskDefaults || taskDefaults;
        customTasks = result.customTasks || customTasks;
        researchTasks = [...researchTasks.filter((item) => item.type === "system"), ...customTasks];
        sendMessage({ type: "saveSelectedProcessor", processorId: selectedProcessorId });
        renderProcessors();
        showStatus("GPT 已删除。" );
    });
}

async function load() {
    if (!requestId) throw new Error("翻译请求不存在，请重新选择网页文字。");
    const [request, settings, processorSettings, tasks] = await Promise.all([
        new Promise((resolve) => sendMessage({ type: "getRequest", requestId }, resolve)),
        new Promise((resolve) => sendMessage({ type: "getSettings" }, resolve)),
        new Promise((resolve) => sendMessage({ type: "getProcessors" }, resolve)),
        window.loadPraResearchTasks()
    ]);
    if (!request) throw new Error("翻译请求已失效，请重新选择文字。");
    selectedText = request.selectedText || "";
    console.log("[WSJ] popup sourceType", request.sourceType || null);
    console.log("[WSJ] popup sourceText length", (request.sourceText || "").length);
    console.log("[WSJ] popup selectedText length", selectedText.length);
    console.log("[WSJ] popup article metadata", {
        title: request.title || request.articleContext?.title || null,
        author: request.author || request.articleContext?.author || null,
        subtitle: request.subtitle || request.articleContext?.subtitle || null,
        url: request.url || request.articleContext?.url || null,
        articleId: request.articleId || request.articleContext?.articleId || null
    });
    processors = processorSettings?.processors || [{ id: "builtin-translation", name: "金融精译", type: "builtin", url: settings?.gptUrl || "" }];
    researchTasks = tasks || [];
    taskDefaults = processorSettings?.taskDefaults || {};
    customTasks = processorSettings?.customTasks || [];
    researchTasks = [...researchTasks, ...customTasks];
    selectedProcessorId = processorSettings?.selectedProcessorId || "builtin-translation";
    renderResearchTasks();
    renderProcessors();
    originalElement.textContent = selectedText || "没有获取到选中的文字。";
    const requestedTaskId = request.taskId || (request.mode === "wsj" ? "translation" : request.mode);
    lastTaskId = researchTasks.some((task) => task.id === requestedTaskId) ? requestedTaskId : (researchTasks[0]?.id || "translation");
    modeElement.value = lastTaskId;
    applyTaskDefault();
    showStatus(request.sourceType === "article"
        ? `已识别完整文章${request.articleContext?.title ? "：" + request.articleContext.title : "。"}`
        : "已获取选中文字。" );
    updatePrompt();
    console.log("[WSJ] popup prompt length", buildPrompt().length);
}

modeElement.addEventListener("change", () => {
    if (modeElement.value === "__new__") {
        modeElement.value = lastTaskId;
        openTaskEditor();
        return;
    }
    if (modeElement.value === "__separator__") {
        modeElement.value = lastTaskId;
        return;
    }
    lastTaskId = modeElement.value;
    const isCustom = customTasks.some((task) => task.id === lastTaskId);
    editTaskButton.hidden = !isCustom;
    deleteTaskButton.hidden = !isCustom;
    applyTaskDefault();
    updatePrompt();
});
customInstructionElement.addEventListener("input", updatePrompt);

processorSelect.addEventListener("change", () => {
    selectedProcessorId = processorSelect.value;
    sendMessage({ type: "saveSelectedProcessor", processorId: selectedProcessorId });
    showStatus("已选择：" + (selectedProcessor()?.name || "金融精译"));
});
document.getElementById("addProcessorButton").addEventListener("click", () => openEditor());
document.getElementById("saveProcessorButton").addEventListener("click", saveProcessor);
document.getElementById("cancelProcessorButton").addEventListener("click", closeEditor);
editTaskButton.addEventListener("click", () => openTaskEditor(customTasks.find((task) => task.id === modeElement.value)));
deleteTaskButton.addEventListener("click", deleteTask);
document.getElementById("saveTaskButton").addEventListener("click", saveTask);
document.getElementById("cancelTaskButton").addEventListener("click", closeTaskEditor);

async function copyPrompt() {
    await navigator.clipboard.writeText(buildPrompt());
    showStatus("Prompt 已复制。" );
}
document.getElementById("copyPromptButton").addEventListener("click", async () => {
    try { await copyPrompt(); } catch (_) { showStatus("复制失败，请手动选择 Prompt。" ); }
});
document.getElementById("copyOpenButton").addEventListener("click", async () => {
    const prompt = buildPrompt();
    let copied = true;
    try { await navigator.clipboard.writeText(prompt); } catch (_) { copied = false; }
    const processor = selectedProcessor();
    const languageRequirement = processor?.type === "custom_gpt" || processor?.type === "standard-chat" ? "请使用简体中文与我交流和回答。分析过程中可以保留公司名称、产品名称、财务指标及必要的专业术语英文原文。\n\n" : "";
    sendMessage({ type: "launchAutomation", requestId, prompt: languageRequirement + prompt, gptUrl: processor?.url || "", processorType: processor?.type || "" }, (result) => {
        if (!result?.ok) {
            showStatus((copied ? "自动发送启动失败：" : "Prompt 复制失败，") + (result?.error || "请在 ChatGPT 页面按 Ctrl+V 后发送。"));
        } else {
            showStatus(copied ? "Prompt 已复制，正在打开 GPT……" : "GPT 已打开，请在 ChatGPT 页面按 Ctrl+V 后发送。" );
        }
    });
});
document.getElementById("openGPTButton").addEventListener("click", () => {
    const processor = selectedProcessor();
    window.open(processor?.url || "https://chatgpt.com/", "_blank");
    showStatus("已打开 " + (processor?.name || "GPT") + "。" );
});
document.getElementById("copyResultButton").addEventListener("click", async () => {
    if (!resultElement.value.trim()) return showStatus("当前没有可复制的译文。" );
    try { await navigator.clipboard.writeText(resultElement.value); showStatus("译文已复制。" ); }
    catch (_) { showStatus("复制失败，请手动选择译文。" ); }
});
document.getElementById("resetButton").addEventListener("click", () => {
    resultElement.value = "";
    showStatus("已清空译文，可以重新生成 Prompt。" );
    updatePrompt();
});

chrome.runtime.onMessage.addListener((message) => {
    if (message.requestId !== requestId || message.type !== "autoSendStatus") return;
    if (message.status === "sent") showStatus("Prompt 已自动发送，正在等待 ChatGPT 翻译……" );
    if (message.status === "failed") showStatus("自动发送失败：" + (message.error || "Prompt 已填入，但未能自动发送，请点击 ChatGPT 右下角 ↑ 按钮。"));
    if (message.text && message.status === "working") showStatus(message.text);
});

load().catch((error) => { originalElement.textContent = "没有获取到选中的文字。"; showStatus(error.message); });
