'use strict';
/* =========================================================
   Diagnóstico Camelo — schema do formulário
   Todo o conteúdo (perguntas, tipos, opções, condicionais)
   vive aqui. A UI, o progresso e o relatório derivam disto.
   Baseado nos eixos das propostas de diagnóstico da Água
   Camelo (MRN Ajudante 2026, Axia TI Trocará, Boa Esperança).
   ========================================================= */

const APP_VERSION = '1.5.0';

/* Campos do projeto (nível superior) */
const PROJECT_FIELDS = [
  { key: 'cliente',  label: 'Cliente / parceiro', type: 'text', placeholder: 'Ex.: Mineração Rio do Norte' },
  { key: 'local',    label: 'Localização (município / região / país)', type: 'text', placeholder: 'Ex.: Oriximiná, Pará, Brasil' },
  { key: 'equipe',   label: 'Equipe de campo', type: 'text', placeholder: 'Nomes dos técnicos' },
  { key: 'periodo',  label: 'Período da visita', type: 'text', placeholder: 'Ex.: 1ª semana de novembro de 2026' },
  { key: 'contexto', label: 'Contexto do projeto', type: 'textarea', rows: 3, placeholder: 'Resumo do desafio central, histórico da parceria, condicionantes' }
];

/* Seções de cada núcleo (vila, cidade, aldeia, área) */
const SECTIONS = [
  {
    id: 's1', emoji: '📍', title: 'Identificação e território',
    fields: [
      { key: 'gps',         label: 'Coordenadas GPS do núcleo', type: 'gps' },
      { key: 'acesso',      label: 'Como se chega ao núcleo', type: 'textarea', rows: 2, placeholder: 'Terrestre, fluvial, condições do caminho, tempo de deslocamento' },
      { key: 'referencias', label: 'Pontos de referência e equipamentos comunitários', type: 'textarea', rows: 2, placeholder: 'Escolas, centros comunitários, igrejas, casas de reza, postos' },
      { key: 'obs',         label: 'Notas e observações', type: 'textarea', rows: 2 }
    ]
  },
  {
    id: 's2', emoji: '👥', title: 'População e demanda',
    fields: [
      { key: 'familias',      label: 'Número de famílias', type: 'number', unit: 'famílias' },
      { key: 'moradores',     label: 'Quantas pessoas moram no núcleo', type: 'number', unit: 'pessoas', required: true },
      { key: 'frequentadores', label: 'Quantas pessoas vão frequentar a EAS', type: 'number', unit: 'pessoas', required: true },
      { key: 'variacaoSazonal', label: 'A população varia ao longo do ano?', type: 'radio', options: ['Sim', 'Não', 'Não sei'] },
      { key: 'variacaoDesc',  label: 'Descreva a variação', type: 'textarea', rows: 2, conditional: { field: 'variacaoSazonal', operator: 'equals', value: 'Sim' }, placeholder: 'Migração periódica, época de festas, safra' },
      { key: 'usosAgua',      label: 'Usos da água no núcleo', type: 'checkbox', options: ['Consumo humano', 'Cozinha', 'Higiene pessoal', 'Lavagem de roupas', 'Agricultura / roçado', 'Criação de animais', 'Outro'] },
      { key: 'usosOutro',     label: 'Qual outro uso?', type: 'text', conditional: { field: 'usosAgua', operator: 'includes', value: 'Outro' } },
      { key: 'obs',           label: 'Notas e observações', type: 'textarea', rows: 2 }
    ]
  },
  {
    id: 's3', emoji: '💧', title: 'Fontes de água',
    isArray: true, arrayKey: 'fontes', itemLabel: 'Fonte',
    itemFields: [
      { key: 'nome',        label: 'Identificação da fonte', type: 'text', placeholder: 'Ex.: Poço da escola, Igarapé do sul' },
      { key: 'tipo',        label: 'Tipo de fonte', type: 'radio', required: true, options: ['Rio', 'Poço', 'Igarapé', 'Rede pública', 'Lago', 'Cacimba', 'Nascente (caxambu)', 'Água da chuva', 'Outro'] },
      { key: 'tipoOutro',   label: 'Qual outro tipo?', type: 'text', conditional: { field: 'tipo', operator: 'equals', value: 'Outro' } },
      { key: 'contaminacao', label: 'Contaminação da água', type: 'checkbox', options: ['Microbiológica', 'Metais pesados', 'Salinidade', 'Agrotóxicos', 'Sem contaminação aparente', 'Aguardando análise laboratorial', 'Outra'] },
      { key: 'contamOutra', label: 'Qual outra contaminação?', type: 'text', conditional: { field: 'contaminacao', operator: 'includes', value: 'Outra' } },
      { key: 'distanciaEAS', label: 'Distância estimada até o local de instalação da EAS', type: 'number', unit: 'm', required: true },
      { key: 'estiagem',    label: 'Comportamento na estiagem', type: 'radio', options: ['Perene (não seca)', 'Reduz na estiagem', 'Seca completamente', 'Não sei'] },
      { key: 'situacao',    label: 'Situação da fonte', type: 'radio', options: ['Em uso', 'Desativada', 'Potencial nova fonte'] },
      { key: 'vazao',       label: 'Vazão / disponibilidade estimada', type: 'text', placeholder: 'Ex.: 500 L/h, enche um balde de 20 L em 2 min' },
      { key: 'gps',         label: 'Coordenadas GPS da fonte', type: 'gps' },
      { key: 'obs',         label: 'Notas e observações', type: 'textarea', rows: 2 }
    ]
  },
  {
    id: 's4', emoji: '🏗️', title: 'Infraestrutura existente',
    fields: [
      { key: 'estruturas',  label: 'Estruturas existentes', type: 'checkbox', options: ['Caixa d’água / reservatório', 'Bomba manual', 'Motobomba (diesel / gasolina)', 'Bomba elétrica', 'Bombeamento solar', 'Rede de distribuição / encanamento', 'Cisterna de água da chuva', 'Microssistema / ETA', 'Nenhuma', 'Outra'] },
      { key: 'estruturaOutra', label: 'Qual outra estrutura?', type: 'text', conditional: { field: 'estruturas', operator: 'includes', value: 'Outra' } },
      { key: 'estadoEstruturas', label: 'Estado e funcionalidade (parecer)', type: 'textarea', rows: 3, placeholder: 'O que funciona, o que está inoperante, o que pode ser aproveitado' },
      { key: 'energia',     label: 'Energia disponível', type: 'checkbox', options: ['Rede elétrica', 'Energia solar', 'Gerador', 'Nenhuma'] },
      { key: 'obs',         label: 'Notas e observações', type: 'textarea', rows: 2 }
    ]
  },
  {
    id: 's5', emoji: '🔬', title: 'Qualidade da água e saúde',
    fields: [
      { key: 'trataAgua',   label: 'Os moradores tratam a água hoje?', type: 'radio', options: ['Sim', 'Não', 'Parcialmente'] },
      { key: 'tratamento',  label: 'Como tratam?', type: 'checkbox', options: ['Fervura', 'Hipoclorito / cloro', 'Filtração por pano', 'Filtro doméstico', 'Outro'], conditional: { field: 'trataAgua', operator: 'notEquals', value: 'Não' } },
      { key: 'tratamentoOutro', label: 'Qual outro tratamento?', type: 'text', conditional: { field: 'tratamento', operator: 'includes', value: 'Outro' } },
      { key: 'amostras',    label: 'Amostras coletadas para análise laboratorial?', type: 'radio', options: ['Sim', 'Não', 'Coletar depois'] },
      { key: 'pontosColeta', label: 'Pontos de coleta', type: 'textarea', rows: 2, conditional: { field: 'amostras', operator: 'equals', value: 'Sim' }, placeholder: 'Onde as amostras foram coletadas' },
      { key: 'doencas',     label: 'Doenças de veiculação hídrica relatadas', type: 'textarea', rows: 2, placeholder: 'Diarreia, verminoses, recorrência, faixa etária mais afetada' },
      { key: 'obs',         label: 'Notas e observações', type: 'textarea', rows: 2 }
    ]
  },
  {
    id: 's6', emoji: '🤝', title: 'Social e organização',
    fields: [
      { key: 'liderancas',  label: 'Lideranças identificadas', type: 'textarea', rows: 2, placeholder: 'Nomes, papéis e contatos' },
      { key: 'organizacao', label: 'Organização social', type: 'radio', options: ['Associação formal', 'Lideranças informais', 'Sem organização identificada'] },
      { key: 'agentes',     label: 'Responsáveis aptos à manutenção dos sistemas', type: 'textarea', rows: 2, placeholder: 'Agentes locais, conhecimento técnico, necessidade de capacitação' },
      { key: 'relatos',     label: 'Relatos da comunidade (oficinas, queixas, sugestões)', type: 'textarea', rows: 3 },
      { key: 'obs',         label: 'Notas e observações', type: 'textarea', rows: 2 }
    ]
  },
  {
    id: 's7', emoji: '🚰', title: 'Local de instalação da EAS',
    fields: [
      { key: 'descricao',   label: 'Descrição do local proposto', type: 'textarea', rows: 3, placeholder: 'Onde fica, por que foi escolhido, estrutura existente ou a construir' },
      { key: 'gps',         label: 'Coordenadas GPS do local', type: 'gps' },
      { key: 'cobertura',   label: 'O local tem cobertura (sol / chuva)?', type: 'radio', options: ['Sim', 'Não', 'Parcial'] },
      { key: 'acessoManutencao', label: 'Acesso para manutenção', type: 'radio', options: ['Fácil', 'Moderado', 'Difícil'] },
      { key: 'obs',         label: 'Notas e observações', type: 'textarea', rows: 2 }
    ]
  },
  {
    id: 's8', emoji: '📋', title: 'Conclusões preliminares',
    fields: [
      { key: 'resumo',       label: 'Percepções gerais da equipe', type: 'textarea', rows: 3 },
      { key: 'recomendacoes', label: 'Recomendações iniciais', type: 'textarea', rows: 3, placeholder: 'Arranjo de solução, fontes candidatas, tecnologia de tratamento' },
      { key: 'pendencias',   label: 'Pendências (o que falta coletar)', type: 'textarea', rows: 2 },
      { key: 'obs',          label: 'Notas e observações', type: 'textarea', rows: 2 }
    ]
  }
];

