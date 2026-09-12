import * as vscode from 'vscode';

export type ResponseCaptureCallback = (capturedResponse: string) => void;

/**
 * Universal Capture Manager
 *
 * Provides native, cross-IDE capture mechanisms (clipboard, editor selection,
 * hotkey, and status bar) compatible with VS Code, Antigravity IDE, Cursor, and Windsurf.
 * Zero reliance on internal DOM manipulation or patched workbench files.
 */
export class CaptureManager {
  private statusBarItem: vscode.StatusBarItem | null = null;
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Initializes the status bar button and registers capture handlers.
   */
  public initialize(onCapture: ResponseCaptureCallback): void {
    // 1. Create native status bar shortcut
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.text = '$(sparkle) QA Assistant';
    this.statusBarItem.tooltip = 'QA Assistant: Open Console (or press Ctrl+Alt+Q to capture clipboard)';
    this.statusBarItem.command = 'contextQa.openPanel';
    this.statusBarItem.show();
    this.disposables.push(this.statusBarItem);

    // 2. Register clipboard capture command (mapped to Ctrl+Alt+Q / Cmd+Alt+Q)
    const captureClipboardCmd = vscode.commands.registerCommand(
      'contextQa.captureClipboard',
      async () => {
        const text = await vscode.env.clipboard.readText();
        const trimmed = text ? text.trim() : '';

        if (!trimmed) {
          vscode.window.showWarningMessage(
            'QA Assistant: Clipboard is empty. Copy any AI response or text first, then press Ctrl+Alt+Q.'
          );
          return;
        }

        onCapture(trimmed);
      }
    );

    // 3. Register editor selection capture command (from right-click context menu)
    const askAboutSelectionCmd = vscode.commands.registerCommand(
      'contextQa.askAboutSelection',
      () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage('QA Assistant: No active editor with selected text.');
          return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection).trim();

        if (!text) {
          vscode.window.showWarningMessage('QA Assistant: Please select some text first.');
          return;
        }

        onCapture(text);
      }
    );

    // 4. Register custom prompt/text input command
    const simulateCaptureCmd = vscode.commands.registerCommand(
      'contextQa.simulateCapture',
      async () => {
        const input = await vscode.window.showInputBox({
          prompt: 'Paste or type AI response text to scope QA Assistant',
          placeHolder: 'Paste response text here...',
          ignoreFocusOut: true,
        });

        const trimmed = input?.trim();
        if (trimmed) {
          onCapture(trimmed);
        }
      }
    );

    this.disposables.push(captureClipboardCmd, askAboutSelectionCmd, simulateCaptureCmd);
  }

  public dispose(): void {
    if (this.statusBarItem) {
      this.statusBarItem.dispose();
      this.statusBarItem = null;
    }
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) {
        d.dispose();
      }
    }
  }
}
