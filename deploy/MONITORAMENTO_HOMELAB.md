# Monitoramento do homelab — atualização de 28/11/2026

## Estado da implementação

O workflow ativo `NOX Monitor de hosts Debian e vm-oracle` (ID `oxV3NCXMh93HUgTi`) monitora ambos os hosts uma vez por minuto e está configurado para avisos na conversa interna da equipe já usada pelo OVERTRIP. O GET autenticado `/api/sessions` respondeu HTTP 200 com a credencial WAHA existente. Há duas sessões `WORKING` (`overtrip-test` e `nox`), e o grupo interno aparece nas duas. Por autorização explícita, o monitor fixa `nox` pelo nome exato e exige que seu estado seja `WORKING`; não há fallback para `overtrip-test`. Nenhum envio de teste foi feito.

O monitor e o WAHA rodam no Debian. Se o Debian cair, não há envio por WhatsApp; o usuário aceitou verificar manualmente essa situação. Não foi criado um serviço externo independente.

## Topologia confirmada

- O Debian do homelab executa n8n e WAHA. Os fluxos NOX enviam mensagens por WAHA usando a configuração `waha_url`; portanto, NOX não é um serviço de envio independente do Debian.
- O container `espelho-nox` é um serviço do portal financeiro, sem porta de envio de WhatsApp publicada. Ele não serve como canal externo de alerta.
- A documentação do deploy da Oracle descreve `overtrip-health.timer`, executado localmente a cada cinco minutos. Ele verifica saúde local, registra no journal e atualiza o estado lido pelo painel; não envia alertas para fora da VM.
- A Oracle foi acessada por `ubuntu@136.248.78.185`; o hostname confirmado é `vnic-ia-automacao`. O alias SSH `vm-oracle` ainda não resolve por DNS.
- A VM tem 2 vCPU, 11 GiB de RAM (10 GiB disponíveis na coleta) e 96 GiB livres no disco raiz. `overtrip-health.timer` está enabled/active, dispara a cada cinco minutos; `overtrip-health.service` é oneshot e fica inactive entre execuções. O serviço registra estado local/journal, sem alerta externo.
- `unified-monitoring-agent.service` está active/enabled. Isso confirma o agente local, não a existência de métricas CPU/RAM/disco no serviço OCI Monitoring nem de alarmes ou tópicos de notificação. Não havia OCI CLI, SDK ou configuração de perfil disponíveis no host para consultar esses recursos pela API; nenhum alarme/receiver WhatsApp foi confirmado.
- O Ollama escuta em `*:11434`; a disponibilidade pública e o firewall não foram confirmados durante a auditoria. Essa exposição ainda precisa de revisão.

## Inventário n8n

- Na auditoria inicial havia 44 workflows (5 ativos e 39 inativos). Os 39 inativos, todos confirmados arquivados e `active=false`, foram removidos pela API pública suportada do n8n após export seguro dos cinco ativos. Depois de criar o monitor, há 6 ativos e 0 inativos. Nenhum dos 5 ativos originais referenciava os inativos.
- Ativos: `NOX Assistente Pessoal WhatsApp v39` (2.092 sucessos, 1 erro); `NOX Cobranças com Aprovação` (1.670 sucessos, nenhum erro); `NOX — Lembrete mensal da advogada` (sem execução recente); `NOX Medicamentos e Cuidado v13` (3.337 sucessos, 3.339 erros); `OVERTRIP Assistente WhatsApp v35` (67 sucessos, nenhum erro). Contagens referentes à janela móvel de sete dias da auditoria.
- Os erros de `NOX Assistente Pessoal WhatsApp v39` ocorreram em `Qwen conversa NOX` com timeout `ECONNABORTED`; o nó de diagnóstico recebeu o erro e o restante do fluxo preserva a recuperação.
- O contrato privado do site usado pelo v35 está alinhado: GET em `/n8n/v2/trips` e `/n8n/v2/knowledge`, autenticação Header Auth, viagens públicas reduzidas e reserva transferida à equipe. O serviço separa essas rotas e exige Bearer; a documentação registra 401 sem credencial. Não encontrei incompatibilidade de formato.
- `OVERTRIP Monitor de avisos WAHA` era um fluxo inativo que verificava sessão WAHA e avisos falhos a cada três minutos; ele não monitorava recursos dos hosts e foi removido junto com os demais inativos. Os nós de Telegram estavam sem credencial e não eram um canal pronto para uso.

## Coletores e rede

