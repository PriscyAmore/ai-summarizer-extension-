# AI Page Summarizer — Chrome Extension

A Manifest V3 Chrome Extension that extracts content from any webpage and generates a structured AI summary using Google Gemini.

## Features

- Bullet-point summary of the current page
- Key insights extracted by AI
- Estimated reading time and word count
- Topic label for quick context
- In-page highlight of key insight terms
- Summary caching per URL (30-minute TTL)
- Copy summary to clipboard
- 3-bullet mode for ultra-brief summaries
- Dark / Light theme
- Secure API key storage — never exposed to pages

## Architecture
ai-summarizer-extension/
├── manifest.json
├── background.js
├── content.js
├── popup.html
├── popup.css
├── popup.js
└── icons/
├── icon16.png
├── icon48.png
└── icon128.png

### Message Flow

popup.js
│  EXTRACT_CONTENT ──────────────────▶ content.js
│  ◀─────────────────── { content }
│
│  SUMMARIZE ─────────────────────────▶ background.js
│                                            │  callGeminiAPI()
│                                            │  chrome.storage (cache)
│  ◀───────────────── { summary }  ──────────┘
│
│  HIGHLIGHT_INSIGHTS ───────────────▶ content.js

No API keys pass through popup.js or content.js. The key is stored exclusively in background.js via chrome.storage.sync.

## AI Integration

- Provider: Google Gemini (gemini-1.5-flash)
- Endpoint: https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent
- Full mode: 5-bullet summary + 3 key insights
- Brief mode: 3-point summary
- Content truncated to 12,000 chars to stay within token limits

## Security Decisions

| Concern | Decision |
|---|---|
| API key exposure | Stored only in chrome.storage.sync inside background.js |
| XSS in popup | All AI output rendered via textContent, never innerHTML |
| XSS in highlight | Keywords injected via mark.textContent, never innerHTML |
| Message validation | All messages checked for expected type field |
| Permissions | Only activeTab, scripting, storage |

## Trade-offs

- Gemini Flash used for speed and cost; Gemini Pro would give richer summaries
- Heuristic content extraction used instead of Mozilla Readability (no bundler needed)
- Manifest V3 service workers terminate when idle; state recovered from chrome.storage
- 30-minute cache TTL balances freshness vs API cost

## Setup Instructions

### 1. Get a Gemini API Key

1. Go to https://aistudio.google.com/app/apikey
2. Click Create API Key
3. Copy the key (starts with AIza...)

### 2. Install the Extension Locally

This extension is not published on the Chrome Web Store. Install as unpacked.

1. Download or clone this repository
2. Open Chrome and go to chrome://extensions
3. Enable Developer mode (top-right toggle)
4. Click Load unpacked
5. Select the ai-summarizer-extension folder
6. Pin the extension icon in your toolbar

### 3. Add Your API Key

1. Click the extension icon
2. Click the gear icon (top right)
3. Paste your Gemini API key
4. Click Save Settings

### 4. Use the Extension

1. Go to any article or webpage
2. Click the extension icon
3. Click Summarize Page
4. View summary, copy it, or click Highlight to mark key terms on the page

## Supported Pages

Works best on news articles, blog posts, documentation, and Wikipedia.
Limited results on login-protected pages or JavaScript-heavy SPAs.
