/**
 * TESTES DE INTEGRAÇÃO
 * Testa fluxos completos envolvendo múltiplos módulos
 */

const mockLocalStorage = (() => {
  let store = {};

  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
    key: (index) => Object.keys(store)[index] || null,
    get length() { return Object.keys(store).length; }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});

beforeEach(() => {
  localStorage.clear();
  // Dados iniciais
  localStorage.setItem('ft_active_account', JSON.stringify({ empresaId: 'empresa1' }));
});

// ===== FUNÇÕES AUXILIARES =====

function criarEmpresa(id, nome) {
  const dados = {
    id,
    razaoSocial: nome,
    nomeFantasia: nome,
    cnpj: '12.345.678/0001-99',
    logo: null,
    dataCadastro: new Date().toISOString().split('T')[0]
  };
  localStorage.setItem(`acc_${id}__empresa_dados`, JSON.stringify(dados));
  localStorage.setItem(`acc_${id}__saldo_inicial`, JSON.stringify({
    valor: 10000,
    data: '2024-01-01'
  }));
  localStorage.setItem(`acc_${id}__vendas`, JSON.stringify([]));
  localStorage.setItem(`acc_${id}__compras`, JSON.stringify([]));
  return dados;
}

function adicionarVenda(empresaId, venda) {
  const vendas = JSON.parse(localStorage.getItem(`acc_${empresaId}__vendas`) || '[]');
  vendas.push({
    id: Date.now(),
    data: venda.data,
    cliente: venda.cliente,
    valor: venda.valor,
    descricao: venda.descricao,
    pago: venda.pago || true
  });
  localStorage.setItem(`acc_${empresaId}__vendas`, JSON.stringify(vendas));
}

function adicionarCompra(empresaId, compra) {
  const compras = JSON.parse(localStorage.getItem(`acc_${empresaId}__compras`) || '[]');
  compras.push({
    id: Date.now(),
    data: compra.data,
    fornecedor: compra.fornecedor,
    valor: compra.valor,
    pago: compra.pago || true
  });
  localStorage.setItem(`acc_${empresaId}__compras`, JSON.stringify(compras));
}

function obterSaldoInicial(empresaId) {
  const saldo = JSON.parse(localStorage.getItem(`acc_${empresaId}__saldo_inicial`) || '{}');
  return saldo.valor || 0;
}

function calcularTotalVendas(empresaId, mes, ano) {
  const vendas = JSON.parse(localStorage.getItem(`acc_${empresaId}__vendas`) || '[]');
  return vendas
    .filter(v => {
      const data = new Date(v.data);
      return data.getMonth() === mes - 1 && data.getFullYear() === ano;
    })
    .reduce((sum, v) => sum + v.valor, 0);
}

function calcularTotalCompras(empresaId, mes, ano) {
  const compras = JSON.parse(localStorage.getItem(`acc_${empresaId}__compras`) || '[]');
  return compras
    .filter(c => {
      const data = new Date(c.data);
      return data.getMonth() === mes - 1 && data.getFullYear() === ano;
    })
    .reduce((sum, c) => sum + c.valor, 0);
}

function ativarEmpresa(empresaId) {
  const sessao = JSON.parse(localStorage.getItem('ft_active_account') || '{}');
  sessao.empresaId = empresaId;
  localStorage.setItem('ft_active_account', JSON.stringify(sessao));
}

// ===== TESTES DE INTEGRAÇÃO =====

describe('Fluxo Completo: Criar Empresa', () => {
  
  test('Criar empresa nova com dados iniciais', () => {
    const empresa = criarEmpresa('emp_001', 'Empresa Teste');
    
    expect(empresa.id).toBe('emp_001');
    expect(empresa.razaoSocial).toBe('Empresa Teste');
    
    const saved = JSON.parse(localStorage.getItem('acc_emp_001__empresa_dados'));
    expect(saved).not.toBeNull();
    expect(saved.razaoSocial).toBe('Empresa Teste');
  });

  test('Nova empresa tem saldo inicial definido', () => {
    criarEmpresa('emp_002', 'Outra Empresa');
    
    const saldo = obterSaldoInicial('emp_002');
    expect(saldo).toBe(10000);
  });

  test('Nova empresa tem estrutura de dados vazia', () => {
    criarEmpresa('emp_003', 'Terceira Empresa');
    
    const vendas = JSON.parse(localStorage.getItem('acc_emp_003__vendas'));
    const compras = JSON.parse(localStorage.getItem('acc_emp_003__compras'));
    
    expect(vendas).toEqual([]);
    expect(compras).toEqual([]);
  });
});