- Debian: container `overtrip-node-exporter`, imagem `quay.io/prometheus/node-exporter:v1.9.0`, somente leitura, sem capabilities, escutando em `100.111.0.47:9100`.
- Oracle: pacote Ubuntu `prometheus-node-exporter` 1.7.0, serviço systemd ativo e override escutando somente em `100.99.26.96:9100`.
- Os dois endpoints `/metrics` responderam por Tailscale. A porta 9100 não escuta em interface pública; as métricas não têm autenticação HTTP, então a ACL Tailscale deve continuar restrita a dispositivos administrativos.
- Os manifests e o runbook estão em `deploy/monitoring/`. Não instalamos Prometheus/Alertmanager: há somente dois alvos, e o n8n já oferece agendamento, avaliação e entrega. Essa escolha evita processo de coleta/armazenamento adicional num Debian com 2 vCPU e 4,8 GiB; não há histórico de séries temporais.

## Limites aceitos e operação

O hostname do Oracle é `vnic-ia-automacao`, acessado por `ubuntu@136.248.78.185`; o alias SSH `vm-oracle` ainda não resolve neste ambiente. O workflow no Debian não consegue alertar quando o próprio Debian/WAHA cai. Esse limite foi aceito pelo usuário; nesse caso, a disponibilidade deve ser conferida manualmente.

## Política ativa do monitor

- Cada host é consultado uma vez por minuto; indisponibilidade após três coletas consecutivas ao longo de três minutos; recuperação após duas coletas seguidas.
- CPU em atenção a partir de 85% por dez minutos e crítica a partir de 95% por cinco minutos. Ao escalar, o aviso de atenção é encerrado sem mensagem falsa de recuperação.
- Memória disponível abaixo de 10% e disco raiz abaixo de 15% ou 5 GB por cinco minutos; recuperação com margem e duas coletas seguidas.
- Deduplicação por host/métrica/estado; cooldown de 60 minutos; recuperação uma vez por incidente.
- Avisos contêm gravidade, estado, host, métrica/valor, início/duração, impacto, ação, horário de São Paulo e UTC.

## Pontas soltas encontradas na auditoria do n8n

- `NOX Medicamentos e Cuidado v13` executa verificações escalonadas. As falhas nos nós `Reserva plano` e `Materializa ocorrências` eram `permission denied for table recipient_settings` para a role `nox_n8n`, no banco `nox`, tabela `medication.recipient_settings` (owner `nox_db_owner`). Os dois CTEs leem somente `chat_id` e `reminders_enabled`, filtrando por igualdade em `chat_id`; não escrevem nessa tabela. A role não tinha grants na tabela, e a tabela não tem RLS/policies. Foi aplicado apenas `GRANT SELECT (chat_id, reminders_enabled)` à role `nox_n8n`; a validação confirmou privilégios nessas colunas, sem SELECT de tabela inteira. O procedimento `medication.apply_chat_command` também referencia a tabela e é `SECURITY DEFINER` do owner; os nós, porém, fazem leitura direta que explica a falha reportada. Execuções agendadas posteriores passaram; a última, às 05:49:20 UTC, executou apenas `Reserva plano` e `Verifica plano do dia`, sem nó de entrega WhatsApp. Nenhuma execução manual foi feita.
- `n8n` e WAHA estão publicados em todas as interfaces do Debian; `N8N_SECURE_COOKIE=false`. A exposição externa depende do firewall/roteador, que não pôde ser verificado nesta auditoria. Manter autenticação e limitar o acesso de rede até confirmar esse perímetro.

## Referências de operação

- [Boas práticas de alertas do Prometheus](https://prometheus.io/docs/practices/alerting/): alertar sobre sintomas, permitir tolerância a oscilações e evitar notificações sem ação útil.
- [Regras de alerta do Prometheus](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/): usar `for` para exigir que uma condição persista antes de disparar.
- [Alertmanager](https://prometheus.io/docs/alerting/latest/alertmanager/): agrupar alertas correlatos, deduplicar notificações e inibir alertas dependentes durante uma indisponibilidade maior.


## Backup e verificação

Os exports de rollback dos cinco workflows ativos originais foram salvos com permissão privada em `/tmp/docs/local/n8n-backup-active-20261128/`. A exportação do monitor pré-publicação também está nesse diretório. A exclusão dos 39 inativos usou `DELETE /api/v1/workflows/{id}` apenas depois de confirmar `active=false` e `isArchived=true` para cada ID; nenhum SQL de exclusão foi usado.

O teste sintético `node deploy/monitoring/test-monitor-engine.js` passou: baseline sem aviso, CPU sustentada, escalação 85→95%, memória/disco, host indisponível, deduplicação e recuperação. Os scrapes reais dos dois hosts foram confirmados. O fluxo de envio não foi executado com evento real e nenhum WhatsApp foi enviado.

A primeira execução de produção do fluxo terminou com status `success` em 28/11/2026 às 05:03 UTC e a seguinte às 05:04 UTC. Após a atualização pelo mesmo ID, a execução de 05:18 UTC também terminou com sucesso. Seus metadados mostram apenas os nós de agendamento, coleta dos dois exporters e avaliação; sem alertas, os nós de sessão WAHA e envio não executaram. A credencial, a sessão `nox` e o grupo de destino foram validados por metadados e GETs somente leitura; nenhum POST de envio foi executado.
