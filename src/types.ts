/** Metadata associated with a source chunk. */
export interface SourceMetadata {
  /** Document title. */
  title?: string;
  /** Source URL. */
  url?: string;
  /** Author name(s). */
  author?: string;
  /** Publication year. */
  year?: string | number;
  /** Section or heading within the document. */
  section?: string;
  /** Page number within the document. */
  page?: number;
  /** Arbitrary additional metadata. */
  [key: string]: unknown;
}

/** A source chunk provided as context to the LLM. */
export interface SourceChunk {
  /** Unique identifier for this source. Used for citation matching. */
  id: string;
  /** The text content of the source chunk. */
  content: string;
  /** Optional metadata for named/parenthetical citation matching. */
  metadata?: SourceMetadata;
  /** Optional pre-computed embedding vector. */
  embedding?: number[];
}

/** A citation extracted from the LLM response. */
export interface Citation {
  /** The citation format that was detected. */
  format: 'numbered' | 'named' | 'parenthetical' | 'footnote' | 'url' | 'custom';
  /** The raw citation identifier (e.g., '1', 'Wikipedia', 'Smith 2023'). */
  id: string;
  /** Character offset of the citation marker in the response. */
  startOffset: number;
  endOffset: number;
  /** The text span that this citation covers (the claim text). */
  coveredText: string;
  /** Character offset of the covered text. */
  coveredStartOffset: number;
  coveredEndOffset: number;
  /** The source chunk this citation resolves to (null if phantom). */
  resolvedSource: SourceChunk | null;
}

/** A verifiable claim extracted from the LLM response. */
export interface Claim {
  /** The claim text. */
  text: string;
  /** The original sentence(s) from which the claim was extracted. */
  sentences: string[];
  /** Character offset in the original response. */
  startOffset: number;
  endOffset: number;
  /** Explicit citations attached to this claim. */
  citations: Citation[];
  /** Whether this claim was classified as a factual assertion. */
  isFactual: boolean;
  /** Sequential index in the claim list. */
  index: number;
}

/** The result of matching a single claim against a single source. */
export interface Attribution {
  /** The matched source chunk. */
  source: SourceChunk;
  /** The composite confidence score (0.0 to 1.0). */
  confidence: number;
  /** Which matching strategy produced the strongest signal. */
  primaryMatchType: 'exact' | 'fuzzy' | 'ngram' | 'tfidf' | 'embedding';
  /** Per-strategy scores. */
  strategyScores: {
    exact: number;
    fuzzy: number;
    ngram: number;
    tfidf: number;
    embedding: number;
  };
  /** The specific substring in the source that best matches the claim.
   *  Null if the match is not substring-based (e.g., TF-IDF only). */
  matchEvidence: string | null;
  /** Character offset of the match evidence within the source content. */
  matchOffset?: { start: number; end: number };
}

/** The verification result for a single explicit citation. */
export interface CitationVerification {
  /** The citation being verified. */
  citation: Citation;
  /** The claim the citation is attached to. */
  claim: Claim;
  /** The verification state. */
  state: 'verified' | 'misattributed' | 'unsupported' | 'phantom';
  /** The attribution result for the cited source (null if phantom). */
  citedSourceAttribution: Attribution | null;
  /** If misattributed, the correct source(s). */
  correctSources: Attribution[] | null;
}

/** The full attribution result for a single claim. */
export interface ClaimReport {
  /** The claim. */
  claim: Claim;
  /** All attributions above the threshold, sorted by confidence descending. */
  attributions: Attribution[];
  /** Whether the claim is grounded (has at least one attribution). */
  isGrounded: boolean;
  /** The primary attribution (highest confidence), or null if ungrounded. */
  primaryAttribution: Attribution | null;
  /** Verification results for any explicit citations on this claim. */
  citationVerifications: CitationVerification[];
}

/** Aggregate citation quality scores. */
export interface CitationScores {
  /** Fraction of factual claims supported by at least one source (0.0-1.0). */
  grounding: number;
  /** Fraction of explicit citations that correctly identify a supporting source.
   *  Null if the response has no explicit citations. */
  accuracy: number | null;
  /** Fraction of factual claims that have citations or attributions (0.0-1.0). */
  coverage: number;
  /** Average attribution confidence for verified citations (0.0-1.0). */
  faithfulness: number;
  /** Weighted overall quality score (0.0-1.0). */
  quality: number;
}

