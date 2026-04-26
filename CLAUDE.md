# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm install        # Install dependencies
npm run build      # Build for production → dist/
```

There is no dev server. After `npm run build`, reload the extension in the browser via `chrome://extensions` / `edge://extensions`.

`npm run build` runs TWO Vite builds sequentially:
1. `vite build` — builds popup, options, background (ESM format)
2. `vite build --config vite.content.config.js` — builds content script (IIFE format)

## Build Architecture (Critical)

Content scripts in Manifest V3 **cannot** be loaded as ES modules via `manifest.json` (the `type: module` field is not supported for `content_scripts`). Therefore:

- **`vite.config.js`**: builds `popup.js`, `options.js`, `background.js` (ESM, loaded via `<script type="module">` or service worker `type: module`)
- **`vite.content.config.js`**: builds `content.js` as **IIFE** (self-contained, `(function(){...})()`, no import/export). CSS is inlined into the JS and injected at runtime via `document.createElement('style')`.
- `manifest.json` must NOT reference a `css` field in `content_scripts` — CSS lives inside content.js.

## Architecture

### Message Passing (popup → content script)

The popup communicates with the content script via **`chrome.tabs.sendMessage(tabId, message)`**, NOT `runtime.sendMessage()`. Using `runtime.sendMessage()` causes the background service worker to intercept and respond with "未知操作" before the content script can reply.

### Content Script Modules

The content script (`src/content/index.js`) orchestrates these modules:

1. **DOMExtractor** — `TreeWalker` to extract `Text` nodes from the DOM. Returns an array of `{ node, text, originalText, translated, translatedText, id, path, ... }` objects.

2. **Translator** — Each text node is translated **individually** (one API call per node). Concurrency is controlled (default 3). There is NO batching, chunking, separators, or merge logic — each node maps 1:1 to one API call. The result is set directly on `nodeInfo.translated = true` / `nodeInfo.translatedText`.

3. **UIInjector** — Injects a floating control bar. Manages `originalNodes` Map (keyed by Text node reference). Before translation, `saveOriginalNodes()` stores `{ originalText, translatedText: null }`. After translation, `applyTranslations()` sets `node.textContent` AND syncs `translatedText` back into the Map (needed for undo/toggle).

**Critical**: DOM `Text` nodes do NOT have `dataset` or `style` properties. Only `HTMLElement` does. Never set `node.dataset` or `node.style` on a Text node — use `node.textContent` only.

### Configuration

Stored in `chrome.storage.local` under key `config`:
```javascript
{
  apiConfig: { apiKey, model, endpoint },
  translationSettings: { sourceLang, targetLang, maxChunkSize, concurrency, temperature },
  excludedSites: []
}
```

### DeepSeek API

- Endpoint: `https://api.deepseek.com/chat/completions`
- Auth: `Bearer {apiKey}` header
- Client: `src/lib/deepseek-client.js`
- The system prompt instructs the model to translate independently (no separators needed since each call handles one text segment)

## Key Constraints

- All content script CSS uses `ds-trans-*` class prefix
- Control bar `z-index: 2147483647`
- Text node operations: use `textContent` only (no `dataset`, no `style`)
- API keys in `chrome.storage.local`, never hardcoded
- `BrowserCompat` in `src/lib/utils.js` handles Chrome/Firefox API differences
