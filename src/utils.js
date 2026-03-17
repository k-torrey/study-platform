export function levenshteinDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function checkWrittenAnswer(userAnswer, correctAnswer) {
  const normalize = (s) => s.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const a = normalize(userAnswer);
  const b = normalize(correctAnswer);
  if (a === b) return true;
  if (b.length > 5 && levenshteinDistance(a, b) <= 2) return true;
  return false;
}
