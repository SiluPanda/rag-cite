# rag-cite -- Specification

## 1. Overview

`rag-cite` is a citation extraction, attribution, and verification library for RAG (Retrieval-Augmented Generation) pipelines. It parses inline citations from LLM-generated responses, breaks the response into individual verifiable claims, matches each claim against the source chunks that were provided as context, and produces a structured citation report that quantifies how well the response is grounded in its sources. It answers the questions that every RAG system operator needs answered: "Which parts of this response are supported by the provided sources?", "Are the citations accurate?", "Which claims have no source backing?", and "Is the LLM faithfully representing what the sources say?"

The gap this package fills is specific and well-defined. Citation attribution in RAG systems is a known hard problem. When an LLM generates a response using retrieved source chunks, the response may include inline citations -- `[1]`, `[Source: Wikipedia]`, `(Smith 2023)` -- but there is no automated way to verify whether those citations are accurate. The LLM might cite source [1] for a claim that actually came from source [3]. It might cite a source for a claim that does not appear in any provided source at all (citation hallucination). It might generate a factually correct response but fail to cite any sources, leaving the user with no way to verify the claims. It might paraphrase a source so heavily that simple string matching cannot connect the claim back to the original text. These are not edge cases -- they are the normal operating mode of every RAG system in production.

In Python, the `rag-citation` package by Rahul Anand addresses this problem with both LLM-based and non-LLM pipelines, offering semantic search, named entity recognition, and hallucination detection. The RAGAS framework provides a `faithfulness` metric that decomposes answers into claims and checks each against the context using NLI (Natural Language Inference). DeepEval provides an `AttributionMetric` that uses LLMs to verify whether claims are supported by context. LlamaIndex offers a `CitationQueryEngine` that forces the LLM to include citations during generation. But in the JavaScript/TypeScript ecosystem, there is nothing. The `citation-js` npm package handles bibliographic citation formatting (BibTeX, CSL) -- it parses and formats academic references, not RAG source attribution. The `string-similarity` and `fastest-levenshtein` packages provide low-level text comparison primitives but no citation-aware pipeline. The `natural` package provides NLP utilities (tokenizers, stemmers, classifiers) but nothing specific to citation extraction or verification. No npm package takes an LLM response and a set of source chunks and answers the question "are the citations in this response correct?"

`rag-cite` fills this gap with a lightweight, deterministic, offline pipeline that requires no LLM calls, no embedding models, and no API keys for its core functionality. It extracts citations from LLM responses using configurable pattern detection (numbered references, named references, parenthetical references, footnotes, and custom formats). It segments the response into verifiable claims using sentence-level boundaries with filtering for non-factual content. It matches each claim against the source chunks using a composite scoring system that combines exact substring matching, fuzzy substring matching via edit distance, n-gram overlap via Jaccard similarity, and TF-IDF cosine similarity -- with an optional pluggable embedding similarity layer for users who want semantic matching. It produces a `CitationReport` containing per-claim attribution details, unattributed claims (potential hallucinations), misattributed citations, and overall quality scores for grounding, accuracy, coverage, and faithfulness. For responses without explicit citations, an auto-attribution mode determines which sources support which claims and can insert citations into the response.

The package provides a TypeScript/JavaScript API for programmatic use. The API returns structured `CitationReport` objects with per-claim attribution details, confidence scores, match types, and overall quality metrics. The package has minimal runtime dependencies -- it depends on `fastest-levenshtein` for edit distance computation and implements all other matching algorithms (n-gram overlap, TF-IDF, sentence segmentation, citation parsing) using hand-written code and Node.js built-in modules.

---

## 2. Goals and Non-Goals

### Goals

- Provide a `cite(response, sources, options?)` function that extracts citations from an LLM response, segments the response into claims, matches each claim against source chunks using multiple matching strategies, verifies citation accuracy, and returns a comprehensive `CitationReport`.
- Extract inline citations from LLM responses in multiple formats: numbered references (`[1]`, `[2]`), named references (`[Source: ...]`, `[Document Title]`), parenthetical references (`(Smith 2023)`, `(Source 1)`), footnote markers (superscript-style `^1`, `^[1]`), URL references, and custom user-defined patterns.
- Segment LLM responses into individual verifiable claims using sentence boundary detection, with filtering for non-factual content (questions, hedging language, meta-commentary, transition phrases).
- Match claims to source chunks using a composite scoring system that combines multiple matching strategies: exact substring detection, fuzzy substring matching, word n-gram Jaccard similarity, and TF-IDF cosine similarity.
- Support pluggable embedding-based similarity as an optional matching strategy for users who have access to embedding models and want higher-accuracy semantic matching.
- Verify citation accuracy: for each explicit citation in the response, determine whether the cited source actually supports the claim it is attached to.
- Detect unattributed claims: identify claims in the response that are not supported by any provided source, flagging potential hallucinations.
- Detect misattributed citations: identify citations that point to the wrong source (the claim is supported by source [3] but cites source [1]).
- Compute overall quality scores: grounding score (fraction of claims supported by any source), attribution accuracy (fraction of citations pointing to correct sources), coverage score (fraction of response text that has citations), and faithfulness score (how accurately cited sources are represented).
- Provide an auto-attribution mode that matches claims to sources and generates citation annotations for responses that lack explicit citations.
- Provide a `createCiter` factory function that creates a configured instance with preset options, avoiding repeated option parsing.
- Apply only deterministic, rule-based matching for core functionality. No LLM calls, no embedding model calls, no network access in the default pipeline. The same input with the same options always produces the same output.
- Keep dependencies minimal: depend only on `fastest-levenshtein` for edit distance computation. All other algorithms (n-gram overlap, TF-IDF, sentence segmentation, citation parsing) are implemented from scratch.
- Work with any LLM's output: OpenAI, Anthropic, Google, Cohere, open-source models. The library is model-agnostic and operates on plain text responses.

### Non-Goals

- **Not an LLM-based verifier.** This package does not call any LLM API to verify citations. LLM-based verification (as used by RAGAS faithfulness and DeepEval attribution) offers higher accuracy for paraphrase detection but requires API keys, costs money, adds latency, and introduces non-determinism. `rag-cite` uses deterministic text-matching heuristics. For LLM-based verification, use `rag-eval-node-ts` or call an LLM directly on the structured output from `rag-cite`.
- **Not an embedding generator.** This package does not generate embeddings. It accepts pre-computed embeddings through a pluggable interface. For embedding generation and caching, use `embed-cache`.
- **Not an NLI (Natural Language Inference) engine.** NLI models (e.g., DeBERTa fine-tuned on MNLI) can determine textual entailment -- whether a source text entails a claim. This package does not run NLI models. It uses text overlap heuristics as a proxy for entailment. NLI-based verification is more accurate but requires model inference. Users who need NLI can use the claim-source pairs from `rag-cite`'s output as input to an NLI model.
- **Not a full RAG evaluation framework.** This package evaluates citation quality specifically. It does not evaluate retrieval quality (precision, recall, MRR), answer relevance, or response coherence. For comprehensive RAG evaluation, use `rag-eval-node-ts`, which covers the broader evaluation surface.
- **Not a citation formatter.** This package does not format citations into APA, MLA, Chicago, or BibTeX styles. For bibliographic citation formatting, use `citation-js`.
- **Not a document retriever.** This package operates post-retrieval. It takes the LLM response and the source chunks that were already retrieved and provided as context. It does not perform vector search, keyword search, or any retrieval operation.
- **Not a hallucination detector.** While unattributed claims may indicate hallucinations, this package does not determine whether a claim is factually true or false -- only whether it is supported by the provided sources. A claim can be factually correct but unsupported by sources (not a hallucination, just uncited). A claim can be factually wrong but supported by a source that contains the same error (not flagged by this tool). For heuristic hallucination detection, use `hallucinate-check`.

---

## 3. Target Users and Use Cases

### RAG Application Developers

Developers building retrieval-augmented generation applications (chatbots, search assistants, knowledge base Q&A systems) who need to verify that their LLM's responses are properly grounded in retrieved sources. After the LLM generates a response, they run `cite(response, sources)` to get a citation report showing which claims are supported, which are not, and whether the explicit citations are accurate. This report can be displayed to end users as a trust indicator, logged for debugging, or used to trigger re-generation when citation quality is below a threshold.

### Compliance and Audit Teams

Teams in regulated industries (healthcare, finance, legal) where AI-generated responses must be traceable to source documents. Regulatory requirements may demand that every claim in an AI response can be attributed to a specific source document. `rag-cite` provides the audit trail: per-claim attribution with confidence scores, source identifiers, and match evidence. The `CitationReport` serves as a machine-readable compliance artifact.

### Search Engine and AI Overview Builders

Teams building search experiences with AI-generated summaries (similar to Google AI Overviews, Perplexity, or Bing Chat). These products display inline citations linking claims to source web pages. `rag-cite` verifies that the generated citations are accurate before displaying them to users, preventing the embarrassment and liability of showing citations that do not actually support the claims they are attached to.

### LLM Output Quality Engineers

Engineers responsible for monitoring and improving LLM output quality in production. They use `rag-cite` in evaluation pipelines to compute citation quality metrics across thousands of responses, tracking grounding scores, attribution accuracy, and coverage over time. Regressions in citation quality after a model update or prompt change are caught automatically.

### Chatbot and Conversational AI Developers

Developers building conversational AI assistants that need to cite their sources when answering questions. The auto-attribution mode generates citation annotations for responses that lack explicit citations, enabling the chatbot to display source links even when the LLM did not include them in its output.

### RAG Pipeline Researchers and Evaluators

Researchers comparing different RAG configurations (different chunking strategies, retrieval methods, re-ranking approaches, prompt templates) who need a consistent metric for citation quality. `rag-cite` provides deterministic, reproducible scores that enable apples-to-apples comparison across pipeline configurations.

### Integration with npm-master Ecosystem

