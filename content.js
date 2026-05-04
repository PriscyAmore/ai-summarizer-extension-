(function () {
  "use strict";

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "EXTRACT_CONTENT") {
      try { const extracted = extractPageContent(); sendResponse({ success: true, data: extracted }); }
      catch (err) { sendResponse({ success: false, error: err.message }); }
      return true;
    }
    if (message.type === "HIGHLIGHT_INSIGHTS") {
      try { highlightInsights(message.payload.insights); sendResponse({ success: true }); }
      catch (err) { sendResponse({ success: false, error: err.message }); }
      return true;
    }
    if (message.type === "CLEAR_HIGHLIGHTS") {
      clearHighlights(); sendResponse({ success: true }); return true;
    }
  });

  function extractPageContent() {
    const title = document.title || "";
    const url = window.location.href;
    const content = extractMainContent();
    const wordCount = countWords(content);
    return { title, url, content, wordCount };
  }

  function extractMainContent() {
    const prioritySelectors = ["article", '[role="main"]', "main", ".post-content", ".article-content", ".entry-content", ".content-body", ".story-body", ".article-body", "#article-body", ".post-body", ".blog-post", ".page-content"];
    for (const selector of prioritySelectors) {
      const el = document.querySelector(selector);
      if (el) { const text = cleanText(el); if (text.length > 300) return text; }
    }
    const candidates = scoreCandidates();
    if (candidates.length > 0) return cleanText(candidates[0].el);
    return cleanBodyText();
  }

  function scoreCandidates() {
    const noiseSelectors = new Set(["nav","header","footer","aside",".nav",".navbar",".header",".footer",".sidebar",".advertisement",".ad",".cookie-banner",".popup",".modal",".breadcrumb",".pagination",".comments",".social-share",".related-posts","script","style","noscript","iframe"]);
    const blocks = document.querySelectorAll("div, section, p");
    const scored = [];
    blocks.forEach((el) => {
      if ([...noiseSelectors].some((s) => el.matches(s))) return;
      if (isInsideNoise(el, noiseSelectors)) return;
      const text = el.innerText || "";
      const wordCount = countWords(text);
      if (wordCount < 100) return;
      const paragraphs = el.querySelectorAll("p");
      const paragraphText = [...paragraphs].map((p) => p.innerText || "").join(" ");
      const paragraphRatio = paragraphs.length > 0 ? paragraphText.length / Math.max(text.length, 1) : 0;
      const links = el.querySelectorAll("a");
      const linkText = [...links].map((a) => a.innerText || "").join(" ");
      const linkRatio = linkText.length / Math.max(text.length, 1);
      const score = wordCount * (1 + paragraphRatio) * (1 - linkRatio * 0.5);
      scored.push({ el, score });
    });
    return scored.sort((a, b) => b.score - a.score);
  }

  function isInsideNoise(el, noiseSelectors) {
    let parent = el.parentElement;
    while (parent) {
      if ([...noiseSelectors].some((s) => { try { return parent.matches(s); } catch { return false; } })) return true;
      parent = parent.parentElement;
    }
    return false;
  }

  function cleanText(el) {
    const clone = el.cloneNode(true);
    ["nav","header","footer","aside","script","style","noscript","iframe",".advertisement",".ad",".sidebar",".comments",".social-share"].forEach((s) => {
      try { clone.querySelectorAll(s).forEach((n) => n.remove()); } catch {}
    });
    const raw = clone.innerText || clone.textContent || "";
    return raw.replace(/\s{3,}/g, "\n\n").replace(/\t/g, " ").trim();
  }

  function cleanBodyText() {
    const body = document.body.cloneNode(true);
    ["nav","header","footer","aside","script","style","noscript","iframe",".ad",".advertisement"].forEach((s) => {
      try { body.querySelectorAll(s).forEach((n) => n.remove()); } catch {}
    });
    return (body.innerText || body.textContent || "").replace(/\s{3,}/g, "\n\n").trim();
  }

  function countWords(text) { return text.trim().split(/\s+/).filter(Boolean).length; }

  const HIGHLIGHT_CLASS = "ai-summarizer-highlight";
  const HIGHLIGHT_STYLE_ID = "ai-summarizer-styles";

  function highlightInsights(insights) {
    if (!insights || insights.length === 0) return;
    if (!document.getElementById(HIGHLIGHT_STYLE_ID)) {
      const style = document.createElement("style");
      style.id = HIGHLIGHT_STYLE_ID;
      style.textContent = `.${HIGHLIGHT_CLASS}{background:linear-gradient(120deg,rgba(99,102,241,0.25)0%,rgba(139,92,246,0.25)100%);border-radius:3px;padding:1px 2px;box-shadow:0 0 0 1px rgba(99,102,241,0.4);}.${HIGHLIGHT_CLASS}:hover{background:linear-gradient(120deg,rgba(99,102,241,0.45)0%,rgba(139,92,246,0.45)100%);}`;
      document.head.appendChild(style);
    }
    const stopWords = new Set(["the","and","for","that","this","with","from","are","was","were","has","have","had","been","its","their","they","which","more","also","can","but","not","all","one","you","your"]);
    const keywords = insights.flatMap((insight) => insight.toLowerCase().replace(/[^a-z\s]/g,"").split(/\s+/).filter((w) => w.length > 3 && !stopWords.has(w)));
    if (keywords.length === 0) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName.toLowerCase();
        if (["script","style","noscript"].includes(tag)) return NodeFilter.FILTER_REJECT;
        if (parent.classList.contains(HIGHLIGHT_CLASS)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);
    textNodes.slice(0, 200).forEach((textNode) => {
      const text = textNode.textContent;
      const lowerText = text.toLowerCase();
      const matchedKeyword = keywords.find((kw) => lowerText.includes(kw));
      if (!matchedKeyword) return;
      const regex = new RegExp(`(${escapeRegex(matchedKeyword)})`, "gi");
      if (!regex.test(text)) return;
      const fragment = document.createDocumentFragment();
      const parts = text.split(new RegExp(`(${escapeRegex(matchedKeyword)})`, "gi"));
      parts.forEach((part) => {
        if (part.toLowerCase() === matchedKeyword.toLowerCase()) {
          const mark = document.createElement("mark");
          mark.className = HIGHLIGHT_CLASS;
          mark.textContent = part;
          fragment.appendChild(mark);
        } else { fragment.appendChild(document.createTextNode(part)); }
      });
      try { textNode.parentNode.replaceChild(fragment, textNode); } catch {}
    });
  }

  function clearHighlights() {
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => { el.replaceWith(document.createTextNode(el.textContent)); });
    const style = document.getElementById(HIGHLIGHT_STYLE_ID);
    if (style) style.remove();
  }

  function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
})();
