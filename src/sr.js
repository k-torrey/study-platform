/**
 * SM-2 spaced repetition algorithm variant.
 * quality: 0 = wrong, 1 = hard, 2 = good, 3 = easy
 */
export function calculateSR(current, quality) {
  let { ease_factor = 2.5, interval = 0, repetitions = 0 } = current;

  let correctDelta = 0;
  let incorrectDelta = 0;
  let status;

  if (quality < 1) {
    repetitions = 0;
    interval = 1;
    ease_factor -= 0.2;
    incorrectDelta = 1;
  } else {
    repetitions += 1;
    correctDelta = 1;

    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 3;
    } else {
      interval = Math.round(interval * ease_factor);
    }

    if (quality === 1) ease_factor -= 0.15;
    else if (quality === 3) ease_factor += 0.15;
  }

  if (ease_factor < 1.3) ease_factor = 1.3;

  if (repetitions >= 5 && interval >= 21) {
    status = 'mastered';
  } else if (repetitions >= 2) {
    status = 'reviewing';
  } else {
    status = 'learning';
  }

  return {
    ease_factor,
    interval,
    repetitions,
    status,
    correctDelta,
    incorrectDelta,
  };
}
