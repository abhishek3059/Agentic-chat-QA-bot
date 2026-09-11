import * as vscode from 'vscode';
import { getWebviewHtml } from './webviewHtml';
import { chunkText } from '../rag/chunker';
import { embedChunks } from '../rag/embedder';
import { hybridRetrieve } from '../rag/retriever';
import { Chunk } from '../rag/types';
import { assembleChatMessage } from '../llm/prompt';
import { generateAnswer, GeneratorError } from '../llm/generator';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * Manages the single "Context Q&A" Webview panel.
 * Enforces one scoped context at a time and orchestrates
 * the local RAG pipeline and LLM generation.
 */
export class ContextQAPanelManager {
  public static currentPanel: ContextQAPanelManager | null = null;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private capturedResponse: string = '';
  private chatHistory: ChatMessage[] = [];
  private secrets: vscode.SecretStorage | null = null;

  // In-memory RAG data cache
  private chunks: Chunk[] = [];
  private vectors: number[][] = [];
  private isIndexing: boolean = false;
  private indexingPromise: Promise<void> | null = null;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    secrets?: vscode.SecretStorage
  ) {
    this.panel = panel;
    this.secrets = secrets ?? null;

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
  public static render(
    extensionUri: vscode.Uri,
    initialResponse?: string,
    secrets?: vscode.SecretStorage
  ): ContextQAPanelManager {
    if (ContextQAPanelManager.currentPanel) {
      if (secrets) {
        ContextQAPanelManager.currentPanel.secrets = secrets;
      }
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

    ContextQAPanelManager.currentPanel = new ContextQAPanelManager(panel, extensionUri, secrets);

    if (initialResponse) {
      ContextQAPanelManager.currentPanel.setCapturedResponse(initialResponse);
    } else {
      // Prompt user to capture content
      ContextQAPanelManager.currentPanel.showWelcomeState();
    }

    return ContextQAPanelManager.currentPanel;
  }

  /**
   * Sets new captured response context, chunks text, generates local embeddings,
   * resets chat thread, and updates UI preview.
   */
  public setCapturedResponse(response: string): void {
    this.capturedResponse = response.trim();
    this.chatHistory = [];
    this.chunks = [];
    this.vectors = [];

    // Preview ~200 characters as specified
    const preview = this.capturedResponse.length > 200
      ? this.capturedResponse.slice(0, 200).trim() + '...'
      : this.capturedResponse;

    const stats = {
      chars: this.capturedResponse.length,
      estimatedTokens: Math.ceil(this.capturedResponse.length / 4)
    };

    this.panel.webview.postMessage({ type: 'resetChat' });
    this.panel.webview.postMessage({ type: 'setContext', preview, stats });

    // Step 2: Structural Chunking
    const config = vscode.workspace.getConfiguration('contextQa');
    const maxTokensPerChunk = config.get<number>('maxTokensPerChunk', 200);
    this.chunks = chunkText(this.capturedResponse, { maxTokensPerChunk });

    // Step 3: Background Vector Indexing
    this.isIndexing = true;
    this.indexingPromise = (async () => {
      try {
        this.vectors = await embedChunks(this.chunks);
      } catch (err) {
        console.error('[Context Q&A] Vector embedding generation error:', err);
      } finally {
        this.isIndexing = false;
      }
    })();
  }

  /**
   * Sets initial welcome state awaiting user capture.
   */
  public showWelcomeState(): void {
    this.panel.webview.postMessage({
      type: 'setContext',
      preview: 'Waiting for context... Copy any AI assistant response and press Ctrl+Alt+Q, or click "📋 Paste Clipboard" above.',
      stats: null
    });
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
        this.chunks = [];
        this.vectors = [];
        this.panel.webview.postMessage({ type: 'resetChat' });
        this.showWelcomeState();
        vscode.window.showInformationMessage('Context Q&A: Ready for next response capture.');
        break;

      case 'askQuestion':
        if (message.text) {
          this.handleUserQuestion(message.text.trim());
        }
        break;
    }
  }

  /**
   * Handles user question via the full RAG & Grounded Generation pipeline.
   */
  private async handleUserQuestion(question: string): Promise<void> {
    if (!question) {
      return;
    }

    // 1. Render user message in chat
    this.panel.webview.postMessage({ type: 'addMessage', role: 'user', text: question });

    // 2. Check if context is captured
    if (!this.capturedResponse) {
      const guidance = '⚠️ Please capture an AI assistant response turn first. Copy text to your clipboard and press **Ctrl+Alt+Q** (or click **📋 Paste Clipboard** above).';
      this.panel.webview.postMessage({ type: 'addMessage', role: 'assistant', text: guidance });
      return;
    }

    // 3. Set loading state (spinner)
    this.panel.webview.postMessage({ type: 'setLoading', isLoading: true });

    // 4. Await indexing if currently running
    if (this.isIndexing && this.indexingPromise) {
      await this.indexingPromise;
    }

    try {
      const config = vscode.workspace.getConfiguration('contextQa');
      const topK = config.get<number>('topK', 3);
      const apiBaseUrl = config.get<string>('apiBaseUrl', 'https://openrouter.ai/api/v1');
      const modelName = config.get<string>('modelName', 'deepseek/deepseek-chat');

      // 5. In-Memory Hybrid Retrieval & Scope Guardrail
      const retrieval = await hybridRetrieve(question, this.chunks, this.vectors, { topK });

      // Scope Guardrail short-circuit (saves API tokens on completely irrelevant questions)
      if (retrieval.isOutOfScope) {
        this.panel.webview.postMessage({ type: 'setLoading', isLoading: false });
        const refusalMessage =
          '⚠️ **Out of Scope for Captured Context**\n\n' +
          'This question appears unrelated to the captured response. ' +
          'I am scoped strictly to help you analyze, verify, and expand on this specific response turn.';
        this.panel.webview.postMessage({ type: 'addMessage', role: 'assistant', text: refusalMessage });
        return;
      }

      // 6. Retrieve API Key securely from SecretStorage
      let apiKey = this.secrets ? await this.secrets.get('contextQa.apiKey') : undefined;

      if (!apiKey || !apiKey.trim()) {
        const promptKey = await vscode.window.showInputBox({
          prompt: 'Enter your OpenRouter or DeepSeek API key to answer questions',
          password: true,
          ignoreFocusOut: true
        });

        if (promptKey && promptKey.trim()) {
          apiKey = promptKey.trim();
          if (this.secrets) {
            await this.secrets.store('contextQa.apiKey', apiKey);
          }
          vscode.window.showInformationMessage('Context Q&A: API key saved securely in SecretStorage.');
        } else {
          this.panel.webview.postMessage({ type: 'setLoading', isLoading: false });
          const keyRequiredMsg =
            '🔑 **API Key Required**\n\n' +
            'Please configure your LLM API key to generate answers. ' +
            'You can set it at any time using the command: **Context Q&A: Set LLM API Key**.';
          this.panel.webview.postMessage({ type: 'addMessage', role: 'assistant', text: keyRequiredMsg });
          return;
        }
      }

      // 7. Assemble 3-Tier Instruction Prompts
      const messages = assembleChatMessage(question, retrieval.chunks, this.chatHistory);

      // 8. Grounded LLM Generation
      const answer = await generateAnswer(messages, {
        apiBaseUrl,
        modelName,
        apiKey
      });

      // 9. Update Conversation History & Render Answer
      this.chatHistory.push(
        { role: 'user', text: question },
        { role: 'assistant', text: answer }
      );

      this.panel.webview.postMessage({ type: 'setLoading', isLoading: false });
      this.panel.webview.postMessage({ type: 'addMessage', role: 'assistant', text: answer });
    } catch (err: unknown) {
      this.panel.webview.postMessage({ type: 'setLoading', isLoading: false });
      const errorMessage = err instanceof GeneratorError ? err.message : String(err);
      this.panel.webview.postMessage({
        type: 'addMessage',
        role: 'assistant',
        text: `❌ **Generation Error**\n\n${errorMessage}`
      });
    }
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