Developers using other packages in the npm-master monorepo: `chunk-smart` for chunking source documents, `rag-prompt-builder` for composing RAG prompts with source chunks, `embed-cache` for caching embeddings of chunks, `hallucinate-check` for heuristic hallucination detection, and `rag-eval-node-ts` for comprehensive RAG evaluation. `rag-cite` is the citation-specific evaluation step that sits between response generation and final output delivery.

---

## 4. Core Concepts

### Citation

A citation is an explicit reference in an LLM-generated response that attributes a claim to a specific source. Citations take many forms: numbered references (`[1]`, `[2]`), named references (`[Source: Wikipedia]`, `[Document Title]`), parenthetical references (`(Smith 2023)`), footnote markers (`^1`, `^[1]`), or URL references. A citation is a syntactic element -- it is a marker in the text that points to a source. Whether the citation is accurate (the source actually supports the claim) is a separate question that `rag-cite` answers.

### Claim

A claim is an individual factual assertion within the LLM response that can be independently verified against source material. Claims are the atomic units of verification. A single sentence may contain one claim ("Paris is the capital of France") or multiple claims ("Paris is the capital of France and has a population of 2.1 million"). Claims are extracted by sentence segmentation with optional sub-sentence decomposition. Non-factual sentences -- questions, hedging language ("I think...", "It might be..."), meta-commentary ("As mentioned above..."), and transition phrases ("Let me explain...") -- are filtered out because they make no verifiable assertions.

### Source Chunk

A source chunk is a passage of text from a retrieved document that was provided to the LLM as context for generating its response. Each source chunk has an identifier (used for citation matching), the text content, and optional metadata (document title, URL, page number, section heading). Source chunks are the evidence against which claims are verified. They are typically produced by a chunking step earlier in the RAG pipeline (e.g., using `chunk-smart`).

### Attribution

Attribution is the mapping from a claim to the source chunk(s) that support it. An attribution includes the claim text, the matched source chunk(s), the confidence score (how strongly the match was detected), the match type (exact, fuzzy, n-gram, TF-IDF, embedding), and the specific evidence (the substring or region in the source that matches). A claim may have zero attributions (unattributed -- potential hallucination), one attribution (single-source claim), or multiple attributions (multi-source claim drawing from several chunks).

### Grounding

Grounding measures whether the claims in the response are supported by the provided sources, regardless of whether the response includes explicit citations. A fully grounded response is one where every factual claim can be traced to at least one source chunk. An ungrounded claim is one that cannot be matched to any provided source -- it may be correct information from the LLM's parametric knowledge, or it may be a hallucination. The grounding score is the fraction of claims that have at least one attribution above the confidence threshold.

### Citation Accuracy

Citation accuracy measures whether explicit citations point to the correct sources. When the response says "Paris is the capital of France [1]", citation accuracy checks whether source [1] actually contains information about Paris being the capital of France. A misattributed citation points to the wrong source: the claim is supported by source [3] but the response cites source [1]. The accuracy score is the fraction of explicit citations that correctly identify a supporting source.

### Coverage

Coverage measures what fraction of the response text has associated citations. A response might have perfect citation accuracy for the claims it does cite, but leave large portions of the response uncited. High coverage means the response thoroughly attributes its claims to sources. Coverage is measured as the fraction of claim-bearing sentences (excluding non-factual sentences) that have at least one citation or attribution.

### Faithfulness

Faithfulness measures whether the response accurately represents what the cited sources say. A faithful citation means the claim correctly reflects the source content. An unfaithful citation distorts, exaggerates, or misrepresents the source -- the source says "the study found a small positive effect" but the response says "the study proved a massive benefit [1]". Faithfulness is assessed by the strength and quality of the match between the claim text and the source text: high-confidence exact or near-exact matches indicate high faithfulness, while low-confidence fuzzy matches may indicate paraphrasing or distortion.

### Citation Hallucination

A citation hallucination occurs when the LLM generates a citation that does not correspond to any provided source, or when it cites a source for a claim that the source does not support. This is distinct from factual hallucination (generating false information). Citation hallucination is specifically about the accuracy of the source attribution, not the factual correctness of the claim itself. `rag-cite` detects two forms of citation hallucination: phantom citations (citing a source identifier that was not in the provided sources) and misattributed citations (citing a real source that does not support the claim).

---

## 5. Citation Extraction

### Overview

Citation extraction is the first stage of the pipeline. It identifies all explicit citations in the LLM response, determines which text each citation covers, and maps citation identifiers to source chunks. The extraction stage operates on the raw response text and produces a list of `Citation` objects that the subsequent stages use for verification.

### Citation Pattern Detection

`rag-cite` detects citations using a prioritized set of regex-based pattern detectors. Each detector targets a specific citation format. When multiple detectors match at the same position, the most specific match wins (longest match, then highest priority).

#### Numbered References

The most common citation format in RAG responses. The LLM generates numbered markers that correspond to the source chunks provided in the prompt.

| Pattern | Example | Detected As |
|---------|---------|-------------|
| `[N]` | `[1]`, `[2]`, `[13]` | `{ format: 'numbered', id: '1' }` |
| `[N, M]` | `[1, 3]`, `[2, 5, 7]` | Multiple citations at same position |
| `[N-M]` | `[1-3]` | Expanded to `[1]`, `[2]`, `[3]` |
| `[Source N]` | `[Source 1]`, `[Source 2]` | `{ format: 'numbered', id: '1' }` |
| `[Ref N]` | `[Ref 1]`, `[Ref 2]` | `{ format: 'numbered', id: '1' }` |

Numbered references are matched to source chunks by index: `[1]` maps to the first source chunk, `[2]` maps to the second, and so on. The mapping can be customized via the `sourceMap` option when source identifiers are not sequential integers.

#### Named References

Citations that reference sources by name, title, or descriptive label.

| Pattern | Example | Detected As |
|---------|---------|-------------|
| `[Name]` | `[Wikipedia]`, `[Annual Report]` | `{ format: 'named', id: 'Wikipedia' }` |
| `[Source: Name]` | `[Source: Wikipedia]` | `{ format: 'named', id: 'Wikipedia' }` |
| `[Doc: Name]` | `[Doc: API Reference]` | `{ format: 'named', id: 'API Reference' }` |

Named references are matched to source chunks by comparing the citation name against source metadata (document title, filename, URL) using case-insensitive fuzzy matching.

#### Parenthetical References

Academic-style citations with author names and years, or parenthetical source identifiers.

| Pattern | Example | Detected As |
|---------|---------|-------------|
| `(Author Year)` | `(Smith 2023)`, `(Johnson et al. 2024)` | `{ format: 'parenthetical', id: 'Smith 2023' }` |
| `(Author, Year)` | `(Smith, 2023)` | `{ format: 'parenthetical', id: 'Smith 2023' }` |
| `(Source N)` | `(Source 1)` | `{ format: 'parenthetical', id: '1' }` |

Parenthetical references are matched to source chunks by comparing against source metadata fields (author, year, title).

#### Footnote Markers

Superscript-style or caret-style footnote markers.

| Pattern | Example | Detected As |
|---------|---------|-------------|
| `^N` | `^1`, `^2` | `{ format: 'footnote', id: '1' }` |
| `^[N]` | `^[1]`, `^[2]` | `{ format: 'footnote', id: '1' }` |
| `[^N]` | `[^1]`, `[^2]` | `{ format: 'footnote', id: '1' }` |

Footnote markers are matched to source chunks by index, the same as numbered references.

#### URL References

Inline URLs that serve as source citations.

| Pattern | Example | Detected As |
|---------|---------|-------------|
| Bare URL | `https://example.com/page` | `{ format: 'url', id: 'https://example.com/page' }` |
| Markdown link | `[text](https://example.com)` | `{ format: 'url', id: 'https://example.com' }` |

URL references are matched to source chunks by comparing against source metadata URL fields.

### Custom Citation Formats

Users can register custom citation patterns via the `citationPatterns` option. Each custom pattern specifies a regex and an extraction function:

```typescript
cite(response, sources, {
  citationPatterns: [
    {
      name: 'custom-bracket',
      pattern: /\{ref:(\w+)\}/g,
      extract: (match) => ({ format: 'custom', id: match[1] }),
    },
  ],
});
```

Custom patterns are evaluated after built-in patterns. If a custom pattern conflicts with a built-in pattern at the same position, the custom pattern takes priority (user configuration overrides defaults).

### Citation-Text Association

After detecting citation markers, the extractor determines which text each citation covers. The association algorithm works backward from the citation marker:

1. **Same-sentence scope** (default): A citation at the end of a sentence covers the entire sentence. `"Paris is the capital of France [1]."` -- the citation `[1]` covers the claim "Paris is the capital of France."
2. **Preceding-clause scope**: A citation in the middle of a sentence covers the clause immediately preceding it. `"Paris is the capital of France [1], and London is the capital of England [2]."` -- `[1]` covers "Paris is the capital of France" and `[2]` covers "London is the capital of England."
3. **Paragraph scope**: When a citation appears at the end of a paragraph with no other citations in that paragraph, it covers the entire paragraph.
4. **Multiple citations**: When multiple citations appear at the same position (`[1][2]` or `[1, 2]`), all citations cover the same text span.

### Citation Grouping

Citations that appear together (e.g., `[1][2]`, `[1, 2, 3]`, `[1-3]`) are grouped into a single citation group. Each source in the group is independently verified against the covered text. A claim supported by multiple sources is stronger than one supported by a single source.

### Handling Responses Without Citations

Many LLM responses do not include explicit citations, even when the prompt included source chunks. When no citations are detected in the response, `rag-cite` operates in auto-attribution mode (Section 12): it matches claims to sources without relying on explicit citation markers, and optionally generates citation annotations that can be inserted into the response.

---

## 6. Claim Extraction

### Overview

Claim extraction is the second stage of the pipeline. It breaks the LLM response into individual verifiable claims -- the atomic units against which source chunks are matched. The goal is to decompose the response into granular assertions, each of which can be independently checked against the sources.

### Sentence Segmentation

