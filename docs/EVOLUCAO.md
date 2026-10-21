# PWA, aparência, descoberta e perfil público

Esta versão mantém HTML, CSS e JavaScript estáticos, sem backend próprio ou build obrigatório. Os dados antigos da biblioteca, login, sincronização, importação/exportação e estatísticas são preservados. Dar nota continua sem mudar status; filmes só ganham XP quando concluídos.

## Arquitetura escolhida antes da implementação

Por escolha do dono do projeto, foi usada a **opção B**, pois o site já tem sincronização Supabase: um documento público separado por UUID aleatório, com atualização e revogação do mesmo link. Não há link-snapshot como alternativa silenciosa.

`perfil.html` carrega somente configuração pública, validação e renderização. Não carrega app.js, store.js, login, sincronização nem lê o armazenamento local. A tabela de documentos fica no schema `otaku_private`, fora dos schemas expostos. Uma função pública permite ler somente um documento por ID; operações de escrita exigem autenticação e propriedade verificadas por RLS. O documento publicado é uma projeção dos campos da prévia; não é o backup nem uma cópia do localStorage.

**Pendente de configuração:** o projeto Supabase usado no site não está disponível nesta conexão. Não executei SQL em produção nem certifiquei as regras contra o banco real. A prévia funciona localmente; publicar/atualizar/revogar exige o SQL abaixo.

## Configurar o perfil no Supabase

1. No dashboard, abra o MESMO projeto usado pelo site. A referência está na URL de `js/public-config.js`; ela foi copiada da configuração pública já existente, sem chave secreta nova.
2. Abra **SQL Editor**, copie o arquivo completo `sql/public-profiles.sql` e execute. Ele cria apenas a estrutura de documentos públicos e suas funções; não altera a biblioteca privada existente.
3. **Não adicione `otaku_private` aos schemas expostos na Data API.** As funções `public.read_otaku_profile`, `public.publish_otaku_profile` e `public.revoke_otaku_profile` devem estar acessíveis na API pelo schema público já usado pelo projeto. O SQL concede apenas as permissões necessárias.
4. Execute `sql/check-public-profiles.sql`. O bloco de validação não deve lançar erros; a consulta do ID inexistente deve retornar `true`.
5. No aplicativo, use **Entrar → Supabase**. O login legado Google/Drive ou GitHub/Gist continua funcionando para a biblioteca, mas não cria uma sessão Supabase: para publicar por essa arquitetura, é necessária a conta Supabase. Não há conversão automática de contas ou upload automático.
6. Abra **Compartilhar minha biblioteca**, selecione status/tipos/etiquetas/campos, gere a prévia e confira. Anotações privadas vêm desmarcadas. Só depois clique em **Publicar / atualizar link**.
7. Abra o link em janela anônima. Confira filtros, detalhes e ausência de edição. Depois revogue e recarregue a janela anônima: os dados devem sumir. Com uma segunda conta, tente alterar/revogar o ID da primeira; a operação deve ser recusada ou não remover o documento. Valide também login/sincronização após a configuração.
8. Rode os verificadores de segurança do Supabase para o projeto. A única função com SECURITY DEFINER fica no schema privado, tem search_path vazio, recebe um UUID exato e retorna somente o documento. Ela existe para leitura sem login, sem permitir listar a tabela.

Se você trocar de projeto, ajuste `js/public-config.js` com a URL e a chave **anon/publishable pública** do projeto correto. Nunca use service_role ou chave secreta no frontend. A publicação recusa uma configuração local que aponte para um projeto diferente do configurado na página pública.

## Privacidade e comportamento

- O painel avisa: “Qualquer pessoa com o link vê o que você liberou”. Nome e apresentação são opcionais e nunca são preenchidos com e-mail/dados da conta.
- Status e tipo são sempre apresentados; nota, progresso, datas, favoritos e notas privadas são controlados pelo dono. Etiquetas servem para seleção e não são copiadas automaticamente para o documento.
- “Ocultar do perfil público” fica nos detalhes de cada item. As alterações de privacidade só chegam a um link já publicado depois de revisar a prévia e publicar novamente.
- A prévia completa usa a mesma página pública dentro de um iframe de mesma origem e recebe apenas o documento validado por postMessage. Nenhuma publicação ocorre ao abrir a prévia.
- Atualização mantém o endereço. Revogação apaga o documento público; uma nova publicação gera outro UUID. Não apaga capturas, arquivos ou cópias já feitas por terceiros. Uma página aberta reconsulta ao receber foco e a cada minuto enquanto visível; a revogação não é push em tempo real.
- “Meus links publicados nesta conta” recupera os IDs pertencentes à sessão Supabase atual, inclusive em outro aparelho, para gerenciar e revogar. Essa listagem exige autenticação e RLS; visitantes não podem listar perfis. As escolhas de filtros ficam no navegador e devem ser revistas na prévia antes de atualizar um link recuperado.
- O documento público não é guardado offline: sem rede, a página oculta o conteúdo para não fingir que confirmou uma revogação. Capas são imagens públicas e podem permanecer no cache do navegador.
- Textos são escapados; campos e tipos são validados; URLs aceitam somente HTTP(S), sem credenciais ou parâmetros conhecidos de autenticação. O payload é limitado a 5.000 itens e cerca de 1,9 MB. O banco também impõe limite de 2 MB.
- As metas sociais são genéricas. GitHub Pages e robôs de prévia não executam necessariamente JavaScript nem recebem o fragmento `#UUID`; não é possível garantir título/capa personalizados em WhatsApp ou redes sociais sem renderização no servidor.
- O QR é gerado no navegador por uma cópia local fixa do qrcode-generator 2.0.4 (MIT), carregada sob demanda. O link não é enviado a um gerador externo. A licença acompanha `js/vendor/`.

