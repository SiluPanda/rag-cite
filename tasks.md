# rag-cite -- Implementation Tasks

This document breaks down all work described in the SPEC.md into granular, actionable tasks, organized by implementation phase.

---

## Phase 0: Project Scaffolding and Setup

- [ ] **Install runtime dependency `fastest-levenshtein`** -- Run `npm install fastest-levenshtein` to add the only runtime dependency required for fuzzy substring matching (Levenshtein edit distance computation). | Status: not_done

- [ ] **Install dev dependencies** -- Run `npm install -D typescript vitest eslint @types/node` to set up the development toolchain (TypeScript compiler, Vitest test runner, ESLint linter, Node.js type definitions). | Status: not_done

- [ ] **Create source directory structure** -- Create the file/folder layout specified in SPEC Section 17: `src/extract/`, `src/match/`, `src/verify/`, `src/attribute/`, `src/utils/`, and `src/__tests__/` with subdirectories mirroring the source structure (`extract/`, `match/`, `verify/`, `attribute/`, `fixtures/responses/`, `fixtures/sources/`, `fixtures/reports/`). | Status: not_done

- [ ] **Configure Vitest** -- Add a `vitest.config.ts` (or verify the existing `package.json` `"test": "vitest run"` script works) so that `npm run test` discovers and runs all `*.test.ts` files under `src/__tests__/`. | Status: not_done

- [ ] **Configure ESLint for TypeScript** -- Set up `.eslintrc` or `eslint.config.js` with TypeScript-aware rules so that `npm run lint` works against `src/`. | Status: not_done

- [ ] **Verify build pipeline** -- Run `npm run build` (which calls `tsc`) and confirm it compiles cleanly with the existing `tsconfig.json` settings (target ES2022, commonjs, strict mode, outDir `dist/`, rootDir `src/`). | Status: not_done

---

## Phase 1: Type Definitions

- [ ] **Define `SourceMetadata` interface** -- In `src/types.ts`, define the `SourceMetadata` interface with optional fields: `title`, `url`, `author`, `year` (string | number), `section`, `page` (number), and index signature `[key: string]: unknown` for arbitrary metadata. | Status: not_done

- [ ] **Define `SourceChunk` interface** -- In `src/types.ts`, define `SourceChunk` with fields: `id` (string), `content` (string), optional `metadata` (SourceMetadata), optional `embedding` (number[]). | Status: not_done

- [ ] **Define `Citation` interface** -- In `src/types.ts`, define `Citation` with fields: `format` ('numbered' | 'named' | 'parenthetical' | 'footnote' | 'url' | 'custom'), `id` (string), `startOffset` (number), `endOffset` (number), `coveredText` (string), `coveredStartOffset` (number), `coveredEndOffset` (number), `resolvedSource` (SourceChunk | null). | Status: not_done

- [ ] **Define `Claim` interface** -- In `src/types.ts`, define `Claim` with fields: `text` (string), `sentences` (string[]), `startOffset` (number), `endOffset` (number), `citations` (Citation[]), `isFactual` (boolean), `index` (number). | Status: not_done

- [ ] **Define `Attribution` interface** -- In `src/types.ts`, define `Attribution` with fields: `source` (SourceChunk), `confidence` (number), `primaryMatchType` ('exact' | 'fuzzy' | 'ngram' | 'tfidf' | 'embedding'), `strategyScores` (object with exact, fuzzy, ngram, tfidf, embedding as numbers), `matchEvidence` (string | null), optional `matchOffset` ({ start: number; end: number }). | Status: not_done

- [ ] **Define `CitationVerification` interface** -- In `src/types.ts`, define `CitationVerification` with fields: `citation` (Citation), `claim` (Claim), `state` ('verified' | 'misattributed' | 'unsupported' | 'phantom'), `citedSourceAttribution` (Attribution | null), `correctSources` (Attribution[] | null). | Status: not_done

- [ ] **Define `ClaimReport` interface** -- In `src/types.ts`, define `ClaimReport` with fields: `claim` (Claim), `attributions` (Attribution[]), `isGrounded` (boolean), `primaryAttribution` (Attribution | null), `citationVerifications` (CitationVerification[]). | Status: not_done

- [ ] **Define `CitationScores` interface** -- In `src/types.ts`, define `CitationScores` with fields: `grounding` (number), `accuracy` (number | null), `coverage` (number), `faithfulness` (number), `quality` (number). | Status: not_done

- [ ] **Define `CitationReport` interface** -- In `src/types.ts`, define `CitationReport` with fields: `claims` (ClaimReport[]), `unattributed` (ClaimReport[]), `attributed` (ClaimReport[]), `citationVerifications` (CitationVerification[]), `misattributed` (CitationVerification[]), `phantom` (CitationVerification[]), `scores` (CitationScores), `citations` (Citation[]), `claimCount` (number), `citationCount` (number), `response` (string), `sources` (SourceChunk[]), `durationMs` (number), `timestamp` (string). | Status: not_done

- [ ] **Define `CiteOptions` interface** -- In `src/types.ts`, define `CiteOptions` with all optional fields: `attributionThreshold`, `fuzzyThreshold`, `ngramThreshold`, `tfidfThreshold`, `embeddingThreshold`, `weights` (partial strategy weights object), `scoreWeights` (partial score weights object), `embedder` (async/sync function), `citationPatterns` (CitationPattern[]), `autoAttribute` (boolean), `claimGranularity` ('sentence' | 'clause' | 'paragraph'), `sourceMap` (Record<string, string>), `stopwords` (string[]), `maxSourcesPerClaim` (number), `customMatchers` (array of custom matcher objects). | Status: not_done

