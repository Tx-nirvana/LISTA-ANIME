# Leitor de mangás no GitHub Pages

O site continua hospedado no GitHub Pages. Abra a aba Leitor, pesquise um título, escolha a obra e o idioma e abra um capítulo. A busca usa MangaDex, Comikey e Kitsu (catálogo), com AniList como auxílio para nomes alternativos. Capítulos do MangaDex são lidos dentro do site; MANGA Plus, Comikey, Tappytoon e WebNovel, entre outros serviços reconhecidos, abrem o leitor oficial. O número de capítulos depende da fonte e do idioma.

O módulo js/reader-sources.js adapta as fontes no navegador. No domínio github.io, js/reader.js usa esse módulo e o proxy público de API/imagens já existente em wild-hall-382b.hugoq3310.workers.dev. Não há backend Node executando no GitHub Pages. A indisponibilidade desse proxy ou da fonte é informada no leitor. server/reader.mjs reexporta o mesmo adaptador para outros ambientes; não é necessário ao Pages.

A lista carrega automaticamente todos os registros disponíveis e permite parar e continuar. A contagem distingue números de capítulo e versões/grupos; concluir uma consulta não significa que a obra esteja completa na fonte. Há ordem primeiros/últimos, idioma, leitura por página/rolagem, qualidade, temas, zoom e retomada. Dados da biblioteca e arquivos EPUB/PDF/TXT/CBZ continuam no navegador do usuário.

## Fonte oficial independente

A Comikey agora usa seu próprio índice público de séries/episódios, independente dos links registrados no MangaDex. A consulta de13/10/2026 contém181 obras e12.951 registros de episódios. Solo Leveling tem81 episódios (0–80), enquanto o índice anterior mostrava apenas seis números distintos. Kengan Omega tem376 registros, Latna Saga304 e A Filha do Apotecário408. Esses registros apontam para o leitor oficial, não são páginas internas nem uma garantia de acesso gratuito. A UI informa episódios gratuitos, passes/anúncios e possíveis compras; as condições finais são determinadas pela Comikey.

GitHub Pages não executa backend, e a API de episódios não oferece CORS para este domínio. Por isso, data/reader/comikey.json.gz contém somente metadados públicos e URLs oficiais reconstruídas, sem páginas, contas, tokens nem thumbnails assinadas. O navegador descompacta o índice com DecompressionStream. A data da consulta aparece no leitor. Para atualizar manualmente: NODE_USE_ENV_PROXY=1 node scripts/update-comikey.mjs, revisar a alteração do arquivo e fazer deploy pelo fluxo normal do GitHub. Não foi adicionada atualização automática/agendamento.

Persistem lacunas reais: Naruto não tem páginas PT-BR na fonte integrada, Solo Leveling na Comikey não alcança a numeração completa de outras edições, e algumas obras têm traduções incompletas. ComicK respondeu com listas maiores, mas os capítulos testados devolveram imagens vazias; esse índice não foi contado como leitura funcional.

## Testes

Node24, npm ci e npm test. A revisão passou30 testes, incluindo carregamento automático de650 capítulos, interrupção, troca de fonte, condições de acesso, paginação oficial, segurança, navegação e progresso. Foram verificados12 links de leitor oficial (início/meio/fim em quatro obras) e quatro capas HTTP200, além de buscas, imagens e CORS reais do MangaDex. A verificação dos links oficiais confere HTML/identificador de capítulo, não desbloqueia conteúdo pago. Testes visuais em navegador não foram executados neste ambiente.

Para repetir consultas reais em ambiente com proxy de rede: NODE_USE_ENV_PROXY=1 npm run test:live. A execução faz somente consultas públicas de leitura.
