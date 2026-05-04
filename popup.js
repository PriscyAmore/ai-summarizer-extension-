
(function () {
  "use strict";

  let currentMode = "full";
  let highlightsActive = false;
  let currentSummary = null;
  let currentTab = null;

  const $ = (id) => document.getElementById(id);

  const mainPanel       = $("main-panel");
  const settingsPanel   = $("settings-panel");
  const openSettingsBtn = $("open-settings-btn");
  const closeSettingsBtn= $("close-settings-btn");
  const pageTitle       = $("page-title");
  const modeBtns        = document.querySelectorAll(".mode-btn");
  const summarizeBtn    = $("summarize-btn");
  const loadingState    = $("loading-state");
  const errorState      = $("error-state");
  const errorMessage    = $("error-message");
  const errorActionBtn  = $("error-action-btn");
  const summaryOutput   = $("summary-output");
  const emptyState      = $("empty-state");
  const summaryList     = $("summary-list");
  const insightsList    = $("insights-list");
  const insightsSection = $("insights-section");
  const metaReadingTime = $("meta-reading-time");
  const metaWordCount   = $("meta-word-count");
  const metaTopic       = $("meta-topic");
  const cacheBadge      = $("cache-badge");
  const copyBtn         = $("copy-btn");
  const highlightBtn    = $("highlight-btn");
  const clearBtn        = $("clear-btn");
  const apiKeyInput     = $("api-key-input");
  const toggleKeyBtn    = $("toggle-key-btn");
  const saveSettingsBtn = $("save-settings-btn");
  const clearCacheBtn   = $("clear-cache-btn");
  const settingsStatus  = $("settings-status");

  async function init() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;
    if (tab?.title) { pageTitle.textContent = tab.title; pageTitle.title = tab.title; }
    sendToBackground({ type: "GET_SETTINGS" }, (res) => {
      if (res.success) {
        applyTheme(res.data.theme);
        setMode(res.data.defaultMode || "full");
        apiKeyInput.value = res.data.apiKey || "";
        document.querySelector(`input[name="theme"][value="${res.data.theme}"]`).checked = true;
        document.querySelector(`input[name="mode"][value="${res.data.defaultMode || "full"}"]`).checked = true;
      }
    });
    showState("empty");
  }

  function showState(state) {
    loadingState.classList.add("hidden");
    errorState.classList.add("hidden");
    summaryOutput.classList.add("hidden");
    emptyState.classList.add("hidden");
    switch (state) {
      case "loading": summarizeBtn.disabled = true; loadingState.classList.remove("hidden"); break;
      case "error": summarizeBtn.disabled = false; errorState.classList.remove("hidden"); break;
      case "summary": summarizeBtn.disabled = false; summaryOutput.classList.remove("hidden"); break;
      default: summarizeBtn.disabled = false; emptyState.classList.remove("hidden"); break;
    }
  }

  function setMode(mode) {
    currentMode = mode;
    modeBtns.forEach((btn) => {
      const isActive = btn.dataset.mode === mode;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", String(isActive));
    });
  }

  modeBtns.forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
    btn.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setMode(btn.dataset.mode); } });
  });

  summarizeBtn.addEventListener("click", handleSummarize);

  async function handleSummarize() {
    if (!currentTab?.id) return;
    showState("loading");
    highlightsActive = false;
    updateHighlightBtn();
    let extracted;
    try { extracted = await sendToTab(currentTab.id, { type: "EXTRACT_CONTENT" }); }
    catch (err) { showError("Could not read this page. Try reloading it and clicking Summarize again."); return; }
    if (!extracted?.success) { showError(extracted?.error || "Could not extract page content."); return; }
    const { content, title, url, wordCount } = extracted.data;
    if (!content || content.trim().length < 80) { showError("Not enough readable content found on this page."); return; }
    sendToBackground({ type: "SUMMARIZE", payload: { url, content, title, mode: currentMode } }, (res) => {
      if (!res.success) { handleApiError(res.error); return; }
      currentSummary = { ...res.data, wordCount };
      renderSummary(currentSummary);
      showState("summary");
    });
  }

  function renderSummary(data) {
    metaReadingTime.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${sanitize(data.readingTime || "—")}`;
    const wc = data.wordCount ? data.wordCount.toLocaleString() + " words" : "—";
    metaWordCount.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> ${sanitize(wc)}`;
    metaTopic.textContent = sanitize(data.topic || "General");
    cacheBadge.classList.toggle("hidden", !data.fromCache);
    summaryList.innerHTML = "";
    (data.summary || []).forEach((point, i) => {
      const li = document.createElement("li");
      li.textContent = sanitize(point);
      li.style.animationDelay = `${i * 40}ms`;
      summaryList.appendChild(li);
    });
    insightsList.innerHTML = "";
    const insights = data.keyInsights || [];
    if (insights.length > 0) {
      insightsSection.style.display = "";
      insights.forEach((insight, i) => {
        const li = document.createElement("li");
        li.textContent = sanitize(insight);
        li.style.animationDelay = `${(data.summary.length + i) * 40}ms`;
        insightsList.appendChild(li);
      });
    } else { insightsSection.style.display = "none"; }
  }

  function handleApiError(errorCode) {
    const messages = {
      NO_API_KEY: "No API key set. Click 'Open Settings' to add your Gemini API key.",
      INVALID_API_KEY: "Invalid API key. Please check your key in Settings.",
      RATE_LIMITED: "Rate limit reached. Please wait a moment and try again.",
      PARSE_ERROR: "Received an unexpected response from the AI. Try again.",
      INVALID_RESPONSE: "AI returned an unexpected format. Try again.",
    };
    const msg = messages[errorCode] || `Something went wrong: ${errorCode}`;
    showError(msg, errorCode === "NO_API_KEY" || errorCode === "INVALID_API_KEY");
  }

  function showError(msg, showSettingsBtn = false) {
    errorMessage.textContent = msg;
    errorActionBtn.style.display = showSettingsBtn ? "inline-flex" : "none";
    showState("error");
  }

  errorActionBtn.addEventListener("click", openSettings);

  copyBtn.addEventListener("click", async () => {
    if (!currentSummary) return;
    const lines = [
      `📄 ${currentTab?.title || "Page Summary"}`, "",
      "Summary:", ...(currentSummary.summary || []).map((b) => `• ${b}`), "",
      "Key Insights:", ...(currentSummary.keyInsights || []).map((i) => `→ ${i}`), "",
      `⏱ ${currentSummary.readingTime}  |  📝 ${(currentSummary.wordCount || 0).toLocaleString()} words`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      copyBtn.textContent = "Copied!";
      setTimeout(() => { copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy`; }, 1500);
    } catch { copyBtn.textContent = "Failed"; }
  });

  highlightBtn.addEventListener("click", async () => {
    if (!currentTab?.id || !currentSummary) return;
    if (highlightsActive) {
      await sendToTab(currentTab.id, { type: "CLEAR_HIGHLIGHTS" });
      highlightsActive = false;
    } else {
      await sendToTab(currentTab.id, { type: "HIGHLIGHT_INSIGHTS", payload: { insights: currentSummary.keyInsights || [] } });
      highlightsActive = true;
    }
    updateHighlightBtn();
  });

  function updateHighlightBtn() {
    highlightBtn.style.color = highlightsActive ? "var(--accent-hover)" : "";
    highlightBtn.title = highlightsActive ? "Remove highlights" : "Highlight key insights on page";
  }

  clearBtn.addEventListener("click", async () => {
    if (currentTab?.id && highlightsActive) { await sendToTab(currentTab.id, { type: "CLEAR_HIGHLIGHTS" }); highlightsActive = false; }
    currentSummary = null;
    showState("empty");
  });

  openSettingsBtn.addEventListener("click", openSettings);
  closeSettingsBtn.addEventListener("click", closeSettings);

  function openSettings() { mainPanel.classList.add("hidden"); settingsPanel.classList.remove("hidden"); apiKeyInput.focus(); }
  function closeSettings() { settingsPanel.classList.add("hidden"); mainPanel.classList.remove("hidden"); }

  toggleKeyBtn.addEventListener("click", () => {
    const isPassword = apiKeyInput.type === "password";
    apiKeyInput.type = isPassword ? "text" : "password";
    toggleKeyBtn.setAttribute("aria-label", isPassword ? "Hide API key" : "Show API key");
  });

  saveSettingsBtn.addEventListener("click", () => {
    const apiKey = apiKeyInput.value.trim();
    const theme = document.querySelector('input[name="theme"]:checked')?.value || "dark";
    const defaultMode = document.querySelector('input[name="mode"]:checked')?.value || "full";
    sendToBackground({ type: "SAVE_SETTINGS", payload: { apiKey, theme, defaultMode } }, (res) => {
      if (res.success) { applyTheme(theme); showSettingsStatus("Settings saved ✓"); }
      else { showSettingsStatus("Error saving settings."); }
    });
  });

  clearCacheBtn.addEventListener("click", () => {
    sendToBackground({ type: "CLEAR_CACHE" }, (res) => {
      showSettingsStatus(res.success ? "Cache cleared ✓" : "Error clearing cache.");
    });
  });

  function showSettingsStatus(msg) { settingsStatus.textContent = msg; setTimeout(() => { settingsStatus.textContent = ""; }, 2500); }

  function applyTheme(theme) { document.body.classList.toggle("light", theme === "light"); }

  function sendToBackground(message, callback) {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) { callback({ success: false, error: chrome.runtime.lastError.message }); return; }
      callback(response || { success: false, error: "No response" });
    });
  }

  function sendToTab(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
        resolve(response);
      });
    });
  }

  function sanitize(str) {
    if (typeof str !== "string") return String(str ?? "");
    return str.replace(/[<>]/g, (c) => ({ "<": "&lt;", ">": "&gt;" }[c]));
  }

  document.addEventListener("DOMContentLoaded", init);
  if (document.readyState !== "loading") init();
})();
