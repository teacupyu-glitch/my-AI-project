/**
 * DeepSeek API客户端
 * 封装DeepSeek大模型的API调用
 */
class DeepSeekClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey || '';
    this.model = config.model || 'deepseek-v4-flash';
    this.endpoint = config.endpoint || 'https://api.deepseek.com/chat/completions';
    this.timeout = config.timeout || 30000; // 30秒超时
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
  }

  /**
   * 更新配置
   */
  updateConfig(config) {
    if (config.apiKey) this.apiKey = config.apiKey;
    if (config.model) this.model = config.model;
    if (config.endpoint) this.endpoint = config.endpoint;
    if (config.timeout) this.timeout = config.timeout;
  }

  /**
   * 调用DeepSeek API
   */
  async callAPI(params) {
    if (!this.apiKey) {
      throw new Error('API密钥未配置');
    }

    const requestData = {
      model: params.model || this.model,
      messages: params.messages || [],
      temperature: params.temperature ?? 0.3,
      max_tokens: params.max_tokens || 4000,
      stream: params.stream || false
    };

    let lastError;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(requestData),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
          throw new Error(`API请求失败: ${errorMsg}`);
        }

        const data = await response.json();

        if (data.error) {
          throw new Error(data.error.message || 'API返回错误');
        }

        if (!data.choices || data.choices.length === 0) {
          throw new Error('API未返回有效结果');
        }

        return data;

      } catch (error) {
        lastError = error;

        // 如果是认证错误，不重试
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          throw new Error('API密钥无效，请检查配置');
        }

        // 如果是最后一次尝试，抛出错误
        if (attempt === this.maxRetries) {
          throw new Error(`API调用失败（重试${this.maxRetries}次后）: ${error.message}`);
        }

        // 等待后重试
        await this.sleep(this.retryDelay * attempt);
      }
    }

    throw lastError;
  }

  /**
   * 翻译文本
   */
  async translate(text, sourceLang, targetLang, options = {}) {
    const systemPrompt = options.systemPrompt || this.getSystemPrompt(sourceLang, targetLang, options.glossary);
    const userPrompt = options.userPrompt || this.getUserPrompt(text, sourceLang, targetLang);

    const response = await this.callAPI({
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens || text.length * 2
    });

    return {
      originalText: text,
      translatedText: response.choices[0].message.content,
      model: this.model,
      usage: response.usage
    };
  }

  /**
   * 批量翻译
   */
  async translateBatch(texts, sourceLang, targetLang, options = {}) {
    const concurrency = options.concurrency || 3;
    const results = [];

    // 分批处理
    for (let i = 0; i < texts.length; i += concurrency) {
      const batch = texts.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(text => this.translate(text, sourceLang, targetLang, options))
      );
      results.push(...batchResults);

      // 调用进度回调
      if (options.onProgress) {
        options.onProgress(Math.min(i + concurrency, texts.length), texts.length);
      }
    }

    return results;
  }

  /**
   * 测试连接
   */
  async testConnection() {
    try {
      const response = await this.callAPI({
        messages: [
          {
            role: 'user',
            content: 'Hello'
          }
        ],
        max_tokens: 10
      });

      return {
        success: true,
        message: '连接成功',
        model: this.model,
        response: response
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error
      };
    }
  }

  /**
   * 获取系统提示词
   */
  getSystemPrompt(sourceLang, targetLang, glossary = []) {
    let prompt = `你是一个专业的翻译助手。请将用户提供的${this.getLanguageName(sourceLang)}文本翻译成${this.getLanguageName(targetLang)}。

翻译要求：
1. 只返回翻译结果，不要添加任何解释、说明或额外文本
2. 保留原文的换行和格式
3. 对于代码、URL、邮箱等内容，保持原文不翻译`;

    if (glossary && glossary.length > 0) {
      const rules = glossary
        .map(item => `  "${item.source}" → "${item.target}"`)
        .join('\n');
      prompt += `\n4. 以下是专有名词翻译对照表，翻译时必须严格遵守，将原文中出现的词汇替换为指定译文：\n${rules}`;
    }

    return prompt;
  }

  /**
   * 获取用户提示词
   */
  getUserPrompt(text, sourceLang, targetLang) {
    return text;
  }

  /**
   * 获取语言名称
   */
  getLanguageName(langCode) {
    const languageMap = {
      'auto': '原文',
      'zh-CN': '中文',
      'zh': '中文',
      'en': '英文',
      'en-US': '英文',
      'ja': '日文',
      'ko': '韩文',
      'fr': '法文',
      'de': '德文',
      'es': '西班牙文',
      'ru': '俄文',
      'pt': '葡萄牙文',
      'it': '意大利文'
    };

    return languageMap[langCode] || langCode;
  }

  /**
   * 延迟函数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取支持的模型列表
   */
  getSupportedModels() {
    return [
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', description: '高性价比轻量模型' },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', description: '旗舰高性能模型' }
    ];
  }

  /**
   * 获取支持的语言列表
   */
  getSupportedLanguages() {
    return [
      { code: 'zh-CN', name: '中文（简体）' },
      { code: 'zh-TW', name: '中文（繁体）' },
      { code: 'en', name: '英文' },
      { code: 'ja', name: '日文' },
      { code: 'ko', name: '韩文' },
      { code: 'fr', name: '法文' },
      { code: 'de', name: '德文' },
      { code: 'es', name: '西班牙文' },
      { code: 'ru', name: '俄文' },
      { code: 'pt', name: '葡萄牙文' },
      { code: 'it', name: '意大利文' }
    ];
  }
}

// 导出
export default DeepSeekClient;
