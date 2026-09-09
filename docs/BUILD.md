# Build Requirements & Environment Spec (BUILD.md)

## Document Details
- **Document Version:** 1.0.0
- **Status:** Active / Engineering Reference
- **Applies To:** Build, Compilation, Dependencies, Packaging, and Runtime Environments

---

## 1. Runtime & Toolchain Requirements

| Component | Required Version | Notes |
|---|---|---|
| **VS Code Engine** | `^1.85.0` | Compatible with VS Code, Antigravity IDE, Cursor, Windsurf, VSCodium. |
| **Node.js** | `>= 20.0.0` | Tested on Node v20.11, v22, and v26.1. |
| **npm** | `>= 9.0.0` | Standard package manager. |
| **TypeScript** | `^5.3.3` | Strict mode enabled (`"strict": true` in `tsconfig.json`). |
| **Target ECMAScript** | `ES2022` | Configured in `tsconfig.json` for modern JS features. |
| **Module System** | `commonjs` | Standard for VS Code extension host runtime. |

---

## 2. Dependency Architecture & Selection Rationale

### 2.1 Production Dependencies
```json
"dependencies": {
  "@xenova/transformers": "^2.17.2"
}
```
* **Why `@xenova/transformers`:** 
  - Runs pure WebAssembly / ONNX runtime directly in Node.js.
  - Generates 384-dimensional dense vectors using quantized `Xenova/all-MiniLM-L6-v2`.
  - Zero external API costs, zero network latency after initial cache, complete local code privacy.
* **CRITICAL INSTALLATION FLAG (`--ignore-scripts`):**
  - When installing `@xenova/transformers`, install with:
    ```bash
    npm install --ignore-scripts
    ```
  - **Reason:** `@xenova/transformers` has an optional/unused dependency on `sharp`. On Windows, `sharp`'s native C++ compilation script crashes in `cmd.exe` when the workspace folder path contains an ampersand (`&` in `Agentic-chat-Q&A-bot`). Because our pipeline only performs text embeddings (which rely exclusively on `onnxruntime-web`/WASM), `sharp` is never used and its native build script should be bypassed.

### 2.2 Rejected Dependencies (Hard Architecture Constraints)
* **NO `antigravity-sdk`:** Dropped in Session 2. Reverse-engineered DOM patchers tamper with core IDE files (`workbench.html`), triggering VS Code cryptographic checksum integrity errors ("Your installation appears to be corrupt").
* **NO Native Vector Databases (`better-sqlite3`, `sqlite-vec`, `lancedb`):** 
  - Native C++ node-gyp bindings break across Electron ABI version bumps in VS Code updates.
  - At 5 to 35 chunks per response, an in-memory TypeScript array is orders of magnitude faster (<0.5ms) and 100% portable.

---

## 3. Build & Test Scripts (Path-Safe Architecture)

### The Windows `&` Ampersand Rule
On Windows `cmd.exe`, any command line containing raw `&` is interpreted as a command separator (e.g. `cmd1 & cmd2`). 
Because this repository directory is named `Agentic-chat-Q&A-bot`, calling raw `.bin/tsc` or `mocha.cmd` can cause `cmd.exe` syntax errors. 

**Rule:** All npm scripts invoke Node explicitly with the package's direct JS entry point:

```json
"scripts": {
  "vscode:prepublish": "npm run compile",
  "compile": "node ./node_modules/typescript/bin/tsc -p ./",
  "watch": "node ./node_modules/typescript/bin/tsc -watch -p ./",
  "pretest": "npm run compile",
  "test": "node ./node_modules/mocha/bin/mocha.js --require ts-node/register \"test/unit/**/*.test.ts\""
}
```

### Verification Commands
1. **Compile TypeScript:**
   ```bash
   npm run compile
   ```
2. **Watch Mode (during development):**
   ```bash
   npm run watch
   ```
3. **Run Automated Unit Tests:**
   ```bash
   npm test
   ```

---

## 4. Debugging in Extension Development Host

To run and debug the extension live inside a new IDE window:
1. Open this workspace in Antigravity IDE, VS Code, or Cursor.
2. Press **`F5`** (or go to **Run & Debug** in the sidebar and select **"Run Extension"**).
3. VS Code launches the `preLaunchTask: "npm: compile"`, compiles TypeScript, and opens a child **Extension Development Host** window with the extension activated.

### `.vscode/launch.json`
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}"
      ],
      "outFiles": [
        "${workspaceFolder}/out/**/*.js"
      ],
      "preLaunchTask": "npm: compile"
    }
  ]
}
```

---

## 5. Configuration Schema & Secret Storage

### VS Code Settings (`package.json` contributes.configuration)
| Key | Type | Default | Description |
|---|---|---|---|
| `contextQa.apiBaseUrl` | `string` | `"https://openrouter.ai/api/v1"` | OpenAI-compatible endpoint (OpenRouter, DeepSeek, or local Ollama). |
| `contextQa.modelName` | `string` | `"deepseek/deepseek-chat"` | Model identifier to call for generation. |
| `contextQa.topK` | `number` | `3` | Number of top matching chunks to retrieve. |
| `contextQa.maxTokensPerChunk` | `number` | `200` | Target token ceiling per chunk (calibrated to MiniLM's 256 limit). |

### API Key Security Policy
- **Never in `settings.json`:** API keys must never be written to settings, configuration files, or source control.
- **`SecretStorage` Only:** Stored exclusively in VS Code's encrypted OS keychain via `context.secrets.store('contextQa.apiKey', key)`.
- **Set API Key Command:** `Context Q&A: Set LLM API Key` prompts the user with a password input box.

---

## 6. Packaging as `.vsix`

To distribute or install the extension locally without development mode:
```bash
# Package into .vsix bundle
npx @vscode/vsce package

# Install in VS Code / Antigravity
code --install-extension agentic-chat-qa-bot-0.1.0.vsix
```
