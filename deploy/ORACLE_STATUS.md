# Estado da preparação na Oracle

Registro de 3 de novembro de 2026, baseado nas saídas compartilhadas pelo operador. Confirme o estado na VM antes de alterar serviços ou dados.

## Preparado

- Código do commit `96fdb59` em `/srv/overtrip/app`, instalado por `git archive` e compilado. Essa cópia não tem `.git`; `git pull` nesse diretório não funciona. A instalação de preparo em `~/overtrip-preparo` tem Git.
- Banco SQLite em `/var/lib/overtrip/overtrip.db`, proprietário `overtrip` e modo 600. A cópia de origem permanece em `~/overtrip-backups/overtrip-local-20261103-054537.db`. O hash SHA-256 conferiu na transferência e instalação; `integrity_check` retornou `ok` e o Prisma não encontrou diferenças de esquema para `96fdb59`.
- As dez migrações dessa versão constam como concluídas. A migração histórica `0_init` tem diferença de checksum já documentada em `README.md`; não alterar o histórico nem executar reset. O banco instalado já contém administrador.
- Serviço `overtrip-api` ativo e habilitado, executado como `overtrip`, escutando apenas em `127.0.0.1:3001`. `/health` e `/api/public/trips` retornaram HTTP 200. O arquivo `/etc/overtrip/env` é privado; não registrar seu conteúdo ou segredos.
- Backup SQLite local em `/var/backups/overtrip`, executado e verificado pelo serviço; `overtrip-backup.timer` ativo diariamente às 03:30 no fuso da VM, que estava em UTC. Retenção configurada de 14 dias. A restauração completa e a cópia fora da VM ainda não foram verificadas.
- A configuração de armazenamento de documentos foi omitida; o worker de documentos não foi habilitado. Não presumir que PDFs tenham sido transferidos.

## Próximos passos

1. Configurar e testar cópia de backup fora da VM e restauração em ambiente isolado.
2. Preparar Caddy, permissões de leitura, portas de rede e HTTPS; testar o painel e autenticação antes de alterar DNS. Ajustar `TRUST_PROXY` para a topologia efetiva quando houver proxy confiável.
3. Planejar a alteração de DNS com possibilidade de retorno e manter a hospedagem atual até a validação. Confirmar se e quando publicar.
4. Preparar armazenamento, scanner e backup dos PDFs antes de habilitar o processamento de documentos.
5. A VM informou atualização de kernel pendente. Planejar reinício e verificar serviços e backups após ele; nenhum reinício foi feito nesta sessão.
6. Verificar e remover o acesso SSH temporário de transferência quando não for mais necessário, preservando as demais chaves autorizadas.
7. A branch local `feat/evolucao-painel-viagens` contém trabalho ainda não commitado de interessados, reservas e propostas, que não está implantado na VM. Definir e testar o procedimento de atualização antes de instalá-lo.

As seis vulnerabilidades relatadas por `npm ci` eram de dependências de desenvolvimento na verificação anterior; `npm audit --omit=dev` no commit preparado retornou zero. Reavalie as dependências antes da publicação.
