import { describe, it, expect } from 'vitest';
import { calculateSR } from './sr';

describe('calculateSR', () => {
  it('returns learning status for first correct answer', () => {
    const result = calculateSR({}, 2);
    expect(result.status).toBe('learning');
    expect(result.interval).toBe(1);
    expect(result.repetitions).toBe(1);
    expect(result.correctDelta).toBe(1);
    expect(result.incorrectDelta).toBe(0);
  });

  it('resets on wrong answer (quality 0)', () => {
    const result = calculateSR({ ease_factor: 2.5, interval: 6, repetitions: 3 }, 0);
    expect(result.repetitions).toBe(0);
    expect(result.interval).toBe(1);
    expect(result.incorrectDelta).toBe(1);
    expect(result.correctDelta).toBe(0);
    expect(result.status).toBe('learning');
  });

  it('clamps ease_factor to minimum 1.3', () => {
    const result = calculateSR({ ease_factor: 1.3, interval: 1, repetitions: 0 }, 0);
    expect(result.ease_factor).toBe(1.3);
  });

  it('increases ease on easy (quality 3)', () => {
    const result = calculateSR({ ease_factor: 2.5, interval: 0, repetitions: 0 }, 3);
    expect(result.ease_factor).toBe(2.65);
  });

  it('decreases ease on hard (quality 1)', () => {
    const result = calculateSR({ ease_factor: 2.5, interval: 0, repetitions: 0 }, 1);
    expect(result.ease_factor).toBe(2.35);
  });

  it('reaches reviewing status at 2 repetitions', () => {
    const result = calculateSR({ ease_factor: 2.5, interval: 1, repetitions: 1 }, 2);
    expect(result.repetitions).toBe(2);
    expect(result.interval).toBe(3);
    expect(result.status).toBe('reviewing');
  });

  it('reaches mastered status at 5+ reps and 21+ day interval', () => {
    const result = calculateSR({ ease_factor: 2.5, interval: 15, repetitions: 4 }, 2);
    expect(result.repetitions).toBe(5);
    expect(result.interval).toBe(38); // 15 * 2.5 = 37.5 rounded
    expect(result.status).toBe('mastered');
  });

  it('uses default values when current is empty', () => {
    const result = calculateSR({}, 2);
    expect(result.ease_factor).toBe(2.5);
    expect(result.interval).toBe(1);
    expect(result.repetitions).toBe(1);
  });
});