/* =========================================================
   ESCOLAS: diagnóstico de unidade escolar
   Perguntas tiradas dos relatórios finais do Água nas Escolas
   (Opella Belém e Sorocaba, 2025): KPIs de alcance, saúde,
   merenda e economia, e os aprendizados do pré-projeto
   (pressão, andares e caixa d’água, ferrugem, reforma prevista,
   fonte perto de lixão). Campos com "alerta" viram pontos de
   atenção destacados na escola e no relatório.
   ========================================================= */

const SCHOOL_PROJECT_FIELDS = [
  { key: 'cliente',    label: 'Cliente / parceiro', type: 'text', placeholder: 'Ex.: Opella' },
  { key: 'secretaria', label: 'Secretaria / rede de ensino parceira', type: 'text', placeholder: 'Ex.: SEMEC Belém' },
  { key: 'local',      label: 'Município / UF', type: 'text', placeholder: 'Ex.: Belém, PA' },
  { key: 'equipe',     label: 'Equipe de campo', type: 'text', placeholder: 'Nomes dos técnicos' },
  { key: 'periodo',    label: 'Período da visita', type: 'text', placeholder: 'Ex.: 3 a 8 de agosto' },
  { key: 'contexto',   label: 'Contexto do projeto', type: 'textarea', rows: 3, placeholder: 'Como as escolas foram indicadas, quantas serão atendidas, condicionantes' }
];

