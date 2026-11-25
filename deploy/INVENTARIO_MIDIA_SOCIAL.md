# Inventário de mídias sociais

`inventory-social-media.py` identifica registros antigos sem vínculo com post, arquivos antigos sem registro e arquivos ausentes. O comando é somente de consulta; não apaga dados, não altera permissões e não deve ser usado como uma lista automática de exclusão. O diretório de mídia precisa ser dedicado, de propriedade do usuário que executa o comando e modo 700. O banco é aberto em modo somente leitura.

Exemplo operacional, após verificar os caminhos e permissões:

```bash
sudo -u overtrip python3 /srv/overtrip/app/deploy/inventory-social-media.py \
  --database /var/lib/overtrip/overtrip.db \
  --directory /var/lib/overtrip/social-media \
  --min-age-hours 24
```

Os identificadores apresentados são nomes internos de arquivo. O resultado `registered_without_post` contém registros sem referência, enquanto `unregistered_files` mostra arquivos sem registro no banco. `missing_referenced_files` exige investigação e eventual restauração a partir do backup. Entradas inesperadas (inclusive links simbólicos) são apenas listadas. Datas antigas não são prova de que algo possa ser apagado: uploads, edição, backup e restauração podem estar ocorrendo durante a consulta; o prazo de 24 horas é somente um filtro inicial, não uma política de retenção. Revise resultados e cópias de backup antes de propor qualquer operação posterior.

O teste isolado é `python3 tests/inventory-social-media.test.py`. A ferramenta não está instalada nem agendada automaticamente na VM.
