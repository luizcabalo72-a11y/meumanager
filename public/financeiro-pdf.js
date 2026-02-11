/* =========================================================
   FINANCEIRO-PDF.JS - Meu Manager
   Gera PDF com:
   1) Fluxo de Caixa (Resumo)
   2) MovimentAções do mês
   3) Contas a Pagar
   4) Contas a Receber
   5) DRE (resumido)
========================================================= */

(function () {
  "use strict";

  /* ================= HELPERS ================= */
  const moneyBR = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const up = (s) => String(s || "").trim().toUpperCase();

  const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  const parseBRDate = (s) => {
    const t = String(s || "").trim();
    const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const dd = Number(m[1]), mm = Number(m[2]), yy = Number(m[3]);
    const d = new Date(yy, mm - 1, dd);
    if (d.getFullYear() !== yy || (d.getMonth() + 1) !== mm || d.getDate() !== dd) return null;
    return d;
  };

  const readLS = (key, def = []) => {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(def)); }
    catch { return def; }
  };

  const getEmpresaId = () => {
    try {
      if (window.getEmpresaId) return window.getEmpresaId();
      const sessao = JSON.parse(localStorage.getItem("ft_sessao") || "{}");
      return sessao.empresaId || "default";
    } catch {
      return "default";
    }
  };

  const keyAcc = (baseKey) => `acc_${getEmpresaId()}__${baseKey}`;

  const filtrarPeriodo = (lista, campoData, mes, ano) => {
    return (lista || []).filter(item => {
      const d = parseBRDate(item?.[campoData]);
      if (!d) return false;
      return d.getMonth() === mes && d.getFullYear() === ano;
    });
  };

  // tenta achar os selects de mês/ano automaticamente
  function getMesAnoDaTela() {
    // tente IDs comuns
    const elMes =
      document.getElementById("filtro-mes") ||
      document.getElementById("fin-mes") ||
      document.getElementById("financeiro-mes");

    const elAno =
      document.getElementById("filtro-ano") ||
      document.getElementById("fin-ano") ||
      document.getElementById("financeiro-ano");

    if (elMes && elAno) {
      const mes = parseInt(elMes.value);
      const ano = parseInt(elAno.value);
      return { mes, ano };
    }

    // fallback: tenta pegar 2 selects na ?rea superior
    const selects = Array.from(document.querySelectorAll("select"));
    if (selects.length >= 2) {
      const mes = parseInt(selects[0].value);
      const ano = parseInt(selects[1].value);
      if (Number.isFinite(mes) && Number.isFinite(ano)) return { mes, ano };
    }

    // fallback final
    const now = new Date();
    return { mes: now.getMonth(), ano: now.getFullYear() };
  }

  async function imageToDataURL(url) {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }

  /* =========================================================
     CONFIG DO LOGO
     - Melhor: coloque um arquivo "logo-meu-manager.png" na mesma pasta do HTML.
     - Depois mantenha aqui como est?.
  ========================================================= */
