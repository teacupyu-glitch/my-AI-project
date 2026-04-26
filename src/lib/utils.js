/**
 * 通用工具函数
 */

/**
 * 浏览器兼容性工具
 */
export const BrowserCompat = {
  isChrome() {
    return typeof chrome !== 'undefined' && chrome.runtime;
  },

  isFirefox() {
    return typeof browser !== 'undefined' && browser.runtime;
  },

  getStorage() {
    return this.isFirefox() ? browser.storage : chrome.storage;
  },

  getRuntime() {
    return this.isFirefox() ? browser.runtime : chrome.runtime;
  },

  /**
   * 发送消息
   */
  async sendMessage(message) {
    const runtime = this.getRuntime();
    return new Promise((resolve, reject) => {
      runtime.sendMessage(message, (response) => {
        if (runtime.lastError) {
          reject(runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  },

  /**
   * 监听消息
   */
  onMessage(callback) {
    const runtime = this.getRuntime();
    runtime.onMessage.addListener((message, sender, sendResponse) => {
      callback(message, sender, sendResponse);
      return true; // 保持消息通道开放以支持异步响应
    });
  }
};

/**
 * 延迟函数
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 生成唯一ID
 */
export function generateId() {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * 防抖函数
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * 节流函数
 */
export function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * 深度克隆对象
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }

  if (obj instanceof Array) {
    return obj.map(item => deepClone(item));
  }

  if (obj instanceof Object) {
    const clonedObj = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
}

/**
 * 检查是否为有效URL
 */
export function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * 获取当前域名
 */
export function getCurrentDomain() {
  try {
    return new URL(window.location.href).hostname;
  } catch (e) {
    return '';
  }
}

/**
 * 检查域名是否在排除列表中
 */
export function isExcludedDomain(domain, excludedList) {
  return excludedList.some(excluded => {
    return domain === excluded || domain.endsWith('.' + excluded);
  });
}

/**
 * 截断文本
 */
export function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substr(0, maxLength) + '...';
}

/**
 * 清理文本（移除多余空格和换行）
 */
export function cleanText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

/**
 * 分割文本为句子
 */
export function splitIntoSentences(text) {
  // 匹配中英文句子结束标点
  return text.match(/[^.!?。！？]+[.!?。！？]*/g) || [text];
}

/**
 * 计算文本的大致token数（粗略估计）
 */
export function estimateTokens(text) {
  // 英文大约4个字符=1个token，中文大约1.5个字符=1个token
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;

  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * 格式化时间
 */
export function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * 简单的哈希函数
 */
export function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * 检查是否在iframe中
 */
export function isInIframe() {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
}

/**
 * 检查页面是否可滚动
 */
export function isPageScrollable() {
  return document.body.scrollHeight > window.innerHeight;
}

/**
 * 平滑滚动到元素
 */
export function scrollToElement(element, options = {}) {
  element.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
    ...options
  });
}
