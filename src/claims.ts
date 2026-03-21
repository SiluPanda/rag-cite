import type { Claim, Citation } from './types.js';

/** Abbreviations that end with a period but do not signal sentence boundaries. */
const ABBREVIATIONS = new Set([
  'dr', 'mr', 'mrs', 'ms', 'prof', 'sr', 'jr', 'st',
  'e.g', 'i.e', 'vs', 'etc', 'al', 'approx', 'dept', 'est',
  'inc', 'ltd', 'co', 'corp', 'jan', 'feb', 'mar', 'apr',
  'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  'fig', 'vol', 'no', 'op', 'ed', 'rev', 'gen',
]);

const COUNTRY_ABBREVS = /^[A-Z]\.[A-Z]\.?$/;

const QUESTION_STARTS = new Set([
  'what', 'how', 'why', 'when', 'where', 'who', 'which',
  'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does',
]);

const HEDGING = [
  /^i think\b/i, /^i believe\b/i, /^it seems\b/i, /^it appears\b/i,
  /\bpossibly\b/i, /\bperhaps\b/i, /\bmight be\b/i, /\bmay be\b/i,
  /\bcould be\b/i, /\barguably\b/i,
];

const META = [
  /^as mentioned\b/i, /^as discussed\b/i, /^in summary\b/i,
  /^to summarize\b/i, /^in conclusion\b/i, /^as noted above\b/i,
  /^let me explain\b/i, /^i'll now describe\b/i, /^as i mentioned\b/i,
];

const TRANSITIONS = [
  /^moving on\b/i, /^next\b/i, /^additionally\b/i, /^furthermore\b/i,
  /^moreover\b/i, /^however\b/i, /^on the other hand\b/i, /^that said\b/i,
  /^let's move on\b/i,
];

const GREETINGS = [
  /^sure[.!]*$/i, /^great question[.!]*$/i, /^good question[.!]*$/i,
  /^i hope this helps[.!]*$/i, /^let me know if you have questions[.!]*$/i,
  /^happy to help[.!]*$/i, /^you're welcome[.!]*$/i,
  /^thanks for asking[.!]*$/i,
];

const DISCLAIMERS = [
  /^i'm an ai\b/i, /^i am an ai\b/i, /^as an ai\b/i,
  /\bmy training data\b/i, /^i cannot guarantee\b/i,
  /^please note that i'm an ai/i, /^i don't have personal opinions\b/i,
];

/**
 * Determine if a sentence is a non-factual claim (question, hedge, meta, etc.).
 */
function isNonFactual(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  // Question
  if (trimmed.endsWith('?')) return true;
  const firstWord = trimmed.split(/\s+/)[0].toLowerCase();
  if (QUESTION_STARTS.has(firstWord) && trimmed.endsWith('?')) return true;

  // Short greetings / closings
  for (const re of GREETINGS) {
    if (re.test(trimmed)) return true;
  }

  // Disclaimers
  for (const re of DISCLAIMERS) {
    if (re.test(trimmed)) return true;
  }

  // Check if primarily hedging/meta/transition (must be short or standalone)
  if (trimmed.split(/\s+/).length <= 6) {
    for (const re of TRANSITIONS) {
      if (re.test(trimmed)) return true;
    }
  }

  for (const re of HEDGING) {
    if (re.test(trimmed)) return true;
  }

  for (const re of META) {
    if (re.test(trimmed)) return true;
  }

  return false;
}

/**
 * Split text into sentences, aware of abbreviations, decimals, URLs, and ellipses.
 */
function splitSentences(text: string): Array<{ text: string; start: number; end: number }> {
  const results: Array<{ text: string; start: number; end: number }> = [];
  if (!text.trim()) return results;

  // First split on paragraph boundaries (double newline)
  const paragraphs: Array<{ text: string; offset: number }> = [];
  const paraRe = /\n\s*\n/g;
  let lastEnd = 0;
  let pm: RegExpExecArray | null;
  while ((pm = paraRe.exec(text)) !== null) {
    if (pm.index > lastEnd) {
      paragraphs.push({ text: text.slice(lastEnd, pm.index), offset: lastEnd });
    }
    lastEnd = pm.index + pm[0].length;
  }
  if (lastEnd < text.length) {
    paragraphs.push({ text: text.slice(lastEnd), offset: lastEnd });
  }

  for (const para of paragraphs) {
    // Check for list items within the paragraph
    const lines = para.text.split('\n');
    let lineOffset = para.offset;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        lineOffset += line.length + 1;
        continue;
      }

      // List item detection
      const listMatch = trimmedLine.match(/^(?:[-*]\s+|\d+[.)]\s+)/);
      if (listMatch) {
        const itemText = trimmedLine.slice(listMatch[0].length).trim();
        if (itemText) {
          const actualStart = para.text.indexOf(trimmedLine, lineOffset - para.offset);
          const start = para.offset + (actualStart >= 0 ? actualStart : 0) + listMatch[0].length;
          results.push({
            text: itemText,
            start,
            end: start + itemText.length,
          });
        }
        lineOffset += line.length + 1;
        continue;
      }

      // Regular sentence splitting within the line
      splitLineIntoSentences(line, lineOffset, results);
      lineOffset += line.length + 1;
    }
  }

  return results;
}

