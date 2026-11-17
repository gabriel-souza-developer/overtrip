# Plataforma para pousadas e restaurantes

## Objetivo e separação

Desenvolver uma plataforma com acesso comum e experiências específicas para **pousadas** e **restaurantes**. Cada empresa terá seu próprio espaço, identidade, usuários, permissões e dados. O nicho é uma configuração da empresa, verificada no servidor.

A OVERTRIP de turismo e seu painel atual continuam em outra linha de desenvolvimento e em produção. O código atual serve como referência técnica; esta iniciativa não pressupõe migrar seus usuários ou dados para a nova plataforma. Turismo não integra o escopo de nichos da plataforma nesta etapa.

## Acesso proposto

1. Uma tela comum permite que a pessoa entre com sua conta.
2. A API identifica os espaços de trabalho aos quais ela pertence.
3. Quando há apenas um espaço, ele é selecionado automaticamente; com mais de um, a pessoa escolhe qual abrir.
4. O servidor confirma o vínculo e o papel. O painel apresenta a marca, o vocabulário e os módulos correspondentes à empresa.

O protótipo local em `/prototipo` apresenta os dois nichos com dados fictícios e ações simuladas. Em desenvolvimento, `/espaco` usa sessão autenticada, escolhe automaticamente um vínculo único ou oferece a escolha entre empresas e abre a operação inicial de pousada com dados persistidos no banco configurado. A implantação separada ainda não está pronta e não deve ser usada com empresas reais.

`GET /api/organizations` usa a sessão autenticada e lista apenas as empresas ativas vinculadas à conta, incluindo o papel em cada uma. As rotas de empresa e pousada pertencem exclusivamente ao app da plataforma; a API legada não as monta.

## Processo e ambiente isolados

O processo `npm run dev:platform` (ou `npm run start:platform` após compilar)
serve apenas saúde, autenticação, empresas e pousada. Defina
`PLATFORM_DATABASE_URL` e `PLATFORM_JWT_SECRET` próprios e `PLATFORM_PORT`
(padrão 3002); a inicialização recusa segredo igual e caminhos SQLite que
resolvam para o mesmo arquivo do turismo, inclusive caminhos relativos e links
simbólicos existentes. Isso não comprova o isolamento de armazenamento em todas
as configurações: confira também backups, credenciais e permissões. Em
produção, use um domínio/host independente e configure `CORS_ORIGIN` para ele.
A plataforma usa um cookie de sessão distinto do turismo, mas isso não substitui
a separação do host e dos segredos. A inicialização não comprova a
separação do ambiente nem cria contas ou dados de exemplo.

Para desenvolver a interface, inicie a API da plataforma em banco de teste
próprio e inicie o Vite com `VITE_PLATFORM_MODE=true PLATFORM_API_TARGET=http://127.0.0.1:3002 npm run dev:frontend`.
Nesse modo **todo** `/api`, incluindo login, aponta para a plataforma. Configure
`CORS_ORIGIN` para a origem real do Vite. A suíte E2E combinada é uma exceção
de teste: usa um banco temporário e a mesma sessão para os dois apps, roteando
empresas/pousada ao app da plataforma. Não reproduzir essa configuração para
usuários reais.

Para preparar dados fictícios, crie um arquivo SQLite **novo** e separado,
configure `PLATFORM_DATABASE_URL`, `PLATFORM_DEMO_EMAIL` e
`PLATFORM_DEMO_PASSWORD` (mínimo de 12 caracteres e máximo de 72 bytes), e aplique as migrações ao
banco de demonstração com `DATABASE_URL="$PLATFORM_DATABASE_URL" npx prisma migrate deploy`.
Gere o cliente Prisma desta branch com `npm run prisma:generate` antes de iniciar
a API ou executar a carga. Use instalações de dependências independentes para
as duas branches, pois seus schemas são diferentes.
Depois execute `npm run seed:platform-demo`. O script recusa produção, compara
o caminho real do banco com o banco de turismo e exige que todas as tabelas de
aplicação estejam vazias; não altera dados existentes.
O comando cria uma conta e uma pousada fictícias. Guarde as credenciais fora do
repositório e descarte o banco ao terminar. Confira o ambiente antes da migração.

