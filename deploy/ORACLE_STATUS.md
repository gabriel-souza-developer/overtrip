# Estado da produção na Oracle

> Este arquivo é um diário de alterações e verificações, não um monitor em
> tempo real. O registro mais recente abaixo é de 13 de novembro de 2026; não
> confirma que serviços, DNS, dados ou configurações continuam iguais hoje.
> Para mudanças operacionais, obtenha evidência nova diretamente da VM e
> preserve os limites de privacidade. CRM/reservas foram publicados segundo o
> registro de 10 de novembro, mas os fluxos e limites descritos nessa entrada
> não significam que o estado atual da instância foi novamente verificado.

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
- Pendente no n8n: credencial Header Auth `OVERTRIP Serviço Privado`, importar `docs/local/OVERTRIP Assistente WhatsApp v35.json`, testar e trocar a v34 (que depende de `/trips.json`, 404) pela v35.

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
