# Arquitetura de agentes — OVERTRIP

## Fonte e escopo

Este documento é a fonte central para papéis, delegação, modelos, cotas e protocolo operacional do OVERTRIP. Instruções específicas do produto ficam em `CLAUDE.md`; regras de execução para OpenCode ficam em `.maestria/rules.md`. Não duplique nestes arquivos a política global.

O fluxo Maestri foi validado no sandbox Agent Lab em 30/10/2026: tarefas foram enviadas a um Builder, respostas retornaram ao Maestro, e especialistas OpenCode/9Router responderam e revisaram uma mudança de teste. O uso de floors no OVERTRIP não fez parte daquele ensaio. O Maestri segue como interface de colaboração quando o usuário desejar; Orca é a camada operacional preferida para worktrees, dependências e acompanhamento, sem obrigar migração do canvas nem cadeia fixa de agentes.

## Papéis

| Papel | Responsabilidade | Regra de uso |
|---|---|---|
| Orca | Worktrees, distribuição, dependências, estado, acompanhamento e recuperação operacional | Coordena; não substitui o raciocínio do modelo |
| Claude Sonnet | Agente principal: entender, planejar, implementar, validar e consolidar tarefas cotidianas | Padrão de execução, se disponível pela sessão/assinatura |
| Claude Opus | Arquitetura de alto impacto e problemas difíceis após tentativas razoáveis sem convergência | Escalonamento sob demanda, não padrão |
| GPT/Codex | Revisão independente de mudanças relevantes, segurança e arquitetura | Somente quando a sessão/acesso existente permitir; sem presumir API ou cota |
| Gemini | Pesquisa documental ampla, comparação técnica e análise paralela | Acionar com pergunta delimitada; assinatura não implica acesso via 9Router |
| OpenCode + 9Router | Especialistas independentes e tarefas delimitadas; modelos econômicos para triagem verificável | Modelos listados no guia são configurações intencionais; disponibilidade e cotas variam e não são presumidas |
| Maestri | Canvas, terminais, papéis e comunicação quando fizer parte do fluxo ativo | Pode coexistir com Orca; não exigir uso em toda tarefa |

O relato de 30/10 registra Sonnet no papel Builder e Opus no Builder de uma sessão de teste, além de limites observados nos aliases 9Router naquela data. Esses dados são históricos, não garantia de modelo, disponibilidade ou quota atuais.

## Delegação e revisão

- Tarefa pequena, localizada e com critério claro: Sonnet executa sem delegação.
- Delegar quando houver paralelismo real, especialização necessária, pesquisa extensa ou revisão independente com benefício claro.
- Cada delegação recebe objetivo, escopo, arquivos/contexto mínimo, critério de aceite e formato de retorno.
- Não repetir análise entre agentes nem criar cadeia obrigatória Sonnet → Gemini → GPT → Opus.
- Especialistas e revisores não editam o mesmo floor do implementador. Um escritor por worktree.
- Revisão GPT independente é recomendada para autenticação, autorização, dados, segredos, infraestrutura e mudanças arquiteturais relevantes, quando o acesso existente estiver disponível.
- Escalar para Opus se houver alto impacto arquitetural ou duas tentativas tecnicamente razoáveis sem convergência. Se indisponível, registrar bloqueio e não trocar silenciosamente de provedor.
- Em 429, erro de autenticação ou limite de assinatura: uma tentativa de confirmação no máximo; parar ou trocar para alternativa já configurada e autorizada. Não insistir em retries que consumam cota.

## Contexto, ferramentas e cotas

- Forneça a cada agente somente os arquivos, diff, evidência e contexto necessários. Prefira resumo curto com caminhos em vez de repassar histórico integral.
- Consulte Skills por gatilho e carregue apenas as necessárias; limite usual de duas por tarefa. Skills continuam sendo procedimentos e conhecimento, não ferramentas executáveis.
- MCP continua adequado para integrações pequenas e chamadas diretas. Code Mode só deve ser avaliado quando existir catálogo grande, definições volumosas ou encadeamento que reduza contexto de forma mensurável. Não criar serviço/infraestrutura para adotá-lo sem benefício e autorização.
- Não confundir tokens de contexto, cotas de assinatura e créditos de API. Trate cada limite conforme o provedor; não presumir que Claude Pro, ChatGPT Plus ou Google AI Pro estejam disponíveis no 9Router.
- Para medir economia, compare antes/depois em uma tarefa representativa: definições carregadas, tokens/contexto reportados pelo cliente e número de chamadas. Não inferir custo de assinatura a partir de token count.

## Protocolo de tarefa

1. Verificar branch e `git status --short`; preservar alterações preexistentes.
2. Definir escopo, critérios de aceite, risco e necessidade de delegação.
3. Criar worktree/floor isolado para alterações; um agente escritor.
4. Implementar e executar validações adequadas. Agentes auxiliares entregam parecer textual com evidências.
5. Revisar diff e testes; solicitar revisão independente apenas conforme os critérios acima.
6. Consolidar achados, limitações e estado. Push, PR, merge em `main`, deploy e publicação continuam sujeitos à autorização do usuário.

## Skills relevantes

A instalação global está em `~/.claude/skills` e é compartilhada pelo Claude Code conforme suporte do cliente. OpenCode usa sua configuração própria de skills e filtros. Consulte o catálogo local e os gatilhos antes de invocar; não instale dependências ou skills externas sem necessidade e autorização.

- UI/UX e design: `ui-ux-pro-max`; Tailwind/UI: `ui-styling` quando aplicável.
- React/performance de renderização: `react-best-practices`.
- Antes de feature/correção: `test-driven-development`.
- Falha ou comportamento inesperado: `systematic-debugging`.
- Antes de declarar conclusão: `verification-before-completion`.
- Acessibilidade e performance web: sob demanda e dentro do escopo.

## Registro histórico

O relatório local `~/agent-lab/reports/relatorio-ultimo-chat-2026-10-30.md` preserva o resultado do ensaio do Maestri e os limites observados. Ele não é versionado neste repositório; trate-o como evidência datada, não como instrução ativa. Esta política versionada é a orientação vigente.
