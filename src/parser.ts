import type { Citation, CitationPattern, SourceChunk } from './types.js';

/** Raw match before text-association */
interface RawCitation {
  format: Citation['format'];
  id: string;
  startOffset: number;
  endOffset: number;
}

/**
 * Parse inline citations from an LLM response.
 * Supports numbered [1], named [Source: X], parenthetical (Author Year),
 * footnote [^1] / ^[1] / ^1, URL, markdown-link, and custom patterns.
 */
export function parseCitations(
  response: string,
  sources?: SourceChunk[],
  citationPatterns?: CitationPattern[],
  sourceMap?: Record<string, string>,
): Citation[] {
  const raw: RawCitation[] = [];

  // Track position ranges already claimed by a match to avoid overlaps.
  // Each entry is "startOffset:endOffset". Multiple citations from the same
  // original regex match (same range) are allowed (e.g., [1, 2, 3]).
  const claimedRanges = new Set<string>();
  const claimedPositions = new Set<number>();

  const addIfUnclaimed = (r: RawCitation, allowSameRange: boolean = false): void => {
    const rangeKey = `${r.startOffset}:${r.endOffset}`;
    if (allowSameRange) {
      // Allow if this exact range was already used (multi-id from one match)
      if (!claimedRanges.has(rangeKey)) {
        // But block if any position overlaps with a DIFFERENT range
        for (let i = r.startOffset; i < r.endOffset; i++) {
          if (claimedPositions.has(i)) return;
        }
      }
    } else {
      for (let i = r.startOffset; i < r.endOffset; i++) {
        if (claimedPositions.has(i)) return;
      }
    }
    claimedRanges.add(rangeKey);
    for (let i = r.startOffset; i < r.endOffset; i++) {
      claimedPositions.add(i);
    }
    raw.push(r);
  };

  // --- Custom patterns first (highest priority) ---------------------------
  if (citationPatterns) {
    for (const cp of citationPatterns) {
      const re = new RegExp(cp.pattern.source, cp.pattern.flags.includes('g') ? cp.pattern.flags : cp.pattern.flags + 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(response)) !== null) {
        const extracted = cp.extract(m);
        addIfUnclaimed({
          format: extracted.format as Citation['format'],
          id: extracted.id,
          startOffset: m.index,
          endOffset: m.index + m[0].length,
        });
      }
    }
  }

  // --- Footnote references [^N] or ^[N] or ^N ----------------------------
  const footnoteRe = /\[\^(\d+)\]|\^\[(\d+)\]|\^(\d+)(?=\W|$)/g;
  let m: RegExpExecArray | null;
  while ((m = footnoteRe.exec(response)) !== null) {
    const id = m[1] ?? m[2] ?? m[3];
    addIfUnclaimed({
      format: 'footnote',
      id,
      startOffset: m.index,
      endOffset: m.index + m[0].length,
    });
  }

  // --- Numbered references [N], [N, M], [N-M], [Source N], [Ref N] --------
  // Range: [1-3]
  const rangeRe = /\[(\d+)\s*-\s*(\d+)\]/g;
  while ((m = rangeRe.exec(response)) !== null) {
    const lo = parseInt(m[1], 10);
    const hi = parseInt(m[2], 10);
    if (hi - lo >= 0 && hi - lo < 20) {
      for (let n = lo; n <= hi; n++) {
        addIfUnclaimed({
          format: 'numbered',
          id: String(n),
          startOffset: m.index,
          endOffset: m.index + m[0].length,
        }, true);
      }
    }
  }

  // Comma-separated: [1, 3, 5]
  const commaRe = /\[(\d+(?:\s*,\s*\d+)+)\]/g;
  while ((m = commaRe.exec(response)) !== null) {
    const ids = m[1].split(',').map((s) => s.trim());
    for (const id of ids) {
      addIfUnclaimed({
        format: 'numbered',
        id,
        startOffset: m.index,
        endOffset: m.index + m[0].length,
      }, true);
    }
  }

  // [Source N] or [Ref N]
  const sourceRefRe = /\[(?:Source|Ref)\s+(\d+)\]/gi;
  while ((m = sourceRefRe.exec(response)) !== null) {
    addIfUnclaimed({
      format: 'numbered',
      id: m[1],
      startOffset: m.index,
      endOffset: m.index + m[0].length,
    });
  }

  // Simple [N]
  const simpleNumRe = /\[(\d+)\]/g;
  while ((m = simpleNumRe.exec(response)) !== null) {
    addIfUnclaimed({
      format: 'numbered',
      id: m[1],
      startOffset: m.index,
      endOffset: m.index + m[0].length,
    });
  }

  // --- Named references [Source: X], [Doc: X], or [Name] ------------------
  const namedPrefixRe = /\[(?:Source|Doc):\s*([^\]]+)\]/gi;
  while ((m = namedPrefixRe.exec(response)) !== null) {
    addIfUnclaimed({
      format: 'named',
      id: m[1].trim(),
      startOffset: m.index,
      endOffset: m.index + m[0].length,
    });
  }

  // Generic [Name] — only match if content is non-numeric and doesn't look like footnote
  const genericNamedRe = /\[([A-Za-z][A-Za-z0-9 ]{1,60})\]/g;
  while ((m = genericNamedRe.exec(response)) !== null) {
    // Skip if it's a markdown link text (followed by '(')
    if (response[m.index + m[0].length] === '(') continue;
    // Skip purely numeric
    if (/^\d+$/.test(m[1])) continue;
    addIfUnclaimed({
      format: 'named',
      id: m[1].trim(),
      startOffset: m.index,
      endOffset: m.index + m[0].length,
    });
  }

  // --- Parenthetical references (Author Year) or (Source N) ---------------
  const parenSourceRe = /\(Source\s+(\d+)\)/gi;
  while ((m = parenSourceRe.exec(response)) !== null) {
    addIfUnclaimed({
      format: 'parenthetical',
      id: m[1],
      startOffset: m.index,
      endOffset: m.index + m[0].length,
    });
  }

  const parenAuthorRe = /\(([A-Z][a-z]+(?:\s+et\s+al\.?)?,?\s*\d{4})\)/g;
  while ((m = parenAuthorRe.exec(response)) !== null) {
    addIfUnclaimed({
      format: 'parenthetical',
      id: m[1].replace(/,\s*/, ' ').trim(),
      startOffset: m.index,
      endOffset: m.index + m[0].length,
    });
  }

  // --- URL references (bare + markdown links) -----------------------------
  const markdownLinkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  while ((m = markdownLinkRe.exec(response)) !== null) {
    addIfUnclaimed({
      format: 'url',
      id: m[2],
      startOffset: m.index,
      endOffset: m.index + m[0].length,
    });
  }

  const bareUrlRe = /(?<!\]\()https?:\/\/[^\s)]+/g;
  while ((m = bareUrlRe.exec(response)) !== null) {
    addIfUnclaimed({
      format: 'url',
      id: m[0],
      startOffset: m.index,
      endOffset: m.index + m[0].length,
    });
  }

  // Sort by position
  raw.sort((a, b) => a.startOffset - b.startOffset);

  // Associate each citation with the text it covers and resolve sources
  return raw.map((r) => associateAndResolve(r, response, sources, sourceMap));
}

