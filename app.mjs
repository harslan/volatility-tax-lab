/**
 * Volatility Tax Lab — Interactive Companion App
 * Directly imports the EXACT isomorphic math engine used by Episode 3's Remotion video.
 */

import {
  DEFAULT_SIM_PARAMS,
  PORTFOLIO_PRESETS,
  computeBreakEvenClimb,
  computeSquaredTaxTable,
  simulatePortfolio,
} from './math-engine.mjs';

const state = {
  avgReturnPct: PORTFOLIO_PRESETS.milo.avgReturnPct,
  swingPct: PORTFOLIO_PRESETS.milo.swingPct,
  leverage: 1,
  feeEnabled: false,
  annualFeeDragPct: 2.0,
  breakEvenDropPct: 50,
  activePreset: 'milo',
};

// Fixed Pip benchmark (+25% / -5%, +10% avg) for visual comparison on the chart
const PIP_BENCHMARK = simulatePortfolio({
  ...DEFAULT_SIM_PARAMS,
  ...PORTFOLIO_PRESETS.pip,
});

const el = {
  swingSlider: document.getElementById('swing-slider'),
  swingVal: document.getElementById('swing-val'),
  swingPresets: document.getElementById('swing-presets'),
  avgSlider: document.getElementById('avg-slider'),
  avgVal: document.getElementById('avg-val'),
  levButtons: document.getElementById('leverage-buttons'),
  levVal: document.getElementById('lev-val'),
  feeBox: document.getElementById('fee-box'),
  feeToggle: document.getElementById('fee-toggle'),
  feeSliderWrap: document.getElementById('fee-slider-wrap'),
  feeSlider: document.getElementById('fee-slider'),
  feeVal: document.getElementById('fee-val'),
  effGood: document.getElementById('eff-good'),
  effBad: document.getElementById('eff-bad'),
  effCycle: document.getElementById('eff-cycle'),
  kpiHeadline: document.getElementById('kpi-headline'),
  kpiHeadlineSub: document.getElementById('kpi-headline-sub'),
  kpiCagr: document.getElementById('kpi-cagr'),
  kpiDragSub: document.getElementById('kpi-drag-sub'),
  kpiWealth: document.getElementById('kpi-wealth'),
  kpiWealthSub: document.getElementById('kpi-wealth-sub'),
  kpiDown: document.getElementById('kpi-down'),
  kpiDownSub: document.getElementById('kpi-down-sub'),
  svg: document.getElementById('trajectory-svg'),
  chartFooter: document.getElementById('chart-footer'),
  squaredTaxList: document.getElementById('squared-tax-list'),
  beSlider: document.getElementById('be-slider'),
  bePresets: document.getElementById('be-presets'),
  beReadout: document.getElementById('be-readout'),
  beBars: document.getElementById('be-bars'),
  btnMilo: document.getElementById('btn-load-milo'),
  btnPip: document.getElementById('btn-load-pip'),
  btn3x: document.getElementById('btn-load-3x'),
};

function fmtUsd(val) {
  if (val < 1 && val > 0) return `$${val.toFixed(2)}`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  return `$${Math.round(val).toLocaleString('en-US')}`;
}

function fmtSignedPct(val, digits = 1) {
  const sign = val > 0 ? '+' : val < 0 ? '−' : '';
  return `${sign}${Math.abs(val).toFixed(digits)}%`;
}

