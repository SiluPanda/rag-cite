import type {
  SourceChunk,
  CiteOptions,
  CitationReport,
  ClaimReport,
  CitationVerification,
  CitationScores,
  AnnotatedResponse,
  Citer,
} from './types.js';
import { parseCitations } from './parser.js';
import { extractClaims } from './claims.js';
import { buildScoringContext, scoreClaimAgainstSources } from './attribution.js';

/**
 * Main cite() function — runs the full citation pipeline.
 */
export async function cite(
  response: string,
  sources: SourceChunk[],
  options?: CiteOptions,
): Promise<CitationReport> {
  const startTime = Date.now();

  // Stage 1: Extract citations
  const citations = parseCitations(
    response,
    sources,
    options?.citationPatterns,
    options?.sourceMap,
  );

  // Stage 2: Extract claims
  const claims = extractClaims(
    response,
    { claimGranularity: options?.claimGranularity },
    citations,
  );

  // Associate citations with claims (update claim.citations)
  for (const claim of claims) {
    const claimCitations = citations.filter(
      (c) =>
        c.startOffset >= claim.startOffset &&
        c.startOffset <= claim.endOffset + 5, // small buffer for trailing citations
    );
    if (claimCitations.length > 0 && claim.citations.length === 0) {
      claim.citations = claimCitations;
    }
  }

  // Stage 3: Attribution matching
  const ctx = buildScoringContext(sources, options);
  const threshold = options?.attributionThreshold ?? 0.4;

  const claimReports: ClaimReport[] = [];
  const allVerifications: CitationVerification[] = [];

  for (const claim of claims) {
    if (!claim.isFactual) {
      // Non-factual claims get empty attribution
      claimReports.push({
        claim,
        attributions: [],
        isGrounded: false,
        primaryAttribution: null,
        citationVerifications: [],
      });
      continue;
    }

    // Score against all sources
    const attributions = await scoreClaimAgainstSources(claim, sources, ctx);
    const aboveThreshold = attributions.filter((a) => a.confidence >= threshold);

    const isGrounded = aboveThreshold.length > 0;
    const primaryAttribution = aboveThreshold.length > 0 ? aboveThreshold[0] : null;

    // Stage 4: Verify explicit citations on this claim
    const verifications: CitationVerification[] = [];
    for (const cit of claim.citations) {
      if (!cit.resolvedSource) {
        // Phantom citation
        verifications.push({
          citation: cit,
          claim,
          state: 'phantom',
          citedSourceAttribution: null,
          correctSources: isGrounded ? aboveThreshold : null,
        });
        continue;
      }

      // Find the attribution for the cited source
      const citedAttr = attributions.find(
        (a) => a.source.id === cit.resolvedSource!.id,
      );

      if (citedAttr && citedAttr.confidence >= threshold) {
        // Verified: cited source supports the claim
        verifications.push({
          citation: cit,
          claim,
          state: 'verified',
          citedSourceAttribution: citedAttr,
          correctSources: null,
        });
      } else if (isGrounded) {
        // Misattributed: claim is supported but by a different source
        verifications.push({
          citation: cit,
          claim,
          state: 'misattributed',
          citedSourceAttribution: citedAttr ?? null,
          correctSources: aboveThreshold,
        });
      } else {
        // Unsupported: no source supports this claim
        verifications.push({
          citation: cit,
          claim,
          state: 'unsupported',
          citedSourceAttribution: citedAttr ?? null,
          correctSources: null,
        });
      }
    }

    allVerifications.push(...verifications);

    claimReports.push({
      claim,
      attributions: aboveThreshold,
      isGrounded,
      primaryAttribution,
      citationVerifications: verifications,
    });
  }

  // Compute scores
  const scores = computeScores(claimReports, allVerifications, options);

  // Build report
  const factualClaims = claimReports.filter((cr) => cr.claim.isFactual);
  const attributed = factualClaims.filter((cr) => cr.isGrounded);
  const unattributed = factualClaims.filter((cr) => !cr.isGrounded);
  const misattributed = allVerifications.filter((v) => v.state === 'misattributed');
  const phantom = allVerifications.filter((v) => v.state === 'phantom');

  const durationMs = Date.now() - startTime;

  return {
    claims: claimReports,
    unattributed,
    attributed,
    citationVerifications: allVerifications,
    misattributed,
    phantom,
    scores,
    citations,
    claimCount: factualClaims.length,
    citationCount: citations.length,
    response,
    sources,
    durationMs,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Compute aggregate citation quality scores.
 */
function computeScores(
  claimReports: ClaimReport[],
  verifications: CitationVerification[],
  options?: CiteOptions,
): CitationScores {
  const factualClaims = claimReports.filter((cr) => cr.claim.isFactual);
  const totalFactual = factualClaims.length;

  // Grounding: fraction of factual claims with at least one attribution
  const groundedCount = factualClaims.filter((cr) => cr.isGrounded).length;
  const grounding = totalFactual > 0 ? groundedCount / totalFactual : 0;

  // Accuracy: fraction of verified citations
  const totalCitations = verifications.length;
  const verifiedCount = verifications.filter((v) => v.state === 'verified').length;
  const accuracy = totalCitations > 0 ? verifiedCount / totalCitations : null;

  // Coverage: fraction of factual claims with citations or attributions
  const citedCount = factualClaims.filter(
    (cr) => cr.claim.citations.length > 0 || cr.isGrounded,
  ).length;
  const coverage = totalFactual > 0 ? citedCount / totalFactual : 0;

  // Faithfulness: average confidence of verified citations
  const verifiedAttrs = verifications
    .filter((v) => v.state === 'verified' && v.citedSourceAttribution)
    .map((v) => v.citedSourceAttribution!.confidence);
  const faithfulness = verifiedAttrs.length > 0
    ? verifiedAttrs.reduce((sum, c) => sum + c, 0) / verifiedAttrs.length
    : grounding; // fallback to grounding if no explicit citations

  // Quality: weighted combination
  const sw = options?.scoreWeights ?? {};
  let wGrounding = sw.grounding ?? 0.35;
  let wAccuracy = sw.accuracy ?? 0.30;
  let wCoverage = sw.coverage ?? 0.15;
  let wFaithfulness = sw.faithfulness ?? 0.20;

  let quality: number;
  if (accuracy === null) {
    // Redistribute accuracy weight proportionally
    const total = wGrounding + wCoverage + wFaithfulness;
    quality = total > 0
      ? (wGrounding / total) * grounding +
        (wCoverage / total) * coverage +
        (wFaithfulness / total) * faithfulness
      : 0;
  } else {
    quality =
      wGrounding * grounding +
      wAccuracy * accuracy +
      wCoverage * coverage +
      wFaithfulness * faithfulness;
  }

  return {
    grounding,
    accuracy,
    coverage,
    faithfulness,
    quality: Math.min(1, Math.max(0, quality)),
  };
}

/**
 * Alias for cite().
 */
export const verify = cite;

/**
 * Auto-attribute and annotate the response with citation markers.
 */
export async function attribute(
  response: string,
  sources: SourceChunk[],
  options?: CiteOptions,
): Promise<AnnotatedResponse> {
  const report = await cite(response, sources, options);

  const insertedCitations: AnnotatedResponse['insertedCitations'] = [];
  let annotatedText = response;
  let offsetShift = 0;

  // Sort claim reports by offset
  const sortedClaims = [...report.claims]
    .filter((cr) => cr.claim.isFactual && cr.isGrounded && cr.claim.citations.length === 0)
    .sort((a, b) => a.claim.endOffset - b.claim.endOffset);

  for (const cr of sortedClaims) {
    if (!cr.primaryAttribution) continue;

    const marker = ` [${cr.primaryAttribution.source.id}]`;
    // Find the end of the claim text in the annotated text
    let insertPos = cr.claim.endOffset + offsetShift;

    // If there's a period or punctuation right after, insert before it
    if (insertPos < annotatedText.length && /[.!?]/.test(annotatedText[insertPos])) {
      // Insert before the punctuation
    } else if (insertPos > 0 && /[.!?]/.test(annotatedText[insertPos - 1])) {
      insertPos = insertPos - 1;
    }

    annotatedText =
      annotatedText.slice(0, insertPos) + marker + annotatedText.slice(insertPos);

    insertedCitations.push({
      marker: marker.trim(),
      source: cr.primaryAttribution.source,
      offset: insertPos,
      claim: cr.claim,
    });

    offsetShift += marker.length;
  }

  return {
    text: annotatedText,
    report,
    insertedCitations,
  };
}

/**
 * Create a configured citer instance with preset options.
 */
export function createCiter(options?: CiteOptions): Citer {
  return {
    async cite(response: string, sources: SourceChunk[], overrides?: Partial<CiteOptions>) {
      return cite(response, sources, { ...options, ...overrides });
    },
    extractCitations(response: string) {
      return parseCitations(response, undefined, options?.citationPatterns, options?.sourceMap);
    },
    extractClaims(response: string) {
      return extractClaims(response, { claimGranularity: options?.claimGranularity });
    },
    async verify(response: string, sources: SourceChunk[], overrides?: Partial<CiteOptions>) {
      return cite(response, sources, { ...options, ...overrides });
    },
    async attribute(responseText: string, sources: SourceChunk[], overrides?: Partial<CiteOptions>) {
      return attribute(responseText, sources, { ...options, ...overrides });
    },
  };
}
