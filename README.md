# Diagnóstico Camelo

Plataforma de diagnóstico de campo da Água Camelo. Organiza as informações coletadas nas visitas técnicas (MRN, Pumangol/Angola e futuros projetos) em uma estrutura de **Projetos → Núcleos** (vilas, cidades, aldeias, áreas), com fotos, notas, GPS e relatório em PDF.

## Principais características

- **Funciona 100% offline** (PWA): depois do primeiro acesso com internet, o app abre e funciona sem sinal, em qualquer lugar do mundo. Instale pela opção "Adicionar à tela inicial" do navegador.
- **Salvamento automático**: cada toque é gravado no aparelho (IndexedDB). Pode fechar a aba e voltar depois.
- **Fotos e vídeos**: câmera ou galeria, com legenda. Fotos comprimidas (máx. 1600 px); vídeos guardados no original, com capa extraída para miniatura e PDF.
- **Sincronização**: textos sobem primeiro, depois cada foto e cada vídeo, um a um, com tempo limite e nova tentativa a cada minuto. Vídeo vai direto do aparelho para o Google Drive em pedaços de 2 MB (`api/video-upload` abre a sessão) e retoma de onde parou se o sinal cair. Fotos vão para o Supabase e são espelhadas no Drive (`api/drive-mirror`, chamada pelo app e por cron de 5 min no banco).
- **GPS**: captura de coordenadas mesmo sem internet (o GPS do celular não depende de sinal).
- **Relatório em PDF**: "Relatório (PDF)" → "Baixar PDF" gera o arquivo no próprio aparelho com jsPDF (em `js/vendor`, funciona offline): campos, notas, fotos numeradas, capas dos vídeos com link do Drive. No celular abre o Compartilhar (o `window.print()` falha no iPhone com o app instalado); "Imprimir" segue disponível.
- **Backup (.json)**: exporta o projeto inteiro (incluindo fotos) em um arquivo para enviar por WhatsApp/e-mail/Drive; quem recebe usa "Importar backup" e vê tudo.

## Estrutura do formulário

A tela inicial tem duas abas, uma por escopo de diagnóstico. O projeto nasce na aba escolhida (campo `escopo`: `comunidade` ou `escola`; projetos antigos sem o campo são de comunidades).

### Escolas

Cada escola tem 9 seções (`SCHOOL_SECTIONS` em `js/schema.js`), montadas a partir dos relatórios finais do Água nas Escolas (Opella Belém e Sorocaba, 2025):

1. 📍 Identificação da escola (GPS, rede, localização, direção, ponto focal)
2. 👥 Alunos e equipe (etapas de ensino, turnos, alunos por faixa etária, PCD, professores, funcionários)
3. 💧 Abastecimento de água (lista de fontes: tipo, regularidade, problemas percebidos, riscos perto da fonte)
4. 🥤 Água de beber hoje (bebedouros, refil, compra de água: galão, caminhão pipa, gasto por mês)
5. 🍽️ Cozinha e merenda (refeições e suco por dia, água do preparo)
6. 🔬 Qualidade da água e saúde (casos e faltas nos últimos 3 meses, seca e chuva)
7. 🏗️ Estrutura e local da EAS (andares, caixa d'água, pressão, ponto de água, tomada, obra prevista)
8. 🤝 Manutenção e educação (responsável, espaço e turmas da Oficina WASH, que sempre acontece)
9. 📋 Conclusões preliminares (apta ou não, quantidade de EAS)

Campos com `alerta` no schema geram os **Pontos de atenção** da escola (topo da tela, cartão do projeto, relatório e PDF).

### Comunidades

Cada núcleo tem 8 seções (definidas em `js/schema.js`, arquivo único que controla perguntas, tipos, opções e condicionais):

1. 📍 Identificação e território
2. 👥 População e demanda (moradores, frequentadores da EAS)
3. 💧 Fontes de água (lista dinâmica: tipo, contaminação, distância até a EAS, comportamento na estiagem, vazão, GPS)
4. 🏗️ Infraestrutura existente
5. 🔬 Qualidade da água e saúde
6. 🤝 Social e organização
7. 🚰 Local de instalação da EAS
8. 📋 Conclusões preliminares

Para acrescentar/alterar perguntas, edite apenas `js/schema.js` — a interface, o progresso e o relatório se adaptam sozinhos. Depois, aumente a versão do cache em `sw.js` (`diagcamelo-vN`) para os aparelhos atualizarem.

## Arquitetura

- HTML/CSS/JS puro, sem build e sem dependências externas (essencial para o offline).
- `js/db.js` — persistência local (IndexedDB) + backup/import.
- `js/app.js` — rotas, renderização, auto-save, fotos, GPS.
- `js/report.js` — relatório na tela (e impressão).
- `js/pdf.js` — PDF gerado no aparelho.
- `api/` — funções da Vercel: `drive-mirror`, `video-upload`, `apagar`.
- `sw.js` — service worker (cache do shell para offline).

## Testes

Os testes de integração não vão para o deploy (o harness limpa a base local). Para rodar localmente, recrie um harness conforme o histórico do projeto ou peça ao Claude Code.

---

Água Camelo · https://aguacamelo.com.br