The primary claim boundary is the sentence. The segmenter splits the response into sentences using a rule-based approach:

1. **Sentence-ending punctuation**: Split on `.`, `!`, `?` followed by whitespace or end of text. Handle common abbreviations that contain periods: `Dr.`, `Mr.`, `Mrs.`, `Ms.`, `Prof.`, `e.g.`, `i.e.`, `vs.`, `etc.`, `U.S.`, `U.K.`. These do not trigger a sentence split.
2. **Decimal numbers**: Periods within numbers (`3.14`, `$1,200.50`) do not trigger a split.
3. **Ellipses**: `...` does not trigger a split within a sentence.
4. **URLs**: Periods within URLs do not trigger splits.
5. **Newlines**: Double newlines (`\n\n`) always trigger a split (paragraph boundary). Single newlines within a paragraph do not trigger a split unless followed by a list marker.
6. **List items**: Lines starting with `- `, `* `, `1. `, or similar list markers are treated as individual claims.
7. **Bullet boundaries**: Each bullet point in a bulleted list is treated as a separate claim, regardless of punctuation.

### Claim Boundary Detection

Beyond sentence segmentation, the claim extractor applies additional heuristics to identify claim boundaries within sentences:

- **Coordinating conjunctions with independent clauses**: Sentences joined by `, and`, `, but`, `, or`, `, yet` where each clause makes an independent factual assertion may be split into separate claims. "The product launched in 2023, and it has since gained 1 million users" becomes two claims.
- **Semicolons**: Clauses separated by semicolons are treated as separate claims.
- **Colon-separated lists**: "The report identified three risks: supply chain disruption, regulatory changes, and market volatility" may be kept as a single compound claim or split, depending on the `claimGranularity` option.

### Filtering Non-Factual Content

Not every sentence in an LLM response makes a verifiable factual assertion. The claim extractor filters out non-factual content to avoid false negative attributions (flagging a non-factual sentence as "unattributed" when it was never meant to be attributed):

| Category | Detection Heuristic | Examples |
|----------|-------------------|----------|
| Questions | Ends with `?` or starts with question words (`What`, `How`, `Why`, `When`, `Where`, `Who`, `Which`, `Can`, `Could`, `Would`, `Should`, `Is`, `Are`, `Do`, `Does`) | "What does this mean?" |
| Hedging language | Starts with or contains hedging markers: `I think`, `I believe`, `It seems`, `It appears`, `possibly`, `perhaps`, `might`, `may`, `could be`, `arguably` | "It might be the case that..." |
| Meta-commentary | Sentences about the response itself rather than the topic: `As mentioned`, `As discussed`, `In summary`, `To summarize`, `In conclusion`, `As noted above`, `Let me explain`, `I'll now describe` | "As mentioned earlier, ..." |
| Transition phrases | Sentences that serve only as transitions: `Moving on`, `Next`, `Additionally`, `Furthermore`, `Moreover`, `However`, `On the other hand`, `That said` (when standalone, not followed by a factual clause) | "Let's move on to the next topic." |
| Greetings and closings | Social niceties that carry no factual content: `Sure!`, `Great question!`, `I hope this helps`, `Let me know if you have questions`, `Happy to help` | "I hope this helps!" |
| Disclaimers | Standard LLM disclaimers: `I'm an AI`, `I don't have personal opinions`, `My training data`, `I cannot guarantee` | "Please note that I'm an AI assistant." |

Filtering is conservative: a sentence is only filtered if it matches a non-factual pattern with high confidence. Borderline cases are kept as claims to avoid missing genuine assertions that happen to use hedging language.

### Multi-Sentence Claims

Some factual claims span multiple sentences. The claim extractor identifies multi-sentence claims when:

- The second sentence starts with a pronoun or demonstrative that refers back to the first sentence (`This`, `That`, `These`, `It`, `They`, `The above`) and the second sentence would be meaningless without the first.
- Two consecutive sentences share a subject and together form a coherent compound claim.

In these cases, the sentences are merged into a single claim for matching purposes, but the individual sentences are preserved in the claim metadata for display.

### Claim Output

Each extracted claim is a `Claim` object containing:

- `text`: The claim text.
- `sentences`: The source sentence(s) from which the claim was extracted.
- `startOffset` / `endOffset`: Character offsets in the original response.
- `citations`: Any explicit citations attached to this claim (from the citation extraction stage).
- `isFactual`: Whether the claim passed the non-factual content filter.
- `index`: Sequential index in the claim list.

---

## 7. Attribution Matching

### Overview

Attribution matching is the core of the pipeline. For each claim extracted from the response, the matcher compares the claim text against every source chunk and computes a composite similarity score. Claims with scores above the configured threshold are considered attributed (grounded in sources). The matching system uses multiple complementary strategies, each capturing a different dimension of text similarity, and combines them into a single confidence score.

### 7.1 Exact Substring Matching

The simplest and highest-confidence matching strategy. If the claim text (or a substantial portion of it) appears verbatim in a source chunk, the claim is attributed to that source with high confidence.

**Algorithm:**
1. Normalize both texts: lowercase, collapse whitespace, strip punctuation at boundaries.
2. Check if the normalized claim text is a substring of the normalized source text.
3. If yes, record a match with confidence 1.0 and match type `exact`.
4. If not, check if any contiguous sequence of words from the claim (minimum 5 words) appears in the source. This detects partial direct quotes embedded in a longer claim.

**When it works:** Direct quotes, copy-pasted passages, lightly reformatted text.

**When it fails:** Paraphrases, reworded content, content drawn from multiple sources.

### 7.2 Fuzzy Substring Matching

Catches near-exact matches where the LLM made minor changes: word substitutions, small additions or deletions, typo corrections, or tense changes.

**Algorithm:**
1. Slide a window of size `claim.length +/- 20%` across the source text.
2. For each window position, compute the Levenshtein edit distance between the claim and the window contents using `fastest-levenshtein`.
3. Compute normalized similarity: `1 - (distance / max(claim.length, window.length))`.
4. Record the best (highest similarity) window position.
5. If similarity exceeds the fuzzy threshold (default: 0.8), record a match with the similarity as confidence and match type `fuzzy`.

**Optimization:** The sliding window does not evaluate every possible position. It pre-filters using a trigram index: only positions where at least 30% of the claim's character trigrams appear within the window are evaluated with the full edit distance computation. This reduces the number of expensive Levenshtein computations from O(source.length) to a much smaller set.

**When it works:** Minor rewording, synonym substitution ("big" to "large"), tense changes, article changes.

**When it fails:** Heavy paraphrasing, summarization, content reorganization.

### 7.3 N-gram Overlap (Jaccard Similarity)

Measures the overlap of word sequences between the claim and source, robust to word reordering and moderate paraphrasing.

**Algorithm:**
1. Tokenize both claim and source into words (split on whitespace, lowercase, remove stopwords).
2. Generate word n-grams for n = 1 (unigrams), n = 2 (bigrams), and n = 3 (trigrams).
3. Compute Jaccard similarity for each n-gram size: `|intersection| / |union|`.
4. Compute weighted average: `0.2 * jaccard_1 + 0.3 * jaccard_2 + 0.5 * jaccard_3`. Higher-order n-grams get more weight because they are more specific -- shared trigrams indicate genuine content overlap, not just common vocabulary.
5. If the weighted score exceeds the n-gram threshold (default: 0.3), record a match with the score as confidence and match type `ngram`.

**Stopword removal:** Common English stopwords (`the`, `a`, `an`, `is`, `are`, `was`, `were`, `in`, `on`, `at`, `to`, `for`, `of`, `and`, `or`, `but`, `not`, `with`, `this`, `that`, `it`, `from`, `by`, `as`) are removed before n-gram generation. This prevents high-frequency words from inflating similarity scores between unrelated texts that happen to share common function words.

**When it works:** Moderate paraphrasing, word reordering, partial overlap.

**When it fails:** Complete rewording with no shared vocabulary, highly abstractive summarization.

### 7.4 TF-IDF Cosine Similarity

A lightweight semantic matching strategy that weighs words by their discriminative power across the source corpus. Words that appear in many source chunks (common terms) get low weight; words that appear in few source chunks (distinctive terms) get high weight.

**Algorithm:**
1. Build a vocabulary from all source chunks combined.
2. Compute IDF (Inverse Document Frequency) for each term: `log(N / df)` where `N` is the number of source chunks and `df` is the number of chunks containing the term. Add smoothing: `log((N + 1) / (df + 1)) + 1`.
3. For each claim-source pair:
   a. Tokenize and lowercase both texts.
   b. Compute TF (Term Frequency) vectors: count of each term divided by total terms.
   c. Compute TF-IDF vectors: element-wise product of TF and IDF.
   d. Compute cosine similarity: `dot(claim_tfidf, source_tfidf) / (norm(claim_tfidf) * norm(source_tfidf))`.
4. If cosine similarity exceeds the TF-IDF threshold (default: 0.3), record a match with the score as confidence and match type `tfidf`.

**IDF computation context:** The IDF values are computed once across all provided source chunks and reused for all claim-source comparisons. This means the discriminative power of terms is measured relative to the provided corpus, not a global corpus. A term that is common across all source chunks gets low weight; a term that appears in only one source chunk gets high weight.

**When it works:** Topic matching, key term overlap, content from specialized domains with distinctive vocabulary.

**When it fails:** Synonyms (different words, same meaning), highly abstractive content, very short claims with few distinctive terms.

### 7.5 Embedding Similarity (Optional, Pluggable)

For users who have access to embedding models and want higher-accuracy semantic matching, `rag-cite` supports pluggable embedding comparison. This is not part of the core deterministic pipeline -- it requires the user to provide an embedding function.

**Interface:**
```typescript
cite(response, sources, {
  embedder: async (text: string) => number[],  // returns embedding vector
  embeddingThreshold: 0.8,                       // cosine similarity threshold
});
```