const SCHOOL_SECTIONS = [
  {
    id: 'e1', emoji: '📍', title: 'Identificação da escola',
    fields: [
      { key: 'gps',        label: 'Coordenadas GPS da escola', type: 'gps' },
      { key: 'rede',       label: 'Rede', type: 'radio', options: ['Municipal', 'Estadual', 'Federal', 'Comunitária / filantrópica'] },
      { key: 'zona',       label: 'Localização', type: 'radio', options: ['Urbana', 'Rural'] },
      { key: 'diferenciada', label: 'Localização diferenciada', type: 'radio', options: ['Não se aplica', 'Terra indígena', 'Comunidade quilombola', 'Ribeirinha / ilha', 'Assentamento'] },
      { key: 'endereco',   label: 'Endereço e bairro', type: 'textarea', rows: 2 },
      { key: 'acesso',     label: 'Como se chega à escola', type: 'textarea', rows: 2, placeholder: 'Carro, barco, tempo de deslocamento a partir da base' },
      { key: 'direcao',    label: 'Direção (nome e contato)', type: 'text' },
      { key: 'pontoFocal', label: 'Quem acompanha o projeto na escola', type: 'text', placeholder: 'Pessoa que vai responder o monitoramento' },
      { key: 'obs',        label: 'Notas e observações', type: 'textarea', rows: 2 }
    ]
  },
  {
    id: 'e2', emoji: '👥', title: 'Alunos e equipe',
    fields: [
      { key: 'etapas',      label: 'Etapas de ensino atendidas', type: 'checkbox', options: ['Educação Infantil: creche (0 a 3 anos)', 'Educação Infantil: pré-escola (4 e 5 anos)', 'Ensino Fundamental I (1º ao 5º ano)', 'Ensino Fundamental II (6º ao 9º ano)', 'Ensino Médio', 'EJA', 'Educação especial / AEE'] },
      { key: 'turnos',      label: 'Turnos', type: 'checkbox', options: ['Manhã', 'Tarde', 'Noite', 'Integral'] },
      { key: 'alunos',      label: 'Total de alunos matriculados', type: 'number', unit: 'alunos', required: true },
      { key: 'alunos0a5',   label: 'Alunos de 0 a 5 anos', type: 'number', unit: 'alunos' },
      { key: 'alunos6a18',  label: 'Alunos de 6 a 18 anos', type: 'number', unit: 'alunos' },
      { key: 'alunosEja',   label: 'Alunos acima de 18 anos (EJA)', type: 'number', unit: 'alunos', conditional: { field: 'etapas', operator: 'includes', value: 'EJA' } },
      { key: 'alunosPcd',   label: 'Alunos com deficiência (PCD)', type: 'number', unit: 'alunos' },
      { key: 'turnoCheio',  label: 'Alunos no turno mais cheio', type: 'number', unit: 'alunos', placeholder: 'Quantos usam o bebedouro no mesmo período' },
      { key: 'professores', label: 'Professores', type: 'number', unit: 'pessoas', required: true },
      { key: 'funcionarios', label: 'Demais funcionários (direção, cozinha, limpeza, portaria)', type: 'number', unit: 'pessoas', required: true },
      { key: 'comunidadeUsa', label: 'Moradores do entorno também pegam água na escola?', type: 'radio', options: ['Sim', 'Não', 'Poderiam, se tivesse água boa'] },
      { key: 'obs',         label: 'Notas e observações', type: 'textarea', rows: 2 }
    ]
  },
  {
    id: 'e3', emoji: '💧', title: 'Abastecimento de água',
    isArray: true, arrayKey: 'fontes', itemLabel: 'Fonte',
    itemFields: [
      { key: 'nome',      label: 'Identificação da fonte', type: 'text', placeholder: 'Ex.: Rede da concessionária, Poço do pátio' },
      { key: 'tipo',      label: 'Tipo de fonte', type: 'radio', required: true, options: ['Rede pública / concessionária', 'Poço artesiano', 'Poço raso / cacimba', 'Rio / igarapé', 'Caminhão pipa', 'Cisterna de água da chuva', 'Outro'] },
      { key: 'tipoOutro', label: 'Qual outro tipo?', type: 'text', conditional: { field: 'tipo', operator: 'equals', value: 'Outro' } },
      { key: 'regularidade', label: 'A água chega todo dia?', type: 'radio', options: ['Sempre', 'Falta às vezes', 'Falta com frequência'], alerta: ['Falta com frequência'] },
      { key: 'problemas', label: 'O que a escola percebe na água', type: 'checkbox', options: ['Cor amarelada / barrenta', 'Ferrugem (água avermelhada, gosto de ferro)', 'Cheiro', 'Gosto ruim', 'Salobra', 'Sem problema aparente', 'Aguardando análise laboratorial'], alerta: ['Ferrugem (água avermelhada, gosto de ferro)', 'Salobra'] },
      { key: 'riscos',    label: 'Riscos perto da fonte', type: 'checkbox', options: ['Fossa', 'Lixão / descarte de lixo', 'Esgoto a céu aberto', 'Criação de animais', 'Lavoura com agrotóxico', 'Nenhum identificado'], alerta: ['Fossa', 'Lixão / descarte de lixo', 'Esgoto a céu aberto', 'Criação de animais', 'Lavoura com agrotóxico'] },
      { key: 'gps',       label: 'Coordenadas GPS da fonte (poço, captação)', type: 'gps' },
      { key: 'obs',       label: 'Notas e observações', type: 'textarea', rows: 2 }
    ]
  },
  {
    id: 'e4', emoji: '🥤', title: 'Água de beber hoje',
    fields: [
      { key: 'comoBebem',   label: 'De onde vem a água que alunos e equipe bebem', type: 'checkbox', options: ['Bebedouro ligado direto na torneira', 'Bebedouro com refil / filtro', 'Filtro de barro', 'Água mineral em galão', 'Garrafa trazida de casa', 'Torneira direto', 'Outro'] },
      { key: 'comoBebemOutro', label: 'Qual outra forma?', type: 'text', conditional: { field: 'comoBebem', operator: 'includes', value: 'Outro' } },
      { key: 'bebedouros',  label: 'Bebedouros existentes', type: 'number', unit: 'bebedouros' },
      { key: 'estadoBebedouros', label: 'Estado dos bebedouros', type: 'radio', options: ['Funcionam bem', 'Funcionam com problema', 'Quebrados', 'Não tem'] },
      { key: 'trocaRefil',  label: 'A escola troca refil de carvão do bebedouro?', type: 'radio', options: ['Sim', 'Não', 'Não se aplica'] },
      { key: 'refilFreq',   label: 'De quanto em quanto tempo troca o refil?', type: 'text', placeholder: 'Ex.: a cada 2 meses', conditional: { field: 'trocaRefil', operator: 'equals', value: 'Sim' } },
      { key: 'refilCusto',  label: 'Custo de cada troca de refil', type: 'number', unit: 'reais', conditional: { field: 'trocaRefil', operator: 'equals', value: 'Sim' } },
      { key: 'compraAgua',  label: 'A escola ou os servidores compram água?', type: 'radio', options: ['Sim', 'Não'] },
      { key: 'oQueCompra',  label: 'O que compram', type: 'checkbox', options: ['Galão de água mineral', 'Garrafinhas / fardos', 'Caminhão pipa', 'Outro'], conditional: { field: 'compraAgua', operator: 'equals', value: 'Sim' } },
      { key: 'oQueCompraOutro', label: 'O que mais compram?', type: 'text', conditional: { field: 'oQueCompra', operator: 'includes', value: 'Outro' } },
      { key: 'gastoMes',    label: 'Quanto gastam por mês comprando água (somando galão, caminhão pipa e o resto)', type: 'number', unit: 'reais por mês', conditional: { field: 'compraAgua', operator: 'equals', value: 'Sim' } },
      { key: 'galoesSemana', label: 'Galões de 20 L por semana', type: 'number', unit: 'galões', conditional: { field: 'oQueCompra', operator: 'includes', value: 'Galão de água mineral' } },
      { key: 'compraPara',  label: 'Para quem é a água comprada?', type: 'radio', options: ['Para todos', 'Só sala dos professores / administração', 'Só educação infantil', 'Cozinha'], conditional: { field: 'compraAgua', operator: 'equals', value: 'Sim' } },
      { key: 'quemPaga',    label: 'Quem paga?', type: 'radio', options: ['Escola', 'Secretaria', 'Servidores fazem vaquinha'], conditional: { field: 'compraAgua', operator: 'equals', value: 'Sim' } },
      { key: 'notaAgua',    label: 'Nota da direção para a água que bebem hoje (0 a 10)', type: 'number' },
      { key: 'obs',         label: 'Notas e observações', type: 'textarea', rows: 2 }
    ]
  },
  {
    id: 'e5', emoji: '🍽️', title: 'Cozinha e merenda',
    fields: [
      { key: 'refeicoesDia', label: 'Refeições servidas por dia', type: 'number', unit: 'refeições' },
      { key: 'sucoDia',     label: 'Suco preparado por dia', type: 'number', unit: 'litros' },
      { key: 'aguaPreparo', label: 'Água usada no preparo da merenda', type: 'checkbox', options: ['Torneira (rede ou poço)', 'Água filtrada', 'Água mineral', 'Água fervida', 'Outra'] },
      { key: 'merendeiras', label: 'Merendeiras / equipe de cozinha', type: 'number', unit: 'pessoas' },
      { key: 'pontoCozinha', label: 'Dá para levar a água tratada até a cozinha?', type: 'radio', options: ['Sim, torneira ao lado do bebedouro', 'Sim, ponto dentro da cozinha', 'Não', 'Avaliar na instalação'] },
      { key: 'obs',         label: 'Notas e observações', type: 'textarea', rows: 2 }
    ]
  },
  {
    id: 'e6', emoji: '🔬', title: 'Qualidade da água e saúde',
    fields: [
      { key: 'tratamento',  label: 'A escola trata a água hoje?', type: 'checkbox', options: ['Não trata', 'Refil / filtro', 'Cloro na caixa d’água', 'Fervura', 'Outro'] },
      { key: 'limpezaCaixa', label: 'Última limpeza da caixa d’água', type: 'radio', options: ['Menos de 6 meses', '6 meses a 1 ano', 'Mais de 1 ano', 'Não sabem'] },
      { key: 'amostras',    label: 'Amostras coletadas para análise laboratorial?', type: 'radio', options: ['Sim', 'Não', 'Coletar depois'] },
      { key: 'pontosColeta', label: 'Pontos de coleta', type: 'textarea', rows: 2, conditional: { field: 'amostras', operator: 'equals', value: 'Sim' }, placeholder: 'Torneira da cozinha, bebedouro, poço' },
      { key: 'casos',       label: 'Nos últimos 3 meses, houve alunos com diarreia, vômito ou dor de barriga que a escola liga à água?', type: 'radio', options: ['Sim', 'Não', 'Não sabem'] },
      { key: 'casosQtd',    label: 'Quantos casos?', type: 'number', unit: 'casos', conditional: { field: 'casos', operator: 'equals', value: 'Sim' } },
      { key: 'faltas',      label: 'Faltas ligadas a esses casos', type: 'number', unit: 'dias de falta', conditional: { field: 'casos', operator: 'equals', value: 'Sim' } },
      { key: 'sazonal',     label: 'A água muda na seca ou na época de chuva?', type: 'radio', options: ['Sim', 'Não', 'Não sabem'] },
      { key: 'sazonalDesc', label: 'O que muda e o que a escola faz', type: 'textarea', rows: 2, conditional: { field: 'sazonal', operator: 'equals', value: 'Sim' }, placeholder: 'Cor, barro, falta d’água; compra mineral, limpa filtros' },
      { key: 'obs',         label: 'Notas e observações', type: 'textarea', rows: 2 }
    ]
  },
  {
    id: 'e7', emoji: '🏗️', title: 'Estrutura e local da EAS',
    fields: [
      { key: 'andares',     label: 'Andares do prédio', type: 'number', unit: 'andares' },
      { key: 'caixa',       label: 'Onde fica a caixa d’água', type: 'radio', options: ['Torre elevada', 'Sobre o telhado', 'No chão / cisterna', 'Não tem caixa d’água'], alerta: ['No chão / cisterna', 'Não tem caixa d’água'] },
      { key: 'caixaLitros', label: 'Capacidade da caixa d’água', type: 'number', unit: 'litros' },
      { key: 'caixaDist',   label: 'Distância da caixa até o local da EAS', type: 'number', unit: 'm' },
      { key: 'pressao',     label: 'Pressão da água na torneira mais perto do local', type: 'radio', options: ['Forte', 'Média', 'Fraca', 'Falta água em alguns horários'], alerta: ['Fraca', 'Falta água em alguns horários'] },
      { key: 'bomba',       label: 'Tem bomba ou pressurizador?', type: 'radio', options: ['Sim', 'Não'] },
      { key: 'local',       label: 'Local proposto para a EAS', type: 'textarea', rows: 2, placeholder: 'Refeitório, pátio, corredor; por que este lugar' },
      { key: 'localGps',    label: 'Coordenadas GPS do local', type: 'gps' },
      { key: 'pontoAgua',   label: 'Tem ponto de água no local?', type: 'radio', options: ['Sim', 'Não, precisa puxar'], alerta: ['Não, precisa puxar'] },
      { key: 'tomada',      label: 'Tem tomada no local?', type: 'radio', options: ['Sim', 'Não, precisa puxar'], alerta: ['Não, precisa puxar'] },
      { key: 'tensao',      label: 'Tensão da tomada', type: 'radio', options: ['127 V', '220 V', 'Não sabem'] },
      { key: 'cobertura',   label: 'O local é coberto?', type: 'radio', options: ['Sim', 'Não', 'Parcial'] },
      { key: 'reforma',     label: 'Há obra ou reforma prevista nos próximos meses?', type: 'radio', options: ['Sim', 'Não', 'Não sabem'], alerta: ['Sim'] },
      { key: 'reformaDesc', label: 'Qual obra e quando termina?', type: 'textarea', rows: 2, conditional: { field: 'reforma', operator: 'equals', value: 'Sim' } },
      { key: 'obs',         label: 'Notas e observações', type: 'textarea', rows: 2 }
    ]
  },
  {
    id: 'e8', emoji: '🤝', title: 'Manutenção e educação',
    fields: [
      { key: 'manutencao',  label: 'Quem vai cuidar da manutenção (nome e função)', type: 'textarea', rows: 2, placeholder: 'Normalmente a equipe de serviços gerais' },
      { key: 'engajamento', label: 'Engajamento da direção', type: 'radio', options: ['Alto', 'Médio', 'Baixo'] },
      { key: 'espacoOficina', label: 'Espaço para a Oficina WASH', type: 'checkbox', options: ['Sala de aula', 'Refeitório', 'Biblioteca', 'Quadra', 'Pátio'] },
      { key: 'turmasOficina', label: 'Turmas e faixas etárias para a oficina', type: 'textarea', rows: 2, placeholder: 'Grupos de até 50 alunos da mesma faixa etária' },
      { key: 'relatos',     label: 'Relatos da direção, professores e alunos', type: 'textarea', rows: 3 },
      { key: 'obs',         label: 'Notas e observações', type: 'textarea', rows: 2 }
    ]
  },
  {
    id: 'e9', emoji: '📋', title: 'Conclusões preliminares',
    fields: [
      { key: 'viabilidade', label: 'A escola está apta para a instalação?', type: 'radio', options: ['Apta', 'Apta com ressalvas', 'Não apta'], alerta: ['Não apta'] },
      { key: 'qtdEas',      label: 'Quantidade de EAS sugerida', type: 'number', unit: 'EAS' },
      { key: 'resumo',      label: 'Percepções gerais da equipe', type: 'textarea', rows: 3 },
      { key: 'recomendacoes', label: 'Recomendações iniciais', type: 'textarea', rows: 3, placeholder: 'Pressurizador, filtro complementar, troca de conexões, outro local' },
      { key: 'pendencias',  label: 'Pendências (o que falta coletar)', type: 'textarea', rows: 2 },
      { key: 'obs',         label: 'Notas e observações', type: 'textarea', rows: 2 }
    ]
  }
];

