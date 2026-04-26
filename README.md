# AI翻译助手 - 浏览器扩展

基于DeepSeek大模型的浏览器整页翻译插件，支持Chrome、Firefox、Edge等主流浏览器。

## 功能特点

- 🌐 **整页翻译** - 一键翻译整个网页
- 🤖 **AI驱动** - 使用DeepSeek大模型提供高质量翻译
- 🎯 **智能分段** - 自动处理大段文本，保持上下文连贯
- 🔄 **实时进度** - 显示翻译进度和状态
- ⚙️ **灵活配置** - 支持自定义语言、分块大小等参数
- 🎨 **美观界面** - 现代化UI设计，支持暗黑模式
- 📱 **移动端支持** - 响应式设计，适配移动浏览器

## 安装方法

### 1. 获取图标

在 `icons` 目录下添加以下图标文件：
- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

你可以使用 `icons/create-icons.html` 快速生成临时图标。

### 2. 构建项目

```bash
npm install
npm run build
```

### 3. 加载扩展

#### Chrome/Edge
1. 打开 `chrome://extensions/`
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `dist` 目录

#### Firefox
1. 打开 `about:debugging#/runtime/this-firefox`
2. 点击"此Firefox"
3. 点击"临时载入附加组件"
4. 选择 `dist` 目录下的 `manifest.json`

## 使用方法

1. **配置API密钥**
   - 点击插件图标，选择"设置"
   - 在DeepSeek平台获取API密钥：https://platform.deepseek.com/api_keys
   - 输入API密钥并保存

2. **翻译页面**
   - 打开任意网页
   - 点击插件图标
   - 点击"翻译当前页面"按钮

3. **管理翻译**
   - 使用控制条撤销翻译
   - 切换显示原文/译文
   - 关闭控制条

## 配置选项

### API配置
- **API密钥** - DeepSeek API密钥（必需）
- **模型** - 选择使用的模型（deepseek-chat 或 deepseek-coder）

### 翻译设置
- **目标语言** - 默认翻译目标语言
- **自动检测源语言** - 是否自动检测原文语言

### 高级设置
- **最大分块大小** - 单次翻译的最大字符数（建议1000-3000）
- **并发请求数** - 同时进行的翻译请求数（建议2-5）
- **温度参数** - 控制翻译的创造性（0.0-1.0，翻译建议0.2-0.4）

### 排除网站
- 添加不需要翻译功能的网站域名

## 技术栈

- **构建工具**: Vite
- **语言**: JavaScript (ES6+)
- **扩展标准**: Web Extension Manifest V3
- **API**: DeepSeek

## 项目结构

```
AI_trans/
├── manifest.json          # 扩展配置
├── src/
│   ├── popup/            # 弹出页面
│   ├── options/          # 设置页面
│   ├── content/          # 内容脚本
│   │   ├── index.js      # 主入口
│   │   ├── dom-extractor.js    # DOM提取
│   │   ├── text-processor.js   # 文本处理
│   │   ├── translator.js       # 翻译器
│   │   └── ui-injector.js      # UI注入
│   ├── background/       # 后台脚本
│   └── lib/              # 工具库
├── dist/                 # 构建输出
└── package.json
```

## 开发

### 安装依赖
```bash
npm install
```

### 开发模式
```bash
npm run dev
```

### 构建
```bash
npm run build
```

## 注意事项

1. **API密钥安全** - API密钥存储在本地浏览器存储中，不会上传到任何服务器
2. **API费用** - 使用DeepSeek API会产生费用，请注意控制使用量
3. **网络要求** - 需要能够访问 `api.deepseek.com`
4. **页面限制** - 某些特殊页面（chrome://、about:等）不支持翻译

## 常见问题

### Q: 翻译失败怎么办？
A: 检查API密钥是否正确，网络连接是否正常，查看浏览器控制台错误信息。

### Q: 翻译速度慢怎么办？
A: 可以在高级设置中调整并发请求数和分块大小。

### Q: 某些内容没有被翻译？
A: 代码块、表单输入等内容默认不会翻译，可以在页面上添加 `data-notranslate` 属性排除特定元素。

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 更新日志

### v1.0.0 (2024-04-26)
- 初始版本发布
- 支持整页翻译
- 支持DeepSeek API
- 基础UI和配置功能
