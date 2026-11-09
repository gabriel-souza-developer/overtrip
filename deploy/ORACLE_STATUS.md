# Estado da preparação na Oracle

Registro atualizado em 9 de novembro de 2026, com base nas saídas da VM compartilhadas pelo operador. O domínio público continua hospedado na HostGator; a Oracle ainda não recebe o tráfego público do domínio.

## Preparado

- Código do commit `96fdb59` em `/srv/overtrip/app`, instalado por `git archive` e compilado. Essa cópia não tem `.git`; `git pull` nesse diretório não funciona. A instalação de preparo em `~/overtrip-preparo` tem Git.
- Banco SQLite em `/var/lib/overtrip/overtrip.db`, proprietário `overtrip` e modo 600. A cópia de origem permanece em `~/overtrip-backups/overtrip-local-20261103-054537.db`. O hash SHA-256 conferiu na transferência e instalação; `integrity_check` retornou `ok` e o Prisma não encontrou diferenças de esquema para `96fdb59`.
- As dez migrações dessa versão constam como concluídas. A migração histórica `0_init` tem diferença de checksum já documentada em `README.md`; não alterar o histórico nem executar reset. O banco instalado já contém administrador.
- Serviço `overtrip-api` ativo e habilitado, executado como `overtrip`, escutando apenas em `127.0.0.1:3001`. `/health` e `/api/public/trips` retornaram HTTP 200. O arquivo `/etc/overtrip/env` é privado; não registrar seu conteúdo ou segredos.
- Backup SQLite local em `/var/backups/overtrip`, executado e verificado pelo serviço; `overtrip-backup.timer` ativo diariamente às 03:30 no fuso da VM (UTC, segundo a verificação anterior). Retenção configurada de 14 dias.
- Backup recente transferido para o computador em `~/backups-overtrip/oracle-pre-publicacao.db.gz`; gzip e SHA-256 conferidos com a cópia na Oracle. Restauração em diretório temporário retornou `integrity_check: ok`. Manter a cópia externa e repetir após alterações relevantes.
- Em 9 de novembro, o candidato foi ajustado para servir o site de `/srv/overtrip-public` e o painel de `/srv/overtrip-public/admin`. O endereço privado atual da interface `enp0s6` é `10.0.0.143`.
- `caddy.service` foi desmascarado, habilitado e iniciado em 9 de novembro. A saída de `systemctl status` confirmou `active (running)`; `ss` confirmou listeners em `10.0.0.143:80` e `10.0.0.143:443`. Tailscale continuou escutando em `100.99.26.96:443`; não houve conflito observado.
- A validação ACME falhou porque `overtrip.com.br` e `www.overtrip.com.br` ainda resolviam para `192.185.213.226` (HostGator). O Caddy tentou HTTP-01/TLS-ALPN-01 contra o host antigo, e não conseguiu emitir certificados. ZeroSSL também falhou no cadastro da conta. HTTPS público na Oracle ainda não está pronto.
- Arquivos públicos copiados para `/srv/overtrip-public`, dono `root:root`, diretórios 755 e arquivos 644. Inclui site e painel; não inclui `trips.json` ou `knowledge.json`. `caddy` consegue ler site/painel e não consegue ler banco nem `/etc/overtrip/env`.
- Teste temporário do Caddy como usuário `caddy`, em loopback na porta 8090, passou: site, CSS, painel, JS do painel e API retornaram HTTP 200; `/knowledge.json` e `/trips.json` retornaram HTTP 404. A unidade temporária foi parada ao fim do teste. O inventário preparado exclui esses arquivos de dados privados.
- A configuração de armazenamento de documentos foi omitida; o worker de documentos não foi habilitado. Não presumir que PDFs tenham sido transferidos.

## Próximos passos

1. No Cloudflare, apontar os registros A de `overtrip.com.br` e `www` para `136.248.78.185` quando for a hora da publicação. O domínio permanece na HostGator até essa alteração; registrar a configuração anterior para retorno. Preferir DNS only durante a validação inicial do certificado Caddy.
2. Após a mudança, acompanhar `journalctl -u caddy` e confirmar certificado, HTTP/HTTPS, site, painel, API e respostas 404 para caminhos privados. Manter a hospedagem HostGator disponível até validar tudo.
3. Confirmar externamente que as regras TCP 80/443 da VCN estão aplicadas. A tentativa anterior de conexão às portas ocorreu antes da ativação do Caddy; ainda não há teste externo bem-sucedido registrado.
4. Não instalar cegamente o `deploy/Caddyfile` versionado: ele é um modelo genérico antigo, aponta para `/srv/overtrip/app` e lista `/trips.json` e `/knowledge.json`, diferindo da configuração privada preparada na VM.
5. Preparar armazenamento, scanner e backup dos PDFs antes de habilitar o processamento de documentos.
6. A VM informou atualização de kernel pendente. Planejar reinício e verificar serviços e backups após ele; nenhum reinício foi feito nesta sessão.
7. Verificar e remover o acesso SSH temporário de transferência quando não for mais necessário, preservando as demais chaves autorizadas.
8. A branch local `feat/evolucao-painel-viagens` contém trabalho de interessados, reservas e propostas, ainda não implantado na VM. Definir e testar o procedimento de atualização antes de instalá-lo; `/srv/overtrip/app` veio de `git archive` e não aceita `git pull`.

As seis vulnerabilidades relatadas por `npm ci` eram de dependências de desenvolvimento na verificação anterior; `npm audit --omit=dev` no commit preparado retornou zero. Reavalie as dependências antes da publicação.