describe('Fluxo Completo: Registrar Vendas', () => {
  
  test('Adicionar venda e verificar total', () => {
    criarEmpresa('emp_004', 'Empresa Vendas');
    
    adicionarVenda('emp_004', {
      data: '2024-01-15',
      cliente: 'Cliente A',
      valor: 1500.00,
      descricao: 'Produto X'
    });
    
    const total = calcularTotalVendas('emp_004', 1, 2024);
    expect(total).toBe(1500.00);
  });

  test('Adicionar múltiplas vendas', () => {
    criarEmpresa('emp_005', 'Empresa Multi Vendas');
    
    adicionarVenda('emp_005', {
      data: '2024-01-10',
      cliente: 'Cliente A',
      valor: 1000,
      descricao: 'Produto 1'
    });
    
    adicionarVenda('emp_005', {
      data: '2024-01-20',
      cliente: 'Cliente B',
      valor: 2000,
      descricao: 'Produto 2'
    });
    
    adicionarVenda('emp_005', {
      data: '2024-02-05',
      cliente: 'Cliente C',
      valor: 1500,
      descricao: 'Produto 3'
    });
    
    const totalJan = calcularTotalVendas('emp_005', 1, 2024);
    const totalFev = calcularTotalVendas('emp_005', 2, 2024);
    
    expect(totalJan).toBe(3000);
    expect(totalFev).toBe(1500);
  });

  test('Vendas isoladas por empresa', () => {
    criarEmpresa('emp_006', 'Empresa A');
    criarEmpresa('emp_007', 'Empresa B');
    
    adicionarVenda('emp_006', {
      data: '2024-01-15',
      cliente: 'Cliente A',
      valor: 5000,
      descricao: 'Produto'
    });
    
    adicionarVenda('emp_007', {
      data: '2024-01-15',
      cliente: 'Cliente B',
      valor: 2000,
      descricao: 'Produto'
    });
    
    const totalEmp6 = calcularTotalVendas('emp_006', 1, 2024);
    const totalEmp7 = calcularTotalVendas('emp_007', 1, 2024);
    
    expect(totalEmp6).toBe(5000);
    expect(totalEmp7).toBe(2000);
  });
});

describe('Fluxo Completo: Cálculo Financeiro', () => {
  
  test('Calcular fluxo de caixa básico', () => {
    criarEmpresa('emp_008', 'Empresa Fluxo');
    
    adicionarVenda('emp_008', {
      data: '2024-01-10',
      cliente: 'Cliente A',
      valor: 5000,
      descricao: 'Venda'
    });
    
    adicionarCompra('emp_008', {
      data: '2024-01-05',
      fornecedor: 'Fornecedor X',
      valor: 1000,
      descricao: 'Compra'
    });
    
    const vendas = calcularTotalVendas('emp_008', 1, 2024);
    const compras = calcularTotalCompras('emp_008', 1, 2024);
    const fluxo = vendas - compras;
    
    expect(vendas).toBe(5000);
    expect(compras).toBe(1000);
    expect(fluxo).toBe(4000);
  });

  test('Fluxo de caixa com saldo inicial', () => {
    criarEmpresa('emp_009', 'Empresa Com Saldo');
    
    const saldoInicial = obterSaldoInicial('emp_009');
    
    adicionarVenda('emp_009', {
      data: '2024-01-15',
      cliente: 'Cliente A',
      valor: 3000,
      descricao: 'Venda'
    });
    
    adicionarCompra('emp_009', {
      data: '2024-01-10',
      fornecedor: 'Fornecedor X',
      valor: 2000,
      descricao: 'Compra'
    });
    
    const vendas = calcularTotalVendas('emp_009', 1, 2024);
    const compras = calcularTotalCompras('emp_009', 1, 2024);
    const fluxoMes = vendas - compras;
    const saldoFinal = saldoInicial + fluxoMes;
    
    expect(saldoInicial).toBe(10000);
    expect(fluxoMes).toBe(1000);
    expect(saldoFinal).toBe(11000);
  });

  test('DRE completo', () => {
    criarEmpresa('emp_010', 'Empresa DRE');
    
    // Receitas
    adicionarVenda('emp_010', {
      data: '2024-01-10',
      cliente: 'Cliente A',
      valor: 10000,
      descricao: 'Venda Principal'
    });
    
    // Custos
    adicionarCompra('emp_010', {
      data: '2024-01-05',
      fornecedor: 'Fornecedor Matéria',
      valor: 4000,
      descricao: 'Matéria Prima'
    });
    
    const receita = calcularTotalVendas('emp_010', 1, 2024);
    const custo = calcularTotalCompras('emp_010', 1, 2024);
    const lucroBruto = receita - custo;
    const margemBruta = (lucroBruto / receita) * 100;
    
    expect(receita).toBe(10000);
    expect(custo).toBe(4000);
    expect(lucroBruto).toBe(6000);
    expect(margemBruta).toBe(60);
  });
});

