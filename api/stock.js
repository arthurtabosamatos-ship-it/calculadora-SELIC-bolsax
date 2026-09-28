import { fetchStockMonthly, normalizeTicker } from './_lib/data.js';

// GET /api/stock?ticker=PETR4  -> { symbol, name, currency, series: [{ month, close, adjClose }] }
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const url = new URL(req.url, 'http://localhost');
  const symbol = normalizeTicker(url.searchParams.get('ticker'));
  if (!symbol) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Informe um ticker válido (ex.: PETR4, VALE3, BOVA11).' }));
  }
  try {
    const data = await fetchStockMonthly(symbol, 11);
    if (!data.series.length) throw Object.assign(new Error('Sem cotações para este ticker'), { status: 404 });
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.statusCode = 200;
    res.end(JSON.stringify({ ...data, source: 'Yahoo Finance' }));
  } catch (e) {
    res.statusCode = e.status || 502;
    res.end(JSON.stringify({ error: `Não foi possível obter cotações de ${symbol}: ${e.message}` }));
  }
}
