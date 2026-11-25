# Integração de publicação: Instagram e Facebook

Planejamento técnico para o painel OVERTRIP, pesquisado em 16/11/2026. É uma proposta; nenhuma conexão de conta, credencial ou publicação foi criada nesta etapa. Conferir documentação e versão da API antes da implementação.

## Primeiro recorte

- Escolher contas profissionais da OVERTRIP e formato inicial de cada rede. Recomenda-se começar com uma imagem e legenda; stories, reels, carrosséis e vídeos entram depois de validar os requisitos de cada formato.
- O administrador conecta a conta por fluxo oficial, seleciona uma publicação aprovada e confirma a rede e a conta antes do envio.
- Tratar cada rede como uma entrega independente. Uma falha no Facebook não deve fazer o painel declarar falha no Instagram, nem repetir um envio já concluído.
- A edição de legenda ou imagem invalida a aprovação. Antes do envio, conferir a versão aprovada, o hash da mídia, a conta selecionada e os requisitos do formato. A aprovação atual cobre os dados salvos; ainda não há registro de entrega.

## O que a Meta exige

### Instagram

A [documentação oficial da Instagram API com Facebook Login](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-3fe78620-2258-44b6-893f-42d76c7200d7) descreve contas profissionais vinculadas a uma Página para essa modalidade; contas pessoais não são atendidas. A documentação também distingue limitações de stories por tipo de conta. Existe outra modalidade, [Instagram Login](https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login), com permissões próprias. **Decisão pendente:** confirmar qual modalidade atende os ativos existentes e se a mesma conexão cobre as necessidades de cada rede; não combinar escopos ou tokens dos dois fluxos por suposição.

No fluxo de conteúdo, a Meta documenta criação de mídia e publicação via contêiner; conferir requisitos de formato, URL, processamento, validade e disponibilidade para cada tipo antes de implementá-lo. Uma resposta de criação de contêiner não equivale a publicação confirmada. [Coleção oficial da Meta](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-b217bc6c-d9fb-4d65-bf5e-fcadf650ad5c)

### Facebook

