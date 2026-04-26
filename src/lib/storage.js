/**
 * 存储管理模块
 * 管理用户配置和插件状态
 */
class StorageManager {
  constructor() {
    this.defaults = {
      apiConfig: {
        provider: 'deepseek',
        apiKey: '',
        model: 'deepseek-chat',
        endpoint: 'https://api.deepseek.com/chat/completions'
      },
      translationSettings: {
        sourceLang: 'auto',
        targetLang: 'zh-CN',
        autoDetect: true,
        maxChunkSize: 2000,
        concurrency: 3,
        temperature: 0.3
      },
      uiSettings: {
        showProgress: true,
        showControlBar: true,
        animationDuration: 300
      },
      excludedSites: [
        'github.com',
        'stackoverflow.com',
        'localhost'
      ]
    };
  }

  /**
   * 获取浏览器存储API
   */
  getStorage() {
    return typeof browser !== 'undefined' ? browser.storage : chrome.storage;
  }

  /**
   * 保存配置
   */
  async saveConfig(config) {
    const current = await this.getConfig();
    const merged = this.deepMerge(current, config);

    return new Promise((resolve, reject) => {
      this.getStorage().local.set({ config: merged }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(merged);
        }
      });
    });
  }

  /**
   * 获取配置
   */
  async getConfig() {
    return new Promise((resolve, reject) => {
      this.getStorage().local.get('config', (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result.config || this.defaults);
        }
      });
    });
  }

  /**
   * 获取API配置
   */
  async getAPIConfig() {
    const config = await this.getConfig();
    return config.apiConfig;
  }

  /**
   * 保存API密钥
   */
  async saveAPIKey(apiKey, model = 'deepseek-chat') {
    const config = await this.getConfig();
    config.apiConfig.apiKey = apiKey;
    config.apiConfig.model = model;

    return this.saveConfig(config);
  }

  /**
   * 保存翻译设置
   */
  async saveTranslationSettings(settings) {
    const config = await this.getConfig();
    config.translationSettings = { ...config.translationSettings, ...settings };

    return this.saveConfig(config);
  }

  /**
   * 保存UI设置
   */
  async saveUISettings(settings) {
    const config = await this.getConfig();
    config.uiSettings = { ...config.uiSettings, ...settings };

    return this.saveConfig(config);
  }

  /**
   * 验证API密钥
   */
  async validateAPIKey(apiKey) {
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
        return {
          success: false,
          error: error.error?.message || 'API验证失败'
        };
      }

      return {
        success: true,
        message: 'API密钥验证成功'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || '网络连接失败'
      };
    }
  }

  /**
   * 清除配置
   */
  async clearConfig() {
    return new Promise((resolve, reject) => {
      this.getStorage().local.clear(() => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 深度合并对象
   */
  deepMerge(target, source) {
    const output = Object.assign({}, target);

    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }

    return output;
  }

  /**
   * 检查是否为对象
   */
  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }
}

// 导出单例
export const storageManager = new StorageManager();
export default StorageManager;
