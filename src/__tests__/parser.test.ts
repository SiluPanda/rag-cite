import { describe, it, expect } from 'vitest';
import { parseCitations } from '../parser.js';
import type { SourceChunk } from '../types.js';

describe('parseCitations', () => {
  describe('numbered references', () => {
    it('detects [N] citations', () => {
      const result = parseCitations('Paris is the capital of France [1].');
      expect(result.length).toBe(1);
      expect(result[0].format).toBe('numbered');
      expect(result[0].id).toBe('1');
    });

    it('detects multiple numbered citations', () => {
      const result = parseCitations('Claim one [1]. Claim two [2]. Claim three [3].');
      expect(result.length).toBe(3);
      expect(result.map((c) => c.id)).toEqual(['1', '2', '3']);
    });

    it('detects comma-separated citations [1, 2, 3]', () => {
      const result = parseCitations('Some claim [1, 2, 3].');
      expect(result.length).toBe(3);
      expect(result.map((c) => c.id)).toEqual(['1', '2', '3']);
    });

    it('detects range citations [1-3]', () => {
      const result = parseCitations('Some claim [1-3].');
      expect(result.length).toBe(3);
      expect(result.map((c) => c.id)).toEqual(['1', '2', '3']);
    });

    it('detects [Source N] citations', () => {
      const result = parseCitations('Some claim [Source 1].');
      expect(result.length).toBe(1);
      expect(result[0].format).toBe('numbered');
      expect(result[0].id).toBe('1');
    });

    it('detects [Ref N] citations', () => {
      const result = parseCitations('Some claim [Ref 2].');
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('2');
    });
  });

  describe('named references', () => {
    it('detects [Source: Name] citations', () => {
      const result = parseCitations('Some claim [Source: Wikipedia].');
      expect(result.length).toBe(1);
      expect(result[0].format).toBe('named');
      expect(result[0].id).toBe('Wikipedia');
    });

    it('detects [Doc: Name] citations', () => {
      const result = parseCitations('Some claim [Doc: API Reference].');
      expect(result.length).toBe(1);
      expect(result[0].format).toBe('named');
      expect(result[0].id).toBe('API Reference');
    });

    it('detects generic [Name] citations', () => {
      const result = parseCitations('Some claim [Wikipedia].');
      expect(result.length).toBe(1);
      expect(result[0].format).toBe('named');
      expect(result[0].id).toBe('Wikipedia');
    });

    it('does not match markdown links as named citations', () => {
      const result = parseCitations('Check [this link](https://example.com).');
      // Should detect as URL, not named
      const named = result.filter((c) => c.format === 'named');
      expect(named.length).toBe(0);
    });
  });

  describe('parenthetical references', () => {
    it('detects (Author Year) citations', () => {
      const result = parseCitations('Some claim (Smith 2023).');
      expect(result.length).toBe(1);
      expect(result[0].format).toBe('parenthetical');
      expect(result[0].id).toBe('Smith 2023');
    });

    it('detects (Author, Year) citations', () => {
      const result = parseCitations('Some claim (Johnson, 2024).');
      expect(result.length).toBe(1);
      expect(result[0].format).toBe('parenthetical');
      expect(result[0].id).toBe('Johnson 2024');
    });

    it('detects (Source N) citations', () => {
      const result = parseCitations('Some claim (Source 1).');
      expect(result.length).toBe(1);
      expect(result[0].format).toBe('parenthetical');
      expect(result[0].id).toBe('1');
    });

    it('detects (Author et al. Year)', () => {
      const result = parseCitations('Some claim (Johnson et al. 2024).');
      expect(result.length).toBe(1);
      expect(result[0].format).toBe('parenthetical');
    });
  });

  describe('footnote references', () => {
    it('detects [^N] citations', () => {
      const result = parseCitations('Some claim [^1].');
      expect(result.length).toBe(1);
      expect(result[0].format).toBe('footnote');
      expect(result[0].id).toBe('1');
    });

    it('detects ^[N] citations', () => {
      const result = parseCitations('Some claim ^[2].');
      expect(result.length).toBe(1);
      expect(result[0].format).toBe('footnote');
      expect(result[0].id).toBe('2');
    });

    it('detects ^N citations', () => {
      const result = parseCitations('Some claim ^3 here.');
      expect(result.length).toBe(1);
      expect(result[0].format).toBe('footnote');
      expect(result[0].id).toBe('3');
    });
  });

  describe('URL references', () => {
    it('detects bare URLs', () => {
      const result = parseCitations('See https://example.com/page for details.');
      expect(result.length).toBe(1);
      expect(result[0].format).toBe('url');
      expect(result[0].id).toBe('https://example.com/page');
    });

    it('detects markdown links', () => {
      const result = parseCitations('See [here](https://example.com) for details.');
      expect(result.length).toBe(1);
      expect(result[0].format).toBe('url');
      expect(result[0].id).toBe('https://example.com');
    });
  });

  describe('custom patterns', () => {
    it('supports custom citation patterns', () => {
      const result = parseCitations('Some claim {ref:abc123}.', undefined, [
        {
          name: 'custom-bracket',
          pattern: /\{ref:(\w+)\}/g,
          extract: (match) => ({ format: 'custom', id: match[1] }),
        },
      ]);
      expect(result.length).toBe(1);
      expect(result[0].format).toBe('custom');
      expect(result[0].id).toBe('abc123');
    });
  });

  describe('source resolution', () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital of France.' },
      { id: '2', content: 'London is the capital of England.' },
    ];

    it('resolves numbered citations by index', () => {
      const result = parseCitations('Paris [1].', sources);
      expect(result[0].resolvedSource).not.toBeNull();
      expect(result[0].resolvedSource!.id).toBe('1');
    });

    it('resolves numbered citations to correct source', () => {
      const result = parseCitations('London [2].', sources);
      expect(result[0].resolvedSource!.id).toBe('2');
    });

    it('returns null for phantom citations', () => {
      const result = parseCitations('Some claim [5].', sources);
      expect(result[0].resolvedSource).toBeNull();
    });

    it('uses sourceMap for custom mapping', () => {
      const result = parseCitations('Claim [1].', sources, undefined, {
        '1': '2',
      });
      expect(result[0].resolvedSource!.id).toBe('2');
    });

    it('resolves named references by metadata title', () => {
      const sourcesWithMeta: SourceChunk[] = [
        { id: 'doc1', content: 'Content here.', metadata: { title: 'Wikipedia' } },
      ];
      const result = parseCitations('Claim [Wikipedia].', sourcesWithMeta);
      expect(result[0].resolvedSource!.id).toBe('doc1');
    });

    it('resolves parenthetical by author and year', () => {
      const sourcesWithMeta: SourceChunk[] = [
        { id: 'paper1', content: 'Content.', metadata: { author: 'Smith', year: 2023 } },
      ];
      const result = parseCitations('Claim (Smith 2023).', sourcesWithMeta);
      expect(result[0].resolvedSource!.id).toBe('paper1');
    });

    it('resolves URL by metadata url', () => {
      const sourcesWithMeta: SourceChunk[] = [
        { id: 'web1', content: 'Content.', metadata: { url: 'https://example.com' } },
      ];
      const result = parseCitations('See https://example.com for info.', sourcesWithMeta);
      expect(result[0].resolvedSource!.id).toBe('web1');
    });
  });

  describe('covered text', () => {
    it('extracts covered text for end-of-sentence citations', () => {
      const result = parseCitations('Paris is the capital of France [1].');
      expect(result[0].coveredText).toBe('Paris is the capital of France');
    });

    it('extracts covered text for mid-sentence citations', () => {
      const result = parseCitations('First claim [1], second claim [2].');
      expect(result.length).toBe(2);
      expect(result[0].coveredText).toBe('First claim');
    });

    it('handles multiple sentences', () => {
      const result = parseCitations('First sentence. Second sentence [1].');
      expect(result[0].coveredText).toBe('Second sentence');
    });
  });

  describe('no citations', () => {
    it('returns empty array for text without citations', () => {
      const result = parseCitations('This is a plain text response with no citations.');
      expect(result.length).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      expect(parseCitations('')).toEqual([]);
    });

    it('handles consecutive citations [1][2]', () => {
      const result = parseCitations('Some claim [1][2].');
      expect(result.length).toBe(2);
    });

    it('sorts citations by position', () => {
      const result = parseCitations('A [1]. B [2]. C [3].');
      for (let i = 1; i < result.length; i++) {
        expect(result[i].startOffset).toBeGreaterThanOrEqual(result[i - 1].startOffset);
      }
    });
  });
});
