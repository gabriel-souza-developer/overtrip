# Estado da produção na Oracle

## Filtro da lista de TRIPs em Passageiros (27 de novembro de 2026)

- Corrigido o carregamento da tela Passageiros: a chamada enviava `period=all`, valor que a API não aceita. A listagem de todas as TRIPs agora omite esse filtro; `upcoming` e `past` continuam disponíveis nas telas que os usam.
- Publicado somente o painel do commit `5126fb8`; a API e o banco não foram alterados nem reiniciados. Pacote do painel SHA-256 `b39ecca463b3d2ea893a112539b8e121c874c9d69a18b3a219e61d4cb984e14c`. Cópia anterior preservada em `/srv/overtrip/retorno-period-filter-20261127/{admin-live-original,admin-before-fix}`.
- Typecheck e build de produção do frontend passaram. `/`, `/admin/` e `/health` responderam 200; o módulo Passageiros novo respondeu 200; a rota privada sem sessão respondeu 401. API e Caddy permaneceram ativos.

## Cadastro de passageiros e ícone de ônibus (27 de novembro de 2026)

- Publicado API e painel do commit `e5b8c39` na branch `feat/integracao-reservas-n8n`. Pacote de fonte SHA-256 `6898e145124dd19559edf445f0895241e39b1dd15b59b4f835f59507694cf614`; build, typecheck do painel e build de produção foram executados na VM Oracle ARM64. `npm audit --omit=dev` retornou zero vulnerabilidades; a instalação completa reportou seis vulnerabilidades em dependências de desenvolvimento.
- Antes da publicação, backup consistente `/var/backups/overtrip/overtrip-20261127-062232.db.gz`, conferido também em `/home/ztsu-pc/backups-overtrip/pre-passenger-20261127.db.gz` (SHA-256 `a304e45659728a3c5ca7d301058776ab2b0095ce118dfec214ae7fc3199af55c`). A migration foi ensaiada nessa cópia, com `integrity_check: ok` e nenhuma violação de chave estrangeira.
- Aplicadas as migrations `20261129040000_reservation_intake_requests` e `20261130010000_passenger_registry`; `prisma migrate status` ficou atualizado. A API foi parada durante a aplicação. O banco passou por `integrity_check` e `foreign_key_check` sem erros. Código anterior e painel anterior preservados em `/srv/overtrip/retorno-e5b8c39-20261127/{app,admin-before-swap,admin-live-original}`.
- Configurada `PASSENGER_DATA_ENCRYPTION_KEY` em `/etc/overtrip/env`, com permissões root:root 600. O valor não está no repositório nem nos logs; uma cópia local restrita foi mantida fora do projeto. A chave precisa ser preservada em gerenciador seguro separado dos backups do banco.
- Importada a planilha de passageiros por fluxo de memória, sem gravar o arquivo no servidor: 86 respostas processadas, 84 perfis criados diretamente e 2 mesclados; as 19 linhas da lista antiga foram mantidas sem TRIP associada. No banco ficaram 86 perfis com nome cifrado, 19 registros antigos sem associação e zero associações automáticas. Pagamentos e presença históricos não são somados ao Financeiro.
- O menu e cartões de viagens agora usam ícone de ônibus. Verificação após publicação: site, `/admin/`, `/health` e o módulo de Passageiros responderam 200; a API privada de Passageiros sem sessão respondeu 401. Teste local da chave no processo publicado confirmou cifragem e decifragem. API e Caddy ativos.
- O serviço privado de entrada de reservas não foi instalado nem iniciado e o fluxo do n8n não foi alterado. As migrations de reserva foram aplicadas como parte do branch; o endpoint privado continua inativo até uma configuração própria.

## Legenda climática compacta e novos destinos (26 de novembro de 2026)

- No painel, mapa e legenda das regiões da Paraíba agora ficam no mesmo quadro; as seis descrições repetidas foram resumidas a status e janela típica, com uma nota curta sobre previsão, acesso, maré e balneabilidade. Fontes e créditos também foram compactados. O layout mantém o mapa acima da legenda em telas estreitas e lado a lado em telas maiores.
- Incluídos no banco, como ideias ainda não visitadas: **Lagoa do Vital**, em Maxaranguape–RN, e **Lagoa de Jacumã**, em Ceará-Mirim–RN. Os dois registros preservam os links do Instagram e referências legais estaduais; ambos estão com zero visitas/saídas. Distância, acesso e condições permanecem explicitamente pendentes de confirmação.
- O painel foi publicado sem reiniciar a API e sem mudar o banco nesta etapa. Typecheck, build de produção do frontend e `git diff --check` passaram. Pacote final SHA-256 `51effe83b6bc58f8d480b216831dcbd0ba2681c110018ee964515b5768c33ccb`; versão anterior preservada em `/srv/overtrip/retorno-seasonal-compact-20261126-2350-r2/{admin,admin-live-original}`. Após publicar, `/admin/` e `/health` responderam HTTP 200; API e Caddy continuam ativos.

## Restauração da identidade visual OVERTRIP (26 de novembro de 2026)

- A pedido do usuário, a paleta original laranja/cinza foi restaurada integralmente no painel; as alterações para teal e índigo foram revertidas. A correção permanece só na agenda: viagens com fim marcado aparecem em todos os dias do intervalo, inclusive.
- Typecheck e build do frontend passaram. Painel publicado e validado: `/admin/` e `/health` 200; CSS servido voltou a `primary-500: 255 90 0`, `primary-600: 209 72 0` e superfície cinza original. A lógica `endDateISO` continua no bundle. API e banco não foram alterados.
- Pacote SHA-256 `12fae124ea772fa102373df9a6caf26660ce5dbf681f61c5bde1d9e3903a2d63`. Versão índigo preservada em `/srv/overtrip/retorno-panel-orange-restore-20261126-222643/{admin,admin-live-original}`.

## Ajuste da paleta após retorno visual (26 de novembro de 2026)

- A primeira proposta teal foi substituída por **índigo** nas ações, seleções e estados ativos. Os fundos e textos voltaram aos cinzas neutros anteriores; o laranja ficou como detalhe da marca. A cor dos feriados permanece azul, separada dos marcadores redondos de viagem.
- Typecheck e build do frontend passaram. Pacote do painel SHA-256 `ceb9299db71fe02f5738a1abd59fda918ceded799d36a23f5dcff49b7d7ef7d0`. `/admin/` e `/health` responderam 200; o CSS servido confirma índigo (`79 70 229`) e fundo neutro (`250 250 250`). API e banco não mudaram. Painel teal preservado em `/srv/overtrip/retorno-panel-indigo-20261126-222103/{admin,admin-live-original}`.

## Calendário de viagens e paleta do painel (26 de novembro de 2026)

- O calendário agora marca todos os dias entre `startDateISO` e `endDateISO`, incluindo as duas pontas. O camping de **7–8 de fevereiro de 2027** aparece nos dias 7 e 8; a contagem mensal considera IDs únicos para contar essa saída apenas uma vez. A mesma função atende ao calendário do painel de empresas.
- Atualizado o design system do painel: teal nas ações e seleções, neutros slate nas superfícies e textos, e laranja mantido como detalhe da marca. Login, botões, foco, navegação e calendários seguem a mesma paleta; a identidade de cor das agências continua sendo aplicada individualmente.
- Publicado somente o painel. `npm run typecheck:frontend`, `npm run build:frontend` e `git diff --check` nos arquivos alterados passaram. `/admin/` e `/health` responderam 200; o bundle servido contém a escala teal e a lógica de `endDateISO`. API, banco e site público não foram alterados.
- Pacote SHA-256 `4d27c1132213eabf8893ce2bd36343d1883719aa41e2257a9bb356d16c3f0706`. Painel anterior preservado em `/srv/overtrip/retorno-panel-calendar-design-20261126-221607/{admin,admin-live-original}`.

## Modelos persistentes, leitura do painel, PIX e linguagem da marca (26 de novembro de 2026)

- Separadas as ações **Salvar como modelo** e **Usar como modelo** no painel. Salvar grava no banco uma cópia independente dos dados da viagem; para rascunhos, a confirmação oferece **Manter rascunho** ou **Excluir rascunho** e informa que o modelo continuará salvo. A lista de modelos permite reutilizar, baixar o JSON completo e excluir o modelo.
- Salvo o modelo **TRILHA EM LUCENA - PB** no banco (43 campos no snapshot), e só então removido o rascunho de 29/11. A visita real de 18/10, que estava associada por engano ao rascunho, foi preservada sem vínculo; a viagem concluída de 18/10 permaneceu. Não havia reservas, interessados, memórias da galeria ou documentos ligados ao rascunho.
- Publicados API, painel e site. O painel mostra os títulos completos nos cartões de próximas viagens. O mapa de destinos visitados foi movido para mais perto do início do fluxo da página. O botão do PIX é **Pagar por PIX**, e o modal mostra o total e o sinal de 50% calculado em centavos, indicando que o QR estático não preenche o valor automaticamente. Textos editoriais foram alinhados a **TRIP/TRIPs** e **vivência/vivências**.
- Aplicadas as migrações aditivas `20261129020000_trip_profile` e `20261129030000_trip_templates`. Backup pré-publicação em `/var/backups/overtrip/pre-trip-template-20261126.db.gz`, copiado e validado localmente em `/home/ztsu-pc/backups-overtrip/pre-trip-template-20261126.db.gz`; SHA-256 `69d8fdf6cb7484707c4cff9904c237baaabc563ce5fbd46253a763eab2652a09`.
- Retorno de código/painel e arquivos estáticos anteriores em `/srv/overtrip/retorno-trip-template-20261126-215720/{app,admin-live-original,site-files.tar.gz}`. Pacote transferido: `/tmp/trip-template-20261126-215720.tar.gz`, SHA-256 `3dc620288b8346526d0d678f5c63934d538873fd083e97f83b77694b7658631f`.
- Validação local: `npm run typecheck:frontend`, `npm run build:frontend`, `npm run build` e `node --check` nos módulos de PIX/renderização passaram. Em produção, `/`, `/admin/`, `/health`, o mapa climático e `/api/public/trips` responderam 200; `/api/trip-templates` sem sessão respondeu 401. As ações e a confirmação estão presentes nos módulos publicados; API e Caddy ativos. SQLite `integrity_check` retornou `ok`, sem violações de chave estrangeira. O modelo permaneceu depois da exclusão, e a lista pública manteve só as viagens abertas/concluídas já previstas.
- Ajuste posterior solicitado: **Salvar como modelo** foi retirado da linha da viagem e colocado no menu de três pontos, junto de **Usar como modelo**. Painel publicado sem reiniciar a API e sem alterar o banco; typecheck/build passaram, `/admin/` e `/health` responderam 200. Pacote SHA-256 `143662154cc1660958740d3f32082bf2439be5e43d062e1111f17da612fabf88`; retorno em `/srv/overtrip/retorno-template-menu-20261126-221000/{admin,admin-live-original}`.

## Atualização do banco de destinos com a planilha CG Trip (26 de novembro de 2026)

- Os 18 destinos nomeados na mensagem já constavam como não visitados no banco, então não foram duplicados. A única linha adicional sem nome trazia um link do Wikiloc; incluí **Novos caminhos pelo Gentil (Sítio Arqueológico Lajes e Batentes)** como trilha, com o link original. Cidade exata, distância e nível ficaram sem preenchimento para confirmação.
- A planilha confirma que a equipe já visitou a **Cachoeira dos Britos**. Registrei uma saída realizada sem data, passageiros ou valores; associei o link do Maps que estava solto. As notas existentes continuam como relato da equipe: rapel e acampamento; não entraram na água por receio da aparência; propriedade, cobrança e passagem em período chuvoso seguem como pontos a confirmar, não fatos verificados.
- Removido o selo **“Na lista”** dos cartões e a opção redundante do filtro. `IDEA` continua como estado interno; no formulário, aparece como **“Padrão”**, preservando a escolha de prioridade ou descarte.
- Publicado somente o painel administrativo, sem reiniciar a API ou alterar o schema. Pacote SHA-256 `ff95f13ea6ad925ff3982fee8668eb6eef57da2f7737bbf641ca28c31a5d4fad`. Retorno do painel em `/srv/overtrip/retorno-destination-status-20261126-204331/admin`; cópia de segurança SQLite validada depois da transação em `/var/backups/overtrip/post-cgtrip-update-20261126-204331.db.gz`. Checagem de tipos e build do frontend passaram; `/admin/` e `/health` responderam 200; API e Caddy ativos. O bundle servido não contém o texto “Na lista”.

