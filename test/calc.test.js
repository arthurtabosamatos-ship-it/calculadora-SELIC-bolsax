import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignWindow, simulate, irRendaFixa, parseBRL, addMonths } from '../public/js/calc.js';
import { normalizeTicker } from '../api/_lib/data.js';

const months = (end, n) => Array.from({ length: n + 1 }, (_, k) => addMonths(end, k - n));

test('tabela regressiva de IR', () => {
  assert.equal(irRendaFixa(30), 0.225);
  assert.equal(irRendaFixa(6 * 30.4375), 0.2);
  assert.equal(irRendaFixa(12 * 30.4375), 0.175);
  assert.equal(irRendaFixa(24 * 30.4375), 0.15);
});

test('parseBRL aceita formatos comuns', () => {
  assert.equal(parseBRL('10.000,00'), 10000);
  assert.equal(parseBRL('R$ 1.234,56'), 1234.56);
  assert.equal(parseBRL('500'), 500);
  assert.equal(parseBRL('10000.5'), 10000.5);
  assert.equal(parseBRL('10.000'), 10000);
});

test('normalizeTicker', () => {
  assert.equal(normalizeTicker('petr4'), 'PETR4.SA');
  assert.equal(normalizeTicker('BOVA11'), 'BOVA11.SA');
  assert.equal(normalizeTicker('VALE3.SA'), 'VALE3.SA');
  assert.equal(normalizeTicker('AAPL'), 'AAPL');
  assert.equal(normalizeTicker('x;drop'), null);
});

test('Selic 1% a.m. por 1 ano, só aplicação inicial — confere com juros compostos', () => {
  const ms = months('2026-08', 12);
  const selic = ms.map((m) => ({ month: m, rate: 0.01 }));
  const stock = ms.map((m) => ({ month: m, close: 10, adjClose: 10 }));
  const w = alignWindow(selic, stock, 1);
  const r = simulate(w, { initial: 10000, monthly: 0, applyTax: true });
  const gross = 10000 * 1.01 ** 12;
  assert.ok(Math.abs(r.selic.gross - gross) < 1e-6);
  assert.ok(Math.abs(r.selic.tax - (gross - 10000) * 0.175) < 1e-6); // 12 meses -> 17,5%
  assert.equal(r.stock.gross, 10000); // preço constante
  assert.equal(r.stock.tax, 0);
});

test('aportes: total investido = inicial + aporte × (12·anos − 1)', () => {
  const ms = months('2026-08', 60);
  const selic = ms.map((m) => ({ month: m, rate: 0.008 }));
  const stock = ms.map((m, i) => ({ month: m, close: 10 + i, adjClose: 10 + i }));
  const r = simulate(alignWindow(selic, stock, 5), { initial: 10000, monthly: 500 });
  assert.equal(r.selic.invested, 10000 + 500 * 59);
  assert.equal(r.stock.invested, r.selic.invested);
  assert.equal(r.contributions, 60);
  assert.ok(r.stock.netGain > 0 && Math.abs(r.stock.tax - r.stock.grossGain * 0.15) < 1e-6);
});

test('prejuízo na ação não gera IR', () => {
  const ms = months('2026-08', 12);
  const selic = ms.map((m) => ({ month: m, rate: 0.01 }));
  const stock = ms.map((m, i) => ({ month: m, close: 20 - i, adjClose: 20 - i }));
  const r = simulate(alignWindow(selic, stock, 1), { initial: 10000, monthly: 500 });
  assert.ok(r.stock.netGain < 0);
  assert.equal(r.stock.tax, 0);
});

test('histórico insuficiente gera erro claro', () => {
  const ms = months('2026-08', 24);
  const selic = ms.map((m) => ({ month: m, rate: 0.01 }));
  const stock = ms.map((m) => ({ month: m, close: 10, adjClose: 10 }));
  assert.throws(() => alignWindow(selic, stock, 5), /Histórico insuficiente/);
});
