# Phase E: Multi-Provider Setup + Model Selector + Settings-Based Config

## Document Details
- **Created:** 2026-09-12
- **Source:** User feedback on Phase C smoke test (API key prompt misleading, model selector manual, no settings-based config)
- **Status:** ✅ Implemented 2026-09-12 (Session 11) — 71 tests passing, compile clean. See ADR-020.
- **Tracking:** Phase E1 → E2 → E3 ✅

---

## Problem Statement

Three UX gaps in the current provider/config experience:

1. **API key prompt hardcodes "OpenRouter or DeepSeek"** — but the generator is already provider-agnostic (any OpenAI-compatible endpoint). The prompt text at `SidebarProvider.ts:170` says *"Enter your OpenRouter or DeepSeek API key"*, which misleads users who want OpenAI, Claude (via proxy), Ollama, or others.

2. **Model selector is a free-text input box** — the user types a model ID blind. No dropdown, no validation, no guidance. Users must already know their provider's model IDs.

3. **API key is only in SecretStorage** — can't be seen or configured from the VS Code Settings UI. Users expect a settings panel like Cline, Continue, or other AI extensions.

## Design Decisions (already made)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Provider selection | **Dropdown with presets + Custom option** | Best UX; presets pre-fill base URLs; Custom reveals free-text URL field |
| Model list | **Fetched live from provider's `/v1/models` endpoint** | Always current; all 4 providers support it; OpenRouter gives display names |
| API key storage | **SecretStorage only** (no change) | Security-first; key never touches `settings.json`; prompt text is fixed |
| Config in settings.json | **Add `contextQa.provider` dropdown** | Lets users see/set provider from the Settings UI; base URL derived from it |

## Provider Preset Table

| Provider | Preset Label | Base URL | Auth Required | Models Endpoint | Notes |
|----------|-------------|----------|---------------|-----------------|-------|
| OpenAI | `openai` | `https://api.openai.com/v1` | Yes | `GET /v1/models` | Returns minimal `id` only |
| OpenRouter | `openrouter` | `https://openrouter.ai/api/v1` | Optional | `GET /v1/models` | Returns `name`, `context_length`, `pricing` |
| DeepSeek | `deepseek` | `https://api.deepseek.com/v1` | Yes | `GET /v1/models` | Returns minimal `id` only; 2 models |
| Ollama (local) | `ollama` | `http://localhost:11434/v1` | No | `GET /v1/models` | Returns local model names |
| Custom | `custom` | (user-provided) | Depends | Same endpoint | For vLLM, LM Studio, Together, etc. |

---

## Phase E1: Provider Dropdown + Config Restructure

**Goal:** Replace the free-text base URL with a provider dropdown in VS Code Settings; fix the API key prompt text.

### E1.1 — Add `contextQa.provider` to `package.json` configuration

**File:** `package.json` (lines 87–126, `contributes.configuration.properties`)

Add a new config property:

```json
"contextQa.provider": {
  "type": "string",
  "default": "openrouter",
  "enum": ["openai", "openrouter", "deepseek", "ollama", "custom"],
  "enumDescriptions": [
    "OpenAI (GPT-4o, GPT-4, etc.) — api.openai.com",
    "OpenRouter — multi-provider gateway with free models",
    "DeepSeek — deepseek-chat, deepseek-reasoner",
    "Ollama — local models via localhost:11434",
    "Custom — any OpenAI-compatible endpoint"
  ],
  "description": "LLM provider. Select 'Custom' to use any OpenAI-compatible endpoint."
}
```

Keep `contextQa.apiBaseUrl` but change its default to empty string and update description:

```json
"contextQa.apiBaseUrl": {
  "type": "string",
  "default": "",
  "description": "Base URL override. Only used when provider is 'Custom'. For preset providers, this is derived automatically."
}
```

### E1.2 — Create provider URL resolver utility

**New file:** `src/llm/providers.ts`

