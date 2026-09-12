import * as assert from 'assert';
import { QA_MARK_INNER, qaMarkSvg } from '../../src/ui/qaMark';

describe('QA Assistant mark (src/ui/qaMark.ts, ADR-019)', () => {
    it('uses a square viewBox with generous padding', () => {
        const svg = qaMarkSvg(20);
        assert.ok(svg.includes('viewBox="0 0 64 64"'));
    });

    it('is single-color via currentColor with no gradients or fixed colors', () => {
        const svg = qaMarkSvg(20);
        assert.ok(svg.includes('stroke="currentColor"'));
        assert.ok(!svg.includes('<linearGradient'));
        assert.ok(!svg.includes('<radialGradient'));
        assert.ok(!svg.match(/#[0-9a-fA-F]{3,8}/), 'No hardcoded hex colors');
    });

    it('uses one stroke weight with bold strokes for 16px legibility', () => {
        const svg = qaMarkSvg(20);
        assert.ok(svg.includes('stroke-width="7"'));
        assert.ok(!QA_MARK_INNER.includes('stroke-width'), 'Inner art carries no competing weights');
    });

    it('renders the bracket + node concept', () => {
        assert.ok(QA_MARK_INNER.includes('<path'), 'Bracket/fragment strokes present');
        assert.ok(QA_MARK_INNER.includes('<circle'), 'Resolved node present');
    });

    it('sizes via width/height attributes', () => {
        assert.ok(qaMarkSvg(16).includes('width="16" height="16"'));
        assert.ok(qaMarkSvg(300, '').includes('width="300" height="300"'));
    });

    it('is decorative when label is empty, labelled otherwise', () => {
        assert.ok(qaMarkSvg(300, '').includes('aria-hidden="true"'));
        assert.ok(qaMarkSvg(20).includes('role="img"'));
    });
});
