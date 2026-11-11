# Proposta de escopo: OVERTRIP como produto para várias empresas

**Estado:** adiado para o futuro; nada de multiempresa foi implementado nem deve ser iniciado nesta etapa.

## Resposta curta

É possível transformar o produto em SaaS para várias empresas, mas a versão
atual foi feita para uma única operação: a OVERTRIP. Liberar cadastros de
clientes no painel agora seria inseguro, porque os registros não têm vínculo
com uma empresa e as consultas não filtram por empresa.

Também há uma diferença de produto entre os segmentos. Operadores de turismo
trabalham com viagens, datas de saída, embarques e vagas. Hospedagens precisam
de acomodações, noites e disponibilidade; restaurantes, de mesas, turnos e
duração de reservas. Esses módulos não devem ser forçados para dentro de um
formulário genérico.

## Recomendação de produto

Validar primeiro uma versão para **mais de uma operadora de turismo**, que é o
caso mais próximo da aplicação atual. Hospedagem e restaurante ficam como
verticais futuras, cada uma com seus próprios fluxos. Não incluir cobrança,
integração paga de WhatsApp ao CRM ou atendimento automatizado neste piloto.
Serviços de infraestrutura para o SaaS serão avaliados separadamente se a
proposta avançar.

## Escopo do primeiro piloto multiempresa

- Uma empresa (`Organization`) possui seus usuários, viagens, configurações e
  conteúdo público.
- Um usuário pode ter vínculo com uma ou mais empresas (`Membership`), com
  função atribuída dentro de cada empresa. A função global atual deixa de ser
  suficiente.
- Cada empresa gerencia o catálogo de viagens e a página pública da própria
  marca. O site escolhe a empresa por domínio verificado ou subdomínio
  controlado pelo produto, nunca por `tenantId` recebido livremente no corpo da
  requisição.
- Leads, reservas, parcelas, destinos, galeria, FAQ, conhecimento privado,
  mídia e documentos ficam vinculados à empresa dona dos dados.
- Um administrador da plataforma, se necessário, é distinto do administrador
  de uma empresa e tem acesso excepcional auditável.

## Requisitos de segurança antes de convidar outra empresa

1. Definir a empresa ativa a partir de associação autenticada e domínio
   validado; rejeitar empresas às quais o usuário não pertence.
2. Aplicar o escopo da empresa em toda leitura, criação, edição, exclusão,
   exportação e tarefa em segundo plano.
3. Proteger relações: uma reserva só pode apontar para viagem e interessado da
   mesma empresa; documentos, fotos e arquivos seguem a mesma regra.
4. Usar chaves e índices compostos por empresa quando houver unicidade local.
5. Criar verificações negativas de API: usuário da empresa A nunca lê, altera,
   exclui ou baixa dados da empresa B, inclusive mudando IDs e URLs.
6. Migrar os dados atuais para uma empresa inicial chamada OVERTRIP e ensaiar
   migração e retorno em cópia isolada antes da produção.
7. Escolher a estratégia de persistência e isolamento antes da implementação.
   O SQLite atual pode atender a instalação única; não deve ser compartilhado
   entre empresas sem isolamento sistemático. PostgreSQL com políticas de
   isolamento ou bancos separados são opções a comparar com os custos de
   operação e recuperação.

## Fora do primeiro piloto

- Módulos para hotéis, pousadas e restaurantes.
- Cobrança de assinatura, pagamentos, comissão ou faturamento automático.
- Integração de WhatsApp ao CRM, campanhas ou respostas automáticas.
- Personalizações complexas, marketplace e permissões por campo.
- Migração ou ativação em produção antes de validar o piloto e testar o
  isolamento entre empresas.

## Fases sugeridas

1. **Validar demanda:** conversar com uma operadora de turismo além da OVERTRIP;
   confirmar se o fluxo de cadastro, publicação e operação serve sem
   personalizações exclusivas.
2. **Fechar decisões de arquitetura:** domínio de cada empresa, associação de
   usuários, estratégia de banco, armazenamento de mídia, backup e acesso de
   suporte.
3. **Construir isolamento:** adicionar empresa e vínculo de usuário; aplicar o
   escopo nas tabelas e serviços existentes; migrar OVERTRIP como primeiro
   tenant; criar testes de acesso cruzado.
4. **Executar piloto fechado:** uma empresa convidada, sem autoinscrição
   pública. Monitorar erros de isolamento, suporte e tarefas duplicadas antes
   de ampliar.
5. **Avaliar outras verticais:** desenhar um módulo independente de hospedagem
   ou restaurante somente após entrevistas e prova de demanda.

## Critério de pronto do piloto

Uma segunda operadora consegue criar e publicar viagens na própria marca; seus
usuários só acessam seus próprios dados; a OVERTRIP continua operando sem
alteração de conteúdo ou permissões; o isolamento é verificado nas rotas,
arquivos e tarefas assíncronas; existe restauração testada e retorno da
migração documentado.
