/**
 * UI注入器
 * 注入翻译控制UI，处理用户交互
 */
class UIInjector {
  constructor() {
    this.controlBar = null;
    this.originalNodes = new Map();
    this.isInjected = false;
    this.animationDuration = 300;
    this.isEditing = false;
    this.editSpans = new Map();
  }

  /**
   * 注入翻译控制条
   */
  injectControlBar() {
    if (this.isInjected) {
      this.updateControlBarVisibility(true);
      return;
    }

    try {
      // 创建控制条容器
      const container = document.createElement('div');
      container.id = 'ds-trans-control-bar';
      container.className = 'ds-trans-control-bar ds-trans-hidden';

      container.innerHTML = `
        <div class="ds-trans-status">
          <span class="ds-trans-icon">🌐</span>
          <span class="ds-trans-status-text">准备就绪</span>
          <span class="ds-trans-progress-text">0/0</span>
        </div>
        <div class="ds-trans-actions">
          <button id="ds-trans-btn-undo" class="ds-trans-btn ds-trans-btn-secondary">撤销</button>
          <button id="ds-trans-btn-toggle" class="ds-trans-btn ds-trans-btn-secondary">显示原文</button>
          <button id="ds-trans-btn-edit" class="ds-trans-btn ds-trans-btn-secondary">编辑</button>
          <button id="ds-trans-btn-close" class="ds-trans-btn ds-trans-btn-icon">✕</button>
        </div>
        <div class="ds-trans-progress-bar">
          <div class="ds-trans-progress-fill" style="width: 0%"></div>
        </div>
      `;

      // 添加到页面
      document.body.appendChild(container);
      this.controlBar = container;

      // 绑定事件
      this.bindControlEvents();

      this.isInjected = true;

      // 显示动画
      setTimeout(() => {
        container.classList.remove('ds-trans-hidden');
      }, 50);

    } catch (error) {
      console.error('注入控制条失败:', error);
    }
  }

  /**
   * 隐藏控制条
   */
  hideControlBar() {
    if (this.controlBar) {
      this.controlBar.classList.add('ds-trans-hidden');
      setTimeout(() => {
        if (this.controlBar && this.controlBar.parentNode) {
          this.controlBar.parentNode.removeChild(this.controlBar);
        }
        this.controlBar = null;
        this.isInjected = false;
      }, this.animationDuration);
    }
  }

  /**
   * 更新控制条可见性
   */
  updateControlBarVisibility(visible) {
    if (this.controlBar) {
      if (visible) {
        this.controlBar.classList.remove('ds-trans-hidden');
      } else {
        this.controlBar.classList.add('ds-trans-hidden');
      }
    }
  }

  /**
   * 更新状态
   */
  updateStatus(status, progressText = '') {
    if (!this.controlBar) return;

    const statusText = this.controlBar.querySelector('.ds-trans-status-text');
    const progressTextEl = this.controlBar.querySelector('.ds-trans-progress-text');

    if (statusText) {
      const statusMap = {
        'ready': '准备就绪',
        'translating': '正在翻译...',
        'completed': '翻译完成',
        'error': '翻译失败'
      };
      statusText.textContent = statusMap[status] || status;
    }

    if (progressTextEl) {
      progressTextEl.textContent = progressText;
    }
  }

  /**
   * 更新进度
   */
  updateProgress(current, total) {
    if (!this.controlBar) return;

    const progressFill = this.controlBar.querySelector('.ds-trans-progress-fill');
    const progressText = this.controlBar.querySelector('.ds-trans-progress-text');

    if (progressFill) {
      const percentage = total > 0 ? (current / total) * 100 : 0;
      progressFill.style.width = percentage + '%';
    }

    if (progressText) {
      progressText.textContent = `${current}/${total}`;
    }
  }

