# Multiagência: preparação e validação local

Este guia descreve o trabalho na branch de turismo multiagência. Ele não é um registro de implantação nem comprova mudanças no servidor. O estado verificado da instalação existente permanece em `deploy/ORACLE_STATUS.md`.

O login é compartilhado; contas novas não têm acesso ao painel legado. A área da empresa permite operações de viagens em rascunho, interessados, reservas e parcelas manuais. Parcelas não processam pagamentos nem confirmam vagas. A publicação por outra agência e o upload de mídia multiempresa ainda não estão disponíveis.

Antes de qualquer implantação, gere um artefato que inclua os novos arquivos e migrações, e ensaie a atualização e a restauração em uma cópia consistente do banco e dos arquivos. As alterações locais ainda podem não estar versionadas: confira `git status` antes de gerar o artefato.

`LEGACY_TOURISM_ORGANIZATION_ID` identifica no máximo uma empresa adicional ao escopo legado nulo; `PUBLIC_SITE_ORGANIZATION_IDS` é uma lista separada de empresas autorizadas no site e assistente. Elas têm funções diferentes e não devem ser usadas como substitutas uma da outra. A atribuição dos registros antigos a uma empresa sem configurar os escopos necessários pode fazer conteúdo desaparecer do painel ou do site. Consulte `.env.example` e teste os valores em uma cópia antes de qualquer alteração.

Os scripts de provisionamento e de atribuição aceitam um banco SQLite existente explicitamente indicado por caminho absoluto e simulam por padrão. O provisionamento cria conta nova sem acesso legado; contas existentes não são vinculadas automaticamente. A senha é recebida por stdin apenas na aplicação, nunca por argumento. Não execute esses scripts no banco de produção sem um procedimento de atualização e recuperação validado.

Usuários da agência podem trocar a senha inicial na própria interface. A troca exige a senha atual e encerra as sessões existentes. O login limita falhas por conta e IP, com um teto separado por IP; logins bem-sucedidos não consomem a cota de falhas. Os limites de login e troca de senha são mantidos em memória por processo: uma instalação com múltiplas instâncias precisa de controle compartilhado antes de depender desses limites entre instâncias.

Arquivos de mídia históricos sem registro precisam de manifesto explícito e revisado: `scripts/inventory-legacy-media.ts` pode propor candidatos e aplicar um manifesto verificado. Não aprove arquivos sem confirmar a procedência. A ferramenta de reconciliação de pendentes é somente diagnóstica; não publica nem remove automaticamente. Caches que receberam anteriormente respostas imutáveis podem conservar imagens mesmo após mudança de autorização.

Validação automatizada disponível: `npm test`, `npm run test:e2e` e `node scripts/e2e-organization-real.mjs`. O último usa navegador, servidor e SQLite temporário, sem dados reais.
