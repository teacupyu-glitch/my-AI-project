# AI 翻译助手 — 开发技能

## 今日成就 (2026-04-27)

### Bug 修复
1. **翻译结果残留提示词** — 简化系统提示词，去掉"请翻译以下文本"前缀；cleanResult 增加三层校验防线
2. **"Receiving end does not exist" 连接错误** — popup 自动注入 content script 并重试
3. **切换原文/译文首次点击无响应** — toggleTranslation 直接从状态翻转，不再从按钮文字推断

### 新增功能
4. **专有名词自定义翻译（Glossary）** — 设置页增删对照表，系统提示词注入规则，模型优先遵守
5. **译文内联编辑** — 控制条"编辑"按钮，TextNode 替换为 contenteditable span，所见即所得修改
6. **模型升级** — 从 deepseek-chat 迁移到 deepseek-v4-flash（默认），可选 deepseek-v4-pro

### 质量提升
7. **DOM 提取过滤** — 增加 `\p{L}\p{N}` 检查，过滤纯符号/零宽字符的无效文本节点
8. **部分成功应用翻译** — 不再因个别节点失败而丢弃所有翻译结果
9. **CLAUDE.md + README 重写** — 完整反映当前架构

---

## 命令速查

```bash
npm run build    # 构建 → dist/
```

构建后到 `edge://extensions` 点击刷新。

## 架构速览

```
popup → tabs.sendMessage → content script (index.js)
                                ├── DOMExtractor (TreeWalker 提取 Text 节点)
                                ├── Translator (逐节点 API 调用 + cleanResult 校验)
                                ├── UIInjector (控制条 + 编辑模式)
                                └── deepseek-client (DeepSeek V4 API)
```

## 核心约束

- Content Script 用 **IIFE** 构建（Manifest V3 不支持 ESM content_scripts）
- CSS 全部内联在 content.js 中，前缀 `ds-trans-*`
- Text 节点只能用 `textContent`，不能 `dataset`/`style`
- popup → content script 用 `chrome.tabs.sendMessage`，**不是** `runtime.sendMessage`
- 配置存 `chrome.storage.local` 键 `config`
- API 密钥绝不硬编码

## 配置文件

| 文件 | 作用 |
|------|------|
| `src/content/index.js` | 主入口，消息路由，翻译流程协调 |
| `src/content/translator.js` | 逐节点翻译 + cleanResult 清洗 + glossary 传递 |
| `src/content/ui-injector.js` | 控制条（撤销/切换/编辑/关闭）+ 编辑模式 |
| `src/content/dom-extractor.js` | TreeWalker 提取 + 两阶段过滤 |
| `src/lib/deepseek-client.js` | API 客户端 + 系统提示词构造 |
| `src/popup/index.js` | 弹出窗口 + content script 自动注入 |
| `src/options/index.js` | 设置页（API/翻译/高级/排除/Glossary） |
| `src/background/index.js` | Service Worker（默认配置 + 配置广播） |

## 配置 Schema

```javascript
{
  apiConfig: { apiKey, model: 'deepseek-v4-flash', endpoint },
  translationSettings: { sourceLang, targetLang, maxChunkSize, concurrency, temperature },
  excludedSites: [],
  glossary: [{ source: "原文", target: "译文" }]
}
```
