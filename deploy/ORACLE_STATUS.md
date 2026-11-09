# Estado da preparação na Oracle

Registro atualizado em 9 de novembro de 2026, com base nas saídas da VM, consultas públicas e confirmação do operador. O site está publicado na Oracle. A zona DNS continua na HostGator (`ns64.hostgator.com.br` e `ns65.hostgator.com.br`); a hospedagem anterior deve ser mantida até a migração estar consolidada.

## Preparado

- Código do commit `96fdb59` em `/srv/overtrip/app`, instalado por `git archive` e compilado. Essa cópia não tem `.git`; `git pull` nesse diretório não funciona. A instalação de preparo em `~/overtrip-preparo` tem Git.
- Banco SQLite em `/var/lib/overtrip/overtrip.db`, proprietário `overtrip` e modo 600. A cópia de origem permanece em `~/overtrip-backups/overtrip-local-20261103-054537.db`. O hash SHA-256 conferiu na transferência e instalação; `integrity_check` retornou `ok` e o Prisma não encontrou diferenças de esquema para `96fdb59`.
- As dez migrações dessa versão constam como concluídas. A migração histórica `0_init` tem diferença de checksum já documentada em `README.md`; não alterar o histórico nem executar reset. O banco instalado já contém administrador.
- Serviço `overtrip-api` ativo e habilitado, executado como `overtrip`, escutando apenas em `127.0.0.1:3001`. `/health` e `/api/public/trips` retornaram HTTP 200. O arquivo `/etc/overtrip/env` é privado; não registrar seu conteúdo ou segredos.
- Backup SQLite local em `/var/backups/overtrip`, executado e verificado pelo serviço; `overtrip-backup.timer` ativo diariamente às 03:30 no fuso da VM (UTC, segundo a verificação anterior). Retenção configurada de 14 dias.
- Backup recente transferido para o computador em `~/backups-overtrip/oracle-pre-publicacao.db.gz`; gzip e SHA-256 conferidos com a cópia na Oracle. Restauração em diretório temporário retornou `integrity_check: ok`. Manter a cópia externa e repetir após alterações relevantes.
- Em 9 de novembro, o candidato foi ajustado para servir o site de `/srv/overtrip-public` e o painel de `/srv/overtrip-public/admin`. O endereço privado atual da interface `enp0s6` é `10.0.0.143`.
- `caddy.service` foi desmascarado, habilitado e iniciado em 9 de novembro. A saída de `systemctl status` confirmou `active (running)`; `ss` confirmou listeners em `10.0.0.143:80` e `10.0.0.143:443`. Tailscale continuou escutando em `100.99.26.96:443`; não houve conflito observado.
- O firewall local permite TCP 80/443 em execução. O operador atualizou `/etc/iptables/rules.v4`, mantendo SSH 22 e a rejeição final; `iptables-restore --test` validou a sintaxe e uma cópia anterior foi preservada. O carregamento após reinício ainda não foi verificado.
- O registro A principal aponta para `136.248.78.185`; `www` é CNAME para `overtrip.com.br`. O valor anterior do A era `192.185.213.226`. Os demais registros, inclusive os de e-mail, devem ser preservados.
- Em 9 de novembro, o Caddy obteve certificados Let's Encrypt para os dois nomes. Em teste externo direcionado à Oracle, `/`, `/admin/`, `/health` e `/api/public/trips` responderam HTTPS 200; `/.git/config`, `/trips.json` e `/knowledge.json` responderam 404. `www` redirecionou para o domínio principal. O operador confirmou site e painel funcionando.
- Arquivos públicos copiados para `/srv/overtrip-public`, dono `root:root`, diretórios 755 e arquivos 644. Inclui site e painel; não inclui `trips.json` ou `knowledge.json`. `caddy` consegue ler site/painel e não consegue ler banco nem `/etc/overtrip/env`.
- Teste temporário do Caddy como usuário `caddy`, em loopback na porta 8090, passou: site, CSS, painel, JS do painel e API retornaram HTTP 200; `/knowledge.json` e `/trips.json` retornaram HTTP 404. A unidade temporária foi parada ao fim do teste. O inventário preparado exclui esses arquivos de dados privados.
- A configuração de armazenamento de documentos foi omitida; o worker de documentos não foi habilitado. Não presumir que PDFs tenham sido transferidos.

