import { describe, expect, it } from 'vitest';
import { previewUrl } from '../../src/lib/log-utils';

describe('previewUrl', () => {
  it('returns the URL unchanged when it is not a data URL', () => {
    const url = 'https://cdn.example.com/visuals/thumbnail.jpg';
    expect(previewUrl(url)).toBe(url);
  });

  it('replaces a data URL payload with a char-count summary', () => {
    const header = 'data:image/png;base64';
    const payload = 'abc123==';
    const dataUrl = `${header},${payload}`;

    const result = previewUrl(dataUrl);
    expect(result).toBe(`${header},<${payload.length} chars>`);
    expect(result).not.toContain('abc123');
  });

  it('returns "data:<malformed>" for a data URL missing the comma', () => {
    expect(previewUrl('data:image/png;base64')).toBe('data:<malformed>');
  });
});
