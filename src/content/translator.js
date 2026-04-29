/**
 * 翻译器
 * 批处理模式：将多个文本节点打包为一个 XML 批次，一次 API 调用完成翻译
 */
import DeepSeekClient from '../lib/deepseek-client.js';
import TextProcessor from './text-processor.js';

/** Promise 信号量 — 控制并发数，支持取消 */
class Semaphore {
  constructor(max) {
    this.max = max;
    this.current = 0;
    this.waiting = [];
    this.rejected = false;
  }

  acquire() {
    if (this.rejected) return Promise.reject(new Error('CANCELLED'));
    if (this.current < this.max) {
      this.current++;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this.waiting.push({ resolve, reject });
    });
  }

  release() {
    this.current--;
    if (!this.rejected && this.waiting.length > 0) {
      this.current++;
      this.waiting.shift().resolve();
    }
  }

  cancel() {
    this.rejected = true;
    for (const w of this.waiting) {
      w.reject(new Error('CANCELLED'));
    }
    this.waiting = [];
  }
}

class Translator {
  constructor(config = {}) {
    this.apiClient = null;
    this.concurrency = config.concurrency || 8;
    this.isTranslating = false;
    this.cancelled = false;

    this.sourceLang = config.sourceLang || 'auto';
    this.targetLang = config.targetLang || 'zh-CN';
    this.glossary = [];

    // 批处理器
    this.processor = new TextProcessor({ maxChunkSize: config.maxChunkSize || 4000 });

    this.onProgress = null;
    this.onError = null;
    this.onComplete = null;
    this.onBatchComplete = null;

    this._sem = null;
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
   * 翻译 — 批处理模式，Promise 信号量控制并发
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

    const chunks = this.processor.segmentTextNodes(textNodes);
    const total = textNodes.length;
    let completed = 0;
    let success = 0;
    let failed = 0;
    const errors = [];

    this._sem = new Semaphore(this.concurrency);

    try {
      const results = await Promise.allSettled(
        chunks.map(async (chunk) => {
          try {
            await this._sem.acquire();
          } catch {
            return { ok: false, error: 'CANCELLED' };
          }
          if (this.cancelled) {
            this._sem.release();
            return { ok: false, error: 'CANCELLED' };
          }

          try {
            const result = await this.translateBatch(chunk);
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
          } finally {
            this._sem.release();
          }
        })
      );

      // 收集未处理的错误
      for (const r of results) {
        if (r.status === 'rejected') {
          errors.push(r.reason?.message || '未知错误');
        }
      }

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
      this._sem = null;
    }
  }

  /**
   * 翻译单个批次（网络重试由 deepseek-client 内部处理）
   */
  async translateBatch(chunk) {
    if (this.cancelled) return { ok: false };

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

      const cleaned = this.processor.cleanTranslation(result.translatedText);
      if (!cleaned) {
        throw new Error('翻译结果无效，模型未返回有效译文');
      }

      chunk.status = 'success';
      chunk.translatedText = cleaned;

      this.processor.mergeTranslations([chunk]);

      if (this.onBatchComplete) {
        this.onBatchComplete(chunk.items);
      }

      return { ok: true, chunk };

    } catch (error) {
      chunk.status = 'failed';
      chunk.error = error.message;
      return { ok: false, chunk, error: error.message };
    }
  }

  cancel() {
    if (this.isTranslating) {
      this.cancelled = true;
      this.isTranslating = false;
      if (this._sem) this._sem.cancel();
      return true;
    }
    return false;
  }

  setProgressCallback(callback) { this.onProgress = callback; }
  setErrorCallback(callback) { this.onError = callback; }
  setCompleteCallback(callback) { this.onComplete = callback; }
  setBatchCompleteCallback(callback) { this.onBatchComplete = callback; }

  getStatus() {
    return {
      isTranslating: this.isTranslating,
      activeRequests: this._sem ? this._sem.current : 0
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
