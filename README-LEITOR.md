# Leitor de mangás no GitHub Pages

O site continua hospedado no GitHub Pages. Abra a aba Leitor, pesquise um título, escolha a obra e o idioma e abra um capítulo. A busca usa MangaDex e Kitsu (catálogo), com AniList como auxílio para nomes alternativos. Capítulos do MangaDex são lidos dentro do site; MANGA Plus, Comikey, Tappytoon e WebNovel, entre outros serviços reconhecidos, abrem o leitor oficial. O número de capítulos depende da fonte e do idioma.

O módulo js/reader-sources.js adapta as fontes no navegador. No domínio github.io, js/reader.js usa esse módulo e o proxy público de API/imagens já existente em wild-hall-382b.hugoq3310.workers.dev. Não há backend Node executando no GitHub Pages. A indisponibilidade desse proxy ou da fonte é informada no leitor. server/reader.mjs reexporta o mesmo adaptador para outros ambientes; não é necessário ao Pages.

A lista não é mais cortada em500 registros. Há carregar mais/carregar todos disponíveis, ordem primeiros/últimos, grupos/versões, idioma, leitura por página/rolagem, qualidade de imagem, temas, zoom e retomada de progresso. Dados da biblioteca e arquivos EPUB/PDF/TXT/CBZ continuam no navegador do usuário. O cache foi atualizado e ignora a API/autenticação.

## Testes

Node24, npm install e npm test. Foram validadas buscas em7 obras e capas/páginas reais de6 na adaptação original. A adaptação do Pages passou25 testes e consultas reais com Origin do GitHub Pages para One Piece, SPY×FAMILY e Anjou-san, incluindo capas, primeira/última página e headers CORS. Comikey PT-BR também foi verificada. Testes visuais em navegador não foram executados neste ambiente.

Para repetir consultas reais em ambiente com proxy de rede: NODE_USE_ENV_PROXY=1 npm run test:live. A execução faz somente consultas públicas de leitura.
