import { describe, it, expect } from 'vitest';
import { cite, verify, attribute, createCiter } from '../verify.js';
import type { SourceChunk } from '../types.js';

describe('cite (integration)', () => {
  const sources: SourceChunk[] = [
    { id: '1', content: 'Paris is the capital and largest city of France.' },
    { id: '2', content: 'The population of Paris is approximately 2.16 million inhabitants.' },
  ];

  it('produces a citation report', async () => {
    const report = await cite(
      'Paris is the capital of France [1]. It has a population of about 2.1 million [2].',
      sources,
    );

    expect(report).toBeDefined();
    expect(report.claims.length).toBeGreaterThan(0);
    expect(report.citations.length).toBe(2);
    expect(report.scores).toBeDefined();
    expect(report.scores.grounding).toBeGreaterThanOrEqual(0);
    expect(report.scores.grounding).toBeLessThanOrEqual(1);
    expect(report.response).toBe('Paris is the capital of France [1]. It has a population of about 2.1 million [2].');
    expect(report.sources).toEqual(sources);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
    expect(report.timestamp).toBeDefined();
  });

  it('detects grounded claims', async () => {
    const report = await cite(
      'Paris is the capital of France [1].',
      sources,
    );

    const factualClaims = report.claims.filter((cr) => cr.claim.isFactual);
    expect(factualClaims.length).toBeGreaterThan(0);
    // The claim about Paris should be grounded since source 1 contains it
    const groundedClaims = factualClaims.filter((cr) => cr.isGrounded);
    expect(groundedClaims.length).toBeGreaterThan(0);
  });

  it('detects ungrounded claims', async () => {
    const report = await cite(
      'Paris is the capital of France. The weather in Paris is sunny today.',
      sources,
    );

    // Second claim about weather should not be grounded
    const unattributed = report.unattributed;
    expect(unattributed.length).toBeGreaterThan(0);
  });

  it('correctly reports citation count', async () => {
    const report = await cite(
      'Claim one [1]. Claim two [2]. No citation here.',
      sources,
    );
    expect(report.citationCount).toBe(2);
  });

  it('handles response with no citations', async () => {
    const report = await cite(
      'Paris is the capital of France.',
      sources,
    );
    expect(report.citationCount).toBe(0);
    expect(report.scores.accuracy).toBeNull();
  });

  it('detects phantom citations', async () => {
    const report = await cite(
      'Some claim [5].',
      sources,
    );
    expect(report.phantom.length).toBeGreaterThan(0);
  });

  it('reports correct claim count (factual only)', async () => {
    const report = await cite(
      'Factual claim. What is this? Another fact.',
      sources,
    );
    // Question should not be counted
    expect(report.claimCount).toBe(2);
  });

  it('filters non-factual claims from grounding calculation', async () => {
    const report = await cite(
      'Paris is the capital of France. What else? I hope this helps!',
      sources,
    );
    // Only the factual claim should affect grounding
    expect(report.claimCount).toBe(1);
  });

  it('handles empty response', async () => {
    const report = await cite('', sources);
    expect(report.claims.length).toBe(0);
    expect(report.claimCount).toBe(0);
    expect(report.scores.grounding).toBe(0);
  });

  it('handles empty sources', async () => {
    const report = await cite('Some claim.', []);
    expect(report.scores.grounding).toBe(0);
  });
});

describe('cite scores', () => {
  it('computes grounding score', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital of France.' },
    ];
    const report = await cite('Paris is the capital of France.', sources);
    expect(report.scores.grounding).toBeGreaterThan(0);
  });

  it('computes accuracy score for verified citations', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital of France.' },
    ];
    const report = await cite('Paris is the capital of France [1].', sources);
    if (report.scores.accuracy !== null) {
      expect(report.scores.accuracy).toBeGreaterThanOrEqual(0);
      expect(report.scores.accuracy).toBeLessThanOrEqual(1);
    }
  });

  it('computes coverage score', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital of France.' },
    ];
    const report = await cite('Paris is the capital of France [1].', sources);
    expect(report.scores.coverage).toBeGreaterThanOrEqual(0);
    expect(report.scores.coverage).toBeLessThanOrEqual(1);
  });

  it('quality score is between 0 and 1', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital of France.' },
    ];
    const report = await cite('Paris is the capital of France [1].', sources);
    expect(report.scores.quality).toBeGreaterThanOrEqual(0);
    expect(report.scores.quality).toBeLessThanOrEqual(1);
  });
});

describe('cite options', () => {
  it('respects custom attribution threshold', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital of France.' },
    ];
    // Very high threshold should make matching harder
    const report = await cite('Paris is the capital of France.', sources, {
      attributionThreshold: 0.99,
    });
    // With such a high threshold, claims might not be grounded unless exact
    expect(report.scores.grounding).toBeDefined();
  });

  it('respects custom score weights', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital of France.' },
    ];
    const report = await cite('Paris is the capital of France [1].', sources, {
      scoreWeights: {
        grounding: 1.0,
        accuracy: 0,
        coverage: 0,
        faithfulness: 0,
      },
    });
    expect(report.scores.quality).toBeDefined();
  });

  it('supports claim granularity option', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital.' },
    ];
    const reportSentence = await cite(
      'Paris is the capital, and London is too.',
      sources,
      { claimGranularity: 'sentence' },
    );
    const reportClause = await cite(
      'Paris is the capital, and London is too.',
      sources,
      { claimGranularity: 'clause' },
    );
    expect(reportClause.claimCount).toBeGreaterThanOrEqual(reportSentence.claimCount);
  });

  it('uses embedder when provided', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital.', embedding: [1, 0, 0] },
    ];
    const report = await cite('Paris info.', sources, {
      embedder: () => [1, 0, 0],
      embeddingThreshold: 0.5,
    });
    expect(report).toBeDefined();
  });
});

