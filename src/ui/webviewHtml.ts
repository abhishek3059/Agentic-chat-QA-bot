/**
 * Generates the HTML, CSS, and JavaScript for the QA Assistant Webview View (Sidebar).
 * Uses strict theme-native CSS variables and responsive flex layouts for narrow panes.
 * Brand mark is inlined from ./qaMark (single source of truth, ADR-019) so no
 * external asset loading is needed under the strict webview CSP.
 */
import { qaMarkSvg } from './qaMark';

export function getWebviewHtml(cspSource: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QA Assistant</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-editor-foreground);
      background-color: var(--vscode-sideBar-background);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    /* Top Context Preview Header */
    #context-header {
      background: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--vscode-panel-border);
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex-shrink: 0;
    }

    .context-top-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 4px;
    }

    .context-left-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .context-badge {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .context-stats-badge {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      display: none;
    }

    .context-btn-group {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .btn-secondary {
      font-size: 11px;
      padding: 3px 6px;
      border: 1px solid var(--vscode-button-secondaryBackground);
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border-radius: 4px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .btn-secondary:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }

    #context-preview {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      word-break: break-word;
      background: var(--vscode-editorWidget-background);
      padding: 4px 6px;
      border-radius: 4px;
      border-left: 2px solid var(--vscode-focusBorder);
    }

    .key-indicator {
      display: inline-block; width: 6px; height: 6px; border-radius: 50%;
      background-color: var(--vscode-testing-iconFailed);
    }
    .key-indicator.configured { background-color: var(--vscode-testing-iconPassed); }

    /* Chips */
    #chips-bar {
      display: none; padding: 6px 10px; gap: 4px; overflow-x: auto;
      background: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    #chips-bar.active { display: flex; }
    
    .chip-btn {
      font-size: 10px; padding: 2px 6px; border-radius: 10px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid transparent; cursor: pointer; white-space: nowrap;
    }
    .chip-btn:hover { border-color: var(--vscode-focusBorder); }

    /* Brand mark (small icon, theme-linked via currentColor) */
    .brand-mark { display: inline-flex; color: var(--vscode-badge-foreground); }
    .card-mark { display: inline-flex; margin-right: 4px; vertical-align: -2px; }

    /* Watermark (large, faint, fixed atmosphere layer — ADR-019) */
    .qa-watermark {
      position: fixed; right: -70px; bottom: -70px;
      width: 300px; height: 300px;
      opacity: 0.05; pointer-events: none;
      color: var(--vscode-editor-foreground);
      z-index: 0;
    }
    @media (forced-colors: active) {
      .qa-watermark { display: none; }
    }

    /* Chat Thread */
    #chat-thread {
      flex: 1; overflow-y: auto; padding: 10px;
      display: flex; flex-direction: column; gap: 12px;
    }

    
    .chat-message { display: flex; flex-direction: column; max-width: 95%; position: relative; z-index: 1; }
    .chat-message.user { align-self: flex-end; }
    .chat-message.assistant { align-self: flex-start; width: 100%; }

    .chat-message.user .message-bubble {
      padding: 8px 10px; border-radius: 10px 10px 2px 10px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      word-break: break-word;
    }

    .assistant-card {
      background: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      overflow: hidden;
    }

    .assistant-card-header {
      display: flex; justify-content: space-between; padding: 4px 8px;
      background: var(--vscode-editorWidget-background);
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .bot-title { font-size: 10px; font-weight: bold; color: var(--vscode-editor-foreground); }
    .grounded-tag { font-size: 9px; color: var(--vscode-testing-iconPassed); border: 1px solid var(--vscode-testing-iconPassed); padding: 1px 4px; border-radius: 3px; }

    .assistant-card-body { padding: 8px 10px; line-height: 1.5; font-size: 12px; }
    .assistant-card-body p { margin-bottom: 8px; }
    .assistant-card-body p:last-child { margin-bottom: 0; }

    /* Markdown */
    .strong-text { font-weight: bold; }
    .inline-code {
      font-family: var(--vscode-editor-font-family); font-size: 0.9em;
      padding: 1px 4px; border-radius: 3px; background: var(--vscode-textCodeBlock-background);
    }
    .code-block-wrapper {
      margin: 8px 0; border: 1px solid var(--vscode-panel-border); border-radius: 4px;
      background: var(--vscode-editor-background); overflow: hidden;
    }
    .code-block-header {
      display: flex; justify-content: space-between; padding: 4px 8px;
      background: var(--vscode-editorWidget-background); border-bottom: 1px solid var(--vscode-panel-border);
    }
    .code-lang-label { font-size: 9px; text-transform: uppercase; color: var(--vscode-descriptionForeground); }
    .code-pre { padding: 8px; margin: 0; overflow-x: auto; font-family: var(--vscode-editor-font-family); font-size: 11px; }
    .styled-list { list-style-position: inside; margin-left: 8px; margin-bottom: 8px; }
    .message-meta { font-size: 9px; color: var(--vscode-descriptionForeground); margin-top: 2px; text-align: right; }

    /* Input Footer */
    #input-footer {
      border-top: 1px solid var(--vscode-panel-border);
      padding: 10px 14px;
      background: var(--vscode-sideBar-background);
      flex-shrink: 0;
    }
    #input-container {
      display: flex;
      flex-direction: column;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 8px;
      padding: 8px 10px;
      transition: border-color 0.15s ease;
    }
    #input-container:focus-within {
      border-color: var(--vscode-focusBorder);
    }
    #main-input {
      width: 100%;
      resize: none;
      min-height: 24px;
      max-height: 150px;
      background: transparent;
      border: none;
      color: var(--vscode-input-foreground);
      font-family: inherit;
      font-size: 13px;
      outline: none;
      padding: 0;
      margin-bottom: 8px;
    }
    .input-actions-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .model-selector {
      position: relative;
      display: inline-flex;
    }
    .model-selector-trigger {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      padding: 4px 6px;
      border-radius: 4px;
      background: transparent;
      border: none;
      font-family: inherit;
    }
    .model-selector-trigger:hover {
      background: var(--vscode-toolbar-hoverBackground);
      color: var(--vscode-editor-foreground);
    }
    /* Model picker dropdown. Anchored to the footer selector, so it opens
       upward (bottom: 100%) — a downward menu would render off-screen. */
    .model-dropdown {
      position: absolute;
      bottom: calc(100% + 4px);
      left: 0;
      min-width: 220px;
      max-width: 320px;
      max-height: 260px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--vscode-dropdown-background);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 6px;
      z-index: 100;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    }
    .model-dropdown.hidden { display: none; }
    .model-filter {
      margin: 6px 6px 2px;
      padding: 4px 8px;
      font-size: 12px;
      font-family: inherit;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 3px;
    }
    .model-filter.hidden { display: none; }
    .model-list {
      list-style: none;
      padding: 4px 0;
      margin: 0;
      overflow-y: auto;
    }
    .model-list li {
      padding: 6px 10px;
      font-size: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .model-list li:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .model-list li.selected {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }
    .model-list .model-text {
      display: flex;
      flex-direction: column;
      gap: 1px;
      flex: 1;
      min-width: 0;
    }
    .model-list .model-id { font-weight: 500; word-break: break-all; }
    .model-list .model-name { font-size: 10px; color: var(--vscode-descriptionForeground); }
    .model-star {
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 0 2px;
      font-size: 13px;
      line-height: 1;
      color: var(--vscode-descriptionForeground);
      opacity: 0.55;
      flex-shrink: 0;
    }
    .model-star:hover { opacity: 1; }
    .model-star.active { opacity: 1; }
    .model-count {
      padding: 3px 8px;
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      border-top: 1px solid var(--vscode-panel-border);
    }
    .model-count.hidden { display: none; }
    .model-loading {
      padding: 12px;
      text-align: center;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .model-loading.hidden { display: none; }
    .spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid var(--vscode-descriptionForeground);
      border-top-color: transparent;
      border-radius: 50%;
      animation: model-spin 0.8s linear infinite;
    }
    @keyframes model-spin { to { transform: rotate(360deg); } }
    .model-fallback {
      padding: 6px;
      display: flex;
      gap: 4px;
    }
    .model-fallback.hidden { display: none; }
    .model-fallback input {
      flex: 1;
      min-width: 0;
      padding: 4px 8px;
      font-size: 12px;
      font-family: inherit;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 3px;
    }
    #main-action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      cursor: pointer;
    }
    #main-action-btn:hover:not(:disabled) {
      background: var(--vscode-button-hoverBackground);
    }
    #main-action-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Streaming / Loading */
    .streaming-cursor {
      display: inline-block; width: 5px; height: 12px; background: var(--vscode-editor-foreground);
      animation: blink 0.8s infinite; margin-left: 2px; vertical-align: middle;
    }
    @keyframes blink { 0%, 100% {opacity:1;} 50% {opacity:0;} }
    #loading-indicator { display: none; padding: 8px 10px; color: var(--vscode-descriptionForeground); font-size: 11px; }
    #loading-indicator.active { display: block; }
    #error-banner { display: none; padding: 6px; background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-inputValidation-errorForeground); margin: 6px 10px 0; border-radius: 4px; font-size: 11px; }
    #error-banner.active { display: block; }
  </style>
