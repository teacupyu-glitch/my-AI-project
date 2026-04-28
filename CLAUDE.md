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

2. **Translator** — Uses **batch processing**: `TextProcessor.segmentTextNodes()` groups nodes into XML batches (`<translate><t id="N">text</t></translate>`), each batch is one API call via `translateBatchXML()`. Concurrency is controlled at the batch level (default 3). After each batch, `mergeTranslations()` parses the XML response and sets `nodeInfo.translated = true` / `nodeInfo.translatedText`.

3. **UIInjector** — Injects a floating control bar with undo/toggle/edit/close buttons. Manages `originalNodes` Map (keyed by Text node reference) and `editSpans` Map for inline edit mode. Before translation, `saveOriginalNodes()` stores `{ originalText, translatedText: null }`. After translation, `applyTranslations()` sets `node.textContent` AND syncs `translatedText` back into the Map. Edit mode wraps TextNodes in contenteditable spans and unwraps on exit.

**Critical**: DOM `Text` nodes do NOT have `dataset` or `style` properties. Only `HTMLElement` does. Never set `node.dataset` or `node.style` on a Text node — use `node.textContent` only.

### Configuration

Stored in `chrome.storage.local` under key `config`:
```javascript
{
  apiConfig: { apiKey, model, endpoint },
  translationSettings: { sourceLang, targetLang, maxChunkSize, concurrency, temperature },
  excludedSites: [],
  glossary: [{ source: "原文", target: "译文" }]
}
```

### DeepSeek API

- Endpoint: `https://api.deepseek.com/chat/completions`
- Auth: `Bearer {apiKey}` header
- Client: `src/lib/deepseek-client.js`
- Default model: `deepseek-v4-flash` (also supports `deepseek-v4-pro`). Old `deepseek-chat`/`deepseek-coder` removed July 2026.
- `getSystemPrompt(sourceLang, targetLang, glossary)` — when glossary is non-empty, appends a numbered rules section with term mapping: `"source" → "target"`

### Glossary (专有名词翻译)

- `config.glossary` is an array of `{ source, target }` objects, managed in the options page
- On translation start, `content/index.js` reads `config.glossary` and calls `translator.setGlossary()`
- `translateBatch()` passes `{ glossary }` to `apiClient.translateBatchXML()`, which injects it into the batch system prompt
- Empty glossary = no prompt change, no behavioral difference

### Inline Edit Mode (译文内联编辑)

- Control bar has an "编辑" button that toggles edit mode
- `UIInjector.enterEditMode()` — wraps each translated TextNode in `<span class="ds-trans-editable" contenteditable="true">`, stores mapping in `this.editSpans` (span → original TextNode)
- `UIInjector.exitEditMode(save)` — replaces spans back to TextNodes, updates `originalNodes` Map with edited text
- Undo/toggle auto-exit edit mode (`exitEditMode(false)`) to prevent DOM state conflicts
- Editable spans use `ds-trans-*` CSS class prefix with hover/focus blue highlight

### Translation Result Validation

`TextProcessor.cleanTranslation(text)` preprocesses batch API responses:
1. Strip markdown code blocks
2. Extract `<translate>...</translate>` wrapper content
3. `TextProcessor.mergeTranslations(chunks)` parses `<t id="N">...</t>` XML tags with regex `<t\s+id="(\d+)">([\s\S]*?)<\/t>`, maps each item back to `chunk.items[idx]`
4. Items where `<t>` tag is not matched → marked as failed (no retry at individual item level)
5. If the entire response has no valid XML, the batch retries (up to 3 times at batch level in `translateBatch()`)

### Popup — Content Script Recovery

`popup/index.js` `sendTranslationMessage(tab)` — when `tabs.sendMessage` fails with "Receiving end does not exist", automatically injects `content.js` via `chrome.scripting.executeScript()` then retries once.

### DOM Extraction Filters

`DOMExtractor.shouldAcceptNode()` applies two-stage filtering:
1. `text.trim()` — reject pure whitespace nodes
2. `/[\p{L}\p{N}]/u` — reject nodes with no letter/number (pure symbols, zero-width characters)

## Background Service Worker

`src/background/index.js` is minimal — it does NOT proxy translation requests. It handles:
- Setting default config on install
- `getConfig` / `saveConfig` / `validateAPIKey` via `runtime.onMessage`
- Broadcasting config changes to content scripts via `storage.onChanged`

All translation happens directly in the content script.

## Dead Code

- `src/lib/storage.js` — unused; `BrowserCompat.getStorage()` in utils.js is used instead

## Key Constraints

- All content script CSS uses `ds-trans-*` class prefix
- Control bar `z-index: 2147483647`
- Text node operations: use `textContent` only (no `dataset`, no `style`)
- API keys in `chrome.storage.local`, never hardcoded
- `startTranslation()` applies translations even on partial failure (`result.stats.success > 0`, not `result.success`)
- `toggleTranslation()` toggles `this.showingTranslation` directly — never derive state from button text
- Undo/toggle/close callbacks are registered via `UIInjector.set*Callback()` methods, not hardcoded
