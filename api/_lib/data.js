// Busca e normaliza dados de mercado (executa apenas no servidor / função serverless).
// Arquivos em api/_lib não viram rotas na Vercel (prefixo "_").

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const pad = (n) => String(n).padStart(2, '0');
const fmtBR = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

/** Normaliza ticker: "petr4" -> "PETR4.SA"; mantém sufixos já informados (ex.: AAPL, ^BVSP, VALE3.SA). */
export function normalizeTicker(raw) {
  const t = String(raw || '').trim().toUpperCase();
  if (!t || !/^[\^A-Z0-9.\-]{1,15}$/.test(t)) return null;
  if (t.includes('.') || t.startsWith('^')) return t;
  // Padrão B3: 4 letras + 1-2 dígitos (PETR4, BOVA11, TAEE11...)
  if (/^[A-Z]{4}\d{1,2}F?$/.test(t)) return `${t.replace(/F$/, '')}.SA`;
  return t;
}

async function getJSON(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${new URL(url).host}`);
  return r.json();
}

/** Selic acumulada no mês (% a.m.) — BCB/SGS série 4390. Retorna [{ month: 'YYYY-MM', rate: 0.0101 }]. */
export async function fetchSelicMonthly(years = 11) {
  if (process.env.MOCK_DATA === '1') return mockSelic(years);
  const end = new Date();
  const start = new Date(end.getFullYear() - years, end.getMonth(), 1);
  const url =
    'https://api.bcb.gov.br/dados/serie/bcdata.sgs.4390/dados?formato=json' +
    `&dataInicial=${fmtBR(start)}&dataFinal=${fmtBR(end)}`;
  const rows = await getJSON(url);
  if (!Array.isArray(rows)) throw new Error('Resposta inesperada do Banco Central');
  return rows
    .map((r) => {
      const [, mm, yyyy] = String(r.data).split('/');
      return { month: `${yyyy}-${mm}`, rate: Number(String(r.valor).replace(',', '.')) / 100 };
    })
    .filter((r) => Number.isFinite(r.rate));
}

/** Cotações mensais (Yahoo Finance). Retorna fechamento e fechamento ajustado (proventos) por mês. */
export async function fetchStockMonthly(symbol, years = 11) {
  if (process.env.MOCK_DATA === '1') return mockStock(symbol, years);
  const range = years > 10 ? 'max' : `${years}y`;
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1mo&events=div%2Csplit`;
  let data;
  let lastErr;
  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    try {
      data = await getJSON(`https://${host}${path}`);
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!data) throw lastErr || new Error('Falha ao consultar cotações');

  const res = data?.chart?.result?.[0];
  if (!res || !res.timestamp) {
    const msg = data?.chart?.error?.description || 'Ticker não encontrado';
    const err = new Error(msg);
    err.status = 404;
    throw err;
  }
  const offset = Number(res.meta?.gmtoffset ?? -10800);
  const close = res.indicators?.quote?.[0]?.close || [];
  const adj = res.indicators?.adjclose?.[0]?.adjclose || close;

  const byMonth = new Map(); // mantém o último registro do mês (mês corrente parcial vem com a data do dia)
  res.timestamp.forEach((ts, i) => {
    const c = close[i];
    const a = adj[i];
    if (c == null || !Number.isFinite(c)) return;
    const d = new Date((ts + offset) * 1000);
    const month = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
    byMonth.set(month, { month, close: c, adjClose: Number.isFinite(a) ? a : c });
  });

  return {
    symbol: res.meta?.symbol || symbol,
    name: res.meta?.longName || res.meta?.shortName || symbol,
    currency: res.meta?.currency || 'BRL',
    series: [...byMonth.values()].sort((x, y) => x.month.localeCompare(y.month)),
  };
}

// ---------- Dados simulados (apenas para testes offline: MOCK_DATA=1) ----------
function monthsBack(years) {
  const out = [];
  const now = new Date();
  for (let i = years * 12; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }
  return out;
}
function mockSelic(years) {
  return monthsBack(years).map((month, i) => ({ month, rate: 0.006 + 0.004 * (0.5 + 0.5 * Math.sin(i / 14)) }));
}
function mockStock(symbol, years) {
  let seed = [...symbol].reduce((s, c) => s + c.charCodeAt(0), 0);
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  let p = 20;
  const series = monthsBack(years).map((month) => {
    p *= 1 + (rnd() - 0.47) * 0.16;
    return { month, close: +(p * 0.8).toFixed(2), adjClose: +p.toFixed(2) };
  });
  return { symbol, name: `${symbol} (dados simulados)`, currency: 'BRL', series, mock: true };
}
