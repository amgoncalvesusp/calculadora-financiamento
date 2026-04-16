(function () {
  'use strict';

  // Taxas médias de mercado (% ao mês) — referência Brasil 2026
  // Fontes: BCB (séries de taxas por instituição), Caixa (SBPE/MCMV),
  // agregadores de taxas (idinheiro, Creditas, calculafinanciamento).
  var MARKET_RATES = {
    imovel: { min: 0.80, avg: 0.95, max: 1.15, label: 'imóvel (SBPE)' },
    carro:  { min: 1.20, avg: 1.93, max: 2.80, label: 'carro (CDC)' },
    moto:   { min: 1.50, avg: 2.40, max: 3.50, label: 'moto (CDC)' },
    outro:  { min: 1.80, avg: 3.50, max: 6.00, label: 'crédito pessoal' }
  };

  // Dado P, n e pmt, acha a taxa mensal i que satisfaz a fórmula PMT do Price.
  // Usa bisseção (garantida a convergir, função monótona em i > 0).
  function calcImpliedRate(P, n, pmt) {
    if (!isFinite(P) || !isFinite(n) || !isFinite(pmt)) return -1;
    if (P <= 0 || n < 1 || pmt <= 0) return -1;
    if (pmt * n <= P) return -1; // soma das parcelas <= principal: impossível com juros ≥ 0
    if (Math.abs(pmt - P / n) < 1e-9) return 0; // sem juros

    var lo = 0;
    var hi = 2; // 200% ao mês — teto seguro; nenhum financiamento real passa disso
    var eps = 1e-10;

    for (var iter = 0; iter < 200; iter++) {
      var mid = (lo + hi) / 2;
      if (mid === 0) { lo = eps; continue; }
      var factor = Math.pow(1 + mid, n);
      var pmtCalc = P * mid * factor / (factor - 1);

      if (!isFinite(pmtCalc)) { hi = mid; continue; }
      if (Math.abs(pmtCalc - pmt) < eps) return mid;
      if (pmtCalc > pmt) hi = mid;
      else lo = mid;
      if (hi - lo < 1e-12) break;
    }
    return (lo + hi) / 2;
  }

  function analyzeRate(monthlyRate, tipoBem) {
    var ref = MARKET_RATES[tipoBem] || MARKET_RATES.outro;
    var ratePct = monthlyRate * 100;
    var level, label, icon, message, advice;

    if (ratePct < ref.min) {
      level = 'excellent';
      icon = '\u2713 \u00d3TIMA';
      label = 'Taxa excelente — abaixo da média de mercado';
      message = 'A taxa proposta está <strong>abaixo da faixa típica</strong> para financiamento de ' + ref.label + '. Se não há pegadinhas em seguros, CET ou outras cobranças, é uma boa oferta.';
      advice = 'Verifique o CET (Custo Efetivo Total) no contrato para confirmar que não há taxas escondidas que anulem o benefício.';
    } else if (ratePct <= ref.avg) {
      level = 'good';
      icon = '\u2713 NA M\u00c9DIA';
      label = 'Taxa dentro da média de mercado';
      message = 'A taxa está <strong>alinhada com a média</strong> praticada para ' + ref.label + '. É uma proposta razoável, mas ainda vale comparar com outros bancos.';
      advice = 'Peça simulações em pelo menos 3 bancos antes de fechar. Uma diferença de 0,2% ao mês pode representar milhares de reais no total.';
    } else if (ratePct <= ref.max) {
      level = 'high';
      icon = '\u26a0 ALTA';
      label = 'ATENÇÃO: taxa acima da média';
      message = 'A taxa proposta está <strong>acima da média</strong> para ' + ref.label + '. Você provavelmente encontra condições melhores em outras instituições.';
      advice = 'Antes de assinar, peça propostas em bancos grandes (Caixa, BB, Itaú, Bradesco, Santander) e em plataformas digitais. Use esta calculadora para comparar o custo total.';
    } else {
      level = 'abusive';
      icon = '\u2718 ABUSIVA';
      label = 'TAXA ABUSIVA — NÃO ACEITE';
      message = 'A taxa proposta é <strong>muito acima</strong> do praticado no mercado para ' + ref.label + '. Isso caracteriza uma oferta predatória — você pagaria muito mais que o necessário.';
      advice = 'NÃO assine este contrato. Procure bancos tradicionais, cooperativas de crédito ou plataformas como Creditas, Nubank, PicPay. Se já assinou, é possível contestar a taxa na Justiça alegando juros abusivos.';
    }

    return {
      rate: monthlyRate,
      ratePct: ratePct,
      annualPct: (Math.pow(1 + monthlyRate, 12) - 1) * 100,
      level: level,
      icon: icon,
      label: label,
      message: message,
      advice: advice,
      reference: ref
    };
  }

  function calcPrice(P, i, n) {
    var installments = [];
    var balance = P;
    var totalInterest = 0;

    if (i === 0) {
      var payment = P / n;
      for (var k = 1; k <= n; k++) {
        balance -= payment;
        installments.push({
          month: k,
          payment: payment,
          amortization: payment,
          interest: 0,
          balance: Math.max(0, balance)
        });
      }
      return { installments: installments, totalPaid: P, totalInterest: 0 };
    }

    var pmt = P * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);

    for (var k = 1; k <= n; k++) {
      var interest = balance * i;
      var amort = pmt - interest;
      balance -= amort;
      totalInterest += interest;
      installments.push({
        month: k,
        payment: pmt,
        amortization: amort,
        interest: interest,
        balance: Math.max(0, balance)
      });
    }

    return { installments: installments, totalPaid: P + totalInterest, totalInterest: totalInterest };
  }

  function calcSAC(P, i, n) {
    var amortization = P / n;
    var installments = [];
    var balance = P;
    var totalInterest = 0;

    for (var k = 1; k <= n; k++) {
      var interest = balance * i;
      var payment = amortization + interest;
      balance -= amortization;
      totalInterest += interest;
      installments.push({
        month: k,
        payment: payment,
        amortization: amortization,
        interest: interest,
        balance: Math.max(0, balance)
      });
    }

    return { installments: installments, totalPaid: P + totalInterest, totalInterest: totalInterest };
  }

  function calcPriceN(P, i, pmt) {
    if (i === 0) return Math.ceil(P / pmt);
    var firstInterest = P * i;
    if (pmt <= firstInterest) return -1;
    return Math.log(pmt / (pmt - P * i)) / Math.log(1 + i);
  }

  function calcSACN(P, i, firstPayment) {
    var firstInterest = P * i;
    if (firstPayment <= firstInterest) return -1;
    var amortization = firstPayment - firstInterest;
    return P / amortization;
  }

  function calcCET(P, n, payments, mip, dfi, adm, openingFee) {
    var netP = P - openingFee;
    if (netP <= 0) return { monthly: 0, annual: 0 };

    var flows = [netP];
    for (var t = 0; t < n; t++) {
      flows.push(-(payments[t] + mip + dfi + adm));
    }

    var rate = 0.01;
    for (var iter = 0; iter < 200; iter++) {
      var npv = 0;
      var dnpv = 0;
      for (var t = 0; t < flows.length; t++) {
        var factor = Math.pow(1 + rate, t);
        npv += flows[t] / factor;
        if (t > 0) {
          dnpv -= t * flows[t] / (factor * (1 + rate));
        }
      }
      if (Math.abs(dnpv) < 1e-15) break;
      var newRate = rate - npv / dnpv;
      if (!isFinite(newRate) || isNaN(newRate)) break;
      if (Math.abs(newRate - rate) < 1e-12) {
        rate = newRate;
        break;
      }
      rate = Math.max(0.00001, newRate);
    }

    return {
      monthly: rate,
      annual: Math.pow(1 + rate, 12) - 1
    };
  }

  function analyzeIncome(payment, renda) {
    if (!renda || renda <= 0) return null;
    var perc = payment / renda * 100;
    var level, label, message, recommendation;

    if (perc <= 20) {
      level = 'safe';
      label = 'Comprometimento baixo';
      message = 'A parcela cabe bem no seu orçamento. Está dentro da faixa recomendada.';
      recommendation = null;
    } else if (perc <= 30) {
      level = 'attention';
      label = 'Comprometimento moderado';
      message = 'A parcela está no limite recomendado. Cuidado para não ficar apertado se surgirem despesas extras.';
      recommendation = null;
    } else if (perc <= 50) {
      level = 'danger';
      label = 'ATENÇÃO: parcela compromete muito sua renda';
      message = '<strong>Mais de 30% da sua renda</strong> vai para a parcela. Isso pode comprometer seu padrão de vida e deixar pouco espaço para imprevistos como consertos, remédios ou emergências.';
      recommendation = {
        title: 'Recomendamos repensar este financiamento',
        items: [
          'Aumente a entrada para reduzir o valor financiado',
          'Considere um bem mais barato',
          'Aumente o prazo para reduzir a parcela (mas com cuidado: juros totais serão maiores)',
          'Avalie se sua renda é estável o suficiente para manter esse compromisso'
        ]
      };
    } else {
      level = 'critical';
      label = 'NÃO RECOMENDAMOS ESTE FINANCIAMENTO';
      message = '<strong>Mais da metade da sua renda</strong> iria para a parcela. Isso é <strong>insustentável</strong> e coloca sua saúde financeira em risco sério — um imprevisto simples pode te levar à inadimplência.';
      recommendation = {
        title: 'O que fazer ao invés disso',
        items: [
          'Aumente significativamente a entrada (guarde mais antes de comprar)',
          'Escolha um bem mais barato que caiba no seu orçamento',
          'Busque alternativas: consórcio, aluguel, compra à vista parcelada',
          'Espere: juntar reserva de emergência antes é mais seguro que se endividar agora'
        ]
      };
    }

    return {
      percent: perc,
      level: level,
      label: label,
      message: message,
      recommendation: recommendation
    };
  }

  function fmtCurrency(v) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function fmtPercent(v) {
    return (v * 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4
    }) + '%';
  }

  function fmtPercentSimple(v) {
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  }

  function getVal(id) {
    return parseFloat(document.getElementById(id).value) || 0;
  }

  function generateTable(installments) {
    var html = '<table><thead><tr>' +
      '<th>Mês</th>' +
      '<th><span class="th-label">Parcela</span><span class="th-hint">Valor que você paga todo mês</span></th>' +
      '<th><span class="th-label">Amortização</span><span class="th-hint">Parte que reduz a sua dívida</span></th>' +
      '<th><span class="th-label">Juros</span><span class="th-hint">Parte que vai para o banco</span></th>' +
      '<th><span class="th-label">Saldo Devedor</span><span class="th-hint">Quanto ainda falta pagar</span></th>' +
      '</tr></thead><tbody>';
    for (var k = 0; k < installments.length; k++) {
      var ins = installments[k];
      html += '<tr>' +
        '<td>' + ins.month + '</td>' +
        '<td>' + fmtCurrency(ins.payment) + '</td>' +
        '<td>' + fmtCurrency(ins.amortization) + '</td>' +
        '<td>' + fmtCurrency(ins.interest) + '</td>' +
        '<td>' + fmtCurrency(ins.balance) + '</td>' +
        '</tr>';
    }
    html += '</tbody></table>';
    return html;
  }

  function card(label, value, cls, hint) {
    return '<div class="card' + (cls ? ' ' + cls : '') + '">' +
      '<span class="card-label">' + label +
      (hint ? ' <span class="card-hint" title="' + hint + '">?</span>' : '') +
      '</span>' +
      '<span class="card-value">' + value + '</span>' +
      (hint ? '<span class="card-explain">' + hint + '</span>' : '') +
      '</div>';
  }

  function incomeAlert(analysis) {
    if (!analysis) return '';
    var cls = 'alert-' + analysis.level;
    var icon = '';
    if (analysis.level === 'safe') icon = '\u2713 SEGURO';
    else if (analysis.level === 'attention') icon = '\u26A0 ATEN\u00C7\u00C3O';
    else if (analysis.level === 'danger') icon = '\u26A0 ALTO RISCO';
    else if (analysis.level === 'critical') icon = '\u2718 N\u00C3O FA\u00C7A';

    var recommendationHtml = '';
    if (analysis.recommendation) {
      var itemsHtml = '';
      for (var i = 0; i < analysis.recommendation.items.length; i++) {
        itemsHtml += '<li>' + analysis.recommendation.items[i] + '</li>';
      }
      recommendationHtml =
        '<div class="alert-recommendation">' +
        '<span class="alert-recommendation-title">' + analysis.recommendation.title + '</span>' +
        '<ul>' + itemsHtml + '</ul>' +
        '</div>';
    }

    return '<div class="income-alert ' + cls + '">' +
      '<div class="alert-header">' +
      '<span class="alert-icon">' + icon + '</span>' +
      '<span class="alert-label">' + analysis.label + '</span>' +
      '<span class="alert-percent">' + fmtPercentSimple(analysis.percent) + ' da renda</span>' +
      '</div>' +
      '<p class="alert-message">' + analysis.message + '</p>' +
      recommendationHtml +
      '</div>';
  }

  function rateVerdict(analysis) {
    if (!analysis) return '';
    var cls = 'rate-verdict rate-' + analysis.level;
    var ref = analysis.reference;
    var ratePct = analysis.ratePct;

    // Posição na barra de referência: 0% = min, 100% = max; clampa fora
    var barPct = (ratePct - ref.min) / (ref.max - ref.min) * 100;
    if (barPct < 0) barPct = 0;
    if (barPct > 100) barPct = 100;

    var annualFmt = analysis.annualPct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var monthlyFmt = ratePct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
    var minFmt = ref.min.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var avgFmt = ref.avg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var maxFmt = ref.max.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    var outsideBar = ratePct > ref.max
      ? '<span class="rate-bar-over">Sua taxa está ' + ((ratePct / ref.max - 1) * 100).toFixed(0) + '% acima do teto de mercado</span>'
      : (ratePct < ref.min
        ? '<span class="rate-bar-under">Sua taxa está ' + ((1 - ratePct / ref.min) * 100).toFixed(0) + '% abaixo do piso de mercado</span>'
        : '');

    return '<div class="' + cls + '">' +
      '<div class="rate-verdict-header">' +
      '<span class="rate-verdict-icon">' + analysis.icon + '</span>' +
      '<div class="rate-verdict-labels">' +
      '<span class="rate-verdict-label">' + analysis.label + '</span>' +
      '<span class="rate-verdict-sub">Taxa descoberta na proposta</span>' +
      '</div>' +
      '<div class="rate-verdict-numbers">' +
      '<span class="rate-verdict-monthly">' + monthlyFmt + '% <small>a.m.</small></span>' +
      '<span class="rate-verdict-annual">' + annualFmt + '% <small>a.a.</small></span>' +
      '</div>' +
      '</div>' +
      '<p class="rate-verdict-message">' + analysis.message + '</p>' +
      '<div class="rate-bar-wrap">' +
      '<div class="rate-bar-title">Faixa de mercado para ' + ref.label + ' (% ao mês)</div>' +
      '<div class="rate-bar">' +
      '<span class="rate-bar-segment seg-low"></span>' +
      '<span class="rate-bar-segment seg-mid"></span>' +
      '<span class="rate-bar-segment seg-high"></span>' +
      '<span class="rate-bar-marker" style="left:' + barPct + '%"></span>' +
      '</div>' +
      '<div class="rate-bar-scale">' +
      '<span>' + minFmt + '% <small>mínimo</small></span>' +
      '<span>' + avgFmt + '% <small>média</small></span>' +
      '<span>' + maxFmt + '% <small>máximo</small></span>' +
      '</div>' +
      outsideBar +
      '</div>' +
      '<div class="rate-verdict-advice"><strong>O que fazer:</strong> ' + analysis.advice + '</div>' +
      '</div>';
  }

  function renderResults(data) {
    var html = '';
    var sistema = data.sistema;
    var isComp = sistema === 'comparar';
    var renda = data.renda;

    // Veredito da taxa descoberta (só aparece no modo "taxa")
    if (data.rateAnalysis) {
      html += rateVerdict(data.rateAnalysis);
    }

    if (isComp) {
      var rSAC = data.resultSAC;
      var rPrice = data.resultPrice;
      var cSAC = data.cetSAC;
      var cPrice = data.cetPrice;
      var diffTotal = Math.abs(rSAC.totalPaid - rPrice.totalPaid);
      var sacCheaper = rSAC.totalPaid <= rPrice.totalPaid;

      html += '<h2>Comparação SAC vs Price</h2>';
      if (renda > 0) {
        var analysisComp = analyzeIncome(rSAC.installments[0].payment, renda);
        html += incomeAlert(analysisComp);
      } else {
        html += '<div class="income-alert alert-attention"><div class="alert-header"><span class="alert-label">Informe sua renda mensal</span></div><p class="alert-message">Preencha o campo "Sua renda mensal" no formulário para descobrir se a parcela compromete muito seu orçamento. Acima de 30% da renda, alertamos sobre o risco.</p></div>';
      }
      html += '<div class="comparison">';
      html += '<div class="comp-col' + (sacCheaper ? ' cheaper' : '') + '">';
      html += '<h3>SAC <small>parcelas decrescentes</small></h3>';
      html += '<div class="comp-metrics">';
      html += compMetric('Valor Financiado', fmtCurrency(data.principal), 'Valor que o banco empresta para você (valor do bem menos a entrada)');
      html += compMetric('Prazo', data.mesesSAC + ' meses', 'Número de meses para quitar o financiamento');
      html += compMetric('Custo Total', fmtCurrency(data.entrada + rSAC.totalPaid), 'Tudo que você vai pagar: entrada + todas as parcelas');
      html += compMetric('Total de Juros', fmtCurrency(rSAC.totalInterest), 'Quanto você paga a mais além do valor financiado');
      html += compMetric('1ª Parcela', fmtCurrency(rSAC.installments[0].payment), 'Valor da primeira prestação mensal');
      html += compMetric('Última Parcela', fmtCurrency(rSAC.installments[rSAC.installments.length - 1].payment), 'Valor da última prestação — no SAC é sempre menor que a primeira');
      html += compMetric('CET Mensal', fmtPercent(cSAC.monthly), 'Custo Efetivo Total mensal — taxa real incluindo juros + seguros + taxas');
      html += compMetric('CET Anual', fmtPercent(cSAC.annual), 'Custo Efetivo Total anual — é a CET mensal convertida para o ano');
      if (renda > 0) {
        html += compMetric('Compromet. Renda', fmtPercentSimple(rSAC.installments[0].payment / renda * 100), 'Percentual da sua renda comprometido com a 1ª parcela');
      }
      html += '</div>';
      if (sacCheaper) {
        html += '<div class="economy-badge">Mais econômico: economize ' + fmtCurrency(diffTotal) + '</div>';
      }
      html += '</div>';
      html += '<div class="comp-col' + (!sacCheaper ? ' cheaper' : '') + '">';
      html += '<h3>Price <small>parcelas fixas</small></h3>';
      html += '<div class="comp-metrics">';
      html += compMetric('Valor Financiado', fmtCurrency(data.principal), 'Valor que o banco empresta para você (valor do bem menos a entrada)');
      html += compMetric('Prazo', data.mesesPrice + ' meses', 'Número de meses para quitar o financiamento');
      html += compMetric('Custo Total', fmtCurrency(data.entrada + rPrice.totalPaid), 'Tudo que você vai pagar: entrada + todas as parcelas');
      html += compMetric('Total de Juros', fmtCurrency(rPrice.totalInterest), 'Quanto você paga a mais além do valor financiado');
      html += compMetric('1ª Parcela', fmtCurrency(rPrice.installments[0].payment), 'Valor da primeira prestação mensal');
      html += compMetric('Última Parcela', fmtCurrency(rPrice.installments[rPrice.installments.length - 1].payment), 'No Price, todas as parcelas são iguais');
      html += compMetric('CET Mensal', fmtPercent(cPrice.monthly), 'Custo Efetivo Total mensal — taxa real incluindo juros + seguros + taxas');
      html += compMetric('CET Anual', fmtPercent(cPrice.annual), 'Custo Efetivo Total anual — é a CET mensal convertida para o ano');
      if (renda > 0) {
        html += compMetric('Compromet. Renda', fmtPercentSimple(rPrice.installments[0].payment / renda * 100), 'Percentual da sua renda comprometido com a parcela');
      }
      html += '</div>';
      if (!sacCheaper) {
        html += '<div class="economy-badge">Mais econômico: economize ' + fmtCurrency(diffTotal) + '</div>';
      }
      html += '</div>';
      html += '</div>';

      html += '<div class="amortization-section">';
      html += '<details class="amortization-details">';
      html += '<summary><span>Tabela de Amortiza\u00E7\u00E3o</span></summary>';
      html += '<div class="table-tabs">';
      html += '<button class="tab active" data-tab="sac">Tabela SAC</button>';
      html += '<button class="tab" data-tab="price">Tabela Price</button>';
      html += '</div>';
      html += '<div class="table-content" id="table-sac">' + generateTable(rSAC.installments) + '</div>';
      html += '<div class="table-content hidden" id="table-price">' + generateTable(rPrice.installments) + '</div>';
      html += '</details>';
      html += '</div>';
    } else {
      var result = sistema === 'price' ? data.resultPrice : data.resultSAC;
      var cet = sistema === 'price' ? data.cetPrice : data.cetSAC;
      var sysLabel = sistema === 'price' ? 'Price (parcelas fixas)' : 'SAC (parcelas decrescentes)';

      html += '<h2>Resultado — ' + sysLabel + '</h2>';

      if (renda > 0) {
        var analysisSingle = analyzeIncome(result.installments[0].payment, renda);
        html += incomeAlert(analysisSingle);
      } else {
        html += '<div class="income-alert alert-attention"><div class="alert-header"><span class="alert-label">Informe sua renda mensal</span></div><p class="alert-message">Preencha o campo "Sua renda mensal" no formulário para descobrir se a parcela compromete muito seu orçamento. Acima de 30% da renda, alertamos sobre o risco.</p></div>';
      }

      var prazoSingle = sistema === 'price' ? data.mesesPrice : data.mesesSAC;
      html += '<div class="summary-cards">';
      html += card('Valor Financiado', fmtCurrency(data.principal), '', 'Valor que o banco empresta para você (valor do bem menos a entrada)');
      html += card('Prazo', prazoSingle + ' meses', '', 'Número de meses para quitar o financiamento');
      html += card('Custo Total', fmtCurrency(data.entrada + result.totalPaid), '', 'Tudo que você vai pagar: entrada + todas as parcelas');
      html += card('Total de Juros', fmtCurrency(result.totalInterest), 'highlight-danger', 'Quanto você paga a mais além do valor financiado');
      html += card('1ª Parcela', fmtCurrency(result.installments[0].payment), '', 'Valor da primeira prestação mensal');
      html += card('Última Parcela', fmtCurrency(result.installments[result.installments.length - 1].payment), '', 'Valor da última prestação');
      html += card('CET Mensal', fmtPercent(cet.monthly), '', 'Custo Efetivo Total mensal — taxa real incluindo juros + seguros + taxas');
      html += card('CET Anual', fmtPercent(cet.annual), 'highlight-warning', 'Custo Efetivo Total anual — é a CET mensal convertida para o ano');
      if (renda > 0) {
        html += card('Compromet. Renda', fmtPercentSimple(result.installments[0].payment / renda * 100),
          result.installments[0].payment / renda > 0.3 ? 'highlight-danger' : 'highlight-success',
          'Percentual da sua renda que vai para a parcela');
      }
      html += '</div>';

      html += '<div class="amortization-section">';
      html += '<details class="amortization-details">';
      html += '<summary><span>Tabela de Amortiza\u00E7\u00E3o</span></summary>';
      html += '<div class="table-scroll">' + generateTable(result.installments) + '</div>';
      html += '</details>';
      html += '</div>';
    }

    html += '<p class="disclaimer">Esta simulação é apenas para fins educacionais. Consulte sempre as condições reais do seu banco ou financeira.</p>';

    document.getElementById('results').innerHTML = html;
    document.getElementById('results').classList.remove('hidden');
    document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function compMetric(label, value, hint) {
    return '<div class="comp-metric">' +
      '<span class="comp-metric-label">' + label +
      (hint ? ' <span class="comp-metric-hint" title="' + hint + '">?</span>' : '') +
      '</span>' +
      '<span class="comp-metric-value">' + value + '</span>' +
      (hint ? '<span class="comp-metric-explain">' + hint + '</span>' : '') +
      '</div>';
  }

  function showError(msg) {
    var el = document.getElementById('form-error');
    el.textContent = msg;
    el.classList.remove('hidden');
    el.scrollIntoView({ behavior: 'smooth' });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var prazoInput = document.getElementById('prazo');
    var parcelaInput = document.getElementById('parcela-desejada');
    var taxaInput = document.getElementById('taxa-juros');
    var btnPrazo = document.getElementById('btn-prazo');
    var btnParcela = document.getElementById('btn-parcela');
    var btnTaxa = document.getElementById('btn-taxa');
    var parcelaLabel = document.getElementById('parcela-label');
    var parcelaHint = document.getElementById('parcela-hint');
    var prazoHint = document.getElementById('prazo-hint');
    var modeHint = document.getElementById('mode-hint');

    parcelaInput.disabled = true;

    var MODE_HINTS = {
      prazo: 'Você informa o prazo que quer pagar, a calculadora mostra o valor das parcelas, total de juros e comprometimento de renda.',
      parcela: 'Você informa o valor da parcela que cabe no seu bolso, a calculadora mostra em quantos meses vai pagar e o total de juros.',
      taxa: 'O vendedor não te disse a taxa de juros? Informe a parcela proposta e o prazo, a calculadora descobre a taxa real e diz se é justa em relação ao mercado.'
    };

    function setCalcMode(mode) {
      [btnPrazo, btnParcela, btnTaxa].forEach(function (b) { b.classList.remove('active'); });

      if (mode === 'prazo') {
        btnPrazo.classList.add('active');
        prazoInput.removeAttribute('disabled');
        parcelaInput.setAttribute('disabled', 'disabled');
        parcelaInput.value = '';
        taxaInput.removeAttribute('disabled');
        parcelaLabel.textContent = 'Parcela que você pode pagar (R$)';
        parcelaHint.textContent = 'Informe o valor mensal que cabe no seu bolso e descubra o prazo necessário e quanto de juros vai pagar';
        prazoHint.textContent = 'Em quantos meses você vai pagar. Ex: 48 meses = 4 anos';
      } else if (mode === 'parcela') {
        btnParcela.classList.add('active');
        parcelaInput.removeAttribute('disabled');
        prazoInput.setAttribute('disabled', 'disabled');
        prazoInput.value = '';
        taxaInput.removeAttribute('disabled');
        parcelaLabel.textContent = 'Parcela que você pode pagar (R$)';
        parcelaHint.textContent = 'Informe o valor mensal que cabe no seu bolso e descubra o prazo necessário e quanto de juros vai pagar';
        prazoHint.textContent = 'Em quantos meses você vai pagar. Ex: 48 meses = 4 anos';
      } else {
        // mode === 'taxa' — descobrir a taxa a partir de parcela + prazo
        btnTaxa.classList.add('active');
        parcelaInput.removeAttribute('disabled');
        prazoInput.removeAttribute('disabled');
        taxaInput.setAttribute('disabled', 'disabled');
        taxaInput.value = '';
        parcelaLabel.textContent = 'Parcela proposta pelo vendedor (R$)';
        parcelaHint.textContent = 'Valor exato da parcela que o vendedor/banco está oferecendo. A calculadora vai descobrir a taxa real embutida nessa proposta.';
        prazoHint.textContent = 'Prazo proposto pelo vendedor em meses. Ex: 60 meses = 5 anos';
      }

      if (modeHint) modeHint.textContent = MODE_HINTS[mode];
    }

    btnPrazo.addEventListener('click', function (e) { e.preventDefault(); setCalcMode('prazo'); });
    btnParcela.addEventListener('click', function (e) { e.preventDefault(); setCalcMode('parcela'); });
    btnTaxa.addEventListener('click', function (e) { e.preventDefault(); setCalcMode('taxa'); });

    var form = document.getElementById('calc-form');

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var errorEl = document.getElementById('form-error');
      errorEl.classList.add('hidden');

      var tipoBem = document.getElementById('tipo-bem').value;
      var valorVista = getVal('valor-vista');
      var entrada = getVal('entrada');
      var taxa = getVal('taxa-juros') / 100;
      var periodo = document.querySelector('input[name="periodo-taxa"]:checked').value;
      var sistema = document.getElementById('sistema').value;
      var renda = getVal('renda-mensal');

      var seguroMIP = getVal('seguro-mip');
      var seguroDFI = getVal('seguro-dfi');
      var taxaAdm = getVal('taxa-adm');
      var taxaAbertura = getVal('taxa-abertura');

      if (valorVista <= 0) { showError('Informe o valor do bem à vista.'); return; }
      if (entrada < 0) { showError('A entrada não pode ser negativa.'); return; }
      if (entrada >= valorVista) { showError('A entrada deve ser menor que o valor do bem.'); return; }
      if (taxa < 0) { showError('A taxa de juros não pode ser negativa.'); return; }

      var principal = valorVista - entrada;
      var monthlyRate = periodo === 'annual' ? taxa / 12 : taxa;

      var mesesPrice, mesesSAC;
      var calcMode = btnTaxa.classList.contains('active') ? 'taxa'
        : btnParcela.classList.contains('active') ? 'parcela'
        : 'prazo';
      var rateAnalysis = null;

      if (calcMode === 'taxa') {
        // Descobre a taxa a partir de prazo + parcela proposta
        var prazoValT = parseInt(prazoInput.value, 10);
        var parcelaValT = parseFloat(parcelaInput.value) || 0;

        if (principal <= 0) { showError('O valor da entrada não pode ser igual ou maior que o valor do bem.'); return; }
        if (isNaN(prazoValT) || prazoValT < 1) { showError('Informe o prazo proposto em meses.'); return; }
        if (prazoValT > 420) { showError('Prazo máximo suportado: 420 meses (35 anos).'); return; }
        if (parcelaValT <= 0) { showError('Informe o valor da parcela proposta pelo vendedor.'); return; }
        if (parcelaValT * prazoValT < principal) {
          showError('A soma das parcelas (' + fmtCurrency(parcelaValT * prazoValT) + ') é menor que o valor financiado (' + fmtCurrency(principal) + '). Verifique se os valores estão corretos.');
          return;
        }

        var impliedRate = calcImpliedRate(principal, prazoValT, parcelaValT);
        if (impliedRate < 0 || !isFinite(impliedRate)) {
          showError('Não foi possível calcular a taxa com os valores informados. Verifique entrada, parcela e prazo.');
          return;
        }

        monthlyRate = impliedRate;
        rateAnalysis = analyzeRate(impliedRate, tipoBem);
        mesesPrice = mesesSAC = prazoValT;
      } else if (calcMode === 'parcela') {
        var parcelaVal = parseFloat(parcelaInput.value) || 0;
        if (parcelaVal <= 0) {
          showError('Informe o valor da parcela que você pode pagar.');
          return;
        }
        if (principal <= 0) {
          showError('O valor da entrada não pode ser igual ou maior que o valor do bem.');
          return;
        }
        if (monthlyRate <= 0) {
          showError('Informe a taxa de juros.');
          return;
        }
        var nPrice = calcPriceN(principal, monthlyRate, parcelaVal);
        var nSAC = calcSACN(principal, monthlyRate, parcelaVal);

        if (sistema === 'price' || sistema === 'comparar') {
          if (nPrice < 0 || !isFinite(nPrice)) {
            showError('A parcela informada é menor que os juros do primeiro mês (' + fmtCurrency(principal * monthlyRate) + '). Aumente a parcela ou a entrada.');
            return;
          }
        }
        if (sistema === 'sac' || sistema === 'comparar') {
          if (nSAC < 0 || !isFinite(nSAC)) {
            showError('A parcela informada é menor que os juros do primeiro mês (' + fmtCurrency(principal * monthlyRate) + '). Aumente a parcela ou a entrada.');
            return;
          }
        }

        mesesPrice = Math.ceil(nPrice);
        mesesSAC = Math.ceil(nSAC);

        if (mesesPrice > 420 || mesesSAC > 420) { showError('O prazo necessário ultrapassa 35 anos (420 meses). Aumente a parcela ou a entrada.'); return; }
      } else {
        var prazoVal = parseInt(prazoInput.value, 10);
        if (prazoVal < 1 || isNaN(prazoVal)) {
          showError('Informe o prazo em meses.');
          return;
        }
        mesesPrice = mesesSAC = prazoVal;
      }

      var resultPrice = null;
      var resultSAC = null;
      var cetPrice = null;
      var cetSAC = null;

      if (sistema === 'price' || sistema === 'comparar') {
        resultPrice = calcPrice(principal, monthlyRate, mesesPrice);
        var paymentsPrice = [];
        for (var k = 0; k < resultPrice.installments.length; k++) {
          paymentsPrice.push(resultPrice.installments[k].payment);
        }
        cetPrice = calcCET(principal, mesesPrice, paymentsPrice, seguroMIP, seguroDFI, taxaAdm, taxaAbertura);
      }

      if (sistema === 'sac' || sistema === 'comparar') {
        resultSAC = calcSAC(principal, monthlyRate, mesesSAC);
        var paymentsSAC = [];
        for (var k = 0; k < resultSAC.installments.length; k++) {
          paymentsSAC.push(resultSAC.installments[k].payment);
        }
        cetSAC = calcCET(principal, mesesSAC, paymentsSAC, seguroMIP, seguroDFI, taxaAdm, taxaAbertura);
      }

      renderResults({
        tipoBem: tipoBem,
        valorVista: valorVista,
        entrada: entrada,
        principal: principal,
        calcMode: calcMode,
        mesesPrice: mesesPrice,
        mesesSAC: mesesSAC,
        monthlyRate: monthlyRate,
        sistema: sistema,
        resultPrice: resultPrice,
        resultSAC: resultSAC,
        cetPrice: cetPrice,
        cetSAC: cetSAC,
        renda: renda,
        rateAnalysis: rateAnalysis
      });
    });

    document.getElementById('results').addEventListener('click', function (e) {
      if (e.target.matches('.table-tabs .tab')) {
        var tab = e.target;
        var tabs = tab.parentElement.querySelectorAll('.tab');
        for (var i = 0; i < tabs.length; i++) {
          tabs[i].classList.remove('active');
        }
        tab.classList.add('active');

        var contents = document.querySelectorAll('.table-content');
        for (var i = 0; i < contents.length; i++) {
          contents[i].classList.add('hidden');
        }
        document.getElementById('table-' + tab.dataset.tab).classList.remove('hidden');
      }
    });
  });
})();
