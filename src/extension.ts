import * as vscode from 'vscode';
import { CaptureManager } from './captureManager';
import { SidebarProvider } from './ui/SidebarProvider';

let captureManager: CaptureManager | null = null;
let lastCapturedResponse: string | null = null;
let sidebarProvider: SidebarProvider | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('[Agentic Chat Q&A Bot] Universal Agent Console extension activating...');

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
    console.log('[Agentic Chat Q&A Bot] TURN CAPTURE EVENT RECEIVED');
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
      `Agentic Chat Q&A Bot: Scoped to captured response (${capturedResponse.length} characters).`
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
}
