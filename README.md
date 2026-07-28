# Diagnóstico Camelo

Plataforma de diagnóstico de campo da Água Camelo. Organiza as informações coletadas nas visitas técnicas (MRN, Pumangol/Angola e futuros projetos) em uma estrutura de **Projetos → Núcleos** (vilas, cidades, aldeias, áreas), com fotos, notas, GPS e relatório em PDF.

## Principais características

- **Funciona 100% offline** (PWA): depois do primeiro acesso com internet, o app abre e funciona sem sinal, em qualquer lugar do mundo. Instale pela opção "Adicionar à tela inicial" do navegador.
- **Salvamento automático**: cada toque é gravado no aparelho (IndexedDB). Pode fechar a aba e voltar depois.
- **Fotos**: captura pela câmera ou upload da galeria, com legenda, comprimidas automaticamente (máx. 1600 px).
- **GPS**: captura de coordenadas mesmo sem internet (o GPS do celular não depende de sinal).
- **Relatório em PDF**: botão "Relatório (PDF)" gera o documento completo (campos, notas e fotos numeradas) para salvar via impressão nativa do navegador.
- **Backup (.json)**: exporta o projeto inteiro (incluindo fotos) em um arquivo para enviar por WhatsApp/e-mail/Drive; quem recebe usa "Importar backup" e vê tudo.

## Estrutura do formulário

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
- `js/report.js` — relatório imprimível.
- `sw.js` — service worker (cache do shell para offline).

## Testes

Os testes de integração não vão para o deploy (o harness limpa a base local). Para rodar localmente, recrie um harness conforme o histórico do projeto ou peça ao Claude Code.

---

Água Camelo · https://aguacamelo.com.br
