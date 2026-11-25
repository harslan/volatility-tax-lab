/**
 * Shared Isomorphic Deterministic Math Engine — Episode 3: Volatility Tax in Stocks
 * Imported directly by BOTH episodes/volatility-tax-stocks/simulate.mjs (Node)
 * AND web/volatility-tax-lab/ (Browser ES module) so video numbers and web lab numbers NEVER diverge.
 */

export const DEFAULT_SIM_PARAMS = Object.freeze({
  seed: 303,
  startingCapital: 10000,
  years: 30,
  numTimelines: 1000,
});

export const PORTFOLIO_PRESETS = Object.freeze({
  milo: Object.freeze({
    id: 'milo',
    name: "Milo's Wild Stock",
    shortLabel: '+60% / -40% STOCK',
    avgReturnPct: 10,
    swingPct: 50,
    leverage: 1,
    annualFeeDragPct: 0,
  }),
  pip: Object.freeze({
    id: 'pip',
    name: "Pip's Diversified Index",
    shortLabel: '+25% / -5% INDEX',
    avgReturnPct: 10,
    swingPct: 15,
    leverage: 1,
    annualFeeDragPct: 0,
  }),
  broadIndex: Object.freeze({
    id: 'broadIndex',
    name: 'Broad Index (15% Swing)',
    shortLabel: 'BROAD INDEX · ±15%',
    avgReturnPct: 10,
    swingPct: 15,
    leverage: 1,
    annualFeeDragPct: 0,
  }),
  techSector: Object.freeze({
    id: 'techSector',
    name: 'Tech Sector (30% Swing)',
    shortLabel: 'TECH SECTOR · ±30%',
    avgReturnPct: 10,
    swingPct: 30,
    leverage: 1,
    annualFeeDragPct: 0,
  }),
  wildStock: Object.freeze({
    id: 'wildStock',
    name: 'Wild Single Stock (50% Swing)',
    shortLabel: 'WILD STOCK · ±50%',
    avgReturnPct: 10,
    swingPct: 50,
    leverage: 1,
    annualFeeDragPct: 0,
  }),
});

/**
 * Deterministic Mulberry32 PRNG.
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function nextRandom() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Exact binomial coefficient C(n, k).
 */
function binomialCoeff(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const m = Math.min(k, n - k);
  let res = 1;
  for (let i = 1; i <= m; i++) {
    res = (res * (n - m + i)) / i;
  }
  return res;
}

/**
 * Exact theoretical probability that a 50/50 good/bad Bernoulli sequence of length `years`
 * finishes strictly below startingCapital (< 1.0x).
 */
export function computeTheoreticalDownProbability(goodFactor, badFactor, years = 30) {
  if (goodFactor <= 0 && badFactor <= 0) return 1;
  let downProb = 0;
  const denom = Math.pow(2, years);
  for (let k = 0; k <= years; k++) {
    const endingMult = Math.pow(goodFactor, k) * Math.pow(badFactor, years - k);
    if (endingMult < 1 - 1e-12) {
      downProb += binomialCoeff(years, k) / denom;
    }
  }
  return downProb;
}

/**
 * Exact squared volatility tax table: (1 + x)(1 - x) = 1 - x^2.
 */
export function computeSquaredTaxTable(baseSwingPct = 10) {
  return [1, 2, 3].map((multiplier) => {
    const swingPct = Number((baseSwingPct * multiplier).toFixed(2));
    const x = swingPct / 100;
    const twoYearFactor = Number(((1 + x) * (1 - x)).toFixed(6));
    const dragPct = Number(((twoYearFactor - 1) * 100).toFixed(2));
    const taxMultiple = multiplier * multiplier;
    return {
      multiplier,
      swingPct,
      upPct: swingPct,
      downPct: -swingPct,
      twoYearFactor,
      dragPct,
      taxMultiple,
      note:
        multiplier === 3
          ? '9x variance tax before borrowing costs & expense ratios'
          : `${taxMultiple}x variance tax`,
    };
  });
}

/**
 * Break-even gain needed to recover from a drawdown of `dropPct` (e.g., 50 -> 100%).
 */
export function computeBreakEvenClimb(dropPct) {
  const clamped = Math.max(0, Math.min(99, Number(dropPct)));
  const gainNeededPct = (clamped / (100 - clamped)) * 100;
  return {
    dropPct: clamped,
    remainingPct: 100 - clamped,
    gainNeededPct: Number(gainNeededPct.toFixed(1)),
  };
}

export const BREAK_EVEN_BENCHMARKS = Object.freeze([
  computeBreakEvenClimb(20),
  computeBreakEvenClimb(50),
  computeBreakEvenClimb(80),
]);