function splitLineIntoSentences(
  line: string,
  baseOffset: number,
  results: Array<{ text: string; start: number; end: number }>,
): void {
  const trimmed = line.trim();
  if (!trimmed) return;

  // Walk through the line character by character to find sentence boundaries
  let sentenceStart = 0;

  // Skip leading whitespace
  while (sentenceStart < line.length && /\s/.test(line[sentenceStart])) {
    sentenceStart++;
  }

  let i = sentenceStart;
  while (i < line.length) {
    const ch = line[i];

    // Potential sentence ending punctuation
    if (ch === '.' || ch === '!' || ch === '?') {
      // Check if this is a real sentence boundary
      if (ch === '.') {
        // Ellipsis
        if (line[i + 1] === '.' && line[i + 2] === '.') {
          i += 3;
          continue;
        }

        // Decimal number: digit.digit
        if (i > 0 && /\d/.test(line[i - 1]) && i + 1 < line.length && /\d/.test(line[i + 1])) {
          i++;
          continue;
        }

        // URL check: if we're inside something that looks like a URL
        const beforeDot = line.slice(Math.max(0, i - 50), i);
        if (/https?:\/\/\S*$/.test(beforeDot)) {
          i++;
          continue;
        }

        // Abbreviation check
        const wordBefore = getWordBefore(line, i);
        if (wordBefore) {
          const lower = wordBefore.toLowerCase();
          if (ABBREVIATIONS.has(lower) || ABBREVIATIONS.has(lower.replace(/\.$/, ''))) {
            i++;
            continue;
          }
          // Country abbreviations like U.S. U.K.
          if (COUNTRY_ABBREVS.test(wordBefore + '.')) {
            i++;
            continue;
          }
        }
      }

      // Check if followed by whitespace + uppercase or end of string
      const afterIdx = i + 1;
      // Skip any trailing punctuation that's part of citations like [1].
      let checkIdx = afterIdx;
      // Check for citation markers right after the period
      while (checkIdx < line.length && line[checkIdx] === ' ') checkIdx++;

      const isEndOfLine = afterIdx >= line.length;
      const followedBySpace = afterIdx < line.length && /\s/.test(line[afterIdx]);

      if (isEndOfLine || followedBySpace) {
        const sentenceText = line.slice(sentenceStart, afterIdx).trim();
        if (sentenceText) {
          const actualStart = line.indexOf(sentenceText, sentenceStart);
          results.push({
            text: sentenceText,
            start: baseOffset + actualStart,
            end: baseOffset + actualStart + sentenceText.length,
          });
        }
        sentenceStart = afterIdx;
        while (sentenceStart < line.length && /\s/.test(line[sentenceStart])) {
          sentenceStart++;
        }
        i = sentenceStart;
        continue;
      }
    }

    // Semicolons act as clause separators
    if (ch === ';' && i + 1 < line.length && /\s/.test(line[i + 1])) {
      const sentenceText = line.slice(sentenceStart, i + 1).trim();
      if (sentenceText) {
        const actualStart = line.indexOf(sentenceText, sentenceStart);
        results.push({
          text: sentenceText,
          start: baseOffset + actualStart,
          end: baseOffset + actualStart + sentenceText.length,
        });
      }
      sentenceStart = i + 2;
      while (sentenceStart < line.length && /\s/.test(line[sentenceStart])) {
        sentenceStart++;
      }
      i = sentenceStart;
      continue;
    }

    i++;
  }

  // Remaining text
  const remaining = line.slice(sentenceStart).trim();
  if (remaining) {
    const actualStart = line.indexOf(remaining, sentenceStart);
    results.push({
      text: remaining,
      start: baseOffset + actualStart,
      end: baseOffset + actualStart + remaining.length,
    });
  }
}

