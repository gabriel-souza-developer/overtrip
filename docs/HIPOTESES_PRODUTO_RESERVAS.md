# Hipóteses de produto: operação de reservas

Este documento orienta experimentos; ainda não é validação com clientes. A
OVERTRIP de turismo e a plataforma de pousadas e restaurantes têm bases e
operações distintas. Nenhum dado de clientes deve ser transferido entre elas
por causa destas hipóteses.

## Problemas a investigar

- **Turismo:** uma equipe pequena precisa saber quem aguarda retorno e o que
  já foi combinado, sem procurar em conversas dispersas. Medir retornos vencidos,
  tempo até o primeiro contato e reservas registradas após o atendimento.
- **Pousadas:** a equipe precisa enxergar disponibilidade e evitar reservas
  conflitantes, inclusive quando recebe pedidos por mais de um canal. A
  distribuição hoteleira envolve múltiplas fontes e trabalho manual, segundo
  o [State of Distribution Report 2025 da HEDNA](https://www.hedna.org/wp-content/uploads/2025/08/The-State-of-Distribution-Report-2025.pdf).
  A existência dessa dificuldade não comprova a demanda de um piloto local.
- **Restaurantes:** uma equipe precisa saber quem é esperado, registrar
  chegadas e identificar ausências. A [National Restaurant Association](https://restaurant.org/education-and-resources/resource-library/3rd-party-reservations-unappetizing-to-customers/)
  descreve ausências como desafio operacional. Não presumir que cobrança de
  sinal ou mensagem automática seja desejada ou autorizada.

## Experimento antes de ampliar o escopo

Conversar com pelo menos três operadores de cada nicho-alvo, observar o fluxo
real de uma reserva e registrar ferramentas usadas, frequência dos problemas,
consequências e soluções existentes. Perguntar sobre o último caso concreto,
em vez de pedir apenas opinião sobre uma solução proposta. Usar dados fictícios
nas demonstrações e não registrar informações pessoais sem autorização.

Uma primeira aposta para pousadas é calendário de unidades com bloqueios e
prevenção de conflitos. Para restaurantes, agenda de reservas com capacidade,
chegada e ausência. Antes de integrar canais, pagamentos ou mensagens, validar
as regras da operação e testar concorrência e isolamento entre empresas.

Medidas candidatas para um piloto: tempo para registrar uma reserva, número de
conflitos identificados antes da confirmação, reservas sem status atualizado e
tempo para encontrar o próximo atendimento. Definir linha de base e critério de
sucesso com o operador antes de interpretar os resultados.
