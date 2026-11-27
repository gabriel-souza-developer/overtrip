# Cadastro de passageiros

O painel `/admin/passengers` concentra o cadastro de clientes, a lista operacional de cada TRIP, o acompanhamento de pagamento/presença e a exportação da lista do motorista.

## Ativação

1. Configure `PASSENGER_DATA_ENCRYPTION_KEY` no ambiente da API com uma chave aleatória de 32 bytes em Base64 (`openssl rand -base64 32`). Guarde-a no gerenciador de segredos da produção e mantenha uma cópia protegida separada dos backups do banco. Perder essa chave impede a leitura dos dados pessoais cifrados.
2. Aplique a migration Prisma junto com a publicação: `npx prisma migrate deploy`.
3. Depois de publicar a API e o painel, entre como administrador e importe `Forms de passageiros CG TRIP.xlsx` na seção **Passageiros**.

O arquivo não é salvo no servidor. A API valida as abas esperadas e limita o tamanho/volume descompactado antes de processar. Dados pessoais são cifrados antes de irem ao banco. Os registros de auditoria guardam a operação e a quantidade de linhas, nunca os dados da planilha.

## Como os dados são organizados

- Respostas do formulário formam o cadastro de clientes. Como a planilha contém clientes que já viajaram, esses perfis ficam marcados com histórico de viagem.
- As linhas da antiga lista são preservadas com pagamento, valor anotado e presença somente como arquivo histórico. Como a planilha não informa a TRIP, elas nunca são associadas a uma TRIP nem aparecem na lista de embarque.
- Os perfis dos passageiros antigos ficam disponíveis no campo **Cliente existente**. Ao adicionar alguém a uma nova TRIP, é criado um vínculo novo com pagamento e presença em branco; os valores da lista antiga não são reaproveitados.
- Reimportar uma cópia atualizada reconcilia as mesmas pessoas e linhas sem criar vínculos com TRIPs.
- O acompanhamento de pagamento nesta tela é operacional e não altera nem soma valores ao Financeiro.
- A exportação do motorista é um CSV gerado sob demanda com nome e telefone. CPF/RG, e-mail e contato de emergência são mostrados separadamente à equipe, apenas após ação explícita.

Não importe a planilha manualmente no banco nem associe as linhas antigas a uma TRIP. Para uma nova TRIP, escolha o perfil do passageiro no cadastro; isso cria um registro operacional novo sem alterar o histórico arquivado.