## Diagnóstico da pesquisa sem fontes (26 de novembro de 2026)

- O relato “A busca não retornou fontes que possam ser conferidas” veio de duas condições: a chamada inicial combinava busca web e JSON estruturado, e o fallback automático podia recorrer ao Groq, que não fornece resultados de busca. Separei a pesquisa da síntese estruturada; a síntese só pode citar URLs exatas retornadas na etapa de pesquisa.
- Uma chamada diagnóstica isolada ao Gemini na VM (consulta genérica, sem dados de viagem ou saída de chave) respondeu HTTP 429. O provedor está temporariamente limitando a busca; não foi possível confirmar uma resposta com fontes durante esta atualização. Agora a busca não cai silenciosamente no Groq e o 429 é traduzido para uma mensagem de limite temporário. A análise tem limite de três tentativas por hora e recusa sugestões sem fontes.
- Publicada a revisão do backend. SHA-256 do pacote `bf44816a48e32d28d90f6f4120554e0a89ca8511de00bc98c7f0a2fd81625bdb`; retorno em `/srv/overtrip/retorno-search-fallback-20261126-203544/{dist,admin}`; backup SQLite validado em `/var/backups/overtrip/pre-search-fallback-20261126-203544.db.gz`. `npm run build` e `git diff --check` passaram; `/admin/` e `/health` responderam 200, API e Caddy ativos. Sem migração de banco.

## Ajustes no painel, pesquisa web da IA e calendário de Carnaval (26 de novembro de 2026)

