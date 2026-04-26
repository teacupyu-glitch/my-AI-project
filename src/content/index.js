/**
 * Content Script主入口
 * 监听消息，协调各模块工作流程
 */
import DOMExtractor from './dom-extractor.js';
import Translator from './translator.js';
import UIInjector from './ui-injector.js';
import './style.css';
import { BrowserCompat, getCurrentDomain, isExcludedDomain } from '../lib/utils.js';

class ContentScript {
  constructor() {
    this.domExtractor = new DOMExtractor();
    this.translator = new Translator();
    this.uiInjector = new UIInjector();

    this.textNodes = [];
    this.isTranslating = false;
    this.showingTranslation = true;

    // 初始化
    this.init();
  }

  /**
   * 初始化
   */
  init() {
    // 监听来自popup和background的消息
    BrowserCompat.onMessage((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
    });

    // 设置UI回调
    this.uiInjector.setUndoCallback(() => this.undoTranslation());
    this.uiInjector.setToggleCallback((btn) => this.toggleTranslation(btn));
    this.uiInjector.setCloseCallback(() => this.hideUI());

    // 设置翻译器回调
    this.translator.setProgressCallback((current, total) => {
      this.uiInjector.updateProgress(current, total);
    });

    this.translator.setErrorCallback((error) => {
      console.error('翻译错误:', error);
      this.uiInjector.updateStatus('error');
      this.uiInjector.showToast(`翻译失败: ${error.message}`);
    });

    this.translator.setCompleteCallback((stats) => {
      console.log('翻译完成:', stats);
      this.uiInjector.updateStatus('completed');
      this.uiInjector.hideLoading();

      if (stats.failed > 0) {
        this.uiInjector.showToast(`翻译完成，${stats.failed}个片段失败`);
      } else {
        this.uiInjector.showToast('翻译完成');
      }
    });

    console.log('AI翻译插件已加载');
  }

  /**
   * 处理消息
   */
  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.action) {
        case 'startTranslation':
          const result = await this.startTranslation();
          sendResponse(result);
          break;

        case 'cancelTranslation':
          const cancelResult = this.cancelTranslation();
          sendResponse(cancelResult);
          break;

        case 'undoTranslation':
          this.undoTranslation();
          sendResponse({ success: true });
          break;

        case 'toggleTranslation':
          this.toggleTranslation();
          sendResponse({ success: true });
          break;

        case 'hideUI':
          this.hideUI();
          sendResponse({ success: true });
          break;

        case 'getTranslationStatus':
          const status = this.getTranslationStatus();
          sendResponse(status);
          break;

        default:
          sendResponse({ success: false, error: '未知操作' });
      }
    } catch (error) {
      console.error('处理消息失败:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * 开始翻译
   */
  async startTranslation() {
    if (this.isTranslating) {
      return { success: false, error: '已有翻译任务在进行中' };
    }

    // 检查是否在排除域名
    const domain = getCurrentDomain();
    const config = await this.getConfig();
    if (isExcludedDomain(domain, config.excludedSites)) {
      return { success: false, error: '当前域名在排除列表中' };
    }

    try {
      this.isTranslating = true;

      // 显示UI
      this.uiInjector.injectControlBar();
      this.uiInjector.updateStatus('translating');
      this.uiInjector.showLoading();

      // 提取文本节点
      this.textNodes = this.domExtractor.extractTranslatableText();

      if (this.textNodes.length === 0) {
        throw new Error('没有找到可翻译的内容');
      }

      const stats = this.domExtractor.getTextStats(this.textNodes);
      console.log('找到文本:', stats);

      // 保存原始节点
      this.uiInjector.saveOriginalNodes(this.textNodes);

      // 初始化翻译器
      const apiConfig = await this.getAPIConfig();
      if (!apiConfig.apiKey) {
        throw new Error('API密钥未配置，请先在设置中配置');
      }

      this.translator.initAPI(apiConfig.apiKey, apiConfig.model);
      this.translator.updateConfig(config.translationSettings);

      // 开始翻译
      const result = await this.translator.translate(this.textNodes);

      if (result.success) {
        // 应用翻译结果
        this.uiInjector.applyTranslations(this.textNodes);
      }

      this.isTranslating = false;
      return result;

    } catch (error) {
      console.error('翻译失败:', error);
      this.isTranslating = false;
      this.uiInjector.updateStatus('error');
      this.uiInjector.hideLoading();

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 取消翻译
   */
  cancelTranslation() {
    const result = this.translator.cancel();
    this.isTranslating = false;

    this.uiInjector.updateStatus('ready');
    this.uiInjector.hideLoading();

    return { success: result };
  }

  /**
   * 撤销翻译
   */
  undoTranslation() {
    this.uiInjector.undoTranslations();
    this.showingTranslation = true;
  }

  /**
   * 切换显示原文/译文
   */
  toggleTranslation(btn) {
    if (btn) {
      const isShowingOriginal = btn.textContent === '显示翻译';
      this.showingTranslation = !isShowingOriginal;
      btn.textContent = isShowingOriginal ? '显示原文' : '显示翻译';
    } else {
      this.showingTranslation = !this.showingTranslation;
    }

    this.uiInjector.toggleTranslations(this.showingTranslation);
  }

  /**
   * 隐藏UI
   */
  hideUI() {
    this.uiInjector.hideControlBar();
  }

  /**
   * 获取翻译状态
   */
  getTranslationStatus() {
    const translatorStatus = this.translator.getStatus();

    return {
      isTranslating: this.isTranslating,
      textNodesCount: this.textNodes.length,
      showingTranslation: this.showingTranslation,
      translatorStatus: translatorStatus
    };
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
          resolve(result.config || {
            translationSettings: {},
            excludedSites: []
          });
        }
      });
    });
  }

  /**
   * 获取API配置
   */
  async getAPIConfig() {
    const config = await this.getConfig();
    return config.apiConfig || {};
  }
}

// 创建实例
const contentScript = new ContentScript();

// 导出（用于调试）
if (typeof window !== 'undefined') {
  window.__aiTranslationContentScript__ = contentScript;
}
