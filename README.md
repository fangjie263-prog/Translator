# WSJ-AI-Translator

Version: 1.1.4  
Status: Tested successfully in Opera

个人使用的 Chromium / Opera 浏览器扩展。

## 当前功能

1. 在网页中选中文字。
2. 右键选择“WSJ 金融精译”。
3. 在插件窗口显示原文。
4. 根据翻译模式生成 Prompt。
5. 自动复制 Prompt。
6. 自动打开用户配置的 ChatGPT GPT。
7. 自动填入 Prompt。
8. 等待 ChatGPT Send button 进入可用状态。
9. 自动执行 `button.click()`。
10. ChatGPT 成功提交 Prompt。

当前版本只自动提交 Prompt，不自动读取 ChatGPT 回复。

如果自动提交失败，可以手动点击 ChatGPT 右下角发送按钮。获得译文后，可将其粘贴回插件窗口。

## 工作流

1. 在网页中选中英文财经材料。
2. 右键选择“WSJ 金融精译”。
3. 在插件窗口选择翻译模式并检查 Prompt。
4. 点击“复制 Prompt 并打开 GPT”。
5. 插件打开配置的 GPT，填入 Prompt，并等待发送按钮可用后自动提交。

## 安装 / 更新

在 Opera 打开 `opera://extensions`，开启开发者模式，选择“加载已解压的扩展程序”，选择本目录。更新文件后点击扩展的“重新加载”。

## 版本管理

历史备份目录不会提交到 Git。不要将 API Key、Token、密码或其他个人敏感配置写入仓库。

## 安装 / 更新

在 Opera 打开 `opera://extensions`，开启开发者模式，选择“加载已解压的扩展程序”，选择本目录。更新文件后点击扩展的“重新加载”。
