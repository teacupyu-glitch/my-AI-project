/**
 * 翻译器
 * 逐节点翻译，彻底消除批处理的分隔/合并问题
 */
import DeepSeekClient from '../lib/deepseek-client.js';
import { sleep } from '../lib/utils.js';

class Translator {
  constructor(config = {}) {
    this.apiClient = null;
    this.concurrency = config.concurrency || 3;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;

    this.isTranslating = false;
    this.activeRequests = 0;
    this.cancelled = false;

    this.sourceLang = config.sourceLang || 'auto';
    this.targetLang = config.targetLang || 'zh-CN';

    this.onProgress = null;
    this.onError = null;
    this.onComplete = null;
  }

  initAPI(apiKey, model = 'deepseek-chat') {
    this.apiClient = new DeepSeekClient({ apiKey, model });
  }

  updateConfig(config) {
    if (config.concurrency) this.concurrency = config.concurrency;
    if (config.sourceLang) this.sourceLang = config.sourceLang;
    if (config.targetLang) this.targetLang = config.targetLang;
  }

  /**
   * 翻译 — 每个文本节点独立调用API
   */
  async translate(textNodes) {
    if (this.isTranslating) {
      throw new Error('已有翻译任务在进行中');
    }
    if (!this.apiClient) {
      throw new Error('API客户端未初始化');
    }

    this.isTranslating = true;
    this.cancelled = false;
    this.activeRequests = 0;

    const total = textNodes.length;
    let completed = 0;
    let success = 0;
    let failed = 0;
    const errors = [];

    try {
      const promises = [];

      for (let i = 0; i < textNodes.length; i++) {
        if (this.cancelled) break;

        while (this.activeRequests >= this.concurrency) {
          await sleep(100);
        }
        if (this.cancelled) break;

        this.activeRequests++;

        const nodeInfo = textNodes[i];
        const promise = this.translateOne(nodeInfo)
          .then(result => {
            this.activeRequests--;
            completed++;
            if (result.translated) success++;
            if (result.error) { failed++; errors.push(result.error); }
            if (this.onProgress) this.onProgress(completed, total);
            return result;
          })
          .catch(err => {
            this.activeRequests--;
            completed++;
            failed++;
            errors.push(err.message);
            if (this.onProgress) this.onProgress(completed, total);
            return { nodeInfo, error: err.message };
          });

        promises.push(promise);
      }

      await Promise.all(promises);

      if (this.onComplete) {
        this.onComplete({ total, success, failed });
      }

      return {
        success: failed === 0,
        textNodes,
        stats: { total, success, failed, errors }
      };

    } catch (error) {
      if (this.onError) this.onError(error);
      return { success: false, error: error.message };
    } finally {
      this.isTranslating = false;
      this.activeRequests = 0;
    }
  }

  /**
   * 翻译单个文本节点
   */
  async translateOne(nodeInfo) {
    if (this.cancelled) return { nodeInfo };

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.apiClient.translate(
          nodeInfo.text,
          this.sourceLang,
          this.targetLang,
          { maxTokens: Math.max(nodeInfo.text.length * 2, 500) }
        );

        const cleaned = this.cleanResult(result.translatedText);
        nodeInfo.translated = true;
        nodeInfo.translatedText = cleaned;

        return { nodeInfo, translated: true };

      } catch (error) {
        if (attempt === this.maxRetries) {
          return { nodeInfo, translated: false, error: error.message };
        }
        await sleep(this.retryDelay * attempt);
      }
    }

    return { nodeInfo, translated: false, error: '重试耗尽' };
  }

  cancel() {
    if (this.isTranslating) {
      this.cancelled = true;
      this.isTranslating = false;
      return true;
    }
    return false;
  }

  /**
   * 清理API返回的译文（剥离XML标签/markdown包裹）
   */
  cleanResult(text) {
    let t = text.trim();

    // 移除 markdown 代码块包裹
    t = t.replace(/^```(?:xml|html)?\s*\n?/i, '').replace(/\n?```\s*$/, '');

    // 如果含有 <t id="...">，提取纯文本内容
    if (/<t\s+id=/.test(t)) {
      const parts = t.match(/<t\s+id="\d+">([\s\S]*?)<\/t>/g);
      if (parts) {
        return parts.map(p => p.replace(/<t\s+id="\d+">/, '').replace(/<\/t>\s*$/, '').trim()).join('');
      }
    }

    // 移除可能的 <translate> 包裹
    t = t.replace(/^<translate>\s*\n?/, '').replace(/\n?\s*<\/translate>\s*$/, '');

    return t.trim();
  }

  setProgressCallback(callback) { this.onProgress = callback; }
  setErrorCallback(callback) { this.onError = callback; }
  setCompleteCallback(callback) { this.onComplete = callback; }

  getStatus() {
    return {
      isTranslating: this.isTranslating,
      activeRequests: this.activeRequests
    };
  }

  async testConnection(apiKey) {
    return await new DeepSeekClient({ apiKey }).testConnection();
  }

  getSupportedLanguages() {
    return new DeepSeekClient().getSupportedLanguages();
  }

  getSupportedModels() {
    return new DeepSeekClient().getSupportedModels();
  }
}

export default Translator;
