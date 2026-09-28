import { alignWindow, simulate, parseBRL, fmtMonth } from './calc.js';

const TICKERS = [
  ['PETR4', 'Petrobras PN'], ['VALE3', 'Vale ON'], ['ITUB4', 'Itaú Unibanco PN'], ['BBDC4', 'Bradesco PN'],
  ['BBAS3', 'Banco do Brasil ON'], ['ITSA4', 'Itaúsa PN'], ['B3SA3', 'B3 ON'], ['WEGE3', 'WEG ON'],
  ['ABEV3', 'Ambev ON'], ['BBSE3', 'BB Seguridade ON'], ['TAEE11', 'Taesa UNT'], ['EGIE3', 'Engie Brasil ON'],
  ['SBSP3', 'Sabesp ON'], ['CMIG4', 'Cemig PN'], ['EQTL3', 'Equatorial ON'], ['VIVT3', 'Telefônica Brasil ON'],
  ['SUZB3', 'Suzano ON'], ['GGBR4', 'Gerdau PN'], ['PRIO3', 'PRIO ON'], ['RENT3', 'Localiza ON'],
  ['RADL3', 'Raia Drogasil ON'], ['LREN3', 'Lojas Renner ON'], ['MGLU3', 'Magazine Luiza ON'],
  ['BOVA11', 'ETF Ibovespa'], ['IVVB11', 'ETF S&P 500 (em R$)'],
];