- [ ] **Define `CitationPattern` interface** -- In `src/types.ts`, define `CitationPattern` with fields: `name` (string), `pattern` (RegExp), `extract` (function from RegExpMatchArray to { format: string; id: string }). | Status: not_done

- [ ] **Define `Citer` interface** -- In `src/types.ts`, define `Citer` with methods: `cite()`, `extractCitations()`, `extractClaims()`, `verify()`, `attribute()`, matching the signatures in SPEC Section 9. | Status: not_done

- [ ] **Define `AnnotatedResponse` interface** -- In `src/types.ts`, define `AnnotatedResponse` with fields: `text` (string), `report` (CitationReport), `insertedCitations` (array of { marker, source, offset, claim }). | Status: not_done

- [ ] **Define custom matcher type** -- In `src/types.ts`, define `CustomMatcher` with fields: `name` (string), `weight` (number), `match` (function taking claim string and source string, returning number). | Status: not_done

---

## Phase 2: Utility Modules

- [ ] **Implement text normalization in `src/utils/text.ts`** -- Create functions for: lowercasing, collapsing whitespace (multiple spaces/tabs to single space), stripping punctuation at boundaries, and tokenizing text into words (split on whitespace). These are used by every matching strategy. | Status: not_done

- [ ] **Implement English stopword list in `src/utils/stopwords.ts`** -- Export a default set of English stopwords (`the`, `a`, `an`, `is`, `are`, `was`, `were`, `in`, `on`, `at`, `to`, `for`, `of`, `and`, `or`, `but`, `not`, `with`, `this`, `that`, `it`, `from`, `by`, `as`) as specified in SPEC Section 7.3. Export a function to filter stopwords from a token array. | Status: not_done

- [ ] **Implement cosine similarity in `src/utils/cosine.ts`** -- Export a `cosineSimilarity(a: number[], b: number[]): number` function that computes `dot(a, b) / (norm(a) * norm(b))`. Handle edge cases: zero vectors return 0. Used by TF-IDF and embedding matching. | Status: not_done

- [ ] **Implement content hashing in `src/utils/hash.ts`** -- Export a `hashText(text: string): string` function that computes SHA-256 of the input text and returns the hex digest. Used for embedding cache keys. Use Node.js built-in `crypto` module. | Status: not_done

---

## Phase 3: Citation Extraction

- [ ] **Implement numbered reference pattern in `src/extract/patterns.ts`** -- Define regex pattern(s) for: `[N]`, `[N, M]` (comma-separated), `[N-M]` (ranges), `[Source N]`, `[Ref N]`. The pattern must handle multi-digit numbers. Range patterns should be expanded (e.g., `[1-3]` becomes `[1]`, `[2]`, `[3]`). | Status: not_done

- [ ] **Implement named reference pattern in `src/extract/patterns.ts`** -- Define regex pattern(s) for: `[Name]`, `[Source: Name]`, `[Doc: Name]`. Must distinguish from numbered references (names are non-numeric). | Status: not_done

- [ ] **Implement parenthetical reference pattern in `src/extract/patterns.ts`** -- Define regex pattern(s) for: `(Author Year)`, `(Author, Year)`, `(Source N)`, `(Author et al. Year)`. Must distinguish from normal parenthetical text. | Status: not_done

- [ ] **Implement footnote marker pattern in `src/extract/patterns.ts`** -- Define regex pattern(s) for: `^N`, `^[N]`, `[^N]`. Must avoid matching markdown footnote definitions. | Status: not_done

- [ ] **Implement URL reference pattern in `src/extract/patterns.ts`** -- Define regex pattern(s) for: bare URLs (`https://example.com/page`) and markdown links (`[text](https://example.com)`). | Status: not_done

- [ ] **Implement pattern priority and conflict resolution** -- When multiple patterns match at the same position, the most specific match wins (longest match, then highest priority). Custom patterns take priority over built-in patterns at the same position. | Status: not_done

- [ ] **Implement citation-text association (same-sentence scope)** -- In `src/extract/citations.ts`, implement the default scope: a citation at the end of a sentence covers the entire sentence. E.g., `"Paris is the capital of France [1]."` -- `[1]` covers "Paris is the capital of France." | Status: not_done

- [ ] **Implement citation-text association (preceding-clause scope)** -- A citation in the middle of a sentence covers the clause immediately preceding it. E.g., `"Paris is the capital [1], and London is the capital [2]."` -- `[1]` covers the first clause, `[2]` covers the second. | Status: not_done

- [ ] **Implement citation-text association (paragraph scope)** -- When a citation appears at the end of a paragraph with no other citations in that paragraph, it covers the entire paragraph. | Status: not_done

- [ ] **Implement multiple citation handling** -- When multiple citations appear at the same position (`[1][2]`, `[1, 2]`, `[1-3]`), all citations cover the same text span. Group them into a citation group. | Status: not_done

- [ ] **Implement citation-to-source resolution (numbered)** -- Map numbered citations to source chunks by index: `[1]` maps to the first source chunk, `[2]` to the second. Support `sourceMap` option for custom mapping. | Status: not_done

- [ ] **Implement citation-to-source resolution (named)** -- Map named citations to source chunks by comparing the citation name against source metadata (title, filename, URL) using case-insensitive fuzzy matching. | Status: not_done

- [ ] **Implement citation-to-source resolution (parenthetical)** -- Map parenthetical citations to source chunks by comparing against source metadata fields (author, year, title). | Status: not_done

- [ ] **Implement citation-to-source resolution (footnote)** -- Map footnote citations by index, same as numbered references. | Status: not_done

- [ ] **Implement citation-to-source resolution (URL)** -- Map URL citations by comparing against source metadata URL fields. | Status: not_done

