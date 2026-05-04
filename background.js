// background.js — Service Worker
const CACHE_EXPIRY_MS = 30 * 60 * 1000;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SUMMARIZE") {
    handleSummarize(message.payload)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.type === "GET_SETTINGS") {
    getSettings()
      .then((settings) => sendResponse({ success: true, data: settings }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.type === "SAVE_SETTINGS") {
    saveSettings(message.payload)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.type === "CLEAR_CACHE") {
    clearCache()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function handleSummarize({ url, content, title, mode }) {
  const cached = await getCachedSummary(url, mode);
  if (cached) return { ...cached, fromCache: true };
  const settings = await getSettings();
  if (!settings.apiKey || settings.apiKey.trim() === "") {
    throw new Error("NO_API_KEY");
  }
  const summary = await callGroqAPI(settings.apiKey, content, title, mode);
  await cacheSummary(url, mode, summary);
  return { ...summary, fromCache: false };
}

async function callGroqAPI(apiKey, content, title, mode) {
  const truncatedContent = content.slice(0, 12000);
  const prompts = {
    full: `You are a precise content summarizer. Analyze the following webpage content and respond with ONLY a valid JSON object — no markdown, no explanation, no code fences.\n\nPage Title: ${title}\nContent: ${truncatedContent}\n\nReturn this exact JSON shape:\n{\n  "summary": ["bullet point 1", "bullet point 2", "bullet point 3", "bullet point 4", "bullet point 5"],\n  "keyInsights": ["insight 1", "insight 2", "insight 3"],\n  "readingTime": "X min read",\n  "wordCount": 1234,\n  "topic": "brief topic label"\n}`,
    brief: `You are a concise summarizer. Summarize this webpage in exactly 3 bullet points. Respond with ONLY a valid JSON object — no markdown, no explanation, no code fences.\n\nPage Title: ${title}\nContent: ${truncatedContent.slice(0, 6000)}\n\nReturn this exact JSON shape:\n{\n  "summary": ["key point 1", "key point 2", "key point 3"],\n  "keyInsights": ["main takeaway"],\n  "readingTime": "X min read",\n  "wordCount": 1234,\n  "topic": "brief topic label"\n}`
  };
  const prompt = prompts[mode] || prompts.full;
  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "llama3-8b-8192",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 1024
      })
    }
  );
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const realError = errData?.error?.message || `HTTP ${response.status}`;
    throw new Error(realError);
  }
  const data = await response.json();
  const rawText = data?.choices?.[0]?.message?.content || "";
  const cleaned = rawText.replace(/```json|```/gi, "").trim();
  let parsed;
  try { parsed = JSON.parse(cleaned); } catch { throw new Error("PARSE_ERROR"); }
  if (!Array.isArray(parsed.summary) || parsed.summary.length === 0) throw new Error("INVALID_RESPONSE");
  return {
    summary: parsed.summary,
    keyInsights: parsed.keyInsights || [],
    readingTime: parsed.readingTime || "Unknown",
    wordCount: parsed.wordCount || 0,
    topic: parsed.topic || "General",
    generatedAt: Date.now()
  };
}

function makeCacheKey(url, mode) {
  try { const u = new URL(url); return `cache_${mode}_${u.origin}${u.pathname}`; }
  catch { return `cache_${mode}_${url}`; }
}

async function getCachedSummary(url, mode) {
  const key = makeCacheKey(url, mode);
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      const entry = result[key];
      if (!entry) return resolve(null);
      if (Date.now() - entry.generatedAt > CACHE_EXPIRY_MS) {
        chrome.storage.local.remove([key]);
        return resolve(null);
      }
      resolve(entry);
    });
  });
}

async function cacheSummary(url, mode, summary) {
  const key = makeCacheKey(url, mode);
  return new Promise((resolve) => { chrome.storage.local.set({ [key]: summary }, resolve); });
}

async function clearCache() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (items) => {
      const cacheKeys = Object.keys(items).filter((k) => k.startsWith("cache_"));
      chrome.storage.local.remove(cacheKeys, resolve);
    });
  });
}

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["apiKey", "theme", "defaultMode"], (result) => {
      resolve({
        apiKey: result.apiKey || "",
        theme: result.theme || "dark",
        defaultMode: result.defaultMode || "full"
      });
    });
  });
}

async function saveSettings(settings) {
  return new Promise((resolve) => { chrome.storage.sync.set(settings, resolve); });
}
