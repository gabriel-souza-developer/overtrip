# Estado da preparação na Oracle

Registro atualizado em 9 de novembro de 2026, com base nas saídas da VM e em consulta DNS pública. O domínio continua hospedado na HostGator; a delegação autoritativa observada é `ns64.hostgator.com.br` e `ns65.hostgator.com.br`, portanto a zona DNS atual é gerenciada pela HostGator, não pela Cloudflare. A Oracle ainda não recebe o tráfego público do domínio.

## Preparado

- Código do commit `96fdb59` em `/srv/overtrip/app`, instalado por `git archive` e compilado. Essa cópia não tem `.git`; `git pull` nesse diretório não funciona. A instalação de preparo em `~/overtrip-preparo` tem Git.
- Banco SQLite em `/var/lib/overtrip/overtrip.db`, proprietário `overtrip` e modo 600. A cópia de origem permanece em `~/overtrip-backups/overtrip-local-20261103-054537.db`. O hash SHA-256 conferiu na transferência e instalação; `integrity_check` retornou `ok` e o Prisma não encontrou diferenças de esquema para `96fdb59`.
- As dez migrações dessa versão constam como concluídas. A migração histórica `0_init` tem diferença de checksum já documentada em `README.md`; não alterar o histórico nem executar reset. O banco instalado já contém administrador.
- Serviço `overtrip-api` ativo e habilitado, executado como `overtrip`, escutando apenas em `127.0.0.1:3001`. `/health` e `/api/public/trips` retornaram HTTP 200. O arquivo `/etc/overtrip/env` é privado; não registrar seu conteúdo ou segredos.
- Backup SQLite local em `/var/backups/overtrip`, executado e verificado pelo serviço; `overtrip-backup.timer` ativo diariamente às 03:30 no fuso da VM (UTC, segundo a verificação anterior). Retenção configurada de 14 dias.
- Backup recente transferido para o computador em `~/backups-overtrip/oracle-pre-publicacao.db.gz`; gzip e SHA-256 conferidos com a cópia na Oracle. Restauração em diretório temporário retornou `integrity_check: ok`. Manter a cópia externa e repetir após alterações relevantes.
- Em 9 de novembro, o candidato foi ajustado para servir o site de `/srv/overtrip-public` e o painel de `/srv/overtrip-public/admin`. O endereço privado atual da interface `enp0s6` é `10.0.0.143`.
- `caddy.service` foi desmascarado, habilitado e iniciado em 9 de novembro. A saída de `systemctl status` confirmou `active (running)`; `ss` confirmou listeners em `10.0.0.143:80` e `10.0.0.143:443`. Tailscale continuou escutando em `100.99.26.96:443`; não houve conflito observado.
- Em 9 de novembro, o firewall local foi ajustado em execução para aceitar conexões TCP novas nas portas 80 e 443 antes da regra de rejeição. A regra SSH 22 foi preservada. A persistência dessas regras após reinício ainda não foi verificada.
- HTTP consultado localmente em `10.0.0.143` respondeu com `301` para HTTPS. A consulta HTTPS retornou erro TLS, sem certificado disponível; o site e a API ainda não foram validados por HTTPS.
- A validação ACME falhou porque `overtrip.com.br` e `www.overtrip.com.br` ainda resolviam para `192.185.213.226` (HostGator). O Caddy tentou HTTP-01/TLS-ALPN-01 contra o host antigo. Os logs também mostram tentativas contra o endpoint de staging do Let's Encrypt, mas os arquivos `/etc/caddy/Caddyfile` e `/srv/overtrip/preview/Caddyfile.publicacao` não definem `acme_ca`, `staging` ou emissor alternativo; não há configuração fixa de staging identificada. ZeroSSL falhou no cadastro da conta. HTTPS público na Oracle ainda não está pronto.
- Arquivos públicos copiados para `/srv/overtrip-public`, dono `root:root`, diretórios 755 e arquivos 644. Inclui site e painel; não inclui `trips.json` ou `knowledge.json`. `caddy` consegue ler site/painel e não consegue ler banco nem `/etc/overtrip/env`.
- Teste temporário do Caddy como usuário `caddy`, em loopback na porta 8090, passou: site, CSS, painel, JS do painel e API retornaram HTTP 200; `/knowledge.json` e `/trips.json` retornaram HTTP 404. A unidade temporária foi parada ao fim do teste. O inventário preparado exclui esses arquivos de dados privados.
- A configuração de armazenamento de documentos foi omitida; o worker de documentos não foi habilitado. Não presumir que PDFs tenham sido transferidos.