**Algorithm:**
1. Embed each claim and each source chunk using the provided `embedder` function.
2. Compute cosine similarity between each claim embedding and each source embedding.
3. If similarity exceeds the embedding threshold (default: 0.8), record a match with the score as confidence and match type `embedding`.

**Caching:** When an `embedder` is provided, `rag-cite` caches embeddings by text content hash (SHA-256 of the text) to avoid redundant embedding calls. Source chunk embeddings are computed once and reused for all claims.

**When it works:** Paraphrasing, synonyms, abstractive summarization, conceptual matches.

**When it fails:** Depends on the embedding model. Low-quality models may produce false matches.

### 7.6 Composite Scoring

The final attribution confidence for each claim-source pair is a weighted combination of all active matching strategies:

```
composite = w_exact * exact_score
           + w_fuzzy * fuzzy_score
           + w_ngram * ngram_score
           + w_tfidf * tfidf_score
           + w_embed * embed_score
```

Default weights (when embedding is not provided):

| Strategy | Weight | Rationale |
|----------|--------|-----------|
| Exact substring | 0.40 | Highest confidence signal -- direct text reuse |
| Fuzzy substring | 0.25 | Strong signal for near-exact matches |
| N-gram overlap | 0.20 | Moderate signal for content overlap |
| TF-IDF cosine | 0.15 | Weak but complementary signal for topic relevance |

Default weights (when embedding is provided):

| Strategy | Weight | Rationale |
|----------|--------|-----------|
| Exact substring | 0.30 | Still highest-confidence text signal |
| Fuzzy substring | 0.15 | Reduced because embedding captures similar cases |
| N-gram overlap | 0.15 | Reduced for same reason |
| TF-IDF cosine | 0.10 | Reduced for same reason |
| Embedding | 0.30 | Strong semantic signal |

Weights are configurable via the `weights` option. The composite score is clamped to `[0, 1]`.

### Attribution Threshold

A claim is considered attributed to a source when the composite score exceeds the `attributionThreshold` (default: 0.4). The threshold is deliberately set at a moderate level: too low produces false attributions (matching unrelated text), too high misses legitimate paraphrased content. Users should tune this threshold based on their tolerance for false positives vs. false negatives.

| Threshold Range | Behavior |
|----------------|----------|
| 0.2 - 0.3 | Permissive: catches heavy paraphrases but may produce false matches |
| 0.3 - 0.5 | Moderate (default range): balances precision and recall |
| 0.5 - 0.7 | Strict: requires strong textual overlap, misses heavy paraphrases |
| 0.7 - 1.0 | Very strict: requires near-verbatim matches only |

### Multi-Source Attribution

A single claim may draw from multiple sources. When a claim matches multiple source chunks above the attribution threshold, all matching sources are recorded in the attribution. The sources are sorted by composite score (highest first). The primary attribution is the highest-scoring source; secondary attributions are additional supporting sources. This captures the common RAG pattern where the LLM synthesizes information from multiple retrieved chunks into a single statement.

---

## 8. Verification

### Overview

Verification is the third stage of the pipeline. It combines the outputs of citation extraction (Stage 1), claim extraction (Stage 2), and attribution matching (Stage 3) to produce quality scores. Verification answers five questions: (1) Is each explicit citation accurate? (2) What fraction of claims are grounded in sources? (3) What fraction of the response has citations? (4) Are cited sources accurately represented? (5) What is the overall citation quality?

### 8.1 Per-Citation Verification

For each explicit citation in the response, verification checks whether the cited source supports the claim the citation is attached to.

**Process:**
1. Look up the source chunk that the citation points to (by index, name, or URL).
2. If the cited source does not exist in the provided sources, flag the citation as `phantom` (the LLM fabricated a source reference).
3. Run attribution matching between the claim text and the cited source chunk.
4. If the composite score exceeds the attribution threshold, the citation is `verified` -- the cited source supports the claim.
5. If the composite score is below the threshold, check if any other source chunk matches the claim above the threshold.
   - If yes, the citation is `misattributed` -- the claim is grounded but the wrong source was cited. The report includes the correct source.
   - If no, the citation is `unsupported` -- neither the cited source nor any other source supports the claim.

**Per-citation result states:**

| State | Meaning |
|-------|---------|
| `verified` | The cited source supports the claim. |
| `misattributed` | A source supports the claim, but it is not the one cited. |
| `unsupported` | No source supports the claim. The claim may be from parametric knowledge or hallucinated. |
| `phantom` | The citation references a source identifier that does not exist in the provided sources. |

### 8.2 Grounding Score

The grounding score measures what fraction of claims in the response are supported by at least one source chunk, regardless of whether the response includes explicit citations.

```
grounding_score = (number of claims with at least one attribution above threshold) / (total number of factual claims)
```

- A grounding score of 1.0 means every factual claim in the response is supported by at least one provided source.
- A grounding score of 0.0 means no claims are supported -- the response is entirely from parametric knowledge or hallucinated.
- Claims filtered as non-factual (questions, meta-commentary) are excluded from the denominator.

### 8.3 Attribution Accuracy Score

The attribution accuracy score measures what fraction of explicit citations point to sources that actually support the cited claims.

```
accuracy_score = (number of 'verified' citations) / (total number of explicit citations)
```

- A score of 1.0 means every citation in the response correctly identifies a supporting source.
- A score of 0.0 means no citations are accurate.
- This score is only meaningful when the response contains explicit citations. For responses without citations, the score is `null`.

### 8.4 Coverage Score

The coverage score measures what fraction of factual claims in the response have associated citations (explicit or auto-attributed).

```
coverage_score = (number of factual claims with at least one citation) / (total number of factual claims)
```

- A score of 1.0 means every factual claim is cited.
- A score of 0.0 means no claims are cited (even if they are grounded -- grounding measures source support, coverage measures citation presence).

### 8.5 Faithfulness Score

The faithfulness score measures how accurately the response represents the content of cited sources. It is computed from the attribution confidence scores:

```
faithfulness_score = average(composite_score for all verified citations)
```

- A score close to 1.0 means the response closely mirrors the source text (near-verbatim or very close paraphrasing).
- A lower score means the response paraphrases or restructures the source content more aggressively, which increases the risk of distortion.
- This is a proxy metric: text similarity is used as a proxy for semantic faithfulness. True faithfulness assessment would require NLI or LLM-based evaluation, which is out of scope for this package.

### 8.6 Overall Quality Score

The overall citation quality score is a weighted combination of the four component scores:

```
quality_score = w_grounding * grounding_score
             + w_accuracy * accuracy_score
             + w_coverage * coverage_score
             + w_faithfulness * faithfulness_score
```

Default weights:

| Component | Weight | Rationale |
|-----------|--------|-----------|
| Grounding | 0.35 | Most important: are claims supported by sources? |
| Accuracy | 0.30 | Critical: do citations point to the right sources? |
| Coverage | 0.15 | Desirable: is the response well-cited? |
| Faithfulness | 0.20 | Important: are sources accurately represented? |

When the response has no explicit citations (accuracy is `null`), the accuracy weight is redistributed proportionally to the other components.

---

## 9. API Surface

### Installation

```bash
npm install rag-cite
```

### Runtime Dependencies

```json
{
  "dependencies": {
    "fastest-levenshtein": "^1.0.16"
  }
}
```

### Main Export: `cite`

The primary API. Extracts citations, segments claims, matches claims to sources, verifies citations, and returns a comprehensive citation report.

```typescript
import { cite } from 'rag-cite';

const report = await cite(
  'Paris is the capital of France [1]. It has a population of about 2.1 million [2].',
  [
    { id: '1', content: 'Paris is the capital and largest city of France.' },
    { id: '2', content: 'The population of Paris is approximately 2.16 million inhabitants.' },
  ],
);

console.log(report.scores.grounding);    // 1.0
console.log(report.scores.accuracy);     // 1.0
console.log(report.scores.quality);      // 0.95
console.log(report.claims.length);       // 2
console.log(report.unattributed.length); // 0
```

### Type Definitions