/* Escopos: cada aba da tela inicial é um tipo de diagnóstico.
   Projeto sem "escopo" (os antigos) é de comunidades. */
const SCOPES = {
  comunidade: {
    id: 'comunidade', aba: 'Comunidades', emoji: '🏘️',
    projectFields: PROJECT_FIELDS, sections: SECTIONS,
    unidade: 'núcleo', unidades: 'núcleos', Unidade: 'Núcleo', Unidades: 'Núcleos',
    novo: 'Novo núcleo', nenhum: 'Nenhum núcleo ainda.', semNome: 'Núcleo sem nome',
    subtitulo: '(vilas, cidades, áreas)', exemploNome: 'Ex.: Vila 1, Lucira, Aldeia Trocará',
    exemploVazio: 'Ex.: na MRN, cada vila é um núcleo; em Angola, cada cidade.',
    exemploProjeto: 'Ex.: MRN, Comunidade do Ajudante',
    hero: 'Crie um projeto por diagnóstico (ex.: MRN, Angola) e um núcleo para cada vila, cidade ou área visitada.',
    visitados: 'Núcleos visitados',
    resumo: [
      { label: 'Moradores', curto: 'moradores', get: d => (d.s2 || {}).moradores },
      { label: 'Frequentadores da EAS', curto: 'na EAS', get: d => (d.s2 || {}).frequentadores },
      { label: 'Fontes de água', get: d => ((d.s3 || {}).fontes || []).length || '' }
    ]
  },
  escola: {
    id: 'escola', aba: 'Escolas', emoji: '🏫',
    projectFields: SCHOOL_PROJECT_FIELDS, sections: SCHOOL_SECTIONS,
    unidade: 'escola', unidades: 'escolas', Unidade: 'Escola', Unidades: 'Escolas',
    novo: 'Nova escola', nenhum: 'Nenhuma escola ainda.', semNome: 'Escola sem nome',
    subtitulo: '(uma por unidade escolar)', exemploNome: 'Ex.: EMEIF Pedro Demo',
    exemploVazio: 'Cadastre cada unidade escolar visitada.',
    exemploProjeto: 'Ex.: Água nas Escolas, Belém',
    hero: 'Crie um projeto por diagnóstico (ex.: Água nas Escolas, Belém) e cadastre cada escola visitada.',
    visitados: 'Escolas visitadas',
    resumo: [
      { label: 'Alunos', curto: 'alunos', get: d => (d.e2 || {}).alunos },
      { label: 'Professores', curto: 'professores', get: d => (d.e2 || {}).professores },
      { label: 'Situação', get: d => (d.e9 || {}).viabilidade }
    ]
  }
};