```typescript
export type ProviderId = 'openai' | 'openrouter' | 'deepseek' | 'ollama' | 'custom';

export interface ProviderPreset {
  id: ProviderId;
  label: string;
  baseUrl: string;
  needsKey: boolean;
  modelsUrl: string;
}

const PRESETS: Record<Exclude<ProviderId, 'custom'>, ProviderPreset> = {
  openai:     { id: 'openai',     label: 'OpenAI',     baseUrl: 'https://api.openai.com/v1',                  needsKey: true,  modelsUrl: 'https://api.openai.com/v1/models' },
  openrouter: { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1',              needsKey: true,  modelsUrl: 'https://openrouter.ai/api/v1/models' },
  deepseek:   { id: 'deepseek',   label: 'DeepSeek',   baseUrl: 'https://api.deepseek.com/v1',                needsKey: true,  modelsUrl: 'https://api.deepseek.com/v1/models' },
  ollama:     { id: 'ollama',     label: 'Ollama',     baseUrl: 'http://localhost:11434/v1',                  needsKey: false, modelsUrl: 'http://localhost:11434/v1/models' },
};

export function getProviderPreset(provider: ProviderId): ProviderPreset | undefined {
  return PRESETS[provider];
}

export function resolveBaseUrl(provider: ProviderId, customUrl?: string): string {
  if (provider === 'custom') {
    return (customUrl || '').trim().replace(/\/+$/, '');
  }
  return PRESETS[provider]?.baseUrl ?? '';
}

export function resolveModelsUrl(provider: ProviderId, customUrl?: string): string | null {
  if (provider === 'custom') {
    const base = (customUrl || '').trim().replace(/\/+$/, '');
    return base ? `${base}/models` : null;
  }
  return PRESETS[provider]?.modelsUrl ?? null;
}

export function providerNeedsKey(provider: ProviderId): boolean {
  if (provider === 'custom') return true;
  return PRESETS[provider]?.needsKey ?? true;
}
```

### E1.3 — Update `SidebarProvider` to use provider resolver

**File:** `src/ui/SidebarProvider.ts`

**Change in `handleUserQuestion`** (line 314): replace:

```typescript
const apiBaseUrl = config.get<string>('apiBaseUrl', 'https://openrouter.ai/api/v1');
const modelName = config.get<string>('modelName', 'deepseek/deepseek-chat');
```

with:

```typescript
import { resolveBaseUrl, ProviderId } from '../llm/providers';

const provider = config.get<ProviderId>('provider', 'openrouter');
const customUrl = config.get<string>('apiBaseUrl', '');
const apiBaseUrl = resolveBaseUrl(provider, customUrl);
const modelName = config.get<string>('modelName', 'deepseek/deepseek-chat');
```

Do the same resolution in `sendModelName()` if needed.

### E1.4 — Fix API key prompt text

**File:** `src/ui/SidebarProvider.ts`, method `promptAndSaveApiKey()` (line 167)

Replace lines 169–171:

```typescript
const promptText = currentKey
  ? 'Update your OpenRouter or DeepSeek API key (press Enter to save, Esc to cancel)'
  : 'Enter your OpenRouter or DeepSeek API key to enable answers';
```

with:

```typescript
const promptText = currentKey
  ? 'Update your API key (press Enter to save, Esc to cancel)'
  : 'Enter your LLM provider API key to enable answers';
```

### E1.5 — Fix the OpenRouter-specific headers in generator.ts

**File:** `src/llm/generator.ts` (lines 135–137, 249–251)

The `HTTP-Referer` and `X-Title` headers are OpenRouter-specific. Move them behind a provider check or make them conditional:

```typescript
const extraHeaders: Record<string, string> = {};
if (options.apiBaseUrl.includes('openrouter.ai')) {
  extraHeaders['HTTP-Referer'] = 'https://github.com/abhishek3059/Agentic-chat-QA-bot';
  extraHeaders['X-Title'] = 'QA Assistant';
}
```

Then merge into the headers object for both `generateAnswer` and `generateAnswerStreaming`.

### E1.6 — Add provider dropdown to VS Code Settings UI

Already handled by E1.1 — the `enum` + `enumDescriptions` in `package.json` renders as a dropdown in the Settings UI.

### E1.7 — Tests for provider resolver

**New file:** `test/unit/providers.test.ts`

