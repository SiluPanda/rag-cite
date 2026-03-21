import type { Attribution, Claim, SourceChunk, CiteOptions } from './types.js';
import {
  exactMatch,
  fuzzyMatch,
  ngramOverlap,
  tfidfSimilarity,
  cosineSimilarity,
  tokenizeFiltered,
  buildIdf,
  DEFAULT_STOPWORDS,
} from './similarity.js';

/** Default strategy weights without embedding. */
const DEFAULT_WEIGHTS = {
  exact: 0.40,
  fuzzy: 0.25,
  ngram: 0.20,
  tfidf: 0.15,
  embedding: 0,
};

/** Default strategy weights with embedding. */
const DEFAULT_WEIGHTS_EMBED = {
  exact: 0.30,
  fuzzy: 0.15,
  ngram: 0.15,
  tfidf: 0.10,
  embedding: 0.30,
};

interface ScoringContext {
  idf: Map<string, number>;
  sourceTokens: Map<string, string[]>;
  stopwords: Set<string>;
  weights: Required<NonNullable<CiteOptions['weights']>>;
  fuzzyThreshold: number;
  ngramThreshold: number;
  tfidfThreshold: number;
  embeddingThreshold: number;
  attributionThreshold: number;
  embedder?: (text: string) => Promise<number[]> | number[];
  embeddingCache: Map<string, number[]>;
}

/**
 * Build scoring context from sources and options (computed once per cite() call).
 */
export function buildScoringContext(
  sources: SourceChunk[],
  options?: CiteOptions,
): ScoringContext {
  const stopwords = options?.stopwords
    ? new Set(options.stopwords)
    : DEFAULT_STOPWORDS;

  // Pre-tokenize all sources
  const sourceTokens = new Map<string, string[]>();
  const allSourceTokenLists: string[][] = [];
  for (const source of sources) {
    const tokens = tokenizeFiltered(source.content, stopwords);
    sourceTokens.set(source.id, tokens);
    allSourceTokenLists.push(tokens);
  }

  // Build IDF from all sources
  const idf = buildIdf(allSourceTokenLists, sources.length);

  const hasEmbedder = !!options?.embedder;
  const defaultWeights = hasEmbedder ? DEFAULT_WEIGHTS_EMBED : DEFAULT_WEIGHTS;
  const weights = {
    exact: options?.weights?.exact ?? defaultWeights.exact,
    fuzzy: options?.weights?.fuzzy ?? defaultWeights.fuzzy,
    ngram: options?.weights?.ngram ?? defaultWeights.ngram,
    tfidf: options?.weights?.tfidf ?? defaultWeights.tfidf,
    embedding: options?.weights?.embedding ?? defaultWeights.embedding,
  };

  return {
    idf,
    sourceTokens,
    stopwords,
    weights,
    fuzzyThreshold: options?.fuzzyThreshold ?? 0.8,
    ngramThreshold: options?.ngramThreshold ?? 0.3,
    tfidfThreshold: options?.tfidfThreshold ?? 0.3,
    embeddingThreshold: options?.embeddingThreshold ?? 0.8,
    attributionThreshold: options?.attributionThreshold ?? 0.4,
    embedder: options?.embedder,
    embeddingCache: new Map(),
  };
}

/**
 * Get or compute embedding for a text.
 */
async function getEmbedding(
  text: string,
  ctx: ScoringContext,
): Promise<number[] | null> {
  if (!ctx.embedder) return null;

  const cached = ctx.embeddingCache.get(text);
  if (cached) return cached;

  const embedding = await ctx.embedder(text);
  ctx.embeddingCache.set(text, embedding);
  return embedding;
}

/**
 * Score a single claim against a single source, returning an Attribution.
 */
