import * as assert from 'assert';
import { getWebviewHtml } from '../../src/ui/webviewHtml';

describe('Model picker markup (src/ui/webviewHtml.ts)', () => {
    const html = getWebviewHtml('test-csp');

    it('renders the dropdown shell with loading, list, count, and fallback regions', () => {
        for (const id of [
            'id="model-selector"',
            'id="model-selector-btn"',
            'id="model-dropdown"',
            'id="model-loading"',
            'id="model-filter"',
            'id="model-list"',
            'id="model-count"',
            'id="model-fallback"',
            'id="model-custom-input"',
            'id="model-custom-save"'
        ]) {
            assert.ok(html.includes(id), `Missing element ${id}`);
        }
    });

    it('hides the dropdown, loading, filter, count, and fallback regions by default', () => {
        for (const id of ['model-dropdown', 'model-loading', 'model-filter', 'model-count', 'model-fallback']) {
            const pattern = new RegExp(`id="${id}"[^>]*class="[^"]*hidden`);
            assert.ok(pattern.test(html), `${id} should start hidden`);
        }
    });

    it('supports search, favorites, and count in the picker script', () => {
        assert.ok(html.includes('renderFilteredModels'), 'Favorites-aware re-render exists');
        assert.ok(html.includes('favoriteModelIds'), 'Favorites persist via webview state');
        assert.ok(html.includes('model-star'), 'Star toggle styled and wired');
        assert.ok(html.includes('setTimeout(renderFilteredModels, 150)'), 'Search input is debounced');
        assert.ok(html.includes('of ') && html.includes('models'), 'Count badge shows shown/total');
    });

    it('handles the model-fetch message types in the webview script', () => {
        assert.ok(html.includes("type: 'fetchModels'"), 'Requests model list from extension');
        assert.ok(html.includes("case 'modelsLoading'"), 'Handles loading state');
        assert.ok(html.includes("case 'modelsList'"), 'Handles model list');
        assert.ok(html.includes("case 'modelsError'"), 'Handles fetch failure');
        assert.ok(html.includes("type: 'changeModel', modelId:"), 'Sends picked model id');
    });

    it('opens the dropdown upward so it stays visible above the footer', () => {
        assert.ok(html.includes('bottom: calc(100% + 4px)'), 'Dropdown anchored above trigger');
    });
});
