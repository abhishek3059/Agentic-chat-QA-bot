import * as vscode from 'vscode';
import { getWebviewHtml } from './webviewHtml';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * Manages the single "Context Q&A" Webview panel.
 * Enforces one context at a time as per spec.
 */
export class ContextQAPanelManager {
  public static currentPanel: ContextQAPanelManager | null = null;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private capturedResponse: string = '';
  private chatHistory: ChatMessage[] = [];

  private constructor(panel: vscode.WebviewPanel, private readonly extensionUri: vscode.Uri) {
    this.panel = panel;

    // Set webview content
    this.panel.webview.html = getWebviewHtml(this.panel.webview.cspSource);

    // Listen for events from webview
    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleWebviewMessage(message),
      null,
      this.disposables
    );

    // Clean up when panel is closed by user
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  /**
   * Creates or reveals the Context Q&A panel.
   */
  public static render(extensionUri: vscode.Uri, initialResponse?: string): ContextQAPanelManager {
    if (ContextQAPanelManager.currentPanel) {
      ContextQAPanelManager.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
      if (initialResponse) {
        ContextQAPanelManager.currentPanel.setCapturedResponse(initialResponse);
      }
      return ContextQAPanelManager.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'agenticChatQaPanel',
      'Agentic Chat Q&A Bot',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri]
      }
    );

    ContextQAPanelManager.currentPanel = new ContextQAPanelManager(panel, extensionUri);

    if (initialResponse) {
      ContextQAPanelManager.currentPanel.setCapturedResponse(initialResponse);
    } else {
      // For Stage 3 UI demonstration: populate dummy initial data
      ContextQAPanelManager.currentPanel.loadDummyData();
    }

    return ContextQAPanelManager.currentPanel;
  }

  /**
   * Sets new captured response context, resets chat thread, and updates preview.
   */
  public setCapturedResponse(response: string): void {
    this.capturedResponse = response;
    this.chatHistory = [];

    // Preview ~200 characters as specified
    const preview = response.length > 200 ? response.slice(0, 200).trim() + '...' : response;
    const stats = {
      chars: response.length,
      estimatedTokens: Math.ceil(response.length / 4)
    };

    this.panel.webview.postMessage({ type: 'resetChat' });
    this.panel.webview.postMessage({ type: 'setContext', preview, stats });
  }

  /**
   * Populates dummy data for Stage 3 UI verification.
   */
  public loadDummyData(): void {
    const dummyResponse =
      'TypeScript is a strongly typed programming language that builds on JavaScript, giving you better tooling at any scale. It compiles to clean, readable JavaScript and runs anywhere JavaScript runs: in a browser, on Node.js or Deno, and in your apps. Strict mode ensures type safety and reduces runtime bugs.';

    this.setCapturedResponse(dummyResponse);

    // Dummy starter turns demonstrating Q&A bubbles
    const sampleUserQ = 'What environments can this run in?';
    const sampleAiAns =
      'According to the provided response, it runs anywhere JavaScript runs: in a browser, on Node.js or Deno, and inside your applications.';

    this.chatHistory.push(
      { role: 'user', text: sampleUserQ },
      { role: 'assistant', text: sampleAiAns }
    );

    this.panel.webview.postMessage({ type: 'addMessage', role: 'user', text: sampleUserQ });
    this.panel.webview.postMessage({ type: 'addMessage', role: 'assistant', text: sampleAiAns });
  }

  private handleWebviewMessage(message: { type: string; text?: string }): void {
    switch (message.type) {
      case 'ready':
        if (this.capturedResponse) {
          const preview = this.capturedResponse.slice(0, 200);
          const stats = {
            chars: this.capturedResponse.length,
            estimatedTokens: Math.ceil(this.capturedResponse.length / 4)
          };
          this.panel.webview.postMessage({ type: 'setContext', preview, stats });
        }
        break;

      case 'pasteClipboard':
        vscode.env.clipboard.readText().then((clipText) => {
          const trimmed = clipText ? clipText.trim() : '';
          if (trimmed) {
            this.setCapturedResponse(trimmed);
            vscode.window.showInformationMessage(
              `Context Q&A: Scoped to clipboard content (${trimmed.length} chars).`
            );
          } else {
            vscode.window.showWarningMessage('Context Q&A: Clipboard is empty.');
          }
        });
        break;

      case 'newContext':
        this.capturedResponse = '';
        this.chatHistory = [];
        this.panel.webview.postMessage({ type: 'resetChat' });
        this.panel.webview.postMessage({
          type: 'setContext',
          preview: 'Waiting for context... Copy any AI response and press Ctrl+Alt+Q, or click "📋 Paste Clipboard" above.',
          stats: null
        });
        vscode.window.showInformationMessage('Context Q&A: Ready for next response capture.');
        break;

      case 'askQuestion':
        if (message.text) {
          this.handleUserQuestion(message.text);
        }
        break;
    }
  }

  /**
   * Handles user question. In Stage 3, simulates the pipeline with loading state and dummy response.
   */
  private handleUserQuestion(question: string): void {
    // 1. Render user message in chat
    this.chatHistory.push({ role: 'user', text: question });
    this.panel.webview.postMessage({ type: 'addMessage', role: 'user', text: question });

    // 2. Set loading state
    this.panel.webview.postMessage({ type: 'setLoading', isLoading: true });

    // 3. Stage 3 dummy response simulation (Stages 4 & 5 will replace this with real RAG pipeline)
    setTimeout(() => {
      this.panel.webview.postMessage({ type: 'setLoading', isLoading: false });

      const dummyAnswer = `[Stage 3 Dummy Answer]\nAnswering question: "${question}"\n\nBased strictly on the captured context (${this.capturedResponse.length} chars), this response verifies the chat thread layout, scroll behavior, input focus, and responsive styling.`;

      this.chatHistory.push({ role: 'assistant', text: dummyAnswer });
      this.panel.webview.postMessage({ type: 'addMessage', role: 'assistant', text: dummyAnswer });
    }, 600);
  }

  /**
   * Displays an error banner in the panel.
   */
  public showError(errorMessage: string): void {
    this.panel.webview.postMessage({ type: 'setError', error: errorMessage });
    this.panel.webview.postMessage({ type: 'setLoading', isLoading: false });
  }

  public dispose(): void {
    ContextQAPanelManager.currentPanel = null;
    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
