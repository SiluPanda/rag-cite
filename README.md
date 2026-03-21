# rag-cite

Extract and verify inline citations from LLM responses. Matches claims against source chunks and produces structured attribution reports for RAG pipelines.

## Install

```bash
npm install rag-cite
```

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

console.log(report.scores.grounding);  // 1.0
console.log(report.scores.accuracy);   // 1.0
console.log(report.scores.quality);    // ~0.95
console.log(report.claimCount);        // 2
console.log(report.unattributed);      // []
```

## API

### `cite(response, sources, options?)`

Runs the full pipeline: extract citations, extract claims, match claims to sources, verify citations, compute scores. Returns a `CitationReport`.

```typescript
const report = await cite(response, sources, {
  attributionThreshold: 0.4,
  claimGranularity: 'sentence',
});
```

### `verify(response, sources, options?)`

Alias for `cite()`.

### `extractCitations(response)`

Extract citation markers from the response text without performing attribution.

```typescript
import { extractCitations } from 'rag-cite';

const citations = extractCitations('According to the report [1], revenue grew [2].');
// citations[0].id === '1', citations[0].format === 'numbered'
```

Supported formats:
- Numbered: `[1]`, `[1, 2, 3]`, `[1-3]`, `[Source 1]`, `[Ref 1]`
- Named: `[Wikipedia]`, `[Source: Title]`, `[Doc: Name]`
- Parenthetical: `(Smith 2023)`, `(Source 1)`
- Footnote: `[^1]`, `^[1]`, `^1`
- URL: bare URLs, markdown links `[text](url)`
- Custom patterns via `citationPatterns` option

### `extractClaims(response, options?)`

Break response text into verifiable claims. Filters non-factual content (questions, hedging, disclaimers).

```typescript
import { extractClaims } from 'rag-cite';

const claims = extractClaims('Paris is the capital. What about London? I hope this helps!');
// claims.filter(c => c.isFactual) => ["Paris is the capital."]
```

### `attribute(response, sources, options?)`

Auto-attribute and annotate a response with citation markers.

```typescript
import { attribute } from 'rag-cite';

const result = await attribute(
  'Paris is the capital of France.',
  [{ id: '1', content: 'Paris is the capital and largest city of France.' }],
);
// result.text => 'Paris is the capital of France [1].'
```

### `createCiter(options?)`

Create a configured citer instance with preset options.

```typescript
import { createCiter } from 'rag-cite';

const citer = createCiter({ attributionThreshold: 0.5 });
const report = await citer.cite(response, sources);
```

## Citation Report

The `CitationReport` contains:

- `claims` -- per-claim attribution details with confidence scores
- `attributed` -- claims grounded in sources
- `unattributed` -- claims with no source support (potential hallucinations)
- `citationVerifications` -- per-citation verification results (`verified`, `misattributed`, `unsupported`, `phantom`)
- `misattributed` -- citations pointing to wrong sources
- `phantom` -- citations referencing non-existent sources
- `scores.grounding` -- fraction of claims supported by sources
- `scores.accuracy` -- fraction of citations pointing to correct sources
- `scores.coverage` -- fraction of claims with citations
- `scores.faithfulness` -- how closely claims match source text
- `scores.quality` -- weighted overall quality score

## Matching Strategies

Attribution uses four complementary matching strategies combined into a composite score:

| Strategy | Weight | Description |
|----------|--------|-------------|
| Exact substring | 0.40 | Verbatim text containment |
| Fuzzy substring | 0.25 | Levenshtein-based near-match |
| N-gram overlap | 0.20 | Jaccard similarity on word n-grams + containment |
| TF-IDF cosine | 0.15 | Term frequency weighted by corpus discriminativeness |

An optional pluggable `embedder` function enables semantic matching (weights redistribute when enabled).

## Options

```typescript
interface CiteOptions {
  attributionThreshold?: number;   // Default: 0.4
  fuzzyThreshold?: number;         // Default: 0.8
  ngramThreshold?: number;         // Default: 0.3
  tfidfThreshold?: number;         // Default: 0.3
  embeddingThreshold?: number;     // Default: 0.8
  weights?: { exact?, fuzzy?, ngram?, tfidf?, embedding? };
  scoreWeights?: { grounding?, accuracy?, coverage?, faithfulness? };
  embedder?: (text: string) => Promise<number[]> | number[];
  citationPatterns?: CitationPattern[];
  autoAttribute?: boolean;         // Default: true
  claimGranularity?: 'sentence' | 'clause' | 'paragraph';
  sourceMap?: Record<string, string>;
  stopwords?: string[];
  maxSourcesPerClaim?: number;     // Default: 50
}
```

## Zero Runtime Dependencies

All matching algorithms (n-gram overlap, TF-IDF, Levenshtein edit distance, sentence segmentation, citation parsing) are implemented from scratch using only Node.js built-in modules.

## License

MIT
