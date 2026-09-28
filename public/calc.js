// Motor de simulação: aplicação inicial + aportes mensais em Selic e em uma ação.
// Convenção: cada aporte é feito no fechamento do mês i; o saldo final é medido no
// último mês disponível. A Selic do mês i remunera o saldo que já estava aplicado.

// Tabela regressiva de IR para renda fixa (Tesouro Selic, CDBs).
export function aliquotaRendaFixa(dias) {
  if (dias <= 180) return 0.225;
  if (dias <= 360) return 0.20;
  if (dias <= 720) return 0.175;
  return 0.15;
}

export const ALIQUOTA_ACOES = 0.15; // ganho de capital em operações comuns

export function simular({ precos, selic, inicial, aporte, considerarIR = true }) {
  if (!precos?.length) throw new Error('Sem cotações para simular.');
  const taxas = new Map(selic.map(s => [s.mes, s.taxa]));
  const n = precos.length;

  const serie = [];
  const lotesSelic = []; // { valor, mesIndex }
  const mesesSemTaxa = [];
  let cotas = 0;
  let investido = 0;
  let ultimaTaxa = null;

  for (let i = 0; i < n; i++) {
    const { mes, preco } = precos[i];
    const valorAporte = i === 0 ? inicial : aporte;

    // 1) Remunera os lotes já aplicados pela Selic do mês.
    if (i > 0) {
      let taxa = taxas.get(mes);
      if (taxa == null) {
        taxa = ultimaTaxa ?? 0;
        mesesSemTaxa.push(mes);
      }
      ultimaTaxa = taxa;
      const fator = 1 + taxa / 100;
      for (const lote of lotesSelic) lote.valor *= fator;
    } else if (taxas.has(mes)) {
      ultimaTaxa = taxas.get(mes);
    }

    // 2) Faz o aporte do mês nos dois investimentos.
    if (valorAporte > 0) {
      lotesSelic.push({ valor: valorAporte, aplicado: valorAporte, mesIndex: i });
      cotas += valorAporte / preco;
      investido += valorAporte;
    }

    serie.push({
      mes,
      investido,
      selic: lotesSelic.reduce((s, l) => s + l.valor, 0),
      acao: cotas * preco,
    });
  }

  const final = serie[n - 1];

  // IR da Selic: cada aporte tem seu próprio prazo na tabela regressiva.
  let irSelic = 0;
  if (considerarIR) {
    for (const lote of lotesSelic) {
      const dias = Math.round((n - 1 - lote.mesIndex) * 30.4375);
      const ganho = lote.valor - lote.aplicado;
      if (ganho > 0) irSelic += ganho * aliquotaRendaFixa(dias);
    }
  }

  const ganhoAcao = final.acao - investido;
  const irAcao = considerarIR && ganhoAcao > 0 ? ganhoAcao * ALIQUOTA_ACOES : 0;

  const resumo = (bruto, ir) => {
    const liquido = bruto - ir;
    return {
      bruto,
      rendimentoBruto: bruto - investido,
      ir,
      liquido,
      rendimentoLiquido: liquido - investido,
      percentualLiquido: investido > 0 ? (liquido - investido) / investido : 0,
    };
  };

  return {
    investido,
    meses: n - 1,
    aportes: lotesSelic.length,
    selic: resumo(final.selic, irSelic),
    acao: resumo(final.acao, irAcao),
    serie,
    mesesSemTaxa,
  };
}