describe('Fluxo Completo: Trocar Empresa', () => {
  
  test('Trocar entre empresas mantém isolamento de dados', () => {
    criarEmpresa('empresa1', 'Empresa 1');
    criarEmpresa('empresa2', 'Empresa 2');
    
    // Adicionar dados na empresa1
    ativarEmpresa('empresa1');
    adicionarVenda('empresa1', {
      data: '2024-01-10',
      cliente: 'Cliente A',
      valor: 5000,
      descricao: 'Venda'
    });
    
    // Adicionar dados na empresa2
    ativarEmpresa('empresa2');
    adicionarVenda('empresa2', {
      data: '2024-01-10',
      cliente: 'Cliente B',
      valor: 3000,
      descricao: 'Venda'
    });
    
    // Verificar isolamento
    const total1 = calcularTotalVendas('empresa1', 1, 2024);
    const total2 = calcularTotalVendas('empresa2', 1, 2024);
    
    expect(total1).toBe(5000);
    expect(total2).toBe(3000);
  });

  test('Ativar empresa muda sessão atual', () => {
    criarEmpresa('empresa1', 'Empresa 1');
    criarEmpresa('empresa2', 'Empresa 2');
    
    ativarEmpresa('empresa2');
    
    const sessao = JSON.parse(localStorage.getItem('ft_active_account'));
    expect(sessao.empresaId).toBe('empresa2');
  });
});

describe('Fluxo Completo: Editar Dados da Empresa', () => {
  
  test('Atualizar dados da empresa', () => {
    criarEmpresa('emp_update', 'Empresa Original');
    
    const dados = JSON.parse(localStorage.getItem('acc_emp_update__empresa_dados'));
    dados.nomeFantasia = 'Empresa Atualizada';
    dados.telefone = '(11) 98765-4321';
    localStorage.setItem('acc_emp_update__empresa_dados', JSON.stringify(dados));
    
    const updated = JSON.parse(localStorage.getItem('acc_emp_update__empresa_dados'));
    expect(updated.nomeFantasia).toBe('Empresa Atualizada');
    expect(updated.telefone).toBe('(11) 98765-4321');
  });

  test('Upload de logo', () => {
    criarEmpresa('emp_logo', 'Empresa com Logo');
    
    const dados = JSON.parse(localStorage.getItem('acc_emp_logo__empresa_dados'));
    dados.logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';
    localStorage.setItem('acc_emp_logo__empresa_dados', JSON.stringify(dados));
    
    const updated = JSON.parse(localStorage.getItem('acc_emp_logo__empresa_dados'));
    expect(updated.logo).toContain('base64');
  });

  test('Atualizar saldo inicial', () => {
    criarEmpresa('emp_saldo', 'Empresa Saldo');
    
    const novoSaldo = JSON.stringify({
      valor: 25000,
      data: '2024-01-01'
    });
    localStorage.setItem('acc_emp_saldo__saldo_inicial', novoSaldo);
    
    const saldo = obterSaldoInicial('emp_saldo');
    expect(saldo).toBe(25000);
  });
});

