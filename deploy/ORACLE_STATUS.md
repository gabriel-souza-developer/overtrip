# Estado da produção na Oracle

Registro atualizado em 10 de novembro de 2026 após publicação do pacote baseado no commit `5f4583f`. O site está publicado na Oracle. A zona DNS continua na HostGator (`ns64.hostgator.com.br` e `ns65.hostgator.com.br`); mantenha a hospedagem anterior disponível até a migração estar consolidada.

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

## Preparado

- Código do commit `96fdb59` em `/srv/overtrip/app`, instalado por `git archive` e compilado. Essa cópia não tem `.git`; `git pull` nesse diretório não funciona. A instalação de preparo em `~/overtrip-preparo` tem Git.
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
4. Não instalar cegamente o `deploy/Caddyfile` versionado: ele é um modelo genérico antigo, aponta para `/srv/overtrip/app` e lista `/trips.json` e `/knowledge.json`, diferindo da configuração privada preparada na VM.
5. Preparar armazenamento, scanner e backup dos PDFs antes de habilitar o processamento de documentos.
6. Confirmar periodicamente a execução e a restauração dos backups; não foi criado backup adicional antes do reinício por decisão do operador.
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