O modo `VITE_PLATFORM_MODE=true` troca o destino após login para `/espaco` e
remove as rotas e navegação legadas da interface. A variável deve estar presente
na compilação da interface separada; ela é incorporada ao build. O proxy de
Vite serve apenas para desenvolvimento: no build, o servidor web da plataforma
precisa encaminhar todo `/api` à API da plataforma no host próprio. A interface
legada continua com a configuração original quando a variável não está ativa.

Há uma API inicial de pousada em `/api/lodging`, exigindo sessão, cabeçalho
`X-Organization-Id`, vínculo ativo e papel `owner`, `admin` ou `staff` em uma
organização de nicho `pousada`. Ela cadastra unidades, registra e cancela
reservas e lista os registros da empresa. As datas são dias civis em
`AAAA-MM-DD`; a saída é exclusiva e cada estadia aceita de 1 a 366 noites. A
reserva e suas noites são gravadas atomicamente, com unicidade por unidade e
noite no banco para impedir reservas simultâneas conflitantes. O cancelamento
de uma reserva confirmada libera as noites e preserva o histórico. A chegada e
a saída são registradas pelas transições `CONFIRMED` → `CHECKED_IN` →
`CHECKED_OUT`; repetir a transição já realizada é seguro, e outros saltos ou
cancelamentos após a chegada são recusados. Essas marcações não alteram datas
nem liberam noites. Bloqueios de unidade para manutenção usam as mesmas noites
das reservas; conflitos são recusados atomicamente e o cancelamento libera
as noites do bloqueio, mantendo seu histórico. O `CHECK` que exige exatamente
um dono por noite está na migração SQL e exige `prisma migrate deploy`; `db push`
não o instala. Ainda não há canais, pagamentos ou importação de dados legados.
A tela pagina unidades e reservas e consulta uma grade de 14
noites diretamente ao servidor, independentemente da página de reservas. A grade
inclui bloqueios locais, mas não outros canais. A tela mostra chegadas e saídas pendentes
do dia de São Paulo, sinaliza marcações anteriores sem presumir ausência e
permite buscar reservas por hóspede e situação. Por compatibilidade, chamadas
antigas sem parâmetros de paginação ainda retornam a lista completa; novos
clientes devem informar `page` e `limit`.

`GET /api/organizations/current` recebe `X-Organization-Id`, verifica o vínculo e o estado da empresa no banco a cada requisição e devolve o contexto e papel correspondentes. A revogação do vínculo e a desativação da empresa impedem acessos posteriores. A rota não torna os módulos legados multiempresa nem substitui a necessidade de ambiente e dados próprios.

Há uma API inicial de restaurante em `/api/restaurant`, com o mesmo padrão de
sessão, cabeçalho e papel da pousada, restrita a organizações de nicho
`restaurante`. Ela cadastra mesas com capacidade, registra e cancela reservas
por mesa, data, turno (`ALMOCO` ou `JANTAR`) e horário, e recusa reservas cujo
grupo exceda a capacidade da mesa. A chave única (mesa, data, turno) na tabela
de ocupação impede reservas simultâneas conflitantes; o cancelamento apaga a
linha de ocupação e libera o turno, preservando a reserva no histórico com
status `CANCELLED`. A chegada e a ausência são registradas pelas transições
`CONFIRMED` → `ARRIVED` e `CONFIRMED` → `NO_SHOW`; repetir a transição já
realizada é segura, e outros saltos ou o cancelamento após uma dessas
marcações são recusados. Essas marcações não liberam o turno. Ainda não há
mesas combinadas, grupos, duração configurável, canais, pagamentos ou
importação de dados legados. Esta aposta técnica foi implementada antes da
validação com operadores reais prevista na fase 4 e em
[HIPOTESES_PRODUTO_RESERVAS.md](HIPOTESES_PRODUTO_RESERVAS.md); revisar as
regras de turno e capacidade com operadores antes de um piloto.

## Nichos e funcionalidades iniciais

