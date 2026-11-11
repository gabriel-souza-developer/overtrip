# Plano de evolução do CRM e das reservas

## Estado de partida

Revisão do código local em 11/11/2026: o CRM já cadastra e edita interessados,
associa viagem e responsável, filtra por etapa, agenda retorno e guarda
anotações manuais de contato. As rotas exigem administrador. Reservas e parcelas
podem ser registradas e ligadas a um interessado, mas são controles manuais:
não cobram, não confirmam pagamento com banco e não reduzem vagas. O inventário
registra publicação do CRM em 10/11; isso não substitui uma verificação atual da
VM Oracle.

## Fases

### Fase 1 — fila de retornos (implementada localmente em 11/11/2026)

- Filtro operacional para retornos vencidos ou previstos para hoje, combinável
  com etapa e paginação.
- Ordenar a fila pela data de retorno mais antiga e destacar visualmente os
  retornos vencidos.
- Usar a data local de `America/Sao_Paulo` para decidir “hoje”; incluir hoje e
  vencidos uma única vez, excluir futuros e contatos sem data.
- Sem migração de banco, integração externa ou envio automático de mensagens.

**Aceite:** somente administradores acessam CRM; filtros e paginação não
misturam registros; os limites do dia são estáveis no fuso de São Paulo; o
restante do CRM e das reservas mantém o comportamento atual.

Validação local: teste da API verifica retorno vencido, retorno de hoje,
exclusão de data futura, combinação com etapa e rejeição de filtro inválido.
Typecheck e builds da API e do painel passaram. A mudança ainda não foi
publicada na Oracle.

### Fase 2 — origem do interessado e conversão

- Adicionar origem/canal controlado (por exemplo: WhatsApp, Instagram, site,
  indicação e outros) com opção “não informado”.
- Mostrar contagem por origem e etapa com filtros coerentes, sem enviar dados
  pessoais a analytics públicos.
- Definir se “Convertido” significa reserva criada ou reserva confirmada antes
  de automatizar a mudança de etapa.
- Exige migração aditiva, preenchimento seguro dos registros antigos e revisão
  das telas e rotas.

### Fase 3 — fluxo claro de reserva

- Definir estados e seus significados com a operação (consulta, aguardando
  sinal, confirmada, cancelada), sem inferir pagamentos.
- Exibir no CRM a reserva associada e permitir navegação simples entre os dois
  registros.
- Manter parcelas e recebimentos como apontamentos manuais até uma decisão
  explícita sobre conciliação e meios de pagamento.
- Não descontar vagas automaticamente até haver regra aprovada para expiração,
  cancelamento, estorno e concorrência de reservas.

### Fase 4 — comunicação assistida

- Preparar mensagens e lembretes que a equipe revisa e envia; começar sem
  disparos automáticos.
- Só conectar WhatsApp/e-mail depois de verificar credenciais, consentimento,
  opt-out, limites e impacto no fluxo já usado pela operação.
- Registrar quem iniciou a comunicação e o resultado sem copiar dados
  desnecessários para logs.

### Fase 5 — indicadores e melhoria contínua

- Acompanhar volume e conversão por etapa, origem e viagem, além de retornos
  atrasados e reservas pendentes.
- Definir fórmulas e período de análise antes de comparar resultados; não
  confundir lead, reserva, pagamento e vaga ocupada.
- Considerar lista de espera, indicação e recompra após observar dados reais e
  validar a rotina atual da equipe.

## Ordem de execução

1. Fase 1: fila de retornos, sem mudança de banco.
2. Validar o fluxo com os testes de API existentes e revisão de bordas de data.
3. Fase 2: origem e métricas, com migração compatível.
4. Fase 3: alinhar estados e associações antes de qualquer automação financeira
   ou de capacidade.
5. Fases 4 e 5: só após validar os fluxos anteriores e aprovar integração e
   definições operacionais.

## Fora do escopo automático

Este plano não autoriza publicação na Oracle, ativação de serviços externos,
mensagens a clientes, processamento de pagamentos, baixa automática de vagas
ou alteração de dados reais. Cada uma dessas ações exige uma etapa de validação
e autorização próprias.
