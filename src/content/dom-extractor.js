/**
 * DOM提取器
 * 从页面DOM树中提取可翻译的文本节点
 */
class DOMExtractor {
  constructor() {
    // 忽略的标签
    this.ignoreTags = new Set([
      'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG',
      'CANVAS', 'VIDEO', 'AUDIO', 'OBJECT', 'EMBED',
      'CODE', 'PRE', 'KBD', 'SAMP', 'VAR'
    ]);

    // 保留的属性
    this.preserveAttributes = ['class', 'id', 'style', 'data-*'];

    // 需要排除的选择器
    this.excludeSelectors = [
      '[data-notranslate]',
      '[contenteditable="true"]',
      'textarea',
      'input[type="text"]',
      'input[type="search"]',
      'input[type="email"]',
      'input[type="password"]',
      '.code',
      '.syntax',
      '.highlight'
    ];
  }

  /**
   * 提取页面中所有可翻译的文本节点
   */
  extractTranslatableText(root = document.body) {
    const textNodes = [];

    try {
      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            return this.shouldAcceptNode(node);
          }
        }
      );

      let node;
      while (node = walker.nextNode()) {
        const textNodeInfo = this.createTextNodeInfo(node);
        if (textNodeInfo) {
          textNodes.push(textNodeInfo);
        }
      }

    } catch (error) {
      console.error('DOM提取失败:', error);
    }

    return textNodes;
  }

  /**
   * 判断节点是否应该被接受
   */
  shouldAcceptNode(node) {
    const text = node.textContent;

    // 跳过纯空白节点
    if (!text.trim()) {
      return NodeFilter.FILTER_REJECT;
    }

    // 至少包含一个字母或数字（排除纯符号/标点/不可见字符的节点）
    if (!/[\p{L}\p{N}]/u.test(text)) {
      return NodeFilter.FILTER_REJECT;
    }

    const parent = node.parentElement;
    if (!parent) {
      return NodeFilter.FILTER_REJECT;
    }

    // 跳过忽略标签内的文本
    if (this.ignoreTags.has(parent.tagName)) {
      return NodeFilter.FILTER_REJECT;
    }

    // 检查是否在排除区域内
    if (this.isInExcludedArea(node)) {
      return NodeFilter.FILTER_REJECT;
    }

    // 检查是否在隐藏元素中
    if (this.isInHiddenElement(node)) {
      return NodeFilter.FILTER_REJECT;
    }

    return NodeFilter.FILTER_ACCEPT;
  }

  /**
   * 创建文本节点信息
   */
  createTextNodeInfo(node) {
    return {
      id: this.generateNodeId(node),
      node: node,
      text: node.textContent,
      originalText: node.textContent,
      path: this.getNodePath(node),
      context: this.getContext(node),
      parentTag: node.parentElement?.tagName,
      parentClass: node.parentElement?.className,
      translated: false,
      translatedText: null
    };
  }

  /**
   * 生成节点ID
   */
  generateNodeId(node) {
    return 'node_' + this.getNodePath(node).join('_');
  }

  /**
   * 获取节点路径（用于后续定位）
   */
  getNodePath(node) {
    const path = [];
    let current = node;

    while (current && current !== document.body) {
      const parent = current.parentElement;
      if (parent) {
        // 获取同级节点中的索引
        const siblings = Array.from(parent.childNodes)
          .filter(n => n.nodeType === current.nodeType);

        const index = siblings.indexOf(current);
        path.unshift({
          tag: current.tagName || '#text',
          index: index,
          className: current.className || ''
        });
      }
      current = parent;
    }

    return path;
  }

  /**
   * 根据路径查找节点
   */
  findNodeByPath(path) {
    let current = document.body;

    for (const step of path) {
      if (!current) return null;

      const siblings = Array.from(current.childNodes)
        .filter(n => {
          if (step.tag === '#text') {
            return n.nodeType === Node.TEXT_NODE;
          } else {
            return n.nodeType === Node.ELEMENT_NODE &&
                   n.tagName === step.tag;
          }
        });

      current = siblings[step.index];
    }

    return current;
  }

  /**
   * 获取节点上下文（提高翻译准确性）
   */
  getContext(node, maxChars = 100) {
    const parent = node.parentElement;
    if (!parent) return '';

    let context = '';

    // 获取前一个兄弟节点的文本
    const prevSibling = node.previousSibling;
    if (prevSibling && prevSibling.nodeType === Node.TEXT_NODE) {
      context += prevSibling.textContent.slice(-maxChars / 2);
    }

    context += '【TARGET】';

    // 获取后一个兄弟节点的文本
    const nextSibling = node.nextSibling;
    if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE) {
      context += nextSibling.textContent.slice(0, maxChars / 2);
    }

    return context;
  }

  /**
   * 检查节点是否在排除区域内
   */
  isInExcludedArea(node) {
    const element = node.parentElement;
    if (!element) return false;

    // 检查是否有排除标记
    if (element.hasAttribute('data-notranslate')) {
      return true;
    }

    // 检查是否匹配排除选择器
    for (const selector of this.excludeSelectors) {
      try {
        if (element.matches(selector)) {
          return true;
        }
      } catch (e) {
        // 忽略无效的选择器
      }
    }

    // 递归检查父级
    return this.isInExcludedArea(element);
  }

  /**
   * 检查节点是否在隐藏元素中
   */
  isInHiddenElement(node) {
    const element = node.parentElement;
    if (!element) return false;

    // 检查是否通过CSS隐藏
    const style = window.getComputedStyle(element);
    if (style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0') {
      return true;
    }

    // 检查父级
    return this.isInHiddenElement(element);
  }

  /**
   * 统计可翻译文本的数量
   */
  getTextStats(textNodes) {
    const stats = {
      totalNodes: textNodes.length,
      totalCharacters: 0,
      totalWords: 0,
      estimatedTokens: 0
    };

    for (const nodeInfo of textNodes) {
      const text = nodeInfo.text.trim();
      stats.totalCharacters += text.length;

      // 估算单词数（中文按字符算，英文按单词算）
      const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
      const nonChineseText = text.replace(/[一-龥]/g, '');

      stats.totalWords += chineseChars;
      stats.totalWords += nonChineseText.trim() ? nonChineseText.trim().split(/\s+/).length : 0;
    }

    // 估算token数
    stats.estimatedTokens = Math.ceil(stats.totalCharacters * 0.7);

    return stats;
  }

  /**
   * 根据ID查找文本节点信息
   */
  findTextNodeById(textNodes, id) {
    return textNodes.find(node => node.id === id);
  }

  /**
   * 更新文本节点的翻译结果
   */
  updateTranslation(textNodes, id, translatedText) {
    const nodeInfo = this.findTextNodeById(textNodes, id);
    if (nodeInfo) {
      nodeInfo.translated = true;
      nodeInfo.translatedText = translatedText;
    }
    return nodeInfo;
  }

  /**
   * 撤销所有翻译
   */
  undoAllTranslations(textNodes) {
    for (const nodeInfo of textNodes) {
      if (nodeInfo.translated && nodeInfo.node) {
        nodeInfo.node.textContent = nodeInfo.originalText;
        nodeInfo.translated = false;
        nodeInfo.translatedText = null;
      }
    }
  }

  /**
   * 切换显示原文/译文
   */
  toggleTranslation(textNodes, showTranslation) {
    for (const nodeInfo of textNodes) {
      if (nodeInfo.node) {
        nodeInfo.node.textContent = showTranslation
          ? (nodeInfo.translatedText || nodeInfo.originalText)
          : nodeInfo.originalText;
      }
    }
  }

  /**
   * 添加排除标记
   */
  addExcludeMarker(element) {
    if (element && !element.hasAttribute('data-notranslate')) {
      element.setAttribute('data-notranslate', 'true');
      return true;
    }
    return false;
  }

  /**
   * 移除排除标记
   */
  removeExcludeMarker(element) {
    if (element && element.hasAttribute('data-notranslate')) {
      element.removeAttribute('data-notranslate');
      return true;
    }
    return false;
  }
}

// 导出
export default DOMExtractor;