function renderTrajectoryChart(result) {
  const W = 760;
  const H = 320;
  const padL = 62;
  const padR = 26;
  const padT = 22;
  const padB = 34;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // Honest log10 scale from $100 to max(Pip Y30, user P90) so both crash and surge stay readable
  const peakCandidate = Math.max(
    PIP_BENCHMARK.balanced.year30,
    result.balanced.year30,
    result.monteCarlo.p90EndingWealth,
    50000
  );
  const minVal = 100;
  const maxVal = Math.min(5_000_000, Math.max(200_000, peakCandidate * 1.2));
  const logMin = Math.log10(minVal);
  const logMax = Math.log10(maxVal);

  const toX = (yr) => padL + (yr / result.params.years) * innerW;
  const toY = (v) => {
    const clamped = Math.max(minVal, Math.min(maxVal, v));
    const t = (Math.log10(clamped) - logMin) / (logMax - logMin);
    return padT + innerH * (1 - t);
  };

  const toPath = (arr) =>
    arr
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)},${toY(v).toFixed(1)}`)
      .join(' ');

  const ticks = [100, 1000, 10000, 100000, 1000000].filter((t) => t >= minVal && t <= maxVal);
  const isPositive = result.balanced.year30 >= result.params.startingCapital;
  const mainStroke = isPositive ? '#4DE3C1' : '#FF765E';

  const fanPaths = result.monteCarlo.fanTrajectories
    .map(
      (f) =>
        `<path d="${toPath(f.path)}" fill="none" stroke="${
          f.finishedDown ? '#FF765E' : '#5CE5C8'
        }" stroke-width="1.3" stroke-opacity="0.28" />`
    )
    .join('');

  const pipPath = toPath(PIP_BENCHMARK.balanced.trajectory);
  const activePath = toPath(result.balanced.trajectory);
  const startY = toY(result.params.startingCapital);

  const yGrid = ticks
    .map((t) => {
      const y = toY(t);
      const label = t >= 1_000_000 ? '$1M' : t >= 1000 ? `$${t / 1000}K` : `$${t}`;
      return `
        <line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"
              stroke="rgba(255,255,255,0.10)" stroke-width="1" />
        <text x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end"
              fill="#9AA5B8" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700">${label}</text>
      `;
    })
    .join('');

  const xTicks = [0, 5, 10, 15, 20, 25, 30]
    .map((yr) => {
      const x = toX(yr);
      return `<text x="${x.toFixed(1)}" y="${H - 10}" text-anchor="middle"
        fill="#9AA5B8" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700">Y${yr}</text>`;
    })
    .join('');

  const endX = toX(30);
  const endY = toY(result.balanced.year30);
  const pipEndY = toY(PIP_BENCHMARK.balanced.year30);

  el.svg.innerHTML = `
    ${yGrid}
    ${xTicks}
    <line x1="${padL}" y1="${startY.toFixed(1)}" x2="${W - padR}" y2="${startY.toFixed(1)}"
          stroke="rgba(255, 232, 168, 0.55)" stroke-width="1.5" stroke-dasharray="6 5" />
    ${fanPaths}
    <path d="${pipPath}" fill="none" stroke="#2A9D8F" stroke-width="2.5" stroke-dasharray="5 4" stroke-opacity="0.88" />
    <circle cx="${endX.toFixed(1)}" cy="${pipEndY.toFixed(1)}" r="4.5" fill="#2A9D8F" stroke="#FFFDF8" stroke-width="1.5" />
    <path d="${activePath}" fill="none" stroke="${mainStroke}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="${endX.toFixed(1)}" cy="${endY.toFixed(1)}" r="5.5" fill="${mainStroke}" stroke="#FFFDF8" stroke-width="2" />
  `;

  const ratio =
    result.balanced.year30 > 0.01
      ? `${(PIP_BENCHMARK.balanced.year30 / result.balanced.year30).toFixed(1)}×`
      : '∞';

  el.chartFooter.innerHTML = `
    <span>Median Run: <strong>${fmtUsd(result.monteCarlo.medianEndingWealth)}</strong> · P10–P90: ${fmtUsd(
      result.monteCarlo.p10EndingWealth
    )} – ${fmtUsd(result.monteCarlo.p90EndingWealth)}</span>
    <span>Pip ($131,675) vs. Yours: <strong>${ratio}</strong></span>
  `;
}

