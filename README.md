# rag-cite

Extraction, attribution, and verification of inline citations in LLM responses.

[![npm version](https://img.shields.io/npm/v/rag-cite.svg)](https://www.npmjs.com/package/rag-cite)
[![npm downloads](https://img.shields.io/npm/dt/rag-cite.svg)](https://www.npmjs.com/package/rag-cite)
[![license](https://img.shields.io/npm/l/rag-cite.svg)](https://github.com/SiluPanda/rag-cite/blob/master/LICENSE)
[![node](https://img.shields.io/node/v/rag-cite.svg)](https://nodejs.org)

---

## Description

`rag-cite` parses inline citations from LLM-generated responses, segments the text into verifiable claims, matches each claim against source chunks using a composite scoring pipeline, and produces a structured citation report. It answers the core questions every RAG system operator faces: which parts of the response are supported by sources, are the citations accurate, and which claims have no source backing.

The library is fully deterministic and offline. The default pipeline requires no LLM calls, no embedding models, and no API keys. It combines four text-matching strategies -- exact substring, fuzzy Levenshtein, n-gram Jaccard overlap, and TF-IDF cosine similarity -- into a weighted composite score. An optional pluggable embedder enables semantic matching for higher accuracy when embedding infrastructure is available.

Zero runtime dependencies. All matching algorithms, sentence segmentation, and citation parsing are implemented from scratch using only Node.js built-in modules.

---

## Installation

```bash
npm install rag-cite
```

Requires Node.js >= 18.

---

## Quick Start

```typescript
import { cite } from 'rag-cite';

const report = await cite(
  'Paris is the capital of France [1]. It has about 2.1 million residents [2].',
  [
    { id: '1', content: 'Paris is the capital and largest city of France.' },
    { id: '2', content: 'The population of Paris is approximately 2.16 million inhabitants.' },
  ],
);

console.log(report.scores.grounding);   // 1.0  -- all claims grounded
console.log(report.scores.accuracy);    // 1.0  -- all citations correct
console.log(report.scores.quality);     // ~0.95
console.log(report.claimCount);         // 2
console.log(report.unattributed);       // []   -- no unattributed claims
console.log(report.phantom);            // []   -- no phantom citations
```

---

## Features

- **Multi-format citation parsing** -- Numbered (`[1]`, `[1, 2]`, `[1-3]`, `[Source 1]`, `[Ref 1]`), named (`[Wikipedia]`, `[Source: Title]`, `[Doc: Name]`), parenthetical (`(Smith 2023)`, `(Author et al. 2024)`, `(Source 1)`), footnote (`[^1]`, `^[1]`, `^1`), URL (bare URLs, markdown links), and user-defined custom patterns.
- **Claim extraction with non-factual filtering** -- Sentence-level, clause-level, or paragraph-level granularity. Automatically filters questions, hedging language, meta-commentary, transition phrases, greetings, and AI disclaimers.
- **Four-strategy composite attribution** -- Exact substring matching, fuzzy Levenshtein-based near-matching, weighted n-gram Jaccard overlap with containment scoring, and TF-IDF cosine similarity with corpus-aware IDF weighting.
- **Optional embedding similarity** -- Plug in any embedding function to enable semantic matching. Pre-computed embeddings on source chunks are supported. Weights automatically redistribute when an embedder is provided.
- **Citation verification** -- Each explicit citation is classified as `verified`, `misattributed`, `unsupported`, or `phantom`.
- **Auto-attribution** -- For responses without explicit citations, the `attribute()` function matches claims to sources and inserts citation markers into the response text.
- **Aggregate quality scores** -- Grounding, accuracy, coverage, faithfulness, and a weighted overall quality score.
- **Configurable citer instances** -- `createCiter()` produces a reusable instance with preset options to avoid repeated configuration.
- **Deterministic output** -- Same inputs with same options always produce the same report. No network calls in the default pipeline.
- **TypeScript-first** -- Full type definitions for all interfaces, function signatures, and return types.

---

## API Reference

### `cite(response, sources, options?)`

Runs the full citation pipeline: extract citations, extract claims, match claims to sources, verify citations, and compute aggregate scores.

```typescript
import { cite } from 'rag-cite';

const report = await cite(
  'The Eiffel Tower was completed in 1889 [1].',
  [{ id: '1', content: 'The Eiffel Tower was completed in 1889 for the World Fair.' }],
  { attributionThreshold: 0.4 },
);
```

**Parameters:**

| Parameter  | Type            | Description                                  |
|------------|-----------------|----------------------------------------------|
| `response` | `string`        | The LLM-generated response text.             |
| `sources`  | `SourceChunk[]` | Source chunks provided as context to the LLM. |
| `options`  | `CiteOptions`   | Optional configuration (see Configuration).  |

**Returns:** `Promise<CitationReport>`

---

### `verify(response, sources, options?)`

Alias for `cite()`. Identical signature and behavior.

---

### `extractCitations(response, sources?, citationPatterns?, sourceMap?)`

Extracts citation markers from the response text without performing claim extraction or attribution. Useful when you only need to parse which citations are present.

```typescript
import { extractCitations } from 'rag-cite';

const citations = extractCitations('Revenue grew [1]. Profits also rose [2, 3].');
// citations[0] => { format: 'numbered', id: '1', ... }
// citations[1] => { format: 'numbered', id: '2', ... }
// citations[2] => { format: 'numbered', id: '3', ... }
```

**Parameters:**

| Parameter          | Type                          | Description                                |
|--------------------|-------------------------------|--------------------------------------------|
| `response`         | `string`                      | The response text to parse.                |
| `sources`          | `SourceChunk[]` (optional)    | Sources for citation resolution.           |
| `citationPatterns`  | `CitationPattern[]` (optional) | Custom citation patterns.                  |
| `sourceMap`        | `Record<string, string>` (optional) | Custom citation-to-source ID mapping. |

**Returns:** `Citation[]`

**Supported citation formats:**

| Format          | Examples                                        |
|-----------------|-------------------------------------------------|
| Numbered        | `[1]`, `[1, 2, 3]`, `[1-3]`, `[Source 1]`, `[Ref 2]` |
| Named           | `[Wikipedia]`, `[Source: Title]`, `[Doc: Name]` |
| Parenthetical   | `(Smith 2023)`, `(Johnson, 2024)`, `(Author et al. 2024)`, `(Source 1)` |
| Footnote        | `[^1]`, `^[1]`, `^1`                           |
| URL             | `https://example.com`, `[text](https://example.com)` |
| Custom          | Any pattern defined via `citationPatterns`       |

---

### `extractClaims(response, options?, citations?)`

Segments the response text into verifiable claims. Classifies each claim as factual or non-factual.

```typescript
import { extractClaims } from 'rag-cite';

const claims = extractClaims('Paris is the capital. What about London? I hope this helps!');

const factual = claims.filter(c => c.isFactual);
// factual => [{ text: 'Paris is the capital', isFactual: true, ... }]
```

**Parameters:**

| Parameter    | Type          | Description                                                |
|--------------|---------------|------------------------------------------------------------|
| `response`   | `string`      | The response text to segment.                              |
| `options`    | `object`      | Optional. `{ claimGranularity?: 'sentence' \| 'clause' \| 'paragraph' }` |
| `citations`  | `Citation[]`  | Optional. Pre-extracted citations for association.         |

**Returns:** `Claim[]`

**Non-factual filtering:** The following are classified as non-factual and excluded from grounding calculations:

- Questions (`What is X?`)
- Hedging language (`I think`, `possibly`, `might be`)
- Meta-commentary (`As mentioned above`, `In summary`)
- Transition phrases (`Moving on`, `Furthermore`)
- Greetings and closings (`Great question!`, `I hope this helps!`)
- AI disclaimers (`I'm an AI`, `My training data`)

---

### `attribute(response, sources, options?)`

Auto-attributes claims to sources and inserts citation markers into the response text for claims that lack explicit citations.

```typescript
import { attribute } from 'rag-cite';

const result = await attribute(
  'Paris is the capital of France.',
  [{ id: '1', content: 'Paris is the capital and largest city of France.' }],
);

console.log(result.text);
// 'Paris is the capital of France [1].'

console.log(result.insertedCitations);
// [{ marker: '[1]', source: { id: '1', ... }, offset: 30, claim: { ... } }]
```

**Parameters:**

| Parameter  | Type            | Description                                   |
|------------|-----------------|-----------------------------------------------|
| `response` | `string`        | The LLM-generated response text.              |
| `sources`  | `SourceChunk[]` | Source chunks for attribution.                |
| `options`  | `CiteOptions`   | Optional configuration.                       |

**Returns:** `Promise<AnnotatedResponse>`

The `AnnotatedResponse` contains:

| Field                | Type                  | Description                                       |
|----------------------|-----------------------|---------------------------------------------------|
| `text`               | `string`              | Response text with inserted citation markers.     |
| `report`             | `CitationReport`      | Full citation report for the annotated response.  |
| `insertedCitations`  | `InsertedCitation[]`  | Details on each inserted marker, source, and claim. |

---

### `createCiter(options?)`

Creates a configured citer instance with preset options. All methods on the instance accept optional overrides that merge with the preset configuration.

```typescript
import { createCiter } from 'rag-cite';

const citer = createCiter({
  attributionThreshold: 0.5,
  claimGranularity: 'clause',
});

const report = await citer.cite(response, sources);
const annotated = await citer.attribute(response, sources);
const citations = citer.extractCitations(response);
const claims = citer.extractClaims(response);
```

**Returns:** `Citer`

The `Citer` interface exposes:

| Method              | Description                                       |
|---------------------|---------------------------------------------------|
| `cite(response, sources, overrides?)` | Full pipeline with preset options.   |
| `verify(response, sources, overrides?)` | Alias for `cite()`.               |
| `extractCitations(response)` | Extract citations with preset patterns. |
| `extractClaims(response)` | Extract claims with preset granularity. |
| `attribute(response, sources, overrides?)` | Auto-attribute and annotate. |

---

## Configuration

### `CiteOptions`

All fields are optional.

```typescript
interface CiteOptions {
  /** Minimum composite score to count as attributed. Default: 0.4 */
  attributionThreshold?: number;

  /** Minimum Levenshtein-based score to register as a fuzzy match. Default: 0.8 */
  fuzzyThreshold?: number;

  /** Minimum n-gram overlap to register. Default: 0.3 */
  ngramThreshold?: number;

  /** Minimum TF-IDF cosine to register. Default: 0.3 */
  tfidfThreshold?: number;

  /** Minimum embedding cosine to register. Default: 0.8 */
  embeddingThreshold?: number;

  /** Strategy weights for composite scoring. */
  weights?: {
    exact?: number;    // Default: 0.40 (0.30 with embedder)
    fuzzy?: number;    // Default: 0.25 (0.15 with embedder)
    ngram?: number;    // Default: 0.20 (0.15 with embedder)
    tfidf?: number;    // Default: 0.15 (0.10 with embedder)
    embedding?: number; // Default: 0.00 (0.30 with embedder)
  };

  /** Score weights for overall quality calculation. */
  scoreWeights?: {
    grounding?: number;    // Default: 0.35
    accuracy?: number;     // Default: 0.30
    coverage?: number;     // Default: 0.15
    faithfulness?: number; // Default: 0.20
  };

  /** Embedding function for semantic matching. */
  embedder?: (text: string) => Promise<number[]> | number[];

  /** Custom citation patterns. */
  citationPatterns?: CitationPattern[];

  /** Enable auto-attribution for uncited claims. Default: true */
  autoAttribute?: boolean;

  /** Claim extraction granularity. Default: 'sentence' */
  claimGranularity?: 'sentence' | 'clause' | 'paragraph';

  /** Map citation identifiers to source chunk IDs. */
  sourceMap?: Record<string, string>;

  /** Custom stopwords for n-gram and TF-IDF computation. */
  stopwords?: string[];

  /** Maximum sources to compare per claim. Default: 50 */
  maxSourcesPerClaim?: number;
}
```

### Custom Citation Patterns

Define patterns for citation formats not covered by the built-in parsers.

```typescript
import { cite } from 'rag-cite';

const report = await cite(response, sources, {
  citationPatterns: [
    {
      name: 'curly-ref',
      pattern: /\{ref:(\w+)\}/g,
      extract: (match) => ({ format: 'custom', id: match[1] }),
    },
  ],
});
```

The `CitationPattern` interface:

```typescript
interface CitationPattern {
  name: string;
  pattern: RegExp;  // Must include the global flag
  extract: (match: RegExpMatchArray) => { format: string; id: string };
}
```

Custom patterns take priority over built-in patterns when they match at the same position.

### Source Map

Override automatic citation-to-source resolution with an explicit mapping.

```typescript
const report = await cite(response, sources, {
  sourceMap: {
    '1': 'doc-abc',  // Citation [1] resolves to source with id 'doc-abc'
    '2': 'doc-xyz',
  },
});
```

---

## Citation Report

The `CitationReport` returned by `cite()` and `verify()` contains the following fields:

### Per-Claim Data

| Field                  | Type                    | Description                                              |
|------------------------|-------------------------|----------------------------------------------------------|
| `claims`               | `ClaimReport[]`         | Full attribution details for every extracted claim.      |
| `attributed`           | `ClaimReport[]`         | Factual claims grounded in at least one source.          |
| `unattributed`         | `ClaimReport[]`         | Factual claims with no source support.                   |

### Citation Verification

| Field                  | Type                       | Description                                           |
|------------------------|----------------------------|-------------------------------------------------------|
| `citationVerifications` | `CitationVerification[]`  | Verification result for each explicit citation.       |
| `misattributed`        | `CitationVerification[]`   | Citations pointing to the wrong source.               |
| `phantom`              | `CitationVerification[]`   | Citations referencing non-existent sources.            |
| `citations`            | `Citation[]`               | All extracted citation markers.                       |

### Aggregate Scores

| Field                     | Type             | Description                                                    |
|---------------------------|------------------|----------------------------------------------------------------|
| `scores.grounding`        | `number`         | Fraction of factual claims supported by at least one source (0.0--1.0). |
| `scores.accuracy`         | `number \| null` | Fraction of explicit citations that correctly identify a supporting source. `null` if no explicit citations. |
| `scores.coverage`         | `number`         | Fraction of factual claims that have citations or attributions (0.0--1.0). |
| `scores.faithfulness`     | `number`         | Average attribution confidence for verified citations (0.0--1.0). |
| `scores.quality`          | `number`         | Weighted overall quality score (0.0--1.0).                     |

### Verification States

Each `CitationVerification` has a `state` field:

| State           | Meaning                                                     |
|-----------------|-------------------------------------------------------------|
| `verified`      | The cited source supports the claim.                        |
| `misattributed` | The claim is supported, but by a different source.          |
| `unsupported`   | No source supports this claim.                              |
| `phantom`       | The citation references a source that does not exist.       |

### Metadata

| Field         | Type       | Description                                   |
|---------------|------------|-----------------------------------------------|
| `claimCount`  | `number`   | Total number of factual claims.               |
| `citationCount` | `number` | Total number of explicit citations.           |
| `response`    | `string`   | The original response text.                   |
| `sources`     | `SourceChunk[]` | The provided source chunks.              |
| `durationMs`  | `number`   | Wall-clock analysis time in milliseconds.     |
| `timestamp`   | `string`   | ISO 8601 timestamp of the analysis.           |

---

## Error Handling

`rag-cite` handles edge cases gracefully without throwing:

- **Empty response** -- Returns a report with zero claims, zero citations, and all scores at 0.
- **Empty sources** -- All claims are unattributed. Grounding score is 0.
- **Phantom citations** -- Citations referencing non-existent source IDs are flagged with state `phantom` and included in the `phantom` array.
- **No explicit citations** -- `scores.accuracy` returns `null` (not 0). Quality score redistributes the accuracy weight proportionally across other score components.
- **Mismatched embedding dimensions** -- `cosineSimilarity` returns 0 for vectors of different lengths.
- **Zero or empty embeddings** -- Embedding similarity returns 0. The pipeline continues with the remaining strategies.

If an `embedder` function throws, the error propagates from the `cite()` promise. Wrap the call in a try/catch if your embedder may fail.

```typescript
try {
  const report = await cite(response, sources, { embedder: myEmbedder });
} catch (err) {
  // Handle embedder failure
}
```

---

## Advanced Usage

### Embedding Integration

Plug in any embedding function to enable semantic matching. When an embedder is provided, strategy weights automatically redistribute to give embedding similarity 30% weight.

```typescript
import { cite } from 'rag-cite';

const report = await cite(response, sources, {
  embedder: async (text) => {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
    });
    const data = await response.json();
    return data.data[0].embedding;
  },
  embeddingThreshold: 0.8,
});
```

Pre-computed embeddings on source chunks skip the embedder call for those sources:

```typescript
const sources = [
  { id: '1', content: 'Paris is the capital of France.', embedding: [0.12, -0.34, ...] },
];
```

### Claim Granularity

Control how finely the response is segmented into claims.

```typescript
// Sentence-level (default) -- one claim per sentence
const report = await cite(response, sources, { claimGranularity: 'sentence' });

// Clause-level -- splits on coordinating conjunctions and semicolons
const report = await cite(response, sources, { claimGranularity: 'clause' });

// Paragraph-level -- one claim per paragraph
const report = await cite(response, sources, { claimGranularity: 'paragraph' });
```

### Custom Strategy Weights

Override the default composite scoring weights to prioritize specific matching strategies.

```typescript
const report = await cite(response, sources, {
  weights: {
    exact: 0.50,
    fuzzy: 0.20,
    ngram: 0.15,
    tfidf: 0.10,
    embedding: 0.05,
  },
});
```

### Custom Score Weights

Control how the overall quality score is calculated from the four component scores.

```typescript
const report = await cite(response, sources, {
  scoreWeights: {
    grounding: 0.50,
    accuracy: 0.20,
    coverage: 0.15,
    faithfulness: 0.15,
  },
});
```

### Reusable Citer Instances

For repeated analysis with the same configuration, create a citer instance once and reuse it.

```typescript
import { createCiter } from 'rag-cite';

const citer = createCiter({
  attributionThreshold: 0.5,
  claimGranularity: 'clause',
  embedder: myEmbedder,
});

// Analyze multiple responses with the same settings
const report1 = await citer.cite(response1, sources1);
const report2 = await citer.cite(response2, sources2);

// Override specific options per call
const report3 = await citer.cite(response3, sources3, { attributionThreshold: 0.3 });
```

---

## Matching Strategies

Attribution uses four complementary strategies combined into a composite score. When no embedder is provided, the default weights are:

| Strategy         | Default Weight | Description                                              |
|------------------|---------------|----------------------------------------------------------|
| Exact substring  | 0.40          | Verbatim text containment. Returns 1.0 for full match, partial score for longest contiguous word overlap (minimum 5 words). |
| Fuzzy substring  | 0.25          | Levenshtein-based near-matching with sliding window and trigram pre-filtering. |
| N-gram overlap   | 0.20          | Weighted Jaccard similarity on unigrams (0.2), bigrams (0.3), trigrams (0.5), blended with token containment (0.4). |
| TF-IDF cosine    | 0.15          | Term frequency weighted by inverse document frequency across the source corpus. |

When an embedder is provided, weights redistribute:

| Strategy         | Weight with Embedder |
|------------------|---------------------|
| Exact substring  | 0.30                |
| Fuzzy substring  | 0.15                |
| N-gram overlap   | 0.15                |
| TF-IDF cosine    | 0.10                |
| Embedding cosine | 0.30                |

---

## TypeScript

`rag-cite` is written in TypeScript and ships type declarations alongside the compiled output. All interfaces are exported from the package root.

```typescript
import type {
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
} from 'rag-cite';
```

### Key Interfaces

**`SourceChunk`** -- A source passage provided as context to the LLM.

```typescript
interface SourceChunk {
  id: string;
  content: string;
  metadata?: SourceMetadata;
  embedding?: number[];
}
```

**`SourceMetadata`** -- Optional metadata for source resolution.

```typescript
interface SourceMetadata {
  title?: string;
  url?: string;
  author?: string;
  year?: string | number;
  section?: string;
  page?: number;
  [key: string]: unknown;
}
```

**`Citation`** -- A citation marker extracted from the response.

```typescript
interface Citation {
  format: 'numbered' | 'named' | 'parenthetical' | 'footnote' | 'url' | 'custom';
  id: string;
  startOffset: number;
  endOffset: number;
  coveredText: string;
  coveredStartOffset: number;
  coveredEndOffset: number;
  resolvedSource: SourceChunk | null;
}
```

**`Claim`** -- A verifiable assertion extracted from the response.

```typescript
interface Claim {
  text: string;
  sentences: string[];
  startOffset: number;
  endOffset: number;
  citations: Citation[];
  isFactual: boolean;
  index: number;
}
```

**`Attribution`** -- The result of matching a claim against a source.

```typescript
interface Attribution {
  source: SourceChunk;
  confidence: number;
  primaryMatchType: 'exact' | 'fuzzy' | 'ngram' | 'tfidf' | 'embedding';
  strategyScores: { exact: number; fuzzy: number; ngram: number; tfidf: number; embedding: number };
  matchEvidence: string | null;
  matchOffset?: { start: number; end: number };
}
```

---

## License

MIT
