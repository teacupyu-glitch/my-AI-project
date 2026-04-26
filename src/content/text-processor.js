/**
 * 文本处理器
 * 处理文本分段、合并、清理等操作
 */
import { splitIntoSentences, estimateTokens } from '../lib/utils.js';

class TextProcessor {
  constructor(options = {}) {
    this.maxChunkSize = options.maxChunkSize || 2000; // 最大字符数
    this.minChunkSize = options.minChunkSize || 50; // 最小字符数
  }

  /**
   * 智能分段：将文本节点信息分段为适合API调用的块
   */
  segmentTextNodes(textNodes) {
    const chunks = [];
    let currentChunk = [];
    let currentSize = 0;

    for (const nodeInfo of textNodes) {
      const text = nodeInfo.text;

      // 单个文本过长需要分割
      if (text.length > this.maxChunkSize) {
        // 保存当前chunk
        if (currentChunk.length > 0) {
          chunks.push(this.createChunk(currentChunk));
          currentChunk = [];
          currentSize = 0;
        }

        // 分割长文本
        const subChunks = this.splitLongText(nodeInfo);
        chunks.push(...subChunks);
        continue;
      }

      // 检查是否超过chunk大小
      if (currentSize + text.length > this.maxChunkSize && currentChunk.length > 0) {
        chunks.push(this.createChunk(currentChunk));
        currentChunk = [];
        currentSize = 0;
      }

      currentChunk.push(nodeInfo);
      currentSize += text.length;
    }

    // 添加最后一个chunk
    if (currentChunk.length > 0) {
      chunks.push(this.createChunk(currentChunk));
    }

    return chunks;
  }

  /**
   * 创建翻译chunk
   */
  createChunk(items) {
    const parts = items.map((item, i) =>
      `<t id="${i}">${item.text}</t>`
    );
    const combinedText = `<translate>\n${parts.join('\n')}\n</translate>`;
    return {
      id: this.generateId(),
      items: items,
      text: combinedText,
      totalItems: items.length,
      totalCharacters: combinedText.length,
      estimatedTokens: estimateTokens(combinedText),
      status: 'pending',
      translatedText: null,
      error: null
    };
  }

  /**
   * 分割长文本
   */
  splitLongText(nodeInfo) {
    const chunks = [];
    const sentences = splitIntoSentences(nodeInfo.text);

    let currentText = '';
    let startIndex = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];

