# Publicações em redes sociais

## Pesquisa e direção

- [Buffer](https://buffer.com/mcp) reúne preparação, revisão e fila de publicações por canal.
- [Canva](https://www.canva.com/en_gb/help/content-planner/) combina criação de arte e agendamento; seu agendamento depende dos planos indicados na documentação.
- [Later](https://help.later.com/hc/en-us/articles/360043246993-Getting-Started-With-Later-Social) reúne biblioteca de mídia, prévia visual e legendas reutilizáveis.
- [Metricool](https://metricool.com/notion-mcp-content-calendar/) apresenta revisão antes do agendamento e indica conteúdo obrigatório que falta.
- A [API oficial do Instagram](https://developers.facebook.com/docs/instagram/platform/instagram-api/changelog/) prevê publicação para contas profissionais autorizadas. O acesso precisa de aplicativo, permissões e conexão da conta.
- A [API oficial do TikTok](https://developers.tiktok.com/docs/en/content-posting-api-get-started) exige autorização e aprovação; clientes não auditados têm publicações restritas à visualização privada. As [diretrizes](https://developers.tiktok.com/doc/content-sharing-guidelines/) devem ser verificadas para o caso de uso.

## Etapas

1. Preparar e guardar rascunho, sugerir legendas com IA, editar variantes por rede e registrar revisão explícita. A edição posterior invalida a aprovação.
2. Criar artes a partir de modelos editáveis e imagens autorizadas, com prévias por formato e exportação. Avaliar provedores, custos e privacidade antes de gerar imagens por IA.
3. Conectar contas por OAuth oficial, armazenar tokens com segurança e associar permissões a cada conta.
4. Publicar somente a versão aprovada, confirmar resultado por rede, mostrar falhas e evitar duplicações. Agendamento requer worker persistente e registro de tentativas.

As redes e formatos serão priorizados conforme as contas da OVERTRIP e o acesso efetivamente concedido por cada plataforma. Nenhuma publicação deve ser apresentada como concluída antes de confirmação do provedor.

## Ideias prioritárias para a OVERTRIP

- Começar por uma viagem existente e reutilizar suas informações e fotos, sempre com revisão de datas, valores e disponibilidade.
- Um único rascunho com variações de texto e imagem por rede, mostrando prévia do corte e da legenda.
- Uma lista objetiva do que falta antes de agendar; aprovação vinculada à versão exata da legenda e da arte.
- Calendário com horário e estado por rede: rascunho, em revisão, agendado, publicado, falhou ou exige ação manual.
- Mostrar claramente quando uma rede exige conclusão manual ou restringe um formato. Evitar incorporar métricas complexas e caixa de entrada no primeiro ciclo.

## Situação da implementação

O primeiro incremento permite rascunhos de legendas, sugestão por IA e criação de capa local com foto. A mídia social privada pode ser associada às variantes, e sua disponibilidade e integridade são verificadas ao aprovar. OAuth, agendamento e publicação não existem ainda.

**Antes de publicar a mídia privada:** configurar backup e restauração do diretório `SOCIAL_MEDIA_DIR` (produção: `/var/lib/overtrip/social-media`) junto com o banco, testar recuperação em ambiente isolado e definir retenção de mídias órfãs. Os backups existentes de uploads públicos não incluem esse diretório. Também é necessário validar migração, frontend e permissões na instalação de destino.
