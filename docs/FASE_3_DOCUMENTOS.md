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
- O texto extraído é armazenado por página no banco; caminhos físicos e URLs
  públicas não são gravados.

## Próximos incrementos seguros

1. ✅ API de upload com corpo PDF binário limitado, checagem de MIME, nome e
   assinatura e varredura ClamAV antes de gravar metadados.
2. ✅ Listagem, download e exclusão administrativos e rotina de expiração.
3. ✅ Processar extração de texto em worker persistente; OCR continua opcional.
4. ✅ Revisão de sugestões rastreáveis por campo no painel, com envio externo
   mediante ação explícita do administrador e aviso de privacidade.

O upload não será habilitado antes desses controles existirem no código e no
ambiente de produção.

## API implementada

- `POST /api/trips/:tripId/documents`: corpo binário, `Content-Type:
  application/pdf`, `X-Document-Filename: roteiro.pdf` e token de administrador.
  Até 5 tentativas/minuto/IP, 10 MiB por arquivo e 5 documentos ativos/viagem.
- `GET /api/trips/:tripId/documents`: metadados sem chave de armazenamento/hash.
- `GET /api/trips/:tripId/documents/:documentId`: download como anexo.
- `DELETE /api/trips/:tripId/documents/:documentId`: exclusão física e do registro.

Definir `DOCUMENT_STORAGE_DIR` e `DOCUMENT_CLAMDSCAN_PATH` apenas no ambiente
preparado. O diretório deve ficar fora de qualquer webroot; o servidor rejeita
caminhos dentro do projeto. Arquivos usam permissão 0600 e diretórios novos 0700;
o usuário do scanner precisa conseguir lê-los. Sem scanner funcional, o envio
retorna 503 e remove o arquivo temporário. Vírus detectado retorna 422.

A limpeza roda no início da API e a cada hora. Downloads expirados são bloqueados
imediatamente; a remoção física ocorre no ciclo seguinte. Arquivos órfãos têm
margem de uma hora para não interferir em uploads em andamento. A API precisa
estar em execução para a rotina rodar. Arquivos em varredura ficam privados.

Este incremento usa buffer limitado em memória (até 10 MiB por requisição),
sem multipart nem compactação. OCR ainda não foi implementado.
Testes HTTP usam scanner simulado; validar ClamAV real antes de habilitar em
produção. Nenhuma configuração de produção foi alterada.

## Worker de extração

Instale o Poppler e configure `DOCUMENT_PDFTOTEXT_PATH` com o caminho absoluto
do executável `pdftotext` e `DOCUMENT_STORAGE_DIR` com o mesmo diretório da API.
Execute `prisma migrate deploy`, gere o cliente Prisma e compile a aplicação;
inicie `npm run worker:documents` como processo separado e persistente. Há um
serviço de exemplo em `deploy/overtrip-document-worker.service`; ajuste usuário,
caminhos e permissões ao ambiente e habilite-o no supervisor. O worker precisa
ler os arquivos privados e acessar o mesmo banco da API. Sem esse processo,
os documentos permanecem pendentes.

O worker reclama documentos limpos ainda válidos, com proteção contra execução
concorrente e recuperação de tarefas interrompidas após dois minutos. Extração
tem limite de 100 páginas, 4 MiB de texto e 30 segundos por documento. Texto
por página é privado e fica no banco, sujeito à mesma retenção e exclusão do
documento; proteja backups do banco como dados sensíveis. PDFs sem texto,
inclusive digitalizações, falham sem OCR. Erros registrados são códigos sem
conteúdo do documento. Falhas não são automaticamente reprocessadas. Documentos antigos
marcados `SKIPPED` não são incluídos automaticamente.

A análise de texto para sugestões por provedor de IA externo é autorizada quando
um administrador a solicita expressamente no painel após o aviso de privacidade.
Ela envia até 8.000 caracteres extraídos ao provedor configurado. A configuração
`DOCUMENT_AI_EXTERNAL_ENABLED=true` habilita o recurso no ambiente; o padrão é
desativado. Não envie dados pessoais de clientes. A geração nunca altera ou
publica a viagem.
