# Fase 2 - Reorganização da experiência do formulário

**Branch:** `feat/trip-workflow-assistant-foundation`
**Data:** 2026-11-01
**Status:** ✅ Concluída e validada.

## Objetivo

Transformar o formulário de viagem para seguir um fluxo progressivo que deixa clara a separação entre:
1. **Criar rascunho** (mínimo absoluto para salvar)
2. **Preparar publicação** (campos obrigatórios para o site)
3. **Detalhes para viajantes** (opcional, melhora a experiência)
4. **Ajustes avançados** (exceções e personalizações)

## Mudanças implementadas

### 1. Nova estrutura do formulário

#### Seção "Criar rascunho" (sempre visível, não recolhível)
- Nome da viagem
- Estado e cidade (destino)
- Data de saída
- Bloco de IA (AiDraftBlock) para importação de texto livre

**Removidos desta seção:**
- ❌ Horário de saída → movido para "Detalhes para viajantes"
- ❌ Valor/preço → movido para "Preparar publicação"
- ❌ Situação (status) → movido para "Preparar publicação"
- ❌ Fotos → movido para "Preparar publicação"

#### Seção "Preparar publicação" (recolhível, abre ao editar)
**Campos obrigatórios para publicar:**
- Resumo/Descrição da experiência
- Fotos/capa (mínimo 1 foto)
- Valor ou checkbox "viagem gratuita"
- Embarque: cidade/local OU checkbox "a confirmar"
- Situação (DRAFT/OPEN) - visível apenas para admin

**Novo componente:** `PublicationReadinessPanel`
- Mostra claramente o que falta para publicar
- Badge verde quando pronto, amarelo quando pendente
- Lista de pendências usando `publishProblems()`

#### Seção "Detalhes para viajantes" (recolhível)
**Reagrupamento de campos:**
- Categoria e intensidade
- Vagas restantes
- Horário de saída (movido de "O básico")
- Data e horário de volta
- O que inclui (serviços)
- Roteiro, observações do percurso e informações importantes

**Seções mescladas:**
- "Informações da viagem" + "Embarque e horários" + "Roteiro e informações"

#### Seção "Ajustes avançados" (recolhível)
**Campos mantidos:**
- Título do card (headlineDisplay)
- Texto do preço customizado
- Tolerância de espera
- Horário em texto livre
- Checkbox "horário não definido"
- Distância da trilha
- Ponto de apoio e informações
- Frase de destaque dos inclusos
- Detalhes do embarque
- Endereço para mapa
- Saídas de múltiplos lugares

**Campos movidos para configurações globais:**
- ❌ buttonLabel (texto do botão)
- ❌ buttonClass (cor do botão)
- ❌ priceUnit (unidade do preço)

### 2. Componente PublicationReadinessPanel

**Arquivo:** `frontend/src/components/PublicationReadinessPanel.tsx`

Novo componente visual que mostra o status de prontidão para publicação:
- Verde com ícone CheckCircle: pronto para publicar
- Amarelo com ícone AlertCircle: lista de pendências
- Acessível (role="status", aria-live="polite")

### 3. Ajustes na função countAdvancedFilled

**Arquivo:** `frontend/src/lib/panelHelpers.ts`

Removidos campos que não existem mais na seção:
- `priceUnit`
- `buttonLabel`
- `buttonClass`

A função agora conta apenas os campos que realmente estão em "Ajustes avançados".

### 4. Testes atualizados

**Arquivos:**
- `tests/trip-form-sections.test.ts`
- `tests/permissions.test.ts`

Todos os testes foram ajustados para refletir a nova estrutura:
- ✅ 3 seções recolhíveis (Preparar publicação, Detalhes, Ajustes)
- ✅ "Preparar publicação" abre por padrão ao editar (`defaultOpen={isEditing}`)
- ✅ Campo "Situação" visível apenas para admin, dentro de "Preparar publicação"
- ✅ Todos os campos antigos continuam presentes (nenhum removido do backend)
- ✅ PublicationReadinessPanel presente na seção correta

### 5. Padrões globais de apresentação

Os valores de CTA, estilo e unidade de preço agora ficam em **Configurações**:
- Texto do botão (`buttonLabel`)
- Estilo do botão (`buttonClass`)
- Unidade do preço (`priceUnit`)

Eles são aplicados somente à criação de novas viagens, tanto pelo painel quanto
pela API. Viagens existentes preservam seus valores, inclusive exceções
legadas.

### 6. Prévia e revisão

- `TripCardPreview` mostra no próprio formulário uma prévia viva do card que
  será exibido no site.
- O status interno `REVIEW` representa uma viagem em revisão.
- `REVIEW` nunca aparece na listagem pública e apenas um administrador pode
  publicar a viagem.

## Validações mantidas

✅ **Validação mínima para rascunho:** nome, cidade, UF e data de saída
✅ **Validação para publicação:** rascunho + foto, valor ou gratuidade, resumo e embarque
✅ **Regra de embarque:** precisa de cidade/local OU checkbox "a confirmar" OU departures múltiplos
✅ **Suíte completa: 394 testes passando; 2 testes de backup SQLite ignorados
por falta do executável `sqlite3` neste ambiente**

## Funcionalidades preservadas

✅ Salvamento automático de campos em seções recolhidas
✅ Alerta de saída sem salvar
✅ Validação em tempo real
✅ Foco no primeiro erro ao tentar salvar
✅ Importação de IA (AiDraftBlock)
✅ Integração com locationCombobox
✅ Parsing de valores brasileiros (1.250,99)
✅ Acessibilidade (ARIA labels, roles, etc.)

## Verificação manual

Para testar:
1. Criar novo rascunho: preencher só nome, destino e data → deve salvar
2. Ver painel de pendências: deve listar o que falta (resumo, foto, valor, embarque)
3. Adicionar campos de publicação: pendências devem sumir progressivamente
4. Marcar "viagem gratuita": pendência de valor deve desaparecer
5. Marcar "embarque a confirmar": pendência de embarque deve desaparecer
6. Publicar: só deve permitir quando todas as pendências estiverem resolvidas
7. Selecionar “Em revisão”: a viagem não deve ser listada no site público
8. Alterar os padrões em Configurações e criar uma nova viagem: a prévia deve
   refletir os novos padrões

## Arquivos alterados

```
frontend/src/components/PublicationReadinessPanel.tsx (novo)
frontend/src/components/TripCardPreview.tsx (novo)
frontend/src/lib/panelHelpers.ts
frontend/src/pages/TripForm.tsx
frontend/src/pages/Settings.tsx
src/services/settingsService.ts
src/controllers/settingsController.ts
src/routes/settingsRoutes.ts
src/validators/index.ts
tests/permissions.test.ts
tests/trip-form-sections.test.ts
```

## Aceite

- [x] Build do frontend e testes completos passando
- [x] Formulário salva rascunho com só nome+destino+data
- [x] Painel de pendências mostra corretamente o que falta
- [x] Publicação bloqueada quando falta campo obrigatório
- [x] Não há regressão de funcionalidade
- [x] Estrutura clara em 4 blocos lógicos
- [x] Campo "Situação" visível apenas para admin
- [x] "Preparar publicação" abre por padrão ao editar
- [x] Padrões de apresentação configuráveis e aplicados só às novas viagens
- [x] Prévia viva do card no formulário
- [x] Estado interno REVIEW sem exposição pública
