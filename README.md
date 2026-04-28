# AI翻译助手 - 浏览器扩展

基于 DeepSeek V4 大模型的浏览器整页翻译插件，支持 Chrome、Edge、Firefox 等主流浏览器。

## 功能特点

- **整页翻译** — 一键翻译整个网页，智能提取文本节点逐句翻译
- **DeepSeek V4 驱动** — 默认使用 deepseek-v4-flash，可选 deepseek-v4-pro 旗舰模型
- **专有名词翻译** — 自定义词汇对照表，指定专有名词的固定翻译
- **译文微调** — 翻译完成后可直接在页面上点击译文进行内联编辑
- **实时进度** — 显示翻译进度和状态，支持撤销、切换原文/译文
- **灵活配置** — 支持自定义语言、并发数、温度参数、排除网站等
- **美观界面** — 现代化UI设计，支持暗黑模式
- **自动恢复** — content script 未加载时自动注入，无需手动刷新

## 安装方法

### 1. 构建项目

```bash
npm install
npm run build
```

### 2. 加载扩展

#### Chrome / Edge
1. 打开 `chrome://extensions/`（Edge 用 `edge://extensions/`）
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `dist` 目录

#### Firefox
1. 打开 `about:debugging#/runtime/this-firefox`
2. 点击"临时载入附加组件"
3. 选择 `dist` 目录下的 `manifest.json`

## 使用方法

### 基础翻译
1. 点击插件图标，在设置中配置 DeepSeek API 密钥
2. 打开任意网页，点击插件图标
3. 点击"翻译当前页面"

### 专有名词翻译
1. 打开扩展设置页 → "专有名词翻译"
2. 添加原文和译文对照（如 `OpenAI` → `OpenAI`）
3. 翻译时模型将优先使用此对照表

### 微调译文
1. 翻译完成后，点击控制条的"编辑"按钮
2. 直接在页面上点击译文进行修改
3. 完成后点击"完成"保存

## 配置选项

| 分类 | 选项 | 说明 |
|------|------|------|
| API | API 密钥 | DeepSeek API 密钥（必需） |
| API | 模型 | deepseek-v4-flash（推荐）/ deepseek-v4-pro |
| 翻译 | 目标语言 | 支持中、英、日、韩、法、德、西、俄等 9 种语言 |
| 翻译 | 自动检测源语言 | 自动识别原文语言 |
| 高级 | 并发请求数 | 同时进行的翻译请求数（建议 2-5） |
| 高级 | 温度参数 | 控制翻译创造性（0.0-1.0，建议 0.2-0.4） |
| 排除 | 排除网站 | 每行一个域名，这些网站不启用翻译 |

## 技术栈

- **构建工具**: Vite
- **语言**: JavaScript (ES6+)
- **扩展标准**: Web Extension Manifest V3
- **API**: DeepSeek V4

## 项目结构

```
AI_trans/
├── manifest.json            # 扩展配置
├── src/
│   ├── popup/               # 弹出页面
│   ├── options/             # 设置页面（含 API、翻译、专有名词、排除网站）
│   ├── content/             # 内容脚本
│   │   ├── index.js         # 主入口，消息路由
│   │   ├── dom-extractor.js # DOM 文本提取
│   │   ├── translator.js    # 翻译器（批次调用 API + 结果校验）
│   │   ├── ui-injector.js   # UI 注入（控制条 + 编辑模式）
│   │   ├── style.css        # 控制条样式（ds-trans-* 前缀）
│   │   └── text-processor.js # 文本批处理器（分段 + XML 打包）
│   ├── background/          # 后台 Service Worker
│   └── lib/                 # 工具库
│       ├── deepseek-client.js # DeepSeek API 客户端
│       ├── utils.js          # 浏览器兼容 + 工具函数
│       └── storage.js        # 已废弃
├── dist/                    # 构建输出
└── package.json
```

## 开发

```bash
npm install        # 安装依赖
npm run build      # 构建生产版本 → dist/
```

构建分两步：Vite 先构建 popup/options/background（ESM），再用 `vite.content.config.js` 构建 content script（IIFE，自包含）。

构建后在 `chrome://extensions` 中点击扩展的刷新按钮即可重新加载。

## 注意事项

1. **API 密钥安全** — 密钥存储在浏览器本地 `chrome.storage.local` 中，不会上传到任何服务器
2. **请使用自己的 API Key** — 分享给朋友使用时，请让他们自行前往 [platform.deepseek.com](https://platform.deepseek.com) 注册获取自己的 API 密钥，不要共用
3. **API 费用** — 使用 DeepSeek API 会产生费用，V4 Flash 约 1 元/百万输入 tokens
4. **网络要求** — 需要能访问 `api.deepseek.com`
5. **页面限制** — `chrome://`、`about:` 等特殊页面不支持翻译
6. **模型迁移** — `deepseek-chat` 将于 2026 年 7 月停用，已全部迁移至 `deepseek-v4-flash`

## 许可证

MIT License