- [ ] **Implement custom citation pattern support** -- Accept user-provided `CitationPattern[]` via options. Custom patterns are evaluated after built-in patterns. At conflict, custom wins. | Status: not_done

- [ ] **Wire up `extractCitations()` public function** -- In `src/extract/citations.ts`, implement the full extraction pipeline: run all pattern detectors, resolve conflicts, associate text spans, resolve sources. Export as a standalone function. | Status: not_done

---

## Phase 4: Claim Extraction

- [ ] **Implement sentence segmentation in `src/extract/sentences.ts`** -- Split text on `.`, `!`, `?` followed by whitespace or end of text. Handle common abbreviations that should NOT trigger splits: `Dr.`, `Mr.`, `Mrs.`, `Ms.`, `Prof.`, `e.g.`, `i.e.`, `vs.`, `etc.`, `U.S.`, `U.K.`. Handle decimal numbers (`3.14`), ellipses (`...`), and URLs (periods inside URLs). | Status: not_done

- [ ] **Implement paragraph boundary detection** -- Double newlines (`\n\n`) always trigger a split. Single newlines within a paragraph do not trigger a split unless followed by a list marker. | Status: not_done

- [ ] **Implement list item detection** -- Lines starting with `- `, `* `, `1. `, or similar list markers are treated as individual claims. Each bullet point is a separate claim regardless of punctuation. | Status: not_done

- [ ] **Implement clause-level boundary detection** -- Split on coordinating conjunctions with independent clauses (`, and`, `, but`, `, or`, `, yet`), semicolons, and colon-separated lists. This is used when `claimGranularity` is `'clause'`. | Status: not_done

- [ ] **Implement paragraph-level granularity** -- When `claimGranularity` is `'paragraph'`, treat each paragraph as a single claim instead of splitting into sentences. | Status: not_done

- [ ] **Implement non-factual content filter: questions** -- In `src/extract/filters.ts`, detect sentences ending with `?` or starting with question words (`What`, `How`, `Why`, `When`, `Where`, `Who`, `Which`, `Can`, `Could`, `Would`, `Should`, `Is`, `Are`, `Do`, `Does`). Mark as non-factual. | Status: not_done

- [ ] **Implement non-factual content filter: hedging language** -- Detect sentences containing hedging markers: `I think`, `I believe`, `It seems`, `It appears`, `possibly`, `perhaps`, `might`, `may`, `could be`, `arguably`. Mark as non-factual. | Status: not_done

- [ ] **Implement non-factual content filter: meta-commentary** -- Detect sentences about the response itself: `As mentioned`, `As discussed`, `In summary`, `To summarize`, `In conclusion`, `As noted above`, `Let me explain`, `I'll now describe`. Mark as non-factual. | Status: not_done

- [ ] **Implement non-factual content filter: transition phrases** -- Detect standalone transition sentences: `Moving on`, `Next`, `Additionally`, `Furthermore`, `Moreover`, `However`, `On the other hand`, `That said` (only when standalone, not followed by a factual clause). Mark as non-factual. | Status: not_done

- [ ] **Implement non-factual content filter: greetings and closings** -- Detect social niceties: `Sure!`, `Great question!`, `I hope this helps`, `Let me know if you have questions`, `Happy to help`. Mark as non-factual. | Status: not_done

- [ ] **Implement non-factual content filter: disclaimers** -- Detect standard LLM disclaimers: `I'm an AI`, `I don't have personal opinions`, `My training data`, `I cannot guarantee`. Mark as non-factual. | Status: not_done

- [ ] **Ensure conservative filtering** -- Filtering should only exclude sentences that match non-factual patterns with high confidence. Borderline cases (e.g., hedging language followed by a factual assertion) must be kept as claims to avoid false negatives. | Status: not_done

- [ ] **Implement multi-sentence claim merging** -- Detect when a second sentence starts with a pronoun or demonstrative (`This`, `That`, `These`, `It`, `They`, `The above`) that refers back to the first sentence, and the second sentence would be meaningless without the first. Merge into a single claim. Preserve individual sentences in claim metadata. | Status: not_done

- [ ] **Build Claim objects with correct offsets** -- Each extracted claim must include: `text`, `sentences` array, `startOffset`/`endOffset` (character offsets in original response), `citations` (from citation extraction), `isFactual`, and sequential `index`. | Status: not_done

- [ ] **Attach citations to claims** -- Cross-reference the citation extraction results with the claim extraction results. Each claim's `citations` field should contain the explicit citations whose `coveredText` overlaps with the claim's text span. | Status: not_done

- [ ] **Wire up `extractClaims()` public function** -- In `src/extract/claims.ts`, implement the full claim extraction pipeline: segment sentences, detect boundaries based on granularity, filter non-factual content, merge multi-sentence claims, build Claim objects. Export as a standalone function. | Status: not_done

---

## Phase 5: Exact Substring Matching

- [ ] **Implement exact substring matching in `src/match/exact.ts`** -- Normalize both claim and source texts (lowercase, collapse whitespace, strip punctuation at boundaries). Check if the normalized claim text is a substring of the normalized source text. If yes, return confidence 1.0 and match type `exact`. | Status: not_done

- [ ] **Implement partial exact match detection** -- If no full substring match, check if any contiguous sequence of words from the claim (minimum 5 words) appears in the source. If found, compute partial confidence proportional to the fraction of the claim covered by the matched substring. | Status: not_done

- [ ] **Record match evidence** -- When an exact or partial exact match is found, record the specific substring in the source that matched, along with the character offset within the source content (`matchEvidence` and `matchOffset` fields). | Status: not_done

---