```typescript
// -- Source Chunk Input --------------------------------------------------

/** A source chunk provided as context to the LLM. */
interface SourceChunk {
  /** Unique identifier for this source. Used for citation matching. */
  id: string;

  /** The text content of the source chunk. */
  content: string;

  /** Optional metadata for named/parenthetical citation matching. */
  metadata?: SourceMetadata;

  /** Optional pre-computed embedding vector. */
  embedding?: number[];
}

/** Metadata associated with a source chunk. */
interface SourceMetadata {
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

// -- Citation -----------------------------------------------------------

/** A citation extracted from the LLM response. */
interface Citation {
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

// -- Claim --------------------------------------------------------------

/** A verifiable claim extracted from the LLM response. */
interface Claim {
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

// -- Attribution --------------------------------------------------------

/** The result of matching a single claim against a single source. */
interface Attribution {
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

// -- Verification -------------------------------------------------------

/** The verification result for a single explicit citation. */
interface CitationVerification {
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

// -- Claim Report -------------------------------------------------------

/** The full attribution result for a single claim. */
interface ClaimReport {
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

// -- Scores -------------------------------------------------------------

/** Aggregate citation quality scores. */
interface CitationScores {
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

// -- Citation Report (Main Output) --------------------------------------

/** The complete citation report returned by cite(). */
interface CitationReport {
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

// -- Options ------------------------------------------------------------

/** Configuration options for the cite() function. */
interface CiteOptions {
  /**
   * Attribution threshold. Claims with composite scores above this
   * value are considered attributed.
   * Default: 0.4.
   */
  attributionThreshold?: number;

  /**
   * Fuzzy matching threshold. Minimum normalized edit distance similarity
   * for a fuzzy match to count.
   * Default: 0.8.
   */
  fuzzyThreshold?: number;

  /**
   * N-gram overlap threshold. Minimum weighted Jaccard similarity
   * for an n-gram match to count.
   * Default: 0.3.
   */
  ngramThreshold?: number;

  /**
   * TF-IDF cosine threshold. Minimum cosine similarity for a TF-IDF
   * match to count.
   * Default: 0.3.
   */
  tfidfThreshold?: number;

  /**
   * Embedding similarity threshold. Minimum cosine similarity for an
   * embedding match to count. Only used when embedder is provided.
   * Default: 0.8.
   */
  embeddingThreshold?: number;

  /**
   * Strategy weights for composite scoring.
   * Defaults depend on whether embedder is provided.
   */
  weights?: {
    exact?: number;
    fuzzy?: number;
    ngram?: number;
    tfidf?: number;
    embedding?: number;
  };

  /**
   * Score weights for overall quality calculation.
   */
  scoreWeights?: {
    grounding?: number;
    accuracy?: number;
    coverage?: number;
    faithfulness?: number;
  };

  /**
   * Optional embedding function for semantic matching.
   * Receives text, returns embedding vector.
   */
  embedder?: (text: string) => Promise<number[]> | number[];

  /**
   * Citation pattern detection configuration.
   * Default: all built-in patterns enabled.
   */
  citationPatterns?: CitationPattern[];

  /**
   * Whether to enable auto-attribution mode for uncited claims.
   * Default: true.
   */
  autoAttribute?: boolean;

  /**
   * Claim extraction granularity.
   * 'sentence': one claim per sentence (default).
   * 'clause': split sentences into clauses.
   * 'paragraph': one claim per paragraph.
   */
  claimGranularity?: 'sentence' | 'clause' | 'paragraph';

  /**
   * Map from citation identifiers to source chunk IDs.
   * Overrides default index-based mapping for numbered citations.
   * Example: { '1': 'doc-abc', '2': 'doc-def' }
   */
  sourceMap?: Record<string, string>;

  /**
   * Stopwords to remove during n-gram and TF-IDF computation.
   * Default: built-in English stopword list.
   * Set to [] to disable stopword removal.
   */
  stopwords?: string[];

  /**
   * Maximum number of source chunks to compare against each claim.
   * Sources are pre-filtered by a fast heuristic (shared term count)
   * before full matching. Reduces computation for large source sets.
   * Default: 50.
   */
  maxSourcesPerClaim?: number;
}

/** A custom citation pattern. */
interface CitationPattern {
  /** Pattern name for identification. */
  name: string;

  /** Regex to detect the citation marker. Must have the global flag. */
  pattern: RegExp;

  /** Function to extract citation metadata from a regex match. */
  extract: (match: RegExpMatchArray) => { format: string; id: string };
}

// -- Citer Instance -----------------------------------------------------

/** A configured citer instance created by createCiter(). */
interface Citer {
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
interface AnnotatedResponse {
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
```

### Function Exports

#### `cite(response, sources, options?)`

The primary API. Runs the full pipeline: extract citations, extract claims, match claims to sources, verify citations, compute scores.

```typescript
import { cite } from 'rag-cite';

const report = await cite(response, sources, {
  attributionThreshold: 0.4,
  claimGranularity: 'sentence',
});
```

**Signature:**

```typescript
function cite(
  response: string,
  sources: SourceChunk[],
  options?: CiteOptions,
): Promise<CitationReport>;
```

#### `extractCitations(response, options?)`

Extracts citations from the response without performing matching or verification. Useful for inspecting which citations the LLM included.

```typescript
import { extractCitations } from 'rag-cite';

const citations = extractCitations(
  'According to the report [1], revenue grew by 15% [2].',
);

console.log(citations.length); // 2
console.log(citations[0].id);  // '1'
console.log(citations[0].coveredText); // 'According to the report'
```

**Signature:**

```typescript
function extractCitations(
  response: string,
  options?: { citationPatterns?: CitationPattern[] },
): Citation[];
```

#### `extractClaims(response, options?)`

Extracts verifiable claims from the response without performing matching or verification. Useful for inspecting the claim decomposition.

```typescript
import { extractClaims } from 'rag-cite';

const claims = extractClaims(
  'Paris is the capital of France. What is its population? The city has about 2.1 million residents.',
);

console.log(claims.filter(c => c.isFactual).length); // 2
// "Paris is the capital of France." and "The city has about 2.1 million residents."
// "What is its population?" is filtered as non-factual (question).
```

**Signature:**

```typescript
function extractClaims(
  response: string,
  options?: { claimGranularity?: 'sentence' | 'clause' | 'paragraph' },
): Claim[];
```

#### `verify(response, sources, options?)`

Alias for `cite()`. Provided for semantic clarity when the primary interest is verification scores rather than the full report.

```typescript
import { verify } from 'rag-cite';

const result = await verify(response, sources);
console.log(result.scores.grounding);
console.log(result.scores.accuracy);
```

**Signature:**

```typescript
function verify(
  response: string,
  sources: SourceChunk[],
  options?: CiteOptions,
): Promise<CitationReport>;
```

#### `attribute(response, sources, options?)`

Runs the citation pipeline and returns the response with auto-generated citation markers inserted.

```typescript
import { attribute } from 'rag-cite';

const annotated = await attribute(
  'Paris is the capital of France. It has about 2.1 million residents.',
  [
    { id: '1', content: 'Paris is the capital and largest city of France.' },
    { id: '2', content: 'The population of Paris is approximately 2.16 million inhabitants.' },
  ],
);

console.log(annotated.text);
// 'Paris is the capital of France [1]. It has about 2.1 million residents [2].'
```

**Signature:**

```typescript
function attribute(
  response: string,
  sources: SourceChunk[],
  options?: CiteOptions,
): Promise<AnnotatedResponse>;
```

#### `createCiter(options)`

Creates a configured citer instance with preset options. Useful when making multiple citation checks with the same configuration.

```typescript
import { createCiter } from 'rag-cite';

const citer = createCiter({
  attributionThreshold: 0.5,
  weights: { exact: 0.4, fuzzy: 0.2, ngram: 0.2, tfidf: 0.2 },
});

const report1 = await citer.cite(response1, sources1);
const report2 = await citer.cite(response2, sources2);
const annotated = await citer.attribute(response3, sources3);
```

**Signature:**

```typescript
function createCiter(options?: CiteOptions): Citer;
```

---

## 10. Citation Report

### Structure

The `CitationReport` is the primary output of the library. It is a plain JavaScript object, immediately serializable with `JSON.stringify`, and designed to provide both summary metrics and drill-down detail.

### Per-Claim Details

Every factual claim in the response gets a `ClaimReport` entry with:

- **The claim text** and its position in the original response.
- **All attributions** above the threshold, each with the matched source, confidence score, match type breakdown (exact, fuzzy, ngram, tfidf, embedding), and match evidence (the specific substring in the source that matched).
- **Whether the claim is grounded** (has at least one attribution).
- **The primary attribution** (highest confidence match), or null if ungrounded.
- **Citation verifications** for any explicit citations attached to the claim.

This level of detail enables consumers to:
- Display claim-level trust indicators in a UI (green for grounded, red for ungrounded).
- Show the specific source text that supports each claim (the match evidence).
- Explain why a citation was marked as misattributed (show the correct source).

### Unattributed Claims

The `unattributed` array contains claims with no source attribution above the threshold. These are the claims most likely to be hallucinations or unsupported parametric knowledge. Each entry includes the claim text, its position, and the best (below-threshold) attribution scores, so the consumer can see how close the claim was to being attributed. A claim with a best score of 0.38 (just below the 0.4 threshold) is more likely to be a borderline paraphrase than a claim with a best score of 0.05.

### Misattributed Citations

The `misattributed` array contains explicit citations that point to the wrong source. Each entry includes the original citation, the claim it covers, the attribution score for the cited source (low, which is why it failed), and the correct source(s) with their attribution scores. This enables the consumer to display correction suggestions: "This claim cites Source 1, but it appears to come from Source 3."

### Annotated Response

When using the `attribute()` function, the report includes an annotated version of the response with citation markers inserted at appropriate positions. The annotated text can be displayed directly to end users. The insertion points and marker-to-source mapping are included so the consumer can render the citations as hyperlinks, tooltips, or footnotes.

---

## 11. Auto-Attribution Mode

### When It Activates

Auto-attribution mode activates when the LLM response contains no explicit citations (the citation extraction stage finds zero citation markers) and the `autoAttribute` option is `true` (the default). It also runs for individual claims that lack explicit citations even when other claims in the response do have citations.

### How It Works

1. **Claim extraction** proceeds as normal, producing a list of factual claims.
2. **Attribution matching** runs for every claim against every source chunk, producing per-claim attributions with confidence scores.
3. **Citation generation**: For each claim with at least one attribution above the threshold, a citation marker is generated. The marker format is configurable (default: `[N]` where N is the source chunk index).
4. **Citation insertion**: Markers are inserted at the end of each attributed sentence in the response text. When a claim draws from multiple sources, multiple markers are inserted (e.g., `[1][3]`).
5. **Response annotation**: The annotated response text and the marker-to-source mapping are returned in the `AnnotatedResponse` object.

### Insertion Rules

Citation markers are inserted at natural positions:

- **End of sentence, before the period**: `"Paris is the capital of France"` becomes `"Paris is the capital of France [1]."`.
- **Before closing punctuation**: Markers are placed before `.`, `!`, `?` at the end of the claim.
- **After list item markers**: For bulleted lists, the citation appears at the end of the bullet text.
- **No duplicate markers**: If a claim already has explicit citations, auto-attribution does not add additional markers for the same source.

### Configuration

```typescript
cite(response, sources, {
  autoAttribute: true,       // enable auto-attribution (default)
  autoAttributeFormat: '[N]', // citation marker format: [N], (N), ^N
});
```

---

## 12. Configuration

### Default Values

