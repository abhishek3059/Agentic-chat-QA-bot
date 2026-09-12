import * as vscode from 'vscode';
import { getWebviewHtml } from './webviewHtml';
import { chunkText } from '../rag/chunker';
import { embedChunks } from '../rag/embedder';
import { hybridRetrieve, tokenizeCodeAndProse } from '../rag/retriever';
import { Chunk } from '../rag/types';
import { assembleChatMessage, classifyQueryIntent, TEMPERATURE_PROFILES, QueryIntent } from '../llm/prompt';
import { generateAnswer, generateAnswerStreaming, GeneratorError, DEFAULT_TOP_P } from '../llm/generator';
import { resolveBaseUrl, ProviderId } from '../llm/providers';
import { fetchModels } from '../llm/modelList';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

function getFollowUpChips(intent: QueryIntent, query: string): string[] {
  switch (intent) {
    case 'factual':
      return ['Explain how this works', 'Show full code example', 'What are the edge cases?'];
    case 'explain':
      return ['Show full implementation', 'Give me a simpler analogy', 'What are the alternatives?'];
    case 'code':
      return ['How do I test this?', 'What are the performance trade-offs?', 'Explain step-by-step'];
    case 'meta':
      return ['Elaborate on the key takeaways', 'Show code snippet for this', 'What did I miss?'];
  }
}

export class SidebarProvider implements vscode.WebviewViewProvider {
  public view?: vscode.WebviewView;
  private disposables: vscode.Disposable[] = [];
  
  private capturedResponse: string = '';
  private chatHistory: ChatMessage[] = [];
  
  // In-memory RAG data cache
  private chunks: Chunk[] = [];
  private vectors: number[][] = [];
  // Pre-tokenized chunk keyword sets, cached at capture time (ADR-018).
  private chunkTokens: string[][] = [];
  private isIndexing: boolean = false;
  private indexingPromise: Promise<void> | null = null;
  // Monotonic capture generation. Incremented on every new capture so
  // in-flight questions grounded in a superseded capture are discarded (ADR-018).
  private generationCounter: number = 0;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly secrets: vscode.SecretStorage
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = getWebviewHtml(webviewView.webview.cspSource);

    webviewView.webview.onDidReceiveMessage(
      (message) => this.handleWebviewMessage(message),
      null,
      this.disposables
    );