## Phase 6: Fuzzy Substring Matching

- [ ] **Implement trigram index for pre-filtering in `src/match/fuzzy.ts`** -- Build a character trigram index of the source text. For a given claim, compute the claim's character trigrams and identify positions in the source where at least 30% of the claim's trigrams appear within a window. Only these positions are evaluated with the full Levenshtein distance computation. | Status: not_done

- [ ] **Implement sliding window fuzzy matching** -- Slide a window of size `claim.length +/- 20%` across the source text (at pre-filtered positions only). For each window position, compute the Levenshtein edit distance using `fastest-levenshtein`. Compute normalized similarity: `1 - (distance / max(claim.length, window.length))`. Track the best (highest similarity) window position. | Status: not_done

- [ ] **Apply fuzzy threshold and record result** -- If the best normalized similarity exceeds the `fuzzyThreshold` (default: 0.8), record a match with the similarity as confidence and match type `fuzzy`. Record the matched window content as `matchEvidence`. | Status: not_done

---

## Phase 7: N-gram Overlap (Jaccard Similarity)

- [ ] **Implement word n-gram generation in `src/match/ngram.ts`** -- Tokenize text into words (split on whitespace, lowercase). Remove stopwords using the stopword list from `utils/stopwords.ts`. Generate word n-grams for n=1 (unigrams), n=2 (bigrams), and n=3 (trigrams). | Status: not_done

- [ ] **Implement Jaccard similarity computation** -- For each n-gram size, compute Jaccard similarity: `|intersection| / |union|` where intersection and union are computed over the n-gram sets of the claim and source. | Status: not_done

- [ ] **Implement weighted average of Jaccard scores** -- Compute the weighted average: `0.2 * jaccard_1 + 0.3 * jaccard_2 + 0.5 * jaccard_3`. Higher-order n-grams get more weight for specificity. | Status: not_done

- [ ] **Apply n-gram threshold and record result** -- If the weighted score exceeds the `ngramThreshold` (default: 0.3), record a match with the score as confidence and match type `ngram`. | Status: not_done

---

## Phase 8: TF-IDF Cosine Similarity

- [ ] **Implement vocabulary building in `src/match/tfidf.ts`** -- Build a vocabulary from all source chunks combined. Each unique term (after lowercasing and tokenization) gets an index in the vocabulary. | Status: not_done

- [ ] **Implement IDF computation** -- Compute IDF for each term: `log((N + 1) / (df + 1)) + 1` where `N` is the number of source chunks and `df` is the number of chunks containing the term. IDF values are computed once per `cite()` call and reused for all claim-source pairs. | Status: not_done

- [ ] **Implement TF-IDF vector computation** -- For a given text, tokenize and lowercase, compute term frequency (count / total terms), then compute TF-IDF vector as element-wise product of TF and IDF. | Status: not_done

- [ ] **Implement TF-IDF cosine similarity** -- Compute cosine similarity between claim TF-IDF vector and source TF-IDF vector using `utils/cosine.ts`. | Status: not_done

- [ ] **Apply TF-IDF threshold and record result** -- If cosine similarity exceeds the `tfidfThreshold` (default: 0.3), record a match with the score as confidence and match type `tfidf`. | Status: not_done

---

## Phase 9: Composite Scoring

- [ ] **Implement composite score computation in `src/match/composite.ts`** -- Compute the weighted combination of all active strategy scores: `composite = w_exact * exact + w_fuzzy * fuzzy + w_ngram * ngram + w_tfidf * tfidf + w_embed * embed`. Apply default weights based on whether an embedder is provided (SPEC Section 7.6). Clamp result to [0, 1]. | Status: not_done

- [ ] **Implement configurable weights** -- Accept user-provided `weights` option. When custom matchers are provided, normalize all weights (built-in + custom) to sum to 1.0. | Status: not_done

- [ ] **Implement attribution threshold application** -- A claim is considered attributed to a source when the composite score exceeds `attributionThreshold` (default: 0.4). Return all attributions sorted by composite score descending. | Status: not_done

- [ ] **Determine primary match type** -- For each attribution, identify which matching strategy produced the strongest signal (highest individual score) and set it as `primaryMatchType`. | Status: not_done

---

## Phase 10: Source Pre-filtering

- [ ] **Implement fast pre-filter in `src/match/prefilter.ts`** -- When the number of source chunks exceeds `maxSourcesPerClaim` (default: 50), pre-filter using shared unique term count. Build a term set for each source chunk. For each claim, compute the number of shared unique terms with each source and select the top-N by shared term count. Only these candidates undergo full matching. | Status: not_done

- [ ] **Build pre-computed term sets for sources** -- At the start of the `cite()` call, compute and cache the set of unique terms for each source chunk. Reuse across all claims. | Status: not_done

---

## Phase 11: Matching Orchestration

- [ ] **Implement matching orchestration in `src/match/index.ts`** -- For each claim, run all active matching strategies against each candidate source chunk (after pre-filtering). Compute composite scores. Return `Attribution` objects for all claim-source pairs above the threshold, sorted by confidence descending. Support multi-source attribution (a single claim matching multiple sources). | Status: not_done

- [ ] **Support custom matchers in orchestration** -- When `customMatchers` option is provided, invoke each custom matcher's `match(claim, source)` function and include its score in the composite computation with weight normalization. | Status: not_done

---

## Phase 12: Per-Citation Verification

- [ ] **Implement per-citation verification in `src/verify/citation-verifier.ts`** -- For each explicit citation: (1) look up the cited source chunk by id/index/name/URL, (2) if source does not exist, flag as `phantom`, (3) run attribution matching between claim and cited source, (4) if above threshold, mark as `verified`, (5) if below threshold, check if any other source matches above threshold -- if yes, mark as `misattributed` with correct sources; if no, mark as `unsupported`. | Status: not_done

