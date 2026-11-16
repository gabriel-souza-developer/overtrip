# Backup das imagens sociais privadas

O script `backup-social-media.py` prepara uma cópia incremental local dos arquivos imutáveis. Ele exige diretórios dedicados com modo 700, arquivos com modo 600 e proprietário igual ao usuário que executa o serviço. Uma cópia já existente é conferida pelo SHA-256; divergência interrompe o serviço e preserva a cópia. Não remove mídias antigas.

O serviço versionado `overtrip-backup.service` executa o script depois do snapshot do banco e do backup das imagens públicas. Esta alteração **ainda precisa ser instalada e validada na VM**; o temporizador atualmente instalado pode usar uma versão anterior. Uma cópia na mesma VM também não protege contra perda da VM.

Antes da ativação, definir o destino e verificar acesso, espaço, retenção, monitoramento e recuperação fora da VM. Em ambiente de teste, criar os diretórios privados dedicados como usuário do serviço; o diretório pai do destino deve existir. Executar como `overtrip`:

O serviço versionado usa os caminhos `/var/lib/overtrip/social-media` e `/var/backups/overtrip/social-media`. Crie a origem como `overtrip`, modo 700, antes de instalar a unidade; o script cria o destino se o diretório pai existir e for acessível. Se `SOCIAL_MEDIA_DIR` for alterado na API, ajuste a origem na unidade para o mesmo diretório. Um diretório de origem ausente faz o serviço falhar, inclusive quando ainda não há imagens; planeje a ativação junto com o recurso social.

```bash
python3 /caminho/backup-social-media.py /caminho/social-media /caminho/backup-social-media
```

A origem ausente é erro: não se deve registrar um backup como concluído sem verificar que as mídias estão disponíveis. Não usar diretórios públicos, compartilhados ou aninhados entre si. O serviço que executa o backup precisa falhar e alertar se esta etapa falhar. Ao integrar com o snapshot SQLite, fazer a cópia das mídias **depois** do snapshot do banco: como arquivos são imutáveis e não são removidos automaticamente, isso inclui as mídias referenciadas pelo snapshot, desde que nenhuma limpeza concorrente as remova. Não ativar limpeza automática antes de definir uma estratégia de consistência e retenção.

Para ensaiar restauração, criar uma cópia do banco em ambiente isolado; copiar os arquivos do backup para outro diretório dedicado de modo 700 e arquivos 600, configurar `SOCIAL_MEDIA_DIR` para esse diretório e verificar no banco restaurado se cada `SocialMedia.storageKey` existe e se seu SHA-256 confere. Testar também a abertura de uma imagem por um usuário administrador. Não substituir o banco ou diretório ativos durante esse ensaio.

Teste local do script: `bash tests/backup-social-media.test.sh`. A integridade binária de cópias existentes é conferida, mas o script isolado **não verifica** se todos os registros do banco possuem seus arquivos; essa verificação faz parte do procedimento de restauração e do monitoramento a integrar.