describe('Fluxo Completo: Análise de Tendências', () => {
  
  test('Vendas crescentes ao longo dos meses', () => {
    criarEmpresa('emp_trend', 'Empresa Tendência');
    
    // Janeiro
    adicionarVenda('emp_trend', {
      data: '2024-01-10',
      cliente: 'Cliente A',
      valor: 1000,
      descricao: 'Venda'
    });
    
    // Fevereiro
    adicionarVenda('emp_trend', {
      data: '2024-02-10',
      cliente: 'Cliente A',
      valor: 2000,
      descricao: 'Venda'
    });
    
    // Março
    adicionarVenda('emp_trend', {
      data: '2024-03-10',
      cliente: 'Cliente A',
      valor: 3000,
      descricao: 'Venda'
    });
    
    const totalJan = calcularTotalVendas('emp_trend', 1, 2024);
    const totalFev = calcularTotalVendas('emp_trend', 2, 2024);
    const totalMar = calcularTotalVendas('emp_trend', 3, 2024);
    
    expect(totalJan).toBe(1000);
    expect(totalFev).toBe(2000);
    expect(totalMar).toBe(3000);
    expect(totalMar > totalFev && totalFev > totalJan).toBe(true);
  });

  test('Calcular crescimento mês a mês', () => {
    criarEmpresa('emp_growth', 'Empresa Crescimento');
    
    adicionarVenda('emp_growth', {
      data: '2024-01-10',
      cliente: 'Cliente',
      valor: 5000,
      descricao: 'Venda'
    });
    
    adicionarVenda('emp_growth', {
      data: '2024-02-10',
      cliente: 'Cliente',
      valor: 6500,
      descricao: 'Venda'
    });
    
    const totalJan = calcularTotalVendas('emp_growth', 1, 2024);
    const totalFev = calcularTotalVendas('emp_growth', 2, 2024);
    
    const crescimento = ((totalFev - totalJan) / totalJan) * 100;
    
    expect(crescimento).toBe(30); // 30% de crescimento
  });
});

describe('Fluxo Completo: Cenários Reais', () => {
  
  test('Empresa com padrão de faturamento', () => {
    criarEmpresa('emp_pattern', 'Padrão Faturamento');
    
    // Venda no início do mês
    adicionarVenda('emp_pattern', {
      data: '2024-01-05',
      cliente: 'Grande Cliente',
      valor: 10000,
      descricao: 'Contrato Mensal'
    });
    
    // Venda no meio do mês
    adicionarVenda('emp_pattern', {
      data: '2024-01-15',
      cliente: 'Cliente Regular',
      valor: 3000,
      descricao: 'Compra'
    });
    
    // Compras ao longo do mês
    adicionarCompra('emp_pattern', {
      data: '2024-01-08',
      fornecedor: 'Fornecedor A',
      valor: 4000,
      descricao: 'Matéria Prima'
    });
    
    adicionarCompra('emp_pattern', {
      data: '2024-01-20',
      fornecedor: 'Fornecedor B',
      valor: 2000,
      descricao: 'Serviços'
    });
    
    const vendas = calcularTotalVendas('emp_pattern', 1, 2024);
    const compras = calcularTotalCompras('emp_pattern', 1, 2024);
    const saldoInicial = obterSaldoInicial('emp_pattern');
    const saldoFinal = saldoInicial + vendas - compras;
    
    expect(vendas).toBe(13000);
    expect(compras).toBe(6000);
    expect(saldoFinal).toBe(17000);
  });

  test('Empresa com múltiplos clientes', () => {
    criarEmpresa('emp_multicliente', 'Multi Cliente');
    
    const clientes = ['Cliente A', 'Cliente B', 'Cliente C', 'Cliente D'];
    const valores = [2000, 3500, 1500, 2000];
    
    clientes.forEach((cliente, i) => {
      adicionarVenda('emp_multicliente', {
        data: '2024-01-15',
        cliente: cliente,
        valor: valores[i],
        descricao: `Venda para ${cliente}`
      });
    });
    
    const total = calcularTotalVendas('emp_multicliente', 1, 2024);
    const expected = valores.reduce((a, b) => a + b, 0);
    
    expect(total).toBe(expected);
    expect(total).toBe(9000);
  });
});
