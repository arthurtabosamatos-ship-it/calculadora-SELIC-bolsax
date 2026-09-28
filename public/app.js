import { simular } from './calc.js';

const ACOES = [
  ['PETR4', 'Petrobras PN'], ['VALE3', 'Vale ON'], ['ITUB4', 'Itaú Unibanco PN'],
  ['BBDC4', 'Bradesco PN'], ['BBAS3', 'Banco do Brasil ON'], ['WEGE3', 'WEG ON'],
  ['ABEV3', 'Ambev ON'], ['B3SA3', 'B3 ON'], ['ITSA4', 'Itaúsa PN'], ['BBSE3', 'BB Seguridade ON'],
  ['TAEE11', 'Taesa Unit'], ['EGIE3', 'Engie Brasil ON'], ['RENT3', 'Localiza ON'],
  ['SUZB3', 'Suzano ON'], ['PRIO3', 'PRIO ON'], ['MGLU3', 'Magazine Luiza ON'],
  ['BOVA11', 'ETF Ibovespa'], ['IVVB11', 'ETF S&P 500'],
];

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const $ = id => document.getElementById(id);

// ---------- Campos de moeda ----------
const paraCentavos = texto => Number(String(texto).replace(/\D/g, '') || 0);
const formatarCentavos = c => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lerReais = input => paraCentavos(input.value) / 100;

for (const id of ['inicial', 'aporte']) {
  const el = $(id);
  el.addEventListener('input', () => {
    el.value = formatarCentavos(paraCentavos(el.value));
    el.setSelectionRange(el.value.length, el.value.length);
  });
}

$('acoes').innerHTML = ACOES.map(([c, n]) => `<option value="${c}">${n}</option>`).join('');

// ---------- Busca de dados (com cache em memória) ----------
const cache = new Map();
async function obter(url) {
  if (cache.has(url)) return cache.get(url);
  const promessa = fetch(url).then(async r => {
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corpo.erro || `Erro ${r.status} ao buscar dados.`);
    return corpo;
  });
  cache.set(url, promessa);
  promessa.catch(() => cache.delete(url));
  return promessa;
}

