const requestId = new URLSearchParams(window.location.search).get("requestId") || "";
let selectedText = "";
let processors = [];
let researchTasks = [];
let taskDefaults = {};
let customTasks = [];
let selectedProcessorId = "builtin-translation";
let lastTaskId = "translation";

const originalElement = document.getElementById("original");
const modeElement = document.getElementById("mode");
const processorSelect = document.getElementById("processorSelect");
const statusElement = document.getElementById("status");

function sendMessage(message, callback) { chrome.runtime.sendMessage(message, callback); }
function selectedProcessor() { return processors.find((item) => item.id === selectedProcessorId) || processors[0]; }
function buildPrompt() {
    const task = researchTasks.find((item) => item.id === modeElement.value) || researchTasks[0];
    return `${task?.prompt || ""}\n\n【用户材料】\n${selectedText}`;
}
function showStatus(text) { statusElement.textContent = text; }
function renderProcessors() {
    processorSelect.replaceChildren();
    processors.forEach((item) => processorSelect.add(new Option(item.name, item.id)));
    if (!processors.some((item) => item.id === selectedProcessorId)) selectedProcessorId = processors[0]?.id || "builtin-translation";
    processorSelect.value = selectedProcessorId;
}
function renderResearchTasks() {
    modeElement.replaceChildren();
    researchTasks.forEach((task) => modeElement.add(new Option(task.name, task.id)));
    modeElement.value = researchTasks.some((task) => task.id === lastTaskId) ? lastTaskId : (researchTasks[0]?.id || "translation");
}
function applyTaskDefault() {
    const task = researchTasks.find((item) => item.id === modeElement.value);
    const processorId = taskDefaults[task?.id] || task?.defaultProcessorId || "standard-chat";
    if (!processors.some((item) => item.id === processorId)) return;
    selectedProcessorId = processorId;
    processorSelect.value = processorId;
    sendMessage({ type: "saveSelectedProcessor", processorId });
}

async function load() {
    if (!requestId) throw new Error("研究请求不存在，请重新选择网页文字。");
    const [request, processorSettings, tasks] = await Promise.all([
        new Promise((resolve) => sendMessage({ type: "getRequest", requestId }, resolve)),
        new Promise((resolve) => sendMessage({ type: "getProcessors" }, resolve)),
        window.loadPraResearchTasks()
    ]);
    if (!request) throw new Error("研究请求已失效，请重新选择文字。");
    selectedText = request.selectedText || "";
    processors = processorSettings?.processors || [];
    taskDefaults = processorSettings?.taskDefaults || {};
    customTasks = processorSettings?.customTasks || [];
    researchTasks = [...tasks, ...customTasks];
    selectedProcessorId = processorSettings?.selectedProcessorId || "builtin-translation";
    const requestedTaskId = request.taskId || (request.mode === "wsj" ? "translation" : request.mode);
    lastTaskId = researchTasks.some((task) => task.id === requestedTaskId) ? requestedTaskId : (researchTasks[0]?.id || "translation");
    renderResearchTasks();
    renderProcessors();
    originalElement.textContent = selectedText || "没有获取到输入内容。";
    applyTaskDefault();
    showStatus(request.sourceType === "article" ? "已识别完整文章。" : "已获取输入内容。" );
}

modeElement.addEventListener("change", () => {
    lastTaskId = modeElement.value;
    applyTaskDefault();
});
processorSelect.addEventListener("change", () => {
    selectedProcessorId = processorSelect.value;
    sendMessage({ type: "saveSelectedProcessor", processorId: selectedProcessorId });
    showStatus("已选择：" + (selectedProcessor()?.name || "AI Processor"));
});

document.getElementById("copyPromptButton").addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(buildPrompt());
        showStatus("Prompt 已复制。" );
    } catch (_) { showStatus("复制失败，请手动复制。" ); }
});
document.getElementById("copyOpenButton").addEventListener("click", async () => {
    const prompt = buildPrompt();
    let copied = true;
    try { await navigator.clipboard.writeText(prompt); } catch (_) { copied = false; }
    const processor = selectedProcessor();
    const languageRequirement = processor?.type === "custom_gpt" || processor?.type === "standard-chat"
        ? "请使用简体中文与我交流和回答。分析过程中可以保留公司名称、产品名称、财务指标及必要的专业术语英文原文。\n\n"
        : "";
    sendMessage({ type: "launchAutomation", requestId, prompt: languageRequirement + prompt, gptUrl: processor?.url || "" }, (result) => {
        if (!result?.ok) showStatus((copied ? "自动发送启动失败：" : "Prompt 复制失败，") + (result?.error || "请手动打开 ChatGPT。"));
        else showStatus(copied ? "Prompt 已复制，正在打开 GPT……" : "GPT 已打开，请手动粘贴 Prompt。" );
    });
});
document.getElementById("openGPTButton").addEventListener("click", () => {
    window.open(selectedProcessor()?.url || "https://chatgpt.com/", "_blank");
    showStatus("已打开 " + (selectedProcessor()?.name || "AI Processor") + "。" );
});

load().catch((error) => { originalElement.textContent = "没有获取到输入内容。"; showStatus(error.message); });
