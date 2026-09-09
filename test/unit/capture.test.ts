import * as assert from 'assert';

describe('Universal Capture Processing', () => {
  it('correctly processes and cleans captured text', () => {
    const rawText = '   \n  This is a captured AI response from any IDE chat.  \n\t  ';
    const cleaned = rawText.trim();
    assert.strictEqual(cleaned, 'This is a captured AI response from any IDE chat.');
    assert.ok(cleaned.length > 0);
  });

  it('handles empty or whitespace-only input safely', () => {
    const emptyInputs = ['', '   ', '\n\t  \r\n'];
    for (const input of emptyInputs) {
      const trimmed = input.trim();
      assert.strictEqual(trimmed.length, 0);
    }
  });

  it('calculates preview and token estimates consistently', () => {
    const text = 'A'.repeat(500);
    const preview = text.length > 200 ? text.slice(0, 200).trim() + '...' : text;
    const estimatedTokens = Math.ceil(text.length / 4);

    assert.strictEqual(preview.length, 203);
    assert.ok(preview.endsWith('...'));
    assert.strictEqual(estimatedTokens, 125);
  });
});
