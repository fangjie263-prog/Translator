(function () {
    "use strict";

    if (window.__wsjArticleContextLoaded) return;
    window.__wsjArticleContextLoaded = true;

    const textOf = (element) => {
        const text = element?.innerText || element?.textContent || "";
        return text.replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    };

    const articleElement = () =>
        document.querySelector(".article") ||
        document.querySelector('[data-copy-role="original"]') ||
        document.querySelector("article") ||
        document.querySelector("main");

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message.type !== "getArticleContext") return;
        const article = articleElement();
        sendResponse({
            url: window.location.href,
            title: document.title,
            selectionText: window.getSelection()?.toString() || "",
            articleText: article ? textOf(article) : null,
        });
    });
}());
