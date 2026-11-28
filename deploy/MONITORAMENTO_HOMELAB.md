# Monitoramento do homelab — auditoria de 27/11/2026

## Estado da implementação

Não há alertas de WhatsApp independentes em produção. Nenhum novo workflow de monitoramento foi ativado, pois o canal disponível depende do próprio servidor Debian que precisa ser monitorado.

## Topologia confirmada

- O Debian do homelab executa n8n e WAHA. Os fluxos NOX enviam mensagens por WAHA usando a configuração `waha_url`; portanto, NOX não é um serviço de envio independente do Debian.
- O container `espelho-nox` é um serviço do portal financeiro, sem porta de envio de WhatsApp publicada. Ele não serve como canal externo de alerta.
- A documentação do deploy da Oracle descreve `overtrip-health.timer`, executado localmente a cada cinco minutos. Ele verifica saúde local, registra no journal e atualiza o estado lido pelo painel; não envia alertas para fora da VM.
- O nome SSH `vm-oracle` não resolveu no ambiente desta auditoria. A documentação relaciona os serviços Oracle ao peer Tailscale `vnic-ia-automacao`, mas a identidade e o acesso administrativo ao alvo precisam ser confirmados antes de instalar um monitor remoto.

## Inventário n8n

- Foram encontrados 44 workflows: 5 ativos, 39 inativos e 4 arquivos vazios. Nos grafos, não há referências de conexão pendentes, nomes de nós duplicados ou IDs de credenciais órfãos.
- Ativos: `NOX Assistente Pessoal WhatsApp v39` (2.092 sucessos, 1 erro); `NOX Cobranças com Aprovação` (1.670 sucessos, nenhum erro); `NOX — Lembrete mensal da advogada` (sem execução recente); `NOX Medicamentos e Cuidado v13` (3.337 sucessos, 3.339 erros); `OVERTRIP Assistente WhatsApp v35` (67 sucessos, nenhum erro). Contagens referentes à janela móvel de sete dias da auditoria.
- Os erros de `NOX Assistente Pessoal WhatsApp v39` ocorreram em `Qwen conversa NOX` com timeout `ECONNABORTED`; o nó de diagnóstico recebeu o erro e o restante do fluxo preserva a recuperação.
- O contrato privado do site usado pelo v35 está alinhado: GET em `/n8n/v2/trips` e `/n8n/v2/knowledge`, autenticação Header Auth, viagens públicas reduzidas e reserva transferida à equipe. O serviço separa essas rotas e exige Bearer; a documentação registra 401 sem credencial. Não encontrei incompatibilidade de formato.
- `OVERTRIP Monitor de avisos WAHA` existe inativo. Ele verifica sessão WAHA e avisos que falharam a cada três minutos; não monitora CPU, memória, disco ou disponibilidade dos hosts. Os nós de Telegram estão sem credencial atribuída e não há credencial Telegram cadastrada, portanto não é um canal pronto para uso.

## Limite de cobertura

Um monitor no Debian pode detectar a indisponibilidade da Oracle enquanto Debian e WAHA continuam ativos. Ele não pode alertar sobre a própria queda do Debian, pois n8n e WAHA estão no mesmo host. O timer local da Oracle também deixa de funcionar quando a Oracle cai. Assim, não há cobertura completa para os dois alvos nem teste seguro do caminho de envio sem um monitor e um canal de notificação externos a ambos.

Não copiar credenciais do n8n para outro host nem considerar uma execução bem-sucedida de um fluxo n8n como prova de independência do monitor.

## Requisitos para ativar alertas

1. Confirmar o endereço e a identidade de `vm-oracle` e obter acesso administrativo somente leitura para inventariar seus serviços.
2. Escolher um monitor que continue ativo se qualquer um dos dois hosts cair, ou estabelecer um monitor externo que receba heartbeat de ambos.
3. Disponibilizar nesse monitor um canal de notificação independente do Debian/WAHA, com credencial criada e armazenada no host apropriado. Sem esse canal, não prometer alerta de indisponibilidade do Debian.
4. Validar apenas com eventos sintéticos, sem enviar WhatsApp real, antes de ativar notificações.

## Política recomendada para o futuro monitor

- Heartbeat de cada host a cada minuto; alerta após três minutos sem heartbeat e recuperação quando o heartbeat estabilizar.
- CPU: alertar acima de 85% sustentado por cinco minutos; não alertar por pico isolado.
- Memória disponível abaixo de 10% e disco livre abaixo de 15% ou 5 GB por cinco minutos; recuperação ao cruzar de volta o limite com margem.
- Deduplicar por host, métrica e estado; cooldown de 15 minutos, repetindo antes apenas se a severidade aumentar. Enviar recuperação uma vez por incidente.
- Cada aviso deve trazer severidade, estado, host, métrica/valor, início/duração, impacto, ação sugerida, horário de São Paulo e UTC, e link para o runbook.

## Pontas soltas encontradas na auditoria do n8n

- `NOX Medicamentos e Cuidado v13` executa cinco verificações escalonadas em intervalos de dez segundos. As falhas recentes vêm dos nós `Reserva plano` e `Materializa ocorrências`, com `NodeOperationError` categorizado como permissão PostgreSQL. Não alterar grants sem confirmar a role e o escopo correto do banco de dados de saúde.
- `n8n` e WAHA estão publicados em todas as interfaces do Debian; `N8N_SECURE_COOKIE=false`. A exposição externa depende do firewall/roteador, que não pôde ser verificado nesta auditoria. Manter autenticação e limitar o acesso de rede até confirmar esse perímetro.

## Referências de operação

- [Boas práticas de alertas do Prometheus](https://prometheus.io/docs/practices/alerting/): alertar sobre sintomas, permitir tolerância a oscilações e evitar notificações sem ação útil.
- [Regras de alerta do Prometheus](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/): usar `for` para exigir que uma condição persista antes de disparar.
- [Alertmanager](https://prometheus.io/docs/alerting/latest/alertmanager/): agrupar alertas correlatos, deduplicar notificações e inibir alertas dependentes durante uma indisponibilidade maior.
