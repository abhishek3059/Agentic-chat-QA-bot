/**
 * Generates the HTML, CSS, and JavaScript for the Context Q&A Webview Panel.
 * Uses vanilla HTML/CSS/JS with VS Code theme CSS variables for seamless styling.
 */
export function getWebviewHtml(cspSource: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agentic Chat Q&A Bot</title>
  <style>
    :root {
      --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family, var(--font-family));
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-editor-foreground);
      background-color: var(--vscode-editor-background);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    /* Top Context Preview Header */
    #context-header {
      background-color: var(--vscode-sideBar-background, rgba(0, 0, 0, 0.05));
      border-bottom: 1px solid var(--vscode-panel-border, rgba(128, 128, 128, 0.2));
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex-shrink: 0;
    }

    .context-top-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .context-left-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .context-badge {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 3px;
      background: var(--vscode-badge-background, #007acc);
      color: var(--vscode-badge-foreground, #ffffff);
    }

    .context-stats-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 3px;
      background: var(--vscode-badge-background, rgba(128, 128, 128, 0.15));
      color: var(--vscode-descriptionForeground, rgba(200, 200, 200, 0.8));
      font-weight: 500;
      display: none;
    }

    .context-btn-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .btn-secondary {
      font-size: 11px;
      padding: 3px 8px;
      border: 1px solid var(--vscode-button-secondaryBorder, rgba(128, 128, 128, 0.4));
      background-color: var(--vscode-button-secondaryBackground, transparent);
      color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
      border-radius: 3px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: background-color 0.15s ease;
    }

    .btn-secondary:hover {
      background-color: var(--vscode-button-secondaryHoverBackground, rgba(128, 128, 128, 0.15));
    }

    #context-preview {
      font-size: 12px;
      line-height: 1.4;
      color: var(--vscode-descriptionForeground, rgba(200, 200, 200, 0.8));
      font-style: italic;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      word-break: break-word;
    }

    /* Chat Thread */
    #chat-thread {
      flex: 1;
      overflow-y: auto;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .chat-message {
      display: flex;
      flex-direction: column;
      max-width: 88%;
      animation: fadeIn 0.2s ease-in-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .chat-message.user {
      align-self: flex-end;
    }

    .chat-message.assistant {
      align-self: flex-start;
    }

    .message-bubble {
      padding: 9px 13px;
      border-radius: 8px;
      line-height: 1.45;
      word-break: break-word;
      white-space: pre-wrap;
    }

    .chat-message.user .message-bubble {
      background-color: var(--vscode-button-background, #007acc);
      color: var(--vscode-button-foreground, #ffffff);
      border-bottom-right-radius: 2px;
    }

    .chat-message.assistant .message-bubble {
      background-color: var(--vscode-sideBar-background, rgba(128, 128, 128, 0.1));
      color: var(--vscode-editor-foreground);
      border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
      border-bottom-left-radius: 2px;
    }

    .message-meta {
      font-size: 10px;
      color: var(--vscode-descriptionForeground, gray);
      margin-top: 3px;
      padding: 0 4px;
    }

    .chat-message.user .message-meta {
      text-align: right;
    }

    /* Error Banner */
    #error-banner {
      display: none;
      background-color: var(--vscode-inputValidation-errorBackground, #5a1d1d);
      border: 1px solid var(--vscode-inputValidation-errorBorder, #be1100);
      color: var(--vscode-inputValidation-errorForeground, #ffffff);
      padding: 8px 12px;
      margin: 8px 14px 0 14px;
      border-radius: 4px;
      font-size: 12px;
      align-items: center;
      justify-content: space-between;
    }

    #error-banner.active {
      display: flex;
    }

    /* Loading Indicator */
    #loading-indicator {
      display: none;
      align-self: flex-start;
      padding: 8px 14px;
      margin: 0 14px;
      color: var(--vscode-descriptionForeground, #999);
      font-size: 12px;
      align-items: center;
      gap: 6px;
    }

    #loading-indicator.active {
      display: flex;
    }

    .spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid var(--vscode-descriptionForeground, rgba(255, 255, 255, 0.3));
      border-radius: 50%;
      border-top-color: var(--vscode-button-background, #007acc);
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Input Footer */
    #input-footer {
      border-top: 1px solid var(--vscode-panel-border, rgba(128, 128, 128, 0.2));
      padding: 10px 14px;
      background-color: var(--vscode-editor-background);
      display: flex;
      gap: 8px;
      align-items: flex-end;
      flex-shrink: 0;
    }

    #question-input {
      flex: 1;
      resize: none;
      height: 38px;
      max-height: 100px;
      padding: 8px 10px;
      font-family: inherit;
      font-size: inherit;
      color: var(--vscode-input-foreground);
      background-color: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, rgba(128, 128, 128, 0.4));
      border-radius: 4px;
      outline: none;
    }

    #question-input:focus {
      border-color: var(--vscode-focusBorder, #007acc);
    }

    #send-btn {
      height: 38px;
      padding: 0 16px;
      background-color: var(--vscode-button-background, #007acc);
      color: var(--vscode-button-foreground, #ffffff);
      border: none;
      border-radius: 4px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      transition: background-color 0.15s ease;
    }

    #send-btn:hover:not(:disabled) {
      background-color: var(--vscode-button-hoverBackground, #0062a3);
    }

    #send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  </style>
</head>
<body>

  <!-- Top Context Preview -->
  <div id="context-header">
    <div class="context-top-row">
      <div class="context-left-group">
        <span class="context-badge">Scoped Context</span>
        <span id="context-stats" class="context-stats-badge"></span>
      </div>
      <div class="context-btn-group">
        <button id="paste-clipboard-btn" class="btn-secondary" title="Capture text directly from your clipboard (Ctrl+Alt+Q)">
          📋 Paste Clipboard
        </button>
        <button id="new-context-btn" class="btn-secondary" title="Reset chat and await new captured turn">
          🔄 New context
        </button>
      </div>
    </div>
    <div id="context-preview">
      Waiting for context... Copy any AI response and press Ctrl+Alt+Q, or click "📋 Paste Clipboard" above.
    </div>
  </div>

  <!-- Error Banner -->
  <div id="error-banner">
    <span id="error-message"></span>
    <button id="dismiss-error-btn" class="btn-secondary" style="padding: 1px 6px;">✕</button>
  </div>

  <!-- Chat Messages Thread -->
  <div id="chat-thread"></div>

  <!-- Loading State -->
  <div id="loading-indicator">
    <span class="spinner"></span>
    <span id="loading-text">Analyzing context and generating answer...</span>
  </div>

  <!-- Input Area -->
  <div id="input-footer">
    <textarea
      id="question-input"
      rows="1"
      placeholder="Ask a question about this response..."
    ></textarea>
    <button id="send-btn">Send</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    const contextPreviewEl = document.getElementById('context-preview');
    const contextStatsEl = document.getElementById('context-stats');
    const pasteClipboardBtn = document.getElementById('paste-clipboard-btn');
    const newContextBtn = document.getElementById('new-context-btn');
    const chatThreadEl = document.getElementById('chat-thread');
    const questionInputEl = document.getElementById('question-input');
    const sendBtn = document.getElementById('send-btn');
    const loadingIndicatorEl = document.getElementById('loading-indicator');
    const errorBannerEl = document.getElementById('error-banner');
    const errorMessageEl = document.getElementById('error-message');
    const dismissErrorBtn = document.getElementById('dismiss-error-btn');

    // Auto-resize textarea
    questionInputEl.addEventListener('input', () => {
      questionInputEl.style.height = 'auto';
      questionInputEl.style.height = Math.min(questionInputEl.scrollHeight, 100) + 'px';
    });

    // Enter to send (Shift+Enter for newline)
    questionInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitQuestion();
      }
    });

    sendBtn.addEventListener('click', submitQuestion);

    pasteClipboardBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'pasteClipboard' });
    });

    newContextBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'newContext' });
    });

    dismissErrorBtn.addEventListener('click', () => {
      errorBannerEl.classList.remove('active');
    });

    function submitQuestion() {
      const text = questionInputEl.value.trim();
      if (!text || sendBtn.disabled) return;

      questionInputEl.value = '';
      questionInputEl.style.height = '38px';
      errorBannerEl.classList.remove('active');

      vscode.postMessage({
        type: 'askQuestion',
        text: text
      });
    }

    function appendMessage(role, content) {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'chat-message ' + role;

      const bubble = document.createElement('div');
      bubble.className = 'message-bubble';
      bubble.textContent = content;

      const meta = document.createElement('div');
      meta.className = 'message-meta';
      meta.textContent = role === 'user' ? 'You' : 'Agentic Q&A Bot';

      msgDiv.appendChild(bubble);
      msgDiv.appendChild(meta);
      chatThreadEl.appendChild(msgDiv);

      chatThreadEl.scrollTop = chatThreadEl.scrollHeight;
    }

    // Handle messages from the extension host
    window.addEventListener('message', (event) => {
      const message = event.data;
      switch (message.type) {
        case 'setContext':
          contextPreviewEl.textContent = message.preview || 'No response text available.';
          if (message.stats) {
            contextStatsEl.textContent = message.stats.chars.toLocaleString() + ' chars • ~' + message.stats.estimatedTokens.toLocaleString() + ' tokens';
            contextStatsEl.style.display = 'inline-block';
          } else {
            contextStatsEl.style.display = 'none';
          }
          break;

        case 'addMessage':
          appendMessage(message.role, message.text);
          break;

        case 'setLoading':
          if (message.isLoading) {
            loadingIndicatorEl.classList.add('active');
            sendBtn.disabled = true;
          } else {
            loadingIndicatorEl.classList.remove('active');
            sendBtn.disabled = false;
          }
          break;

        case 'setError':
          if (message.error) {
            errorMessageEl.textContent = message.error;
            errorBannerEl.classList.add('active');
          } else {
            errorBannerEl.classList.remove('active');
          }
          break;

        case 'resetChat':
          chatThreadEl.innerHTML = '';
          errorBannerEl.classList.remove('active');
          loadingIndicatorEl.classList.remove('active');
          sendBtn.disabled = false;
          break;
      }
    });

    // Notify extension host that webview is ready
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}
