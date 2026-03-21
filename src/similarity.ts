/** Default English stopwords. */
export const DEFAULT_STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to',
  'for', 'of', 'and', 'or', 'but', 'not', 'with', 'this', 'that', 'it',
  'from', 'by', 'as', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may',
  'might', 'must', 'can', 'could', 'its', 'their', 'they', 'them',
  'he', 'she', 'him', 'her', 'his', 'we', 'us', 'our', 'you', 'your',
  'i', 'me', 'my', 'so', 'if', 'then', 'than', 'no', 'yes',
  'about', 'up', 'out', 'into', 'over', 'after', 'before',
  'between', 'under', 'above', 'below', 'each', 'all', 'both',
  'few', 'more', 'most', 'other', 'some', 'such', 'only',
  'also', 'just', 'very', 'too', 'any', 'same',
]);

/**
 * Tokenize text into lowercase words, removing punctuation at boundaries.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/**
 * Tokenize and remove stopwords.
 */
export function tokenizeFiltered(text: string, stopwords?: Set<string>): string[] {
  const sw = stopwords ?? DEFAULT_STOPWORDS;
  return tokenize(text).filter((w) => !sw.has(w));
}

/**
 * Normalize text for comparison: lowercase, collapse whitespace, strip boundary punctuation.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Exact substring matching.
 * Returns 1.0 if claim is contained in source, or partial score based on
 * longest common contiguous word sequence (min 5 words).
 */
export function exactMatch(claim: string, source: string): { score: number; evidence: string | null; offset?: { start: number; end: number } } {
  const normClaim = normalize(claim);
  const normSource = normalize(source);

  if (!normClaim || !normSource) return { score: 0, evidence: null };

  // Full containment
  const idx = normSource.indexOf(normClaim);
  if (idx !== -1) {
    // Find approximate position in original source
    const lowerSource = source.toLowerCase();
    const words = normClaim.split(' ').slice(0, 3).join(' ');
    const approxIdx = lowerSource.indexOf(words);
    const start = approxIdx >= 0 ? approxIdx : 0;
    return {
      score: 1.0,
      evidence: source.slice(start, start + claim.length + 20).trim(),
      offset: { start, end: start + claim.length },
    };
  }

  // Partial: find longest contiguous word sequence from claim in source
  const claimWords = normClaim.split(' ');
  const sourceWords = normSource.split(' ');
  if (claimWords.length < 5) return { score: 0, evidence: null };

  let bestLen = 0;
  let bestStart = -1;

  for (let windowSize = Math.min(claimWords.length, sourceWords.length); windowSize >= 5; windowSize--) {
    const claimStr = claimWords.slice(0, windowSize).join(' ');
    for (let j = 0; j <= sourceWords.length - windowSize; j++) {
      const sourceStr = sourceWords.slice(j, j + windowSize).join(' ');
      if (claimStr === sourceStr) {
        bestLen = windowSize;
        bestStart = j;
        break;
      }
    }
    if (bestLen > 0) break;

    // Also try other starting positions in the claim
    for (let ci = 1; ci <= claimWords.length - windowSize; ci++) {
      const claimStr2 = claimWords.slice(ci, ci + windowSize).join(' ');
      for (let j = 0; j <= sourceWords.length - windowSize; j++) {
        const sourceStr = sourceWords.slice(j, j + windowSize).join(' ');
        if (claimStr2 === sourceStr) {
          bestLen = windowSize;
          bestStart = j;
          break;
        }
      }
      if (bestLen > 0) break;
    }
    if (bestLen > 0) break;
  }

  if (bestLen < 5) return { score: 0, evidence: null };

  const score = bestLen / claimWords.length;
  const evidence = sourceWords.slice(bestStart, bestStart + bestLen).join(' ');
  return { score: Math.min(score, 1), evidence };
}

/**
 * Levenshtein edit distance (pure implementation, no dependency).
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  if (m === 0) return n;
  if (n === 0) return m;

  // Use single-row optimization
  const row = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;

  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const val = Math.min(
        row[j] + 1,       // deletion
        row[j - 1] + 1,   // insertion
        prev + cost,       // substitution
      );
      prev = row[j];
      row[j] = val;
    }
  }

  return row[n];
}

/**
 * Fuzzy substring matching using Levenshtein distance.
 * Slides a window across the source and finds the best match.
 */