const $ = (id) => document.getElementById(id);
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v) => `${v >= 0 ? '+' : ''}${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const fmtInput = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const state = { selic: null, stock: null, stockKey: null, chart: null };

// ---------- setup ----------
$('tickers').innerHTML = TICKERS.map(([t, n]) => `<option value="${t}">${n}</option>`).join('');

for (const id of ['initial', 'monthly']) {
  const el = $(id);
  el.addEventListener('blur', () => {
    const v = parseBRL(el.value);
    el.value = Number.isFinite(v) ? fmtInput(v) : el.value;
  });
}
// Recalcula na hora quando só mudam janela / valores / opções (sem nova consulta)
document.querySelectorAll('input[name="years"]').forEach((r) => r.addEventListener('change', recalcIfLoaded));
['applyTax', 'useAdjusted'].forEach((id) => $(id).addEventListener('change', recalcIfLoaded));
['initial', 'monthly'].forEach((id) => $(id).addEventListener('change', recalcIfLoaded));

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await run();
});

run();

// ---------- fluxo ----------
async function getJSON(url) {
  const r = await fetch(url);
  let body;
  try { body = await r.json(); } catch { body = {}; }
  if (!r.ok) throw new Error(body.error || `Erro ${r.status}`);
  return body;
}

async function run() {
  const ticker = $('ticker').value.trim().toUpperCase();
  if (!ticker) return setStatus('Informe o código de uma ação.', true);
  $('ticker').value = ticker;
  $('submit').disabled = true;
  setStatus('Buscando dados do Banco Central e cotações…');
  try {
    const [selic, stock] = await Promise.all([
      state.selic ? state.selic : getJSON('/api/selic'),
      state.stockKey === ticker ? state.stock : getJSON(`/api/stock?ticker=${encodeURIComponent(ticker)}`),
    ]);
    state.selic = selic;
    state.stock = stock;
    state.stockKey = ticker;
    const known = TICKERS.find(([t]) => t === ticker);
    $('stockName').textContent = stock.name || (known ? known[1] : '');
    recalc();
  } catch (err) {
    setStatus(err.message, true);
    $('results').hidden = true;
  } finally {
    $('submit').disabled = false;
  }
}

function recalcIfLoaded() {
  if (state.selic && state.stock && state.stockKey === $('ticker').value.trim().toUpperCase()) recalc();
}

function readParams() {
  const initial = parseBRL($('initial').value);
  const monthly = parseBRL($('monthly').value);
  if (!Number.isFinite(initial) || !Number.isFinite(monthly)) throw new Error('Valores inválidos. Use o formato 10.000,00.');
  if (initial + monthly <= 0) throw new Error('Informe uma aplicação inicial ou um aporte mensal maior que zero.');
  return {
    years: Number(document.querySelector('input[name="years"]:checked').value),
    initial,
    monthly,
    applyTax: $('applyTax').checked,
    useAdjusted: $('useAdjusted').checked,
  };
}

function recalc() {
  try {
    const p = readParams();
    const w = alignWindow(state.selic.series, state.stock.series, p.years, { useAdjusted: p.useAdjusted });
    const r = simulate(w, p);
    render(r, p);
    const flags = [state.selic.mock || state.stock.mock ? 'DADOS SIMULADOS (modo offline)' : null].filter(Boolean);
    setStatus(flags.join(' · '), flags.length > 0);
  } catch (err) {
    setStatus(err.message, true);
    $('results').hidden = true;
  }
}

// ---------- renderização ----------
function statsHTML(s, taxLabel) {
  const cls = (v) => (v >= 0 ? 'pos' : 'neg');
  return `
    <dt>Total investido</dt><dd>${brl.format(s.invested)}</dd>
    <dt>Valor bruto final</dt><dd>${brl.format(s.gross)}</dd>
    <dt>Rendimento bruto</dt><dd class="${cls(s.grossGain)}">${brl.format(s.grossGain)}</dd>
    <dt>${taxLabel}</dt><dd>${s.tax > 0 ? '− ' + brl.format(s.tax) : brl.format(0)}</dd>
    <dt>Valor líquido final</dt><dd>${brl.format(s.net)}</dd>
    <dt class="hl">Rendimento líquido</dt><dd class="hl ${cls(s.netGain)}">${brl.format(s.netGain)}</dd>
    <dt>Rentabilidade líquida</dt><dd class="${cls(s.netReturnPct)}">${pct(s.netReturnPct)}</dd>`;
}

function render(r, p) {
  const ticker = state.stockKey;
  $('results').hidden = false;
  $('selicStats').innerHTML = statsHTML(r.selic, p.applyTax ? 'IR (tabela regressiva)' : 'IR (desconsiderado)');
  $('stockStats').innerHTML = statsHTML(r.stock, p.applyTax ? 'IR (15% sobre o ganho)' : 'IR (desconsiderado)');
  $('stockTitle').textContent = ticker;
  $('stockSub').textContent = p.useAdjusted ? 'Com proventos reinvestidos' : 'Somente variação do preço';

  const diff = r.stock.netGain - r.selic.netGain;
  const winner = Math.abs(diff) < 0.005 ? null : diff > 0 ? ticker : 'Selic';
  const color = winner === 'Selic' ? 'var(--selic)' : 'var(--stock)';
  $('verdict').innerHTML = winner
    ? `<span class="tag" style="background:${color}">${winner} venceu</span>
       <span>Em ${p.years} ${p.years > 1 ? 'anos' : 'ano'}, <b>${winner}</b> rendeu <b>${brl.format(Math.abs(diff))}</b> líquidos a mais,
       com ${brl.format(r.selic.invested)} investidos (${r.contributions} aportes, incluindo a aplicação inicial).</span>`
    : `<span>Empate técnico no período.</span>`;
  $('period').textContent = `${fmtMonth(r.start)} a ${fmtMonth(r.end)} · ${r.months} meses`;

  drawChart(r, ticker);
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function drawChart(r, ticker) {
  if (!window.Chart) return; // Chart.js carregado com defer
  const labels = r.evolution.map((e) => fmtMonth(e.month));
  const ds = (label, key, color, extra = {}) => ({
    label, data: r.evolution.map((e) => +e[key].toFixed(2)), borderColor: color, backgroundColor: color,
    borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.15, ...extra,
  });
  const datasets = [
    ds('Selic', 'selic', cssVar('--selic')),
    ds(ticker, 'stock', cssVar('--stock')),
    ds('Total investido', 'invested', cssVar('--invested'), { borderDash: [5, 4], borderWidth: 1.5 }),
  ];
  const grid = cssVar('--border');
  const text = cssVar('--muted');

  if (state.chart) state.chart.destroy();
  state.chart = new Chart($('chart'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: text, usePointStyle: true, boxHeight: 6 } },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${brl.format(c.parsed.y)}` } },
      },
      scales: {
        x: { ticks: { color: text, maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } },
        y: {
          ticks: { color: text, callback: (v) => brl.format(v).replace(/,00$/, '') },
          grid: { color: grid },
        },
      },
    },
  });
}

window.addEventListener('load', () => state.chart === null && state.selic && state.stock && recalc());

function setStatus(msg, isError = false) {
  const el = $('status');
  el.textContent = msg || '';
  el.classList.toggle('error', !!isError);
}
