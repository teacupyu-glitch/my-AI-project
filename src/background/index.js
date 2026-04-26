/**
 * Background Service Worker
 * 处理跨域请求，管理插件状态
 */

// 插件安装时
chrome.runtime.onInstalled.addListener((details) => {
  console.log('AI翻译插件已安装', details.reason);

  if (details.reason === 'install') {
    // 首次安装，打开设置页面
    chrome.runtime.openOptionsPage();

    // 设置默认配置
    setDefaultConfig();
  } else if (details.reason === 'update') {
    // 更新版本
    console.log('插件已更新到版本:', chrome.runtime.getManifest().version);
  }
});

// 设置默认配置
async function setDefaultConfig() {
  const defaults = {
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

  try {
    await chrome.storage.local.set({ config: defaults });
    console.log('默认配置已设置');
  } catch (error) {
    console.error('设置默认配置失败:', error);
  }
}

// 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('收到消息:', message);

  handle_message(message, sender)
    .then(response => sendResponse(response))
    .catch(error => {
      console.error('处理消息失败:', error);
      sendResponse({ success: false, error: error.message });
    });

  return true; // 保持消息通道开放以支持异步响应
});

// 处理消息
async function handle_message(message, sender) {
  switch (message.action) {
    case 'getConfig':
      return await getConfig();

    case 'saveConfig':
      return await saveConfig(message.config);

    case 'validateAPIKey':
      return await validateAPIKey(message.apiKey);

    case 'getTranslationStatus':
      return await getTranslationStatus(message.tabId);

    default:
      return { success: false, error: '未知操作' };
  }
}

// 获取配置
async function getConfig() {
  try {
    const result = await chrome.storage.local.get('config');
    return {
      success: true,
      config: result.config || {}
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// 保存配置
async function saveConfig(config) {
  try {
    await chrome.storage.local.set({ config });
    return {
      success: true,
      message: '配置已保存'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// 验证API密钥
async function validateAPIKey(apiKey) {
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
        error: error.error?.message || '验证失败'
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

// 获取翻译状态
async function getTranslationStatus(tabId) {
  try {
    // 发送消息给content script获取状态
    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'getTranslationStatus'
    });

    return {
      success: true,
      status: response
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// 监听标签页更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 页面加载完成时，可以进行一些初始化操作
  if (changeInfo.status === 'complete' && tab.url) {
    // 排除特殊页面
    if (!tab.url.startsWith('chrome://') &&
        !tab.url.startsWith('chrome-extension://') &&
        !tab.url.startsWith('about:')) {
      console.log('页面加载完成:', tab.url);
    }
  }
});

// 监听插件图标点击
chrome.action.onClicked.addListener((tab) => {
  // 打开popup（如果定义了default_popup则不会触发此事件）
  console.log('插件图标被点击:', tab.id);
});

// 监听存储变化
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.config) {
    console.log('配置已更新');

    // 通知所有content script配置已更新
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.url && !tab.url.startsWith('chrome://') &&
            !tab.url.startsWith('chrome-extension://') &&
            !tab.url.startsWith('about:')) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'configUpdated',
            config: changes.config.newValue
          }).catch(() => {
            // 忽略错误（content script可能未加载）
          });
        }
      });
    });
  }
});

console.log('Background service worker已加载');