- Corrigido o espaço em branco no calendário: o cartão sazonal não estica mais a linha ao lado; mapa, regiões e fontes ficam numa faixa de largura total abaixo do calendário e do resumo climático. O cartão compacto mantém o botão **Analisar este mês** no mesmo local. Removido o bloco repetido “Ajuda para escolher o próximo destino”.
- A análise usa a busca integrada do Gemini configurado no servidor, sem exigir uma chave de busca à parte. Combina viagens do mês, destinos ainda não visitados e resultados web. Só mostra sugestões com URLs que o Gemini retornou como fontes da busca; cada link é apresentado para conferência. A IA é instruída a não inventar avaliações, data de publicação, preço ou consulta a moradores. A classificação de fontes reconhece sites de turismo, avaliações, páginas oficiais e vídeos/redes sociais quando aparecem nos resultados. Também há links diretos para buscas de avaliações, YouTube, TikTok e Instagram.
- O Carnaval agora aparece no calendário: em 2026, 16 e 17 de fevereiro são exibidos como ponto facultativo federal e 18 de fevereiro como Quarta-feira de Cinzas, ponto facultativo até 14h, conforme a Portaria MGI nº 11.460/2025. Para outros anos, as datas móveis aparecem sem presumir que o calendário federal daquele ano já as tenha classificado. A lista separa feriados nacionais, estaduais da Paraíba, municipais de Campina Grande e datas móveis.
- Pacote SHA-256 `2cf404bec978bdcbb21c18cba56160234a55b4587340f1ddce3d503e3da6c28a`. Retorno do painel e API em `/srv/overtrip/retorno-ai-calendar-20261126-202727/{admin,dist}`; backup SQLite validado em `/var/backups/overtrip/pre-ai-calendar-20261126-202727.db.gz`. Sem migração ou alteração do banco. Build do backend, checagem de tipos e build do frontend passaram; `/admin/` e `/health` responderam 200, API e Caddy ativos. A rota de IA sem sessão respondeu 401. Não fiz chamada autenticada ao modelo.
- A busca do Gemini 3.5 Flash-Lite está sujeita à franquia e ao preço por consulta da API, conforme a [documentação oficial do Google](https://ai.google.dev/gemini-api/docs/google-search#pricing). O serviço pode executar mais de uma consulta para uma análise.

## Agenda redesenhada e mapa climático da Paraíba (26 de novembro de 2026)

- Publicado somente o painel administrativo (`/admin`), compilado do worktree após `npm run typecheck:frontend`, `npm run build:frontend` e `git diff --check`. Pacote SHA-256 `0e54cec82724124650cdec18e7e51673e03f523ca5b766d72834f8b69d487e8f`. Esta compilação inclui as alterações locais ainda não registradas em commit.
- A tela inicial agora se chama **Agenda de viagens**. O resumo ficou compacto; calendário e orientação sazonal aparecem lado a lado em telas largas e empilhados em telas estreitas. O mês/ano do calendário controla o guia sazonal. Há uma única ação “Nova viagem” no cabeçalho e as próximas viagens aparecem abaixo.
- O calendário passou a mostrar a agenda do dia selecionado, feriados em seção recolhível e navegação por teclado entre dias. A orientação sazonal da Paraíba agora inclui mapa estático dos 223 municípios, coloridos pelos seis grupos regionais usados na previsão da AESA; os limites municipais vêm da malha do IBGE. A tabela de associação está em `frontend/src/lib/paraibaClimateMap.json`, e as fontes estão indicadas no próprio painel.
- A disposição dos blocos usa como referência visual o [catálogo de dashboards do v0](https://v0.app/templates/dashboards); não foram importados componentes ou dependências do template. Os períodos são referências sazonais históricas da AESA, não previsão do ano selecionado.
- Retorno do painel anterior preservado em `/srv/overtrip/retorno-dashboard-20261126-193020/admin`. Uma cópia da primeira montagem, substituída logo após a verificação do caminho do mapa, está em `/srv/overtrip/retorno-dashboard-20261126-193230/admin`.
- Na primeira conferência, o SVG estava apontando para a raiz do domínio; o caminho foi corrigido para respeitar `/admin/` e o painel foi republicado. Verificação final: `/admin/`, `/admin/paraiba-climate-regions.svg`, `/health` e `/api/public/trips` retornaram HTTP 200; `overtrip-api` e `caddy` estão ativos. API, banco, site público e serviços não foram modificados. Nenhum teste automatizado foi executado.

## Ajustes de leitura da agenda e feriados (26 de novembro de 2026)

- Publicado novamente somente o painel, agora com a seção “Próximas viagens” logo abaixo do cabeçalho, antes dos indicadores e do calendário. As contagens ficam junto à lista de viagens; os indicadores usam “Inscrições abertas”, “Em preparação” e “Passeios a conferir”, acompanhados de uma explicação curta.
- Padronizados espaçamentos, tamanhos dos cartões e títulos do calendário e do clima. Os feriados voltaram a aparecer na página sem recolher a lista, com marcador azul no calendário e texto azul na lista.
- Build e checagem de tipos do frontend passaram. Pacote SHA-256 `792c66780bddeea20e7c689b19d0a2809849666878c31fbf919198d4f1332c99`. Painel, mapa e `/health` responderam HTTP 200; API e Caddy ativos. Retorno imediatamente anterior em `/srv/overtrip/retorno-dashboard-copy-20261126-194000/admin`. API, banco e site público não foram alterados.

## Sugestões do mês e ajuda para escolher destino com IA (26 de novembro de 2026)

- Removidos os indicadores resumidos que o usuário considerou desnecessários. O mapa da Paraíba agora ocupa a largura do cartão, com altura maior e legenda regional abaixo. A seção seguinte mostra viagens cadastradas no mês e links para buscas atuais de opiniões; os resumos de avaliações com data fixa foram retirados para não parecerem atualizados continuamente.
- Adicionada a rota autenticada `POST /api/ai/travel-insights`, exclusiva para administradores e protegida pelo limitador de uso já aplicado às rotas de IA. Recebe mês, ano e estado; consulta no servidor somente viagens abertas daquele mês e envia ao provedor título, cidade, região, categoria, data e nível de intensidade. Não envia contatos de passageiros, reservas, custos, documentos ou notas. Para a Paraíba fornece as janelas históricas da AESA; para os demais estados não afirma padrões sem fonte. Resposta estruturada é validada antes de retornar.
- O painel oferece o botão **Analisar este mês**, mostra sugestões e perguntas para conferência e avisa que a análise é automática. Os resultados não substituem previsão meteorológica ou confirmação local; a IA não busca nem resume avaliações de visitantes.
- Build de tipos, build do frontend, build do backend e `git diff --check` passaram. Pacote compilado SHA-256 `8c459bab3bda7b3a1599544a6b2e88ef638adabae3a329e8e63c27cc415d1d30`. Backup de retorno de API e painel em `/srv/overtrip/retorno-ai-agenda-20261126-194900/{dist,admin}`. Sem alteração ou migração do banco. A API foi reiniciada; após a inicialização, `/health`, `/admin/`, mapa e `/api/public/trips` responderam HTTP 200, `POST /api/ai/travel-insights` sem sessão respondeu 401, e os serviços da API e Caddy ficaram ativos. A disponibilidade do provedor de IA depende da configuração existente; não fiz login em produção nem uma chamada autenticada ao modelo.

## Alternativas para destinos já marcados e destaque da análise (26 de novembro de 2026)

- A grade entre calendário e clima passou a alinhar cada cartão pela própria altura, sem esticar o calendário até o fim do painel sazonal. O botão **Analisar este mês** foi movido para o início do cartão de clima e ganhou maior destaque.
- A análise agora inclui viagens abertas no mês e destinos do banco ainda não visitados, respeitando o estado escolhido. Remove do catálogo candidatos cujo nome aparece em uma viagem do mês; as sugestões também são filtradas para corresponder a um nome do banco, reduzindo risco de inventar destino. Se não houver opção cadastrada, o painel informa isso.
- A IA sugere formato de grupo (van/ônibus) ou off-road/4x4 com base nos dados disponíveis, sem afirmar disponibilidade de operador. As viagens realizadas, reservas, dados de passageiros, notas privadas e custos não são enviados ao modelo.
- Tipos e builds do frontend e backend aprovados; `git diff --check` aprovado. Pacote SHA-256 `6cae128dd1c5173f31274c47f916d36073cf7d00dfec9f00f8ff76e5226b2c8e`. Retorno anterior em `/srv/overtrip/retorno-ai-alternativas-20261126-200316/{dist,admin}`. Sem mudanças no banco. Depois da breve inicialização, `/health`, `/admin/`, o mapa e `/api/public/trips` responderam 200; sem sessão, a rota de IA respondeu 401. API e Caddy ativos. A chamada autenticada ao modelo ainda não foi feita.

## Planejamento sazonal para o Nordeste (26 de novembro de 2026)

- Publicado o painel estático do commit `4d46b24`. Pacote SHA-256 `9f65364ce6420ac22a2376d7f7a1e3f4b5ef14b323dcf9b32dc67f9cca7072cb`; API e banco não mudaram.
- O seletor de mês e ano do planejamento está ligado ao calendário do Início nos dois sentidos. A seleção de estado cobre os nove estados do Nordeste; cada recorte mostra a fonte que sustenta sua referência sazonal e o link estadual de previsão/monitoramento. O layout segue uma organização de dashboard inspirada no [Shadcn Dashboard do v0](https://v0.app/templates/Pf7lw1nypu5).
- As orientações distinguem zonas dentro dos estados e identificam recortes regionais ou operacionais quando a fonte não apresenta uma climatologia uniforme. O ano serve para organizar o planejamento; a tela deixa claro que os dados sazonais não são previsão daquele ano.
- A versão anterior do painel está preservada em `/srv/overtrip/retorno-season-ne-20261126-190043/admin`. Nenhum backup ou migração de banco foi necessário.
- Validação de build e tipos do frontend aprovada. Após publicação, `/admin/` e `/health` responderam 200, API e assistente ficaram ativos e o journal da API não mostrou erro recente. Não foram executados testes automatizados nesta alteração.

## Guia sazonal, filtro de visitas e calendário (26 de novembro de 2026)

- Publicado o commit `1593f4c` (inclui a correção do calendário em `2173319`) na API e no painel. SHA-256 do pacote de release: `c276b08a89d1fe8114b45f7dec9aecc92d553cad832b3eb5ad75721b0b6da2c9`. O pacote não incluiu banco de dados, credenciais ou planilhas; o site público não foi substituído.
- O painel inclui orientação sazonal baseada na climatologia da AESA, filtro de destinos visitados por mês/ano e calendário com viagens publicadas em verde. A aba Interessados segue fora dos menus; a interface também não exibe mais a sincronização com o site.
- Aplicada a migração aditiva `20261129010000_outing_source`, após ensaio no backup recém-criado. O ensaio e a produção mantiveram 35 saídas, sem violações de chave estrangeira; `integrity_check` retornou `ok`. A coluna nova classifica 10 saídas existentes como `SITE`; 25 permanecem sem origem.
- Backup pré-migração: `/var/backups/overtrip/overtrip-20261126-182214.db.gz` (`gzip -t` aprovado). Código e painel anteriores preservados em `/srv/overtrip/retorno-1593f4c-20261126-182123/{app,admin}`.
- Build de API e frontend concluídos na VM. Após a troca, API e assistente ativos; `/`, `/admin/`, `/health` e `/api/public/trips` responderam 200. Rotas protegidas `/api/visits/periods` e `/api/auth/me` responderam 401 sem sessão. Nenhum erro recente nos journals dos serviços.
- A compilação na VM reportou 6 vulnerabilidades em dependências (3 moderadas, 1 alta, 2 críticas); não foi executado `npm audit fix`. Login real em produção não foi testado.

## Aba Interessados oculta e limpeza de arquivos antigos (26 de novembro de 2026)

- Publicado somente o painel do commit `4a08d39`; API e banco não mudaram. A rota e os dados de CRM foram preservados. `/admin/` responde 200 e o bundle de entrada servido não contém o rótulo “Interessados”. API e Caddy seguem ativos.
- Removidos diretórios de ensaio de publicação já encerrados e cópias antigas do painel substituídas pelo retorno atual.
- Limpeza de backups SQLite antigos: preservados o backup mais recente antes da migração atual (`pre-7ff3987-final-20261126-091320.db.gz`), o snapshot após as últimas correções financeiras (`pre-finance-values-20261126-062047.db.gz`) e o snapshot diário externo (`overtrip-20261126-073157.db.gz`). Backups anteriores a esses pontos foram removidos da VM. A cópia externa validada no computador continua em `/home/ztsu-pc/backups-overtrip/overtrip-externo-20261126-073157.tar.gz`.
- Orientações históricas deste arquivo foram mantidas como registro dos deploys anteriores; as seções iniciais descrevem a versão atual e seus procedimentos. O Caddyfile versionado continua sendo referência histórica; a configuração efetiva da VM é a fonte para futuras alterações de rede.

## Cópia externa e ensaio de restauração (26 de novembro de 2026)

- Executado com sucesso o serviço de backup existente; o banco, os uploads e a mídia social foram copiados para `/home/ztsu-pc/backups-overtrip/overtrip-externo-20261126-073157.tar.gz` (arquivo privado). SHA-256 do pacote: `77c6a7290c2632e8f0141c03d96b507f668bfc114804e7d27e37c585669e3528`.
- Em restauração temporária local, o banco retornou `integrity_check: ok` e nenhuma violação em `foreign_key_check`; o SHA-256 do banco compactado conferiu com o original na Oracle. O pacote contém 28 arquivos de uploads e nenhum arquivo de mídia social. A restauração testou extração e integridade, sem trocar o banco de produção.
- É um snapshot pontual no computador, não uma sincronização externa automática; o temporizador automático permanece na VM.

## Planejamento de destinos e edição financeira (26 de novembro de 2026)

- Publicados API e painel do commit `a45739e`; pacote SHA-256 `81750126bcec9e94147983d9214d55670c1a808025518a0a402ad7117dd714ef`, compilado na VM. Sem migração. A lista de destinos mostra os que não têm saída realizada registrada; o financeiro permite editar e excluir registros individualmente. A sincronização deixou de aparecer no painel.
- Preservados o código e o painel anteriores em `/srv/overtrip/retorno-a45739e-20261126-062031` e o backup SQLite validado em `/var/backups/overtrip/pre-a45739e-20261126-062031.db.gz`.
- A pedido do usuário, na saída de Pureza de 17/05/2026 foi informado R$ 130 por pessoa; na saída da Cachoeira do Pinga de 20/09/2026, transporte e extras foram registrados como zero. Passageiros e demais valores desconhecidos permaneceram vazios. Backup imediatamente anterior à edição: `/var/backups/overtrip/pre-finance-values-20261126-062047.db.gz`. Abril/2026 continua desconsiderado por não ter ocorrido.
- A conciliação das saídas completas permanece em R$ 1.911 (2024), R$ 1.100 (2025) e R$ 170 (2026). Registros automáticos do site são marcados para revisão; vários pontos no mesmo dia podem representar uma única viagem e não foram apagados automaticamente.
- Validação local: 1.342 testes passaram, 6 ignorados; dois testes de interface passaram, tipos e builds aprovados. Após publicar, API e Caddy ativos, integridade SQLite `ok`, endpoints públicos 200 e privados sem sessão 401. O bundle servido contém “Destinos a conhecer” e não contém o botão “Sincronizar com o site”. Não foi feito login real em produção.

## Painel financeiro e cortesias nas saídas (26 de novembro de 2026, 05:01 UTC)

- Publicados API e painel do commit `1536511` (inclui `f518115`), compilados na VM em `/srv/overtrip/stage-1536511-20261126-050022`. Pacote por `git archive`, SHA-256 `22c53aff94484c33473d4659055ffd99213768956cb92e641f579a185fb1c6af` conferido na VM; sem banco, `.env` ou planilha no pacote. Site público não foi trocado.
- Antes de publicar, conferido que as alterações feitas pela sessão Codex neste worktree (renomeação para "Destinos e saídas", validação de cortesias acima de passageiros, vencimentos pelo dia de São Paulo, rótulos de estimativa) estavam todas no commit `1536511`; produção sem mudanças desde a publicação anterior. Suíte completa local: 1341 testes aprovados, 6 ignorados; tipos da API e do painel ok.
- Nova página "Financeiro" no painel (só administradores, somente leitura), atrás de `GET /api/finance/summary`: resultado por ano/mês/destino das saídas do banco de destinos e resumo de reservas e parcelas do escopo legado.
- Uma migração aditiva: `20261127030000_outing_courtesy_seats` (`ALTER TABLE "DestinationOuting" ADD COLUMN "courtesySeats" INTEGER`). Ensaiada numa cópia do banco (migração, importação, segunda execução sem alterações, `integrity_check` ok, `foreign_key_check` vazio) e depois aplicada com a API parada.
- Backups validados (`gzip -t`): `/var/backups/overtrip/pre-1536511-20261126-050104.db.gz` (antes do ensaio) e `/var/backups/overtrip/pre-1536511-switch-20261126-050128.db.gz` (na troca). Código e painel anteriores em `/srv/overtrip/retorno-1536511-20261126-050128/{app,admin}`. Retorno de código não exige desfazer o banco: a coluna nova é ignorada pelo código anterior.
- Reimportada a planilha (`--apply`) só para completar cortesias: 8 saídas receberam `courtesySeats` (total 8), nenhum destino, saída ou vínculo criado. Planilha e cópia do ensaio ficaram em diretório `overtrip` 700 e foram apagadas com `shred`. A linha de abril/2026 sem destino foi descartada a pedido do usuário (viagem não aconteceu).
- Resultados por ano no banco de produção, iguais ao caixa da planilha: 2024 R$ 1.911 (7 saídas completas), 2025 R$ 1.100 (5), 2026 R$ 170 (2). Contagens preservadas: 46 destinos, 35 saídas, 5 viagens, 43 visitas.
- Depois da publicação: `overtrip-api` e `caddy` ativos, journal sem avisos; `/`, `/admin/`, `/health`, `/api/public/trips` e `/api/public/destinations` 200; `/api/finance/summary`, `/api/destinations` e `/api/auth/me` sem sessão 401. Bundles servidos contêm "Financeiro" e "Cortesias". Não foi feito login real em produção.

## Banco de destinos sincronizado com o site (25 de novembro de 2026, 23:46 UTC)

- Publicados API e painel do commit `393eb71` (branch `gabriel-souza-developer/profile-finance-dashboard`), compilados na VM em área de preparo isolada. Pacote por `git archive`, SHA-256 `c494cd547df9292d1e84a6fae3500b3a3b371a7f29d8d0bec6fc690f69f634ca` conferido na VM; sem banco, `.env` ou planilha no pacote. Site público não foi trocado.
- O painel publicado inclui também os commits anteriores desta branch que ainda não estavam no ar (`d7b6e5b`: rotas de recuperação de senha e visual do login; `de0d23a`: ícone de Usuários). A API já estava idêntica à base desta branch.
- Duas migrações aditivas: `20261127010000_destination_bank` (tabelas `Destination` e `DestinationOuting`) e `20261127020000_destination_site_links` (colunas opcionais `Trip.destinationId` e `Visit.destinationId`, por `ALTER TABLE ADD COLUMN`, sem recriar tabelas). Ensaiadas antes numa cópia do banco da VM (migrações, importação, sincronização e segunda execução sem alterações; contagens de viagens, visitas, reservas e interessados preservadas; `integrity_check` ok, `foreign_key_check` vazio) e depois aplicadas com a API parada.
- Backups validados (`gzip -t`): `/var/backups/overtrip/pre-393eb71-20261125-234538.db.gz` (antes do ensaio) e `/var/backups/overtrip/pre-393eb71-switch-20261125-234618.db.gz` (na troca, com a API parada). Código e painel anteriores em `/srv/overtrip/retorno-393eb71-20261125-234618/{app,admin}`. Retorno de código não exige desfazer o banco: tabelas e colunas novas são ignoradas pelo código anterior.
- Importada a aba "DESTINOS VISITADOS" da planilha antiga da empresa (`scripts/import-destinations-xlsx.ts --apply`), com as correções confirmadas pelo usuário (Lagoa Azul em Santa Rita, Pureza realizada em 17/05/2026, Caraúbas não realizada, camping do Rio do Feijão em 22 e 23/07/2023, Balneário Rio Água Viva em Areia). A planilha ficou na VM só durante a importação, em diretório `overtrip` 700, e foi apagada com `shred`.
- A pedido do usuário, criados 3 pontos no mapa do site (visitas `manual`, revisadas): Bonito - PE em 13/09/2026 (coordenadas do centro da cidade, Expedição Bonito), Cachoeira de Ouricuri em 30/03/2025 e Cachoeira do Roncador em 15/03/2026 (mesmas coordenadas dos pontos já existentes desses lugares).
- Sincronização com o site: 43 visitas e 4 viagens vinculadas (o rascunho de Lucena fica sem vínculo); 46 destinos e 35 saídas no banco; nenhum destino visitado fora do mapa e toda saída datada tem ponto no mapa no mesmo dia (ou no vizinho, no caso do camping).
- Depois da publicação: `overtrip-api` e `caddy` ativos, journal sem erros; `/`, `/admin/`, `/health`, `/api/public/trips` e `/api/public/destinations` 200; `/api/destinations` e `/api/auth/me` sem sessão 401. As respostas públicas de viagens e mapa ficaram idênticas byte a byte às anteriores até a criação dos 3 pontos pedidos. Não foi feito login real em produção.

## Remoção da faixa preta "Campina Grande / Pocinhos" (25 de novembro de 2026, 22:35 UTC)

- Publicados apenas `index.html`, `css/header.css` e `css/responsive.css` do commit `2a24d56`. Um commit anterior (`d7b6e5b`, de outra sessão) já tinha comentado o texto, mas a faixa (`.agency-strip`, fundo preto, `min-height: 2rem`) continuava visível vazia; removida a marcação e o CSS morto associado, não só o texto.
- Backup dos 3 arquivos anteriores em `/srv/overtrip/retorno-agency-strip-20261125-223507`. Hash SHA-256 conferido depois da cópia; dono/permissão mantidos (`root:root`, 644). `responsive.css` recebeu nova versão (`?v=no-agency-strip-20261125`) para evitar cache antigo.
- Depois da publicação: `/` e os dois CSS responderam 200; `caddy` ativo; a faixa preta não aparece mais no HTML servido. Só arquivos públicos foram trocados — painel e API não foram tocados nesta publicação.

## Limpeza de disco solicitada (25 de novembro de 2026, 22:26 UTC)

- A pedido do usuário, removidas 28 cópias de retorno superadas em `/srv/overtrip/` (lista completa: `retorno-{04c714d,130d610,30b8ff2,4bf46a4,6734e41,82a5f96,c57b8b2,cb49e65}-*`, `retorno-candidate-20261125-211354-418920`, `retorno-csp-health-20261113-152052`, `retorno-destaque-feriados-20261115-200546`, `retorno-e430d78-20261111-{082531,083356}`, `retorno-fd399a4-20261125-182454`, `retorno-feriados-azul-20261115-201217`, `retorno-healthui-20261113-062332`, `retorno-login-link-6a0bf44-20261122-222349`, `retorno-painel-{19b25d3-20261115-195212,22053fe-20261122-183315,7ea5cee-20261110-203526,9f7e64b-20261110-201727,c1dc8b2-20261125-170900,feriados-20261115-195730,info-Rg4wJfJx}`, `retorno-site-81b5855-20261122-030437`, `retorno-social-20261116-023930`, `retorno-social-ui-20261116-024808`, `retorno-user-menu-296f92c-20261122-232312`). Liberou cerca de 4,3 GB.
- **Mantidos**: `retorno-users-20261125-220008-421737` (cópia de retorno mais recente, anterior ao deploy de gestão de usuários) e `retorno-provisionamento-horizonte-20261122-042918`, que **contém um `database.db`** (589 KB) e não foi tratado como cópia de código comum; preservado até confirmação de que não é necessário para alguma reconciliação pendente (ver nota de memória sobre conflito de schema `Organization`/multinicho). Nenhum backup em `/var/backups/overtrip` ou `/var/lib/overtrip` foi tocado. Os pacotes `.tar.gz` de release em `/tmp` (citados no inventário anterior) não foram tocados, conforme a própria recomendação desse inventário.
- Também limpos: cache do APT (`apt-get clean`, 187M → 20K) e cache do npm de `ubuntu` e de `overtrip` (`npm cache clean --force`, 76M→136K e 71M→220K). Nenhum processo de instalação ou atualização estava em andamento; `/var/lib/dpkg/lock-frontend` não estava retido.
- Depois da limpeza: `overtrip-api`, `caddy`, `tailscaled` e os timers de backup/saúde seguem ativos; `/`, `/admin/` e `/health` responderam HTTP 200. Disco: de 25G para 20G usados (96G livres de 116G). Nenhum deploy de código foi feito nesta operação, só remoção de arquivos.
- Levantamento original (antes desta limpeza) feito por um worker Codex via SSH somente leitura, sem nenhuma remoção: ver histórico de `/tmp/overtrip-inventario-limpeza-task_67c57b96c912.md` (arquivo local, não versionado).

## Publicação de interface e mídia (25 de novembro de 2026, 21:13 UTC)

- Publicados o painel, site e API preparados da árvore `c8d006595271aa8543543d0bc8a497c695788642`; pacote SHA-256 `5adb6a02e69d18465dda10fa8d294dd45b70a6eb532b3f4a88bce94d2d5fedd5`. Sem migração de banco. Retorno de código e painel em `/srv/overtrip/retorno-candidate-20261125-211354-418920`; backup SQLite validado em `/var/backups/overtrip/overtrip-20261125-211354.db.gz`.
- Instalados FFmpeg e Bubblewrap, com perfil AppArmor específico fornecido pelo pacote Ubuntu, sem desativar a restrição global de namespaces. O processamento de um MP4 sintético passou na VM com as proteções da unidade da API. MP4 aceita H.264 e áudio AAC opcional, até 15 MiB e cinco minutos. A cópia dos uploads foi conferida byte a byte; o backup incremental passou a incluir MP4.
- API, assistente, Caddy e timer de backup ativos; `/`, `/admin/`, `/health` e `/api/public/trips` verificados. Nenhum upload autenticado real ou pagamento Pix real foi realizado em produção. A viagem de Coqueirinho teve resumo e unidade de preço corrigidos, preservando os demais campos.
- Testes locais: frontend e API compilados; suíte completa teve 1289 testes aprovados, seis ignorados e quatro falhas (três expectativas atualizadas e aprovadas, um teste temporal de sandbox aprovado isoladamente). Testes direcionados de vídeo e isolamento, e de navegador para seleção múltipla, passaram.

## IA por texto ativada: Groq (principal) + xAI/Grok (reserva, 25 de novembro de 2026, 19:30 UTC)

- Ativada a ajuda de IA (bloco "Colar texto e sugerir com IA") em produção, pela primeira vez. `/etc/overtrip/env` recebeu `GROQ_API_KEY`, `XAI_API_KEY` e `AI_PROVIDER_ORDER=groq,xai` (arquivo root:600, igual às outras chaves já lá). `overtrip-api` reiniciado.
- Publicados, em sequência, 3 ajustes sobre o commit `04c714d` — todos só na API, sem mudança de painel:
  - `130d610`: adiciona os provedores Groq e xAI (API compatível com a da OpenAI) e `createFallbackProvider` (a principal tenta primeiro; se falhar — rede, limite, chave —, tenta a reserva com o próprio modelo padrão dela). `createProviderFromEnv` só encadeia quando `AI_PROVIDER_ORDER` existe; sem ela, continua exatamente como antes (Gemini > Anthropic > nenhum).
  - `6734e41`: o modelo padrão do Groq (`llama-3.3-70b-versatile`) não existe mais na conta (404 `model_not_found`); testado contra a conta real e troquei para `openai/gpt-oss-120b`, que está no catálogo atual.
  - `cb49e65`: o prompt mandava o JSON Schema completo (`$schema`/`type`/`properties`) para Groq/xAI, que não têm saída estruturada forçada como a do Gemini — o modelo devolvia os dados aninhados dentro de `"properties"` em vez de na raiz, e tudo saía `null` depois da validação. Corrigido para mandar só a lista de campos, com instrução explícita de que vão na raiz.
  - Também corrigido (ainda em `130d610`, antes mesmo do primeiro teste real): como Groq/xAI não forçam o formato, o modelo pode devolver um objeto sem todas as chaves — como todas são anuláveis, agora completa com `null`/`[]` antes de validar, em vez de reprovar a resposta inteira.
- Cada publicação seguiu o processo de sempre (pacote por `git archive`, SHA-256 conferido, build na própria VM, backup do banco validado, cópia de retorno preservada, `overtrip-api` reiniciado e verificado). Nenhuma delas mudou o painel nem pediu migração de banco.
- **Testado de ponta a ponta com a conta real**: chamada direta ao serviço (fora do processo da API, lendo a mesma `/etc/overtrip/env`) com um texto de exemplo em português — Groq extraiu corretamente título, cidade, horário, preço e vagas. `createProviderFromEnv()` confirma `provider: groq` (a ordem configurada).
- **xAI (Grok) removido da configuração** (não do código): a API respondeu `403 permission-denied`, "sua equipe não tem créditos ou licenças ainda" — é cobrança pendente na conta xAI (console.x.ai), não um problema no código. A pedido do usuário, `XAI_API_KEY`/`XAI_MODEL` foram apagados de `/etc/overtrip/env` e a reserva passou a ser o Gemini. `createXaiProvider` continua no código, pronto para ser reativado (só configurar a chave e a ordem) se um dia a conta xAI tiver crédito.
- Ordem final, a pedido do usuário: `AI_PROVIDER_ORDER=gemini,groq` — **Gemini é o principal, Groq é a reserva** (invertido do que foi testado primeiro nesta mesma sessão).
- Testado também o Gemini isoladamente (fora da cadeia) com uma chamada real: extraiu os dados corretamente. A cadeia (`createProviderFromEnv()`) resolve `groq` como principal, como configurado.
- Scripts de teste usados (`test-ai-provider*.cjs`, `test-chain.cjs`, `test-gemini.cjs`, `list-groq-models.cjs`) eram arquivos temporários fora do repositório; todos removidos da VM e do scratchpad local ao final.

## Setas modernas e paridade do formulário do site (25 de novembro de 2026, 18:49 UTC)

- Publicados API e painel do commit `04c714d` (acima de `fd399a4`), mesmo processo: compilado na VM em `/srv/overtrip/stage-04c714d-20261125-184826`, pacote SHA-256 `fd04bf34e3cb726e416767cbe3db51070a00401b70eb5816338e9245d9ebcf3c` conferido. Sem migração de banco.
- O triângulo nativo do `<details>` foi trocado por um chevron animado em todo o painel/site (uma única regra CSS global). O formulário de viagens do site (`TripForm.tsx`, usado no dia a dia da OVERTRIP) ganhou paridade com o que já estava no painel de agência: o bloco "Colar texto e sugerir com IA" agora sempre aparece, e a seção "O essencial" foi renomeada para "Informações principais".
- Backup do banco validado antes da troca (`gzip -t` ok): `/var/backups/overtrip/overtrip-20261125-184906.db.gz`. Código e painel anteriores preservados em `/srv/overtrip/retorno-04c714d-20261125-184826/{app,admin}`.
- Após a troca: `overtrip-api`, `caddy`, `tailscaled` e os temporizadores ativos; reinício limpo, sem erros no journal. `/`, `/admin/`, `/health` e `/api/public/trips` responderam 200; o bundle do formulário contém "Informações principais". Não foi feito login real em produção.
- Limpeza nesta sessão: removidas em `/srv/overtrip/` as cópias de retorno já superadas `retorno-09ca5e9-20261122-221754`, `retorno-542c7dc-20261122-040902` e `retorno-bc26620-20261122-025124`, mais duas pastas `stage-e430d78-*` órfãs de 11/11 que nunca tinham sido limpas. Backups de banco (`/var/backups/overtrip/*.db.gz`) não foram tocados: são pequenos e já têm retenção automática de 14 dias pelo próprio serviço.

## Sugestão de viagem por texto (IA) e cores da marca (25 de novembro de 2026, 18:27 UTC)

- Publicados API e painel do commit `fd399a4` (acima de `c1dc8b2`), compilados na VM ARM64 em área de preparo isolada (`/srv/overtrip/stage-fd399a4-20261125-182454`), sem afetar o app ativo até a troca. Pacote transferido por `git archive`, SHA-256 `22afbd92cfe435b78c6282ab309884a8441526d222c9c9163f2effa24d3c0634` conferido na VM. Sem migração de banco (mudança só de rotas e painel).
- Novidade: bloco "Colar texto e sugerir com IA" no formulário de viagens da agência (sugere campos a partir de texto colado, nada é salvo até o clique em Salvar), atrás de `/api/organizations/:id/tourism/ai/{status,trip-draft}`, restrito a OWNER/ADMIN da própria empresa. Cabeçalho do painel e faixas das seções do formulário usam a cor da marca.
- Backup do banco executado e validado antes da troca (`gzip -t` ok): `/var/backups/overtrip/overtrip-20261125-182622.db.gz`. Código e painel anteriores preservados em `/srv/overtrip/retorno-fd399a4-20261125-182454/{app,admin}`.
- Após a troca: `overtrip-api`, `caddy`, `tailscaled` e os temporizadores de saúde/backup ativos; reinício foi limpo (`SIGTERM` → `HTTP server closed`, sem erros no journal). `/`, `/admin/`, `/health` e `/api/public/trips` responderam 200; `/api/auth/me` sem sessão respondeu 401. A nova rota `/api/organizations/<id>/tourism/ai/status` respondeu 401 (não 404), confirmando que o código novo está no ar; os bundles servidos contêm os textos "Dados da viagem" e "Colar texto e sugerir com IA". Não foi feito login real em produção.
- O commit ainda não foi enviado ao GitHub (`git push` foi bloqueado pela permissão desta sessão); a publicação na Oracle usou `git archive` direto do commit local, que não depende do GitHub.

## Formulário e cores da agência (25 de novembro de 2026, 17:09 UTC)

- Publicado somente o painel do commit `c1dc8b2`, com os blocos no formulário de viagens da agência e a cor da empresa mais visível no menu e no início. Pacote SHA-256 `c3491eff98b9cd47b596bed222df0004da7f14ae00396107132de9a9cecca76b` conferido na VM. Painel anterior preservado em `/srv/overtrip/retorno-painel-c1dc8b2-20261125-170900/admin`; API e banco não foram alterados.
- `/admin/`, `/health` e `/api/public/trips` responderam 200; API e Caddy estavam ativos. Os hashes do HTML e do componente de viagens servidos corresponderam à build; o componente servido contém os títulos dos novos blocos. Não foi feito login real em produção.

## Publicação do formulário e identidade visual (25 de novembro de 2026, 16:45 UTC)

- Publicado o commit `82a5f96`: API e painel compilados na VM ARM64 e arquivos públicos `js/render.js` e `css/trips.css`. O pacote transferido teve SHA-256 `5e9460968e62efca705a73debdebe88788946c9877b67bcdf3638a56ba1faef5` conferido na VM.
- Cinco migrações pendentes foram ensaiadas em cópia consistente do banco e aplicadas com a API parada. Prisma confirmou 35 migrações atualizadas; `integrity_check` retornou `ok`, sem violações de chaves estrangeiras. A cópia de segurança validada está em `/var/backups/overtrip/pre-82a5f96-20261125-164426.db.gz`.
- Aplicação, painel e arquivos públicos anteriores estão em `/srv/overtrip/retorno-82a5f96-20261125-164426`. Retornar o código não restaura o banco: uma restauração após novas escritas pode perdê-las e exige avaliação de reconciliação.
- API, Caddy e temporizadores de backup e saúde estavam ativos; `/`, `/admin/`, `/health` e `/api/public/trips` retornaram 200 e `/api/auth/me` sem sessão retornou 401. O hash do bundle do painel servido correspondeu ao arquivo instalado. Não houve teste de login real nem de processamento de PDF em produção.

> Este arquivo é um diário de alterações e verificações, não um monitor em
> tempo real. O registro mais recente abaixo não
> confirma que serviços, DNS, dados ou configurações continuam iguais hoje.
> Para mudanças operacionais, obtenha evidência nova diretamente da VM e
> preserve os limites de privacidade. CRM/reservas foram publicados segundo o
> registro de 10 de novembro, mas os fluxos e limites descritos nessa entrada
> não significam que o estado atual da instância foi novamente verificado.

## Ação de senha no menu da conta (22 de novembro de 2026, 23:23 UTC)

- Publicado somente o painel do commit `296f92c`. A troca de senha ficou apenas no dropdown “Minha conta” nos painéis de agência, incluindo as telas de seleção e erro; os botões avulsos foram removidos. A versão anterior foi preservada em `/srv/overtrip/retorno-user-menu-296f92c-20261122-232312/admin`.
- O painel e `/health` responderam HTTP 200 após a publicação; Caddy e API estavam ativos. `typecheck:frontend`, build e 12 testes Playwright focados passaram. Nenhuma API ou migração foi alterada nesta publicação.

## Link de recuperação de senha (22 de novembro de 2026, 22:23 UTC)

- Publicado somente o painel do commit `6a0bf44`. O link “Esqueci minha senha” agora aparece logo abaixo do campo de senha, alinhado à direita, com contraste reforçado, sublinhado e área clicável de 44 px. O pacote anterior foi preservado em `/srv/overtrip/retorno-login-link-6a0bf44-20261122-222349/admin`.
- Após a publicação, `/admin/` e `/health` responderam HTTP 200; Caddy e API estavam ativos. No navegador, o link foi encontrado no DOM com altura de 44 px. Tipos e build do frontend passaram antes da publicação.

## Histórico de reservas por empresa (22 de novembro de 2026, UTC)

- Publicado backend e painel do commit `542c7dc`; backup consistente do banco, aplicação e painel anterior em `/srv/overtrip/retorno-542c7dc-20261122-040902`. Migração aditiva `20261122030947_reservation_audit_log` ensaiada em cópia antes da aplicação; Prisma confirmou 28 migrações atualizadas.
- Após a troca: site, painel, saúde e API pública retornaram 200; `/api/auth/me` sem sessão retornou 401; API e Caddy ativos e `integrity_check` do banco retornou `ok`. Não houve login real ou cadastro de agência; contagem de empresas permaneceu zero.
- Histórico registra eventos a partir da ativação e não recompõe alterações anteriores. Backup de banco só é restaurável sem perda se não houver escritas posteriores; caso contrário, avaliar reconciliação/correção em frente.

## Ajuste no site público (22 de novembro de 2026, UTC)

- Publicado somente `js/render.js` do commit `81b5855`, ocultando o controle de detalhes quando não há conteúdo. Arquivo anterior em `/srv/overtrip/retorno-site-81b5855-20261122-030437/render.js`; hash servido conferido contra o arquivo versionado.

## Plataforma multiagência (22 de novembro de 2026, UTC)

- Publicado o commit `bc26620` da branch `gabriel-souza-developer/turismo-multiagencia`, com frontend e backend compilados na VM ARM64. Código, painel e cópia consistente do banco anterior foram preservados em `/srv/overtrip/retorno-bc26620-20261122-025124`.
- Dez migrações foram ensaiadas antes em cópia privada do banco e aplicadas com API parada; Prisma informou 27 migrações atualizadas e `PRAGMA integrity_check` retornou `ok`. As contas existentes foram preservadas; não foi criada empresa ou conta de demonstração. A consulta agregada após publicação indicou zero empresas cadastradas.
- Após publicar: API e Caddy ativos; `/health`, `/admin/` e `/api/public/trips` retornaram 200, e `/api/auth/me` sem sessão retornou 401. Não foi feito login real nem exercício autenticado em produção; o teste de migração em cópia confirmou rotas legadas com sessão sintética.
- O worker de documentos, armazenamento de PDFs e scanner real continuam não preparados neste ambiente; não se deve anunciar processamento de PDF/IA como operacional. Extração de imagens de PDF permanece desligada por padrão e exige validação do isolamento sob o serviço real antes de habilitar.
- O teste completo de backend terminou com 1126 aprovados, 6 pulados e um timeout de 5 segundos sob carga paralela; a suíte específica repetida isoladamente passou 15/15. Playwright: 133 aprovados e 6 pulados; builds e tipos passaram.
- Uma restauração automática do banco após entrada de novas escritas apagaria dados posteriores. Em caso de regressão, avaliar correção em frente ou reconciliação; não restaurar o snapshot sem considerar dados criados após a publicação.

## Melhorias na revisão social (16 de novembro, 02:48 UTC)

- Publicado apenas o frontend do commit `41d152b`; retorno em `/srv/overtrip/retorno-social-ui-20261116-024808/admin`. Painel e saúde responderam 200; rascunhos sem sessão responderam 401; API e Caddy ativos.
- O formulário avisa antes de descartar edições e apresenta mensagens ao salvar, revisar ou excluir. A ferramenta de inventário e a pré-verificação de publicação do mesmo commit permanecem somente no repositório, não foram instaladas na VM.

## Proteção do caminho do backup social (16 de novembro)

- Instalado o ajuste `0750eba`: o serviço de backup lê o mesmo arquivo de ambiente da API e usa a mesma variável `SOCIAL_MEDIA_DIR`. A configuração da API na VM não tinha variáveis adicionais por override e declarava `NODE_ENV=production`.
- O serviço foi executado com `Result=success`; API, Caddy e temporizador ativos. Um ensaio local com banco e imagem sintéticos validou integridade, referência e hash após restauração; não equivale a restaurar os dados da VM nem a uma cópia externa.

## Rascunhos para redes sociais (16 de novembro, 02:39 UTC)

- Publicado o código da `main` no commit `a6e420e`; pacote SHA-256 `d132e0dc002931b6566447fade5ccf03d1f9ebb3eadc482b85748c1bcf7d0ca6`. Cópia de retorno dos arquivos anteriores em `/srv/overtrip/retorno-social-20261116-023930`.
- As duas migrações sociais foram ensaiadas antes em cópia do banco, com `integrity_check` e `foreign_key_check`, e depois aplicadas ao banco ativo. Prisma Client foi gerado na VM ARM64.
- API, Caddy e temporizador de backup ativos; `/admin/`, `/health` e `/api/public/trips` responderam 200 e `/api/social-posts` sem sessão respondeu 401. O menu social foi entregue no bundle. Não foi feito login real nem publicação em redes.
- Serviço de backup atualizado e executado com sucesso: snapshot do banco, imagens públicas e mídia social privada; fonte e destino privados modo 700. Como não havia mídias sociais, não houve teste de restauração com imagens reais. Cópia externa à VM permanece pendente.
- A tela permite rascunhos, sugestões de legenda quando houver provedor configurado, imagens privadas e revisão. Conexão OAuth, agendamento e publicação externa ainda não existem.

## Destaque azul dos feriados (15 de novembro, 20:12 UTC)

- Publicado apenas o painel do commit `5bdc05d`, com feriados em azul. Retorno: `/srv/overtrip/retorno-feriados-azul-20261115-201217/admin`. Painel, saúde e API pública responderam 200; Caddy e API ativos.
- A função de redes sociais do commit posterior `7970dcc` não foi publicada; necessita integração oficial e validação antes de operar em produção.

## Feriados no calendário (15 de novembro, 19:57 UTC)

- Publicado o painel do commit `bf6a213`, pacote SHA-256 `a287de72b1cdbeac9e1ec2db5f2d9d28c6ab003c51f95f2b17f93b599f8f071d`. Retorno em `/srv/overtrip/retorno-painel-feriados-20261115-195730/admin`.
- O calendário mostra feriados recorrentes nacionais, da Paraíba e de Campina Grande, com Sexta-feira da Paixão e Corpus Christi calculados por ano. São regras atuais, sujeitas a revisão legal; pontos facultativos não estão incluídos.
- Passaram 9 testes focados, tipos e build; navegador conferiu novembro de 2026 em celular e desktop. Após publicação, painel, saúde e API pública responderam 200; Caddy e API ativos.

## Atualização visual do painel (15 de novembro, 19:52 UTC)

- Publicado o painel do commit `19b25d3`, pacote SHA-256 `ef553ec17658ad37ebee67ba23ab1df731f384d4b0cedade915eb6f3e2d67c2c`. A versão anterior está em `/srv/overtrip/retorno-painel-19b25d3-20261115-195212/admin`.
- Navegação, indicadores e agenda foram simplificados; o indicador de viagens abertas informa que inclui datas passadas. Apenas arquivos do painel foram atualizados.
- Após publicação, `/`, `/admin/`, `/health` e `/api/public/trips` responderam 200; API e Caddy estavam ativos. O HTML do painel mantém cache desativado. Compilação, tipos e 10 testes direcionados passaram.

## CSP em modo de relatório e métrica de carga (13 de novembro, 15:25 UTC)

- Publicados os commits `c1669fd` (`fix(health): mostra carga do servidor sem percentual`) e `844da5c` (`feat(security): registra violações CSP em modo relatório`), mais a correção de sintaxe da política CSP preparada nesta sequência.
- O gráfico da saúde separa percentuais de disco/memória da carga média de 1 minuto e mostra a quantidade de CPUs como referência; carga média não é percentual de uso de CPU.
- A API aceita relatórios CSP legado e Reporting API, limita tamanho e volume, sanitiza campos e remove query strings antes de registrar. A política `Content-Security-Policy-Report-Only` foi acrescentada ao Caddy ativo; não bloqueia scripts, estilos ou outros recursos enquanto observamos os relatórios. A configuração foi validada antes de reiniciar o Caddy.
- Antes da publicação, passaram 8 testes focados, build da API, checagem de tipos e build do painel. Após a publicação, o endpoint local e o público responderam 204 para um relatório sintético, e a query de teste não apareceu no journal. `/`, `/admin/`, `/health` e `/api/public/trips` responderam 200; `/trips.json` respondeu 404. Caddy e API ficaram ativos.
- A cópia de retorno da publicação está em `/srv/overtrip/retorno-csp-health-20261113-152052`; o backup SQLite local foi validado em `/var/backups/overtrip/overtrip-20261113-152052.db.gz`. Nenhuma migração ou mudança de esquema foi aplicada.
- Não foi configurada cópia de backup no computador do usuário. Uma cópia externa permanece pendente de destino autorizado; os backups atuais seguem na própria VM.

## Histórico compacto da saúde do servidor (13 de novembro, 06:23 UTC)

- Publicado o commit `81e164d` (`feat(panel): simplifica histórico da saúde do servidor`), somente com os arquivos estáticos do painel. Pacote SHA-256 `5f8f83377fb03f8973e62430fff89cca83e0b891d5dc19aac9ec060ff6490033`.
- O gráfico agora permite escolher 24 horas ou 7 dias, agrega disco e memória por intervalo, preserva o pico da carga por núcleo e mostra o horário médio real das coletas. As métricas atuais aparecem em cartões compactos e o gráfico se adapta à largura móvel.
- A versão anterior do painel está preservada em `/srv/overtrip/retorno-healthui-20261113-062332/admin`. Como a publicação alterou somente arquivos estáticos, não foi necessário backup nem alteração do banco ou da API.
- Após publicar, `/admin/` respondeu HTTP 200, o bundle `SystemHealth-ColgdgT4.js` entregue continha os rótulos de 24 horas e 7 dias, e API e Caddy permaneceram ativos. Antes da publicação passaram 5 testes focados, a checagem de tipos e a build do frontend.

## Publicação de autenticação segura e correção da API pública (11 de novembro, 08:33 UTC)

- Publicado o commit `e430d78` (`fix(auth): usa cookie segura e remove fallback de viagens`) da branch `feat/evolucao-painel-viagens`. Pacote SHA-256 `6d15c22bf08495e6ca2b02f8aca234f9658d5d0be5a2d6875f5804e1cf8a93b9`; o commit foi enviado ao `origin` antes da publicação.
- API, painel administrativo e arquivos públicos foram instalados juntos. A API e o Caddy foram confirmados ativos. Nenhuma migração de banco ou mudança no Caddyfile foi aplicada.
- Backup SQLite íntegro: `/var/backups/overtrip/overtrip-20261111-083356.db.gz`. Cópia de retorno da versão anterior: `/srv/overtrip/retorno-e430d78-20261111-083356`.
- Verificação após publicação: `/`, `/admin/`, `/health` e `/api/public/trips` responderam HTTPS 200; `/api/auth/me` sem cookie respondeu 401; `/trips.json` respondeu 404. A verificação local em `127.0.0.1:3001/health` retornou `status: ok`.
- O frontend agora usa cookie de sessão HttpOnly; a resposta de login não expõe o JWT no JSON. A API também não tenta carregar viagens de um arquivo legado público quando falha a consulta principal.
- Uma primeira tentativa foi revertida automaticamente porque o teste de saúde ocorreu antes de a API abrir a porta. A segunda tentativa aguardou a prontidão dos serviços e passou nos testes; o diretório de retorno e o backup foram preservados.
- A validação da suíte no código publicado consta no registro de preparação: 661 testes passaram, 2 foram ignorados, e 5 cenários Playwright direcionados passaram. O login com credencial real não foi exercitado em produção.
- Content-Security-Policy continua pendente. O Caddyfile histórico do repositório não foi instalado; qualquer política deve ser preparada usando a configuração efetiva da Oracle.

## Teste de restauração isolada do backup (11 de novembro)

- O backup mais recente encontrado foi `/var/backups/overtrip/overtrip-20261111-033004.db.gz` (36.937 bytes).
- O gzip foi validado e o banco foi extraído em um diretório temporário novo sob `/tmp`, sem parar serviços nem acessar o banco ativo para escrita.
- `PRAGMA integrity_check` retornou `ok`; `PRAGMA foreign_key_check` não encontrou violações; o banco restaurado contém 20 tabelas de aplicação.
- A cópia temporária foi removida ao fim da verificação. Este teste confirma a legibilidade e integridade do backup local; não confirma uma cópia fora da VM nem uma recuperação completa da aplicação.
- Leitura por SSH do `/etc/caddy/Caddyfile`: API é encaminhada para `127.0.0.1:3001`, a lista pública não inclui `/trips.json` nem `/knowledge.json`, e o restante retorna 404. O arquivo define `nosniff`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` e HSTS; não define Content-Security-Policy. Isso é leitura do arquivo em disco, não uma nova validação de Caddy nem teste de invasão.
- Naquele registro, a alteração local que remove a tentativa pública de fallback ainda não havia sido publicada; a publicação consta na seção acima.

## Correções locais após revisão de segurança (11 de novembro)

- Migração do painel de `localStorage` para cookie de sessão `HttpOnly`, `SameSite=Lax` e `Secure` em produção. Login deixa de devolver o JWT no JSON; `/auth/me` valida a sessão no carregamento. Uploads e downloads protegidos usam o cookie. Operações de escrita autenticadas por cookie exigem `Origin` igual a `CORS_ORIGIN`; clientes que usam explicitamente `Authorization: Bearer` continuam compatíveis.
- O registro de preparo foi escrito antes da publicação do commit `e430d78`; a situação de produção correspondente consta na seção de publicação acima. Expiração, logout, troca de senha, upload de mídia e download de PDF passaram pelos testes locais; login com credencial real não foi feito na VM.
- Content-Security-Policy continua pendente. O Caddyfile versionado é histórico e a política deve ser ajustada primeiro em modo `Report-Only`, com teste dos scripts inline do site e dos recursos externos do painel, usando a configuração realmente instalada na Oracle.
- A expansão multiempresa está adiada; [ESCOPO_SAAS_MULTITENANT.md](../docs/ESCOPO_SAAS_MULTITENANT.md) permanece somente como proposta futura.

## Ajustes finais no resumo e nos campos de fotos (10 de novembro, 20:35 UTC)

- Publicado somente o painel do commit `7ea5cee` (`fix(panel): simplifica resumo e campos de foto`). Pacote SHA-256 `5cd60b32b606101c35d754eca0479c0082b6a30353afa9783a860db6db7c6934`.
- A cópia anterior do painel está em `/srv/overtrip/retorno-painel-7ea5cee-20261110-203526/admin`. API, banco, esquema e site público não foram alterados.
- A página de início não repete mais o título “Seu resumo”. O primeiro indicador agora conta apenas viagens com data de hoje ou futura, excluindo concluídas e canceladas; elas continuam no histórico “Anteriores”. A contagem usa a listagem existente com `period=upcoming`.
- Nos formulários de viagem e galeria, fotos aparecem pelo nome do arquivo (ou “Foto enviada”), em vez do caminho inteiro. “Alterar endereço da foto” abre o campo técnico quando necessário.
- Verificação de produção: `/admin/`, entrada JS/CSS, chunks de início, formulário e galeria, `/health` e `/api/public/trips` responderam 200. Os chunks servidos contêm os textos novos e não contêm “Seu resumo”. Caddy e API ativos; `/admin/` envia `Cache-Control: no-cache, no-store, must-revalidate`.
- Validação local: `npm run typecheck:frontend`, `npm run build:frontend` e `git diff --check` passaram. Não foram executados testes automatizados nesta etapa.

## Correção de cache do painel (10 de novembro, 20:24 UTC)

- Após o operador informar que o painel ainda parecia antigo, confirmei que os novos chunks JavaScript da build `9f7e64b` estavam em produção e eram referenciados pelo bundle principal; não há service worker no painel.
- A resposta HTTPS de `/admin/` não trazia `Cache-Control`, pois a regra antiga só correspondia a `/index.html`, enquanto o Caddy serve o app shell em `/admin/`. Isso podia deixar o navegador reutilizar a página anterior.
- Ajustei a configuração ativa do Caddy para enviar `Cache-Control: no-cache, no-store, must-revalidate` na rota do painel. Uma cópia anterior do Caddyfile foi criada em `/etc/caddy/` com o prefixo `Caddyfile.antes-cache-admin-`.
- `caddy validate` passou. Como `admin off` desativa a API usada pelo comando de reload, foi necessário reiniciar o serviço; Caddy e API permaneceram ativos. Após reiniciar, `/admin/` e CSS responderam 200 com o novo cabeçalho, e `/health` respondeu 200.
- A política também impede cache dos assets do painel, inclusive os versionados. Isso prioriza a atualização imediata; uma otimização futura pode manter cache longo nos assets imutáveis com uma regra Caddy sem sobreposição.

## Ajustes de clareza no painel e na prévia do card (10 de novembro, 20:17 UTC)

- Publicado o commit `9f7e64b` (`fix(panel): clarifica campos e replica previa do card`), somente com os arquivos compilados do painel. Pacote SHA-256 `b1c85f31169b37a46e3976e6fbcae599cbe565dcb497561712459925ab8a7e88`.
- A cópia do painel anterior está em `/srv/overtrip/retorno-painel-9f7e64b-20261110-201727/admin` (67 arquivos). A publicação substituiu `/srv/overtrip-public/admin`; não alterou API, banco, esquema, site público ou serviços.
- O resumo agora informa “Viagens cadastradas” e deixa claro que inclui viagens realizadas. O atalho de sugestão por PDF/IA aparece no início do formulário com a orientação para salvar o rascunho antes de anexar o documento. A descrição de fotos usa linguagem simples (“O que aparece nesta foto?”).
- A prévia “Roteiro e o que inclui” foi alinhada à aparência pública, com marcadores, cores e bloco de destaque correspondentes.
- Verificação após a publicação: `/admin/`, os arquivos versionados `index-PUBRVDHJ.js` e `index-luq3zdjO.css`, `/health` e `/api/public/trips` responderam HTTP 200. Caddy, API, Tailscale e temporizador de backup estão ativos.
- Validação local antes da publicação: build, checagem de tipos do frontend, 15 testes Vitest direcionados e 17 cenários Playwright direcionados passaram; `git diff --check` passou.

Registro atualizado em 10 de novembro de 2026 após publicação do pacote principal baseado no commit `5f4583f` e do painel `d503876`. O site está publicado na Oracle. A zona DNS continua na HostGator (`ns64.hostgator.com.br` e `ns65.hostgator.com.br`); mantenha a hospedagem anterior disponível até a migração estar consolidada.

## FAQ público, fluxo de viagens e cache (10 de novembro, 13:28 UTC)

- Publicado o commit `30b8ff2` na branch `feat/evolucao-painel-viagens`. Pacote SHA-256 `d8ef8fbefcb03e7cbe6dd325d20a66747b78c778679bafe9cc3a4352763a34fb`. Não contém banco, `.env`, dependências ou credenciais. Sem migrações: o FAQ público usa a tabela `Setting` existente.
- Backup automático do banco executado com sucesso em `/var/backups/overtrip/overtrip-20261110-132750.db.gz`. Cópia para retorno do `dist`, site e painel em `/srv/overtrip/retorno-30b8ff2-20261110-132750`.
- O painel agora separa FAQ público do conhecimento privado da assistente. Administradores podem editar, ordenar e pré-visualizar as perguntas que aparecem no site; a atualização do FAQ é versionada para evitar que uma edição concorrente sobrescreva outra. A rota pública expõe apenas as perguntas e respostas; a rota administrativa sem login retorna 401. Não houve alteração do fluxo privado do n8n.
- A página atualiza o FAQ visível e o JSON-LD via JavaScript; a marcação estática do HTML continua sendo conteúdo de contingência. Buscadores sem execução de JavaScript podem não receber de imediato as edições feitas no painel.
- O formulário de viagens foi reorganizado para priorizar os dados que aparecem no card e deixar modelos e recursos auxiliares em “Mais ações”. O período “Próximas” exclui status `COMPLETED` e `CANCELLED`; métricas do painel deixam explícito quando contam viagens realizadas.
- As viagens públicas em produção são três, todas com status `completed` e datas entre 13 de setembro e 18 de outubro de 2026. O navegador real carregou a versão nova do filtro, exibiu zero cards e a mensagem de nenhuma expedição futura. Os módulos estáticos tinham cache de sete dias; os URLs versionados foram atualizados para forçar a busca do filtro novo em navegadores que ainda tinham a versão antiga.
- Após publicar: `/`, `/admin/`, `/health`, `/api/public/faq` e o módulo versionado de renderização responderam 200; editor administrativo sem autenticação respondeu 401. FAQ público entregou cinco itens, sem metadados internos. API, Caddy e temporizador de backup ativos; navegador não registrou erros JavaScript.
- Validação local: 658 testes passaram, 2 ignorados, 24 cenários Playwright passaram; build da API, checagem de tipos do painel e build do painel passaram. O teste de API do FAQ agora exige explicitamente `DATABASE_URL` terminando em `/prisma/test.db`.
- Limpeza solicitada após a publicação: removidas as nove cópias antigas de retorno de código, sete pacotes `.tar.gz`, quatro diretórios temporários de publicação, o checkout obsoleto `/home/ubuntu/overtrip-preparo` (542 MB, commit `96fdb59`, árvore limpa), a configuração candidata antiga em `/srv/overtrip/preview` e o diretório temporário de dependências. Mantidos o código ativo, os arquivos públicos ativos, o retorno mais recente acima, todos os backups em `/var/backups/overtrip` e a cópia externa em `/home/ubuntu/overtrip-backups`. Nenhum backup de banco foi apagado.
- Depois da limpeza, API, Caddy, Tailscale e `overtrip-backup.timer` permaneceram ativos; site e API pública responderam 200. Restou apenas `/srv/overtrip/retorno-30b8ff2-20261110-132750` como retorno de código. O volume raiz passou de 13 GB para 11 GB usados, com 105 GB livres.

## Painel de viagens e gráficos de saúde (10 de novembro, 10:16 UTC)

- Publicado o commit `a754efb`, pacote SHA-256 `ca5b461687e6e7e493f0f0c52a8c14c3b8a6ba8e1d74d854137a6c86c3acfebd`. O pacote contém o código compilado, o painel e os arquivos do monitor; não contém banco local, arquivo `.env` nem credenciais. Cópia de retorno: `/srv/overtrip/retorno-a754efb-20261110-101644`.
- Backup consistente do banco conferido antes da troca: `/var/backups/overtrip/overtrip-20261110-101428.db.gz`; `gzip -t` passou. Nenhuma migração ou alteração no banco de viagens foi necessária.
- A lista do painel agora abre em **Próximas**, separa **Anteriores** e **Todas** e preserva filtros de busca e situação. O filtro de data usa o dia civil de São Paulo; foi corrigida a composição da consulta para que a busca não anulasse o período. A prévia de proposta mantém a correção de horários já existente e usa termos mais claros.
- O cadastro tem categorias predefinidas (incluindo Trilha e Experiência) e opções selecionáveis para informações importantes, sem marcar orientações automaticamente. O recurso de PDF agora informa que extrai sugestões com IA. O menu/títulos foram alinhados e a tela **Saúde do servidor** ganhou gráficos de disco usado, memória disponível e carga por núcleo.
- O monitor grava o histórico em `/var/lib/overtrip/health/history.jsonl`, limitado a 2.016 coletas (sete dias, intervalo de cinco minutos). A leitura fica restrita a administradores. Na instalação, uma coleta durante a inicialização da API gerou um alerta transitório; a execução seguinte concluiu com `Result=success` e atualizou o estado corrente para saudável.
- Verificação após a publicação: `/`, `/admin/`, `/health` e `/api/public/trips` responderam HTTP 200; `/api/system/health` e `/api/system/health/history` sem autenticação responderam 401. API, Caddy, Tailscale e temporizador do monitor estão ativos. O histórico já contém duas coletas.
- Validação local: 651 testes passaram e 2 foram ignorados; 23 testes de navegador passaram; checagem de tipos, build do servidor, build do painel e `bash -n` do monitor passaram. A publicação não reiniciou a VM.

## Painel com o laranja do site (10 de novembro, 08:53 UTC)

- Publicado só o painel do commit `629b1b6`, compilado a partir de `git archive`, pacote SHA-256 `6f21680fba58d4c4566ccda9b5469ca8a4ffe720ced9d77c12290c4fd3dcfc4b`. API, site, banco, dependências e serviços não mudaram. Retorno em `/srv/overtrip/retorno-painel-20261110-085313`.
- O painel troca os tons escuros (`#BF5200`/`#993E00`) pelo laranja do site (`#E26B1B`) e escreve as datas por extenso com maiúscula só na primeira letra. Decisão de marca: textos pequenos em `#E26B1B` ficam abaixo de 4,5:1 sobre branco; o foco mantém 3,3:1.
- O instalador conferiu `/admin/` e seus arquivos (200), saúde, API pública e site (200), `/api/leads` sem login (401) e API, Caddy e timers ativos. Teste externo confirmou o CSS servido só com o laranja da marca e o tom claro do hover. Testes locais: 624 aprovados, tipos e build.
- Em seguida o operador instalou e ligou `overtrip-assistant` (escuta só em 127.0.0.1:3010) e publicou `tailscale serve --https=8443` (tailnet only); o Qwen segue em `:443`. Teste pela tailnet: sem senha e com senha errada 401; com a senha, `/n8n/v2/trips` 200 com 0 viagens (as três do site estão concluídas) e sem campos internos; `/n8n/v2/knowledge` 200 com entrada de 50% e 24 itens de FAQ (sem versão aprovada no painel). Para desligar: `sudo systemctl disable --now overtrip-assistant` e `sudo tailscale serve --https=8443 off`.
- Esse registro de 10 de novembro dizia que a troca estava pendente. Auditoria em 26 de novembro confirmou **OVERTRIP Assistente WhatsApp v35 ativa** e v34 inativa. Os nós de consulta fazem GET para `/n8n/v2/trips` e `/n8n/v2/knowledge` usando a credencial Header Auth `OVERTRIP Serviço Privado`; o agregador e o prompt consomem os formatos atuais do site. As oito execuções mais recentes constavam como sucesso, sem inspeção de mensagens ou dados de clientes.
- A leitura do site está integrada; o caminho de escrita do n8n para o painel ainda não está implementado. Leads e reservas atuais são criados pelas rotas administrativas. A próxima etapa deve usar a planilha manual como referência, preservar os campos estritamente necessários e criar registros sujeitos à revisão humana, sem confirmar pagamento ou reduzir vagas automaticamente.

## Atualização visual do painel

- Publicado o painel do commit `d503876`, compilado a partir de `git archive`, SHA-256 `a55fc1064f802dae8727eaaa97cbc1b7a5c502e95d5a6edbd7195644484d3d9d`. A versão anterior está em `/srv/overtrip/retorno-painel-20261110-073749`.
- A tela inicial destaca indicadores existentes, próximas viagens e calendário. Somente os arquivos do painel foram atualizados; API, banco e serviços permaneceram ativos. Site, painel, saúde e API pública responderam HTTP 200; monitor `ok`.
- Checagem de tipos, compilação, 12 testes focados e cenário de navegador para calendário passaram. O primeiro ensaio de navegador usou servidor anterior ainda ativo e falhou; repetido com servidor próprio, passou.

## Painel, CRM e reservas em 10 de novembro

- Publicado o commit `5f4583f`, compilado a partir de `git archive`, pacote SHA-256 `a902a8bd32af9975987b842269a96aa4aa3a3629242bbc01b82cc18406e09b5f`. O pacote Prisma contém somente esquema, migrações e seed, sem bancos de desenvolvimento ou arquivos de ambiente. Retorno de código em `/srv/overtrip/retorno-20261110-073104`.
- Publicados calendário e indicadores do painel, cadastro de destino visitado, avisos de fotos e campos pendentes, página Riders redesenhada e CRM/reservas. Aplicadas as três migrações `20261103010000_leads_crm`, `20261103020000_reservations` e `20261103103000_reservation_lead`: 15 migrações aplicadas, `integrity_check` igual a `ok`, quatro viagens e uma mídia mantidas na conferência. Não foram criados clientes nem reservas de teste em produção.
- Antes da publicação, as migrações foram ensaiadas numa cópia isolada do banco da VM, com contagens preservadas e comparação Prisma sem diferenças. Em banco temporário, o código anterior continuou funcionando após as migrações e retornou 409 ao excluir viagem com reserva. Retorno de código não restaura o banco: dados de CRM existentes precisam ser preservados, mesmo que o painel anterior não os mostre.
- `/`, `/admin/`, `/riders/`, `/health` e `/api/public/trips` retornaram 200; `/api/leads` e `/api/reservations` sem login retornaram 401, e `/.git/config` retornou 404. API, Caddy, Tailscale e os timers de backup/monitor ativos; monitor `ok`. O assistente auxiliar continua inativo. Testes locais: 620 aprovados, dois ignorados; 17 testes de navegador aprovados, além de testes da migração e retorno.
- Reservas e parcelas são registros administrativos manuais: não processam pagamentos e não descontam vagas automaticamente. Acesso ao CRM/reservas é restrito ao administrador. O uso de PDF em produção depende de armazenamento, scanner e worker ainda não preparados; verificar disponibilidade antes de orientar usuários.
- Revisão do Claude identificou `test.db` indevido em `/srv/overtrip/app/prisma`, trazido em publicação anterior. Arquivo movido sem exclusão para `/var/lib/overtrip-quarentena/teste-publicacao-20261110.db`, diretório root 700 e arquivo root 600; nenhum `*.db` permaneceu no diretório Prisma da aplicação.

## Correções de viagens de 10 de novembro

- Publicado pacote de SHA-256 `94860ab51765750a21889ed0d0d935132b0a41e5dd66150057ee19c99cab4b62`, baseado em `90ee0af` com CRM/reservas ainda excluídos. A cópia para retorno está em `/srv/overtrip/retorno-20261110-070847`; foi feito backup do banco e fotos.
- Aplicada a migração aditiva `20261110140000_trip_filter_category`. A chamada da foto foi preservada e a nova categoria do filtro precisa ser preenchida no painel. As três viagens públicas existentes estavam sem classificação após a publicação.
- Publicadas correções de prévia e conteúdo incluído, fotos dos cards, apresentação de dois embarques no celular e cor do botão principal no painel. Site, painel, API, monitor e timers responderam normalmente; caminhos privados conferidos retornaram 404.
- Validações: build e tipos; 84 testes focados na versão compatível com a produção; 40 testes de renderização/filtro; 12 cenários de navegador; conferência de larguras móveis e controles de animação. A suíte geral apontou um teste desatualizado sobre o campo antigo, ajustado e aprovado na execução focada.

## Publicação de 10 de novembro de 2026

- Pacote validado: SHA-256 `9bd61647fdfebbe8744da6b03240e33b78b4e57ff91c75ee920a11e3f7941f78`; o mesmo hash foi conferido na VM antes da instalação.
- Cópia para retorno: `/srv/overtrip/retorno-20261110-052649` (inclui código anterior, `node_modules`, configuração dos serviços e arquivos públicos anteriores). A publicação fez backup consistente do banco antes da alteração.
- Aplicada a migração aditiva `20261110120000_media_assets`; 11 migrações foram reconhecidas e `prisma migrate status` confirmou o schema atualizado. O pacote instalou a API/painel, filtro de categoria, formulário revisado e suporte a fotos WebP enviadas pelo painel. CRM/reservas e prévia de proposta continuam fora deste pacote.
- `/health`, `/api/public/trips`, `/`, `/admin/`, `/blog/`, `/riders/`, `/js/page.js` e `/js/tripFilters.js` retornaram HTTP 200. Sem autenticação, `/api/system/health`, `POST /api/media` e `POST /api/auth/logout` retornaram 401; mídia inexistente e `/.git/config`, `/trips.json`, `/knowledge.json` retornaram 404.
- Backup de banco e fotos executado; o monitor gravou `status: ok`. `overtrip-api`, `caddy`, `tailscaled`, `overtrip-health.timer` e `overtrip-backup.timer` estão ativos. `overtrip-assistant` segue inativo; a publicação não alterou o Tailscale Serve.
- Recursos conferidos após a publicação: 104 GB livres no volume de 116 GB, cerca de 10 GB de memória disponível e load average `0.75, 0.27, 0.15`. API escuta em `127.0.0.1:3001`, Caddy em `10.0.0.143:80/443`; Ollama permanece em `*:11434` como antes.
- Na release, Claude reportou 598 testes unitários aprovados e 11 migrações correspondentes ao schema. No HEAD completo, 612 testes, checagem de tipos, build e Playwright 12/12 passaram. As alterações foram enviadas à branch `feat/evolucao-painel-viagens` por avanço normal de `ab01a78` para `1065532`.

## Estado de preparo (registro histórico de 3 de novembro)

- Naquele preparo, o commit `96fdb59` foi instalado por `git archive` e compilado. O checkout antigo `~/overtrip-preparo` foi removido na limpeza de 10 de novembro; `/srv/overtrip/app` contém hoje a versão posterior descrita no registro desta publicação.
- Banco SQLite em `/var/lib/overtrip/overtrip.db`, proprietário `overtrip` e modo 600. A cópia de origem permanece em `~/overtrip-backups/overtrip-local-20261103-054537.db`. O hash SHA-256 conferiu na transferência e instalação; `integrity_check` retornou `ok` e o Prisma não encontrou diferenças de esquema para `96fdb59`.
- As dez migrações dessa versão constam como concluídas. A migração histórica `0_init` tem diferença de checksum já documentada em `README.md`; não alterar o histórico nem executar reset. O banco instalado já contém administrador.
- Serviço `overtrip-api` ativo e habilitado, executado como `overtrip`, escutando apenas em `127.0.0.1:3001`. `/health` e `/api/public/trips` retornaram HTTP 200. O arquivo `/etc/overtrip/env` é privado; não registrar seu conteúdo ou segredos.
- Backup SQLite local em `/var/backups/overtrip`, executado e verificado pelo serviço; `overtrip-backup.timer` ativo diariamente às 03:30 no fuso da VM (UTC, segundo a verificação anterior). Retenção configurada de 14 dias.
- Backup recente transferido para o computador em `~/backups-overtrip/oracle-pre-publicacao.db.gz`; gzip e SHA-256 conferidos com a cópia na Oracle. Restauração em diretório temporário retornou `integrity_check: ok`. Manter a cópia externa e repetir após alterações relevantes.
- Em 9 de novembro, o candidato foi ajustado para servir o site de `/srv/overtrip-public` e o painel de `/srv/overtrip-public/admin`. O endereço privado atual da interface `enp0s6` é `10.0.0.143`.
- `caddy.service` foi desmascarado, habilitado e iniciado em 9 de novembro. A saída de `systemctl status` confirmou `active (running)`; `ss` confirmou listeners em `10.0.0.143:80` e `10.0.0.143:443`. Tailscale continuou escutando em `100.99.26.96:443`; não houve conflito observado.
- O firewall local permite TCP 80/443. O operador atualizou `/etc/iptables/rules.v4`, mantendo SSH 22 e a rejeição final; `iptables-restore --test` validou a sintaxe e uma cópia anterior foi preservada. Após o reinício de 9 de novembro, `iptables -S INPUT` confirmou que as regras persistiram.
- O registro A principal aponta para `136.248.78.185`; `www` é CNAME para `overtrip.com.br`. O valor anterior do A era `192.185.213.226`. Os demais registros, inclusive os de e-mail, devem ser preservados.
- Em 9 de novembro, o Caddy obteve certificados Let's Encrypt para os dois nomes. Em teste externo direcionado à Oracle, `/`, `/admin/`, `/health` e `/api/public/trips` responderam HTTPS 200; `/.git/config`, `/trips.json` e `/knowledge.json` responderam 404. `www` redirecionou para o domínio principal. O operador confirmou site e painel funcionando.
- Arquivos públicos copiados para `/srv/overtrip-public`, dono `root:root`, diretórios 755 e arquivos 644. Inclui site e painel; não inclui `trips.json` ou `knowledge.json`. `caddy` consegue ler site/painel e não consegue ler banco nem `/etc/overtrip/env`.
- Teste temporário do Caddy como usuário `caddy`, em loopback na porta 8090, passou: site, CSS, painel, JS do painel e API retornaram HTTP 200; `/knowledge.json` e `/trips.json` retornaram HTTP 404. A unidade temporária foi parada ao fim do teste. O inventário preparado exclui esses arquivos de dados privados.
- A configuração de armazenamento de documentos foi omitida; o worker de documentos não foi habilitado. Não presumir que PDFs tenham sido transferidos.

- Em 10 de novembro (01:53 UTC), o operador publicou a versão de interface: logout com revogação de sessão (sessão padrão de 2h, `JWT_EXPIRES_IN` não definido; todos precisaram entrar de novo), filtro por categoria, nova seção de depoimentos, reutilização de viagem e log de erros sem dados pessoais. Sem migração nem mudança de dependências. O script de instalação fez backup do banco, guardou a versão anterior em `/srv/overtrip/retorno-final-20261110-015323` e conferiu `/health`, `/api/public/trips`, `/`, `/admin/` (200) e logout sem token (401). Teste externo confirmou as mesmas rotas, 404 para `/js/script.js`, `/css/styles.css`, `/.index-novo.html` e `/trips.json`, e o navegador não registrou erros de JavaScript.
- O monitor `overtrip-health.timer` roda a cada 5 minutos como `overtrip` (sem root) e registrou apenas `OK` após a publicação. Ainda não envia alertas para fora da VM.

## Próximos passos

1. Acompanhar a propagação DNS e o funcionamento público; manter a HostGator disponível para retorno. Se necessário, reverter o A principal ao valor anterior, preservando os demais registros.
2. Confirmar a versão do kernel em execução e reavaliar atualizações pendentes; um reinício foi realizado e os serviços foram conferidos, mas não há confirmação da versão efetivamente carregada.
3. Avaliar se `rpcbind` e Ollama são necessários e limitar suas interfaces se apropriado.
4. Não instalar cegamente o `deploy/Caddyfile` versionado: ele é um modelo histórico genérico e não preserva os binds específicos usados para coexistir com o Tailscale na configuração da VM.
5. Preparar armazenamento, scanner e backup dos PDFs antes de habilitar o processamento de documentos.
6. Repetir periodicamente o teste de restauração e preparar uma cópia fora da VM. O backup local de 11 de novembro passou por integridade SQLite e verificação de chaves estrangeiras em diretório temporário.
7. Verificar e remover o acesso SSH temporário de transferência quando não for mais necessário, preservando as demais chaves autorizadas.
8. Validar o uso de CRM e reservas com o operador; definir como controlar vagas e formalizar retenção e cópia externa segura dos dados. `/srv/overtrip/app` veio de `git archive` e não aceita `git pull`.

## Auditoria de segurança (9 de novembro de 2026)

- Confirmados: API, Caddy, Tailscale e temporizador de backup ativos; ambiente da API com modo 600; banco e backups com modo 700; arquivos públicos root:root e modo 755; nenhum banco, chave, `.env`, `trips.json` ou `knowledge.json` encontrado sob `/srv/overtrip-public`; nenhum arquivo público gravável por todos; Caddy consegue ler as páginas do site e do painel; configuração Caddy valida.
- Após reinício, API, Caddy, Tailscale e temporizador de backup voltaram ativos; SSH foi usado para conferir a VM. As regras IPv4 de SSH/HTTP/HTTPS persistiram, a API escutava em loopback e o Tailscale preservou sua escuta própria. Teste externo direcionado à Oracle confirmou HTTPS 200 para site, painel e API; caminhos privados retornaram 404 e `www` redirecionou para o domínio principal.
- `rpcbind` escutava em todas as interfaces na porta 111 e Ollama na 11434 na auditoria anterior. A tela compartilhada não mostrava grupos de segurança de rede no compartimento filtrado; o operador informou não ter liberado essas portas. A cadeia IPv4 local as rejeita para conexões novas externas. Isso não constitui verificação exaustiva de outras sub-redes, compartimentos ou IPv6; avaliar necessidade dos serviços antes de desativar ou limitar.
- SSH: autenticação por senha desativada, chave pública habilitada e login root apenas por chave; encaminhamento TCP e X11 estão habilitados e devem ser restringidos se não forem necessários. Há tentativas automatizadas inválidas registradas, sem sucesso observado; logins válidos por chave vieram do IP administrativo informado na saída.
- Antes do reinício havia aviso de reinicialização e atualizações disponíveis. O temporizador voltou ativo e mostrou próximo disparo, mas não foi executado um backup ou teste de restauração adicional nessa etapa; verificar novamente atualizações e kernel carregado.
- `caddy-api` permanece mascarado/inativo, conforme esperado; a API do Caddy não está exposta por esse serviço.
- Os testes de rota local usados anteriormente consultaram `127.0.0.1`, mas o Caddy só está vinculado a `10.0.0.143`; portanto, os resultados HTTP 000 desses testes não indicam falha do site.
- O site tenta carregar `/trips.json` como alternativa quando a API falha (`js/data.js`), mas esse caminho está bloqueado na Oracle. Assim, não há alternativa de viagens funcional durante uma indisponibilidade da API. Avaliar um snapshot público sanitizado antes de mudar essa política; não expor o arquivo privado existente.

As seis vulnerabilidades relatadas por `npm ci` eram de dependências de desenvolvimento na verificação anterior; `npm audit --omit=dev` no commit preparado retornou zero. Reavalie as dependências antes da publicação.

## Viagens com vários destinos e confirmação de realização (26 de novembro de 2026)

- Publicado API e painel do commit `7ff3987`, compilado em `/srv/overtrip/app`; SHA-256 do pacote: `f3cf87b76257c45742c05de8f22d3a54eb8c6723bb6ff19b4c1fd35e06213d33`. Migração aditiva `20261128010000_outing_trip_stops_status`; aplicada após backup validado `/var/backups/overtrip/pre-7ff3987-final-20261126-091320.db.gz`. Código anterior preservado em `/srv/overtrip/retorno-7ff3987-20261126-085557`.
- Antes da migração, cópia de ensaio no diretório privado `/srv/overtrip/rehearsal-7ff3987` foi migrada; script de agrupamento em modo simulação identificou os três destinos de 15/08/2026 sem ambiguidade.
- Após migrar, a mesma rotina agrupou Dique de Cabedelo como principal, Fortaleza de Santa Catarina e Praia Formosa como paradas. Não alterou valores financeiros nem marcou realização. A integridade SQLite retornou `ok` e `foreign_key_check` não encontrou violações.
- API e Caddy ativos; `/`, `/admin/` e `/health` 200, rotas privadas sem sessão 401; journal sem avisos no período da publicação. A equipe precisa abrir o Financeiro e confirmar o status da viagem quando apropriado.
- Validação local registrada pelo Claude: 1.356 testes Vitest aprovados, 6 ignorados, 3 cenários Playwright, tipos e builds da API e painel aprovados. Nesta sessão foram refeitos os builds, typecheck e o cenário `finance-trip-confirm`.
