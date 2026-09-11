const vm = require('vm');
const { getWebviewHtml } = require('../out/ui/webviewHtml.js');

const html = getWebviewHtml('vscode-resource:');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) {
  console.error('ERROR: No <script> tag found!');
  process.exit(1);
}

const scriptCode = scriptMatch[1];

// A minimal mock DOM for the webview script
const mockElements = {};
const createMockElement = (id) => {
  const el = {
    id,
    classList: { 
      classes: new Set(),
      add: function(c) { this.classes.add(c); }, 
      remove: function(c) { this.classes.delete(c); }, 
      contains: function(c) { return this.classes.has(c); } 
    },
    addEventListener: () => {},
    style: {},
    focus: () => {},
    value: '',
    textContent: '',
    placeholder: '',
    disabled: false
  };
  mockElements[id] = el;
  return el;
};

const mockDom = {
  getElementById: (id) => mockElements[id] || createMockElement(id),
  querySelectorAll: () => []
};

// Mock VS Code API to intercept messages
let postedMessages = [];
const mockVscodeApi = {
  postMessage: (msg) => { postedMessages.push(msg); }
};

let windowMessageListener = null;

const context = {
  acquireVsCodeApi: () => mockVscodeApi,
  document: mockDom,
  window: { 
    addEventListener: (event, cb) => {
      if (event === 'message') windowMessageListener = cb;
    }
  },
  navigator: { clipboard: { writeText: () => Promise.resolve() } },
  console: console
};

vm.createContext(context);
try {
  vm.runInContext(scriptCode, context);
  console.log('✓ Script initialized cleanly in VM context without runtime exceptions!');

  // Test 1: Markdown rendering
  const sampleMarkdown = `# Redis Limiter\n\nHere is **bold**, *italic*, and \`inline code\`.\n\n### Implementation\n\`\`\`typescript\nconst client = createClient();\n\`\`\`\n\n- Point 1\n- Point 2\n\n[Chunk 0] citation removed.`;
  const rendered = context.renderMarkdown(sampleMarkdown);
  if (!rendered.includes('inline-code') || !rendered.includes('code-block-wrapper')) {
    throw new Error('Markdown rendering failed structural checks');
  }
  console.log('✓ Markdown formatting and code blocks render correctly');

  // Test 2: UI State (Context Mode vs Q&A Mode)
  
  // Initial state should be context mode (because setMode(true) is not explicitly called on boot, but HTML implies it)
  // Let's explicitly trigger resetChat to put it into the clean state
  postedMessages = [];
  windowMessageListener({ data: { type: 'resetChat' } });
  
  const mainInput = mockElements['main-input'];
  const mainActionBtn = mockElements['main-action-btn'];
  
  if (mainInput.placeholder !== 'Paste context here...' || mainActionBtn.textContent !== 'Scope') {
    throw new Error('UI did not reset to Context Mode properly.');
  }
  console.log('✓ UI successfully toggles to Context Ingestion Mode (resetChat)');
  
  // Submit manual context in Context Mode
  mainInput.value = 'Some AI response text';
  context.handleMainAction();
  
  const lastMsg = postedMessages[postedMessages.length - 1];
  if (lastMsg.type !== 'setManualContext' || lastMsg.text !== 'Some AI response text') {
    throw new Error('Failed to post setManualContext message');
  }
  console.log('✓ Input correctly routes to setManualContext in Context Mode');

  // Simulate extension returning successful capture (setContext with stats)
  windowMessageListener({ 
    data: { 
      type: 'setContext', 
      preview: '...', 
      stats: { chars: 100, estimatedTokens: 25 } 
    } 
  });

  // Verify transition to Q&A mode
  if (mainInput.placeholder !== 'Ask a question...' || mainActionBtn.textContent !== 'Send') {
    throw new Error('UI did not switch to Q&A Mode after receiving context stats.');
  }
  console.log('✓ UI successfully toggles to Q&A Mode upon receiving scoped context');

  // Submit question in Q&A Mode
  mainInput.value = 'Explain this code';
  context.handleMainAction();
  
  const questionMsg = postedMessages[postedMessages.length - 1];
  if (questionMsg.type !== 'askQuestion' || questionMsg.text !== 'Explain this code') {
    throw new Error('Failed to post askQuestion message');
  }
  console.log('✓ Input correctly routes to askQuestion in Q&A Mode');

  console.log('\n🎉 ALL WEBVIEW DYNAMIC STATE TESTS PASSED!');
  
} catch (err) {
  console.error('\n❌ TEST FAILED:', err.message || err);
  process.exit(1);
}