- **Pousada:** propriedade, acomodações e unidades, disponibilidade por noite, bloqueios, reservas, hóspedes, check-in e check-out.
- **Restaurante:** estabelecimento, mesas, capacidade, turnos, reservas por horário, cancelamento e registro de chegada.

Pousadas e restaurantes compartilham identidade, acesso, usuários e componentes visuais. Os modelos de disponibilidade e de reserva devem respeitar as regras próprias de cada operação. Channel manager, pagamentos, pedidos, delivery e integrações serão avaliados depois da validação dos fluxos centrais.

## Fases

### 0. Descoberta e protótipo

- Mapear com operadores de pousada e restaurante as atividades diárias e os principais problemas.
- Validar a navegação, a agenda e o vocabulário dos dois nichos em um protótipo com dados fictícios.
- Delimitar o primeiro perfil de cliente para cada nicho e o fluxo mínimo de reservas.

### 1. Fundação multiempresa

- Criar organizações e vínculos de usuários com papéis por empresa; os modelos iniciais e uma migração aditiva estão preparados nesta branch.
- Construir autenticação e contexto de empresa, validar vínculo ativo a cada operação e estabelecer permissões no servidor.
- Projetar um banco e ambiente de demonstração próprios. Qualquer migração do código legado deve ser avaliada isoladamente, sem transferência presumida de dados da OVERTRIP.
- Aplicar escopo de empresa a todas as consultas, arquivos e tarefas da plataforma; testar leitura, alteração e exclusão entre empresas diferentes.

### 2. Acesso e estrutura comum

- Implementar login, escolha automática ou seleção de espaço e carregamento dos módulos permitidos.
- Criar navegação, componentes e preferências de marca reutilizáveis, mantendo os fluxos próprios de cada nicho.
- Exercitar o sistema com empresas e usuários fictícios antes de criar contas reais.

### 3. MVP de pousadas

- Propriedade, acomodações e unidades; calendário, bloqueios e disponibilidade por noite.
- Reserva, hóspede, chegada e saída, com prevenção de reservas conflitantes em operações simultâneas.
- Validar operação em telas móveis e revisar o fluxo com uma pousada piloto.

### 4. MVP de restaurantes

- Implementadas mesas com capacidade e reservas por mesa, data, turno e horário, com conflito e cancelamento testados (unitário, HTTP e e2e); agenda, chegada e ausência na tela `/espaco`.
- Ainda falta: validar turnos, capacidade, duração, mesas combinadas, grupos, cancelamentos e ausências com operadores reais — a implementação acima é uma aposta técnica, não o resultado dessa validação.
- Testar conflitos e reservas simultâneas em piloto isolado, com dados reais.

### 5. Piloto e evolução

- Testar isolamento, permissões, backup e restauração, acessibilidade e monitoramento em ambiente separado.
- Acompanhar os pilotos e priorizar integrações e automações conforme a necessidade demonstrada.

## Limites de segurança

O contexto de organização em `src/middleware/organizationContext.ts` protege as rotas novas de pousada, mas não está ligado às rotas legadas. As consultas, os arquivos e os serviços herdados continuam globais. Não habilitar empresas reais nem apresentar a base como multiempresa até verificar o escopo completo e passar nos testes de isolamento.

A revisão inicial identificou dados de viagens, reservas, galeria, mídia, configurações, FAQ, assistente, importações, jobs e armazenamento global no código herdado. Eles devem ser avaliados individualmente caso sejam reutilizados; funções de infraestrutura, como saúde do servidor e restauração, exigem papel de plataforma.

## Referências

- [Checkfront — setores atendidos](https://www.checkfront.com/industries/): referência para reservas e disponibilidade em diferentes operações.
- [eviivo — Property Manager](https://eviivo.com/products/property-manager/): calendário e operação de hospedagens.
- [Cloudbeds — PMS](https://www.cloudbeds.com/property-management-system/): organização de módulos para hospedagem.
- [Lodgify](https://www.lodgify.com/): referência de gestão de hospedagem e reservas diretas.

As decisões de arquitetura são propostas para este projeto. As referências de interface e seus critérios de uso estão em [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).