</head>
<body>

  <!-- Top Context Preview -->
  <div id="context-header">
    <div class="context-top-row">
      <div class="context-left-group">
        <span class="brand-mark">${qaMarkSvg(16)}</span>
        <span class="context-badge">Scoped Context</span>
        <span id="context-stats" class="context-stats-badge"></span>
      </div>
      <div class="context-btn-group">
        <button id="paste-clipboard-btn" class="btn-secondary" title="📋 Paste Clipboard">📋</button>
        <button id="api-key-btn" class="btn-secondary" title="🔑 API Key">
          <span id="key-indicator" class="key-indicator"></span> 🔑
        </button>
        <button id="new-context-btn" class="btn-secondary" title="🔄 New context">🔄</button>
      </div>
    </div>
    <div id="context-preview">
      Waiting for context... Paste below or click "📋" above to begin.
    </div>
  </div>

  <div id="chips-bar">
    <button class="chip-btn" data-query="Explain simply.">Explain simply</button>
    <button class="chip-btn" data-query="Show implementation.">Show implementation</button>
  </div>

  <div id="error-banner">
    <span id="error-message"></span>
  </div>

  <div class="qa-watermark" aria-hidden="true">${qaMarkSvg(300, '')}</div>

  <div id="chat-thread"></div>

  <div id="loading-indicator">Thinking...</div>

  <!-- Input Area -->
  <div id="input-footer">
    <div id="input-container">
      <textarea id="main-input" rows="1" placeholder="Paste context here..."></textarea>
      <div class="input-actions-row">
        <div class="model-selector" id="model-selector">
          <div class="model-selector-trigger" id="model-selector-btn" title="Change Model" role="button" tabindex="0">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5l1.8 3.7c.2.3.5.5.8.6l3.9.9-2.9 2.5c-.2.2-.3.6-.3.9l.9 3.8-3.4-2.1c-.3-.2-.7-.2-1 0l-3.4 2.1.9-3.8c.1-.3 0-.7-.3-.9L2 6.7l3.9-.9c.3-.1.6-.3.8-.6L8 1.5z"/></svg>
            <span id="current-model-name">deepseek-chat</span>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M12.2 5.8L8 10 3.8 5.8l-.7.7 4.9 4.9 4.9-4.9z"/></svg>
          </div>
          <div id="model-dropdown" class="model-dropdown hidden">
            <div id="model-loading" class="model-loading hidden"><span class="spinner"></span>Loading models...</div>
            <input id="model-filter" class="model-filter hidden" type="text" placeholder="Search models..." />
            <ul id="model-list" class="model-list"></ul>
            <div id="model-count" class="model-count hidden"></div>
            <div id="model-fallback" class="model-fallback hidden">
              <input id="model-custom-input" type="text" placeholder="Type model ID..." />
              <button id="model-custom-save" class="btn-secondary">Use</button>
            </div>
          </div>
        </div>
        <button id="main-action-btn" title="Scope Context">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1L15 8L14.3 8.7L8.5 2.9V15H7.5V2.9L1.7 8.7L1 8L8 1Z"/></svg>
        </button>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    const contextPreviewEl = document.getElementById('context-preview');
    const contextStatsEl = document.getElementById('context-stats');
    const chipsBarEl = document.getElementById('chips-bar');
    const apiKeyBtn = document.getElementById('api-key-btn');
    const keyIndicatorEl = document.getElementById('key-indicator');
    const pasteClipboardBtn = document.getElementById('paste-clipboard-btn');
    const newContextBtn = document.getElementById('new-context-btn');
    
    const chatThreadEl = document.getElementById('chat-thread');
    const mainInputEl = document.getElementById('main-input');
    const mainActionBtn = document.getElementById('main-action-btn');
    const modelSelectorBtn = document.getElementById('model-selector-btn');
    const currentModelNameEl = document.getElementById('current-model-name');
    
    const modelSelectorEl = document.getElementById('model-selector');
    const modelDropdownEl = document.getElementById('model-dropdown');
    const modelLoadingEl = document.getElementById('model-loading');
    const modelFilterEl = document.getElementById('model-filter');
    const modelListEl = document.getElementById('model-list');
    const modelFallbackEl = document.getElementById('model-fallback');
    const modelCustomInputEl = document.getElementById('model-custom-input');
    const modelCustomSaveBtn = document.getElementById('model-custom-save');
    const modelCountEl = document.getElementById('model-count');
    let modelDropdownOpen = false;
    let currentFullModelId = '';
    let allModels = [];

    // Favorite model ids, persisted across sidebar sessions via webview state.
    let favoriteIds = [];
    try {
      const saved = vscode.getState();
      if (saved && typeof saved.favoriteModelIds === 'string') {
        const parsed = JSON.parse(saved.favoriteModelIds);
        if (Array.isArray(parsed)) { favoriteIds = parsed.filter((id) => typeof id === 'string'); }
      }
    } catch (e) { favoriteIds = []; }

    function saveFavorites() {
      try {
        const state = vscode.getState() || {};
        state.favoriteModelIds = JSON.stringify(favoriteIds);
        vscode.setState(state);
      } catch (e) { /* state unavailable, favorites last for this session only */ }
    }

    function closeModelDropdown() {
      modelDropdownOpen = false;
      modelDropdownEl.classList.add('hidden');
    }

    function openModelDropdown() {
      modelDropdownOpen = true;
      modelDropdownEl.classList.remove('hidden');
      vscode.postMessage({ type: 'fetchModels' });
    }

    modelSelectorBtn.addEventListener('click', () => {
      if (modelDropdownOpen) { closeModelDropdown(); }
      else { openModelDropdown(); }
    });
    modelSelectorBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); modelSelectorBtn.click(); }
      if (e.key === 'Escape') { closeModelDropdown(); }
    });
    document.addEventListener('click', (e) => {
      if (modelDropdownOpen && modelSelectorEl && !modelSelectorEl.contains(e.target)) {
        closeModelDropdown();
      }
    });

    function isFavorite(modelId) { return favoriteIds.indexOf(modelId) !== -1; }

    function matchesQuery(m, query) {
      if (!query) { return true; }
      if (m.id.toLowerCase().indexOf(query) !== -1) { return true; }
      return Boolean(m.name && m.name.toLowerCase().indexOf(query) !== -1);
    }

    function appendModelRow(m) {
      const li = document.createElement('li');
      if (m.id === currentFullModelId) { li.classList.add('selected'); }

      const starBtn = document.createElement('button');
      const favored = isFavorite(m.id);
      starBtn.className = 'model-star' + (favored ? ' active' : '');
      starBtn.textContent = favored ? '★' : '☆';
      starBtn.title = favored ? 'Unpin model' : 'Pin model to top';
      starBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isFavorite(m.id)) { favoriteIds = favoriteIds.filter((id) => id !== m.id); }
        else { favoriteIds.push(m.id); }
        saveFavorites();
        renderFilteredModels();
      });

      const textDiv = document.createElement('div');
      textDiv.className = 'model-text';
      const idSpan = document.createElement('span');
      idSpan.className = 'model-id';
      idSpan.textContent = m.id;
      textDiv.appendChild(idSpan);
      if (m.name && m.name !== m.id) {
        const nameSpan = document.createElement('span');
        nameSpan.className = 'model-name';
        nameSpan.textContent = m.name;
        textDiv.appendChild(nameSpan);
      }

      li.appendChild(starBtn);
      li.appendChild(textDiv);
      li.addEventListener('click', () => {
        vscode.postMessage({ type: 'changeModel', modelId: m.id });
        closeModelDropdown();
      });
      modelListEl.appendChild(li);
    }

    function updateModelCount(shown, total, query) {
      modelCountEl.textContent = query ? (shown + ' of ' + total + ' models') : (total + ' models');
      modelCountEl.classList.remove('hidden');
    }

    // Re-renders the list from allModels: favorites first, then the rest,
    // each group alphabetical; the filter query narrows both groups.
    function renderFilteredModels() {
      const query = modelFilterEl.value.toLowerCase().trim();
      const favored = [];
      const rest = [];
      allModels.forEach((m) => {
        if (!matchesQuery(m, query)) { return; }
        if (isFavorite(m.id)) { favored.push(m); } else { rest.push(m); }
      });
      modelListEl.innerHTML = '';
      favored.forEach(appendModelRow);
      rest.forEach(appendModelRow);
      updateModelCount(favored.length + rest.length, allModels.length, query);
    }

    let filterDebounce = null;
    modelFilterEl.addEventListener('input', () => {
      if (filterDebounce) { clearTimeout(filterDebounce); }
      filterDebounce = setTimeout(renderFilteredModels, 150);
    });
    modelFilterEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeModelDropdown(); }
    });
    modelCustomSaveBtn.addEventListener('click', () => {
      const customId = modelCustomInputEl.value.trim();
      if (customId) {
        vscode.postMessage({ type: 'changeModel', modelId: customId });
        closeModelDropdown();
      }
    });
    modelCustomInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { modelCustomSaveBtn.click(); }
    });
    
    const loadingIndicatorEl = document.getElementById('loading-indicator');
    const errorBannerEl = document.getElementById('error-banner');
    const errorMessageEl = document.getElementById('error-message');

    let isContextMode = true;

    function setMode(contextMode) {
      isContextMode = contextMode;
      if (contextMode) {
        mainInputEl.placeholder = 'Paste context here...';
        mainActionBtn.title = 'Scope Context';
      } else {
        mainInputEl.placeholder = 'Ask anything...';
        mainActionBtn.title = 'Send Message';
      }
    }

    apiKeyBtn.addEventListener('click', () => vscode.postMessage({ type: 'configureApiKey' }));
    
    mainInputEl.addEventListener('input', () => {
      mainInputEl.style.height = 'auto';
      mainInputEl.style.height = Math.min(mainInputEl.scrollHeight, 150) + 'px';
    });

    mainInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { 
        e.preventDefault(); 
        handleMainAction(); 
      }
    });

    mainActionBtn.addEventListener('click', () => handleMainAction());
    pasteClipboardBtn.addEventListener('click', () => vscode.postMessage({ type: 'pasteClipboard' }));
    newContextBtn.addEventListener('click', () => vscode.postMessage({ type: 'newContext' }));

    document.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const query = btn.getAttribute('data-query');
        if (query) { mainInputEl.value = query; handleMainAction(); }
      });
    });

    function handleMainAction(textOverride) {
      const text = (textOverride || mainInputEl.value).trim();
      if (!text || mainActionBtn.disabled) return;
      
      mainInputEl.value = '';
      mainInputEl.style.height = '24px';
      errorBannerEl.classList.remove('active');

      if (isContextMode) {
        vscode.postMessage({ type: 'setManualContext', text });
      } else {
        vscode.postMessage({ type: 'askQuestion', text });
      }
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function renderMarkdown(rawText) {
      if (!rawText) return '';
      const codeBlocks = [];
      let text = rawText.replace(/\`\`\`([a-zA-Z0-9_-]*)\\n([\\s\\S]*?)\`\`\`/g, (m, lang, code) => {
        codeBlocks.push({ lang: lang ? lang.trim() : 'code', code: code.replace(/\\n$/, '') });
        return '___CODE_' + (codeBlocks.length - 1) + '___';
      });
      text = escapeHtml(text);
      text = text.replace(/^###?\\s+(.*)$/gm, '<strong>$1</strong><br>');
      text = text.replace(/\\*\\*(.*?)\\*\\*/g, '<strong class="strong-text">$1</strong>');
      text = text.replace(/\\*(.*?)\\*/g, '<em>$1</em>');
      text = text.replace(/\`([^\`]+)\`/g, '<code class="inline-code">$1</code>');
      text = text.replace(/\\n/g, '<br>');
      
      codeBlocks.forEach((cb, idx) => {
        const h = '<div class="code-block-wrapper"><div class="code-block-header"><span class="code-lang-label">' + escapeHtml(cb.lang) + '</span><button class="btn-secondary btn-copy-code" data-code="' + encodeURIComponent(cb.code) + '">Copy</button></div><pre class="code-pre"><code>' + escapeHtml(cb.code) + '</code></pre></div>';
        text = text.replace('___CODE_' + idx + '___', h);
      });
      return text;
    }

    let currentStreamingBody = null;
    let currentStreamingContent = '';

    function wireCopyButtons(card, rawContent) {
      card.querySelectorAll('.btn-copy-code').forEach(btn => {
        btn.onclick = () => {
          navigator.clipboard.writeText(decodeURIComponent(btn.getAttribute('data-code') || ''));
          btn.textContent = 'Copied!';
          setTimeout(() => btn.textContent = 'Copy', 2000);
        };
      });
    }

    function appendMessage(role, content) {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'chat-message ' + role;

      if (role === 'user') {
        msgDiv.innerHTML = '<div class="message-bubble">' + escapeHtml(content) + '</div><div class="message-meta">You</div>';
      } else {
        msgDiv.innerHTML = '<div class="assistant-card"><div class="assistant-card-header"><span class="bot-title"><span class="card-mark">${qaMarkSvg(12, '')}</span>QA Assistant</span><span class="grounded-tag">Grounded</span></div><div class="assistant-card-body">' + renderMarkdown(content) + '</div></div>';
        wireCopyButtons(msgDiv, content);
      }
      chatThreadEl.appendChild(msgDiv);
      chatThreadEl.scrollTop = chatThreadEl.scrollHeight;
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      switch (message.type) {
        case 'setContext':
          contextPreviewEl.textContent = message.preview || 'No context';
          if (message.stats) {
            contextStatsEl.textContent = message.stats.chars + ' chars';
            contextStatsEl.style.display = 'inline-block';
            chipsBarEl.classList.add('active');
            setMode(false);
          } else {
            contextStatsEl.style.display = 'none';
            chipsBarEl.classList.remove('active');
            setMode(true);
          }
          break;
        case 'apiKeyStatus':
          if (message.hasKey) { keyIndicatorEl.classList.add('configured'); }
          else { keyIndicatorEl.classList.remove('configured'); }
          break;
        case 'updateModelName':
          if (message.modelName) {
            currentFullModelId = message.modelName;
            currentModelNameEl.textContent = message.modelName.split('/').pop();
          }
          break;
        case 'modelsLoading':
          modelLoadingEl.classList.remove('hidden');
          modelListEl.innerHTML = '';
          modelFilterEl.classList.add('hidden');
          modelFilterEl.value = '';
          modelCountEl.classList.add('hidden');
          modelFallbackEl.classList.add('hidden');
          break;
        case 'modelsList':
          modelLoadingEl.classList.add('hidden');
          if (message.models && message.models.length > 0) {
            allModels = message.models;
            renderFilteredModels();
            modelFilterEl.classList.remove('hidden');
            modelFilterEl.focus();
          } else {
            modelFallbackEl.classList.remove('hidden');
          }
          break;
        case 'modelsError':
          modelLoadingEl.classList.add('hidden');
          modelFallbackEl.classList.remove('hidden');
          modelCustomInputEl.focus();
          break;
        case 'addMessage': appendMessage(message.role, message.text); break;
        case 'streamStart':
          loadingIndicatorEl.classList.remove('active');
          mainActionBtn.disabled = true;
          const msgDiv = document.createElement('div');
          msgDiv.className = 'chat-message assistant';
          msgDiv.innerHTML = '<div class="assistant-card"><div class="assistant-card-header"><span class="bot-title"><span class="card-mark">${qaMarkSvg(12, '')}</span>QA Assistant</span><span class="grounded-tag">Grounded</span></div><div class="assistant-card-body"><span class="streaming-cursor"></span></div></div>';
          chatThreadEl.appendChild(msgDiv);
          currentStreamingBody = msgDiv.querySelector('.assistant-card-body');
          currentStreamingContent = '';
          chatThreadEl.scrollTop = chatThreadEl.scrollHeight;
          break;
        case 'streamChunk':
          if (currentStreamingBody && message.delta) {
            currentStreamingContent += message.delta;
            currentStreamingBody.innerHTML = renderMarkdown(currentStreamingContent) + '<span class="streaming-cursor"></span>';
            chatThreadEl.scrollTop = chatThreadEl.scrollHeight;
          }
          break;
        case 'streamEnd':
          if (currentStreamingBody) {
            currentStreamingBody.innerHTML = renderMarkdown(currentStreamingContent);
            wireCopyButtons(currentStreamingBody.parentElement, currentStreamingContent);
          }
          currentStreamingBody = null; currentStreamingContent = '';
          mainActionBtn.disabled = false;
          chatThreadEl.scrollTop = chatThreadEl.scrollHeight;
          break;
        case 'setLoading':
          if (message.isLoading) { loadingIndicatorEl.classList.add('active'); mainActionBtn.disabled = true; }
          else { loadingIndicatorEl.classList.remove('active'); mainActionBtn.disabled = false; }
          break;
        case 'setError':
          if (message.error) { errorMessageEl.textContent = message.error; errorBannerEl.classList.add('active'); }
          else { errorBannerEl.classList.remove('active'); }
          break;
        case 'resetChat':
          chatThreadEl.innerHTML = '';
          errorBannerEl.classList.remove('active');
          loadingIndicatorEl.classList.remove('active');
          mainActionBtn.disabled = false;
          setMode(true);
          break;
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}