function renderSquaredTaxTable() {
  const rows = computeSquaredTaxTable(10);
  const colors = ['#E5A93C', '#E07A3F', '#D94B33'];
  el.squaredTaxList.innerHTML = rows
    .map((r, i) => {
      const pctWidth = Math.min(100, (Math.abs(r.dragPct) / 9) * 100);
      const isCurrent = state.leverage === r.multiplier;
      return `
        <div class="tax-row ${isCurrent ? 'active-tier' : ''}">
          <div class="tax-row-top">
            <span>${r.multiplier}× (±${r.swingPct}% swing)</span>
            <span style="color:${colors[i]}">${r.dragPct.toFixed(1)}% drag (${r.taxMultiple}× tax)</span>
          </div>
          <div class="tax-bar-bg">
            <div class="tax-bar-fill" style="width:${pctWidth}%; background:${colors[i]};"></div>
          </div>
          <div class="tax-note">${r.note}</div>
        </div>
      `;
    })
    .join('');
}

function renderBreakEven() {
  const drop = state.breakEvenDropPct;
  const climb = computeBreakEvenClimb(drop);
  el.beReadout.textContent = `−${climb.dropPct}% → +${climb.gainNeededPct}%`;
  el.beSlider.value = String(drop);

  for (const btn of el.bePresets.querySelectorAll('button')) {
    btn.classList.toggle('active', Number(btn.dataset.drop) === drop);
  }

  const climbBarPct = Math.min(100, (climb.gainNeededPct / 400) * 100);
  el.beBars.innerHTML = `
    <div class="be-bar-row">
      <div class="be-bar-label">
        <span>Drawdown from $10,000 → ${fmtUsd(10000 * (1 - drop / 100))}</span>
        <span style="color:var(--coral)">−${climb.dropPct}%</span>
      </div>
      <div class="be-track"><div class="be-fill-drop" style="width:${climb.dropPct}%"></div></div>
    </div>
    <div class="be-bar-row">
      <div class="be-bar-label">
        <span>Gain Required Just to Break Even</span>
        <span style="color:var(--amber)">+${climb.gainNeededPct}%</span>
      </div>
      <div class="be-track"><div class="be-fill-climb" style="width:${Math.max(5, climbBarPct)}%"></div></div>
    </div>
  `;
}

function updateUI() {
  const feeDrag = state.leverage > 1 && state.feeEnabled ? state.annualFeeDragPct : 0;

  const result = simulatePortfolio({
    ...DEFAULT_SIM_PARAMS,
    avgReturnPct: state.avgReturnPct,
    swingPct: state.swingPct,
    leverage: state.leverage,
    annualFeeDragPct: feeDrag,
  });

  // Update controls display
  el.swingSlider.value = String(state.swingPct);
  el.swingVal.textContent = `±${state.swingPct}%`;
  el.avgSlider.value = String(state.avgReturnPct);
  el.avgVal.textContent = fmtSignedPct(state.avgReturnPct, state.avgReturnPct % 1 === 0 ? 0 : 1);
  el.levVal.textContent =
    state.leverage === 1 ? '1× Unleveraged' : `${state.leverage}× Daily ETF`;

  for (const btn of el.swingPresets.querySelectorAll('button')) {
    btn.classList.toggle('active', Number(btn.dataset.swing) === state.swingPct);
  }
  for (const btn of el.levButtons.querySelectorAll('button')) {
    btn.classList.toggle('active', Number(btn.dataset.lev) === state.leverage);
  }

  el.feeBox.classList.toggle('muted', state.leverage === 1);
  el.feeToggle.checked = state.feeEnabled;
  el.feeToggle.disabled = state.leverage === 1;
  el.feeSliderWrap.classList.toggle('hidden', !state.feeEnabled || state.leverage === 1);
  el.feeSlider.value = String(state.annualFeeDragPct);
  el.feeVal.textContent = `${state.annualFeeDragPct.toFixed(2)}% / yr`;

  // Effective year returns
  el.effGood.textContent = fmtSignedPct(result.effective.goodReturnPct, 1);
  el.effBad.textContent = fmtSignedPct(result.effective.badReturnPct, 1);
  el.effCycle.textContent = fmtSignedPct(result.effective.twoYearCyclePct, 2);
  el.effCycle.className = result.effective.twoYearCyclePct >= 0 ? 'text-emerald' : 'text-coral';

  // KPIs
  el.kpiHeadline.textContent = fmtSignedPct(result.effective.effectiveAvgPct, 1);
  el.kpiHeadlineSub.textContent =
    state.leverage === 1
      ? 'Arithmetic mean / yr'
      : `${state.leverage}× mean${feeDrag > 0 ? ` − ${feeDrag.toFixed(2)}% fee` : ''}`;

  el.kpiCagr.textContent = fmtSignedPct(result.effective.cagrPct, 2);
  el.kpiCagr.style.color = result.effective.cagrPct >= 0 ? '#5CE5C8' : '#FF856B';
  el.kpiDragSub.textContent = `−${Math.max(0, result.effective.volatilityDragAnnualPct).toFixed(2)}% / yr volatility drag`;

  el.kpiWealth.textContent = fmtUsd(result.balanced.year30);
  el.kpiWealth.style.color =
    result.balanced.year30 >= result.params.startingCapital ? 'var(--emerald)' : 'var(--coral)';
  el.kpiWealthSub.textContent = `${fmtSignedPct(result.balanced.totalReturnPct, 1)} total over 30 yrs`;

  el.kpiDown.textContent = `${result.monteCarlo.downPct.toFixed(1)}%`;
  el.kpiDown.style.color = result.monteCarlo.downPct > 20 ? 'var(--coral)' : 'var(--emerald)';
  el.kpiDownSub.textContent = `${result.monteCarlo.downCount} / 1,000 runs (theory ${result.monteCarlo.theoreticalDownPct.toFixed(
    1
  )}%)`;

  // Preset active states
  el.btnMilo.classList.toggle('active', state.activePreset === 'milo');
  el.btnPip.classList.toggle('active', state.activePreset === 'pip');
  el.btn3x.classList.toggle('active', state.activePreset === '3x');

  renderTrajectoryChart(result);
  renderSquaredTaxTable();
  renderBreakEven();
}

