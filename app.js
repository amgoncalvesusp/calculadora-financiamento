(function () {
  'use strict';

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

  function fmtCurrency(v) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function fmtPercent(v) {
    return (v * 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4
    }) + '%';
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

  function renderResults(data) {
    var html = '';
    var sistema = data.sistema;
    var isComp = sistema === 'comparar';

    if (isComp) {
      var rSAC = data.resultSAC;
      var rPrice = data.resultPrice;
      var cSAC = data.cetSAC;
      var cPrice = data.cetPrice;
      var diffTotal = Math.abs(rSAC.totalPaid - rPrice.totalPaid);
      var sacCheaper = rSAC.totalPaid <= rPrice.totalPaid;

      html += '<h2>Comparação SAC vs Price</h2>';
      html += '<div class="comparison">';
      html += '<div class="comp-col' + (sacCheaper ? ' cheaper' : '') + '">';
      html += '<h3>SAC <small>parcelas decrescentes</small></h3>';
      html += '<div class="comp-metrics">';
      html += compMetric('Valor Financiado', fmtCurrency(data.principal), 'Valor que o banco empresta para você (valor do bem menos a entrada)');
      html += compMetric('Custo Total', fmtCurrency(data.entrada + rSAC.totalPaid), 'Tudo que você vai pagar: entrada + todas as parcelas');
      html += compMetric('Total de Juros', fmtCurrency(rSAC.totalInterest), 'Quanto você paga a mais além do valor financiado');
      html += compMetric('1ª Parcela', fmtCurrency(rSAC.installments[0].payment), 'Valor da primeira prestação mensal');
      html += compMetric('Última Parcela', fmtCurrency(rSAC.installments[rSAC.installments.length - 1].payment), 'Valor da última prestação — no SAC é sempre menor que a primeira');
      html += compMetric('CET Mensal', fmtPercent(cSAC.monthly), 'Custo Efetivo Total mensal — taxa real incluindo juros + seguros + taxas');
      html += compMetric('CET Anual', fmtPercent(cSAC.annual), 'Custo Efetivo Total anual — é a CET mensal convertida para o ano');
      html += '</div>';
      if (sacCheaper) {
        html += '<div class="economy-badge">Mais econômico: economize ' + fmtCurrency(diffTotal) + '</div>';
      }
      html += '</div>';
      html += '<div class="comp-col' + (!sacCheaper ? ' cheaper' : '') + '">';
      html += '<h3>Price <small>parcelas fixas</small></h3>';
      html += '<div class="comp-metrics">';
      html += compMetric('Valor Financiado', fmtCurrency(data.principal), 'Valor que o banco empresta para você (valor do bem menos a entrada)');
      html += compMetric('Custo Total', fmtCurrency(data.entrada + rPrice.totalPaid), 'Tudo que você vai pagar: entrada + todas as parcelas');
      html += compMetric('Total de Juros', fmtCurrency(rPrice.totalInterest), 'Quanto você paga a mais além do valor financiado');
      html += compMetric('1ª Parcela', fmtCurrency(rPrice.installments[0].payment), 'Valor da primeira prestação mensal');
      html += compMetric('Última Parcela', fmtCurrency(rPrice.installments[rPrice.installments.length - 1].payment), 'No Price, todas as parcelas são iguais');
      html += compMetric('CET Mensal', fmtPercent(cPrice.monthly), 'Custo Efetivo Total mensal — taxa real incluindo juros + seguros + taxas');
      html += compMetric('CET Anual', fmtPercent(cPrice.annual), 'Custo Efetivo Total anual — é a CET mensal convertida para o ano');
      html += '</div>';
      if (!sacCheaper) {
        html += '<div class="economy-badge">Mais econômico: economize ' + fmtCurrency(diffTotal) + '</div>';
      }
      html += '</div>';
      html += '</div>';

      html += '<div class="table-tabs">';
      html += '<button class="tab active" data-tab="sac">Tabela SAC</button>';
      html += '<button class="tab" data-tab="price">Tabela Price</button>';
      html += '</div>';
      html += '<div class="table-content" id="table-sac">' + generateTable(rSAC.installments) + '</div>';
      html += '<div class="table-content hidden" id="table-price">' + generateTable(rPrice.installments) + '</div>';
    } else {
      var result = sistema === 'price' ? data.resultPrice : data.resultSAC;
      var cet = sistema === 'price' ? data.cetPrice : data.cetSAC;
      var sysLabel = sistema === 'price' ? 'Price (parcelas fixas)' : 'SAC (parcelas decrescentes)';

      html += '<h2>Resultado — ' + sysLabel + '</h2>';
      html += '<div class="summary-cards">';
      html += card('Valor Financiado', fmtCurrency(data.principal), '', 'Valor que o banco empresta para você (valor do bem menos a entrada)');
      html += card('Custo Total', fmtCurrency(data.entrada + result.totalPaid), '', 'Tudo que você vai pagar: entrada + todas as parcelas');
      html += card('Total de Juros', fmtCurrency(result.totalInterest), 'highlight-danger', 'Quanto você paga a mais além do valor financiado');
      html += card('1ª Parcela', fmtCurrency(result.installments[0].payment), '', 'Valor da primeira prestação mensal');
      html += card('Última Parcela', fmtCurrency(result.installments[result.installments.length - 1].payment), '', 'Valor da última prestação');
      html += card('CET Mensal', fmtPercent(cet.monthly), '', 'Custo Efetivo Total mensal — taxa real incluindo juros + seguros + taxas');
      html += card('CET Anual', fmtPercent(cet.annual), 'highlight-warning', 'Custo Efetivo Total anual — é a CET mensal convertida para o ano');
      html += '</div>';

      html += '<h3>Tabela de Amortização</h3>';
      html += '<div class="table-scroll">' + generateTable(result.installments) + '</div>';
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
      var meses = parseInt(document.getElementById('prazo').value, 10);
      var sistema = document.getElementById('sistema').value;

      var seguroMIP = getVal('seguro-mip');
      var seguroDFI = getVal('seguro-dfi');
      var taxaAdm = getVal('taxa-adm');
      var taxaAbertura = getVal('taxa-abertura');

      if (valorVista <= 0) { showError('Informe o valor do bem à vista.'); return; }
      if (entrada < 0) { showError('A entrada não pode ser negativa.'); return; }
      if (entrada >= valorVista) { showError('A entrada deve ser menor que o valor do bem.'); return; }
      if (taxa < 0) { showError('A taxa de juros não pode ser negativa.'); return; }
      if (meses < 1 || isNaN(meses)) { showError('Informe um prazo válido (mínimo 1 mês).'); return; }

      var principal = valorVista - entrada;
      var monthlyRate = periodo === 'annual' ? taxa / 12 : taxa;

      var resultPrice = null;
      var resultSAC = null;
      var cetPrice = null;
      var cetSAC = null;

      if (sistema === 'price' || sistema === 'comparar') {
        resultPrice = calcPrice(principal, monthlyRate, meses);
        var paymentsPrice = [];
        for (var k = 0; k < resultPrice.installments.length; k++) {
          paymentsPrice.push(resultPrice.installments[k].payment);
        }
        cetPrice = calcCET(principal, meses, paymentsPrice, seguroMIP, seguroDFI, taxaAdm, taxaAbertura);
      }

      if (sistema === 'sac' || sistema === 'comparar') {
        resultSAC = calcSAC(principal, monthlyRate, meses);
        var paymentsSAC = [];
        for (var k = 0; k < resultSAC.installments.length; k++) {
          paymentsSAC.push(resultSAC.installments[k].payment);
        }
        cetSAC = calcCET(principal, meses, paymentsSAC, seguroMIP, seguroDFI, taxaAdm, taxaAbertura);
      }

      renderResults({
        tipoBem: tipoBem,
        valorVista: valorVista,
        entrada: entrada,
        principal: principal,
        meses: meses,
        monthlyRate: monthlyRate,
        sistema: sistema,
        resultPrice: resultPrice,
        resultSAC: resultSAC,
        cetPrice: cetPrice,
        cetSAC: cetSAC
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