| Option | Default | Description |
|--------|---------|-------------|
| `attributionThreshold` | `0.4` | Composite score threshold for attribution |
| `fuzzyThreshold` | `0.8` | Minimum similarity for fuzzy substring matching |
| `ngramThreshold` | `0.3` | Minimum Jaccard similarity for n-gram overlap |
| `tfidfThreshold` | `0.3` | Minimum cosine similarity for TF-IDF matching |
| `embeddingThreshold` | `0.8` | Minimum cosine similarity for embedding matching |
| `weights.exact` | `0.40` | Composite weight for exact substring |
| `weights.fuzzy` | `0.25` | Composite weight for fuzzy substring |
| `weights.ngram` | `0.20` | Composite weight for n-gram overlap |
| `weights.tfidf` | `0.15` | Composite weight for TF-IDF cosine |
| `weights.embedding` | `0.00` | Composite weight for embedding (0 when no embedder) |
| `scoreWeights.grounding` | `0.35` | Quality score weight for grounding |
| `scoreWeights.accuracy` | `0.30` | Quality score weight for accuracy |
| `scoreWeights.coverage` | `0.15` | Quality score weight for coverage |
| `scoreWeights.faithfulness` | `0.20` | Quality score weight for faithfulness |
| `claimGranularity` | `'sentence'` | Claim extraction granularity |
| `autoAttribute` | `true` | Enable auto-attribution for uncited claims |
| `maxSourcesPerClaim` | `50` | Maximum sources to fully evaluate per claim |
| `stopwords` | Built-in English list | Stopwords for n-gram and TF-IDF |

### Configuration Precedence

When using `createCiter`, options are merged with the following precedence (highest first):

1. Per-call overrides passed to `citer.cite(response, sources, overrides)`.
2. Factory-level options passed to `createCiter(options)`.
3. Built-in defaults.

### Custom Matchers

Advanced users can provide custom matching strategies via the `customMatchers` option:

```typescript
cite(response, sources, {
  customMatchers: [
    {
      name: 'my-matcher',
      weight: 0.2,
      match: (claim: string, source: string) => {
        // Return a score between 0 and 1
        return myCustomSimilarity(claim, source);
      },
    },
  ],
});
```

Custom matchers are included in the composite score alongside the built-in strategies. When custom matchers are provided, all weights (built-in and custom) are normalized to sum to 1.0.

---

## 13. Integration

### With `chunk-smart`

`chunk-smart` produces the source chunks that `rag-cite` verifies against. The chunks carry metadata (index, headings, content type, source offsets) that can be passed through as `SourceMetadata`.

```typescript
import { chunk } from 'chunk-smart';
import { cite } from 'rag-cite';

const chunks = chunk(documentText, { maxChunkSize: 512 });

const sources = chunks.map((c, i) => ({
  id: String(i + 1),
  content: c.content,
  metadata: {
    section: c.metadata.headings.join(' > '),
    title: 'API Reference',
  },
}));

const report = await cite(llmResponse, sources);
```

### With `rag-prompt-builder`

`rag-prompt-builder` composes RAG prompts from source chunks, injecting source identifiers that the LLM can use for citations. `rag-cite` then verifies those citations in the response.

```typescript
import { buildPrompt } from 'rag-prompt-builder';
import { cite } from 'rag-cite';

const prompt = buildPrompt({
  query: userQuery,
  chunks: retrievedChunks,
  includeSourceIds: true, // adds [Source 1], [Source 2] labels
});

const response = await llm.complete(prompt);
const report = await cite(response, retrievedChunks);
```

### With `hallucinate-check`

`hallucinate-check` provides heuristic hallucination detection (entity checking, claim-fact verification). `rag-cite` provides citation-specific verification. Together, they cover complementary aspects of response quality.

```typescript
import { cite } from 'rag-cite';
import { check } from 'hallucinate-check';

const citationReport = await cite(response, sources);
const hallucinationReport = await check(response, { context: sources.map(s => s.content) });

// Citation-based hallucination signal: unattributed claims
const unattributedClaims = citationReport.unattributed;

// Heuristic hallucination signal: entity and fact checks
const flaggedClaims = hallucinationReport.flagged;

// Combined: claims flagged by both tools are highest-confidence hallucinations
```

### With `rag-eval-node-ts`

`rag-eval-node-ts` provides comprehensive RAG evaluation (retrieval metrics, answer relevance, overall quality). `rag-cite` provides deep citation-specific metrics that can be included as a component of the broader evaluation.

```typescript
import { evaluate } from 'rag-eval-node-ts';
import { cite } from 'rag-cite';

// Broad evaluation
const evalResult = await evaluate({ query, response, context: sources });

// Deep citation evaluation
const citationReport = await cite(response, sources);

// Combined quality dashboard
const dashboard = {
  retrieval: evalResult.retrieval,
  relevance: evalResult.relevance,
  citation: {
    grounding: citationReport.scores.grounding,
    accuracy: citationReport.scores.accuracy,
    coverage: citationReport.scores.coverage,
    faithfulness: citationReport.scores.faithfulness,
    quality: citationReport.scores.quality,
  },
};
```

### With `embed-cache`

`embed-cache` provides embedding generation and caching. It can supply the `embedder` function for `rag-cite`'s optional embedding similarity matching.

```typescript
import { createEmbedCache } from 'embed-cache';
import { cite } from 'rag-cite';

const cache = createEmbedCache({ provider: 'openai', model: 'text-embedding-3-small' });

const report = await cite(response, sources, {
  embedder: (text) => cache.embed(text),
  embeddingThreshold: 0.8,
});
```

---

## 14. Testing Strategy

### Unit Tests

Unit tests verify individual components in isolation.

- **Citation extraction tests**: For each citation format (numbered, named, parenthetical, footnote, URL, custom), provide response texts containing that format and verify correct extraction. Test edge cases: citations at sentence start, citations at sentence end, multiple consecutive citations (`[1][2]`), range citations (`[1-3]`), citations inside parentheses, citations inside quotes, markdown link citations, citations with no surrounding text.

- **Citation-text association tests**: Verify that each citation is associated with the correct text span. Test same-sentence scope, preceding-clause scope, paragraph scope, and multi-citation grouping. Test edge cases: citation at the start of a response, citation covering an empty string, citation in a list item.

- **Claim extraction tests**: Verify sentence segmentation accuracy. Test abbreviation handling (`Dr.`, `U.S.`), decimal numbers, ellipses, URLs, newlines, list items. Test non-factual filtering: verify that questions, hedging, meta-commentary, transitions, greetings, and disclaimers are correctly identified and filtered. Test multi-sentence claim merging.

- **Exact substring matching tests**: Verify detection of verbatim text reuse. Test with identical text, case differences, whitespace differences, partial substring matches (5+ word sequences). Test false negative: completely reworded text should not match.

- **Fuzzy substring matching tests**: Verify detection of near-exact matches with minor edits. Test with single-word substitutions, added words, removed words, tense changes, typo corrections. Verify that the similarity score reflects the edit distance. Test the trigram pre-filter optimization.

- **N-gram overlap tests**: Verify Jaccard similarity computation for unigrams, bigrams, and trigrams. Test with overlapping text, partially overlapping text, and non-overlapping text. Test stopword removal. Verify weighted average computation.

- **TF-IDF cosine tests**: Verify TF and IDF computation. Verify cosine similarity between known vectors. Test with synthetic source corpora where discriminative terms are known. Verify that common terms across all sources get low IDF weight.

- **Composite scoring tests**: Verify that strategy scores are correctly combined using configured weights. Test weight normalization when custom matchers are added. Test threshold application.

- **Verification tests**: For each citation state (`verified`, `misattributed`, `unsupported`, `phantom`), construct a scenario and verify correct classification. Test the grounding, accuracy, coverage, faithfulness, and quality score computations with known inputs and expected outputs.

- **Score computation tests**: Verify grounding score with known attributed/unattributed claim counts. Verify accuracy score with known verified/total citation counts. Verify coverage and faithfulness with known values. Verify quality score weight redistribution when accuracy is null.

### Integration Tests

End-to-end tests that run the full pipeline from response and sources to citation report.

- **Fully cited, fully grounded response**: Response with explicit citations for every claim, all citations verified. Assert grounding = 1.0, accuracy = 1.0, coverage = 1.0.

- **Partially cited response**: Response with citations on some claims but not others. Assert correct grounding, accuracy, and coverage values.

- **Misattributed citations**: Response where citation [1] actually matches source [3]. Assert misattribution is detected and correct source is identified.

- **Phantom citations**: Response citing source [5] when only 3 sources were provided. Assert phantom citation is detected.

- **No citations with auto-attribution**: Response with no explicit citations. Assert auto-attribution generates correct citation annotations.

- **Paraphrased content**: Response that paraphrases source content (not verbatim). Verify that fuzzy and n-gram matching detect the attribution.

- **Multi-source claims**: A single claim that draws from two sources. Verify both sources are detected in the attribution.

- **Non-factual content filtering**: Response containing questions, hedging, and disclaimers. Verify these are filtered and do not affect grounding scores.

- **Determinism test**: Run the same input twice with the same options. Verify identical output.

- **Large source set**: 100 source chunks, 20-claim response. Verify completion within performance targets.

### Edge Cases to Test

- Empty response (produces zero claims, all scores are trivially 1.0 or null).
- Response containing only non-factual content (zero factual claims).
- Single-word claim ("Yes." / "No.") -- should be filtered as non-factual.
- Response with citations but no source chunks provided.
- Source chunks with empty content.
- Response with only one sentence and one citation.
- Response with 50+ citations (stress test).
- Source text that is longer than 100KB (performance test).
- Unicode text: CJK characters, emoji, right-to-left text.
- Response containing code blocks (should not extract code syntax as citations).
- Response containing markdown tables with pipe characters (should not confuse pipes with citation markers).

### Test Framework

Tests use Vitest, matching the project's existing configuration in `package.json`.

---

## 15. Performance

### Design Constraints

`rag-cite` is designed to run in production response pipelines where latency matters. The citation check runs after the LLM generates a response and before the response is returned to the user. Target: under 10ms for a typical response (500 words, 5 source chunks), under 100ms for a large response (2000 words, 50 source chunks), excluding embedding computation time.

### Optimization Strategy