- [ ] **Handle phantom citations** -- Detect when a citation references a source identifier that does not exist in the provided sources array. Flag as `phantom` state with `citedSourceAttribution: null`. | Status: not_done

- [ ] **Handle misattributed citations** -- When the cited source does not support the claim but another source does, record the correct source(s) in `correctSources` field of the `CitationVerification`. | Status: not_done

---

## Phase 13: Score Computation

- [ ] **Implement grounding score in `src/verify/scores.ts`** -- Compute: `(claims with at least one attribution above threshold) / (total factual claims)`. Exclude non-factual claims from the denominator. Handle edge case: zero factual claims. | Status: not_done

- [ ] **Implement attribution accuracy score** -- Compute: `(number of 'verified' citations) / (total explicit citations)`. Return `null` when the response has no explicit citations. | Status: not_done

- [ ] **Implement coverage score** -- Compute: `(factual claims with at least one citation or attribution) / (total factual claims)`. | Status: not_done

- [ ] **Implement faithfulness score** -- Compute: `average(composite_score for all verified citations)`. This is a proxy metric where text similarity approximates semantic faithfulness. | Status: not_done

- [ ] **Implement overall quality score** -- Compute weighted combination: `w_grounding * grounding + w_accuracy * accuracy + w_coverage * coverage + w_faithfulness * faithfulness`. Default weights: grounding 0.35, accuracy 0.30, coverage 0.15, faithfulness 0.20. When accuracy is `null` (no explicit citations), redistribute the accuracy weight proportionally to the other components. | Status: not_done

- [ ] **Support configurable score weights** -- Accept user-provided `scoreWeights` option to override the default quality score component weights. | Status: not_done

---

## Phase 14: Verification Orchestration

- [ ] **Implement verification orchestration in `src/verify/index.ts`** -- Combine citation extraction, claim extraction, and attribution matching outputs. Run per-citation verification. Compute all scores. Assemble the `ClaimReport` array, separating `attributed` and `unattributed` claims. Assemble `citationVerifications`, `misattributed`, and `phantom` arrays. | Status: not_done

---

## Phase 15: Pipeline Orchestration (`cite()`)

- [ ] **Implement `cite()` function in `src/cite.ts`** -- Orchestrate the full pipeline: (1) extract citations from response, (2) extract claims from response, (3) attach citations to claims, (4) build TF-IDF corpus from sources, (5) pre-filter sources if needed, (6) run attribution matching for all claims, (7) run per-citation verification, (8) compute scores, (9) assemble and return `CitationReport`. Measure `durationMs` using `performance.now()` or `Date.now()`. Record ISO 8601 `timestamp`. | Status: not_done

- [ ] **Handle edge case: empty response** -- If the response is empty, produce zero claims, trivial scores (1.0 or null as appropriate), and return immediately. | Status: not_done

- [ ] **Handle edge case: no sources provided** -- If the sources array is empty, all citations become `phantom` or `unsupported`. Grounding score is 0 if there are factual claims. | Status: not_done

- [ ] **Handle edge case: only non-factual content** -- If all sentences are filtered as non-factual, produce zero factual claims. Scores should handle zero denominators gracefully. | Status: not_done

- [ ] **Apply default option values** -- Merge user-provided options with built-in defaults for all configurable values (thresholds, weights, granularity, etc.) as specified in SPEC Section 12. | Status: not_done

---

## Phase 16: Auto-Attribution Mode

- [ ] **Implement auto-attribution detection in `src/attribute/index.ts`** -- Auto-attribution activates when: (a) the response contains no explicit citations and `autoAttribute` is `true` (default), or (b) individual claims lack explicit citations even when other claims have them. | Status: not_done

- [ ] **Implement citation marker generation** -- For each claim with at least one attribution above the threshold, generate a citation marker. Default format: `[N]` where N is the source chunk index. Support configurable format via `autoAttributeFormat` option (`[N]`, `(N)`, `^N`). | Status: not_done

- [ ] **Implement citation marker insertion in `src/attribute/insert.ts`** -- Insert markers at natural positions: end of sentence before the period (e.g., `"claim text [1]."`), before closing punctuation (`!`, `?`), at the end of list item text. Do not insert duplicate markers for sources already explicitly cited. | Status: not_done

- [ ] **Implement multi-source citation insertion** -- When a claim draws from multiple sources, insert multiple markers (e.g., `[1][3]`). | Status: not_done

- [ ] **Build `AnnotatedResponse` output** -- Return: `text` (response with inserted markers), `report` (full CitationReport), `insertedCitations` (array of { marker, source, offset, claim }). | Status: not_done

- [ ] **Wire up `attribute()` public function** -- Export the `attribute(response, sources, options?)` function that runs the citation pipeline and returns `AnnotatedResponse`. | Status: not_done

---

## Phase 17: Embedding Similarity (Optional/Pluggable)

- [ ] **Implement embedding matching in `src/match/embedding.ts`** -- When an `embedder` function is provided via options, embed each claim and each source chunk. Compute cosine similarity between each claim-source embedding pair. If similarity exceeds `embeddingThreshold` (default: 0.8), record a match with the score as confidence and match type `embedding`. | Status: not_done

- [ ] **Implement lazy embedding with caching** -- Compute embeddings lazily (only for claims/sources that survive the pre-filter). Cache embeddings by content hash (SHA-256 via `utils/hash.ts`) to avoid redundant embedding calls. Source chunk embeddings should be computed once and reused for all claims. | Status: not_done