// Event bindings
el.swingSlider.addEventListener('input', (e) => {
  state.swingPct = Number(e.target.value);
  state.activePreset = null;
  updateUI();
});

el.swingPresets.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-swing]');
  if (!btn) return;
  state.swingPct = Number(btn.dataset.swing);
  state.activePreset = null;
  updateUI();
});

el.avgSlider.addEventListener('input', (e) => {
  state.avgReturnPct = Number(e.target.value);
  state.activePreset = null;
  updateUI();
});

el.levButtons.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-lev]');
  if (!btn) return;
  state.leverage = Number(btn.dataset.lev);
  if (state.leverage > 1 && !state.feeEnabled) state.feeEnabled = true;
  state.activePreset = null;
  updateUI();
});

el.feeToggle.addEventListener('change', (e) => {
  state.feeEnabled = e.target.checked;
  updateUI();
});

el.feeSlider.addEventListener('input', (e) => {
  state.annualFeeDragPct = Number(e.target.value);
  updateUI();
});

el.beSlider.addEventListener('input', (e) => {
  state.breakEvenDropPct = Number(e.target.value);
  renderBreakEven();
});

el.bePresets.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-drop]');
  if (!btn) return;
  state.breakEvenDropPct = Number(btn.dataset.drop);
  renderBreakEven();
});

el.btnMilo.addEventListener('click', () => {
  state.avgReturnPct = PORTFOLIO_PRESETS.milo.avgReturnPct;
  state.swingPct = PORTFOLIO_PRESETS.milo.swingPct;
  state.leverage = 1;
  state.feeEnabled = false;
  state.breakEvenDropPct = 40;
  state.activePreset = 'milo';
  updateUI();
});

el.btnPip.addEventListener('click', () => {
  state.avgReturnPct = PORTFOLIO_PRESETS.pip.avgReturnPct;
  state.swingPct = PORTFOLIO_PRESETS.pip.swingPct;
  state.leverage = 1;
  state.feeEnabled = false;
  state.breakEvenDropPct = 20;
  state.activePreset = 'pip';
  updateUI();
});

el.btn3x.addEventListener('click', () => {
  state.avgReturnPct = 10;
  state.swingPct = 20;
  state.leverage = 3;
  state.feeEnabled = true;
  state.annualFeeDragPct = 2.0;
  state.breakEvenDropPct = 80;
  state.activePreset = '3x';
  updateUI();
});

updateUI();
