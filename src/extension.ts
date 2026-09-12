import * as vscode from 'vscode';
import { CaptureManager } from './captureManager';
import { SidebarProvider } from './ui/SidebarProvider';
import { getEmbeddingPipeline } from './rag/embedder';
import { listProviderOptions, ProviderId } from './llm/providers';

let captureManager: CaptureManager | null = null;
let lastCapturedResponse: string | null = null;
let sidebarProvider: SidebarProvider | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('[QA Assistant] Universal Agent Console extension activating...');

  // ADR-018: pre-warm the local ONNX embedding model in the background so the
  // first query does not pay the full download + session-init cost. Fire-and-forget.
  getEmbeddingPipeline().then(
    () => console.log('[QA Assistant] Embedding model pre-warmed.'),
    (err) => console.warn('[QA Assistant] Embedding model pre-warm failed (will retry on first query):', err)
  );

  sidebarProvider = new SidebarProvider(context.extensionUri, context.secrets);
  
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'context-qa-sidebar',
      sidebarProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // Callback that handles the captured turn text
  const handleCapturedResponse = (capturedResponse: string): void => {
    lastCapturedResponse = capturedResponse;

    console.log('==================================================');
    console.log('[QA Assistant] TURN CAPTURE EVENT RECEIVED');
    console.log(`Length: ${capturedResponse.length} characters`);
    console.log('--- Content Preview (first 200 chars) ---');
    console.log(capturedResponse.slice(0, 200));
    console.log('==================================================');

    if (sidebarProvider) {
      sidebarProvider.setCapturedResponse(capturedResponse);
    }
    
    // Focus the view
    vscode.commands.executeCommand('context-qa-sidebar.focus');

    vscode.window.showInformationMessage(
      `QA Assistant: Scoped to captured response (${capturedResponse.length} characters).`
    );
  };

  // Initialize universal cross-IDE capture manager (status bar, clipboard, editor context menu)
  captureManager = new CaptureManager(context);
  captureManager.initialize(handleCapturedResponse);

  // Open webview panel command
  const openPanelCommand = vscode.commands.registerCommand('contextQa.openPanel', () => {
    vscode.commands.executeCommand('context-qa-sidebar.focus');
  });

  // Set API Key command
  const setApiKeyCommand = vscode.commands.registerCommand('contextQa.setApiKey', async () => {
    if (sidebarProvider) {
      await sidebarProvider.promptAndSaveApiKey();
    }
  });

  // Provider picker: quick-pick that writes contextQa.provider to settings.
  const configureProviderCommand = vscode.commands.registerCommand('contextQa.configureProvider', async () => {
    const picked = await vscode.window.showQuickPick(
      listProviderOptions().map(p => ({ label: p.label, description: p.description, id: p.id })),
      { placeHolder: 'Select LLM provider' }
    );
    if (picked) {
      await vscode.workspace.getConfiguration('contextQa').update(
        'provider',
        picked.id as ProviderId,
        vscode.ConfigurationTarget.Global
      );
      vscode.window.showInformationMessage(`QA Assistant: Provider set to ${picked.label}.`);
    }
  });

  const showLastCaptureCommand = vscode.commands.registerCommand('contextQa.showLastCapture', () => {
    if (lastCapturedResponse) {
      vscode.window.showInformationMessage(
        `Last Captured (${lastCapturedResponse.length} chars): ${lastCapturedResponse.slice(0, 100)}...`
      );
    } else {
      vscode.window.showInformationMessage('QA Assistant: No response has been captured yet.');
    }
  });

  context.subscriptions.push(
    openPanelCommand,
    setApiKeyCommand,
    configureProviderCommand,
    showLastCaptureCommand
  );
}

export function deactivate(): void {
  if (captureManager) {
    captureManager.dispose();
    captureManager = null;
  }
}