const LOGO_URL = "./meumanager-logo-completo.png";
// <-- troque se necessário

  /* ================= CORE PDF ================= */
  async function exportarFinanceiroPDF() {
    try {
      if (!window.jspdf || !window.jspdf.jsPDF) {
        alert("jsPDF NÃO carregou. Confira as libs no financeiro.html.");
        return;
      }

      const { mes, ano } = getMesAnoDaTela();
      const periodoTxt = `${MESES[mes]} / ${ano}`;

      // dados do sistema (ajuste se suas chaves forem diferentes)
      const vendas = readLS(keyAcc("vendas"), []);
      const compras = readLS(keyAcc("compras"), []);
      const contasPagar = readLS(keyAcc("contas_pagar"), []);
      const contasReceber = readLS(keyAcc("contas_receber"), []);

      // mês/ano
      const vendasMes = filtrarPeriodo(vendas, "data", mes, ano).filter(v => up(v.status) === "CONCL");
      const comprasMes = filtrarPeriodo(compras, "data", mes, ano).filter(c => up(c.status) === "CONCL");

      const pagarMes = contasPagar.filter(p => {
        const d = parseBRDate(p.dataPagamento || p.vencimento);
        return d && d.getMonth() === mes && d.getFullYear() === ano;
      });

      const receberMes = contasReceber.filter(r => {
        const d = parseBRDate(r.dataRecebimento || r.vencimento);
        return d && d.getMonth() === mes && d.getFullYear() === ano;
      });

      // fluxo (caixa)
      const entradasVendas = vendasMes.reduce((a, v) => {
        const valorTotal = Number(v.valorTot || (Number(v.valorUnit || 0) * Number(v.qtd || 1)));
        return a + valorTotal;
      }, 0);

      const entradasRecebidas = receberMes
        .filter(r => up(r.status) === "RECEBIDO")
        .reduce((a, r) => a + Number(r.valor || 0), 0);

      const entradasTotal = entradasVendas + entradasRecebidas;

      const saidasCompras = comprasMes.reduce((a, c) => a + Number(c.total || c.valor || 0), 0);

      const saidasPagas = pagarMes
        .filter(p => up(p.status) === "PAGO")
        .reduce((a, p) => a + Number(p.valor || 0), 0);

      const saidasTotal = saidasCompras + saidasPagas;

      const saldoMes = entradasTotal - saidasTotal;

      // DRE (resumido) - modo "competência" simples
      const cmv = vendasMes.reduce((a, v) => {
        const qtd = Number(v.qtd || 1);
        const cmvItem = Number(v.cmv || (Number(v.custoUnit || 0) * qtd));
        return a + cmvItem;
      }, 0);

      const despesasOper = vendasMes.reduce((a, v) => a + Number(v.frete || 0) + Number(v.outros || 0), 0);
      const despesasFixas = pagarMes
        .filter(p => up(p.status) === "PAGO")
        .reduce((a, p) => a + Number(p.valor || 0), 0);

      const receitaTotal = entradasVendas + entradasRecebidas;
      const lucroBruto = receitaTotal - cmv;
      const lucroLiquido = receitaTotal - cmv - despesasOper - despesasFixas;

      // cria PDF
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF("p", "mm", "a4");

      // logo
      let logoData = null;
      try { logoData = await imageToDataURL(LOGO_URL); } catch {}

      if (logoData) {
        // PNG/JPEG - se o seu logo for JPG, troque "PNG" por "JPEG"
        doc.addImage(logoData, "PNG", 14, 10, 18, 18);
      }

      // header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("Meu Manager - Financeiro", 36, 18);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Período: ${periodoTxt}`, 36, 24);
      doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 36, 29);

      // 1) Fluxo Resumo
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("1) Fluxo de Caixa (Resumo)", 14, 42);

      doc.autoTable({
        startY: 46,
        head: [["Indicador", "Valor"]],
        body: [
          ["Entradas (Vendas + Recebimentos)", moneyBR(entradasTotal)],
          ["Saídas (Compras + Pagamentos)", moneyBR(saidasTotal)],
          ["Saldo do mês", moneyBR(saldoMes)]
        ],
        styles: { fontSize: 10 },
        headStyles: { fillColor: [30, 41, 59] }
      });

      // 2) MovimentAções
      const mov = [];

      vendasMes.forEach(v => {
        mov.push([
          v.data || "",
          (v.descricao || `Venda ${v.numero || v.id || ""}`).trim(),
          "Vendas",
          "Entrada",
          moneyBR(Number(v.valorTot || (Number(v.valorUnit || 0) * Number(v.qtd || 1)))),
          v.canal || v.origem || ""
        ]);
      });

      comprasMes.forEach(c => {
        mov.push([
          c.data || "",
          (c.descricao || `Compra ${c.numero || c.id || ""}`).trim(),
          "Estoque",
          "Saída",
          moneyBR(-Number(c.total || c.valor || 0)),
          c.fornecedor || c.origem || ""
        ]);
      });

      pagarMes.filter(p => up(p.status) === "PAGO").forEach(p => {
        mov.push([
          p.dataPagamento || p.vencimento || "",
          p.descricao || p.nome || "Conta Paga",
          p.categoria || "Despesa",
          "Saída",
          moneyBR(-Number(p.valor || 0)),
          p.origem || ""
        ]);
      });

      receberMes.filter(r => up(r.status) === "RECEBIDO").forEach(r => {
        mov.push([
          r.dataRecebimento || r.vencimento || "",
          r.descricao || r.nome || "Conta Recebida",
          r.categoria || "Receita",
          "Entrada",
          moneyBR(Number(r.valor || 0)),
          r.origem || ""
        ]);
      });

      mov.sort((a, b) => {
        const da = parseBRDate(a[0])?.getTime() || 0;
        const db = parseBRDate(b[0])?.getTime() || 0;
        return da - db;
      });

      let y = doc.lastAutoTable.finalY + 10;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("2) MovimentAções do mês", 14, y);

      doc.autoTable({
        startY: y + 4,
        head: [["Data", "descrição", "Categoria", "Tipo", "Valor", "Origem"]],
        body: mov.length ? mov : [["-","Sem movimentAções","-","-","-","-"]],
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 41, 59] }
      });

      // 3) Contas a Pagar
      y = doc.lastAutoTable.finalY + 10;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("3) Contas a Pagar (no Período)", 14, y);

      const pagarTabela = pagarMes.map(p => ([
        p.vencimento || "",
        p.descricao || p.nome || "",
        p.categoria || "",
        p.status || "",
        moneyBR(Number(p.valor || 0)),
        p.dataPagamento || ""
      ]));

      doc.autoTable({
        startY: y + 4,
        head: [["Venc.", "descrição", "Categoria", "Status", "Valor", "Pagamento"]],
        body: pagarTabela.length ? pagarTabela : [["-","Sem contas a pagar","-","-","-","-"]],
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 41, 59] }
      });

      // 4) Contas a Receber
      y = doc.lastAutoTable.finalY + 10;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("4) Contas a Receber (no Período)", 14, y);

      const receberTabela = receberMes.map(r => ([
        r.vencimento || "",
        r.descricao || r.nome || "",
        r.categoria || "",
        r.status || "",
        moneyBR(Number(r.valor || 0)),
        r.dataRecebimento || ""
      ]));

      doc.autoTable({
        startY: y + 4,
        head: [["Venc.", "descrição", "Categoria", "Status", "Valor", "Recebimento"]],
        body: receberTabela.length ? receberTabela : [["-","Sem contas a receber","-","-","-","-"]],
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 41, 59] }
      });

      // 5) DRE Resumido
      y = doc.lastAutoTable.finalY + 10;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("5) DRE (resumido)", 14, y);

      doc.autoTable({
        startY: y + 4,
        head: [["Linha", "Valor"]],
        body: [
          ["Receitas (Vendas + Recebimentos)", moneyBR(receitaTotal)],
          ["CMV", moneyBR(cmv)],
          ["Lucro Bruto", moneyBR(lucroBruto)],
          ["Despesas Operacionais (Frete/Outros)", moneyBR(despesasOper)],
          ["Despesas Fixas (Contas pagas)", moneyBR(despesasFixas)],
          ["Lucro Líquido", moneyBR(lucroLiquido)]
        ],
        styles: { fontSize: 10 },
        headStyles: { fillColor: [30, 41, 59] }
      });

      // rodap? e paginação
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.text(`Meu Manager . Financeiro . ${periodoTxt}`, 14, 290);
        doc.text(`página ${i}/${pageCount}`, 180, 290);
      }

      doc.save(`financeiro-${periodoTxt.replace(/\s|\/+/g, "-")}.pdf`);
    } catch (e) {
      console.error(e);
      alert("Erro ao gerar PDF. Abra o console (F12) e me mande o erro.");
    }
  }

  /* ================= BIND DO botão ================= */
  function bindPDFButton() {
    const btn = document.getElementById("btn-financeiro-pdf");
    if (!btn) {
      console.warn("?? botão #btn-financeiro-pdf NÃO encontrado no HTML.");
      return;
    }
    btn.addEventListener("click", exportarFinanceiroPDF);
    console.log("? PDF do Financeiro pronto: botão ligado.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindPDFButton);
  } else {
    bindPDFButton();
  }

})();