- [ ] **Support pre-computed embeddings on source chunks** -- If a `SourceChunk` already has an `embedding` field populated, use it directly instead of calling the `embedder` function. | Status: not_done

- [ ] **Adjust composite weights when embedder is provided** -- When an embedder is provided and no custom weights are set, use the embedding-enabled default weights: exact 0.30, fuzzy 0.15, ngram 0.15, tfidf 0.10, embedding 0.30. | Status: not_done

---

## Phase 18: Factory (`createCiter`)

- [ ] **Implement `createCiter()` in `src/factory.ts`** -- Accept `CiteOptions` and return a `Citer` instance. The instance stores the preset options and exposes `cite()`, `extractCitations()`, `extractClaims()`, `verify()`, and `attribute()` methods. | Status: not_done

- [ ] **Implement option merging with precedence** -- Per-call overrides > factory-level options > built-in defaults. Merge `weights` and `scoreWeights` objects shallowly. | Status: not_done

- [ ] **Implement `verify()` as alias for `cite()`** -- The `verify()` method on the Citer instance and the exported `verify()` function are aliases for `cite()`, provided for semantic clarity. | Status: not_done

---

## Phase 19: Public API Exports

- [ ] **Set up `src/index.ts` exports** -- Export all public functions: `cite`, `extractCitations`, `extractClaims`, `verify`, `attribute`, `createCiter`. Export all public type interfaces: `SourceChunk`, `SourceMetadata`, `Citation`, `Claim`, `Attribution`, `CitationVerification`, `ClaimReport`, `CitationScores`, `CitationReport`, `CiteOptions`, `CitationPattern`, `Citer`, `AnnotatedResponse`, `CustomMatcher`. | Status: not_done

---

## Phase 20: Unit Tests -- Citation Extraction

- [ ] **Test numbered reference extraction** -- Verify correct extraction of `[1]`, `[2]`, `[13]`, `[1, 3]`, `[2, 5, 7]`, `[1-3]`, `[Source 1]`, `[Ref 1]`. Verify range expansion (`[1-3]` becomes three citations). | Status: not_done

- [ ] **Test named reference extraction** -- Verify correct extraction of `[Wikipedia]`, `[Annual Report]`, `[Source: Wikipedia]`, `[Doc: API Reference]`. Verify named references are distinguished from numbered ones. | Status: not_done

- [ ] **Test parenthetical reference extraction** -- Verify correct extraction of `(Smith 2023)`, `(Johnson et al. 2024)`, `(Smith, 2023)`, `(Source 1)`. | Status: not_done

- [ ] **Test footnote marker extraction** -- Verify correct extraction of `^1`, `^[1]`, `[^1]`. | Status: not_done

- [ ] **Test URL reference extraction** -- Verify correct extraction of bare URLs and markdown links `[text](https://example.com)`. | Status: not_done

- [ ] **Test custom citation pattern extraction** -- Verify that user-provided `CitationPattern` objects are correctly applied. Test that custom patterns take priority over built-in patterns at conflict positions. | Status: not_done

- [ ] **Test citation edge cases** -- Citations at sentence start, citations at sentence end, multiple consecutive citations (`[1][2]`), citations inside parentheses, citations inside quotes, citations in code blocks (should not be extracted), citations in markdown tables. | Status: not_done

- [ ] **Test citation-text association** -- Verify same-sentence scope, preceding-clause scope, paragraph scope, and multi-citation grouping with concrete examples. Test citation at start of response, citation covering empty string, citation in a list item. | Status: not_done

---

## Phase 21: Unit Tests -- Claim Extraction

- [ ] **Test sentence segmentation** -- Verify splitting on `.`, `!`, `?`. Test abbreviation handling (`Dr. Smith`, `U.S. government`, `e.g. this`, `i.e. that`). Test decimal numbers (`3.14`, `$1,200.50`), ellipses (`...`), and URLs inside sentences. | Status: not_done

- [ ] **Test paragraph boundaries** -- Verify double newlines trigger splits. Verify single newlines within a paragraph do not trigger splits (unless followed by a list marker). | Status: not_done

- [ ] **Test list item detection** -- Verify `- `, `* `, `1. `, and similar list markers produce individual claims. | Status: not_done

- [ ] **Test non-factual filtering** -- For each category (questions, hedging, meta-commentary, transitions, greetings, disclaimers), provide sample sentences and verify they are correctly flagged as `isFactual: false`. | Status: not_done

- [ ] **Test conservative filtering** -- Verify that borderline cases (hedging followed by factual assertion) are NOT filtered. Ensure no legitimate factual sentences are lost. | Status: not_done

- [ ] **Test multi-sentence claim merging** -- Verify that sentences starting with `This`, `That`, `These`, `It`, `They` are merged with the preceding sentence when they would be meaningless alone. | Status: not_done

- [ ] **Test claim granularity options** -- Test `'sentence'` (default), `'clause'` (splits on conjunctions and semicolons), and `'paragraph'` (one claim per paragraph). | Status: not_done

---

## Phase 22: Unit Tests -- Matching Strategies

- [ ] **Test exact substring matching** -- Test with identical text (confidence 1.0). Test with case differences. Test with whitespace differences. Test partial match (5+ word sequence). Test non-matching text (should return 0). | Status: not_done

- [ ] **Test fuzzy substring matching** -- Test with single-word substitution, added words, removed words, tense changes, typo corrections. Verify similarity score reflects edit distance. Verify trigram pre-filter correctly reduces candidate positions. Verify threshold application. | Status: not_done

- [ ] **Test n-gram overlap** -- Verify Jaccard computation for unigrams, bigrams, trigrams with known inputs and expected outputs. Test with overlapping, partially overlapping, and non-overlapping texts. Verify stopword removal. Verify weighted average. | Status: not_done

