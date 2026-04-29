/**
 * 文本处理器（批处理）
 * 将多个文本节点打包为 XML 批次，一次 API 调用完成翻译
 */
import { estimateTokens } from '../lib/utils.js';

class TextProcessor {
  constructor(options = {}) {
    this.maxChunkSize = options.maxChunkSize || 4000; // 每批次最大字符数
    this._idCounter = 0;
  }

  /**
   * 将文本节点列表分割为批次
   * 每个超长节点（> maxChunkSize）单独作为一个批次
   */
  segmentTextNodes(textNodes) {
    const chunks = [];
    let currentItems = [];
    let currentSize = 0;
    let currentIds = [];

    for (const nodeInfo of textNodes) {
      const text = nodeInfo.text;

      // 超长节点单独成批
      if (text.length > this.maxChunkSize) {
        if (currentItems.length > 0) {
          chunks.push(this.createChunk(currentItems, currentIds));
          currentItems = [];
          currentSize = 0;
          currentIds = [];
        }
        chunks.push(this.createChunk([nodeInfo], [nodeInfo.id]));
        continue;
      }

      if (currentSize + text.length > this.maxChunkSize && currentItems.length > 0) {
        chunks.push(this.createChunk(currentItems, currentIds));
        currentItems = [];
        currentSize = 0;
        currentIds = [];
      }

      currentItems.push(nodeInfo);
      currentIds.push(nodeInfo.id);
      currentSize += text.length;
    }

    if (currentItems.length > 0) {
      chunks.push(this.createChunk(currentItems, currentIds));
    }

    return chunks;
  }

  /**
   * 创建翻译批次
   * items 与 ids 一一对应
   */
  createChunk(items, ids) {
    const parts = items.map((item, i) =>
      `<t id="${i}">${item.text}</t>`
    );
    const combinedText = `<translate>\n${parts.join('\n')}\n</translate>`;

    return {
      id: 'batch_' + (this._idCounter++),
      items: items,       // nodeInfo 数组
      ids: ids,           // 与 items 对应的原始 nodeInfo.id
      text: combinedText,
      totalItems: items.length,
      totalCharacters: combinedText.length,
      estimatedTokens: estimateTokens(combinedText),
      status: 'pending',
      translatedText: null,
      error: null,
    };
  }

  /**
   * 从 XML 响应解析译文，映射回对应节点
   */
  mergeTranslations(chunks) {
    for (const chunk of chunks) {
      if (chunk.status !== 'success') continue;
      const raw = chunk.translatedText || '';
      const matches = raw.match(/<t\b[^>]*\sid=["']?(\d+)["']?[^>]*>([\s\S]*?)<\/t>/g);
      if (!matches) {
        // 整个批次无有效 XML，尝试作为单段译文匹配第一个节点
        const clean = this.cleanTranslation(raw);
        if (clean && chunk.items[0]) {
          chunk.items[0].translated = true;
          chunk.items[0].translatedText = clean;
        }
        continue;
      }

      for (const match of matches) {
        const m = match.match(/<t\b[^>]*\sid=["']?(\d+)["']?[^>]*>([\s\S]*?)<\/t>/);
        if (!m) continue;
        const idx = parseInt(m[1]);
        const text = this.cleanTranslation(m[2]);
        if (text && chunk.items[idx]) {
          chunk.items[idx].translated = true;
          chunk.items[idx].translatedText = text;
        }
      }
    }
  }

  /**
   * 预处理 API 响应，提取 XML 核心内容
   */
  cleanTranslation(text) {
    let t = text.trim();
    // 移除 markdown 代码块
    t = t.replace(/^```(?:xml|html)?\s*\n?/i, '').replace(/\n?```\s*$/, '');
    t = t.trim();

    // 提取 <translate> 包裹
    const translateMatch = t.match(/<translate>([\s\S]*)<\/translate>/i);
    if (translateMatch) t = translateMatch[1].trim();

    return t;
  }

  /**
   * 增量解析流式响应 — 从累积文本中提取已完成的 <t> 标签
   * @param {string} accumulatedText - 当前累积的全部响应文本
   * @param {object} chunk - 批次对象
   * @param {Set} processedIds - 已处理过的 item 索引集合
   * @returns {{ newItems: object[], processedCount: number }}
   */
  mergeIncremental(accumulatedText, chunk, processedIds = new Set()) {
    const matches = accumulatedText.match(/<t\b[^>]*\sid=["']?(\d+)["']?[^>]*>([\s\S]*?)<\/t>/g);
    if (!matches) return { newItems: [], processedCount: 0 };

    const newItems = [];
    for (const match of matches) {
      const m = match.match(/<t\b[^>]*\sid=["']?(\d+)["']?[^>]*>([\s\S]*?)<\/t>/);
      if (!m) continue;
      const idx = parseInt(m[1]);
      if (processedIds.has(idx)) continue;

      const text = m[2].trim();
      if (text && chunk.items[idx]) {
        processedIds.add(idx);
        chunk.items[idx].translated = true;
        chunk.items[idx].translatedText = text;
        newItems.push(chunk.items[idx]);
      }
    }
    return { newItems, processedCount: processedIds.size };
  }

  updateConfig(options) {
    if (options.maxChunkSize) this.maxChunkSize = options.maxChunkSize;
  }
}

export default TextProcessor;