export async function scoreClaimSource(
  claim: Claim,
  source: SourceChunk,
  ctx: ScoringContext,
): Promise<Attribution> {
  // Exact substring match
  const exact = exactMatch(claim.text, source.content);

  // Fuzzy substring match
  const fuzzy = fuzzyMatch(claim.text, source.content);

  // N-gram overlap
  const ngramScore = ngramOverlap(claim.text, source.content, ctx.stopwords);

  // TF-IDF cosine similarity
  const claimTokens = tokenizeFiltered(claim.text, ctx.stopwords);
  const srcTokens = ctx.sourceTokens.get(source.id) ?? tokenizeFiltered(source.content, ctx.stopwords);
  const tfidf = tfidfSimilarity(claimTokens, srcTokens, ctx.idf);

  // Embedding similarity
  let embeddingScore = 0;
  if (ctx.embedder) {
    if (source.embedding) {
      const claimEmbed = await getEmbedding(claim.text, ctx);
      if (claimEmbed) {
        embeddingScore = cosineSimilarity(claimEmbed, source.embedding);
      }
    } else {
      const claimEmbed = await getEmbedding(claim.text, ctx);
      const srcEmbed = await getEmbedding(source.content, ctx);
      if (claimEmbed && srcEmbed) {
        embeddingScore = cosineSimilarity(claimEmbed, srcEmbed);
      }
    }
    if (embeddingScore < ctx.embeddingThreshold) {
      embeddingScore = 0;
    }
  }

  // Raw scores for composite — use raw values so partial signals accumulate.
  // Individual thresholds determine whether a strategy "matched" (for reporting)
  // but all raw scores feed the composite so borderline signals combine.
  const rawFuzzy = fuzzy.score;
  const rawNgram = ngramScore;
  const rawTfidf = tfidf;

  // Composite score uses raw scores
  const composite = Math.min(1, Math.max(0,
    ctx.weights.exact * exact.score +
    ctx.weights.fuzzy * rawFuzzy +
    ctx.weights.ngram * rawNgram +
    ctx.weights.tfidf * rawTfidf +
    ctx.weights.embedding * embeddingScore,
  ));

  // Thresholded scores for reporting which strategies "matched"
  const threshFuzzy = rawFuzzy >= ctx.fuzzyThreshold ? rawFuzzy : 0;
  const threshNgram = rawNgram >= ctx.ngramThreshold ? rawNgram : 0;
  const threshTfidf = rawTfidf >= ctx.tfidfThreshold ? rawTfidf : 0;

  // Determine primary match type based on thresholded scores
  const scores: Record<string, number> = {
    exact: exact.score,
    fuzzy: threshFuzzy,
    ngram: threshNgram,
    tfidf: threshTfidf,
    embedding: embeddingScore,
  };
  const primaryMatchType = (Object.entries(scores).reduce(
    (best, [key, val]) => (val > best[1] ? [key, val] : best),
    ['exact', 0] as [string, number],
  )[0]) as Attribution['primaryMatchType'];

  // Best evidence
  const evidence = exact.evidence ?? fuzzy.evidence ?? null;
  const matchOffset = exact.offset;

  return {
    source,
    confidence: composite,
    primaryMatchType,
    strategyScores: {
      exact: exact.score,
      fuzzy: rawFuzzy,
      ngram: rawNgram,
      tfidf: rawTfidf,
      embedding: embeddingScore,
    },
    matchEvidence: evidence,
    matchOffset,
  };
}

/**
 * Score a claim against all sources and return attributions above threshold.
 */
export async function scoreClaimAgainstSources(
  claim: Claim,
  sources: SourceChunk[],
  ctx: ScoringContext,
): Promise<Attribution[]> {
  // Pre-filter sources by shared term count for large source sets
  let candidates = sources;
  if (sources.length > (ctx.attributionThreshold > 0 ? 50 : sources.length)) {
    const claimTokens = new Set(tokenizeFiltered(claim.text, ctx.stopwords));
    const scored = sources.map((s) => {
      const srcTokens = ctx.sourceTokens.get(s.id) ?? [];
      let shared = 0;
      for (const t of srcTokens) {
        if (claimTokens.has(t)) shared++;
      }
      return { source: s, shared };
    });
    scored.sort((a, b) => b.shared - a.shared);
    candidates = scored.slice(0, 50).map((s) => s.source);
  }

  const attributions: Attribution[] = [];
  for (const source of candidates) {
    const attr = await scoreClaimSource(claim, source, ctx);
    attributions.push(attr);
  }

  // Sort by confidence descending
  attributions.sort((a, b) => b.confidence - a.confidence);

  return attributions;
}