- [ ] **Test TF-IDF cosine similarity** -- Verify TF computation, IDF computation (with smoothing), and cosine similarity with synthetic corpora where expected values are calculable. Test that common terms across all sources get low IDF. Test discriminative terms get high IDF. | Status: not_done

- [ ] **Test composite scoring** -- Verify weighted combination with known strategy scores and weights. Test weight normalization when custom matchers are added. Test threshold application. Test clamping to [0, 1]. | Status: not_done

- [ ] **Test source pre-filter** -- Verify that pre-filtering selects the top-N sources by shared term count. Verify that relevant sources are not excluded. Test with source count below and above `maxSourcesPerClaim`. | Status: not_done

---

## Phase 23: Unit Tests -- Verification and Scores

- [ ] **Test `verified` citation state** -- Construct a scenario where the cited source matches the claim above threshold. Verify state is `verified`. | Status: not_done

- [ ] **Test `misattributed` citation state** -- Construct a scenario where the cited source does not match but another source does. Verify state is `misattributed` and correct source is identified. | Status: not_done

- [ ] **Test `unsupported` citation state** -- Construct a scenario where no source matches the claim. Verify state is `unsupported`. | Status: not_done

- [ ] **Test `phantom` citation state** -- Construct a scenario where the citation references a non-existent source identifier. Verify state is `phantom`. | Status: not_done

- [ ] **Test grounding score computation** -- Verify with known attributed/unattributed claim counts. Test with zero factual claims (edge case). | Status: not_done

- [ ] **Test accuracy score computation** -- Verify with known verified/total citation counts. Verify returns `null` when no explicit citations exist. | Status: not_done

- [ ] **Test coverage score computation** -- Verify with known cited/total claim counts. | Status: not_done

- [ ] **Test faithfulness score computation** -- Verify average of composite scores for verified citations. | Status: not_done

- [ ] **Test quality score computation** -- Verify weighted combination of component scores. Verify weight redistribution when accuracy is `null`. Verify custom `scoreWeights`. | Status: not_done

---

## Phase 24: Unit Tests -- Auto-Attribution

- [ ] **Test citation marker insertion** -- Verify markers are inserted before periods, exclamation marks, and question marks. Verify no duplicate markers for already-cited sources. Verify multi-source marker insertion (`[1][3]`). | Status: not_done

- [ ] **Test auto-attribution activation** -- Verify auto-attribution activates when response has no explicit citations. Verify it also runs for individual uncited claims in a partially-cited response. Verify it does NOT run when `autoAttribute: false`. | Status: not_done

- [ ] **Test `AnnotatedResponse` structure** -- Verify the `text`, `report`, and `insertedCitations` fields are correctly populated. | Status: not_done

---

## Phase 25: Integration Tests

- [ ] **Test fully cited, fully grounded response** -- Response with explicit citations for every claim, all verified. Assert grounding = 1.0, accuracy = 1.0, coverage = 1.0. | Status: not_done

- [ ] **Test partially cited response** -- Response with citations on some claims but not others. Assert correct grounding, accuracy, and coverage values. | Status: not_done

- [ ] **Test misattributed citations end-to-end** -- Response where `[1]` actually matches source `[3]`. Verify misattribution detection and correct source identification. | Status: not_done

- [ ] **Test phantom citations end-to-end** -- Response citing `[5]` when only 3 sources provided. Verify phantom detection. | Status: not_done

- [ ] **Test no citations with auto-attribution** -- Response with no explicit citations. Verify auto-attribution generates correct annotations. | Status: not_done

- [ ] **Test paraphrased content matching** -- Response that paraphrases source content (not verbatim). Verify fuzzy and n-gram matching detect the attribution. | Status: not_done

- [ ] **Test multi-source claim attribution** -- A single claim drawing from two sources. Verify both sources are in the attribution list. | Status: not_done

- [ ] **Test non-factual content filtering end-to-end** -- Response with questions, hedging, disclaimers mixed with factual claims. Verify non-factual content is excluded from grounding score. | Status: not_done

- [ ] **Test determinism** -- Run the same input twice with the same options. Verify identical output (same scores, same attributions, same report structure). | Status: not_done

- [ ] **Test large source set performance** -- 100 source chunks, 20-claim response. Verify completion within performance targets (< 100ms excluding embedding). | Status: not_done

---

## Phase 26: Edge Case Tests

- [ ] **Test empty response** -- Produces zero claims. Scores should be trivially 1.0 or null. No errors thrown. | Status: not_done

- [ ] **Test response with only non-factual content** -- Zero factual claims. Scores handle zero denominators gracefully. | Status: not_done

- [ ] **Test single-word claim** -- `"Yes."` or `"No."` should be filtered as non-factual. | Status: not_done

- [ ] **Test citations but no source chunks** -- All citations become `phantom` or `unsupported`. Grounding is 0. | Status: not_done

- [ ] **Test source chunks with empty content** -- Sources with `content: ""`. Should not cause errors. Should not produce false matches. | Status: not_done

- [ ] **Test single sentence with single citation** -- Minimal valid input. Verify correct report structure. | Status: not_done

- [ ] **Test 50+ citations (stress test)** -- Response with many citations. Verify correct processing without errors or performance degradation. | Status: not_done

- [ ] **Test large source text (100KB+)** -- Source chunk with very large content. Verify performance within targets. | Status: not_done

- [ ] **Test Unicode text** -- CJK characters, emoji, right-to-left text. Verify correct handling without crashes or incorrect offsets. | Status: not_done

