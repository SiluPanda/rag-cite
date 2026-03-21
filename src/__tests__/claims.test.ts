import { describe, it, expect } from 'vitest';
import { extractClaims } from '../claims.js';

describe('extractClaims', () => {
  describe('sentence splitting', () => {
    it('splits text into sentences', () => {
      const claims = extractClaims('First sentence. Second sentence. Third sentence.');
      expect(claims.length).toBe(3);
    });

    it('handles exclamation marks', () => {
      const claims = extractClaims('Wow! That is great.');
      expect(claims.length).toBe(2);
    });

    it('handles question marks', () => {
      const claims = extractClaims('What is this? It is a test.');
      expect(claims.length).toBe(2);
    });

    it('does not split on abbreviations', () => {
      const claims = extractClaims('Dr. Smith went to the store. He bought milk.');
      expect(claims.length).toBe(2);
      expect(claims[0].text).toContain('Dr.');
    });

    it('does not split on e.g. and i.e.', () => {
      const claims = extractClaims('Some items, e.g. apples, are healthy.');
      expect(claims.length).toBe(1);
    });

    it('does not split on decimal numbers', () => {
      const claims = extractClaims('The value is 3.14 and growing. Next sentence.');
      expect(claims.length).toBe(2);
      expect(claims[0].text).toContain('3.14');
    });

    it('does not split on ellipses', () => {
      const claims = extractClaims('He said... then left.');
      expect(claims.length).toBe(1);
    });

    it('splits on double newlines (paragraph boundaries)', () => {
      const claims = extractClaims('First paragraph.\n\nSecond paragraph.');
      expect(claims.length).toBe(2);
    });

    it('does not split on single newlines within a paragraph', () => {
      const claims = extractClaims('First line.\nSecond line.');
      // Both lines should be treated as separate sentences (they end with periods)
      expect(claims.length).toBe(2);
    });

    it('handles URLs without splitting', () => {
      const claims = extractClaims('Visit https://example.com for details. Another sentence.');
      expect(claims.length).toBe(2);
    });
  });

  describe('list items', () => {
    it('treats bullet points as individual claims', () => {
      const claims = extractClaims('Key points:\n- First point\n- Second point\n- Third point');
      const factual = claims.filter((c) => c.isFactual);
      expect(factual.length).toBeGreaterThanOrEqual(3);
    });

    it('treats numbered list items as individual claims', () => {
      const claims = extractClaims('Steps:\n1. First step\n2. Second step\n3. Third step');
      const factual = claims.filter((c) => c.isFactual);
      expect(factual.length).toBeGreaterThanOrEqual(3);
    });

    it('treats asterisk bullets as individual claims', () => {
      const claims = extractClaims('Points:\n* Point A\n* Point B');
      const factual = claims.filter((c) => c.isFactual);
      expect(factual.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('clause splitting', () => {
    it('splits on semicolons', () => {
      const claims = extractClaims('Paris is in France; London is in England.');
      expect(claims.length).toBe(2);
    });

    it('splits clauses when granularity is clause', () => {
      const claims = extractClaims(
        'The product launched in 2023, and it has since gained 1 million users.',
        { claimGranularity: 'clause' },
      );
      expect(claims.length).toBe(2);
    });
  });

  describe('paragraph granularity', () => {
    it('groups by paragraphs when granularity is paragraph', () => {
      const claims = extractClaims(
        'First sentence. Second sentence.\n\nThird sentence. Fourth sentence.',
        { claimGranularity: 'paragraph' },
      );
      expect(claims.length).toBe(2);
    });
  });

  describe('non-factual filtering', () => {
    it('marks questions as non-factual', () => {
      const claims = extractClaims('What is the capital of France?');
      expect(claims[0].isFactual).toBe(false);
    });

    it('marks hedging language as non-factual', () => {
      const claims = extractClaims('I think this might be true.');
      expect(claims[0].isFactual).toBe(false);
    });

    it('marks meta-commentary as non-factual', () => {
      const claims = extractClaims('As mentioned above, the data shows growth.');
      expect(claims[0].isFactual).toBe(false);
    });

    it('marks greetings as non-factual', () => {
      const claims = extractClaims('Great question!');
      expect(claims[0].isFactual).toBe(false);
    });

    it('marks AI disclaimers as non-factual', () => {
      const claims = extractClaims("I'm an AI assistant and cannot guarantee accuracy.");
      expect(claims[0].isFactual).toBe(false);
    });

    it('marks "I hope this helps" as non-factual', () => {
      const claims = extractClaims('I hope this helps!');
      expect(claims[0].isFactual).toBe(false);
    });

    it('keeps factual assertions as factual', () => {
      const claims = extractClaims('Paris is the capital of France.');
      expect(claims[0].isFactual).toBe(true);
    });

    it('keeps claims with data as factual', () => {
      const claims = extractClaims('Revenue grew by 15% in Q3 2023.');
      expect(claims[0].isFactual).toBe(true);
    });

    it('keeps complex factual statements as factual', () => {
      const claims = extractClaims(
        'The study found that 73% of participants reported improvement.',
      );
      expect(claims[0].isFactual).toBe(true);
    });
  });

  describe('citation stripping', () => {
    it('strips [N] markers from claim text', () => {
      const claims = extractClaims('Paris is the capital [1].');
      expect(claims[0].text).not.toContain('[1]');
      expect(claims[0].text).toContain('Paris is the capital');
    });

    it('strips [Source N] markers', () => {
      const claims = extractClaims('Some fact [Source 1].');
      expect(claims[0].text).not.toContain('[Source 1]');
    });

    it('strips parenthetical author-year citations', () => {
      const claims = extractClaims('A finding (Smith 2023).');
      expect(claims[0].text).not.toContain('(Smith 2023)');
    });
  });

  describe('claim properties', () => {
    it('assigns sequential indices', () => {
      const claims = extractClaims('First claim. Second claim. Third claim.');
      expect(claims.map((c) => c.index)).toEqual([0, 1, 2]);
    });

    it('records offsets', () => {
      const claims = extractClaims('First. Second.');
      expect(claims[0].startOffset).toBeDefined();
      expect(claims[0].endOffset).toBeDefined();
      expect(claims[0].endOffset).toBeGreaterThan(claims[0].startOffset);
    });

    it('includes sentences array', () => {
      const claims = extractClaims('A single sentence.');
      expect(claims[0].sentences).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      expect(extractClaims('')).toEqual([]);
    });

    it('handles whitespace only', () => {
      expect(extractClaims('   \n\n  ')).toEqual([]);
    });

    it('handles single word', () => {
      const claims = extractClaims('Hello');
      expect(claims.length).toBe(1);
    });

    it('handles text with no sentence-ending punctuation', () => {
      const claims = extractClaims('Paris is the capital of France');
      expect(claims.length).toBe(1);
      expect(claims[0].text).toBe('Paris is the capital of France');
    });
  });
});
