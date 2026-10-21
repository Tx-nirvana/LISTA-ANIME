# PWA, aparência, descoberta e perfil público

Esta versão mantém HTML, CSS e JavaScript estáticos, sem backend próprio ou build obrigatório. Os dados antigos da biblioteca, login, sincronização, importação/exportação e estatísticas são preservados. Dar nota continua sem mudar status; filmes só ganham XP quando concluídos.

## Arquitetura escolhida antes da implementação

Por escolha do dono do projeto, foi usada a **opção B**, pois o site já tem sincronização Supabase: um documento público separado por UUID aleatório, com atualização e revogação do mesmo link. Não há link-snapshot como alternativa silenciosa.

`perfil.html` carrega somente configuração pública, validação e renderização. Não carrega app.js, store.js, login, sincronização nem lê o armazenamento local. A tabela de documentos fica no schema `otaku_private`, fora dos schemas expostos. Uma função pública permite ler somente um documento por ID; operações de escrita exigem autenticação e propriedade verificadas por RLS. O documento publicado é uma projeção dos campos da prévia; não é o backup nem uma cópia do localStorage.

**Configurado em 21/10/2026:** por autorização do dono, os perfis usam o projeto antes vazio SHIPPING-AZUL, referência `csuerfegjbfjbmbmgffg`, da conexão TXN. O nome do projeto foi preservado. A tabela, funções e RLS foram criadas e verificadas no banco real. O projeto antigo da sincronização privada não está acessível; nenhuma conta, chave ou biblioteca privada anterior foi migrada.

## Conta e configuração dos perfis

1. No site, abra **Compartilhar minha biblioteca**. Use **Criar conta de compartilhamento** com e-mail e senha, confirme o e-mail e depois entre no mesmo painel. A conta Supabase do dashboard não é automaticamente uma conta de usuário do aplicativo. O login de biblioteca pelo botão Entrar continua independente.
2. O envio de e-mail usa o serviço padrão do Supabase: ele restringe destinatários aos membros da organização e tem limites baixos. Para permitir cadastro/recuperação de qualquer pessoa, o dono precisa configurar um provedor SMTP em Authentication → Emails → SMTP Settings. Nenhuma credencial SMTP foi fornecida ou inventada. A confirmação de e-mail não foi desativada. Erros de destinatário/limite são apresentados no painel.
3. Foram salvos Site URL `https://tx-nirvana.github.io/LISTA-ANIME/` e o retorno exato `https://tx-nirvana.github.io/LISTA-ANIME/conta-perfil.html`, sem curingas. A página de confirmação carrega somente configuração pública e autenticação do perfil, remove os tokens da URL e valida a sessão no projeto correto antes de guardar os tokens.
4. A sessão do compartilhamento usa exclusivamente `otaku-profile-session-v1:csuerfegjbfjbmbmgffg.supabase.co`. Não guarda a senha nem o e-mail e não altera `otaku-supabase-session-v1`, as sessões Google/GitHub, a biblioteca ou o backup. Sair encerra somente a sessão de compartilhamento. Sem rede, uma falha temporária de renovação preserva a sessão.
5. Selecione status/tipos/etiquetas/campos, gere a prévia e confira. Anotações privadas vêm desmarcadas. Só depois clique em **Publicar / atualizar link**. Nenhuma biblioteca pessoal foi publicada durante a implementação.
6. Abra o link em janela anônima; confira filtros, detalhes e ausência de edição. Depois revogue e recarregue: os dados devem sumir. O banco foi testado com duas identidades temporárias, desfeitas por rollback: a segunda não consegue listar, alterar ou revogar os links da primeira. Visitantes só leem por UUID.
7. `sql/public-profiles.sql` contém a estrutura completa; `sql/check-public-profiles.sql` confere permissões; `sql/test-public-profiles.sql` repete os testes de isolamento, projeção, atualização e revogação com rollback. O schema `otaku_private` deve continuar fora dos schemas expostos. A API HTTP foi conferida: leitura de UUID inexistente retorna 200/null e acesso direto ao schema privado é recusado.
8. Verificadores do Supabase: nenhum aviso de desempenho. Segurança mantém dois avisos preexistentes sobre a função de evento `public.rls_auto_enable`, criada pelo projeto, sem avisos novos das funções de perfil. Não foi alterada essa função de infraestrutura. Referências: [aviso anon](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [aviso authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Somente a URL e a chave publishable pública do projeto aparecem em `js/public-config.js`. Não há service_role ou segredo novo. Não configure esse projeto como sincronização privada sem uma migração planejada; este ajuste é exclusivo dos perfis.

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

Validação desta entrega: 52 testes JavaScript e 12 Python; sintaxe e diff; navegador real em desktop e 320/390 px. SQL e isolamento de duas identidades conferidos no banco configurado, com rollback das fixtures. API pública e bloqueio de acesso direto conferidos por HTTP. Login/renovação/logout e confirmação do perfil têm testes controlados; nenhum e-mail real ou senha pessoal foi usado; o scraping completo não foi executado, somente consultas limitadas de metadados ao Kitsu. Não houve alteração de contas ou bibliotecas pessoais.

## Arquivos e publicação

Arquivos novos de frontend: `css/features.css`, `js/features-core.js`, `js/features.js`, `js/discovery.js`, `js/public-model.js`, `js/public-config.js`, `js/sharing.js`, `js/profile.js`, `js/profile-auth.js`, `conta-perfil.html`, `perfil.html`, `icons/icon-192.png`, `icons/icon-512.png`, `js/vendor/qrcode.js` e sua licença.

Também há `scripts/catalog-seeds.json`, SQL de configuração/conferência, testes e este guia. Os caminhos no ZIP correspondem ao repositório. O ZIP contém arquivos completos, sem omissões, sem node_modules e sem segredos novos. Não remova os arquivos anteriores não citados.

Publicação e uso de uma das contas disponíveis autorizados pelo dono. O perfil foi conectado ao projeto vazio sem alterar os fluxos privados existentes. O banco está configurado; para um primeiro uso real, o dono deve criar e confirmar sua conta de compartilhamento no painel do site. Cadastro de pessoas fora da organização depende de SMTP próprio, sem desativar confirmação de e-mail. Não há build obrigatório ou dependência nova de produção.


Referências: [instalação PWA](https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent), [Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache), [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [modelo de autoria Kitsu](https://api.github.com/repos/hummingbird-me/kitsu-server/contents/app/models/manga_staff.rb), [qrcode-generator MIT](https://github.com/kazuhikoarase/qrcode-generator).
