// rag-cite - Extract and verify inline citations from LLM responses

export { cite, verify, attribute, createCiter } from './verify.js';
export { parseCitations as extractCitations } from './parser.js';
export { extractClaims } from './claims.js';

export type {
  SourceChunk,
  SourceMetadata,
  Citation,
  Claim,
  Attribution,
  CitationVerification,
  ClaimReport,
  CitationScores,
  CitationReport,
  CiteOptions,
  CitationPattern,
  Citer,
  AnnotatedResponse,
} from './types.js';
