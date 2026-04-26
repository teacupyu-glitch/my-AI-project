/**
 * Options页面逻辑
 */
import { BrowserCompat } from '../lib/utils.js';

class Options {
  constructor() {
    // API配置
    this.apiKeyInput = document.getElementById('apiKey');
    this.modelSelect = document.getElementById('modelSelect');
    this.validateBtn = document.getElementById('validateBtn');
    this.saveApiBtn = document.getElementById('saveApiBtn');
    this.apiMessage = document.getElementById('apiMessage');

    // 翻译设置
    this.targetLangSelect = document.getElementById('targetLang');
    this.autoDetectCheckbox = document.getElementById('autoDetect');
    this.saveTranslationBtn = document.getElementById('saveTranslationBtn');

    // 高级设置
    this.maxChunkSizeInput = document.getElementById('maxChunkSize');
    this.concurrencyInput = document.getElementById('concurrency');
    this.temperatureInput = document.getElementById('temperature');
    this.saveAdvancedBtn = document.getElementById('saveAdvancedBtn');

    // 排除网站
    this.excludedSitesTextarea = document.getElementById('excludedSites');
    this.saveExcludedBtn = document.getElementById('saveExcludedBtn');

    // 重置
    this.resetBtn = document.getElementById('resetBtn');

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
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // API配置
    this.validateBtn.addEventListener('click', () => this.validateApiKey());
    this.saveApiBtn.addEventListener('click', () => this.saveApiConfig());

    // 翻译设置
    this.saveTranslationBtn.addEventListener('click', () => this.saveTranslationSettings());

    // 高级设置
    this.saveAdvancedBtn.addEventListener('click', () => this.saveAdvancedSettings());

    // 排除网站
    this.saveExcludedBtn.addEventListener('click', () => this.saveExcludedSites());

    // 重置
    this.resetBtn.addEventListener('click', () => this.resetAll());
  }

  /**
   * 加载配置
   */
  async loadConfig() {
    try {
      const config = await this.getConfig();

      // API配置
      if (config.apiConfig) {
        if (config.apiConfig.apiKey) {
          this.apiKeyInput.value = config.apiConfig.apiKey;
        }
        if (config.apiConfig.model) {
          this.modelSelect.value = config.apiConfig.model;
        }
      }

      // 翻译设置
      if (config.translationSettings) {
        if (config.translationSettings.targetLang) {
          this.targetLangSelect.value = config.translationSettings.targetLang;
        }
        if (config.translationSettings.autoDetect !== undefined) {
          this.autoDetectCheckbox.checked = config.translationSettings.autoDetect;
        }
      }

      // 高级设置
      if (config.translationSettings) {
        if (config.translationSettings.maxChunkSize) {
          this.maxChunkSizeInput.value = config.translationSettings.maxChunkSize;
        }
        if (config.translationSettings.concurrency) {
          this.concurrencyInput.value = config.translationSettings.concurrency;
        }
        if (config.translationSettings.temperature !== undefined) {
          this.temperatureInput.value = config.translationSettings.temperature;
        }
      }

      // 排除网站
      if (config.excludedSites && Array.isArray(config.excludedSites)) {
        this.excludedSitesTextarea.value = config.excludedSites.join('\n');
      }

    } catch (error) {
      console.error('加载配置失败:', error);
      this.showMessage('加载配置失败', 'error');
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
   * 验证API密钥
   */
  async validateApiKey() {
    const apiKey = this.apiKeyInput.value.trim();

    if (!apiKey) {
      this.showMessage('请输入API密钥', 'error');
      return;
    }

    this.setButtonLoading(this.validateBtn, true);

    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'user',
              content: 'Hello'
            }
          ],
          max_tokens: 10
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || '验证失败');
      }

      this.showMessage('API密钥验证成功！', 'success');

    } catch (error) {
      console.error('验证失败:', error);
      this.showMessage(`验证失败: ${error.message}`, 'error');
    } finally {
      this.setButtonLoading(this.validateBtn, false);
    }
  }

  /**
   * 保存API配置
   */
  async saveApiConfig() {
    const apiKey = this.apiKeyInput.value.trim();
    const model = this.modelSelect.value;

    if (!apiKey) {
      this.showMessage('请输入API密钥', 'error');
      return;
    }

    try {
      const config = await this.getConfig();

      config.apiConfig = {
        ...config.apiConfig,
        apiKey: apiKey,
        model: model
      };

      await this.saveConfig(config);
      this.showMessage('API配置已保存', 'success');

    } catch (error) {
      console.error('保存失败:', error);
      this.showMessage(`保存失败: ${error.message}`, 'error');
    }
  }

  /**
   * 保存翻译设置
   */
  async saveTranslationSettings() {
    try {
      const config = await this.getConfig();

      config.translationSettings = {
        ...config.translationSettings,
        targetLang: this.targetLangSelect.value,
        autoDetect: this.autoDetectCheckbox.checked
      };

      await this.saveConfig(config);
      this.showMessage('翻译设置已保存', 'success');

    } catch (error) {
      console.error('保存失败:', error);
      this.showMessage(`保存失败: ${error.message}`, 'error');
    }
  }

  /**
   * 保存高级设置
   */
  async saveAdvancedSettings() {
    try {
      const config = await this.getConfig();

      config.translationSettings = {
        ...config.translationSettings,
        maxChunkSize: parseInt(this.maxChunkSizeInput.value),
        concurrency: parseInt(this.concurrencyInput.value),
        temperature: parseFloat(this.temperatureInput.value)
      };

      await this.saveConfig(config);
      this.showMessage('高级设置已保存', 'success');

    } catch (error) {
      console.error('保存失败:', error);
      this.showMessage(`保存失败: ${error.message}`, 'error');
    }
  }

  /**
   * 保存排除网站
   */
  async saveExcludedSites() {
    try {
      const sites = this.excludedSitesTextarea.value
        .split('\n')
        .map(site => site.trim())
        .filter(site => site.length > 0);

      const config = await this.getConfig();
      config.excludedSites = sites;

      await this.saveConfig(config);
      this.showMessage('排除列表已保存', 'success');

    } catch (error) {
      console.error('保存失败:', error);
      this.showMessage(`保存失败: ${error.message}`, 'error');
    }
  }

  /**
   * 保存配置
   */
  async saveConfig(config) {
    return new Promise((resolve, reject) => {
      BrowserCompat.getStorage().local.set({ config }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 重置所有设置
   */
  async resetAll() {
    if (!confirm('确定要重置所有设置吗？此操作不可恢复。')) {
      return;
    }

    try {
      await new Promise((resolve, reject) => {
        BrowserCompat.getStorage().local.clear(() => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      // 重新加载页面
      location.reload();

    } catch (error) {
      console.error('重置失败:', error);
      this.showMessage(`重置失败: ${error.message}`, 'error');
    }
  }

  /**
   * 显示消息
   */
  showMessage(message, type = 'info') {
    this.apiMessage.textContent = message;
    this.apiMessage.className = 'message-box show ' + type;

    // 3秒后自动隐藏
    setTimeout(() => {
      this.apiMessage.classList.remove('show');
    }, 3000);
  }

  /**
   * 设置按钮加载状态
   */
  setButtonLoading(button, isLoading) {
    if (isLoading) {
      button.classList.add('btn-loading');
      button.disabled = true;
    } else {
      button.classList.remove('btn-loading');
      button.disabled = false;
    }
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  new Options();
});
