# Fase 4 — base do Agente OVERTRIP

## Ponto de partida

O protótipo n8n/WAHA é uma referência de comportamento, não uma integração
aprovada. A aplicação já dispõe de um catálogo interno derivado de `Trip`, sem
rota HTTP, que exclui viagens não publicadas, indisponíveis ou com saída em dia
passado. Disponibilidade desconhecida e embarque a confirmar são explícitos;
reserva exige atendimento humano. Datas são interpretadas no calendário de São
Paulo. O catálogo não inclui documentos, notas internas ou dados de clientes.

## Sequência proposta

1. Consolidar o contrato privado de catálogo, incluindo identificação segura,
   atualização, informações aprovadas e comportamento para dados ausentes.
2. Gestão da base de conhecimento aprovada e versionada: o painel permite
   aprovar versões completas, consultar histórico e identificar o administrador.
   Alterações simultâneas exigem recarregar a base antes de aprovar. Não há
   dados aprovados iniciais; uma versão vazia remove os itens ativos.
3. Projetar autenticação entre serviços e auditoria com versão do conhecimento.
   A fundação interna de auditoria armazena somente versão, resultado e data,
   mas ainda não está ligada a respostas reais nem possui política de retenção.
4. Definir estados e responsáveis do atendimento humano: solicitação, aviso,
   confirmação de recebimento, atendimento e retorno controlado ao assistente.
   Prever falha de aviso e evitar prometer uma transferência não confirmada.
5. Exercitar os fluxos localmente com fontes e canal simulados; só depois
   escolher e integrar o canal externo com aprovação específica.

O protótipo oferece exemplos de pedido explícito de humano, pagamento,
reclamação, ausência de resposta e retorno ao assistente. Os prazos e mensagens
dele são referências, não política aprovada para produção. Reservas,
pagamentos e alterações devem ser confirmados pelo sistema ou pela equipe;
o agente não pode afirmar que foram concluídos por conta própria.

## Decisões pendentes antes da integração

- Provedor e modalidade de WhatsApp; política de opt-in e limites de automação.
- Responsável pelo atendimento, horários, canais de aviso e alternativa quando
  ninguém assumir; condições e autorização para retorno ao assistente.
- Quem aprova e atualiza a base de conhecimento, retenção e acesso à auditoria.
- Como aprovar campos comunicáveis e como tratar disponibilidade sujeita a
  confirmação. Não presumir que todo conteúdo operacional seja público.

Não há canal conectado, autenticação de serviço nem auditoria de respostas reais.
A gestão HTTP de conhecimento exige autenticação e papel de administrador; ela
não é uma API do conector. A migração precisa ser aplicada no ambiente quando
esta etapa for implantada. Informações inseridas são dados, não instruções de
sistema. Antes de usá-las em respostas, definir responsabilidades operacionais.

## Contrato proposto para o futuro conector

- Acesso exclusivamente servidor a servidor e autenticado, com credencial
  própria, escopo mínimo, revogação e rotação; ainda sem mecanismo escolhido.
- Leitura do catálogo reduzido e da versão ativa aprovada; a resposta identifica
  a versão para associá-la à auditoria. Uma base ausente ou vazia não autoriza
  inventar respostas e deve encaminhar a questão conforme a política definida.
- Campos e fontes são dados não confiáveis, não instruções. Nenhum PDF, segredo,
  nota operacional ou dado pessoal de cliente entra no catálogo ou na FAQ.
- O contrato não concede escrita em viagens, reservas ou conhecimento; não
  garante vaga, pagamento ou transferência. A auditoria deve registrar versão,
  resultado e identificadores mínimos, com retenção a definir.
- Não publicar endpoint, conectar WhatsApp ou escolher fornecedor antes das
  decisões e da aprovação específica previstas no plano principal.
