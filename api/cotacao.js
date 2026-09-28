// GET /api/cotacao?ticker=PETR4&anos=5
// Devolve fechamentos mensais ajustados (proventos incluídos) de uma ação da B3.
// Fonte: Yahoo Finance. Roda como Serverless Function na Vercel e no server.js local.

const ANOS_VALIDOS = [1, 2, 5, 10];

function enviar(res, status, corpo, cacheSeg = 0) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (cacheSeg) res.setHeader('Cache-Control', `s-maxage=${cacheSeg}, stale-while-revalidate=86400`);
  res.end(JSON.stringify(corpo));
}

function chaveMes(tsSegundos) {
  // Barras mensais do Yahoo para a B3 começam às 03:00 UTC do dia 1 (00:00 em Brasília).
  const d = new Date(tsSegundos * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let ticker = (url.searchParams.get('ticker') || '').trim().toUpperCase();
  const anos = Number(url.searchParams.get('anos') || 5);

  if (!/^[A-Z0-9^.\-]{3,15}$/.test(ticker)) {
    return enviar(res, 400, { erro: 'Código de ação inválido. Use, por exemplo, PETR4 ou BOVA11.' });
  }
  if (!ANOS_VALIDOS.includes(anos)) {
    return enviar(res, 400, { erro: 'Janela inválida. Use 1, 2, 5 ou 10 anos.' });
  }
  if (!ticker.includes('.') && !ticker.startsWith('^')) ticker += '.SA';

  const agora = new Date();
  const inicio = new Date(Date.UTC(agora.getUTCFullYear() - anos, agora.getUTCMonth(), 1));
  const period1 = Math.floor(inicio.getTime() / 1000) - 86400 * 3;
  const period2 = Math.floor(agora.getTime() / 1000);

  const fonte = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?period1=${period1}&period2=${period2}&interval=1mo&events=div,split&includeAdjustedClose=true`;

  try {
    const r = await fetch(fonte, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SelicVsAcao/1.0)' } });
    const dados = await r.json().catch(() => null);
    const resultado = dados?.chart?.result?.[0];

    if (!r.ok && r.status !== 404) {
      return enviar(res, 502, { erro: `O provedor de cotações recusou a consulta (HTTP ${r.status}). Tente de novo em instantes.` });
    }
    if (!resultado?.timestamp) {
      const motivo = dados?.chart?.error?.description;
      return enviar(res, 404, { erro: `Não encontramos cotações para ${ticker.replace('.SA', '')}.${motivo ? ' ' + motivo : ''}` });
    }

    const ts = resultado.timestamp;
    const ajustado = resultado.indicators?.adjclose?.[0]?.adjclose || [];
    const fechamento = resultado.indicators?.quote?.[0]?.close || [];

    // Um ponto por mês; se o Yahoo mandar duas barras no mesmo mês (dia corrente), fica a última.
    const porMes = new Map();
    ts.forEach((t, i) => {
      const preco = ajustado[i] ?? fechamento[i];
      if (preco == null || !isFinite(preco) || preco <= 0) return;
      porMes.set(chaveMes(t), { mes: chaveMes(t), preco: Number(preco.toFixed(6)), fechamento: fechamento[i] ?? null });
    });

    const mesInicial = chaveMes(inicio.getTime() / 1000);
    const serie = [...porMes.values()].filter(p => p.mes >= mesInicial).sort((a, b) => a.mes.localeCompare(b.mes));

    if (serie.length < 2) {
      return enviar(res, 404, { erro: `Histórico insuficiente para ${ticker.replace('.SA', '')} nesta janela.` });
    }

    const meta = resultado.meta || {};
    enviar(res, 200, {
      ticker: ticker.replace('.SA', ''),
      nome: meta.longName || meta.shortName || ticker.replace('.SA', ''),
      moeda: meta.currency || 'BRL',
      inicioCompleto: serie[0].mes === mesInicial,
      serie,
    }, 3600);
  } catch (e) {
    enviar(res, 502, { erro: 'Falha ao consultar o provedor de cotações. Tente de novo em instantes.' });
  }
}