## Próximos passos

1. Acompanhar a propagação DNS e o funcionamento público; manter a HostGator disponível para retorno. Se necessário, reverter o A principal ao valor anterior, preservando os demais registros.
2. Planejar reinício para aplicar atualização pendente; depois confirmar SSH, firewall persistido, Tailscale, Caddy, API e temporizador de backup.
3. Confirmar que a VCN/NSG não permite acesso indevido às portas 111 e 11434 e avaliar os serviços correspondentes.
4. Não instalar cegamente o `deploy/Caddyfile` versionado: ele é um modelo genérico antigo, aponta para `/srv/overtrip/app` e lista `/trips.json` e `/knowledge.json`, diferindo da configuração privada preparada na VM.
5. Preparar armazenamento, scanner e backup dos PDFs antes de habilitar o processamento de documentos.
6. A VM informou atualização de kernel pendente. Planejar reinício e verificar serviços e backups após ele; nenhum reinício foi feito nesta sessão.
7. Verificar e remover o acesso SSH temporário de transferência quando não for mais necessário, preservando as demais chaves autorizadas.
8. A branch local `feat/evolucao-painel-viagens` contém trabalho de interessados, reservas e propostas, ainda não implantado na VM. Definir e testar o procedimento de atualização antes de instalá-lo; `/srv/overtrip/app` veio de `git archive` e não aceita `git pull`.

## Auditoria de segurança (9 de novembro de 2026)

- Confirmados: API, Caddy, Tailscale e temporizador de backup ativos; ambiente da API com modo 600; banco e backups com modo 700; arquivos públicos root:root e modo 755; nenhum banco, chave, `.env`, `trips.json` ou `knowledge.json` encontrado sob `/srv/overtrip-public`; nenhum arquivo público gravável por todos; Caddy consegue ler as páginas do site e do painel; configuração Caddy valida.
- O firewall local usa `iptables-nft`; TCP 80/443 foi liberado em execução e salvo no arquivo persistente validado. O alcance externo e o HTTPS foram confirmados; verificar persistência após reinício em janela planejada.
- `rpcbind` escuta em todas as interfaces na porta 111 e Ollama em todas as interfaces na 11434. A saída local não prova exposição externa; confirmar que VCN/NSG não permitem essas portas e avaliar se os serviços são necessários antes de desativar ou limitar.
- SSH: autenticação por senha desativada, chave pública habilitada e login root apenas por chave; encaminhamento TCP e X11 estão habilitados e devem ser restringidos se não forem necessários. Há tentativas automatizadas inválidas registradas, sem sucesso observado; logins válidos por chave vieram do IP administrativo informado na saída.
- Há reinicialização pendente e atualizações disponíveis. Planejar atualização/reinício e validar SSH, Caddy, API, Tailscale e backup após a janela.
- `caddy-api` permanece mascarado/inativo, conforme esperado; a API do Caddy não está exposta por esse serviço.
- Os testes de rota local usados anteriormente consultaram `127.0.0.1`, mas o Caddy só está vinculado a `10.0.0.143`; portanto, os resultados HTTP 000 desses testes não indicam falha do site.
- O site tenta carregar `/trips.json` como alternativa quando a API falha (`js/data.js`), mas esse caminho está bloqueado na Oracle. Assim, não há alternativa de viagens funcional durante uma indisponibilidade da API. Avaliar um snapshot público sanitizado antes de mudar essa política; não expor o arquivo privado existente.

As seis vulnerabilidades relatadas por `npm ci` eram de dependências de desenvolvimento na verificação anterior; `npm audit --omit=dev` no commit preparado retornou zero. Reavalie as dependências antes da publicação.
