(function () {
    "use strict";
    let processors = [];
    let systemTasks = [];
    let customTasks = [];
    let taskDefaults = {};
    let editingProcessorId = null;
    let editingTaskId = null;
    const processorRows = document.getElementById("processorRows");
    const processorForm = document.getElementById("processorForm");
    const processorName = document.getElementById("processorName");
    const processorUrl = document.getElementById("processorUrl");
    const processorError = document.getElementById("processorError");
    const taskRows = document.getElementById("taskRows");
    const taskForm = document.getElementById("taskForm");
    const taskName = document.getElementById("taskName");
    const taskPrompt = document.getElementById("taskPrompt");
    const taskError = document.getElementById("taskError");
    const defaultRows = document.getElementById("defaultRows");
    const status = document.getElementById("status");
    const send = (message, callback) => chrome.runtime.sendMessage(message, callback);
    const show = (text) => { status.textContent = text; };
    function closeProcessor() { processorForm.hidden = true; editingProcessorId = null; processorError.textContent = ""; }
    function closeTask() { taskForm.hidden = true; editingTaskId = null; taskError.textContent = ""; }
    function renderProcessors() {
        processorRows.replaceChildren();
        processors.forEach((item) => {
            const row = document.createElement("div"); row.className = "row";
            const name = document.createElement("strong"); name.textContent = item.name;
            const meta = document.createElement("span"); meta.className = "meta"; meta.textContent = item.type === "standard-chat" ? "系统 · ChatGPT 普通对话" : item.type === "builtin" ? "系统 · 内置金融精译" : item.url;
            row.append(name, meta);
            if (item.type === "custom_gpt") {
                const edit = document.createElement("button"); edit.className = "button"; edit.textContent = "编辑"; edit.onclick = () => openProcessor(item);
                const remove = document.createElement("button"); remove.className = "button danger"; remove.textContent = "删除"; remove.onclick = () => removeProcessor(item.id);
                row.append(edit, remove);
            } else { const protectedText = document.createElement("span"); protectedText.className = "protected"; protectedText.textContent = "受保护"; row.append(protectedText); }
            processorRows.append(row);
        });
    }
    function renderTasks() {
        taskRows.replaceChildren();
        [...systemTasks, ...customTasks].forEach((item) => {
            const row = document.createElement("div"); row.className = "row";
            const name = document.createElement("strong"); name.textContent = item.name;
            const meta = document.createElement("span"); meta.className = "meta"; meta.textContent = item.type === "system" ? "系统任务 · 受保护" : "自定义任务";
            row.append(name, meta);
            if (item.type === "custom") {
                const edit = document.createElement("button"); edit.className = "button"; edit.textContent = "编辑"; edit.onclick = () => openTask(item);
                const remove = document.createElement("button"); remove.className = "button danger"; remove.textContent = "删除"; remove.onclick = () => removeTask(item.id);
                row.append(edit, remove);
            }
            taskRows.append(row);
        });
    }
    function renderDefaults() {
        defaultRows.replaceChildren();
        systemTasks.forEach((task) => {
            const row = document.createElement("div");
            const taskLabel = document.createElement("span"); taskLabel.textContent = task.name;
            const processor = processors.find((item) => item.id === (taskDefaults[task.id] || task.defaultProcessorId));
            const processorLabel = document.createElement("span"); processorLabel.textContent = "→ " + (processor?.name || "未设置");
            row.append(taskLabel, processorLabel); defaultRows.append(row);
        });
    }
    function openProcessor(item = null) { editingProcessorId = item?.id || null; processorName.value = item?.name || ""; processorUrl.value = item?.url || ""; processorError.textContent = ""; processorForm.hidden = false; processorName.focus(); }
    function openTask(item = null) { editingTaskId = item?.id || null; taskName.value = item?.name || ""; taskPrompt.value = item?.prompt || ""; taskError.textContent = ""; taskForm.hidden = false; taskName.focus(); }
    function saveProcessor() {
        const name = processorName.value.trim(); const url = processorUrl.value.trim();
        if (!name) return processorError.textContent = "请输入 GPT 名称。";
        if (!/^https:\/\/chatgpt\.com\/g\//i.test(url)) return processorError.textContent = "GPT URL 必须以 https://chatgpt.com/g/ 开头。";
        const id = editingProcessorId || (crypto.randomUUID ? crypto.randomUUID() : "custom-" + Date.now());
        const updated = { id, name, url, type: "custom_gpt" };
        const next = editingProcessorId ? processors.map((item) => item.id === id ? updated : item) : [...processors, updated];
        send({ type: "saveProcessors", processors: next }, (result) => { if (!result?.ok) return processorError.textContent = result?.error || "保存失败。"; processors = next; renderProcessors(); closeProcessor(); show("AI Processor 已保存。" ); });
    }
    function removeProcessor(id) { if (!confirm("确定删除这个自定义 GPT 吗？")) return; const next = processors.filter((item) => item.id !== id); send({ type: "saveProcessors", processors: next }, (result) => { if (!result?.ok) return show(result?.error || "删除失败。" ); processors = next; taskDefaults = result.taskDefaults || taskDefaults; customTasks = result.customTasks || customTasks; renderProcessors(); renderTasks(); renderDefaults(); show("AI Processor 已删除。" ); }); }
    function saveTask() {
        const name = taskName.value.trim(); const prompt = taskPrompt.value.trim();
        if (!name || !prompt) return taskError.textContent = "任务名称和 Research Prompt 不能为空。";
        const old = customTasks.find((item) => item.id === editingTaskId);
        const task = { id: editingTaskId || (crypto.randomUUID ? crypto.randomUUID() : "task-" + Date.now()), name, prompt, defaultProcessorId: old?.defaultProcessorId || "standard-chat", type: "custom" };
        send({ type: "saveResearchTask", task }, (result) => { if (!result?.ok) return taskError.textContent = result?.error || "保存失败。"; customTasks = result.customTasks || customTasks; renderTasks(); closeTask(); show("Research Task 已保存。" ); });
    }
    function removeTask(id) { const task = customTasks.find((item) => item.id === id); if (!task || !confirm(`确定删除研究任务“${task.name}”吗？`)) return; send({ type: "deleteResearchTask", taskId: id }, (result) => { if (!result?.ok) return show(result?.error || "删除失败。" ); customTasks = result.customTasks || []; renderTasks(); show("Research Task 已删除。" ); }); }
    async function load() { const [settings, tasks] = await Promise.all([new Promise((resolve) => send({ type: "getProcessors" }, resolve)), window.loadPraResearchTasks()]); processors = settings?.processors || []; taskDefaults = settings?.taskDefaults || {}; customTasks = settings?.customTasks || []; systemTasks = tasks || []; renderProcessors(); renderTasks(); renderDefaults(); show("配置已加载。" ); }
    document.getElementById("addProcessor").onclick = () => openProcessor();
    document.getElementById("saveProcessor").onclick = saveProcessor;
    document.getElementById("cancelProcessor").onclick = closeProcessor;
    document.getElementById("addTask").onclick = () => openTask();
    document.getElementById("saveTask").onclick = saveTask;
    document.getElementById("cancelTask").onclick = closeTask;
    load().catch((error) => show(error.message));
}());
