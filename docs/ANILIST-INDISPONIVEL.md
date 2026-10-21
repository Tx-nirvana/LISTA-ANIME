# Falha de carregamento do catálogo AniList

Em 21/10/2026, uma consulta pública a `https://graphql.anilist.co` retornou HTTP 403 e a mensagem de que a API foi temporariamente desativada por problemas graves de estabilidade. Esse retorno está documentado pelo próprio AniList: https://docs.anilist.co/guide/considerations . No navegador, a mesma indisponibilidade pode aparecer apenas como `Failed to fetch` quando a resposta não fica acessível ao JavaScript.

A correção não restabelece um serviço externo desativado. Ela apresenta orientação em português para indisponibilidade, falha de conexão e limite de consultas, conserva o botão Tentar novamente e orienta acessar Minha biblioteca. Quando existe uma resposta da mesma consulta salva por até sete dias, o cache pode utilizá-la também no caso específico de suspensão HTTP 403 documentado pelo AniList. Outros erros 403 não ativam esse fallback. O aviso identifica consultas salvas e informa que os dados podem estar desatualizados. Respostas de erro não são guardadas como catálogos válidos nem prolongam a validade do cache.

Uma consulta nova sem cache depende da recuperação do AniList. Não foi adicionado proxy público, scraping, chave, provedor substituto ou cópia de outro catálogo. A lista do usuário, notas, favoritos e sincronização não são alterados. WEB Novels continuam com seu catálogo independente.

Validação: 55 testes JavaScript, incluindo suspensão 403, falha de rede, consulta em cache, limite de sete dias, recusa de fallback para 403 comum, preservação dos itens salvos e nova tentativa após a volta da API. A versão dos arquivos e do service worker foi elevada para 30 para entregar a correção aos navegadores com PWA.
