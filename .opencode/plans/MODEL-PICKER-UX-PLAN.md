# Phase F: Model Picker UX — Search + Pin (Cline/Roo Code Pattern)

## Document Details
- **Created:** 2026-09-12
- **Source:** Council Meeting 4 + industry research (Cline, Roo Code, Continue, Copilot)
- **Status:** ✅ Implemented 2026-09-12 (Session 12) — 72 tests passing, compile clean. See ADR-021.
- **Tracking:** Phase F1 → F2 ✅

---

## Problem Statement

OpenRouter returns 400+ models in the sidebar picker. The flat alphabetical list is overwhelming. Industry research shows the proven pattern is **fuzzy search + favoriting/pinning**, not filtering or grouping.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Search approach | **Fuzzy substring match on `id` + `name`** | Cline uses Fuse.js; we can do simpler substring match (no dependency) since model IDs are structured (`provider/model-name`) |
| Favoriting | **Star icon per model, persisted in webview state** | Pinned models always appear at top; `vscode.getState()`/`setState()` persists across sidebar close/reopen |
| Display order | **Favorites first → alphabetical rest** | Matches Cline/Roo Code pattern |
| Custom model ID | **Already implemented** — free-text fallback on fetch failure | No change needed |
| Server-side filtering | **Not in this phase** | Can add later if needed; the search+pin pattern is sufficient per industry research |

## What Changes

### F1 — Fuzzy search + model count badge

**File:** `src/ui/webviewHtml.ts`

1. Replace the existing `model-filter` input's `input` event handler with a debounced fuzzy matcher:
   - On each keystroke (debounced 150ms), filter the full model list by checking if the query string appears anywhere in `m.id` or `(m.name || '').toLowerCase()`.
   - This is a simple `includes()` check — no Fuse.js dependency needed. Model IDs like `anthropic/claude-sonnet-4` are structured enough that substring search works well.
   - Show matching count: "47 of 312 models" in a small badge below the filter input.

2. Improve the filter input UX:
   - Auto-focus the filter input when the dropdown opens.
   - Placeholder: "Search models..." (not "Filter models...").
   - Show a clear button (×) when the filter has text.

### F2 — Favoriting / pinning

**File:** `src/ui/webviewHtml.ts`

1. Add a star/heart toggle button to each model `<li>`:
   - Clicking the star toggles the model's favorite status.
   - Favorited models get a filled star (★), non-favorited get an outline star (☆).
   - Favorites are stored in the webview's `vscode.getState()` object (persists across sidebar close/reopen within the same workspace).

2. Render order: **favorites first** (sorted alphabetically within favorites), then **non-favorites** (sorted alphabetically).

3. When the filter is active, favorites matching the query still appear at the top of filtered results.