## Próximos passos

1. Na zona DNS da HostGator, apontar os registros A de `overtrip.com.br` e `www` para `136.248.78.185` quando for a hora da publicação. Registrar a configuração anterior para retorno e preservar registros de e-mail (MX/TXT) e outros serviços. Preferir a validação direta na Oracle antes de alterar DNS; manter a hospedagem HostGator para retorno.
2. Após a mudança, acompanhar `journalctl -u caddy` e confirmar certificado, HTTP/HTTPS, site, painel, API e respostas 404 para caminhos privados. Manter a hospedagem HostGator disponível até validar tudo.
3. Confirmar externamente que as regras TCP 80/443 da VCN estão aplicadas. A tentativa anterior de conexão às portas ocorreu antes da ativação do Caddy; ainda não há teste externo bem-sucedido registrado.
4. Não instalar cegamente o `deploy/Caddyfile` versionado: ele é um modelo genérico antigo, aponta para `/srv/overtrip/app` e lista `/trips.json` e `/knowledge.json`, diferindo da configuração privada preparada na VM.
5. Preparar armazenamento, scanner e backup dos PDFs antes de habilitar o processamento de documentos.
6. A VM informou atualização de kernel pendente. Planejar reinício e verificar serviços e backups após ele; nenhum reinício foi feito nesta sessão.
7. Verificar e remover o acesso SSH temporário de transferência quando não for mais necessário, preservando as demais chaves autorizadas.
8. A branch local `feat/evolucao-painel-viagens` contém trabalho de interessados, reservas e propostas, ainda não implantado na VM. Definir e testar o procedimento de atualização antes de instalá-lo; `/srv/overtrip/app` veio de `git archive` e não aceita `git pull`.

## Auditoria de segurança (9 de novembro de 2026)

- Confirmados: API, Caddy, Tailscale e temporizador de backup ativos; ambiente da API com modo 600; banco e backups com modo 700; arquivos públicos root:root e modo 755; nenhum banco, chave, `.env`, `trips.json` ou `knowledge.json` encontrado sob `/srv/overtrip-public`; nenhum arquivo público gravável por todos; Caddy consegue ler as páginas do site e do painel; configuração Caddy valida.
- O firewall local usa `iptables-nft`; a cadeia INPUT rejeitava conexões novas exceto SSH. Foram inseridas regras em execução para TCP 80/443. O teste HTTP local resultou em redirecionamento 301; HTTPS falhou por ausência de certificado. Confirmar alcance externo e persistência após reinício em janela planejada.
- `rpcbind` escuta em todas as interfaces na porta 111 e Ollama em todas as interfaces na 11434. A saída local não prova exposição externa; confirmar que VCN/NSG não permitem essas portas e avaliar se os serviços são necessários antes de desativar ou limitar.
- SSH: autenticação por senha desativada, chave pública habilitada e login root apenas por chave; encaminhamento TCP e X11 estão habilitados e devem ser restringidos se não forem necessários. Há tentativas automatizadas inválidas registradas, sem sucesso observado; logins válidos por chave vieram do IP administrativo informado na saída.
- Há reinicialização pendente e atualizações disponíveis. Planejar atualização/reinício e validar SSH, Caddy, API, Tailscale e backup após a janela.
- `caddy-api` permanece mascarado/inativo, conforme esperado; a API do Caddy não está exposta por esse serviço.
- Os testes de rota local usados anteriormente consultaram `127.0.0.1`, mas o Caddy só está vinculado a `10.0.0.143`; portanto, os resultados HTTP 000 desses testes não indicam falha do site.

As seis vulnerabilidades relatadas por `npm ci` eram de dependências de desenvolvimento na verificação anterior; `npm audit --omit=dev` no commit preparado retornou zero. Reavalie as dependências antes da publicação.
