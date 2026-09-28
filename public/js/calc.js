// Motor de cálculo — módulo ES puro, usado no navegador e nos testes (node --test).
//
// Convenção de tempo (n = 12 × anos):
//   M0 ... Mn = fechamentos mensais consecutivos.
//   Aplicação inicial no fechamento de M0; aportes nos fechamentos de M1 ... M(n-1)
//   (um por mês a partir do 2º mês); resgate/avaliação no fechamento de Mn.
//   Selic: cada aporte rende a Selic dos meses seguintes (série 4390, % a.m.).
//   Ação: compra de frações pelo preço de fechamento; venda total em Mn.

export const DAYS_PER_MONTH = 30.4375;

/** Tabela regressiva de IR (renda fixa / Tesouro Selic). */
export function irRendaFixa(days) {
  if (days <= 180) return 0.225;
  if (days <= 360) return 0.2;
  if (days <= 720) return 0.175;
  return 0.15;
}
export const IR_ACOES = 0.15; // ganho de capital em operações comuns

export function addMonths(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Alinha as séries no último mês comum e recorta a janela.
 * @returns {{ months: string[], rates: number[], prices: number[] }}  rates[k] = Selic do mês k (k≥1)
 */
export function alignWindow(selic, stock, years, { useAdjusted = true } = {}) {
  const rateByMonth = new Map(selic.map((s) => [s.month, s.rate]));
  const priceByMonth = new Map(stock.map((s) => [s.month, useAdjusted ? s.adjClose : s.close]));
  const common = [...priceByMonth.keys()].filter((m) => rateByMonth.has(m)).sort();
  if (!common.length) throw new Error('Não há meses em comum entre a Selic e a cotação.');

  const n = years * 12;
  const end = common[common.length - 1];
  const months = Array.from({ length: n + 1 }, (_, k) => addMonths(end, k - n));
  const missing = months.filter((m, k) => !priceByMonth.has(m) || (k > 0 && !rateByMonth.has(m)));
  if (missing.length) {
    const first = stock.find((s) => s.month)?.month;
    throw new Error(
      `Histórico insuficiente para ${years} ano(s)` + (first ? ` — a cotação disponível começa em ${fmtMonth(first)}.` : '.'),
    );
  }
  return {
    months,
    rates: months.map((m, k) => (k === 0 ? 0 : rateByMonth.get(m))),
    prices: months.map((m) => priceByMonth.get(m)),
  };
}

/**
 * Simula as duas estratégias.
 * @param {{months:string[], rates:number[], prices:number[]}} w  janela alinhada
 * @param {{initial:number, monthly:number, applyTax?:boolean}} p
 */
export function simulate(w, { initial, monthly, applyTax = true }) {
  const n = w.months.length - 1;
  const contrib = (k) => (k === 0 ? initial : k < n ? monthly : 0);

  const evolution = [];
  let invested = 0;
  let selicValue = 0;
  let shares = 0;
  const lotsSelic = []; // { k, amount } para IR regressivo por aporte

  for (let k = 0; k <= n; k++) {
    selicValue *= 1 + w.rates[k]; // rende a Selic do mês k antes do aporte do fechamento de k
    const c = contrib(k);
    if (c > 0) {
      invested += c;
      selicValue += c;
      shares += c / w.prices[k];
      lotsSelic.push({ k, amount: c });
    }
    evolution.push({ month: w.months[k], invested, selic: selicValue, stock: shares * w.prices[k] });
  }

  // Fator acumulado da Selic de k+1 até n (para valor de cada lote)
  const growth = new Array(n + 1).fill(1);
  for (let k = n - 1; k >= 0; k--) growth[k] = growth[k + 1] * (1 + w.rates[k + 1]);

  let selicTax = 0;
  for (const lot of lotsSelic) {
    const gain = lot.amount * growth[lot.k] - lot.amount;
    if (applyTax && gain > 0) selicTax += gain * irRendaFixa((n - lot.k) * DAYS_PER_MONTH);
  }

  const stockGross = shares * w.prices[n];
  const stockGain = stockGross - invested;
  const stockTax = applyTax && stockGain > 0 ? stockGain * IR_ACOES : 0;

  const summarize = (gross, tax) => {
    const net = gross - tax;
    return {
      invested,
      gross,
      grossGain: gross - invested,
      tax,
      net,
      netGain: net - invested,
      netReturnPct: invested > 0 ? (net / invested - 1) * 100 : 0,
    };
  };

  return {
    start: w.months[0],
    end: w.months[n],
    months: n,
    contributions: lotsSelic.length,
    selic: summarize(selicValue, selicTax),
    stock: summarize(stockGross, stockTax),
    evolution,
  };
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function fmtMonth(month) {
  const [y, m] = month.split('-');
  return `${MESES[Number(m) - 1]}/${y}`;
}

/** Converte "10.000,50", "10000.5", "R$ 1.234" em número. */
export function parseBRL(text) {
  let s = String(text ?? '').replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  const v = Number(s);
  return Number.isFinite(v) && v >= 0 ? v : NaN;
}
