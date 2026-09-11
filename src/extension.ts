import * as vscode from 'vscode';
import { CaptureManager } from './captureManager';
import { ContextQAPanelManager } from './ui/panelManager';

let captureManager: CaptureManager | null = null;
let lastCapturedResponse: string | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('[Agentic Chat Q&A Bot] Universal Agent Console extension activating...');

  // Callback that handles the captured turn text
  const handleCapturedResponse = (capturedResponse: string): void => {
    lastCapturedResponse = capturedResponse;

    console.log('==================================================');
    console.log('[Agentic Chat Q&A Bot] TURN CAPTURE EVENT RECEIVED');
    console.log(`Length: ${capturedResponse.length} characters`);
    console.log('--- Content Preview (first 200 chars) ---');
    console.log(capturedResponse.slice(0, 200));
    console.log('==================================================');

    // Reveal or open the Agentic Chat Q&A panel scoped to this response
    ContextQAPanelManager.render(context.extensionUri, capturedResponse, context.secrets);

    vscode.window.showInformationMessage(
      `Agentic Chat Q&A Bot: Scoped to captured response (${capturedResponse.length} characters).`
    );
  };

  // Initialize universal cross-IDE capture manager (status bar, clipboard, editor context menu)
  captureManager = new CaptureManager(context);
  captureManager.initialize(handleCapturedResponse);

  // Open webview panel command
  const openPanelCommand = vscode.commands.registerCommand('contextQa.openPanel', () => {
    ContextQAPanelManager.render(context.extensionUri, lastCapturedResponse ?? undefined, context.secrets);
  });

  // Set API Key command
  const setApiKeyCommand = vscode.commands.registerCommand('contextQa.setApiKey', async () => {
    const key = await vscode.window.showInputBox({
      prompt: 'Enter your OpenRouter or DeepSeek API key',
      password: true,
      ignoreFocusOut: true,
    });
    if (key) {
      await context.secrets.store('contextQa.apiKey', key.trim());
      vscode.window.showInformationMessage('Context Q&A: API key safely stored in SecretStorage.');
    }
  });

  const showLastCaptureCommand = vscode.commands.registerCommand('contextQa.showLastCapture', () => {
    if (lastCapturedResponse) {
      vscode.window.showInformationMessage(
        `Last Captured (${lastCapturedResponse.length} chars): ${lastCapturedResponse.slice(0, 100)}...`
      );
    } else {
      vscode.window.showInformationMessage('Context Q&A: No response has been captured yet.');
    }
  });

  context.subscriptions.push(
    openPanelCommand,
    setApiKeyCommand,
    showLastCaptureCommand
  );
}

export function deactivate(): void {
  if (captureManager) {
    captureManager.dispose();
    captureManager = null;
  }
  if (ContextQAPanelManager.currentPanel) {
    ContextQAPanelManager.currentPanel.dispose();
  }
}