/**
 * Determine the text that a citation covers (backward from marker to
 * sentence/clause start) and resolve the source chunk it points to.
 */
function associateAndResolve(
  raw: RawCitation,
  response: string,
  sources?: SourceChunk[],
  sourceMap?: Record<string, string>,
): Citation {
  // Find covered text: walk backward from citation start to sentence/clause boundary
  const before = response.slice(0, raw.startOffset);

  // Find the start of the sentence or clause containing this citation
  let coveredStart = 0;
  // Look for sentence boundary (. ! ? followed by space, or start of string)
  // Also treat double newline as boundary
  const sentenceBoundaries = /[.!?]\s|[\n]{2}/g;
  let lastBoundary = 0;
  let bm: RegExpExecArray | null;
  while ((bm = sentenceBoundaries.exec(before)) !== null) {
    // Also check if there's another citation between this boundary and our citation
    lastBoundary = bm.index + bm[0].length;
  }
  coveredStart = lastBoundary;

  // Trim whitespace
  while (coveredStart < raw.startOffset && /\s/.test(response[coveredStart])) {
    coveredStart++;
  }

  const coveredText = response.slice(coveredStart, raw.startOffset).replace(/\s+$/, '');

  // Resolve source
  const resolvedSource = resolveSource(raw, sources, sourceMap);

  return {
    format: raw.format,
    id: raw.id,
    startOffset: raw.startOffset,
    endOffset: raw.endOffset,
    coveredText,
    coveredStartOffset: coveredStart,
    coveredEndOffset: raw.startOffset,
    resolvedSource,
  };
}

