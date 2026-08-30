# PRA — Personal Research Assistant

中文：个人研究助手

当前版本：

Manifest V1.1.5；PRA V1.3 task management update

PRA 从原有财经翻译工具逐步扩展为个人投资研究助手。它将网页选中的材料或支持页面中的整篇文章，交给用户选择的 Custom GPT Processor 执行。

## 已实现

### 1. 输入与 Article Provider

支持中文、英文、财经新闻、公司材料、行业材料、网页文章和研究笔记。手动选择文字时使用 `sourceType = "selection"`；可靠识别全文时使用 `sourceType = "article"`，统一保存为 `sourceText`。

当前 Article Provider 兼容：

- ResearchReader HTML
- ResearchReader Portable HTTP Reader
- Laxinwen Portable HTTP Reader

文章正文优先读取 `[data-copy-role="original"]`，并尽量保留标题、作者、副标题和正文，同时排除导航、工具按钮、footer、脚本和图片按钮。

### 2. Research Task

左侧 Research Task 决定“做什么”，当前正式提供 9 项：

1. 财经精译：专业、忠实地转换财经材料。
2. 财经文章速读：提炼信息增量、关键数字和研究价值。
3. 投资逻辑分析：重建投资逻辑、因果链和待验证假设。
4. 基金经理视角：分析盈利、预期、估值和上下行变量。
5. 投资逻辑质疑：检查漏洞、隐藏假设和替代解释。
6. 公司 / 行业研究：建立研究对象、框架和研究缺口。
7. 事实与数据核查：核验重要事实、数字、口径和证据等级。
8. 财务 / 盈利 / 估值分析：分析盈利驱动、情景和估值隐含预期。
9. 研究跟进 / 下一步行动：形成可执行的 P0/P1/P2 研究计划。

前 9 项是受保护的系统任务，拥有稳定 ID、完整任务 Prompt 和默认 GPT Processor 关系；用户还可以通过“＋新增研究任务”持续建立自己的任务。自定义任务可以保存、编辑、删除，并为每项任务选择独立的默认 Processor。系统任务不会被自定义任务覆盖。

### 3. GPT Processor

右侧 GPT Processor 决定“谁来做”。Research Task 与 GPT Processor 是两个独立维度；默认联动只是推荐，用户可以手动选择其他 GPT，也可以把当前 GPT 设为某项任务的默认处理器。

支持：

- 预置 GPT；
- 新增、编辑、删除自定义 GPT；
- 修改 GPT URL；
- 严格校验 `https://chatgpt.com/g/...`；
- 使用 `chrome.storage.local` 持久化；
- 通过 `gptPresetsInitialized` 避免更新覆盖用户配置；
- 删除 GPT 时自动修复相关任务的默认 Processor 引用。

### 4. 自定义 Research Task

- 自定义任务保存在 `chrome.storage.local`，扩展重载、浏览器重启和更新不会覆盖。
- 自定义任务与 GPT Processor 解耦，可以分别选择和修改默认 Processor。
- 系统预置任务只读且不可删除；自定义任务可编辑、删除。

### 5. Article Provider 数据结构

统一文章结构：

```text
{
    source,
    title,
    author,
    subtitle,
    text,
    url,
    articleId
}
```

### 6. ChatGPT 自动提交

插件等待输入框，填入 Prompt，等待 Send button 可用后执行 `button.click()`。当前版本只自动提交 Prompt，不自动读取 ChatGPT 回复。

## 工作流

1. 在网页中选择文字，或在支持的 Reader 页面使用全文入口。
2. 右键选择“WSJ 金融精译”。
3. 在左侧选择 Research Task。
4. 右侧自动推荐默认 GPT，用户可以手动更换。
5. 插件生成任务 Prompt，打开对应 ChatGPT GPT。
6. 等待输入框和 Send button 可用后自动提交。

## ResearchReader Portable HTTP Reader

ResearchReader Portable Reader 可以导出为独立 Portable 目录，典型结构如下：

```text
Portable/
├── index.html
├── images/
├── Open-Reader.bat
└── Open-Reader.ps1
```

Portable Reader 通过本地 HTTP server 打开：

`http://127.0.0.1:<port>/index.html`

启动程序会在 `18080–18099` 范围内寻找可用端口。它不依赖 ResearchReader 本体、Python 或第三方 Python package；另一台 Windows 电脑只需要系统 PowerShell 即可启动。

## 浏览器权限

当前支持的网页范围为：

- `http://127.0.0.1/*`
- `http://localhost/*`

ChatGPT 页面为：

- `https://chatgpt.com/*`
- `https://*.chatgpt.com/*`

插件不使用 `<all_urls>`，也不声称支持所有网站。

## 兼容性与测试状态

以下状态已经确认：

- V1.1.4 ChatGPT 自动提交：已在 Opera 中实际验证成功。
- 手动选择文字链路：已实现并保留。
- ResearchReader 全文链路：已实现并测试。
- Laxinwen 全文链路：代码已实现，未将其表述为最终 Opera 端到端实测成功。
- ResearchReader Portable HTTP Reader：已验证。

PRA V1.3 仍在开发中；9 项 Research Task 与 Processor 默认联动已加入代码，完整 Opera 端到端覆盖仍需继续验证。

## 安装 / 更新

在 Opera 打开 `opera://extensions`，开启开发者模式，选择“加载已解压的扩展程序”，选择本目录。更新文件后点击扩展的“重新加载”。

## 版本历史

### PRA V1.3 development

- 增加 9 项 Research Task 配置。
- 增加 Task 与 GPT Processor 的默认联动和持久化。
- 支持将已选全文可靠识别为 Article Provider 输入。
- 保持 V1.1.4 ChatGPT 自动提交机制不变。

## 版本管理

历史备份目录不会提交到 Git。不要将 API Key、Token、密码或其他个人敏感配置写入仓库。