export function fuzzyMatch(
  claim: string,
  source: string,
): { score: number; evidence: string | null } {
  const normClaim = normalize(claim);
  const normSource = normalize(source);

  if (!normClaim || !normSource) return { score: 0, evidence: null };
  if (normClaim.length > normSource.length * 2) return { score: 0, evidence: null };

  const claimLen = normClaim.length;
  const minWindow = Math.max(1, Math.floor(claimLen * 0.6));
  const maxWindow = Math.ceil(claimLen * 1.5);

  // Pre-filter: compute character trigrams of claim
  const claimTrigrams = new Set<string>();
  for (let i = 0; i <= normClaim.length - 3; i++) {
    claimTrigrams.add(normClaim.slice(i, i + 3));
  }

  let bestScore = 0;
  let bestEvidence: string | null = null;

  for (let winSize = minWindow; winSize <= Math.min(maxWindow, normSource.length); winSize++) {
    const step = Math.max(1, Math.floor(winSize / 10));
    for (let pos = 0; pos <= normSource.length - winSize; pos += step) {
      const window = normSource.slice(pos, pos + winSize);

      // Trigram pre-filter: at least 30% overlap
      let trigramHits = 0;
      for (let ti = 0; ti <= window.length - 3; ti++) {
        if (claimTrigrams.has(window.slice(ti, ti + 3))) {
          trigramHits++;
        }
      }
      const trigramRatio = claimTrigrams.size > 0 ? trigramHits / claimTrigrams.size : 0;
      if (trigramRatio < 0.3) continue;

      // Full Levenshtein
      const dist = levenshtein(normClaim, window);
      const maxLen = Math.max(normClaim.length, window.length);
      const similarity = 1 - dist / maxLen;

      if (similarity > bestScore) {
        bestScore = similarity;
        bestEvidence = source.slice(pos, pos + winSize);
      }
    }
  }

  // Always return the best score found; thresholding is done by the caller
  return { score: bestScore, evidence: bestEvidence };
}

/**
 * Generate n-grams from a list of tokens.
 */
export function ngrams(tokens: string[], n: number): string[] {
  if (tokens.length < n) return [];
  const result: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    result.push(tokens.slice(i, i + n).join(' '));
  }
  return result;
}

/**
 * Jaccard similarity between two sets.
 */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Containment score: fraction of claim tokens found in source tokens.
 * High containment means the source contains the key terms of the claim.
 */
export function containment(
  claimTokens: string[],
  sourceTokens: string[],
): number {
  if (claimTokens.length === 0) return 0;
  const sourceSet = new Set(sourceTokens);
  let found = 0;
  for (const t of claimTokens) {
    if (sourceSet.has(t)) found++;
  }
  return found / claimTokens.length;
}

/**
 * N-gram overlap similarity with weighted unigram, bigram, trigram Jaccard,
 * blended with normalized containment score.
 */
export function ngramOverlap(
  claim: string,
  source: string,
  stopwords?: Set<string>,
): number {
  const claimTokens = tokenizeFiltered(claim, stopwords);
  const sourceTokens = tokenizeFiltered(source, stopwords);

  if (claimTokens.length === 0 || sourceTokens.length === 0) return 0;

  const uni = jaccard(new Set(ngrams(claimTokens, 1)), new Set(ngrams(sourceTokens, 1)));
  const bi = jaccard(new Set(ngrams(claimTokens, 2)), new Set(ngrams(sourceTokens, 2)));
  const tri = jaccard(new Set(ngrams(claimTokens, 3)), new Set(ngrams(sourceTokens, 3)));
  const cont = containment(claimTokens, sourceTokens);

  // Jaccard component
  const jaccardScore = 0.2 * uni + 0.3 * bi + 0.5 * tri;

  // Blend Jaccard with containment: containment catches cases where claim terms
  // are all present in source but interleaved with extra source terms
  return 0.6 * jaccardScore + 0.4 * cont;
}

/**
 * Build IDF map from a corpus of documents.
 */
export function buildIdf(documents: string[][], totalDocs: number): Map<string, number> {
  const df = new Map<string, number>();

  for (const doc of documents) {
    const uniqueTerms = new Set(doc);
    for (const term of uniqueTerms) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  const idf = new Map<string, number>();
  for (const [term, count] of df) {
    idf.set(term, Math.log((totalDocs + 1) / (count + 1)) + 1);
  }

  return idf;
}

/**
 * Compute TF vector for a document.
 */
export function computeTf(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }
  const total = tokens.length;
  for (const [term, count] of tf) {
    tf.set(term, count / total);
  }
  return tf;
}

/**
 * Compute TF-IDF cosine similarity between two texts.
 */
export function tfidfSimilarity(
  claimTokens: string[],
  sourceTokens: string[],
  idf: Map<string, number>,
): number {
  if (claimTokens.length === 0 || sourceTokens.length === 0) return 0;

  const claimTf = computeTf(claimTokens);
  const sourceTf = computeTf(sourceTokens);

  // Collect all terms
  const allTerms = new Set([...claimTf.keys(), ...sourceTf.keys()]);

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const term of allTerms) {
    const idfVal = idf.get(term) ?? 1;
    const a = (claimTf.get(term) ?? 0) * idfVal;
    const b = (sourceTf.get(term) ?? 0) * idfVal;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Cosine similarity between two embedding vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
