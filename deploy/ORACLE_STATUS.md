# Estado da preparação na Oracle

Registro atualizado em 3 de novembro de 2026, baseado nas saídas compartilhadas pelo operador. Confirme o estado na VM antes de alterar serviços ou dados.

## Preparado

- Código do commit `96fdb59` em `/srv/overtrip/app`, instalado por `git archive` e compilado. Essa cópia não tem `.git`; `git pull` nesse diretório não funciona. A instalação de preparo em `~/overtrip-preparo` tem Git.
- Banco SQLite em `/var/lib/overtrip/overtrip.db`, proprietário `overtrip` e modo 600. A cópia de origem permanece em `~/overtrip-backups/overtrip-local-20261103-054537.db`. O hash SHA-256 conferiu na transferência e instalação; `integrity_check` retornou `ok` e o Prisma não encontrou diferenças de esquema para `96fdb59`.
- As dez migrações dessa versão constam como concluídas. A migração histórica `0_init` tem diferença de checksum já documentada em `README.md`; não alterar o histórico nem executar reset. O banco instalado já contém administrador.
- Serviço `overtrip-api` ativo e habilitado, executado como `overtrip`, escutando apenas em `127.0.0.1:3001`. `/health` e `/api/public/trips` retornaram HTTP 200. O arquivo `/etc/overtrip/env` é privado; não registrar seu conteúdo ou segredos.
- Backup SQLite local em `/var/backups/overtrip`, executado e verificado pelo serviço; `overtrip-backup.timer` ativo diariamente às 03:30 no fuso da VM, que estava em UTC. Retenção configurada de 14 dias. A restauração completa e a cópia fora da VM ainda não foram verificadas.
- Backup recente transferido para o computador em `~/backups-overtrip/oracle-pre-publicacao.db.gz`; gzip e SHA-256 conferidos com a cópia na Oracle. Restauração em diretório temporário retornou `integrity_check: ok`.
- Caddy Ubuntu instalado (2.6.2), com `caddy.service` e `caddy-api.service` mascarados e inativos enquanto a configuração pública é preparada. Tailscale permaneceu ativo; sua escuta existente em `tailscale0:443` deve ser preservada.
- Configuração candidata em `/srv/overtrip/preview/Caddyfile.publicacao`, validada. `bind` está restrito ao IPv4 da `enp0s6` para 80/443 e não declara listeners adicionais. A configuração ainda não está ativa; confirme novamente o endereço da interface antes de usar.
- Arquivos públicos copiados para `/srv/overtrip-public`, dono `root:root`, diretórios 755 e arquivos 644. Inclui site e painel; não inclui `trips.json` ou `knowledge.json`. `caddy` consegue ler site/painel e não consegue ler banco nem `/etc/overtrip/env`.
- Teste temporário do Caddy como usuário `caddy`, em loopback na porta 8090, passou: site, CSS, painel, JS do painel e API retornaram HTTP 200; `/knowledge.json` e `/trips.json` retornaram HTTP 404. A unidade temporária foi parada ao fim do teste. A prévia anterior em 127.0.0.1:8089 também foi usada para conferir visualmente o site e entrar no painel.
- A configuração de armazenamento de documentos foi omitida; o worker de documentos não foi habilitado. Não presumir que PDFs tenham sido transferidos.

## Próximos passos

1. Conferir no painel Cloudflare os registros A/AAAA/CNAME, destino de origem e modo de proxy/TLS atuais; DNS público observado aponta para IPs Cloudflare e não revela a origem.
2. Verificar regras de entrada da VCN e firewall Ubuntu para portas 80/443. Planejar TLS com Cloudflare e Caddy, preservando a escuta Tailscale em `tailscale0:443`; testar listeners efetivos após ativação controlada.
3. Preparar a configuração final do Caddy usando `/srv/overtrip-public` e o bind confirmado da `enp0s6`; manter `knowledge.json` e `trips.json` privados. Validar HTTPS, site, painel, API e caminhos privados antes de alterar DNS.
4. Registrar estado atual do DNS e plano de retorno para a hospedagem existente. Só então fazer a troca planejada e testar o domínio público; manter a hospedagem anterior até validar.
5. O backup externo e o teste de restauração isolada foram concluídos nesta etapa; manter a cópia externa e repetir após alterações relevantes.
4. Preparar armazenamento, scanner e backup dos PDFs antes de habilitar o processamento de documentos.
5. A VM informou atualização de kernel pendente. Planejar reinício e verificar serviços e backups após ele; nenhum reinício foi feito nesta sessão.
6. Verificar e remover o acesso SSH temporário de transferência quando não for mais necessário, preservando as demais chaves autorizadas.
7. A branch local `feat/evolucao-painel-viagens` contém trabalho de interessados, reservas e propostas, ainda não implantado na VM. Definir e testar o procedimento de atualização antes de instalá-lo; `/srv/overtrip/app` veio de `git archive` e não aceita `git pull`.

As seis vulnerabilidades relatadas por `npm ci` eram de dependências de desenvolvimento na verificação anterior; `npm audit --omit=dev` no commit preparado retornou zero. Reavalie as dependências antes da publicação.