    // Refresh the model display when provider or base URL changes in Settings.
    const configWatcher = vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('contextQa.provider') || e.affectsConfiguration('contextQa.apiBaseUrl')) {
        this.sendModelName();
      }
    });
    this.disposables.push(configWatcher);

    // If we already captured a response before the view was resolved, apply it now.
    if (this.capturedResponse) {
      this.setCapturedResponse(this.capturedResponse);
    } else {
      this.showWelcomeState();
    }
  }

  public setCapturedResponse(response: string): void {
    this.capturedResponse = response.trim();
    this.chatHistory = [];
    this.chunks = [];
    this.vectors = [];
    this.chunkTokens = [];
    // Invalidate any in-flight question grounded in the previous capture.
    this.generationCounter++;

    const preview = this.capturedResponse.length > 200
      ? this.capturedResponse.slice(0, 200).trim() + '...'
      : this.capturedResponse;

    const stats = {
      chars: this.capturedResponse.length,
      estimatedTokens: Math.ceil(this.capturedResponse.length / 4)
    };

    if (this.view) {
      this.view.webview.postMessage({ type: 'resetChat' });
      this.view.webview.postMessage({ type: 'setContext', preview, stats, showDrawer: false });
      this.updateApiKeyStatusInWebview();
    }

    const config = vscode.workspace.getConfiguration('contextQa');
    const maxTokensPerChunk = config.get<number>('maxTokensPerChunk', 200);
    this.chunks = chunkText(this.capturedResponse, { maxTokensPerChunk });
    // Cache keyword tokens once per capture (ADR-018) instead of
    // re-tokenizing every chunk on each query.
    this.chunkTokens = this.chunks.map(chunk => tokenizeCodeAndProse(chunk.text));

    // Capture the generation so a newer capture can invalidate this run.
    const captureGeneration = this.generationCounter;
    const chunksForIndexing = this.chunks;
    this.isIndexing = true;
    this.indexingPromise = (async () => {
      try {
        const vectors = await embedChunks(chunksForIndexing);
        // Discard results if a newer capture superseded this run.
        if (this.generationCounter === captureGeneration) {
          this.vectors = vectors;
        }
      } catch (err) {
        console.error('[QA Assistant] Vector embedding generation error:', err);
        // ADR-018: surface the degradation visibly; retrieval falls back to BM25-only.
        if (this.view && this.generationCounter === captureGeneration) {
          this.view.webview.postMessage({
            type: 'addMessage',
            role: 'assistant',
            text: '⚠️ **Vector indexing failed** — answers will use keyword matching only for this context.'
          });
        }
      } finally {
        if (this.generationCounter === captureGeneration) {
          this.isIndexing = false;
        }
      }
    })();
  }

  public showWelcomeState(): void {
    if (this.view) {
      this.view.webview.postMessage({
        type: 'setContext',
        preview: 'Waiting for context... Click "✏️ Enter Context" or "📋 Paste Clipboard" above to begin.',
        stats: null,
        showDrawer: true
      });
      this.updateApiKeyStatusInWebview();
    }
  }

  public async updateApiKeyStatusInWebview(): Promise<void> {
    const apiKey = await this.secrets.get('contextQa.apiKey');
    const hasKey = Boolean(apiKey && apiKey.trim().length > 0);
    if (this.view) {
      this.view.webview.postMessage({ type: 'apiKeyStatus', hasKey });
    }
  }

  private sendModelName(): void {
    if (this.view) {
      const config = vscode.workspace.getConfiguration('contextQa');
      const modelName = config.get<string>('modelName', 'deepseek/deepseek-chat');
      this.view.webview.postMessage({ type: 'updateModelName', modelName });
    }
  }

  /**
   * Fetches the provider's available models and pushes them to the webview
   * picker. Any failure posts modelsError so the webview falls back to
   * free-text entry — model listing is best-effort, never blocking.
   */
  private async handleFetchModels(): Promise<void> {
    if (!this.view) {
      return;
    }

    const config = vscode.workspace.getConfiguration('contextQa');
    const provider = config.get<ProviderId>('provider', 'openrouter');
    const customUrl = config.get<string>('apiBaseUrl', '');
    const apiKey = await this.secrets.get('contextQa.apiKey') || '';

    this.view.webview.postMessage({ type: 'modelsLoading' });

    const models = await fetchModels(provider, customUrl, apiKey);

    if (this.view) {
      if (models && models.length > 0) {
        this.view.webview.postMessage({ type: 'modelsList', models });
      } else {
        this.view.webview.postMessage({
          type: 'modelsError',
          error: 'Could not fetch models. Check your API key and provider settings.'
        });
      }
    }
  }

  public async promptAndSaveApiKey(): Promise<string | undefined> {
    const currentKey = await this.secrets.get('contextQa.apiKey');
    const promptText = currentKey
      ? 'Update your API key (press Enter to save, Esc to cancel)'
      : 'Enter your LLM provider API key to enable answers';

    const key = await vscode.window.showInputBox({
      prompt: promptText,
      password: true,
      ignoreFocusOut: true,
      value: currentKey || ''
    });

    if (key !== undefined) {
      const trimmed = key.trim();
      if (trimmed) {
        await this.secrets.store('contextQa.apiKey', trimmed);
        vscode.window.showInformationMessage('QA Assistant: API key saved securely.');
      } else {
        await this.secrets.delete('contextQa.apiKey');
        vscode.window.showInformationMessage('QA Assistant: API key removed.');
      }
      await this.updateApiKeyStatusInWebview();
      return trimmed || undefined;
    }
    return undefined;
  }

  private handleWebviewMessage(message: { type: string; text?: string; modelId?: string }): void {
    switch (message.type) {
      case 'ready':
        this.updateApiKeyStatusInWebview();
        this.sendModelName();
        if (this.capturedResponse) {
          const preview = this.capturedResponse.slice(0, 200);
          const stats = {
            chars: this.capturedResponse.length,
            estimatedTokens: Math.ceil(this.capturedResponse.length / 4)
          };
          this.view?.webview.postMessage({ type: 'setContext', preview, stats, showDrawer: false });
        } else {
          this.showWelcomeState();
        }
        break;

      case 'setManualContext':
        if (message.text && message.text.trim()) {
          const text = message.text.trim();
          this.setCapturedResponse(text);
          vscode.window.showInformationMessage(
            `QA Assistant: Scoped to context text (${text.length} chars).`
          );
        }
        break;

      case 'configureApiKey':
        this.promptAndSaveApiKey();
        break;

      case 'pasteClipboard':
        vscode.env.clipboard.readText().then((clipText) => {
          const trimmed = clipText ? clipText.trim() : '';
          if (trimmed) {
            this.setCapturedResponse(trimmed);
            vscode.window.showInformationMessage(
              `QA Assistant: Scoped to clipboard content (${trimmed.length} chars).`
            );
          } else {
            vscode.window.showWarningMessage('QA Assistant: Clipboard is empty. Use "✏️ Enter Context" to paste directly.');
            this.view?.webview.postMessage({ type: 'openContextDrawer' });
          }
        });
        break;

      case 'fetchModels':
        this.handleFetchModels();
        break;

      case 'changeModel':
        if (message.modelId && message.modelId.trim()) {
          // Model picked from the fetched list in the sidebar dropdown.
          const newModel = message.modelId.trim();
          vscode.workspace.getConfiguration('contextQa').update('modelName', newModel, vscode.ConfigurationTarget.Global)
            .then(() => {
              this.sendModelName();
              vscode.window.showInformationMessage(`QA Assistant: Model updated to ${newModel}`);
            });
        } else {
          // Fallback: free-text entry (fetch failed or unavailable).
          vscode.window.showInputBox({
            prompt: 'Enter the model name (e.g., gpt-4o, deepseek-chat, claude-3.5-sonnet)',
            value: vscode.workspace.getConfiguration('contextQa').get<string>('modelName', 'deepseek/deepseek-chat'),
            ignoreFocusOut: true
          }).then(newModel => {
            if (newModel && newModel.trim()) {
              vscode.workspace.getConfiguration('contextQa').update('modelName', newModel.trim(), vscode.ConfigurationTarget.Global)
                .then(() => {
                  this.sendModelName();
                  vscode.window.showInformationMessage(`QA Assistant: Model updated to ${newModel.trim()}`);
                });
            }
          });
        }
        break;

      case 'newContext':
        this.capturedResponse = '';
        this.chatHistory = [];
        this.chunks = [];
        this.vectors = [];
        this.chunkTokens = [];
        this.generationCounter++;
        if (this.view) {
          this.view.webview.postMessage({ type: 'resetChat' });
          this.showWelcomeState();
        }
        vscode.window.showInformationMessage('QA Assistant: Ready for next response capture.');
        break;

      case 'askQuestion':
        if (message.text) {
          this.handleUserQuestion(message.text.trim());
        }
        break;
    }
  }

  private async handleUserQuestion(question: string): Promise<void> {
    if (!question || !this.view) return;

    // Snapshot the capture generation; discard this run if a newer capture lands mid-flight (ADR-018).
    const questionGeneration = this.generationCounter;

    this.view.webview.postMessage({ type: 'addMessage', role: 'user', text: question });

    if (!this.capturedResponse) {
      const guidance =
        '⚠️ **No Context Captured Yet**\n\n' +
        'Please enter or paste the AI assistant response text first. Click **✏️ Enter Context** above or paste directly into the box.';
      this.view.webview.postMessage({ type: 'addMessage', role: 'assistant', text: guidance });
      this.view.webview.postMessage({ type: 'openContextDrawer' });
      return;
    }

    this.view.webview.postMessage({ type: 'setLoading', isLoading: true });

    if (this.isIndexing && this.indexingPromise) {
      await this.indexingPromise;
    }

    try {
      const config = vscode.workspace.getConfiguration('contextQa');
      const intent = classifyQueryIntent(question);
      const adaptiveTopKMap: Record<QueryIntent, number> = {
        factual: 2,
        explain: 3,
        code: 4,
        meta: 5
      };
      const configuredTopK = config.get<number>('topK', 3);
      const topK = Math.max(configuredTopK, adaptiveTopKMap[intent]);

      const provider = config.get<ProviderId>('provider', 'openrouter');
      const customUrl = config.get<string>('apiBaseUrl', '');
      const apiBaseUrl = resolveBaseUrl(provider, customUrl);
      const modelName = config.get<string>('modelName', 'deepseek/deepseek-chat');

      const intentTemp = TEMPERATURE_PROFILES[intent];
      const configuredTemp = config.get<number>('temperature');
      const temperature = (configuredTemp !== undefined && configuredTemp !== 0.45) ? configuredTemp : intentTemp;
      const topP = config.get<number>('topP', DEFAULT_TOP_P);
      const isStreaming = config.get<boolean>('streaming', true);

      // ADR-017: no pre-retrieval scope gate. Every question reaches the LLM;
      // the system prompt is the single relevance judge.
      const retrieval = await hybridRetrieve(question, this.chunks, this.vectors, {
        topK,
        preTokenizedChunks: this.chunkTokens.length === this.chunks.length ? this.chunkTokens : undefined
      });

      // A newer capture landed while retrieval ran — discard this stale run.
      if (this.generationCounter !== questionGeneration || !this.view) {
        return;
      }

      let apiKey = await this.secrets.get('contextQa.apiKey');

      if (!apiKey || !apiKey.trim()) {
        apiKey = await this.promptAndSaveApiKey();
        if (!apiKey || !apiKey.trim()) {
          this.view.webview.postMessage({ type: 'setLoading', isLoading: false });
          const keyRequiredMsg =
            '🔑 **API Key Required**\n\n' +
            'Please configure your LLM API key to generate answers. ' +
            'Click the **🔑 Set API Key** button above at any time to configure it.';
          this.view.webview.postMessage({ type: 'addMessage', role: 'assistant', text: keyRequiredMsg });
          return;
        }
      }

      const messages = assembleChatMessage(question, retrieval.chunks, this.chatHistory, 3, intent);
      const chips = getFollowUpChips(intent, question);
      let answer = '';

      if (isStreaming) {
        this.view.webview.postMessage({ type: 'streamStart' });
        try {
          answer = await generateAnswerStreaming(
            messages,
            { apiBaseUrl, modelName, apiKey, temperature, topP },
            (delta) => {
              this.view?.webview.postMessage({ type: 'streamChunk', delta });
            }
          );
        } catch (streamErr) {
          console.warn('[QA Assistant] Streaming failed, attempting batch fallback:', streamErr);
          answer = await generateAnswer(messages, {
            apiBaseUrl,
            modelName,
            apiKey,
            temperature,
            topP
          });
        }
        // Discard if a newer capture superseded this question mid-generation.
        if (this.generationCounter !== questionGeneration || !this.view) {
          return;
        }
        this.chatHistory.push(
          { role: 'user', text: question },
          { role: 'assistant', text: answer }
        );
        this.view.webview.postMessage({ type: 'streamEnd', chips });
      } else {
        answer = await generateAnswer(messages, {
          apiBaseUrl,
          modelName,
          apiKey,
          temperature,
          topP
        });
        // Discard if a newer capture superseded this question mid-generation.
        if (this.generationCounter !== questionGeneration || !this.view) {
          return;
        }
        this.chatHistory.push(
          { role: 'user', text: question },
          { role: 'assistant', text: answer }
        );
        this.view.webview.postMessage({ type: 'setLoading', isLoading: false });
        this.view.webview.postMessage({ type: 'addMessage', role: 'assistant', text: answer, chips });
      }
    } catch (err: unknown) {
      this.view.webview.postMessage({ type: 'setLoading', isLoading: false });
      const errorMessage = err instanceof GeneratorError ? err.message : String(err);
      this.view.webview.postMessage({
        type: 'addMessage',
        role: 'assistant',
        text: `❌ **Generation Error**\n\n${errorMessage}`
      });
    }
  }

  public showError(errorMessage: string): void {
    if (this.view) {
      this.view.webview.postMessage({ type: 'setError', error: errorMessage });
      this.view.webview.postMessage({ type: 'setLoading', isLoading: false });
    }
  }
}