  /**
   * 绑定控制事件
   */
  bindControlEvents() {
    if (!this.controlBar) return;

    // 撤销按钮
    const undoBtn = document.getElementById('ds-trans-btn-undo');
    if (undoBtn) {
      undoBtn.addEventListener('click', () => {
        this.onUndoClick && this.onUndoClick();
      });
    }

    // 切换按钮
    const toggleBtn = document.getElementById('ds-trans-btn-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        this.onToggleClick && this.onToggleClick(toggleBtn);
      });
    }

    // 编辑按钮
    const editBtn = document.getElementById('ds-trans-btn-edit');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        if (this.isEditing) {
          this.onEditFinish && this.onEditFinish();
        } else {
          this.onEditStart && this.onEditStart();
        }
      });
    }

    // 关闭按钮
    const closeBtn = document.getElementById('ds-trans-btn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.onCloseClick && this.onCloseClick();
      });
    }
  }

  /**
   * 保存原始节点
   */
  saveOriginalNodes(textNodes) {
    this.originalNodes.clear();

    for (const nodeInfo of textNodes) {
      if (nodeInfo.node) {
        this.originalNodes.set(nodeInfo.node, {
          originalText: nodeInfo.originalText,
          translatedText: nodeInfo.translatedText,
          id: nodeInfo.id
        });
      }
    }
  }

  /**
   * 应用翻译结果
   */
  applyTranslations(textNodes) {
    for (const nodeInfo of textNodes) {
      if (!nodeInfo.node || !nodeInfo.translated) continue;
      nodeInfo.node.textContent = nodeInfo.translatedText;

      // 同步更新 Map 中的译文，确保切换显示原文/译文时可用
      const saved = this.originalNodes.get(nodeInfo.node);
      if (saved) {
        saved.translatedText = nodeInfo.translatedText;
      }
    }
  }

  /**
   * 撤销翻译
   */
  undoTranslations() {
    if (this.isEditing) this.exitEditMode(false);

    this.originalNodes.forEach((value, node) => {
      node.textContent = value.originalText;
    });

    const toggleBtn = document.getElementById('ds-trans-btn-toggle');
    if (toggleBtn) {
      toggleBtn.textContent = '显示原文';
    }
  }

  /**
   * 切换显示原文/译文
   */
  toggleTranslations(showTranslation) {
    if (this.isEditing) this.exitEditMode(false);

    this.originalNodes.forEach((value, node) => {
      node.textContent = showTranslation
        ? (value.translatedText || value.originalText)
        : value.originalText;
    });
  }

  /**
   * 设置撤销回调
   */
  setUndoCallback(callback) {
    this.onUndoClick = callback;
  }

  /**
   * 设置切换回调
   */
  setToggleCallback(callback) {
    this.onToggleClick = callback;
  }

  /**
   * 设置关闭回调
   */
  setCloseCallback(callback) {
    this.onCloseClick = callback;
  }

  /**
   * 设置编辑模式回调
   */
  setEditCallback(onStart, onFinish) {
    this.onEditStart = onStart;
    this.onEditFinish = onFinish;
  }

  /**
   * 进入编辑模式 — 将已翻译的 TextNode 替换为 contenteditable span
   */
  enterEditMode() {
    if (this.isEditing) return;

    // 只在显示译文状态下进入编辑
    this.editSpans.clear();

    this.originalNodes.forEach((value, textNode) => {
      if (!textNode.parentNode) return;
      if (!value.translatedText) return;

      const span = document.createElement('span');
      span.className = 'ds-trans-editable';
      span.contentEditable = 'true';
      span.textContent = textNode.textContent;

      textNode.replaceWith(span);
      this.editSpans.set(span, {
        textNode,
        originalText: value.originalText,
        translatedText: value.translatedText
      });
    });

    this.isEditing = true;

    const editBtn = document.getElementById('ds-trans-btn-edit');
    if (editBtn) {
      editBtn.textContent = '完成';
      editBtn.classList.add('ds-trans-btn-editing');
    }
  }

  /**
   * 退出编辑模式 — span 替换回 TextNode
   * @param {boolean} save - 是否保存编辑结果
   */
  exitEditMode(save = true) {
    if (!this.isEditing) return;

    this.editSpans.forEach((info, span) => {
      if (!span.parentNode) return;

      const editedText = save ? span.textContent : info.translatedText;
      const newTextNode = document.createTextNode(editedText);

      span.replaceWith(newTextNode);

      // 更新 originalNodes Map（键切换为新 TextNode）
      this.originalNodes.delete(info.textNode);
      this.originalNodes.set(newTextNode, {
        originalText: info.originalText,
        translatedText: editedText,
        id: info.textNode.id
      });
    });

    this.editSpans.clear();
    this.isEditing = false;

    const editBtn = document.getElementById('ds-trans-btn-edit');
    if (editBtn) {
      editBtn.textContent = '编辑';
      editBtn.classList.remove('ds-trans-btn-editing');
    }
  }

  /**
   * 显示提示消息
   */
  showToast(message, duration = 3000) {
    // 移除已有的toast
    const existingToast = document.getElementById('ds-trans-toast');
    if (existingToast) {
      existingToast.remove();
    }

    // 创建toast
    const toast = document.createElement('div');
    toast.id = 'ds-trans-toast';
    toast.className = 'ds-trans-toast';
    toast.textContent = message;

    document.body.appendChild(toast);

    // 显示动画
    setTimeout(() => {
      toast.classList.add('ds-trans-toast-visible');
    }, 50);

    // 自动隐藏
    setTimeout(() => {
      toast.classList.remove('ds-trans-toast-visible');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, this.animationDuration);
    }, duration);
  }

  /**
   * 显示加载指示器
   */
  showLoading() {
    if (!this.controlBar) return;

    const icon = this.controlBar.querySelector('.ds-trans-icon');
    if (icon) {
      icon.classList.add('ds-trans-icon-spinning');
    }
  }

  /**
   * 隐藏加载指示器
   */
  hideLoading() {
    if (!this.controlBar) return;

    const icon = this.controlBar.querySelector('.ds-trans-icon');
    if (icon) {
      icon.classList.remove('ds-trans-icon-spinning');
    }
  }

  /**
   * 销毁UI
   */
  destroy() {
    this.hideControlBar();
    this.originalNodes.clear();
    this.isInjected = false;
  }
}

// 导出
export default UIInjector;