function scopeOf(p) { return SCOPES[(p && p.escopo) || 'comunidade'] || SCOPES.comunidade; }

/* Helpers derivados do schema */
function sectionById(id) { return SECTIONS.find(s => s.id === id) || SCHOOL_SECTIONS.find(s => s.id === id); }

function sectionFields(sec) { return sec.isArray ? sec.itemFields : sec.fields; }

function condSatisfied(cond, data) {
  if (!cond) return true;
  const v = data ? data[cond.field] : undefined;
  if (cond.operator === 'equals')    return v === cond.value;
  if (cond.operator === 'notEquals') return v !== undefined && v !== '' && v !== cond.value;
  if (cond.operator === 'includes')  return Array.isArray(v) && v.includes(cond.value);
  return true;
}

function isFilled(v) {
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  return String(v).trim() !== '';
}

/* Progresso: % de campos obrigatórios preenchidos no núcleo */
function nucleoProgress(nucleo, sections) {
  let total = 0, filled = 0;
  for (const sec of (sections || SECTIONS)) {
    const data = (nucleo.dados || {})[sec.id] || {};
    if (sec.isArray) {
      const items = data[sec.arrayKey] || [];
      const req = sec.itemFields.filter(f => f.required);
      if (items.length === 0) { total += req.length; continue; }
      for (const item of items) {
        for (const f of req) {
          if (!condSatisfied(f.conditional, item)) continue;
          total++; if (isFilled(item[f.key])) filled++;
        }
      }
    } else {
      for (const f of sec.fields.filter(f => f.required)) {
        if (!condSatisfied(f.conditional, data)) continue;
        total++; if (isFilled(data[f.key])) filled++;
      }
    }
  }
  return total === 0 ? 0 : Math.round((filled / total) * 100);
}

