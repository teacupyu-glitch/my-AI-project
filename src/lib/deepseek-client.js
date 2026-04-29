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
      temperature: params.temperature ?? 0.1,
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
   * 批量翻译（XML 批次，一次请求翻译多条文本）
   * @param {string} xmlText - `<translate><t id="0">...</t><t id="1">...</t></translate>` 格式
   * @returns {object} { translatedText, model, usage }
   */
  async translateBatchXML(xmlText, sourceLang, targetLang, options = {}) {
    const systemPrompt = options.systemPrompt || this.getBatchSystemPrompt(sourceLang, targetLang, options.glossary);

    const response = await this.callAPI({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: xmlText }
      ],
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens || Math.max(xmlText.length * 2, 2000)
    });

    return {
      translatedText: response.choices[0].message.content,
      model: this.model,
      usage: response.usage
    };
  }

  /**
   * 批量翻译（流式，逐 token 返回累积文本）
   * @returns {AsyncGenerator<string>} 每次 yield 完整的累积文本
   */
  async *translateBatchXMLStream(xmlText, sourceLang, targetLang, options = {}) {
    if (!this.apiKey) throw new Error('API密钥未配置');

    const systemPrompt = options.systemPrompt || this.getBatchSystemPrompt(sourceLang, targetLang, options.glossary);
    const maxTokens = options.maxTokens || Math.max(xmlText.length * 2, 2000);
    const temperature = options.temperature ?? 0.1;

    const body = JSON.stringify({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: xmlText }
      ],
      temperature,
      max_tokens: maxTokens,
      stream: true
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    let response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body,
        signal: controller.signal
      });
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') throw new Error('API请求超时');
      throw error;
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
      if (response.status === 401) throw new Error('API密钥无效，请检查配置');
      throw new Error(`API请求失败: ${errorMsg}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';
    let accumulated = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              accumulated += content;
              yield accumulated;
            }
          } catch {
            // 跳过无法解析的行
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 批处理专用系统提示词
   */
  getBatchSystemPrompt(sourceLang, targetLang, glossary = []) {
    let prompt = `你是一个专业的翻译助手。你会收到一段 XML 格式的文本，其中包含多个需要翻译的句子。

翻译规则：
1. 保持 XML 标签结构完全不变，包括 <t id="N"> 和 </t>，以及外层的 <translate> 和 </translate>
2. 只翻译 <t id="N"> 标签内的文本内容
3. 不要添加任何解释、说明或额外内容
4. 不要用 markdown 代码块包裹输出
5. 对于代码、URL、邮箱等特殊内容，保持原文不翻译`;

    if (glossary && glossary.length > 0) {
      const rules = glossary
        .map(item => `  "${item.source}" → "${item.target}"`)
        .join('\n');
      prompt += `\n6. 以下是专有名词翻译对照表，翻译时必须严格遵守：\n${rules}`;
    }

    return prompt;
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
