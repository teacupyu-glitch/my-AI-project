/**
 * Popup页面逻辑
 */
import { BrowserCompat } from '../lib/utils.js';

class Popup {
  constructor() {
    this.translateBtn = document.getElementById('translateBtn');
    this.targetLangSelect = document.getElementById('targetLangSelect');
    this.apiStatus = document.getElementById('apiStatus');
    this.settingsLink = document.getElementById('settingsLink');
    this.statusDisplay = document.getElementById('statusDisplay');

    this.isTranslating = false;

    this.init();
  }

  /**
   * 初始化
   */
  async init() {
    // 加载配置
    await this.loadConfig();

    // 绑定事件
    this.bindEvents();

    // 检查当前标签页状态
    await this.checkCurrentTabStatus();
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 翻译按钮
    this.translateBtn.addEventListener('click', () => {
      this.handleTranslate();
    });

    // 语言选择
    this.targetLangSelect.addEventListener('change', () => {
      this.saveTargetLanguage();
    });

    // 设置链接
    this.settingsLink.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  /**
   * 加载配置
   */
  async loadConfig() {
    try {
      const result = await this.getConfig();

      // 设置目标语言
      if (result.translationSettings?.targetLang) {
        this.targetLangSelect.value = result.translationSettings.targetLang;
      }

      // 更新API状态
      this.updateAPIStatus(!!result.apiConfig?.apiKey);

    } catch (error) {
      console.error('加载配置失败:', error);
    }
  }

  /**
   * 获取配置
   */
  async getConfig() {
    return new Promise((resolve, reject) => {
      BrowserCompat.getStorage().local.get('config', (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result.config || {});
        }
      });
    });
  }

  /**
   * 保存目标语言
   */
  async saveTargetLanguage() {
    try {
      const config = await this.getConfig();

      config.translationSettings = config.translationSettings || {};
      config.translationSettings.targetLang = this.targetLangSelect.value;

      await new Promise((resolve, reject) => {
        BrowserCompat.getStorage().local.set({ config }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

    } catch (error) {
      console.error('保存语言设置失败:', error);
    }
  }

  /**
   * 更新API状态显示
   */
  updateAPIStatus(hasApiKey) {
    if (hasApiKey) {
      this.apiStatus.classList.add('configured');
      this.apiStatus.querySelector('.api-status-icon').textContent = '✓';
      this.apiStatus.querySelector('.api-status-text').textContent = 'API已配置';
    } else {
      this.apiStatus.classList.remove('configured');
      this.apiStatus.querySelector('.api-status-icon').textContent = '⚠️';
      this.apiStatus.querySelector('.api-status-text').textContent = '请先配置API密钥';
    }
  }

  /**
   * 检查当前标签页状态
   */
  async checkCurrentTabStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab) {
        this.updateStatus('error', '无法获取当前标签页');
        this.translateBtn.disabled = true;
        return;
      }

      // 检查是否是特殊页面
      if (tab.url.startsWith('chrome://') ||
          tab.url.startsWith('chrome-extension://') ||
          tab.url.startsWith('about:')) {
        this.updateStatus('error', '此页面不支持翻译');
        this.translateBtn.disabled = true;
        return;
      }

      // 检查content script是否已加载
      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'getTranslationStatus'
        });

        if (response && response.isTranslating) {
          this.updateStatus('translating', '正在翻译...');
          this.setTranslatingState(true);
        } else {
          this.updateStatus('ready', '准备就绪');
        }
      } catch (error) {
        // Content script未加载，这是正常的
        this.updateStatus('ready', '准备就绪');
      }

    } catch (error) {
      console.error('检查标签页状态失败:', error);
    }
  }

  /**
   * 发送翻译消息（cs未加载时自动注入）
   */
  async sendTranslationMessage(tab) {
    try {
      return await chrome.tabs.sendMessage(tab.id, { action: 'startTranslation' });
    } catch (error) {
      // content script 未加载：尝试动态注入后重试
      if (error.message.includes('Receiving end does not exist') ||
          error.message.includes('Could not establish connection')) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
        } catch (injectError) {
          throw new Error('无法注入翻译模块，请刷新页面后重试');
        }
        return await chrome.tabs.sendMessage(tab.id, { action: 'startTranslation' });
      }
      throw new Error('无法连接到当前页面，请刷新后重试');
    }
  }

  /**
   * 处理翻译
   */
  async handleTranslate() {
    if (this.isTranslating) {
      return;
    }

    try {
      // 获取当前标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab) {
        this.updateStatus('error', '无法获取当前标签页');
        return;
      }

      // 检查是否可以注入脚本
      if (tab.url.startsWith('chrome://') ||
          tab.url.startsWith('chrome-extension://') ||
          tab.url.startsWith('about:')) {
        this.updateStatus('error', '此页面不支持翻译');
        return;
      }

      this.setTranslatingState(true);
      this.updateStatus('translating', '正在翻译...');

      // 发送消息给content script（cs未加载时自动注入）
      const response = await this.sendTranslationMessage(tab);

      if (!response.success) {
        throw new Error(response.error || '翻译失败');
      }

      this.updateStatus('success', '翻译完成');

      // 2秒后恢复状态
      setTimeout(() => {
        this.updateStatus('ready', '准备就绪');
      }, 2000);

    } catch (error) {
      console.error('翻译失败:', error);
      this.updateStatus('error', error.message);
      this.setTranslatingState(false);
    }
  }

  /**
   * 设置翻译状态
   */
  setTranslatingState(isTranslating) {
    this.isTranslating = isTranslating;
    this.translateBtn.disabled = isTranslating;

    if (isTranslating) {
      this.translateBtn.classList.add('btn-loading');
      this.translateBtn.querySelector('.btn-text').textContent = '翻译中...';
    } else {
      this.translateBtn.classList.remove('btn-loading');
      this.translateBtn.querySelector('.btn-text').textContent = '翻译当前页面';
    }
  }

  /**
   * 更新状态显示
   */
  updateStatus(type, message) {
    const iconMap = {
      'ready': '✓',
      'translating': '⏳',
      'success': '✓',
      'error': '✕'
    };

    const colorMap = {
      'ready': '#10b981',
      'translating': '#f59e0b',
      'success': '#10b981',
      'error': '#ef4444'
    };

    const icon = this.statusDisplay.querySelector('.status-icon');
    const text = this.statusDisplay.querySelector('.status-text');

    icon.textContent = iconMap[type] || '✓';
    icon.style.color = colorMap[type] || '#10b981';
    text.textContent = message;
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  new Popup();
});