## Instalação e cache

- Manifest com identidade, escopo e modo standalone; ícones PNG 192/512; botão **Instalar app** com instruções de fallback para iPhone e navegadores sem evento de instalação.
- Núcleo versionado no service worker para abrir offline. A biblioteca continua no armazenamento local existente; não é colocada em um cache HTTP.
- Até 60 capas recentes são guardadas, incluindo imagens de outras origens quando permitido. As mais antigas são descartadas para limitar consumo. Respostas opacas e quota do navegador podem impedir guardar todas as imagens. Uma capa ausente usa o ícone local.
- O catálogo público usa rede primeiro, conservando a última cópia bem-sucedida para offline. Atualizações não dependem de URLs com timestamp.
- APIs de catálogo permitidas recebem cache com expiração de 24 horas, até 80 entradas e 1 MB por resposta; uma cópia de até sete dias pode ser usada quando a rede falha. Autenticação, Drive, Gist, Supabase e perfis públicos não entram nesse cache. Chaves de cache são hashes, não URLs com credenciais.
- Imagens dos cartões são preguiçosas; a biblioteca principal e as abas extras usam lotes de 60; o perfil usa lotes de 48; recomendações usam lotes de 12. Contagens e filtros continuam abrangendo todos os itens.
- Aviso acessível de offline, dados e anotações salvos nos detalhes disponíveis sem esperar tradução, fallback de instalação e de imagem.

Armazenamento de PWA continua sujeito a limpeza manual, modo privado e políticas de espaço do navegador. Exportar a biblioteca continua recomendado. Não foi prometido um número de segundos de abertura em hardware que não foi medido.

## Aparência e usabilidade

O botão **Aparência** permite grade/lista, três tamanhos, escuro atual/claro/AMOLED e cor de destaque. As escolhas usam a nova chave `otaku-ui-v1`; nenhuma chave anterior é renomeada. A cor do texto dos botões se adapta à luminosidade do destaque, e o foco tem contorno de contraste.

Detalhes mantêm capa maior, sinopse, gêneros, fontes, nota, progresso e anotações, com layout adaptável. Atalhos: `/` busca, `A` adiciona a obra aberta, `F` favorita a obra aberta, `Esc` fecha; não são acionados durante digitação. Foco, rótulos, teclado e leitor de tela são preservados. Animações e rolagem suave respeitam reduzir movimento.

## Descoberta local

As sugestões recebem candidatos públicos genéricos por tipo. O navegador compara gêneros, etiquetas das obras favoritas/bem avaliadas e notas, exclui obras já presentes por ID/título e itens marcados “Não me interessa”, e explica a sugestão. As notas, os títulos da biblioteca e as etiquetas não são enviados como sementes de recomendações. A sincronização pessoal já existente continua opcional e independente.

**Me surpreenda** tem tipo, gênero, curto e diferente. “Curto” exige duração conhecida: até 13 episódios, 50 capítulos de quadrinhos, 100 de novels, 250 páginas de livro, 100 minutos de filme ou 10 horas de jogo. Se a fonte não informa duração, o item não passa nesse filtro. “Diferente” reduz a preferência por gêneros frequentes; não usa serviço de IA remoto.

Recomendações dependem do conjunto genérico disponível nas APIs/cache e do catálogo local; não garantem encontrar toda obra existente. Chaves TMDB/RAWG continuam as que o usuário já configura nas abas correspondentes. Sem internet, usam somente candidatos disponíveis.

## WEB Novels

O catálogo entregue contém 1.198 obras após incorporar as atualizações automáticas recebidas durante o trabalho. Foram consultados metadados de nove obras selecionadas, com seis correspondências no Kitsu. Duplicatas e fontes foram agrupadas por identidade da obra. A URL principal antiga é preservada para estabilidade; itens já salvos na biblioteca não são apagados, e importar catálogo não cria outra cópia só por mudar de fonte.

O build amplia a coleta por Xianxia/Xuanhuan/Wuxia, alterna a ordem de descoberta, limita páginas/obras/metadados por execução, respeita robots/crawl-delay, aplica espera e tentativas limitadas e registra falhas por fonte. Mantém registros antigos mesmo em falhas parciais, faz mesclagem/deduplicação, recusa saída vazia e grava atomicamente. Não baixa capítulos.

