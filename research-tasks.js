(function () {
    "use strict";

    const definitions = [
        { id: "translation", name: "财经精译", file: "财经精译.txt", defaultProcessorId: "builtin-translation", type: "system" },
        { id: "article-speed-read", name: "财经文章速读", file: "财经文章速读.txt", defaultProcessorId: "investment-research-assistant", type: "system" },
        { id: "investment-logic", name: "投资逻辑分析", file: "【研究任务：投资逻辑分析】.txt", defaultProcessorId: "equity-research-analyst", type: "system" },
        { id: "fund-manager", name: "基金经理视角", file: "【研究任务：基金经理视角】.txt", defaultProcessorId: "investment-research-assistant", type: "system" },
        { id: "logic-critique", name: "投资逻辑质疑", file: "【研究任务：投资逻辑质疑】.txt", defaultProcessorId: "equity-research-analyst", type: "system" },
        { id: "company-industry", name: "公司 / 行业研究", file: "【研究任务：公司  行业研究】.txt", defaultProcessorId: "investment-research-assistant", type: "system" },
        { id: "fact-check", name: "事实与数据核查", file: "【研究任务：事实与数据核查】.txt", defaultProcessorId: "investment-research-assistant", type: "system" },
        { id: "financial-valuation", name: "财务 / 盈利 / 估值分析", file: "【研究任务：财务  盈利  估值分析】.txt", defaultProcessorId: "10-k-wizard", type: "system" },
        { id: "research-follow-up", name: "研究跟进 / 下一步行动", file: "【研究任务：研究跟进  下一步行动】.txt", defaultProcessorId: "investment-research-assistant", type: "system" }
    ];

    window.PRA_RESEARCH_TASKS = definitions;
    window.loadPraResearchTasks = async function () {
        return Promise.all(definitions.map(async (definition) => {
            const response = await fetch(chrome.runtime.getURL(definition.file));
            if (!response.ok) throw new Error(`无法读取 Research Task：${definition.name}`);
            return { ...definition, prompt: (await response.text()).trim() };
        }));
    };
}());
