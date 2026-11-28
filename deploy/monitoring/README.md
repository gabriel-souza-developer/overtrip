# Monitoramento de hosts do Overtrip

O workflow n8n `NOX Monitor de hosts Debian e vm-oracle` consulta o Prometheus Node Exporter uma vez por minuto nos endereços Tailscale dos dois hosts. Não instalamos Prometheus nem Alertmanager: são apenas dois alvos, e o n8n já mantém o agendamento, a avaliação das condições e o envio interno. Isso evita manter outro servidor e uma base histórica no Debian de 2 vCPU e 4,8 GiB. O workflow guarda somente o estado curto necessário para duração, deduplicação e recuperação.

O destino é a conversa interna de equipe já usada pelo fluxo OVERTRIP. A credencial WAHA foi validada com GET somente leitura (`/api/sessions`, HTTP 200), e o ID do grupo coincide com o destino definido em `Decide resposta` do v35. Há duas sessões ativas (`overtrip-test` e `nox`), ambas contêm esse grupo. Por autorização explícita, o monitor seleciona somente a sessão com nome exato `nox` e exige estado `WORKING`; se ela estiver ausente/inativa, bloqueia o envio sem fallback para `overtrip-test`. Não envia para clientes. O template não contém ID de conversa nem ID de credencial.

## Coletor Debian

`node-exporter-debian.compose.yml` fixa a imagem em `quay.io/prometheus/node-exporter:v1.9.0`, usa somente leitura, remove capabilities e escuta no IP Tailscale `100.111.0.47:9100`. O container usa os mounts de `/proc`, `/sys` e raiz do host para expor métricas do Debian. A política Docker `unless-stopped` mantém o container tentando iniciar se ele falhar antes de a interface Tailscale estar pronta; o processo do exporter encerra quando o IP de bind ainda não existe.

No Debian, o serviço foi criado como `overtrip-node-exporter`. Para recriar a configuração a partir deste repositório:

```sh
docker compose -f deploy/monitoring/node-exporter-debian.compose.yml up -d
```

## Coletor Oracle

A VM usa o pacote Ubuntu `prometheus-node-exporter` do repositório do sistema. O override em `prometheus-node-exporter.service.d.conf` espera até 60 segundos pela interface Tailscale, pede a ordem após `tailscaled` e restringe a escuta a `100.99.26.96:9100`; o systemd tenta reiniciar se o exporter falhar.

Para instalar ou reaplicar o override na Oracle:

```sh
sudo apt-get update
sudo apt-get install -y prometheus-node-exporter
sudo install -D -m 0644 deploy/monitoring/prometheus-node-exporter.service.d.conf /etc/systemd/system/prometheus-node-exporter.service.d/overtrip.conf
sudo systemctl daemon-reload
sudo systemctl enable --now prometheus-node-exporter
sudo systemctl restart prometheus-node-exporter
```

## Limites e notificações

- Host indisponível: três coletas consecutivas sem resposta, abrangendo três minutos. Recuperação após duas coletas seguidas.
- CPU em atenção: pelo menos 85% por dez minutos; crítica: pelo menos 95% por cinco minutos. A passagem de atenção para crítica escala o aviso sem anunciar recuperação falsa.
- Memória disponível: abaixo de 10% por cinco minutos; recuperação acima de 12% por duas coletas.
- Disco raiz: menos de 15% ou 5 GB por cinco minutos; recuperação acima de 18% e 8 GB por duas coletas.
- Cooldown de 60 minutos por alerta ativo; uma recuperação é enviada ao resolver. Picos isolados não notificam.
- As mensagens incluem gravidade, host, métrica/valor, início, duração, impacto, ação sugerida, horário de São Paulo e UTC.
- O alvo Debian hospeda n8n e WAHA. Se o Debian cair, não há envio WhatsApp: o usuário aceitou verificar esse caso manualmente. A VM Oracle também mantém seu timer local de saúde já existente.
- As portas 9100 não são publicadas em endereços públicos, mas as métricas são HTTP sem autenticação dentro da tailnet. Mantenha a ACL Tailscale restrita aos dispositivos administrativos.

## Teste sintético

Execute `node deploy/monitoring/test-monitor-engine.js`. O teste cobre baseline, CPU sustentada, escalação, memória, disco, indisponibilidade, deduplicação e recuperação. O teste não chama WAHA nem envia WhatsApp.

O workflow foi criado usando `deploy/monitoring/n8n/monitor-workflow.template.json` e referências já existentes no n8n. Para importar em outra instância, substitua os placeholders de ID do grupo interno e da credencial WAHA por referências verificadas dessa instância. Não inclua esses valores no Git.