// ---------- Gráfico ----------
let grafico;
function cor(nome) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}
function desenharGrafico(serie, nomeAcao) {
  const rotulos = serie.map(p => {
    const [a, m] = p.mes.split('-');
    return `${m}/${a.slice(2)}`;
  });
  const dados = {
    labels: rotulos,
    datasets: [
      { label: 'Selic', data: serie.map(p => p.selic), borderColor: cor('--selic'), backgroundColor: cor('--selic'), borderWidth: 2.5, pointRadius: 0, tension: 0.2 },
      { label: nomeAcao, data: serie.map(p => p.acao), borderColor: cor('--acao'), backgroundColor: cor('--acao'), borderWidth: 2.5, pointRadius: 0, tension: 0.2 },
      { label: 'Total investido', data: serie.map(p => p.investido), borderColor: cor('--tinta-suave'), borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, stepped: true },
    ],
  };
  if (grafico) grafico.destroy();
  if (!window.Chart) return;
  grafico = new Chart($('grafico'), {
    type: 'line',
    data: dados,
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      animation: matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 500 },
      plugins: {
        legend: { labels: { color: cor('--tinta'), usePointStyle: true, pointStyle: 'line', font: { family: 'Manrope', weight: 600 } } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${brl.format(c.parsed.y)}` } },
      },
      scales: {
        x: { ticks: { color: cor('--tinta-suave'), maxTicksLimit: 8 }, grid: { display: false } },
        y: {
          ticks: { color: cor('--tinta-suave'), callback: v => brl.format(v).replace(',00', '') },
          grid: { color: cor('--linha') },
        },
      },
    },
  });
}

// ---------- Renderização ----------
function preencher(id, valor, formato = brl) {
  const el = $(id);
  el.textContent = formato.format(valor);
  el.classList.toggle('negativo', valor < 0);
}

function mostrar(r, info, anos, considerarIR) {
  const nome = info.ticker;
  $('nomeAcao').textContent = nome;
  $('colAcao').textContent = nome;

  const diff = r.acao.liquido - r.selic.liquido;
  const periodo = anos === 1 ? 'em 1 ano' : `em ${anos} anos`;
  $('veredito').textContent = Math.abs(diff) < 0.5
    ? `${nome} e Selic empataram ${periodo}.`
    : diff > 0
      ? `${nome} rendeu ${brl.format(diff)} a mais que a Selic ${periodo}.`
      : `A Selic rendeu ${brl.format(-diff)} a mais que ${nome} ${periodo}.`;

  const total = Math.max(r.selic.liquido, 0) + Math.max(r.acao.liquido, 0) || 1;
  $('barraSelic').style.flexBasis = `${(Math.max(r.selic.liquido, 0) / total) * 100}%`;
  $('barraAcao').style.flexBasis = `${(Math.max(r.acao.liquido, 0) / total) * 100}%`;

  preencher('selicLiquido', r.selic.liquido);
  preencher('acaoLiquido', r.acao.liquido);
  $('tInvestido').innerHTML = `${brl.format(r.investido)}<small>inicial + ${r.aportes - 1} aportes mensais</small>`;
  preencher('tSelicBruto', r.selic.bruto);
  preencher('tAcaoBruto', r.acao.bruto);
  preencher('tSelicIR', -r.selic.ir);
  preencher('tAcaoIR', -r.acao.ir);
  $('tSelicIR').classList.remove('negativo');
  $('tAcaoIR').classList.remove('negativo');
  preencher('tSelicRend', r.selic.rendimentoLiquido);
  preencher('tAcaoRend', r.acao.rendimentoLiquido);
  preencher('tSelicPct', r.selic.percentualLiquido, pct);
  preencher('tAcaoPct', r.acao.percentualLiquido, pct);

  const notas = [
    `Período de ${r.serie[0].mes.split('-').reverse().join('/')} a ${r.serie.at(-1).mes.split('-').reverse().join('/')}, com aportes no fechamento de cada mês.`,
    'O preço da ação é ajustado por dividendos e desdobramentos, como se os proventos fossem reinvestidos.',
    considerarIR
      ? 'IR da Selic pela tabela regressiva (22,5% a 15%) para cada aporte; IR da ação de 15% sobre o ganho, sem considerar a isenção de vendas até R$ 20 mil por mês. Taxas de custódia e corretagem não entram.'
      : 'Valores sem desconto de imposto de renda.',
  ];
  if (!info.inicioCompleto) notas.push(`${nome} não tem histórico completo nesta janela; a simulação começa no primeiro mês disponível.`);
  if (r.mesesSemTaxa.length) notas.push(`Selic ainda não publicada para ${r.mesesSemTaxa.join(', ')}; usamos a última taxa conhecida.`);
  $('notas').textContent = notas.join(' ');

  desenharGrafico(r.serie, nome);
}

function estado(texto, erro = false) {
  const el = $('estado');
  el.textContent = texto;
  el.classList.toggle('erro', erro);
  el.hidden = !texto;
}

// ---------- Fluxo principal ----------
async function comparar(evento) {
  evento?.preventDefault();
  const ticker = $('ticker').value.trim().toUpperCase();
  const anos = Number(document.querySelector('input[name="anos"]:checked').value);
  const inicial = lerReais($('inicial'));
  const aporte = lerReais($('aporte'));
  const considerarIR = $('ir').checked;

  if (!ticker) return estado('Informe o código de uma ação.', true);
  if (inicial <= 0 && aporte <= 0) return estado('Informe uma aplicação inicial ou um aporte mensal maior que zero.', true);

  const botao = $('botao');
  botao.disabled = true;
  botao.textContent = 'Comparando…';
  estado(`Buscando cotações de ${ticker} e a Selic…`);

  try {
    const [info, selic] = await Promise.all([
      obter(`/api/cotacao?ticker=${encodeURIComponent(ticker)}&anos=${anos}`),
      obter(`/api/selic?anos=${anos}`),
    ]);
    const r = simular({ precos: info.serie, selic: selic.serie, inicial, aporte, considerarIR });
    estado('');
    $('conteudo').hidden = false;
    mostrar(r, info, anos, considerarIR);
  } catch (e) {
    $('conteudo').hidden = true;
    estado(e.message, true);
  } finally {
    botao.disabled = false;
    botao.textContent = 'Comparar';
  }
}

$('form').addEventListener('submit', comparar);
document.querySelectorAll('input[name="anos"], #ir').forEach(el =>
  el.addEventListener('change', () => { if (!$('conteudo').hidden) comparar(); }));

comparar();
