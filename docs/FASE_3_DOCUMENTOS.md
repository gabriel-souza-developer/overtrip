# Fase 3 — documentos e IA

## Política definida antes do upload

Os documentos de viagem são privados. Esta política é pré-requisito para a
rota de upload e deve ser aplicada também no servidor de produção.

| Tema | Decisão inicial |
| --- | --- |
| Armazenamento | Diretório privado configurado em `DOCUMENT_STORAGE_DIR`, fora do repositório, de `assets/` e do webroot. Em produção: `/var/lib/overtrip/documents`. |
| Tipo aceito | Somente PDF (`application/pdf`, extensão `.pdf` e assinatura `%PDF-`). |
| Limite | 10 MiB por arquivo; máximo de 5 documentos ativos por viagem. |
| Acesso | Apenas administrador autenticado; download sempre por API autenticada, como anexo, sem URL pública. |
| Antivírus | ClamAV obrigatório antes de persistir/disponibilizar o arquivo. Sem scanner configurado e saudável, upload fica indisponível. |
| Retenção | 30 dias a partir do envio. Um job remove arquivo e metadados expirados; a exclusão manual remove o arquivo imediatamente. |
| Backup | Backup deve incluir o diretório privado de documentos e usar retenção compatível com o banco. |
| IA | Extração e OCR são assíncronos. Texto de documento não vai para logs; sugestões mantêm referência de documento, página e trecho. |
| Revisão | Toda sugestão é aplicada ao formulário apenas após seleção explícita humana. Ela nunca salva, muda status ou publica sozinha. |

## Fundação implementada

- Modelo `TripDocument` e migração para metadados, hash, estados de varredura e
  extração, retenção e rastreabilidade de quem enviou.
- Relação com `Trip`; apagar uma viagem remove os metadados associados. A futura
  rotina de exclusão também remove arquivos físicos órfãos antes/depois dessa
  operação.
- Nenhum conteúdo, caminho físico ou URL pública é gravado no banco.

## Próximos incrementos seguros

1. Criar upload multipart/streaming limitado, com checagem da assinatura PDF e
   varredura ClamAV em arquivo temporário.
2. Adicionar listagem, download e exclusão autenticados e a rotina de expiração.
3. Processar extração de texto em worker persistente; OCR continua opcional.
4. Transformar o texto extraído em sugestões rastreáveis, reutilizando a revisão
   por campo que já existe no formulário.

O upload não será habilitado antes desses controles existirem no código e no
ambiente de produção.