**Pre-computed TF-IDF corpus**: The IDF values for the source corpus are computed once during the `cite()` call and reused for all claim-source comparisons. This is an O(total_source_tokens) one-time cost, not an O(claims * sources * tokens) per-comparison cost.

**Pre-filtering for large source sets**: When the number of source chunks exceeds `maxSourcesPerClaim` (default: 50), a fast pre-filter reduces the candidate set. The pre-filter computes the number of shared unique terms between the claim and each source (using pre-built term sets) and selects the top-N sources by shared term count. Only these candidates undergo full matching (fuzzy substring, n-gram, TF-IDF, embedding). This reduces worst-case complexity from O(claims * sources) to O(claims * maxSourcesPerClaim).

**Sliding window optimization for fuzzy matching**: The trigram pre-filter for fuzzy substring matching avoids evaluating Levenshtein distance at every position in the source text. Only positions with at least 30% trigram overlap are evaluated. For a 100-word claim against a 10,000-word source, this typically reduces the evaluation positions from ~10,000 to ~50-200.

**Lazy embedding**: When an `embedder` is provided, embeddings are computed lazily (only for claims and sources that survive the pre-filter) and cached by content hash.

**No backtracking regex**: All citation pattern regexes are designed for linear-time execution. Complex patterns use hand-written parsers.

### Performance Targets

| Scenario | Source Chunks | Response Length | Expected Time |
|----------|--------------|-----------------|---------------|
| Small response, few sources | 3 | 200 words | < 2ms |
| Typical response | 5 | 500 words | < 10ms |
| Long response | 10 | 1000 words | < 25ms |
| Large source set | 50 | 500 words | < 50ms |
| Stress test | 100 | 2000 words | < 100ms |

Benchmarks measured on a 2024 MacBook Pro, Node.js 22, without embedding computation. Embedding computation adds latency proportional to the embedding model's inference time and is not included in these targets.

### Memory Usage

Memory usage is proportional to the number and size of source chunks. The TF-IDF vocabulary and IDF vector are the largest in-memory structures, scaling linearly with the total unique terms across all sources. For 50 source chunks averaging 500 words each (25,000 total words, ~5,000 unique terms), the TF-IDF structures consume approximately 500KB. Claim and attribution objects are lightweight (< 1KB each). Total memory overhead for a typical citation check is under 2MB.

---

## 16. Dependencies

### Runtime Dependencies

| Package | Purpose |
|---------|---------|
| `fastest-levenshtein` | Edit distance computation for fuzzy substring matching. The fastest JavaScript Levenshtein implementation, with no transitive dependencies. |

### Why `fastest-levenshtein`

Levenshtein edit distance is a core primitive of the fuzzy matching strategy. Implementing it from scratch is possible but the optimized SIMD-aware algorithm in `fastest-levenshtein` is 2-3x faster than a naive dynamic programming implementation, and the sliding window optimization in the fuzzy matcher calls Levenshtein distance hundreds of times per claim-source pair. The performance difference is meaningful. The package has zero dependencies itself, a single JavaScript file, and 20M+ weekly downloads -- it is a stable, minimal dependency.

### Why Not Other Matching Libraries

- **`string-similarity`**: Uses Dice coefficient, which is useful but not sufficient. `rag-cite` needs multiple matching strategies, not just one similarity metric. The Dice coefficient is incorporated via the n-gram Jaccard similarity (which is a generalization).
- **`natural`**: A large NLP library with tokenizers, stemmers, classifiers, and TF-IDF. It would provide TF-IDF out of the box, but it is a heavy dependency (many sub-packages) and `rag-cite` only needs TF-IDF cosine similarity, which is straightforward to implement in ~100 lines.
- **`fuse.js`**: A fuzzy search library designed for searching arrays of objects. It is not designed for claim-source attribution matching and does not provide the fine-grained per-strategy scores that `rag-cite` needs.

### Development Dependencies

| Package | Purpose |
|---------|---------|
| `typescript` | TypeScript compiler |
| `vitest` | Test runner |
| `eslint` | Linting |
| `@types/node` | Node.js type definitions |

### Peer Dependencies

None.

---

## 17. File Structure

```
rag-cite/
  package.json
  tsconfig.json
  SPEC.md
  README.md
  src/
    index.ts                        -- Public API exports: cite, extractCitations,
                                       extractClaims, verify, attribute, createCiter,
                                       and all types.
    cite.ts                         -- cite() function: pipeline orchestration.
    factory.ts                      -- createCiter() factory function.
    types.ts                        -- All TypeScript type definitions.
    extract/
      citations.ts                  -- Citation extraction: pattern detection,
                                       citation-text association, grouping.
      claims.ts                     -- Claim extraction: sentence segmentation,
                                       boundary detection, non-factual filtering.
      patterns.ts                   -- Built-in citation pattern definitions
                                       (numbered, named, parenthetical, footnote, URL).
      sentences.ts                  -- Sentence segmentation with abbreviation handling.
      filters.ts                    -- Non-factual content filters (questions, hedging,
                                       meta-commentary, disclaimers).
    match/
      index.ts                      -- Matching orchestration: run all strategies,
                                       compute composite scores.
      exact.ts                      -- Exact substring matching strategy.
      fuzzy.ts                      -- Fuzzy substring matching with sliding window
                                       and trigram pre-filter.
      ngram.ts                      -- N-gram overlap (Jaccard similarity) strategy.
      tfidf.ts                      -- TF-IDF cosine similarity strategy.
      embedding.ts                  -- Pluggable embedding similarity strategy.
      composite.ts                  -- Composite score computation with configurable
                                       weights.
      prefilter.ts                  -- Fast pre-filter for large source sets
                                       (shared term count).
    verify/
      index.ts                      -- Verification orchestration: per-citation
                                       verification, score computation.
      citation-verifier.ts          -- Per-citation state classification (verified,
                                       misattributed, unsupported, phantom).
      scores.ts                     -- Grounding, accuracy, coverage, faithfulness,
                                       and quality score computation.
    attribute/
      index.ts                      -- Auto-attribution: citation generation and
                                       insertion into response text.
      insert.ts                     -- Citation marker insertion at natural positions.
    utils/
      text.ts                       -- Text normalization, tokenization, whitespace
                                       collapsing, punctuation handling.
      stopwords.ts                  -- English stopword list.
      cosine.ts                     -- Cosine similarity for TF-IDF and embedding
                                       vectors.
      hash.ts                       -- Content hashing for embedding cache keys.
  src/__tests__/
    cite.test.ts                    -- Integration tests for the full pipeline.
    extract/
      citations.test.ts             -- Citation extraction tests.
      claims.test.ts                -- Claim extraction tests.
      sentences.test.ts             -- Sentence segmentation tests.
      filters.test.ts               -- Non-factual content filter tests.
    match/
      exact.test.ts                 -- Exact substring matching tests.
      fuzzy.test.ts                 -- Fuzzy substring matching tests.
      ngram.test.ts                 -- N-gram overlap tests.
      tfidf.test.ts                 -- TF-IDF cosine similarity tests.
      composite.test.ts             -- Composite scoring tests.
      prefilter.test.ts             -- Pre-filter tests.
    verify/
      citation-verifier.test.ts     -- Per-citation verification tests.
      scores.test.ts                -- Score computation tests.
    attribute/
      insert.test.ts                -- Citation insertion tests.
    fixtures/
      responses/                    -- Sample LLM responses with various citation styles.
      sources/                      -- Sample source chunk sets.
      reports/                      -- Expected citation reports for fixture pairs.
  dist/                             -- Compiled output (generated by tsc)
```

---

## 18. Implementation Roadmap

### Phase 1: Core Extraction and Exact Matching (v0.1.0)

Implement the foundation: types, citation extraction, claim extraction, and exact substring matching.

**Deliverables:**
1. **Types**: Define all TypeScript types in `types.ts` -- `SourceChunk`, `Citation`, `Claim`, `Attribution`, `CitationVerification`, `ClaimReport`, `CitationScores`, `CitationReport`, `CiteOptions`, and all supporting types.
2. **Citation extraction**: Implement pattern detection for numbered references (`[1]`), named references (`[Source: ...]`), and custom patterns in `extract/citations.ts` and `extract/patterns.ts`.
3. **Citation-text association**: Implement the backward-looking association algorithm (same-sentence scope, preceding-clause scope, paragraph scope) in `extract/citations.ts`.
4. **Claim extraction**: Implement sentence segmentation with abbreviation handling in `extract/sentences.ts`. Implement non-factual content filtering in `extract/filters.ts`. Wire together in `extract/claims.ts`.
5. **Exact substring matching**: Implement normalized substring search in `match/exact.ts`.
6. **Text utilities**: Implement normalization, tokenization, stopword removal in `utils/`.
7. **Pipeline orchestration**: Implement `cite()` with exact matching only in `cite.ts`. Implement basic score computation in `verify/scores.ts`.
8. **Public API**: Export `cite()`, `extractCitations()`, `extractClaims()` from `index.ts`.
9. **Tests**: Unit tests for citation extraction, claim extraction, sentence segmentation, non-factual filtering, and exact matching.

### Phase 2: Fuzzy and N-gram Matching (v0.2.0)

Add fuzzy substring matching and n-gram overlap for paraphrase detection.

**Deliverables:**
1. **Fuzzy matching**: Implement sliding window fuzzy substring matching with trigram pre-filter in `match/fuzzy.ts`. Add `fastest-levenshtein` dependency.
2. **N-gram overlap**: Implement Jaccard similarity on word n-grams (unigrams, bigrams, trigrams) with weighted averaging in `match/ngram.ts`.
3. **Composite scoring**: Implement weighted combination of exact, fuzzy, and n-gram scores in `match/composite.ts`.
4. **Per-citation verification**: Implement state classification (verified, misattributed, unsupported, phantom) in `verify/citation-verifier.ts`.
5. **Full score computation**: Implement grounding, accuracy, coverage, faithfulness, and quality scores.
6. **Parenthetical and footnote citations**: Add pattern detection for `(Author Year)` and `^[N]` formats.
7. **Tests**: Fuzzy matching tests with near-exact inputs, n-gram tests, composite scoring tests, verification state tests.