- [ ] **Test response with code blocks** -- Code syntax should not be extracted as citations (e.g., `[0]` in array access should not be confused with citation `[0]`). | Status: not_done

- [ ] **Test response with markdown tables** -- Pipe characters in tables should not be confused with citation markers. | Status: not_done

---

## Phase 27: Test Fixtures

- [ ] **Create sample LLM responses** -- In `src/__tests__/fixtures/responses/`, create at least 5 sample response files covering: fully cited response, partially cited response, no citations, misattributed citations, and paraphrased content. | Status: not_done

- [ ] **Create sample source chunk sets** -- In `src/__tests__/fixtures/sources/`, create matching source chunk sets for each sample response. | Status: not_done

- [ ] **Create expected report fixtures** -- In `src/__tests__/fixtures/reports/`, create expected `CitationReport` snapshots for fixture pairs. Use for regression testing. | Status: not_done

---

## Phase 28: Embedding Tests

- [ ] **Test embedding matching with mock embedder** -- Provide a mock `embedder` function that returns pre-computed vectors. Verify cosine similarity computation and threshold application. | Status: not_done

- [ ] **Test embedding caching** -- Verify that the same text is only embedded once (the embedder function is called once per unique text). Use a spy/counter on the mock embedder. | Status: not_done

- [ ] **Test pre-computed embeddings on source chunks** -- Provide sources with `embedding` field already populated. Verify the embedder is not called for those sources. | Status: not_done

- [ ] **Test composite weight adjustment with embedder** -- Verify that when an embedder is provided, the default weights shift to the embedding-enabled defaults (exact 0.30, fuzzy 0.15, ngram 0.15, tfidf 0.10, embedding 0.30). | Status: not_done

---

## Phase 29: Factory Tests

- [ ] **Test `createCiter()` option persistence** -- Create a citer with custom options. Call `citer.cite()` multiple times. Verify options are applied consistently. | Status: not_done

- [ ] **Test option merging precedence** -- Create a citer with factory options. Call `citer.cite()` with per-call overrides. Verify per-call overrides take precedence over factory options, which take precedence over defaults. | Status: not_done

- [ ] **Test `citer.extractCitations()` standalone** -- Verify it returns citations without performing matching. | Status: not_done

- [ ] **Test `citer.extractClaims()` standalone** -- Verify it returns claims without performing matching. | Status: not_done

- [ ] **Test `citer.attribute()` method** -- Verify it returns an `AnnotatedResponse` with inserted citations. | Status: not_done

- [ ] **Test `citer.verify()` as alias** -- Verify `citer.verify()` produces the same output as `citer.cite()`. | Status: not_done

---

## Phase 30: Performance Optimization and Benchmarks

- [ ] **Implement pre-computed TF-IDF corpus optimization** -- Ensure IDF values are computed once per `cite()` call and reused across all claim-source comparisons. Verify this is O(total_source_tokens) one-time cost, not O(claims * sources * tokens). | Status: not_done

- [ ] **Ensure no-backtracking regexes** -- Audit all citation pattern regexes to ensure linear-time execution. Replace any potentially catastrophic backtracking patterns with hand-written parsers. | Status: not_done

- [ ] **Create performance benchmark suite** -- Write benchmark tests that measure wall-clock time for: small response (200 words, 3 sources, target < 2ms), typical response (500 words, 5 sources, target < 10ms), long response (1000 words, 10 sources, target < 25ms), large source set (500 words, 50 sources, target < 50ms), stress test (2000 words, 100 sources, target < 100ms). | Status: not_done

- [ ] **Measure and verify memory usage** -- For 50 source chunks averaging 500 words each, verify total memory overhead is under 2MB. TF-IDF structures should be approximately 500KB. | Status: not_done

---

## Phase 31: Documentation

- [ ] **Create README.md** -- Write a comprehensive README with: package description, installation instructions, quick start example, full API reference (cite, extractCitations, extractClaims, verify, attribute, createCiter), configuration options table, usage examples (RAG chatbot, compliance, auto-attribution, batch evaluation), integration examples (chunk-smart, rag-prompt-builder, embed-cache, hallucinate-check, rag-eval-node-ts), and performance characteristics. | Status: not_done

- [ ] **Add JSDoc comments to all public exports** -- Every exported function, interface, and type should have JSDoc comments matching the documentation in the SPEC. | Status: not_done

---

## Phase 32: Package Configuration and Publishing Prep

- [ ] **Update package.json with runtime dependency** -- Add `"fastest-levenshtein": "^1.0.16"` to `dependencies`. | Status: not_done

- [ ] **Update package.json with dev dependencies** -- Add `typescript`, `vitest`, `eslint`, `@types/node` to `devDependencies`. | Status: not_done

- [ ] **Add keywords to package.json** -- Add relevant keywords: `rag`, `citation`, `attribution`, `verification`, `llm`, `grounding`, `faithfulness`, `claim`, `source`, `nlp`. | Status: not_done

- [ ] **Verify `files` field in package.json** -- Ensure only `dist/` is included in the published package. | Status: not_done

- [ ] **Verify `prepublishOnly` script** -- Ensure `npm run build` runs before `npm publish`. | Status: not_done

- [ ] **Bump version appropriately** -- Bump version in `package.json` according to semver for each release phase. | Status: not_done

- [ ] **Verify build output** -- Run `npm run build` and confirm `dist/` contains compiled `.js`, `.d.ts`, `.js.map`, and `.d.ts.map` files with correct structure. | Status: not_done

- [ ] **Run full test suite** -- Execute `npm run test` and confirm all tests pass. | Status: not_done

- [ ] **Run linter** -- Execute `npm run lint` and confirm zero errors. | Status: not_done
