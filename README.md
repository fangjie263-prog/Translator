# WSJ 金融精译

当前版本：

V1.1.5

个人使用的 Chromium / Opera 浏览器扩展，用于将英文财经材料交给用户配置的 ChatGPT GPT 翻译。

## 已实现

### 1. 手动选择文字翻译

在支持的文章页面中选择英文，右键选择“WSJ 金融精译”，即可启动 ChatGPT 翻译流程。

### 2. 全文翻译

支持 ResearchReader / Laxinwen 当前文章。点击文章自己的“复制全文”后，不需要重新拖选文字，直接右键选择“WSJ 金融精译”即可。插件通过 Article Provider 获取当前文章全文。

### 3. Article Provider

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

当前支持 ResearchReader 和 Laxinwen。

### 4. 两种输入模式

- 手动选择：`sourceType = "selection"`
- 全文：`sourceType = "article"`

两种模式最终统一进入 `sourceText` 翻译流程。

### 5. ChatGPT 自动提交

插件等待输入框，填入 Prompt，等待 Send button 可用后执行 `button.click()`。当前版本只自动提交 Prompt，不自动读取 ChatGPT 回复。

## 工作流

1. 在支持的页面中选择英文，或先点击 ResearchReader / Laxinwen 的“复制全文”。
2. 右键选择“WSJ 金融精译”。
3. 插件生成并填入 Prompt，打开用户配置的 ChatGPT GPT。
4. 等待输入框和 Send button 可用后自动提交。

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

## 测试状态

以下状态已经确认：

- 手动选择文字翻译：成功
- ResearchReader 全文翻译：成功
- Laxinwen 全文翻译链路：代码已实现；未将其表述为最终 Opera 端到端实测成功
- ChatGPT 自动提交：成功
- ResearchReader Portable HTTP Reader：成功
- Portable HTTP 资源 200/404：已验证
- ResearchReader 测试：108 passed

## 安装 / 更新

在 Opera 打开 `opera://extensions`，开启开发者模式，选择“加载已解压的扩展程序”，选择本目录。更新文件后点击扩展的“重新加载”。

## 版本历史

### V1.1.5

- 支持 ResearchReader / Laxinwen Article Provider
- 支持复制全文后直接调用 WSJ 金融精译
- 支持全文 `sourceText` 统一进入翻译流程
- 修复 Context Menu 全文模式 `tab.id` 获取问题
- 保持原有 ChatGPT 自动提交机制
- 支持 ResearchReader Portable HTTP Reader

## 版本管理

历史备份目录不会提交到 Git。不要将 API Key、Token、密码或其他个人敏感配置写入仓库。