/** The complete citation report returned by cite(). */
export interface CitationReport {
  /** Per-claim attribution details. */
  claims: ClaimReport[];
  /** Claims with no source attribution (potential hallucinations or parametric knowledge). */
  unattributed: ClaimReport[];
  /** Claims with verified attributions. */
  attributed: ClaimReport[];
  /** Explicit citations and their verification results. */
  citationVerifications: CitationVerification[];
  /** Misattributed citations (wrong source cited). */
  misattributed: CitationVerification[];
  /** Phantom citations (source identifier does not exist). */
  phantom: CitationVerification[];
  /** Aggregate quality scores. */
  scores: CitationScores;
  /** All extracted citations from the response. */
  citations: Citation[];
  /** Total number of factual claims. */
  claimCount: number;
  /** Total number of explicit citations. */
  citationCount: number;
  /** The original response text. */
  response: string;
  /** The provided source chunks. */
  sources: SourceChunk[];
  /** Wall-clock time for the analysis, in milliseconds. */
  durationMs: number;
  /** ISO 8601 timestamp of when the analysis was performed. */
  timestamp: string;
}

/** A custom citation pattern. */
export interface CitationPattern {
  /** Pattern name for identification. */
  name: string;
  /** Regex to detect the citation marker. Must have the global flag. */
  pattern: RegExp;
  /** Function to extract citation metadata from a regex match. */
  extract: (match: RegExpMatchArray) => { format: string; id: string };
}

/** Configuration options for the cite() function. */
export interface CiteOptions {
  /** Attribution threshold. Default: 0.4. */
  attributionThreshold?: number;
  /** Fuzzy matching threshold. Default: 0.8. */
  fuzzyThreshold?: number;
  /** N-gram overlap threshold. Default: 0.3. */
  ngramThreshold?: number;
  /** TF-IDF cosine threshold. Default: 0.3. */
  tfidfThreshold?: number;
  /** Embedding similarity threshold. Default: 0.8. */
  embeddingThreshold?: number;
  /** Strategy weights for composite scoring. */
  weights?: {
    exact?: number;
    fuzzy?: number;
    ngram?: number;
    tfidf?: number;
    embedding?: number;
  };
  /** Score weights for overall quality calculation. */
  scoreWeights?: {
    grounding?: number;
    accuracy?: number;
    coverage?: number;
    faithfulness?: number;
  };
  /** Optional embedding function for semantic matching. */
  embedder?: (text: string) => Promise<number[]> | number[];
  /** Citation pattern detection configuration. */
  citationPatterns?: CitationPattern[];
  /** Claim extraction granularity. Default: 'sentence'. */
  claimGranularity?: 'sentence' | 'clause' | 'paragraph';
  /** Map from citation identifiers to source chunk IDs. */
  sourceMap?: Record<string, string>;
  /** Stopwords to remove during n-gram and TF-IDF computation. */
  stopwords?: string[];
  /** Maximum number of source chunks to compare against each claim. Default: 50. */
  maxSourcesPerClaim?: number;
}

/** A configured citer instance created by createCiter(). */
export interface Citer {
  /** Run the full citation pipeline with preset options. */
  cite(response: string, sources: SourceChunk[], overrides?: Partial<CiteOptions>): Promise<CitationReport>;
  /** Extract citations only. */
  extractCitations(response: string): Citation[];
  /** Extract claims only. */
  extractClaims(response: string): Claim[];
  /** Verify citations against sources. */
  verify(response: string, sources: SourceChunk[], overrides?: Partial<CiteOptions>): Promise<CitationReport>;
  /** Auto-attribute and annotate the response with citation markers. */
  attribute(response: string, sources: SourceChunk[], overrides?: Partial<CiteOptions>): Promise<AnnotatedResponse>;
}

/** A response annotated with auto-generated citation markers. */
export interface AnnotatedResponse {
  /** The response text with inserted citation markers. */
  text: string;
  /** The citation report for the annotated response. */
  report: CitationReport;
  /** Mapping from inserted citation markers to source chunks. */
  insertedCitations: Array<{
    marker: string;
    source: SourceChunk;
    offset: number;
    claim: Claim;
  }>;
}