4. The star button must stop event propagation (clicking star shouldn't select the model).

### CSS additions (within existing style block)

```css
/* Star/favorite button */
.model-star {
  background: transparent;
  border: none;
  color: var(--vscode-descriptionForeground);
  cursor: pointer;
  padding: 0 4px;
  font-size: 12px;
  line-height: 1;
  opacity: 0.6;
  flex-shrink: 0;
}
.model-star:hover { opacity: 1; }
.model-star.active { opacity: 1; color: var(--vscode-editor-foreground); }

/* Model list item layout: star | id+name */
.model-list li {
  display: flex;
  align-items: center;
  gap: 4px;
}
.model-list .model-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-width: 0;
}

/* Model count badge */
.model-count {
  padding: 2px 8px;
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
  text-align: center;
  border-top: 1px solid var(--vscode-panel-border);
}

/* Clear filter button */
.filter-clear {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: var(--vscode-descriptionForeground);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  line-height: 1;
}
.filter-clear:hover { color: var(--vscode-editor-foreground); }
.filter-wrapper { position: relative; }
```

### JS logic changes (within webview `<script>` block)

```javascript
// State
let allModels = [];  // full list from extension
let favoriteIds = new Set(JSON.parse(vscode.getState()?.favoriteModelIds || '[]'));

// On modelsList receive:
case 'modelsList':
  allModels = message.models || [];
  renderFilteredModels();
  break;

function saveFavorites() {
  const state = vscode.getState() || {};
  state.favoriteModelIds = JSON.stringify([...favoriteIds]);
  vscode.setState(state);
}

function renderFilteredModels() {
  const query = modelFilterEl.value.toLowerCase().trim();
  let filtered = allModels;
  if (query) {
    filtered = allModels.filter(m =>
      m.id.toLowerCase().includes(query) ||
      (m.name && m.name.toLowerCase().includes(query))
    );
  }

  // Sort: favorites first, then alphabetical
  filtered.sort((a, b) => {
    const aFav = favoriteIds.has(a.id) ? 0 : 1;
    const bFav = favoriteIds.has(b.id) ? 0 : 1;
    if (aFav !== bFav) return aFav - bFav;
    return a.id.localeCompare(b.id);
  });

  modelListEl.innerHTML = '';
  filtered.forEach(m => {
    const li = document.createElement('li');
    if (m.id === currentFullModelId) li.classList.add('selected');

    // Star button
    const starBtn = document.createElement('button');
    starBtn.className = 'model-star' + (favoriteIds.has(m.id) ? ' active' : '');
    starBtn.textContent = favoriteIds.has(m.id) ? '\u2605' : '\u2606';
    starBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (favoriteIds.has(m.id)) favoriteIds.delete(m.id);
      else favoriteIds.add(m.id);
      saveFavorites();
      renderFilteredModels();
    });

    // Text container
    const textDiv = document.createElement('div');
    textDiv.className = 'model-text';
    const idSpan = document.createElement('span');
    idSpan.className = 'model-id';
    idSpan.textContent = m.id;
    textDiv.appendChild(idSpan);
    if (m.name && m.name !== m.id) {
      const nameSpan = document.createElement('span');
      nameSpan.className = 'model-name';
      nameSpan.textContent = m.name;
      textDiv.appendChild(nameSpan);
    }

    li.appendChild(starBtn);
    li.appendChild(textDiv);
    li.addEventListener('click', () => {
      vscode.postMessage({ type: 'changeModel', modelId: m.id });
      closeModelDropdown();
    });
    li.dataset.searchText = (m.id + ' ' + (m.name || '')).toLowerCase();
    modelListEl.appendChild(li);
  });

  // Update count badge
  modelCountEl.textContent = query
    ? filtered.length + ' of ' + allModels.length + ' models'
    : allModels.length + ' models';
  modelCountEl.classList.remove('hidden');
}

// Filter input handler (replaces existing)
let filterDebounce;
modelFilterEl.addEventListener('input', () => {
  clearTimeout(filterDebounce);
  filterDebounce = setTimeout(renderFilteredModels, 150);
});
```

### HTML additions

```html
<!-- Inside model-dropdown, after model-filter input -->
<div id="model-count" class="model-count hidden"></div>
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/ui/webviewHtml.ts` | Rewrite `renderModelList()` → `renderFilteredModels()` with favorites, debounce search, count badge, star buttons |
| `test/unit/webviewModels.test.ts` | Add tests for favorite persistence, search filtering, sort order |

## Tests

**New/updated in `test/unit/webviewModels.test.ts`:**
- Star buttons and model-text divs are present in rendered HTML
- model-count element exists and starts hidden
- `renderFilteredModels` logic: favorites sort first, search filters by id+name substring
- `favoriteIds` persisted via `vscode.getState()`/`setState()`

**New in `test/unit/modelList.test.ts`:**
- `parseModelsResponse` unchanged — no backend changes in this phase

## Definition of Done
- `npm run compile` clean
- `npm test` green (71+ tests)
- Dropdown shows star next to each model; clicking star pins to top
- Favorites persist across sidebar close/reopen
- Typing in filter box narrows the list (debounced 150ms)
- Model count badge shows "X of Y models" when searching
- Filter auto-focuses when dropdown opens
- Custom model ID fallback still works on fetch failure