### Phase 3: TF-IDF, Auto-Attribution, and Factory (v0.3.0)

Add TF-IDF cosine similarity, auto-attribution mode, and the citer factory.

**Deliverables:**
1. **TF-IDF cosine**: Implement TF and IDF computation, cosine similarity in `match/tfidf.ts`.
2. **Source pre-filter**: Implement fast shared-term pre-filter for large source sets in `match/prefilter.ts`.
3. **Auto-attribution**: Implement citation generation and marker insertion in `attribute/`.
4. **`attribute()` function**: Return annotated response with inserted citations.
5. **`createCiter()` factory**: Implement option merging and instance creation in `factory.ts`.
6. **URL citation detection**: Add pattern detection for bare URLs and markdown links.
7. **Custom matchers**: Support user-provided matching strategies with weight normalization.
8. **Tests**: TF-IDF tests, auto-attribution tests, factory tests, URL citation tests, large source set tests.

### Phase 4: Embedding Support and Polish (v1.0.0)

Production readiness with optional embedding support and performance optimization.

**Deliverables:**
1. **Embedding similarity**: Implement pluggable embedding matching with caching in `match/embedding.ts`.
2. **Composite weight adjustment**: Automatically adjust weights when embedding is enabled.
3. **Performance optimization**: Benchmark suite, trigram index optimization, lazy computation.
4. **Edge case hardening**: Unicode edge cases, pathological input testing, very large source set testing.
5. **Multi-sentence claim merging**: Implement pronoun resolution heuristic for merging dependent sentences.
6. **Clause-level claim extraction**: Implement the `claimGranularity: 'clause'` option.
7. **API stability**: Stabilize all public types and function signatures for semver 1.0.
8. **Documentation**: Comprehensive README with usage examples, configuration guide, and integration patterns.

---

## 19. Example Use Cases

### 19.1 RAG Chatbot Citation Verification

A developer runs a customer support chatbot that answers questions using a knowledge base. The chatbot retrieves relevant documentation chunks and includes them as context when prompting the LLM. The LLM is instructed to cite its sources using `[1]`, `[2]`, etc.

```typescript
import { cite } from 'rag-cite';

// After the LLM generates a response
const response = `Based on our documentation, the API rate limit is 1000 requests
per minute for the Pro plan [1]. Enterprise customers can request a custom rate
limit by contacting their account manager [2]. Note that rate limits apply per
API key, not per user account [1].`;

const sources = [
  {
    id: '1',
    content: 'Pro plan customers are limited to 1000 API requests per minute. Rate limits are enforced per API key.',
    metadata: { title: 'Rate Limits', section: 'API Reference' },
  },
  {
    id: '2',
    content: 'Enterprise customers may request custom rate limits. Contact your dedicated account manager to discuss custom configurations.',
    metadata: { title: 'Enterprise Features', section: 'Plans' },
  },
];

const report = await cite(response, sources);

console.log(report.scores.grounding);    // 1.0  -- all claims grounded
console.log(report.scores.accuracy);     // 1.0  -- all citations point to correct sources
console.log(report.scores.quality);      // ~0.95 -- high overall quality

// Display trust badge to user
if (report.scores.quality >= 0.8) {
  showTrustBadge('Fully sourced response');
}

// Show per-claim sources in UI
for (const claimReport of report.claims) {
  if (claimReport.isGrounded) {
    renderClaimWithSource(claimReport.claim.text, claimReport.primaryAttribution);
  }
}
```

### 19.2 Compliance Audit Trail

A healthcare AI system generates responses about drug interactions. Regulatory compliance requires every factual claim to be traceable to an approved source document.

```typescript
import { cite } from 'rag-cite';

const report = await cite(aiResponse, approvedSources, {
  attributionThreshold: 0.5,  // stricter threshold for compliance
});

// Compliance check: every factual claim must be grounded
if (report.scores.grounding < 1.0) {
  const ungrounded = report.unattributed.map(cr => cr.claim.text);
  logComplianceViolation({
    type: 'UNGROUNDED_CLAIMS',
    claims: ungrounded,
    response: aiResponse,
    timestamp: new Date().toISOString(),
  });
  // Block the response from being shown to the user
  return fallbackResponse();
}

// All claims grounded -- log the audit trail
logAuditTrail({
  response: aiResponse,
  claims: report.claims.map(cr => ({
    text: cr.claim.text,
    source: cr.primaryAttribution?.source.id,
    confidence: cr.primaryAttribution?.confidence,
    evidence: cr.primaryAttribution?.matchEvidence,
  })),
  scores: report.scores,
});
```

### 19.3 Auto-Attribution for Search Results

A search engine generates AI summaries of search results. The summaries should link each claim back to the source web page, but the LLM does not always include explicit citations.

```typescript
import { attribute } from 'rag-cite';

const searchResults = [
  { id: '1', content: 'Node.js 22 was released in April 2024...', metadata: { url: 'https://nodejs.org/blog/...' } },
  { id: '2', content: 'The V8 engine in Node.js 22 includes...', metadata: { url: 'https://v8.dev/blog/...' } },
  { id: '3', content: 'Performance benchmarks show a 15% improvement...', metadata: { url: 'https://benchmarks.example.com/...' } },
];

const aiSummary = 'Node.js 22 was released in April 2024 with significant performance improvements. The V8 engine update provides a 15% speed boost for common operations.';

const annotated = await attribute(aiSummary, searchResults);

console.log(annotated.text);
// 'Node.js 22 was released in April 2024 with significant performance improvements [1].
//  The V8 engine update provides a 15% speed boost for common operations [2][3].'

// Render as clickable links
for (const inserted of annotated.insertedCitations) {
  const url = inserted.source.metadata?.url;
  renderCitationLink(inserted.marker, url);
}
```

### 19.4 Hallucination Detection via Citation Analysis

An LLM monitoring pipeline uses citation analysis as a hallucination signal. Claims that cannot be attributed to any source are flagged for human review.

```typescript
import { cite } from 'rag-cite';

async function monitorResponse(response: string, sources: SourceChunk[]): Promise<void> {
  const report = await cite(response, sources);

  // Flag unattributed claims
  for (const claimReport of report.unattributed) {
    await alertQueue.push({
      severity: 'warning',
      type: 'UNATTRIBUTED_CLAIM',
      claim: claimReport.claim.text,
      bestMatchScore: claimReport.attributions[0]?.confidence ?? 0,
      response: response.substring(
        claimReport.claim.startOffset,
        claimReport.claim.endOffset,
      ),
    });
  }

  // Flag misattributed citations
  for (const misattr of report.misattributed) {
    await alertQueue.push({
      severity: 'error',
      type: 'MISATTRIBUTED_CITATION',
      claim: misattr.claim.text,
      citedSource: misattr.citation.id,
      correctSource: misattr.correctSources?.[0]?.source.id,
    });
  }

  // Track metrics
  await metrics.record('citation.grounding', report.scores.grounding);
  await metrics.record('citation.accuracy', report.scores.accuracy ?? 0);
  await metrics.record('citation.quality', report.scores.quality);
}
```

### 19.5 Comparing RAG Pipeline Configurations

A team evaluates two different chunking strategies by measuring citation quality across a test set.

```typescript
import { chunk } from 'chunk-smart';
import { cite } from 'rag-cite';

const testCases = loadTestCases(); // { query, response, documentText }[]

async function evaluateChunkingStrategy(
  strategyOptions: ChunkOptions,
): Promise<{ avgGrounding: number; avgAccuracy: number }> {
  const scores = await Promise.all(
    testCases.map(async ({ response, documentText }) => {
      const chunks = chunk(documentText, strategyOptions);
      const sources = chunks.map((c, i) => ({
        id: String(i + 1),
        content: c.content,
      }));
      const report = await cite(response, sources);
      return report.scores;
    }),
  );

  return {
    avgGrounding: scores.reduce((sum, s) => sum + s.grounding, 0) / scores.length,
    avgAccuracy: scores.reduce((sum, s) => sum + (s.accuracy ?? 0), 0) / scores.length,
  };
}

const strategy512 = await evaluateChunkingStrategy({ maxChunkSize: 512 });
const strategy256 = await evaluateChunkingStrategy({ maxChunkSize: 256 });

console.log('512-token chunks:', strategy512);
// { avgGrounding: 0.87, avgAccuracy: 0.92 }

console.log('256-token chunks:', strategy256);
// { avgGrounding: 0.91, avgAccuracy: 0.89 }
// Smaller chunks improve grounding (more specific matches) but slightly reduce
// accuracy (citations are harder to pinpoint across more chunks).
```

### 19.6 Batch Evaluation for Quality Monitoring

A production system logs all RAG interactions and runs nightly batch evaluation to track citation quality trends.

```typescript
import { createCiter } from 'rag-cite';

const citer = createCiter({
  attributionThreshold: 0.4,
  maxSourcesPerClaim: 30,
});

const interactions = await loadTodaysInteractions(); // thousands of records

const results = await Promise.all(
  interactions.map(async ({ response, sources }) => {
    const report = await citer.cite(response, sources);
    return {
      grounding: report.scores.grounding,
      accuracy: report.scores.accuracy,
      coverage: report.scores.coverage,
      quality: report.scores.quality,
      unattributedCount: report.unattributed.length,
      misattributedCount: report.misattributed.length,
    };
  }),
);

const avgQuality = results.reduce((sum, r) => sum + r.quality, 0) / results.length;
const totalUnattributed = results.reduce((sum, r) => sum + r.unattributedCount, 0);

console.log(`Average citation quality: ${(avgQuality * 100).toFixed(1)}%`);
console.log(`Total unattributed claims: ${totalUnattributed}`);

// Alert if quality drops below threshold
if (avgQuality < 0.75) {
  await sendAlert(`Citation quality dropped to ${(avgQuality * 100).toFixed(1)}%`);
}
```