function quantile(sortedArr, q) {
  if (sortedArr.length === 0) return 0;
  const pos = (sortedArr.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedArr[lo];
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (pos - lo);
}

/**
 * Deterministic simulation of a symmetric +/- swing portfolio around an average annual return,
 * optionally amplified by leverage + annual financing/fee drag.
 */
export function simulatePortfolio({
  startingCapital = DEFAULT_SIM_PARAMS.startingCapital,
  years = DEFAULT_SIM_PARAMS.years,
  avgReturnPct = 10,
  swingPct = 50,
  leverage = 1,
  annualFeeDragPct = 0,
  numTimelines = DEFAULT_SIM_PARAMS.numTimelines,
  seed = DEFAULT_SIM_PARAMS.seed,
  fanCount = 24,
} = {}) {
  const effectiveAvgPct = avgReturnPct * leverage - annualFeeDragPct;
  const effectiveSwingPct = swingPct * leverage;

  const goodReturnPct = effectiveAvgPct + effectiveSwingPct;
  const badReturnPct = effectiveAvgPct - effectiveSwingPct;

  const goodFactor = Math.max(0, 1 + goodReturnPct / 100);
  const badFactor = Math.max(0, 1 + badReturnPct / 100);

  // Balanced alternating benchmark: Year 1 good, Year 2 bad, ..., Year 30 (15 good, 15 bad)
  const balancedTrajectory = [startingCapital];
  let bal = startingCapital;
  for (let yr = 1; yr <= years; yr++) {
    bal = bal * (yr % 2 === 1 ? goodFactor : badFactor);
    balancedTrajectory.push(Number(bal.toFixed(2)));
  }

  const year1 = balancedTrajectory[1] ?? startingCapital;
  const year2 = balancedTrajectory[2] ?? startingCapital;
  const year30 = balancedTrajectory[years] ?? bal;

  const twoYearFactor = goodFactor * badFactor;
  const twoYearCyclePct = (twoYearFactor - 1) * 100;
  const cagrPct = twoYearFactor > 0 ? (Math.sqrt(twoYearFactor) - 1) * 100 : -100;
  const volatilityDragAnnualPct = effectiveAvgPct - cagrPct;

  // 1,000 deterministic 50/50 random timelines
  const rng = mulberry32(seed);
  const allTimelines = [];
  let downCount = 0;
  let aheadCount = 0;
  let wipedOutCount = 0;

  for (let t = 0; t < numTimelines; t++) {
    let w = startingCapital;
    const path = [startingCapital];
    let goodYears = 0;
    for (let yr = 1; yr <= years; yr++) {
      const isGood = rng() < 0.5;
      if (isGood) goodYears++;
      w = w * (isGood ? goodFactor : badFactor);
      path.push(Number(w.toFixed(2)));
    }
    if (w < startingCapital - 1e-6) {
      downCount++;
    } else {
      aheadCount++;
    }
    if (w < 1) wipedOutCount++;
    allTimelines.push({
      id: t,
      goodYears,
      badYears: years - goodYears,
      endingWealth: Number(w.toFixed(2)),
      path,
    });
  }

  const sortedByEnd = [...allTimelines].sort((a, b) => a.endingWealth - b.endingWealth);
  const endings = sortedByEnd.map((x) => x.endingWealth);
  const medianEndingWealth = Number(quantile(endings, 0.5).toFixed(2));
  const p10EndingWealth = Number(quantile(endings, 0.1).toFixed(2));
  const p90EndingWealth = Number(quantile(endings, 0.9).toFixed(2));
  const meanEndingWealth = Number(
    (endings.reduce((acc, v) => acc + v, 0) / Math.max(1, endings.length)).toFixed(2)
  );

  // Pick 24 representative fan trajectories evenly spaced across ending-wealth quantiles
  const fanTrajectories = [];
  const count = Math.min(fanCount, sortedByEnd.length);
  for (let i = 0; i < count; i++) {
    const idx = Math.round((i / Math.max(1, count - 1)) * (sortedByEnd.length - 1));
    const item = sortedByEnd[idx];
    fanTrajectories.push({
      id: item.id,
      quantileRank: Number((i / Math.max(1, count - 1)).toFixed(3)),
      goodYears: item.goodYears,
      badYears: item.badYears,
      endingWealth: item.endingWealth,
      finishedDown: item.endingWealth < startingCapital - 1e-6,
      path: item.path,
    });
  }

  const theoreticalDownProb = computeTheoreticalDownProbability(goodFactor, badFactor, years);
  const theoreticalAheadProb = 1 - theoreticalDownProb;

  return {
    params: {
      startingCapital,
      years,
      avgReturnPct,
      swingPct,
      leverage,
      annualFeeDragPct,
      numTimelines,
      seed,
    },
    effective: {
      headlineAvgPct: Number(avgReturnPct.toFixed(2)),
      effectiveAvgPct: Number(effectiveAvgPct.toFixed(2)),
      effectiveSwingPct: Number(effectiveSwingPct.toFixed(2)),
      goodReturnPct: Number(goodReturnPct.toFixed(2)),
      badReturnPct: Number(badReturnPct.toFixed(2)),
      goodFactor: Number(goodFactor.toFixed(6)),
      badFactor: Number(badFactor.toFixed(6)),
      twoYearFactor: Number(twoYearFactor.toFixed(6)),
      twoYearCyclePct: Number(twoYearCyclePct.toFixed(2)),
      cagrPct: Number(cagrPct.toFixed(2)),
      volatilityDragAnnualPct: Number(volatilityDragAnnualPct.toFixed(2)),
    },
    balanced: {
      year0: startingCapital,
      year1: Number(year1.toFixed(2)),
      year2: Number(year2.toFixed(2)),
      year30: Number(year30.toFixed(2)),
      totalReturnPct: Number((((year30 - startingCapital) / startingCapital) * 100).toFixed(2)),
      trajectory: balancedTrajectory,
    },
    monteCarlo: {
      numTimelines,
      downCount,
      downPct: Number(((downCount / numTimelines) * 100).toFixed(2)),
      aheadCount,
      aheadPct: Number(((aheadCount / numTimelines) * 100).toFixed(2)),
      wipedOutCount,
      theoreticalDownPct: Number((theoreticalDownProb * 100).toFixed(2)),
      theoreticalAheadPct: Number((theoreticalAheadProb * 100).toFixed(2)),
      medianEndingWealth,
      meanEndingWealth,
      p10EndingWealth,
      p90EndingWealth,
      fanTrajectories,
    },
  };
}

/**
 * Runs the canonical Episode 3 locked simulation (Milo +60%/-40% vs Pip +25%/-5%, seed 303).
 */
export function runEpisode3Simulation() {
  const milo = simulatePortfolio({
    ...DEFAULT_SIM_PARAMS,
    ...PORTFOLIO_PRESETS.milo,
    seed: DEFAULT_SIM_PARAMS.seed,
  });

  const pip = simulatePortfolio({
    ...DEFAULT_SIM_PARAMS,
    ...PORTFOLIO_PRESETS.pip,
    seed: DEFAULT_SIM_PARAMS.seed,
  });

  const squaredTax = computeSquaredTaxTable(10);
  const pipToMiloRatioExact = pip.balanced.year30 / milo.balanced.year30;
  const pipToMiloRatio = Math.round(pipToMiloRatioExact * 10) / 10;

  return {
    meta: {
      episode: 'volatility-tax-stocks',
      title: 'How to Lose Money in a +10% Stock',
      prng: 'mulberry32',
      seed: DEFAULT_SIM_PARAMS.seed,
      startingCapital: DEFAULT_SIM_PARAMS.startingCapital,
      years: DEFAULT_SIM_PARAMS.years,
      numTimelines: DEFAULT_SIM_PARAMS.numTimelines,
    },
    summary: {
      startingCapital: DEFAULT_SIM_PARAMS.startingCapital,
      years: DEFAULT_SIM_PARAMS.years,
      headlineAvgPct: 10,
      miloYear1: milo.balanced.year1,
      miloYear2: milo.balanced.year2,
      miloYear30Exact: milo.balanced.year30,
      miloYear30Display: Math.round(milo.balanced.year30),
      miloTotalReturnPct: milo.balanced.totalReturnPct,
      miloTwoYearCyclePct: milo.effective.twoYearCyclePct,
      miloCagrPct: milo.effective.cagrPct,
      miloEmpiricalDownCount: milo.monteCarlo.downCount,
      miloEmpiricalDownPct: milo.monteCarlo.downPct,
      miloTheoreticalDownPct: milo.monteCarlo.theoreticalDownPct,
      pipYear1: pip.balanced.year1,
      pipYear2: pip.balanced.year2,
      pipYear30Exact: pip.balanced.year30,
      pipYear30Display: Math.round(pip.balanced.year30),
      pipTwoYearCyclePct: pip.effective.twoYearCyclePct,
      pipCagrPct: pip.effective.cagrPct,
      pipEmpiricalAheadCount: pip.monteCarlo.aheadCount,
      pipEmpiricalAheadPct: pip.monteCarlo.aheadPct,
      pipTheoreticalAheadPct: pip.monteCarlo.theoreticalAheadPct,
      pipToMiloRatioExact: Number(pipToMiloRatioExact.toFixed(4)),
      pipToMiloRatio,
    },
    milo,
    pip,
    squaredTax,
    breakEvenBenchmarks: BREAK_EVEN_BENCHMARKS,
  };
}
