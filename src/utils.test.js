import { describe, it, expect } from 'vitest';
import { levenshteinDistance, checkWrittenAnswer } from './utils';

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
  });

  it('returns the length of the other string when one is empty', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });

  it('calculates distance correctly', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('saturday', 'sunday')).toBe(3);
  });
});

describe('checkWrittenAnswer', () => {
  it('accepts exact match (case-insensitive)', () => {
    expect(checkWrittenAnswer('Humerus', 'humerus')).toBe(true);
  });

  it('accepts match ignoring punctuation', () => {
    expect(checkWrittenAnswer("it's", 'its')).toBe(true);
  });

  it('accepts close match within edit distance 2 for long words', () => {
    expect(checkWrittenAnswer('humeris', 'humerus')).toBe(true);
  });

  it('rejects completely wrong answer', () => {
    expect(checkWrittenAnswer('femur', 'humerus')).toBe(false);
  });

  it('does not allow fuzzy match for very short words', () => {
    expect(checkWrittenAnswer('ab', 'cd')).toBe(false);
  });
});