Para post no feed de Página, a [documentação do endpoint de feed](https://developers.facebook.com/docs/graph-api/reference/page/feed/) descreve token da Página, permissões como `pages_manage_posts`, `pages_read_engagement` e `pages_show_list`, além de tarefa de criação de conteúdo. Os requisitos variam conforme endpoint e tipo de conteúdo; validar também a documentação específica de fotos antes de prometer publicação de imagem.

### Aplicativo, permissões e consentimento

É necessário configurar um aplicativo Meta, URLs de retorno e os produtos/escopos correspondentes, além de um usuário com acesso ao ativo. A [Meta explica o App Review](https://developers.facebook.com/docs/resp-plat-initiatives/app-review/introduction): permissões sem acesso avançado ficam limitadas aos usuários com função no aplicativo; uso por outras pessoas pode exigir revisão. Não presumir aprovação, disponibilidade de conta profissional ou ausência de custo. A pessoa responsável deverá autorizar a conexão no provedor; não solicitar senha ou token pelo chat.

## Experiência proposta

1. **Contas:** administrador escolhe “Conectar Instagram” ou “Conectar Facebook”, conclui consentimento na Meta e escolhe a conta/Página permitida. Exibir conta, permissões concedidas e situação; permitir desconectar e reconectar.
2. **Preparar:** escolher viagem ou criar rascunho; editar legenda e anexar imagem por rede. Mostrar prévia fiel ao formato suportado e avisos de dados ausentes.
3. **Revisar:** mostrar conta, imagem final e legenda de cada rede. Registrar usuário, instante, versão e hashes da mídia revisada. Uma alteração posterior exige nova aprovação.
4. **Enviar:** exigir confirmação explícita para a versão e conta mostradas. Resultado por rede, com link quando obtido do provedor; oferecer ação manual quando não for possível publicar pela API.
5. **Agendar depois:** trabalhador persistente, fuso horário explícito e cancelamento. Sem um worker recuperável, a interface não deve prometer agendamento.

## Modelo de dados proposto

- `SocialAccount`: plataforma, identificador externo, nome exibido, status, permissões concedidas e metadados de expiração; dados sensíveis em armazenamento cifrado restrito, nunca no frontend ou logs. Separar conexão Instagram da Página Facebook mesmo que compartilhem autorização.
- `SocialApproval`: identidade do revisor, versão do post, variantes, IDs/hashes imutáveis de mídia e instante. O `approvedAt` atual é insuficiente para auditar usuário e histórico. A migração precisa preservar rascunhos existentes.
- `SocialDelivery`: vínculo ao post e à conta, revisão exata, tipo e formato, horário e fuso pretendidos, estado, identificadores remotos, timestamps e erro sanitizado. Não armazenar corpo completo de resposta que possa incluir token ou dados pessoais.
- `SocialAttempt` ou log de eventos: contagem e resultado sanitizado de cada tentativa, com vínculo à entrega. Índices e uma restrição impedem duas entregas concorrentes equivalentes; não impedir publicação intencional futura de outra versão aprovada.

## Estados e concorrência

Conta: `DISCONNECTED`, `CONNECTING`, `CONNECTED`, `REAUTH_REQUIRED`, `REVOKED`, `ERROR`. Não tratar token expirado ou permissões revogadas como conexão saudável.

Entrega: `DRAFT`, `READY_FOR_REVIEW`, `APPROVED`, `SCHEDULED`, `SENDING`, `PROCESSING`, `PUBLISHED`, `FAILED`, `ACTION_REQUIRED`, `UNKNOWN`, `CANCELLED`. Estados são por rede e por conta, não um único estado global. `UNKNOWN` cobre timeout após uma chamada que pode ter chegado à Meta: consultar o estado remoto ou solicitar revisão humana antes de repetir. Uma reserva transacional com chave única/lease impede dois workers de enviar simultaneamente; isso **não** garante idempotência no provedor. Repetir automaticamente somente quando houver evidência de que não houve envio ou idempotência suportada e documentada.

No momento de enfileirar e de executar: validar que a revisão ainda corresponde exatamente a versão, conta, texto e mídia, que o arquivo continua íntegro e que as permissões seguem válidas. Não segurar transação SQLite durante requisição HTTP à Meta. Registrar a transição de forma transacional e recuperar tarefas interrompidas sem assumir que a tentativa anterior falhou.

## Segurança e mídia privada

- OAuth: usar `state` imprevisível, vinculado à sessão e de uso único, expiração curta e URI de retorno previamente cadastrada; empregar PKCE apenas se a modalidade escolhida da Meta o suportar. Administrador autentica e autoriza; redirecionamentos devem usar lista fixa de destinos.
- Tokens e app secret ficam no servidor, cifrados em repouso com chave fora do banco e com plano de rotação; nunca em URL, HTML, localStorage, arquivos públicos ou logs. Validar CSRF/Origin nas operações autenticadas por cookie; revogação e exclusão de conta devem invalidar trabalho pendente.
- A mídia social atual é privada. Se o endpoint da Meta escolhido exigir URL acessível para coletar o arquivo, projetar um mecanismo de acesso temporário específico, escopo por arquivo, prazo curto e sem listagem, preservando sigilo até o usuário iniciar a publicação. Verificar como a Meta acessa a URL e quando pode ser revogada. Não expor diretamente o diretório privado nem reutilizar a rota pública de galeria. Se o fluxo aceitar upload direto, avaliar essa alternativa.
- Aplicar limites de arquivo, duração, formato, tamanho e taxa conforme documentação vigente; proteger workers contra abuso. Evitar log de briefing, legendas, imagens, tokens e URLs assinadas.
- O backup privado versionado inclui mídias em uma etapa separada, mas a recuperação precisa ser ensaiada junto ao snapshot real e cópia fora da VM ainda está pendente. Antes de permitir publicação, validar recuperação e regras para mídias órfãs.

## Critérios de implementação e testes

1. Confirmar contas, modalidade de login, permissões e formato inicial com o responsável; criar e testar aplicativo em ambiente de desenvolvimento Meta sem credenciais no repositório.
2. Implementar conexão/revogação, armazenamento seguro e testes de `state`, sessão expirada, permissões insuficientes e token inválido. A interface deve distinguir indisponível de conectado.
3. Implementar entrega de uma imagem por rede com adaptadores independentes e respostas simuladas; testar integridade da aprovação, concorrência, timeout ambíguo, limites, reautorização e duplicação.
4. Ensaiar com contas de teste autorizadas e validar conteúdo e status no provedor. Registrar erros sem dados sensíveis e usar testes manuais com confirmação do operador para postagem real.
5. Adicionar agendamento e recuperação de worker somente após o fluxo imediato funcionar. Auditoria de segurança, backup/restauração e observabilidade são pré-requisitos para ativação.

Não há no código atual conexão OAuth, worker de publicação ou integração de API das redes. A tela atual é de preparação e revisão; não deve indicar que uma publicação externa foi feita.
