import { fetchSelicMonthly } from './_lib/data.js';

// GET /api/selic  -> { series: [{ month, rate }], source }
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const series = await fetchSelicMonthly(11);
    // Cache na CDN da Vercel por 12h (a série é mensal)
    res.setHeader('Cache-Control', 's-maxage=43200, stale-while-revalidate=86400');
    res.statusCode = 200;
    res.end(JSON.stringify({ series, source: 'Banco Central do Brasil — SGS série 4390', mock: process.env.MOCK_DATA === '1' }));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: `Não foi possível obter a Selic: ${e.message}` }));
  }
}
