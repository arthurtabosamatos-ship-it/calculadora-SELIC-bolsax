# Selic × Ação

Comparador do rendimento **líquido** de um investimento na taxa Selic versus uma ação da B3, com aplicação inicial e aportes mensais, em janelas de 1, 2, 5 ou 10 anos.

## Como funciona

- **Front-end** estático (HTML, CSS e JavaScript puro) em `public/`, com gráfico em Chart.js (incluído em `public/vendor/`).
- **Funções serverless** em `api/` (rodam na Vercel) que buscam os dados e evitam bloqueios de CORS:
  - `GET /api/selic` — Selic acumulada no mês, Banco Central (SGS, série 4390).
  - `GET /api/stock?ticker=PETR4` — cotações mensais (fechamento e ajustado por proventos), Yahoo Finance.
- **Cálculo** em `public/js/calc.js`: juros compostos mês a mês, IR regressivo por aporte na Selic e 15% sobre o ganho na ação.

Sem dependências externas: não há `npm install` nem etapa de build.

## Rodar localmente

Requer Node.js 18 ou superior.

```bash
npm run dev          # dados reais -> http://localhost:3000
npm run dev:offline  # dados simulados, sem internet
npm test             # testes do motor de cálculo
```

## Premissas

- Aplicação inicial no primeiro mês da janela; um aporte por mês a partir do mês seguinte.
- Selic equivale a Tesouro Selic ou aplicação a 100% da Selic; custódia e IOF não considerados.
- Ação com proventos reinvestidos (preço ajustado), opcional; corretagem e isenção de R$ 20 mil/mês não consideradas.
- Ferramenta educativa, não é recomendação de investimento.

## Estrutura

```
api/
  _lib/data.js    busca e normalização (BCB + Yahoo)
  selic.js        rota /api/selic
  stock.js        rota /api/stock
public/
  index.html
  css/styles.css
  js/app.js       interface
  js/calc.js      motor de cálculo
  vendor/         Chart.js
test/             testes (node --test)
server.js         servidor local
vercel.json       configuração da Vercel
```
