# OVERTRIP — orientações para agentes de código

## Estado e arquitetura

- Este repositório reúne o site público estático, a API Node/Express, o painel React/Vite e o banco SQLite gerenciado por Prisma. Consulte `ARCHITECTURE.md`, `docs/TRIP_WORKFLOW_ASSISTANT_PLAN.md` e `deploy/ORACLE_STATUS.md` antes de alterar fluxos ou publicar.
- A viagem no SQLite/Prisma é a fonte operacional. `/api/public/trips` é a única fonte de viagens do site; `trips.json` é um formato legado de compatibilidade privada e não é fallback público nem fonte do painel, CRM ou reservas.
- CRM e reservas existem no código e têm rotas administrativas. Reservas e parcelas são registros manuais: não processam pagamentos nem reduzem vagas automaticamente.
- A Oracle já recebeu versões do produto. `deploy/README.md` é um roteiro histórico; nunca copie seus comandos de firewall, restauração ou publicação sem conferir as instruções atuais em `deploy/ORACLE_STATUS.md`.

## Regras de implementação

- Preserve privacidade: não exponha dados de clientes, notas, documentos ou segredos nas rotas públicas, logs, arquivos do site ou prompts.
- Mudanças no banco precisam de migração Prisma aditiva, compatibilidade com dados existentes e avaliação do procedimento de retorno. Não rode migrações na produção sem autorização e plano de publicação.
- Prefira mudanças pequenas e coerentes com os fluxos existentes. Não introduza integrações pagas ou externas sem necessidade e autorização explícita.
- Valide alterações com checagens proporcionais ao risco; execute testes quando solicitados ou necessários para demonstrar o comportamento alterado. Não afirme validação de produção sem evidência da VM.
- Use agentes em tarefas independentes quando isso trouxer revisão útil; delegue escopos claros e revise as entregas antes de integrá-las. O agente principal mantém a decisão final.
- Commits devem descrever a mudança. Push, publicação e alteração de infraestrutura só ocorrem quando o usuário solicitar.

## Stack real

- API: Node.js, TypeScript, Express e Prisma.
- Painel: React, TypeScript e Vite.
- Persistência: SQLite na Oracle, fora do repositório, com migrações Prisma.
- Site público: HTML, CSS e JavaScript, consumindo a projeção pública da API.
- Proxy e TLS em produção: Caddy; acesso administrativo também usa Tailscale.
- O produto ainda é de empresa única. Multiempresa e verticais de hospedagem/restaurante são apenas uma proposta em `docs/ESCOPO_SAAS_MULTITENANT.md`; não implementar isolamento parcial nem autoinscrição sem decisão de arquitetura.
