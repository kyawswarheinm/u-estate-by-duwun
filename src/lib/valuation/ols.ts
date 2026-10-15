// Ridge-regularised least squares via the normal equations and a Cholesky solve (AI_SPEC §2.2). No dependencies.

/** Lower-triangular L with A = L·Lᵀ. Throws if A is not symmetric positive definite. */
export function cholesky(A: number[][]): number[][] {
  const n = A.length;
  const L = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= 0) throw new Error("Matrix is not positive definite");
        L[i][i] = Math.sqrt(s);
      } else {
        L[i][j] = s / L[j][j];
      }
    }
  }
  return L;
}

/** Solves A·x = b for symmetric positive definite A. */
export function solveSpd(A: number[][], b: number[]): number[] {
  const L = cholesky(A);
  const n = b.length;
  const y = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = s / L[i][i];
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}

/**
 * Ridge regression. Column 0 of X must be the intercept (all 1s); it is not penalised.
 * Other columns are standardised internally for a well-conditioned solve, and the
 * coefficients are returned on the original scale.
 */
export function ridge(X: number[][], y: number[], lambda = 1e-3): number[] {
  const n = X.length;
  const p = X[0].length;
  const mean = new Array<number>(p).fill(0);
  const sd = new Array<number>(p).fill(1);
  for (let j = 1; j < p; j++) {
    for (const row of X) mean[j] += row[j];
    mean[j] /= n;
    let v = 0;
    for (const row of X) v += (row[j] - mean[j]) ** 2;
    sd[j] = Math.sqrt(v / n) || 1; // a constant column stays as is (its coefficient shrinks to 0)
  }
  const Z = X.map((row) => row.map((v, j) => (j === 0 ? 1 : (v - mean[j]) / sd[j])));

  const ZtZ = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const Zty = new Array<number>(p).fill(0);
  for (let r = 0; r < n; r++) {
    const z = Z[r];
    for (let i = 0; i < p; i++) {
      Zty[i] += z[i] * y[r];
      for (let j = 0; j <= i; j++) ZtZ[i][j] += z[i] * z[j];
    }
  }
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < i; j++) ZtZ[j][i] = ZtZ[i][j];
    if (i > 0) ZtZ[i][i] += lambda * n;
  }
  const b = solveSpd(ZtZ, Zty);

  const beta = b.map((v, j) => (j === 0 ? v : v / sd[j]));
  for (let j = 1; j < p; j++) beta[0] -= beta[j] * mean[j];
  return beta;
}

export const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
