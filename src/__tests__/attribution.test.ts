import { describe, it, expect } from 'vitest';
import { buildScoringContext, scoreClaimSource, scoreClaimAgainstSources } from '../attribution.js';
import type { Claim, SourceChunk } from '../types.js';

function makeClaim(text: string, index: number = 0): Claim {
  return {
    text,
    sentences: [text],
    startOffset: 0,
    endOffset: text.length,
    citations: [],
    isFactual: true,
    index,
  };
}

describe('buildScoringContext', () => {
  it('builds context with default weights', () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital of France.' },
    ];
    const ctx = buildScoringContext(sources);
    expect(ctx.weights.exact).toBe(0.40);
    expect(ctx.weights.fuzzy).toBe(0.25);
    expect(ctx.weights.ngram).toBe(0.20);
    expect(ctx.weights.tfidf).toBe(0.15);
    expect(ctx.weights.embedding).toBe(0);
  });

  it('uses embedding weights when embedder is provided', () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital of France.' },
    ];
    const ctx = buildScoringContext(sources, {
      embedder: () => [0.1, 0.2, 0.3],
    });
    expect(ctx.weights.embedding).toBe(0.30);
    expect(ctx.weights.exact).toBe(0.30);
  });

  it('accepts custom weights', () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Content.' },
    ];
    const ctx = buildScoringContext(sources, {
      weights: { exact: 0.5, fuzzy: 0.3, ngram: 0.1, tfidf: 0.1 },
    });
    expect(ctx.weights.exact).toBe(0.5);
    expect(ctx.weights.fuzzy).toBe(0.3);
  });

  it('pre-tokenizes sources', () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital of France.' },
    ];
    const ctx = buildScoringContext(sources);
    expect(ctx.sourceTokens.get('1')).toBeDefined();
    expect(ctx.sourceTokens.get('1')!.length).toBeGreaterThan(0);
  });
});

describe('scoreClaimSource', () => {
  it('gives high score for exact substring match', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital of France and the largest city.' },
    ];
    const ctx = buildScoringContext(sources);
    const claim = makeClaim('Paris is the capital of France');
    const attr = await scoreClaimSource(claim, sources[0], ctx);
    expect(attr.confidence).toBeGreaterThan(0.3);
    expect(attr.strategyScores.exact).toBe(1.0);
    expect(attr.primaryMatchType).toBe('exact');
  });

  it('gives low score for unrelated text', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Quantum computing uses qubits for calculations.' },
    ];
    const ctx = buildScoringContext(sources);
    const claim = makeClaim('Paris is the capital of France');
    const attr = await scoreClaimSource(claim, sources[0], ctx);
    expect(attr.confidence).toBeLessThan(0.2);
  });

  it('gives moderate score for paraphrased content', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'The capital city of France is Paris, which is also the largest city in the country.' },
    ];
    const ctx = buildScoringContext(sources);
    const claim = makeClaim('Paris is the capital of France');
    const attr = await scoreClaimSource(claim, sources[0], ctx);
    expect(attr.confidence).toBeGreaterThan(0.05);
  });

  it('includes match evidence for exact matches', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital of France and a major city.' },
    ];
    const ctx = buildScoringContext(sources);
    const claim = makeClaim('Paris is the capital of France');
    const attr = await scoreClaimSource(claim, sources[0], ctx);
    expect(attr.matchEvidence).not.toBeNull();
  });

  it('uses embedder when provided', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'The French capital.', embedding: [1, 0, 0] },
    ];
    const ctx = buildScoringContext(sources, {
      embedder: () => [1, 0, 0],
      embeddingThreshold: 0.5,
    });
    const claim = makeClaim('Paris is in France');
    const attr = await scoreClaimSource(claim, sources[0], ctx);
    expect(attr.strategyScores.embedding).toBeGreaterThan(0);
  });
});

describe('scoreClaimAgainstSources', () => {
  it('returns attributions sorted by confidence', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital of France.' },
      { id: '2', content: 'Unrelated content about cooking.' },
      { id: '3', content: 'France has Paris as its capital city.' },
    ];
    const ctx = buildScoringContext(sources);
    const claim = makeClaim('Paris is the capital of France');
    const attrs = await scoreClaimAgainstSources(claim, sources, ctx);
    expect(attrs.length).toBe(3);
    for (let i = 1; i < attrs.length; i++) {
      expect(attrs[i].confidence).toBeLessThanOrEqual(attrs[i - 1].confidence);
    }
  });

  it('best match has highest confidence', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital of France.' },
      { id: '2', content: 'Berlin is the capital of Germany.' },
    ];
    const ctx = buildScoringContext(sources);
    const claim = makeClaim('Paris is the capital of France');
    const attrs = await scoreClaimAgainstSources(claim, sources, ctx);
    expect(attrs[0].source.id).toBe('1');
  });

  it('handles empty sources', async () => {
    const ctx = buildScoringContext([]);
    const claim = makeClaim('Some claim');
    const attrs = await scoreClaimAgainstSources(claim, [], ctx);
    expect(attrs).toEqual([]);
  });
});