      if (currentText.length + sentence.length > this.maxChunkSize) {
        if (currentText.length >= this.minChunkSize) {
          // 创建sub chunk
          const endIndex = startIndex + currentText.length;
          chunks.push(this.createSubChunk(
            nodeInfo,
            currentText,
            startIndex,
            endIndex
          ));

          startIndex = endIndex;
          currentText = sentence;
        } else {
          // 单个句子就超限了，强制分割
          chunks.push(this.createSubChunk(
            nodeInfo,
            currentText,
            startIndex,
            startIndex + currentText.length
          ));

          startIndex += currentText.length;
          currentText = sentence;
        }
      } else {
        currentText += (currentText ? ' ' : '') + sentence;
      }
    }

    // 添加最后一个chunk
    if (currentText) {
      chunks.push(this.createSubChunk(
        nodeInfo,
        currentText,
        startIndex,
        startIndex + currentText.length
      ));
    }

    return chunks;
  }

  /**
   * 创建子chunk
   */
  createSubChunk(nodeInfo, text, startIndex, endIndex) {
    return {
      id: this.generateId(),
      isSubChunk: true,
      nodeInfo: nodeInfo,
      text: text,
      startIndex: startIndex,
      endIndex: endIndex,
      totalCharacters: text.length,
      estimatedTokens: estimateTokens(text),
      status: 'pending',
      translatedText: null,
      error: null
    };
  }

  /**
   * 合并翻译结果
   */
  mergeTranslations(chunks, textNodes) {
    const translationMap = new Map();

    // 处理普通chunks：从XML格式解析翻译结果
    for (const chunk of chunks) {
      if (chunk.status !== 'success' || chunk.isSubChunk) continue;

      const matches = chunk.translatedText.match(/<t id="(\d+)">([\s\S]*?)<\/t>/g);
      if (!matches) continue;

      matches.forEach(match => {
        const idMatch = match.match(/<t id="(\d+)">([\s\S]*?)<\/t>/);
        if (idMatch) {
          const idx = parseInt(idMatch[1]);
          const text = idMatch[2].trim();
          const item = chunk.items[idx];
          if (item && text && !translationMap.has(item.id)) {
            translationMap.set(item.id, text);
          }
        }
      });
    }

    // 处理sub chunks（长文本分割）：拼接
    for (const chunk of chunks) {
      if (chunk.status !== 'success' || !chunk.isSubChunk) continue;

      const nodeInfo = chunk.nodeInfo;
      if (nodeInfo) {
        const prev = translationMap.get(nodeInfo.id) || '';
        translationMap.set(nodeInfo.id, prev + chunk.translatedText);
      }
    }

    // 更新textNodes
    for (const nodeInfo of textNodes) {
      const translatedText = translationMap.get(nodeInfo.id);
      if (translatedText) {
        nodeInfo.translated = true;
        nodeInfo.translatedText = translatedText;
      }
    }
  }

  /**
   * 清理翻译结果
   */
  cleanTranslation(text) {
    text = text.trim();

    // 移除可能的markdown代码块包裹
    text = text.replace(/^```(?:xml|html)?\s*\n?/i, '').replace(/\n?```\s*$/, '');

    // 如果输出不是以<translate>开头，尝试提取
    if (!text.startsWith('<translate>')) {
      const m = text.match(/<translate>[\s\S]*<\/translate>/);
      if (m) text = m[0];
    }

    return text;
  }

  /**
   * 生成唯一ID
   */
  generateId() {
    return 'chunk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * 检查文本是否包含特殊内容
   */
  hasSpecialContent(text) {
    // 检查是否包含代码
    if (/<code[\s\S]*?>[\s\S]*?<\/code>/i.test(text)) return true;
    if (/```[\s\S]*?```/.test(text)) return true;

    // 检查是否包含URL
    if (/\bhttps?:\/\/\S+/i.test(text)) return true;

    // 检查是否包含邮箱
    if (/\b[\w.-]+@[\w.-]+\.\w+\b/.test(text)) return true;

    return false;
  }

  /**
   * 提取特殊内容并替换为占位符
   */
  extractSpecialContent(text) {
    const placeholders = [];
    let index = 0;

    // 提取代码块
    text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const placeholder = `__CODE_${index}__`;
      placeholders.push({
        type: 'code',
        lang: lang,
        content: code,
        placeholder: placeholder
      });
      index++;
      return placeholder;
    });

    // 提取URL
    text = text.replace(/\b(https?:\/\/[^\s<>"{}|\\^`\[\]]+)\b/g, (match, url) => {
      const placeholder = `__URL_${index}__`;
      placeholders.push({
        type: 'url',
        content: url,
        placeholder: placeholder
      });
      index++;
      return placeholder;
    });

    // 提取邮箱
    text = text.replace(/\b([\w.-]+@[\w.-]+\.\w+)\b/g, (match, email) => {
      const placeholder = `__EMAIL_${index}__`;
      placeholders.push({
        type: 'email',
        content: email,
        placeholder: placeholder
      });
      index++;
      return placeholder;
    });

    return {
      text: text,
      placeholders: placeholders
    };
  }

  /**
   * 恢复特殊内容
   */
  restoreSpecialContent(text, placeholders) {
    for (const item of placeholders) {
      text = text.replace(item.placeholder, item.content);
    }
    return text;
  }

  /**
   * 检查翻译质量
   */
  checkTranslationQuality(original, translated) {
    const issues = [];

    // 检查长度差异过大
    const lengthRatio = translated.length / original.length;
    if (lengthRatio < 0.3 || lengthRatio > 3) {
      issues.push({
        type: 'length',
        message: `翻译长度异常（原长度: ${original.length}, 译长度: ${translated.length}）`
      });
    }

    // 检查是否包含翻译标记
    if (translated.includes('翻译结果') || translated.includes('Translation')) {
      issues.push({
        type: 'marker',
        message: '翻译结果可能包含冗余的说明文字'
      });
    }

    // 检查是否为空
    if (!translated.trim()) {
      issues.push({
        type: 'empty',
        message: '翻译结果为空'
      });
    }

    return {
      quality: issues.length === 0 ? 'good' : 'poor',
      issues: issues
    };
  }

  /**
   * 更新配置
   */
  updateConfig(options) {
    if (options.maxChunkSize) this.maxChunkSize = options.maxChunkSize;
    if (options.minChunkSize) this.minChunkSize = options.minChunkSize;
  }
}

// 导出
export default TextProcessor;
