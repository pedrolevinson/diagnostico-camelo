'use strict';
/* =========================================================
   Diagnóstico Camelo — schema do formulário
   Todo o conteúdo (perguntas, tipos, opções, condicionais)
   vive aqui. A UI, o progresso e o relatório derivam disto.
   Baseado nos eixos das propostas de diagnóstico da Água
   Camelo (MRN Ajudante 2026, Axia TI Trocará, Boa Esperança).
   ========================================================= */

const APP_VERSION = '1.0.0';

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

/* Helpers derivados do schema */
function sectionById(id) { return SECTIONS.find(s => s.id === id); }

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
function nucleoProgress(nucleo) {
  let total = 0, filled = 0;
  for (const sec of SECTIONS) {
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