Test cases:
- `resolveBaseUrl('openai')` → `'https://api.openai.com/v1'`
- `resolveBaseUrl('custom', 'http://localhost:8080/v1')` → `'http://localhost:8080/v1'`
- `resolveBaseUrl('custom', '')` → `''`
- `resolveModelsUrl('openrouter')` → `'https://openrouter.ai/api/v1/models'`
- `resolveModelsUrl('custom', '')` → `null`
- `providerNeedsKey('ollama')` → `false`
- `providerNeedsKey('openai')` → `true`

### E1 Definition of Done
- `npm run compile` clean
- `npm test` green (existing + new provider tests)
- Settings UI shows "QA Assistant > Provider" dropdown with 5 options
- Selecting a preset auto-resolves the base URL (user doesn't see it)
- Selecting "Custom" reveals the `apiBaseUrl` text field
- API key prompt says generic "LLM provider API key"

---

## Phase E2: Fetch Model List from Provider

**Goal:** When the user clicks the model selector in the sidebar, fetch available models from the provider's `/v1/models` endpoint and show a pick-list instead of a free-text input.

### E2.1 — Create model fetcher utility

**New file:** `src/llm/modelList.ts`

```typescript
import { resolveModelsUrl, ProviderId } from './providers';

export interface ModelItem {
  id: string;
  name?: string;
  ownedBy?: string;
}

export async function fetchModels(
  provider: ProviderId,
  customUrl: string | undefined,
  apiKey: string
): Promise<ModelItem[] | null> {
  const modelsUrl = resolveModelsUrl(provider, customUrl);
  if (!modelsUrl) return null;

  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await response.json() as any;
    const rawList: any[] = data?.data ?? [];

    return rawList
      .map((m: any) => ({
        id: m.id as string,
        name: m.name as string | undefined,
        ownedBy: m.owned_by as string | undefined
      }))
      .filter((m: ModelItem) => Boolean(m.id))
      .sort((a: ModelItem, b: ModelItem) => a.id.localeCompare(b.id));
  } catch {
    return null;
  }
}
```

### E2.2 — Add webview message: `fetchModels` request/response

**Extension side (`SidebarProvider.ts`):**

Add a new case in `handleWebviewMessage`:

```typescript
case 'fetchModels':
  this.handleFetchModels();
  break;
```

New method:

```typescript
private async handleFetchModels(): Promise<void> {
  if (!this.view) return;

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
      this.view.webview.postMessage({ type: 'modelsError', error: 'Could not fetch models. Check your API key and provider settings.' });
    }
  }
}
```

**Webview side (`webviewHtml.ts`):**

Add to the inbound message handler:

```typescript
case 'modelsLoading':
  showModelLoading();
  break;
case 'modelsList':
  if (message.models) showModelPicker(message.models);
  break;
case 'modelsError':
  showModelFallback(message.error);
  break;
```

### E2.3 — Redesign the model selector UI in the webview

**File:** `src/ui/webviewHtml.ts`

Replace the current `#model-selector-btn` (a clickable `<div>` that triggers a VS Code input box) with a **self-contained webview dropdown** that:

1. On click, sends `{ type: 'fetchModels' }` to the extension
2. Shows a loading spinner while waiting
3. On `modelsList`, renders a scrollable `<ul>` dropdown with each model's `id` and optional `name`
4. On selection, sends `{ type: 'changeModel', modelId: '<selected-id>' }` to the extension
5. Falls back to a free-text `<input>` on `modelsError`

HTML structure:

```html
<div class="model-selector" id="model-selector">
  <button id="model-selector-btn" class="model-selector-trigger">
    <svg><!-- gear icon --></svg>
    <span id="current-model-name">deepseek-chat</span>
    <svg><!-- chevron --></svg>
  </button>
  <div id="model-dropdown" class="model-dropdown hidden">
    <div id="model-loading" class="model-loading hidden">
      <span class="spinner"></span> Loading models...
    </div>
    <ul id="model-list" class="model-list"></ul>
    <div id="model-fallback" class="model-fallback hidden">
      <input id="model-custom-input" type="text" placeholder="Type model ID..." />
      <button id="model-custom-save" class="btn-secondary">Use</button>
    </div>
  </div>
</div>
```

CSS additions (scoped, within the existing style block):

```css
.model-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  max-height: 240px;
  overflow-y: auto;
  background: var(--vscode-dropdown-background);
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 4px;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0,0,0,0.25);
}
.model-dropdown.hidden { display: none; }

.model-list {
  list-style: none;
  padding: 4px 0;
  margin: 0;
}
.model-list li {
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.model-list li:hover {
  background: var(--vscode-list-hoverBackground);
}
.model-list li.selected {
  background: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}
.model-list .model-id { font-weight: 500; }
.model-list .model-name { font-size: 10px; color: var(--vscode-descriptionForeground); }

.model-loading {
  padding: 12px;
  text-align: center;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
}

.model-fallback {
  padding: 6px;
  display: flex;
  gap: 4px;
}
.model-fallback input {
  flex: 1;
  padding: 4px 8px;
  font-size: 12px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: 3px;
}
```

JS logic (inside the webview `<script>` block):

```javascript
const modelSelectorBtn = document.getElementById('model-selector-btn');
const modelDropdown = document.getElementById('model-dropdown');
const modelLoading = document.getElementById('model-loading');
const modelList = document.getElementById('model-list');
const modelFallback = document.getElementById('model-fallback');
const modelCustomInput = document.getElementById('model-custom-input');
const modelCustomSave = document.getElementById('model-custom-save');
let modelDropdownOpen = false;

modelSelectorBtn.addEventListener('click', () => {
  modelDropdownOpen = !modelDropdownOpen;
  modelDropdown.classList.toggle('hidden', !modelDropdownOpen);
  if (modelDropdownOpen) {
    vscode.postMessage({ type: 'fetchModels' });
  }
});

document.addEventListener('click', (e) => {
  if (!document.getElementById('model-selector')?.contains(e.target)) {
    modelDropdown.classList.add('hidden');
    modelDropdownOpen = false;
  }
});

// In the message handler:
case 'modelsLoading':
  modelLoading.classList.remove('hidden');
  modelList.innerHTML = '';
  modelFallback.classList.add('hidden');
  break;

case 'modelsList':
  modelLoading.classList.add('hidden');
  modelList.innerHTML = '';
  if (message.models && message.models.length > 0) {
    message.models.forEach(m => {
      const li = document.createElement('li');
      li.dataset.modelId = m.id;
      const idSpan = document.createElement('span');
      idSpan.className = 'model-id';
      idSpan.textContent = m.id;
      li.appendChild(idSpan);
      if (m.name && m.name !== m.id) {
        const nameSpan = document.createElement('span');
        nameSpan.className = 'model-name';
        nameSpan.textContent = m.name;
        li.appendChild(nameSpan);
      }
      li.addEventListener('click', () => {
        vscode.postMessage({ type: 'changeModel', modelId: m.id });
        modelDropdown.classList.add('hidden');
        modelDropdownOpen = false;
      });
      modelList.appendChild(li);
    });
  } else {
    modelFallback.classList.remove('hidden');
  }
  break;

case 'modelsError':
  modelLoading.classList.add('hidden');
  modelFallback.classList.remove('hidden');
  break;
```

### E2.4 — Update `changeModel` handler in SidebarProvider

**File:** `src/ui/SidebarProvider.ts` (line 241)

Update to accept a `modelId` from the webview message OR fall back to the input box:

```typescript
case 'changeModel':
  if (message.modelId) {
    const newModel = (message.modelId as string).trim();
    if (newModel) {
      vscode.workspace.getConfiguration('contextQa').update('modelName', newModel, vscode.ConfigurationTarget.Global)
        .then(() => {
          this.sendModelName();
          vscode.window.showInformationMessage(`QA Assistant: Model updated to ${newModel}`);
        });
    }
  } else {
    vscode.window.showInputBox({
      prompt: 'Enter the model name (e.g., gpt-4o, deepseek-chat, claude-3.5-sonnet)',
      value: vscode.workspace.getConfiguration('contextQa').get<string>('modelName', 'deepseek-chat'),
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
```

### E2.5 — Tests for model fetcher

**New file:** `test/unit/modelList.test.ts`

Test cases:
- Parses OpenAI-format response (`data[].id` + `data[].owned_by`)
- Parses OpenRouter-format response (`data[].id` + `data[].name`)
- Returns null on network failure
- Returns null on 401
- Returns null on timeout
- Sorts results alphabetically by `id`
- Filters out entries without `id`

### E2 Definition of Done
- Clicking model selector in sidebar fetches models from provider
- Loading spinner shown during fetch
- Dropdown list with model IDs (and display names when available)
- Clicking a model updates config + display
- Fallback to free-text input on fetch failure or Custom provider
- Tests pass

---

## Phase E3: Settings-Based Config Panel (Optional Enhancement)

**Goal:** Let users configure provider + API key + model from the VS Code Settings UI, not just the sidebar.

### E3.1 — Wire `contextQa.provider` changes to update the sidebar

**File:** `src/ui/SidebarProvider.ts`

Add a `vscode.workspace.onDidChangeConfiguration` listener in the constructor or `resolveWebviewView`:

```typescript
const configWatcher = vscode.workspace.onDidChangeConfiguration(e => {
  if (e.affectsConfiguration('contextQa.provider') || e.affectsConfiguration('contextQa.apiBaseUrl')) {
    this.sendModelName();
  }
});
this.disposables.push(configWatcher);
```

### E3.2 — Command palette: "QA Assistant: Configure Provider"

**File:** `extension.ts`

Register a new command that opens a quick-pick for provider selection:

```typescript
const configureProviderCommand = vscode.commands.registerCommand('contextQa.configureProvider', async () => {
  const provider = await vscode.window.showQuickPick(
    [
      { label: 'OpenAI', description: 'GPT-4o, GPT-4, etc.', id: 'openai' },
      { label: 'OpenRouter', description: 'Multi-provider gateway', id: 'openrouter' },
      { label: 'DeepSeek', description: 'deepseek-chat, deepseek-reasoner', id: 'deepseek' },
      { label: 'Ollama (local)', description: 'Local models via localhost', id: 'ollama' },
      { label: 'Custom', description: 'Any OpenAI-compatible endpoint', id: 'custom' },
    ],
    { placeHolder: 'Select LLM provider' }
  );
  if (provider) {
    await vscode.workspace.getConfiguration('contextQa').update('provider', provider.id, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`QA Assistant: Provider set to ${provider.label}`);
  }
});
```

Add to `package.json` commands:

```json
{
  "command": "contextQa.configureProvider",
  "title": "QA Assistant: Configure LLM Provider"
}
```

### E3.3 — Add `package.json` `menus` entry for command palette

Ensure the new command appears in the command palette:

```json
"commandPalette": [
  { "command": "contextQa.configureProvider", "when": "true" }
]
```

### E3 Definition of Done
- Running "QA Assistant: Configure LLM Provider" from command palette shows a quick-pick dropdown
- Changing provider in Settings auto-refreshes the sidebar model display
- `npm test` + `npm run compile` clean

---

## Execution Order

```text
Phase E1 (provider dropdown + config) → Phase E2 (model fetcher + picker) → Phase E3 (settings panel)
```

Each phase is independently shippable. E1 is the minimum viable fix. E2 is the big UX win. E3 is polish.

## Files Changed Summary

| File | E1 | E2 | E3 |
|------|----|----|-----|
| `package.json` | Add `provider` config, update `apiBaseUrl` | — | Add `configureProvider` command |
| `src/llm/providers.ts` | **NEW** — provider presets + URL resolver | — | — |
| `src/llm/modelList.ts` | — | **NEW** — model fetcher | — |
| `src/llm/generator.ts` | Conditional OpenRouter headers | — | — |
| `src/ui/SidebarProvider.ts` | Use provider resolver, fix prompt text | Add `fetchModels` handler, update `changeModel` | Add config change watcher |
| `src/ui/webviewHtml.ts` | — | Redesign model selector (dropdown + fallback) | — |
| `src/extension.ts` | — | — | Register `configureProvider` command |
| `test/unit/providers.test.ts` | **NEW** | — | — |
| `test/unit/modelList.test.ts` | — | **NEW** | — |

## Security Notes

- API key stays in `SecretStorage` — never in `settings.json`, never logged
- Model list fetch uses `Authorization: Bearer` header (same as generation)
- Ollama needs no key; the fetcher sends no auth header for Ollama
- Custom provider model list fetch is best-effort; failure falls back to free-text input
- No telemetry, no external calls beyond the user's configured provider endpoint
