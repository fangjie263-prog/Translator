(function () {
    "use strict";

    if (window.__wsjArticleContextLoaded) return;
    window.__wsjArticleContextLoaded = true;

    const textOf = (element) => {
        const text = element?.innerText || element?.textContent || "";
        return text.replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    };

    const providers = [
        {
            source: "researchreader",
            current: [".article.copy-selected[data-article-index]"],
            containers: [".article[data-article-index]", "article[data-article-index]"],
        },
        {
            source: "laxinwen",
            current: [
                "section.article.copy-selected:not([data-article-index])",
                ".reader.copy-selected",
                ".page.copy-selected"
            ],
            containers: [
                "section.article:not([data-article-index])",
                ".reader",
                ".page",
                "article:not([data-article-index])"
            ],
        },
    ];

    const findByHash = (provider) => {
        const rawHash = window.location.hash.replace(/^#/, "");
        if (!rawHash) return null;
        let hash;
        try { hash = decodeURIComponent(rawHash); } catch (_) { hash = rawHash; }
        const element = document.getElementById(hash);
        return element && provider.containers.some((selector) => element.matches(selector))
            ? element : null;
    };

    const cleanCopy = (element) => {
        const copy = element.cloneNode(true);
        copy.querySelectorAll(
            ".article-tools, button, nav, .back-link, .article-links, footer, " +
            ".debug, [data-debug], script, style, img"
        ).forEach((node) => node.remove());
        return textOf(copy);
    };

    const firstText = (element, selectors) => {
        for (const selector of selectors) {
            const value = textOf(element.querySelector(selector));
            if (value) return value;
        }
        return "";
    };

    const toArticle = (provider, element) => {
        if (!element) return null;
        const title = firstText(element, [".article-title", ".page-title", "h1", "h2"]);
        const author = firstText(element, [".byline", ".article-author", ".author"]);
        const subtitle = firstText(element, [".subtitle", ".dek", ".subhead", ".article-subtitle"]);
        const original = element.querySelector('[data-copy-role="original"]');
        const body = original ? cleanCopy(original) : cleanCopy(element);
        const text = original
            ? [title, author, subtitle, body].filter(Boolean).join("\n\n")
            : body;
        if (!text.trim()) return null;
        return {
            source: provider.source,
            title,
            author,
            subtitle,
            text,
            url: window.location.href,
            articleId: element.id || "",
        };
    };

    const getCurrentArticle = () => {
        console.log("[WSJ] getCurrentArticle started", {
            url: window.location.href,
            articleCount: document.querySelectorAll(".article").length,
            copySelected: Boolean(document.querySelector(".article.copy-selected"))
        });
        for (const provider of providers) {
            for (const selector of provider.current) {
                const article = toArticle(provider, document.querySelector(selector));
                if (article) {
                    console.log("[WSJ] ResearchReader provider matched", {
                        provider: provider.source,
                        articleId: article.articleId,
                        title: article.title,
                        textLength: article.text.length
                    });
                    return article;
                }
            }
            const byHash = toArticle(provider, findByHash(provider));
            if (byHash) {
                console.log("[WSJ] provider matched by hash", {
                    provider: provider.source,
                    articleId: byHash.articleId,
                    title: byHash.title,
                    textLength: byHash.text.length
                });
                return byHash;
            }
        }
        console.warn("[WSJ] Article Provider returned null", {
            url: window.location.href,
            articleCount: document.querySelectorAll(".article").length,
            copySelected: Boolean(document.querySelector(".article.copy-selected"))
        });
        return null;
    };

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message.type !== "getArticleContext") return;
        console.log("[WSJ] getArticleContext received");
        const article = getCurrentArticle();
        const response = {
            ...(article || {}),
            articleText: article?.text || null,
            selectionText: window.getSelection()?.toString() || "",
        };
        console.log("[WSJ] getArticleContext response", {
            source: response.source || null,
            title: response.title || null,
            articleId: response.articleId || null,
            textLength: (response.text || response.articleText || "").length
        });
        sendResponse(response);
    });
}());