A versão automática recebida também continha nomes de gêneros usados como títulos e links de capítulos tratados como obras. A entrega remove 48 URLs inválidos da descoberta e documenta esses casos em docs/CATALOGO-REJEITADOS.json. Nomes recuperados de URLs, com metadados não confirmados removidos, estão documentados em docs/CATALOGO-TITULOS-CORRIGIDOS.json. São alterações apenas do catálogo, sem apagar itens salvos dos usuários. O JSON caiu de 2.708.553 bytes para cerca de 0,94 MB antes de compressão HTTP.

O Kitsu fornece capa/sinopse/nota/categorias e autoria quando disponibiliza esses metadados e há correspondência de título. Nomes chineses não são reduzidos a uma identidade vazia. O build verifica uma quantidade limitada de links por HEAD: somente 404/410 significam quebrado; bloqueio/timeout ficam como desconhecidos. O aviso nos detalhes reflete a última verificação do catálogo e pode estar desatualizado. Alguns links ainda não foram verificados automaticamente.

Os detalhes dão acesso às obras do autor presentes no catálogo. A bibliografia pode estar incompleta nas fontes; não se inventam obras ou vínculos de autoria. O zip wlnupdates-master não foi recebido, portanto nenhum código/dado dele foi incorporado.

GitHub Actions conserva as permissões existentes de contents:write, adiciona exclusão de execuções concorrentes, limites, logs sem buffering e validação JSON antes do commit. Os limites podem ser ajustados nas variáveis CATALOG_MAX_PAGES, CATALOG_MAX_DETAILS, CATALOG_METADATA_LIMIT e CATALOG_CHECK_LINKS.

## Como testar

1. Exporte uma cópia da biblioteca atual e use primeiro uma pasta/navegador de teste. Sirva os arquivos por HTTP local, por exemplo `python -m http.server 8080`; file:// não permite uma PWA completa. Produção exige HTTPS.
2. Adicione, altere status, dê nota, favorite, filtre, busque e exporte/reimporte. Confira Livros e Filmes, Jogos e Estatísticas. Troque tema/grade/lista/tamanho, recarregue e confirme persistência.
3. Visite online, aguarde o service worker e recarregue. Depois ative Offline nas ferramentas do navegador e reabra: biblioteca, sinopses salvas e capas cacheadas devem aparecer com aviso. Faça uma anotação offline e reconecte; confirme persistência e sincronização na sua conta de teste.
4. Em Android/Chrome ou Edge, teste **Instalar app**; em iPhone/Safari use Compartilhar → Adicionar à Tela de Início. No celular físico, teste teclado quando disponível, foco, modais, temas e rolagem. A instalação real no sistema operacional não foi executada nesta sessão.
5. Teste perfil, conta anônima, revogação e propriedade seguindo os passos do Supabase acima. Nunca use a biblioteca pessoal como primeiro teste de privacidade.
6. Testes de desenvolvimento: `npm ci`, `npm test`, `python -m unittest discover -s tests -p catalog_test.py`. Não são necessários para usar/hospedar o site.

Validação desta entrega: 48 testes JavaScript e 12 Python; sintaxe e diff; navegador real em desktop e viewport de 390 px; a conferência final em 320 px ficou pendente por indisponibilidade da automação de navegador. Publicação e revogação foram simuladas com respostas controladas. Não houve teste de autenticação real nem execução do SQL no projeto indisponível; o scraping completo não foi executado, somente consultas limitadas de metadados ao Kitsu. Não houve alteração de contas ou bibliotecas pessoais.

## Arquivos e publicação

Arquivos novos de frontend: `css/features.css`, `js/features-core.js`, `js/features.js`, `js/discovery.js`, `js/public-model.js`, `js/public-config.js`, `js/sharing.js`, `js/profile.js`, `perfil.html`, `icons/icon-192.png`, `icons/icon-512.png`, `js/vendor/qrcode.js` e sua licença.

Também há `scripts/catalog-seeds.json`, SQL de configuração/conferência, testes e este guia. Os caminhos no ZIP correspondem ao repositório. O ZIP contém arquivos completos, sem omissões, sem node_modules e sem segredos novos. Não remova os arquivos anteriores não citados.

As correções estão em uma proposta de revisão. Antes de mesclar/publicar esta evolução, configure e valide o banco. Não é necessário criar backend, instalar dependências de produção ou cadastrar chaves novas para PWA/aparência; o perfil usa apenas a configuração pública existente e uma sessão Supabase autenticada.

Referências: [instalação PWA](https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent), [Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache), [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [modelo de autoria Kitsu](https://api.github.com/repos/hummingbird-me/kitsu-server/contents/app/models/manga_staff.rb), [qrcode-generator MIT](https://github.com/kazuhikoarase/qrcode-generator).
