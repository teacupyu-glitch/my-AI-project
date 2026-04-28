/**
 * 翻译器
 * 批处理模式：将多个文本节点打包为一个 XML 批次，一次 API 调用完成翻译
 */
import DeepSeekClient from '../lib/deepseek-client.js';
import TextProcessor from './text-processor.js';
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
    this.glossary = [];

    // 批处理器
    this.processor = new TextProcessor({ maxChunkSize: config.maxChunkSize || 2000 });

    this.onProgress = null;
    this.onError = null;
    this.onComplete = null;
  }

  initAPI(apiKey, model = 'deepseek-v4-flash') {
    this.apiClient = new DeepSeekClient({ apiKey, model });
  }

  updateConfig(config) {
    if (config.concurrency !== undefined) this.concurrency = config.concurrency;
    if (config.sourceLang) this.sourceLang = config.sourceLang;
    if (config.targetLang) this.targetLang = config.targetLang;
    this.processor.updateConfig(config);
  }

  setGlossary(glossary) {
    this.glossary = glossary || [];
  }

  /**
   * 翻译 — 批处理模式
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

    // 分割为批次
    const chunks = this.processor.segmentTextNodes(textNodes);
    const total = textNodes.length;
    let completed = 0;
    let success = 0;
    let failed = 0;
    const errors = [];

    try {
      const promises = [];

      for (let i = 0; i < chunks.length; i++) {
        if (this.cancelled) break;

        while (this.activeRequests >= this.concurrency) {
          await sleep(100);
        }
        if (this.cancelled) break;

        this.activeRequests++;

        const chunk = chunks[i];
        const promise = this.translateBatch(chunk)
          .then(result => {
            this.activeRequests--;
            const itemCount = chunk.totalItems;
            completed += itemCount;
            if (result.ok) {
              success += itemCount;
            } else {
              failed += itemCount;
              errors.push(result.error || '批次翻译失败');
            }
            if (this.onProgress) this.onProgress(completed, total);
            return result;
          })
          .catch(err => {
            this.activeRequests--;
            const itemCount = chunk.totalItems;
            completed += itemCount;
            failed += itemCount;
            errors.push(err.message);
            if (this.onProgress) this.onProgress(completed, total);
            return { ok: false, error: err.message };
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
        stats: { total, success, failed, errors, batchCount: chunks.length }
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
   * 翻译单个批次
   */
  async translateBatch(chunk) {
    if (this.cancelled) return { ok: false };

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.apiClient.translateBatchXML(
          chunk.text,
          this.sourceLang,
          this.targetLang,
          {
            maxTokens: Math.max(chunk.totalCharacters * 2, 2000),
            glossary: this.glossary
          }
        );

        // 预处理响应
        const cleaned = this.processor.cleanTranslation(result.translatedText);
        if (!cleaned) {
          throw new Error('翻译结果无效，模型未返回有效译文');
        }

        chunk.status = 'success';
        chunk.translatedText = cleaned;

        // 解析 XML 并映射回节点
        this.processor.mergeTranslations([chunk]);

        return { ok: true, chunk };

      } catch (error) {
        if (attempt === this.maxRetries) {
          chunk.status = 'failed';
          chunk.error = error.message;
          return { ok: false, chunk, error: error.message };
        }
        await sleep(this.retryDelay * attempt);
      }
    }

    return { ok: false, chunk, error: '重试耗尽' };
  }

  cancel() {
    if (this.isTranslating) {
      this.cancelled = true;
      this.isTranslating = false;
      return true;
    }
    return false;
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
