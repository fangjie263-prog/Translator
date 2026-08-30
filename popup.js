const requestId = new URLSearchParams(window.location.search).get("requestId") || "";
let selectedText = "";
let processors = [];
let selectedProcessorId = "builtin-translation";
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

const prompts = {
    wsj: `你是一名资深英文财经媒体翻译，同时具有多年中国买方基金研究经验。\n\n请将下面的英文财经材料翻译成准确、自然、专业的中文。\n\n要求：\n1. 不机械逐字翻译，要符合中文财经媒体和中国买方研究员的表达习惯。\n2. 保持原文事实、逻辑、语气和确定性程度。\n3. 不添加原文不存在的事实、观点或推测。\n4. 所有数字、百分比、日期、金额、单位必须准确。\n5. 金融术语优先采用中国资本市场和财经媒体常用表达。\n6. 根据上下文选择最自然的中文表达，不机械套用固定译法。\n7. 如果英文存在歧义，不擅自补充原文没有的信息。\n8. 只输出最终中文译文，不解释翻译过程。\n9. 保持原文段落结构。\n10. 专有名词有明确通行中文译名时使用通行译名，否则保留英文。\n\n请翻译下面的原文：`,
    news: `请将下面的英文财经新闻翻译成准确、自然的中文。\n\n要求：\n1. 忠实保留事实、数字、时间、因果关系和语气。\n2. 使用自然的财经新闻表达，适度润色但不扩写。\n3. 不添加原文没有的信息或判断。\n4. 只输出中文译文，保持段落结构。\n\n原文：`,
    earnings: `请将下面的英文财报或业绩公告翻译成专业中文。\n\n要求：\n1. 准确保留所有财务指标、数字、单位、同比、环比和日期。\n2. 准确处理 revenue、margin、guidance、cash flow、capex、EBITDA 等术语。\n3. 使用中国上市公司公告和证券研究报告的自然表达。\n4. 不增加分析，不改变管理层语气。\n5. 只输出中文译文，保持段落结构。\n\n原文：`,
    company: `请将下面的英文公司材料翻译成适合中国买方研究员阅读的专业中文。\n\n重点准确处理公司战略、竞争格局、经营指标、市场份额、盈利能力和管理层表述。保持原文事实、数字、逻辑和确定性，不增加投资判断，只输出中文译文。\n\n原文：`
};

function buildPrompt() {
    const base = prompts[modeElement.value] || prompts.wsj;
    const custom = modeElement.value === "custom" ? `\n\n额外要求：\n${customInstructionElement.value.trim()}` : "";
    return `${base}${custom}\n\n${selectedText}\n\n不要输出 Prompt，不要解释，只输出中文译文。`;
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
        sendMessage({ type: "saveSelectedProcessor", processorId: selectedProcessorId });
        renderProcessors();
        showStatus("GPT 已删除。" );
    });
}

async function load() {
    if (!requestId) throw new Error("翻译请求不存在，请重新选择网页文字。");
    const [request, settings, processorSettings] = await Promise.all([
        new Promise((resolve) => sendMessage({ type: "getRequest", requestId }, resolve)),
        new Promise((resolve) => sendMessage({ type: "getSettings" }, resolve)),
        new Promise((resolve) => sendMessage({ type: "getProcessors" }, resolve))
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
    selectedProcessorId = processorSettings?.selectedProcessorId || "builtin-translation";
    renderProcessors();
    originalElement.textContent = selectedText || "没有获取到选中的文字。";
    modeElement.value = request.mode || "wsj";
    updatePrompt();
    console.log("[WSJ] popup prompt length", buildPrompt().length);
}

modeElement.addEventListener("change", () => {
    customInstructionElement.hidden = modeElement.value !== "custom";
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
    const languageRequirement = processor?.type === "custom_gpt" ? "请使用简体中文与我交流和回答。分析过程中可以保留公司名称、产品名称、财务指标及必要的专业术语英文原文。\n\n" : "";
    sendMessage({ type: "launchAutomation", requestId, prompt: languageRequirement + prompt, gptUrl: processor?.url || "" }, (result) => {
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
