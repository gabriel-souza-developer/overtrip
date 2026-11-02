# Fase 2 - Reorganização do formulário de viagem ✅

**Status:** Concluída e validada.
**Branch:** `feat/trip-workflow-assistant-foundation`
**Data:** 2026-11-01
**Testes:** 394 passed; 2 ignorados condicionalmente (backup SQLite sem
executável `sqlite3` no ambiente)

## Resumo

A Fase 2 do plano TRIP_WORKFLOW_ASSISTANT reorganizou o formulário de viagem em 4 seções lógicas que refletem o fluxo progressivo de criação → publicação → refinamento:

1. **Criar rascunho** (sempre visível)
2. **Preparar publicação** (recolhível, abre ao editar)
3. **Detalhes para viajantes** (recolhível)
4. **Ajustes avançados** (recolhível)

## Mudanças principais

### ✅ Nova seção "Criar rascunho"
- Campos mínimos: nome, destino (estado/cidade), data de saída
- Bloco de IA mantido para importação de texto livre
- Removidos: horário, valor, status, fotos (movidos para outras seções)

### ✅ Nova seção "Preparar publicação"
- Painel visual de pendências (`PublicationReadinessPanel`)
- Campos obrigatórios: resumo, fotos, valor/gratuidade, embarque
- Campo "Situação" visível apenas para admin
- Abre por padrão ao editar viagem existente

### ✅ Seção "Detalhes para viajantes"
- Mesclou 3 seções antigas: "Informações da viagem" + "Embarque e horários" + "Roteiro"
- Reorganizou: categoria, intensidade, vagas, horários, inclusos, roteiro, observações

### ✅ Seção "Ajustes avançados"
- Renomeou "Exibição no site"
- Moveu `buttonLabel`, `buttonClass` e `priceUnit` para Configurações, aplicados a novas viagens e preservando valores de viagens existentes
- Manteve personalizações: headline customizado, texto de preço, tolerância, etc.

### ✅ Novo componente PublicationReadinessPanel
- Mostra status visual: verde (pronto) ou amarelo (pendente)
- Lista clara de pendências usando `publishProblems()`
- Acessível (ARIA roles e live regions)

### ✅ Padrões globais para novas viagens
- Configuração administrativa de CTA, estilo do botão e unidade de preço
- Aplicação também pela API quando o cliente omite esses campos
- Viagens existentes mantêm os valores gravados

### ✅ Prévia e estado de revisão
- `TripCardPreview` apresenta uma prévia viva do card no formulário
- Status `REVIEW` permite revisão interna antes da publicação
- Viagens em revisão não são expostas no site público

## Arquivos alterados

```
frontend/src/components/PublicationReadinessPanel.tsx  (novo, 41 linhas)
frontend/src/components/TripCardPreview.tsx             (novo)
frontend/src/lib/panelHelpers.ts                       (-9 linhas)
frontend/src/pages/TripForm.tsx                        (-13 linhas líquidas)
frontend/src/pages/Settings.tsx
src/services/settingsService.ts
src/controllers/settingsController.ts
src/routes/settingsRoutes.ts
src/validators/index.ts
tests/permissions.test.ts                              (ajustado)
tests/trip-form-sections.test.ts                       (ajustado)
docs/FASE_2_IMPLEMENTACAO.md                           (novo, documentação)
docs/FASE_2_RESUMO.md                                  (este arquivo)
```

**Total:** 1 componente novo, 113 inserções, 132 deleções

## Validações preservadas

✅ Rascunho: nome, cidade, UF, data
✅ Publicação: rascunho + foto + valor/gratuidade + resumo + embarque
✅ Embarque: cidade/local OU "a confirmar" OU departures
✅ Parsing brasileiro de valores (1.250,99)
✅ Validação em tempo real com foco no erro
✅ Alerta de saída sem salvar
✅ Acessibilidade (WCAG)

## Funcionalidades mantidas

✅ Importação de IA (AiDraftBlock)
✅ Salvamento em seções recolhidas
✅ Autocompletar de cidades
✅ Seletor visual de destinos visitados
✅ Upload de múltiplas fotos
✅ Arrays dinâmicos (inclusos, roteiro, etc.)
✅ Departures múltiplos
✅ Todos os campos do backend preservados

## Resultado dos testes

```
Test Files  40 passed | 1 skipped (41)
Tests       394 passed | 2 skipped (396)
```

**Nenhuma regressão.**

## Aceite

- [x] Build do frontend e testes completos passando
- [x] Formulário salva rascunho com só nome+destino+data
- [x] Painel de pendências mostra corretamente o que falta
- [x] Publicação bloqueada quando falta campo obrigatório
- [x] Não há regressão visual ou de UX
- [x] Campo "Situação" visível apenas para admin
- [x] "Preparar publicação" abre por padrão ao editar
- [x] Estrutura em 4 blocos lógicos e progressivos
- [x] Padrões de apresentação globais para novas viagens
- [x] Prévia viva do card
- [x] Estado REVIEW privado e publicável apenas por administrador

---

**A Fase 2 está concluída. A próxima etapa planejada é a Fase 3: documentos e IA.**
