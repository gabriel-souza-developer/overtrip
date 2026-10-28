# Regras do Projeto OVERTRIP (SaaS de Gestão de Viagens)

## Diretrizes de Desenvolvimento
- **Foco no MVP:** Nada novo entra no escopo antes de o primeiro marco ser concluído. O MVP é: login, CRUD de viagens, publicação e testes.
- **Segurança em primeiro lugar:** O PostgreSQL não fica exposto à internet. Credenciais nunca no código. O JSON público só tem o que é autorizado.
- **Validação:** Toda alteração exige teste. O Playwright é usado para validar a interface.
- **Orquestração:** Um agente altera arquivos por vez. O planejamento é feito no OpenCode + Maestria.
- **Git:** Commits pequenos. Sempre teste antes de avançar. Nenhum agente publica em produção.

## Arquitetura e Stack (Hipótese Inicial)
- Next.js com TypeScript, PostgreSQL, Prisma, Tailwind CSS, Docker Compose.
- A opção A (PostgreSQL gera o JSON público para o site estático) é a preferência inicial, a ser validada na auditoria.

## Dados
- O `trips.json` é a fonte atual. A Fase 0 criará um script para validar e gerar os dados derivados (galeria, mapa).
- Campos derivados (datas, preços) devem ser calculados a partir de `startDateISO`.