function getWordBefore(text: string, dotIndex: number): string | null {
  let end = dotIndex;
  let start = end - 1;
  while (start >= 0 && /[A-Za-z.]/.test(text[start])) {
    start--;
  }
  start++;
  if (start >= end) return null;
  return text.slice(start, end);
}

/**
 * Extract verifiable claims from an LLM response.
 */
export function extractClaims(
  response: string,
  options?: { claimGranularity?: 'sentence' | 'clause' | 'paragraph' },
  citations?: Citation[],
): Claim[] {
  const granularity = options?.claimGranularity ?? 'sentence';

  let segments: Array<{ text: string; start: number; end: number }>;

  if (granularity === 'paragraph') {
    segments = splitParagraphs(response);
  } else {
    segments = splitSentences(response);
  }

  // For clause granularity, further split on coordinating conjunctions
  if (granularity === 'clause') {
    const expanded: Array<{ text: string; start: number; end: number }> = [];
    for (const seg of segments) {
      const clauses = splitClauses(seg.text, seg.start);
      expanded.push(...clauses);
    }
    segments = expanded;
  }

  const claims: Claim[] = [];
  let index = 0;

  for (const seg of segments) {
    const text = stripCitationMarkers(seg.text).trim();
    if (!text) continue;

    const factual = !isNonFactual(text);

    // Find citations that fall within this claim's text range
    const claimCitations = citations
      ? citations.filter(
          (c) => c.startOffset >= seg.start && c.startOffset < seg.end,
        )
      : [];

    claims.push({
      text,
      sentences: [seg.text],
      startOffset: seg.start,
      endOffset: seg.end,
      citations: claimCitations,
      isFactual: factual,
      index: index++,
    });
  }

  return claims;
}

/**
 * Split response into paragraphs.
 */
function splitParagraphs(text: string): Array<{ text: string; start: number; end: number }> {
  const results: Array<{ text: string; start: number; end: number }> = [];
  const re = /\n\s*\n/g;
  let lastEnd = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const seg = text.slice(lastEnd, m.index).trim();
    if (seg) {
      const start = text.indexOf(seg, lastEnd);
      results.push({ text: seg, start, end: start + seg.length });
    }
    lastEnd = m.index + m[0].length;
  }
  const seg = text.slice(lastEnd).trim();
  if (seg) {
    const start = text.indexOf(seg, lastEnd);
    results.push({ text: seg, start, end: start + seg.length });
  }
  return results;
}

/**
 * Split a sentence into clauses on coordinating conjunctions with independent clauses.
 */
function splitClauses(text: string, baseOffset: number): Array<{ text: string; start: number; end: number }> {
  // Split on ", and ", ", but ", ", or ", ", yet ", "; "
  const parts = text.split(/(?:,\s+(?:and|but|or|yet)\s+|;\s+)/);
  if (parts.length <= 1) {
    return [{ text, start: baseOffset, end: baseOffset + text.length }];
  }

  const results: Array<{ text: string; start: number; end: number }> = [];
  let searchFrom = 0;
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = text.indexOf(trimmed, searchFrom);
    results.push({
      text: trimmed,
      start: baseOffset + idx,
      end: baseOffset + idx + trimmed.length,
    });
    searchFrom = idx + trimmed.length;
  }
  return results;
}

/**
 * Remove citation markers from text for claim content analysis.
 */
function stripCitationMarkers(text: string): string {
  return text
    .replace(/\[\^?\d+\]/g, '')        // [1], [^1]
    .replace(/\^\[\d+\]/g, '')          // ^[1]
    .replace(/\^\d+/g, '')             // ^1
    .replace(/\[(?:Source|Ref)\s+\d+\]/gi, '')  // [Source 1], [Ref 1]
    .replace(/\[Source:\s*[^\]]+\]/gi, '')      // [Source: X]
    .replace(/\[Doc:\s*[^\]]+\]/gi, '')         // [Doc: X]
    .replace(/\(Source\s+\d+\)/gi, '')          // (Source 1)
    .replace(/\([A-Z][a-z]+(?:\s+et\s+al\.?)?,?\s*\d{4}\)/g, '') // (Author Year)
    .replace(/\s{2,}/g, ' ')
    .trim();
}