/* Uma seção tem conteúdo? (para o ✓ e para o relatório) */
function sectionHasData(sec, dados) {
  const data = (dados || {})[sec.id] || {};
  if (sec.isArray) {
    const items = data[sec.arrayKey] || [];
    return items.some(it => sec.itemFields.some(f => isFilled(it[f.key])));
  }
  return sec.fields.some(f => isFilled(data[f.key]));
}

/* Pontos de atenção: respostas marcadas com "alerta" no schema.
   Aprendizado do Água nas Escolas Belém: pressão baixa, ferrugem e
   obra prevista passaram pelo pré-projeto sem ninguém notar. */
function alertasDe(dados, sections) {
  const out = [];
  const check = (f, v, prefixo) => {
    if (!f.alerta || !isFilled(v)) return;
    const hits = (Array.isArray(v) ? v : [v]).filter(x => f.alerta.includes(x));
    if (hits.length) out.push(prefixo + f.label.replace(/\?$/, '') + ': ' + hits.join(', '));
  };
  for (const sec of sections) {
    const data = (dados || {})[sec.id] || {};
    if (sec.isArray) {
      (data[sec.arrayKey] || []).forEach((it, i) => {
        const prefixo = sec.itemLabel + ' ' + (i + 1) + (it.nome ? ' (' + it.nome + ')' : '') + ', ';
        sec.itemFields.forEach(f => { if (condSatisfied(f.conditional, it)) check(f, it[f.key], prefixo); });
      });
    } else {
      sec.fields.forEach(f => { if (condSatisfied(f.conditional, data)) check(f, data[f.key], ''); });
    }
  }
  return out;
}
