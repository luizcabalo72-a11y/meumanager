/**
 * TESTES UNITÁRIOS - CONFIGURAÇÕES
 * Valida funções de armazenamento e manipulação de dados da empresa
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

// Função helper para resetar localStorage antes de cada teste
beforeEach(() => {
  localStorage.clear();
  // Dados padrão para cada teste
  localStorage.setItem('ft_active_account', JSON.stringify({ empresaId: 'empresa_teste' }));
  localStorage.setItem('acc_empresa_teste__empresa_dados', JSON.stringify({
    id: 'empresa_teste',
    razaoSocial: 'Empresa Teste LTDA',
    nomeFantasia: 'Empresa Teste',
    cnpj: '12.345.678/0001-99',
    inscricaoEstadual: '123.456.789.012',
    telefone: '(11) 98765-4321',
    email: 'contato@empresa.com',
    cidade: 'São Paulo',
    site: 'www.empresa.com',
    logo: null,
    dataCadastro: '2024-01-01'
  }));
  localStorage.setItem('acc_empresa_teste__saldo_inicial', JSON.stringify({
    valor: 10000.00,
    data: '2024-01-01'
  }));
});

describe('Gerenciamento de Dados da Empresa', () => {
  
  test('Salva dados da empresa corretamente', () => {
    const salvarDados = (empresaId, dados) => {
      const key = `acc_${empresaId}__empresa_dados`;
      localStorage.setItem(key, JSON.stringify(dados));
      return true;
    };

    const novosDados = {
      razaoSocial: 'Nova Empresa',
      nomeFantasia: 'Nova',
      cnpj: '98.765.432/0001-11'
    };

    const resultado = salvarDados('empresa_teste', novosDados);
    expect(resultado).toBe(true);
    
    const saved = JSON.parse(localStorage.getItem('acc_empresa_teste__empresa_dados'));
    expect(saved.razaoSocial).toBe('Nova Empresa');
  });

  test('Carrega dados da empresa corretamente', () => {
    const carregarDados = (empresaId) => {
      const key = `acc_${empresaId}__empresa_dados`;
      return JSON.parse(localStorage.getItem(key) || '{}');
    };

    const dados = carregarDados('empresa_teste');
    expect(dados.razaoSocial).toBe('Empresa Teste LTDA');
    expect(dados.nomeFantasia).toBe('Empresa Teste');
  });

  test('Valida CNPJ corretamente', () => {
    const validarCNPJ = (cnpj) => {
      const clean = cnpj.replace(/\D/g, '');
      return clean.length === 14 && clean !== '00000000000000';
    };

    expect(validarCNPJ('12.345.678/0001-99')).toBe(true);
    expect(validarCNPJ('00.000.000/0000-00')).toBe(false);
    expect(validarCNPJ('invalid')).toBe(false);
  });

  test('Valida email corretamente', () => {
    const validarEmail = (email) => {
      const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return regex.test(email);
    };

    expect(validarEmail('contato@empresa.com')).toBe(true);
    expect(validarEmail('invalid-email')).toBe(false);
    expect(validarEmail('user@domain.co.uk')).toBe(true);
  });

  test('Valida telefone corretamente', () => {
    const validarTelefone = (telefone) => {
      const clean = telefone.replace(/\D/g, '');
      // Permite 10 ou 11 dígitos (celular tem 11, fixo tem 10)
      return clean.length === 10 || clean.length === 11;
    };

    expect(validarTelefone('(11) 98765-4321')).toBe(true);
    expect(validarTelefone('(11) 3456-7890')).toBe(true);
    expect(validarTelefone('11987654321')).toBe(true);
    expect(validarTelefone('1198765')).toBe(false);
  });

  test('Formata CNPJ corretamente', () => {
    const formatarCNPJ = (cnpj) => {
      const clean = cnpj.replace(/\D/g, '');
      return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, 
                          '$1.$2.$3/$4-$5');
    };

    expect(formatarCNPJ('12345678000199')).toBe('12.345.678/0001-99');
  });

  test('Formata telefone corretamente', () => {
    const formatarTelefone = (tel) => {
      const clean = tel.replace(/\D/g, '');
      if (clean.length === 11) {
        return clean.replace(/^(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
      }
      return clean.replace(/^(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    };

    expect(formatarTelefone('11987654321')).toBe('(11) 98765-4321');
    expect(formatarTelefone('1134567890')).toBe('(11) 3456-7890');
  });
});

describe('Gerenciamento de Saldo Inicial', () => {
  
  test('Salva saldo inicial corretamente', () => {
    const salvarSaldo = (empresaId, valor, data) => {
      const key = `acc_${empresaId}__saldo_inicial`;
      localStorage.setItem(key, JSON.stringify({
        valor: parseFloat(valor),
        data: data
      }));
      return true;
    };

    const resultado = salvarSaldo('empresa_teste', 5000, '2024-01-01');
    expect(resultado).toBe(true);
  });

  test('Carrega saldo inicial corretamente', () => {
    const carregarSaldo = (empresaId) => {
      const key = `acc_${empresaId}__saldo_inicial`;
      return JSON.parse(localStorage.getItem(key) || '{"valor":0,"data":""}');
    };

    const saldo = carregarSaldo('empresa_teste');
    expect(saldo.valor).toBe(10000.00);
  });

  test('Valida valor de saldo como positivo', () => {
    const validarSaldo = (valor) => {
      const num = parseFloat(valor);
      return !isNaN(num) && num >= 0;
    };

    expect(validarSaldo(10000.00)).toBe(true);
    expect(validarSaldo(0)).toBe(true);
    expect(validarSaldo(-100)).toBe(false);
  });
});

describe('Gerenciamento de Logo', () => {
  
  test('Valida tipo de arquivo de logo', () => {
    const tiposValidos = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
    
    const validarTipoLogo = (tipo) => {
      return tiposValidos.includes(tipo);
    };

    expect(validarTipoLogo('image/png')).toBe(true);
    expect(validarTipoLogo('image/jpeg')).toBe(true);
    expect(validarTipoLogo('image/gif')).toBe(false);
    expect(validarTipoLogo('text/plain')).toBe(false);
  });

  test('Valida tamanho máximo de logo (500KB)', () => {
    const validarTamanoLogo = (tamanhoEmBytes) => {
      const tamanhoMaximoKB = 500;
      const tamanhoMaximoBytes = tamanhoMaximoKB * 1024;
      return tamanhoEmBytes <= tamanhoMaximoBytes;
    };

    expect(validarTamanoLogo(400 * 1024)).toBe(true); // 400KB
    expect(validarTamanoLogo(600 * 1024)).toBe(false); // 600KB
    expect(validarTamanoLogo(500 * 1024)).toBe(true); // Exato 500KB
  });

  test('Salva logo em base64 corretamente', () => {
    const salvarLogo = (empresaId, base64Data) => {
      const key = `acc_${empresaId}__empresa_dados`;
      const dados = JSON.parse(localStorage.getItem(key) || '{}');
      dados.logo = base64Data;
      localStorage.setItem(key, JSON.stringify(dados));
      return true;
    };

    const mockBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';
    const resultado = salvarLogo('empresa_teste', mockBase64);
    expect(resultado).toBe(true);
    
    const dados = JSON.parse(localStorage.getItem('acc_empresa_teste__empresa_dados'));
    expect(dados.logo).toBe(mockBase64);
  });

  test('Remove logo corretamente', () => {
    const removerLogo = (empresaId) => {
      const key = `acc_${empresaId}__empresa_dados`;
      const dados = JSON.parse(localStorage.getItem(key) || '{}');
      dados.logo = null;
      localStorage.setItem(key, JSON.stringify(dados));
      return true;
    };

    const resultado = removerLogo('empresa_teste');
    expect(resultado).toBe(true);
    
    const dados = JSON.parse(localStorage.getItem('acc_empresa_teste__empresa_dados'));
    expect(dados.logo).toBeNull();
  });
});

describe('Gerenciamento de Múltiplas Empresas', () => {
  
  test('Cria nova empresa com ID único', () => {
    const criarEmpresa = (dados) => {
      const id = 'empresa_' + Date.now();
      const empresaData = {
        id: id,
        ...dados,
        dataCadastro: new Date().toISOString().split('T')[0]
      };
      localStorage.setItem(`acc_${id}__empresa_dados`, JSON.stringify(empresaData));
      return id;
    };

    const novaEmpresa = criarEmpresa({
      razaoSocial: 'Nova Empresa LTDA',
      nomeFantasia: 'Nova Empresa'
    });

    expect(novaEmpresa).toMatch(/^empresa_\d+$/);
    
    const saved = JSON.parse(localStorage.getItem(`acc_${novaEmpresa}__empresa_dados`));
    expect(saved.id).toBe(novaEmpresa);
  });

  test('Ativa empresa corretamente', () => {
    const ativarEmpresa = (empresaId) => {
      const sessao = JSON.parse(localStorage.getItem('ft_active_account') || '{}');
      sessao.empresaId = empresaId;
      localStorage.setItem('ft_active_account', JSON.stringify(sessao));
      return true;
    };

    const resultado = ativarEmpresa('empresa_teste');
    expect(resultado).toBe(true);
    
    const sessao = JSON.parse(localStorage.getItem('ft_active_account'));
    expect(sessao.empresaId).toBe('empresa_teste');
  });

  test('Lista todas as empresas', () => {
    const listarEmpresas = () => {
      const empresas = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes('__empresa_dados')) {
          const dados = JSON.parse(localStorage.getItem(key));
          empresas.push(dados);
        }
      }
      return empresas;
    };

    const empresas = listarEmpresas();
    expect(empresas.length).toBeGreaterThan(0);
    expect(empresas[0]).toHaveProperty('id');
    expect(empresas[0]).toHaveProperty('razaoSocial');
  });

  test('Exclui empresa corretamente', () => {
    const criarEmpresa = (id) => {
      localStorage.setItem(`acc_${id}__empresa_dados`, JSON.stringify({ id }));
      localStorage.setItem(`acc_${id}__vendas`, JSON.stringify([]));
    };

    const excluirEmpresa = (empresaId) => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes(`acc_${empresaId}__`)) {
          keys.push(key);
        }
      }
      keys.forEach(key => localStorage.removeItem(key));
      return true;
    };

    // Criar empresa temporária
    criarEmpresa('temp_empresa');
    
    // Excluir
    const resultado = excluirEmpresa('temp_empresa');
    expect(resultado).toBe(true);
    
    // Verificar se foi deletada
    const dados = localStorage.getItem('acc_temp_empresa__empresa_dados');
    expect(dados).toBeNull();
  });

  test('Isola dados por empresa', () => {
    const obterDadosEmpresa = (empresaId, tipo) => {
      const key = `acc_${empresaId}__${tipo}`;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    };

    const dados1 = obterDadosEmpresa('empresa_teste', 'empresa_dados');

    expect(dados1).not.toBeNull();
    expect(dados1.razaoSocial).toBe('Empresa Teste LTDA');
  });
});

describe('Validação de Formulários', () => {
  
  test('Valida preenchimento obrigatório de campos', () => {
    const validarCamposObrigatorios = (dados) => {
      const campos = ['razaoSocial', 'nomeFantasia', 'cnpj'];
      return campos.every(campo => dados[campo] && dados[campo].toString().trim().length > 0);
    };

    const dadosValidos = {
      razaoSocial: 'Empresa X',
      nomeFantasia: 'Empresa',
      cnpj: '12.345.678/0001-99'
    };

    const dadosInvalidos = {
      razaoSocial: '',
      nomeFantasia: 'Empresa',
      cnpj: '12.345.678/0001-99'
    };

    expect(validarCamposObrigatorios(dadosValidos)).toBe(true);
    expect(validarCamposObrigatorios(dadosInvalidos)).toBe(false);
  });

  test('Valida campos opcionais podem estar vazios', () => {
    const validarCamposOpcionais = (dados) => {
      // Campos opcionais podem estar vazios
      return true;
    };

    const dados = {
      email: '',
      cidade: '',
      site: null
    };

    expect(validarCamposOpcionais(dados)).toBe(true);
  });
});

describe('Gerenciamento de Dados da Empresa', () => {
  
  test('Salva dados da empresa corretamente', () => {
    const salvarDados = (empresaId, dados) => {
      const key = `acc_${empresaId}__empresa_dados`;
      localStorage.setItem(key, JSON.stringify(dados));
      return true;
    };

    const novosDados = {
      razaoSocial: 'Nova Empresa',
      nomeFantasia: 'Nova',
      cnpj: '98.765.432/0001-11'
    };

    const resultado = salvarDados('empresa_teste', novosDados);
    expect(resultado).toBe(true);
  });

  test('Carrega dados da empresa corretamente', () => {
    const carregarDados = (empresaId) => {
      const key = `acc_${empresaId}__empresa_dados`;
      return JSON.parse(localStorage.getItem(key) || '{}');
    };

    const dados = carregarDados('empresa_teste');
    expect(dados.razaoSocial).toBe('Empresa Teste LTDA');
    expect(dados.nomeFantasia).toBe('Empresa Teste');
  });

  test('Valida CNPJ corretamente', () => {
    const validarCNPJ = (cnpj) => {
      const clean = cnpj.replace(/\D/g, '');
      return clean.length === 14 && clean !== '00000000000000';
    };

    expect(validarCNPJ('12.345.678/0001-99')).toBe(true);
    expect(validarCNPJ('00.000.000/0000-00')).toBe(false);
    expect(validarCNPJ('invalid')).toBe(false);
  });

  test('Valida email corretamente', () => {
    const validarEmail = (email) => {
      const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return regex.test(email);
    };

    expect(validarEmail('contato@empresa.com')).toBe(true);
    expect(validarEmail('invalid-email')).toBe(false);
    expect(validarEmail('user@domain.co.uk')).toBe(true);
  });

  test('Valida telefone corretamente', () => {
    const validarTelefone = (telefone) => {
      const clean = telefone.replace(/\D/g, '');
      // Permite 10 ou 11 dígitos (celular tem 11, fixo tem 10)
      return clean.length === 10 || clean.length === 11;
    };

    expect(validarTelefone('(11) 98765-4321')).toBe(true);
    expect(validarTelefone('(11) 3456-7890')).toBe(true);
    expect(validarTelefone('11987654321')).toBe(true);
    expect(validarTelefone('1134567890')).toBe(true);
    expect(validarTelefone('1198765')).toBe(false);
  });

  test('Formata CNPJ corretamente', () => {
    const formatarCNPJ = (cnpj) => {
      const clean = cnpj.replace(/\D/g, '');
      return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, 
                          '$1.$2.$3/$4-$5');
    };

    expect(formatarCNPJ('12345678000199')).toBe('12.345.678/0001-99');
  });

  test('Formata telefone corretamente', () => {
    const formatarTelefone = (tel) => {
      const clean = tel.replace(/\D/g, '');
      if (clean.length === 11) {
        return clean.replace(/^(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
      }
      return clean.replace(/^(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    };

    expect(formatarTelefone('11987654321')).toBe('(11) 98765-4321');
  });
});

describe('Gerenciamento de Saldo Inicial', () => {
  
  test('Salva saldo inicial corretamente', () => {
    const salvarSaldo = (empresaId, valor, data) => {
      const key = `acc_${empresaId}__saldo_inicial`;
      localStorage.setItem(key, JSON.stringify({
        valor: parseFloat(valor),
        data: data
      }));
      return true;
    };

    const resultado = salvarSaldo('empresa_teste', 5000, '2024-01-01');
    expect(resultado).toBe(true);
  });

  test('Carrega saldo inicial corretamente', () => {
    const carregarSaldo = (empresaId) => {
      const key = `acc_${empresaId}__saldo_inicial`;
      return JSON.parse(localStorage.getItem(key) || '{"valor":0,"data":""}');
    };

    const saldo = carregarSaldo('empresa_teste');
    expect(saldo.valor).toBe(10000.00);
  });

  test('Valida valor de saldo como positivo', () => {
    const validarSaldo = (valor) => {
      const num = parseFloat(valor);
      return !isNaN(num) && num >= 0;
    };

    expect(validarSaldo(10000.00)).toBe(true);
    expect(validarSaldo(0)).toBe(true);
    expect(validarSaldo(-100)).toBe(false);
  });
});

describe('Gerenciamento de Logo', () => {
  
  test('Valida tipo de arquivo de logo', () => {
    const tiposValidos = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
    
    const validarTipoLogo = (tipo) => {
      return tiposValidos.includes(tipo);
    };

    expect(validarTipoLogo('image/png')).toBe(true);
    expect(validarTipoLogo('image/jpeg')).toBe(true);
    expect(validarTipoLogo('image/gif')).toBe(false);
    expect(validarTipoLogo('text/plain')).toBe(false);
  });

  test('Valida tamanho máximo de logo (500KB)', () => {
    const validarTamanoLogo = (tamanhoEmBytes) => {
      const tamanhoMaximoKB = 500;
      const tamanhoMaximoBytes = tamanhoMaximoKB * 1024;
      return tamanhoEmBytes <= tamanhoMaximoBytes;
    };

    expect(validarTamanoLogo(400 * 1024)).toBe(true); // 400KB
    expect(validarTamanoLogo(600 * 1024)).toBe(false); // 600KB
    expect(validarTamanoLogo(500 * 1024)).toBe(true); // Exato 500KB
  });

  test('Salva logo em base64 corretamente', () => {
    const salvarLogo = (empresaId, base64Data) => {
      const dados = JSON.parse(localStorage.getItem(`acc_${empresaId}__empresa_dados`) || '{}');
      dados.logo = base64Data;
      localStorage.setItem(`acc_${empresaId}__empresa_dados`, JSON.stringify(dados));
      return true;
    };

    const mockBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';
    const resultado = salvarLogo('empresa_teste', mockBase64);
    expect(resultado).toBe(true);
  });

  test('Remove logo corretamente', () => {
    const removerLogo = (empresaId) => {
      const dados = JSON.parse(localStorage.getItem(`acc_${empresaId}__empresa_dados`) || '{}');
      dados.logo = null;
      localStorage.setItem(`acc_${empresaId}__empresa_dados`, JSON.stringify(dados));
      return true;
    };

    const resultado = removerLogo('empresa_teste');
    expect(resultado).toBe(true);
  });
});

describe('Gerenciamento de Múltiplas Empresas', () => {
  
  test('Cria nova empresa com ID único', () => {
    const criarEmpresa = (dados) => {
      const id = 'empresa_' + Date.now();
      const empresaData = {
        id: id,
        ...dados,
        dataCadastro: new Date().toISOString().split('T')[0]
      };
      localStorage.setItem(`acc_${id}__empresa_dados`, JSON.stringify(empresaData));
      return id;
    };

    const novaEmpresa = criarEmpresa({
      razaoSocial: 'Nova Empresa LTDA',
      nomeFantasia: 'Nova Empresa'
    });

    expect(novaEmpresa).toMatch(/^empresa_\d+$/);
  });

  test('Ativa empresa corretamente', () => {
    const ativarEmpresa = (empresaId) => {
      const sessao = JSON.parse(localStorage.getItem('ft_active_account') || '{}');
      sessao.empresaId = empresaId;
      localStorage.setItem('ft_active_account', JSON.stringify(sessao));
      return true;
    };

    const resultado = ativarEmpresa('empresa_teste');
    expect(resultado).toBe(true);
    
    const sessao = JSON.parse(localStorage.getItem('ft_active_account'));
    expect(sessao.empresaId).toBe('empresa_teste');
  });

  test('Lista todas as empresas', () => {
    const listarEmpresas = () => {
      const empresas = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.includes('__empresa_dados')) {
          const dados = JSON.parse(localStorage.getItem(key));
          empresas.push(dados);
        }
      }
      return empresas;
    };

    const empresas = listarEmpresas();
    expect(empresas.length).toBeGreaterThan(0);
    expect(empresas[0]).toHaveProperty('id');
    expect(empresas[0]).toHaveProperty('razaoSocial');
  });

  test('Exclui empresa corretamente', () => {
    const excluirEmpresa = (empresaId) => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.includes(`acc_${empresaId}__`)) {
          keys.push(key);
        }
      }
      keys.forEach(key => localStorage.removeItem(key));
      return true;
    };

    const resultado = excluirEmpresa('empresa_teste');
    expect(resultado).toBe(true);
  });

  test('Isola dados por empresa', () => {
    const obterDadosEmpresa = (empresaId, tipo) => {
      const key = `acc_${empresaId}__${tipo}`;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    };

    const dados1 = obterDadosEmpresa('empresa_teste', 'empresa_dados');
    const dados2 = obterDadosEmpresa('outra_empresa', 'empresa_dados');

    expect(dados1).not.toBeNull();
    expect(dados1.razaoSocial).toBe('Empresa Teste LTDA');
    expect(dados2).toBeNull();
  });
});

describe('Validação de Formulários', () => {
  
  test('Valida preenchimento obrigatório de campos', () => {
    const validarCamposObrigatorios = (dados) => {
      const campos = ['razaoSocial', 'nomeFantasia', 'cnpj'];
      return campos.every(campo => dados[campo] && dados[campo].trim().length > 0);
    };

    const dadosValidos = {
      razaoSocial: 'Empresa X',
      nomeFantasia: 'Empresa',
      cnpj: '12.345.678/0001-99'
    };

    const dadosInvalidos = {
      razaoSocial: '',
      nomeFantasia: 'Empresa',
      cnpj: '12.345.678/0001-99'
    };

    expect(validarCamposObrigatorios(dadosValidos)).toBe(true);
    expect(validarCamposObrigatorios(dadosInvalidos)).toBe(false);
  });

  test('Valida campos opcionais podem estar vazios', () => {
    const validarCamposOpcionais = (dados) => {
      // Campos opcionais podem estar vazios
      return true;
    };

    const dados = {
      email: '',
      cidade: '',
      site: null
    };

    expect(validarCamposOpcionais(dados)).toBe(true);
  });
});
