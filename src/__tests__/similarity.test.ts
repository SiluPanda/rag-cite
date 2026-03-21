import { describe, it, expect } from 'vitest';
import {
  tokenize,
  tokenizeFiltered,
  normalize,
  exactMatch,
  fuzzyMatch,
  levenshtein,
  ngrams,
  jaccard,
  ngramOverlap,
  buildIdf,
  computeTf,
  tfidfSimilarity,
  cosineSimilarity,
} from '../similarity.js';

describe('tokenize', () => {
  it('splits on whitespace and lowercases', () => {
    expect(tokenize('Hello World')).toEqual(['hello', 'world']);
  });

  it('removes punctuation at boundaries', () => {
    expect(tokenize('Hello, world!')).toEqual(['hello', 'world']);
  });

  it('handles empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('preserves hyphens and apostrophes', () => {
    const tokens = tokenize("don't");
    expect(tokens[0]).toContain("don't");
  });
});

describe('tokenizeFiltered', () => {
  it('removes stopwords', () => {
    const result = tokenizeFiltered('the cat is on the mat');
    expect(result).not.toContain('the');
    expect(result).not.toContain('is');
    expect(result).not.toContain('on');
    expect(result).toContain('cat');
    expect(result).toContain('mat');
  });

  it('accepts custom stopwords', () => {
    const result = tokenizeFiltered('hello world', new Set(['hello']));
    expect(result).toEqual(['world']);
  });
});

describe('normalize', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalize('  Hello   World  ')).toBe('hello world');
  });

  it('removes punctuation', () => {
    expect(normalize('Hello, World!')).toBe('hello world');
  });
});

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
  });

  it('returns correct distance for substitution', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  it('handles empty strings', () => {
    expect(levenshtein('', 'hello')).toBe(5);
    expect(levenshtein('hello', '')).toBe(5);
    expect(levenshtein('', '')).toBe(0);
  });

  it('returns correct distance for insertion', () => {
    expect(levenshtein('cat', 'cats')).toBe(1);
  });

  it('returns correct distance for deletion', () => {
    expect(levenshtein('cats', 'cat')).toBe(1);
  });
});

describe('exactMatch', () => {
  it('returns 1.0 for exact containment', () => {
    const result = exactMatch(
      'Paris is the capital of France',
      'Paris is the capital of France and the largest city.',
    );
    expect(result.score).toBe(1.0);
    expect(result.evidence).not.toBeNull();
  });

  it('returns 0 for no match', () => {
    const result = exactMatch(
      'Berlin is the capital of Germany',
      'Paris is the capital of France.',
    );
    expect(result.score).toBe(0);
  });

  it('returns partial score for partial match (5+ words)', () => {
    const result = exactMatch(
      'Paris is the capital of France and very beautiful',
      'Paris is the capital of France but also expensive.',
    );
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('handles empty strings', () => {
    expect(exactMatch('', 'source').score).toBe(0);
    expect(exactMatch('claim', '').score).toBe(0);
  });
});

describe('fuzzyMatch', () => {
  it('detects near-exact matches', () => {
    const result = fuzzyMatch(
      'paris is the capital of france',
      'paris is the capitol of france',
    );
    expect(result.score).toBeGreaterThan(0.7);
  });

  it('returns low score for very different texts', () => {
    const result = fuzzyMatch(
      'the weather is nice today',
      'quantum computing uses qubits for calculations',
    );
    expect(result.score).toBeLessThan(0.3);
  });

  it('handles empty strings', () => {
    expect(fuzzyMatch('', 'source').score).toBe(0);
    expect(fuzzyMatch('claim', '').score).toBe(0);
  });
});

describe('ngrams', () => {
  it('generates unigrams', () => {
    expect(ngrams(['a', 'b', 'c'], 1)).toEqual(['a', 'b', 'c']);
  });

  it('generates bigrams', () => {
    expect(ngrams(['a', 'b', 'c'], 2)).toEqual(['a b', 'b c']);
  });

  it('generates trigrams', () => {
    expect(ngrams(['a', 'b', 'c', 'd'], 3)).toEqual(['a b c', 'b c d']);
  });

  it('returns empty for insufficient tokens', () => {
    expect(ngrams(['a'], 2)).toEqual([]);
  });
});

describe('jaccard', () => {
  it('returns 1 for identical sets', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
  });

  it('returns 0 for disjoint sets', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['c', 'd']))).toBe(0);
  });

  it('returns correct value for partial overlap', () => {
    expect(jaccard(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd']))).toBeCloseTo(0.5);
  });

  it('handles empty sets', () => {
    expect(jaccard(new Set(), new Set())).toBe(0);
  });
});

describe('ngramOverlap', () => {
  it('returns high score for identical text', () => {
    const score = ngramOverlap(
      'Paris is the capital of France',
      'Paris is the capital of France',
    );
    expect(score).toBeGreaterThan(0.5);
  });

  it('returns moderate score for overlapping text', () => {
    const score = ngramOverlap(
      'Paris is the capital of France',
      'The capital city of France is Paris and it is beautiful',
    );
    expect(score).toBeGreaterThan(0);
  });

  it('returns low score for unrelated text', () => {
    const score = ngramOverlap(
      'quantum computing research advances',
      'traditional cooking methods in Asia',
    );
    expect(score).toBeLessThan(0.1);
  });

  it('handles empty strings', () => {
    expect(ngramOverlap('', 'source')).toBe(0);
    expect(ngramOverlap('claim', '')).toBe(0);
  });
});

describe('TF-IDF', () => {
  describe('buildIdf', () => {
    it('computes IDF values', () => {
      const docs = [['paris', 'france'], ['london', 'england'], ['paris', 'city']];
      const idf = buildIdf(docs, 3);
      // 'paris' appears in 2 docs, should have lower IDF than 'france' (1 doc)
      expect(idf.get('paris')).toBeDefined();
      expect(idf.get('france')).toBeDefined();
      expect(idf.get('france')!).toBeGreaterThan(idf.get('paris')!);
    });
  });

  describe('computeTf', () => {
    it('computes term frequencies', () => {
      const tf = computeTf(['a', 'b', 'a', 'c']);
      expect(tf.get('a')).toBeCloseTo(0.5);
      expect(tf.get('b')).toBeCloseTo(0.25);
      expect(tf.get('c')).toBeCloseTo(0.25);
    });
  });

  describe('tfidfSimilarity', () => {
    it('returns high similarity for same content', () => {
      const idf = buildIdf([['paris', 'capital', 'france']], 1);
      const score = tfidfSimilarity(
        ['paris', 'capital', 'france'],
        ['paris', 'capital', 'france'],
        idf,
      );
      expect(score).toBeCloseTo(1.0);
    });

    it('returns low similarity for different content', () => {
      const idf = buildIdf(
        [['paris', 'france'], ['quantum', 'computing']],
        2,
      );
      const score = tfidfSimilarity(
        ['paris', 'france'],
        ['quantum', 'computing'],
        idf,
      );
      expect(score).toBe(0);
    });

    it('handles empty tokens', () => {
      const idf = new Map<string, number>();
      expect(tfidfSimilarity([], ['a'], idf)).toBe(0);
      expect(tfidfSimilarity(['a'], [], idf)).toBe(0);
    });
  });
});

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns correct value for similar vectors', () => {
    const score = cosineSimilarity([1, 2, 3], [1, 2, 3]);
    expect(score).toBeCloseTo(1.0);
  });

  it('handles zero vectors', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it('handles mismatched lengths', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it('handles empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });
});