/**
 * Resolve a citation to its source chunk.
 */
function resolveSource(
  raw: RawCitation,
  sources?: SourceChunk[],
  sourceMap?: Record<string, string>,
): SourceChunk | null {
  if (!sources || sources.length === 0) return null;

  // If sourceMap is provided, use it
  if (sourceMap && raw.id in sourceMap) {
    const targetId = sourceMap[raw.id];
    return sources.find((s) => s.id === targetId) ?? null;
  }

  // Numbered / footnote: try by index (1-based) or by id match
  if (raw.format === 'numbered' || raw.format === 'footnote' || raw.format === 'parenthetical') {
    // First try direct id match
    const byId = sources.find((s) => s.id === raw.id);
    if (byId) return byId;

    // For numbered/footnote, try 1-based index
    if (raw.format === 'numbered' || raw.format === 'footnote') {
      const idx = parseInt(raw.id, 10);
      if (!isNaN(idx) && idx >= 1 && idx <= sources.length) {
        return sources[idx - 1];
      }
    }

    // For parenthetical with a number (Source N), try index
    if (raw.format === 'parenthetical') {
      const idx = parseInt(raw.id, 10);
      if (!isNaN(idx) && idx >= 1 && idx <= sources.length) {
        return sources[idx - 1];
      }
    }
  }

  // Named: match against source metadata
  if (raw.format === 'named') {
    const lower = raw.id.toLowerCase();
    // Try id match
    const byId = sources.find((s) => s.id.toLowerCase() === lower);
    if (byId) return byId;
    // Try metadata title match
    const byTitle = sources.find((s) => s.metadata?.title?.toLowerCase() === lower);
    if (byTitle) return byTitle;
    // Fuzzy: check if name is contained in title or vice versa
    const byPartial = sources.find(
      (s) =>
        (s.metadata?.title && s.metadata.title.toLowerCase().includes(lower)) ||
        (s.metadata?.title && lower.includes(s.metadata.title.toLowerCase())),
    );
    if (byPartial) return byPartial;
  }

  // Parenthetical (Author Year): match against metadata author+year
  if (raw.format === 'parenthetical') {
    const parts = raw.id.match(/^(.+?)\s+(\d{4})$/);
    if (parts) {
      const author = parts[1].toLowerCase();
      const year = parts[2];
      const byMeta = sources.find(
        (s) =>
          s.metadata?.author?.toLowerCase().includes(author) &&
          String(s.metadata?.year) === year,
      );
      if (byMeta) return byMeta;
    }
  }

  // URL: match against metadata url
  if (raw.format === 'url') {
    const byUrl = sources.find((s) => s.metadata?.url === raw.id);
    if (byUrl) return byUrl;
    // Partial URL match
    const byPartialUrl = sources.find(
      (s) => s.metadata?.url && (s.metadata.url.includes(raw.id) || raw.id.includes(s.metadata.url)),
    );
    if (byPartialUrl) return byPartialUrl;
  }

  // Fallback: try direct id match for any format
  const byId = sources.find((s) => s.id === raw.id);
  if (byId) return byId;

  return null;
}