describe('verify', () => {
  it('is an alias for cite', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital of France.' },
    ];
    const report = await verify('Paris is the capital of France [1].', sources);
    expect(report.scores).toBeDefined();
    expect(report.claims.length).toBeGreaterThan(0);
  });
});

describe('attribute', () => {
  it('inserts citation markers into uncited response', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital of France.' },
      { id: '2', content: 'London is the capital of England.' },
    ];
    const result = await attribute(
      'Paris is the capital of France.',
      sources,
    );
    expect(result.text).toBeDefined();
    expect(result.report).toBeDefined();
    expect(result.insertedCitations).toBeDefined();
  });

  it('returns annotated response with report', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital of France.' },
    ];
    const result = await attribute(
      'Paris is the capital of France.',
      sources,
    );
    expect(result.report.scores).toBeDefined();
  });

  it('does not duplicate citations for already-cited claims', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital of France.' },
    ];
    const result = await attribute(
      'Paris is the capital of France [1].',
      sources,
    );
    // Should not insert additional citations for already-cited claims
    expect(result.insertedCitations.length).toBe(0);
  });
});

describe('createCiter', () => {
  it('creates a citer instance', () => {
    const citer = createCiter();
    expect(citer.cite).toBeTypeOf('function');
    expect(citer.verify).toBeTypeOf('function');
    expect(citer.extractCitations).toBeTypeOf('function');
    expect(citer.extractClaims).toBeTypeOf('function');
    expect(citer.attribute).toBeTypeOf('function');
  });

  it('citer.cite runs the pipeline', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital of France.' },
    ];
    const citer = createCiter({ attributionThreshold: 0.3 });
    const report = await citer.cite('Paris is the capital of France [1].', sources);
    expect(report.scores).toBeDefined();
  });

  it('citer.extractCitations extracts citations', () => {
    const citer = createCiter();
    const citations = citer.extractCitations('Some claim [1].');
    expect(citations.length).toBe(1);
  });

  it('citer.extractClaims extracts claims', () => {
    const citer = createCiter();
    const claims = citer.extractClaims('First claim. Second claim.');
    expect(claims.length).toBe(2);
  });

  it('citer.verify is alias for cite', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital of France.' },
    ];
    const citer = createCiter();
    const report = await citer.verify('Paris is the capital of France [1].', sources);
    expect(report.scores).toBeDefined();
  });

  it('citer.attribute returns annotated response', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital of France.' },
    ];
    const citer = createCiter();
    const result = await citer.attribute('Paris is the capital of France.', sources);
    expect(result.text).toBeDefined();
    expect(result.report).toBeDefined();
  });

  it('preset options are applied', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital of France.' },
    ];
    const citer = createCiter({
      attributionThreshold: 0.99,
    });
    const report = await citer.cite('Paris is the capital of France.', sources);
    // Very high threshold might make nothing grounded
    expect(report.scores.grounding).toBeDefined();
  });

  it('overrides can override preset options', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris is the capital of France.' },
    ];
    const citer = createCiter({
      attributionThreshold: 0.99,
    });
    const report = await citer.cite('Paris is the capital of France.', sources, {
      attributionThreshold: 0.1,
    });
    expect(report.scores.grounding).toBeDefined();
  });
});

describe('complex scenarios', () => {
  it('handles multi-source response', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Paris, the capital of France, is located on the Seine River.' },
      { id: '2', content: 'Paris has a population of about 2.16 million people within its city limits.' },
      { id: '3', content: 'The Eiffel Tower was completed in 1889 for the World Fair.' },
    ];
    const report = await cite(
      'Paris is the capital of France [1]. It has about 2.16 million residents [2]. The Eiffel Tower was built in 1889 [3].',
      sources,
    );
    expect(report.citationCount).toBe(3);
    expect(report.claimCount).toBeGreaterThanOrEqual(2);
  });

  it('handles response with mixed citation formats', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'First source content.' },
      { id: '2', content: 'Second source content.', metadata: { title: 'Report' } },
    ];
    const report = await cite(
      'First claim [1]. Second claim [Source: Report].',
      sources,
    );
    expect(report.citations.length).toBeGreaterThanOrEqual(2);
  });

  it('handles long response with many claims', async () => {
    const sources: SourceChunk[] = [
      { id: '1', content: 'Machine learning is a subset of artificial intelligence.' },
      { id: '2', content: 'Deep learning uses neural networks with multiple layers.' },
    ];
    const report = await cite(
      'Machine learning is a subset of AI. Deep learning uses neural networks. These networks have multiple layers. Training requires large datasets. GPUs accelerate the training process.',
      sources,
    );
    expect(report.claimCount).toBeGreaterThanOrEqual(4);
    expect(report.attributed.length).toBeGreaterThan(0);
    expect(report.unattributed.length).toBeGreaterThan(0);
  });

  it('handles custom citation patterns', async () => {
    const sources: SourceChunk[] = [
      { id: 'abc', content: 'Paris is the capital of France.' },
    ];
    const report = await cite(
      'Paris is the capital {ref:abc}.',
      sources,
      {
        citationPatterns: [
          {
            name: 'custom',
            pattern: /\{ref:(\w+)\}/g,
            extract: (match) => ({ format: 'custom', id: match[1] }),
          },
        ],
      },
    );
    expect(report.citationCount).toBe(1);
  });
});
