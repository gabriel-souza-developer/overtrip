# Verificação de compatibilidade da sandbox de PDF com o hardening do unit

## Para quem é isto

Quem for habilitar `overtrip-document-worker.service` (ou reavaliar
`overtrip-api.service`) em um host novo, antes de confiar na extração de
imagens de PDF em produção (`src/services/pdfEmbeddedImages.ts`). Por ora,
conforme `deploy/ORACLE_STATUS.md`, **o worker de documentos não está
habilitado em produção** — o uso de PDF depende de armazenamento, scanner e
worker ainda não preparados. Esta verificação é um passo recomendado antes
disso, não uma correção de algo já quebrado em produção hoje.

## O problema que isto investiga

A extração de imagens embutidas em PDF roda inteiramente dentro de sandboxes
próprias — `bwrap` (namespaces, drop de capabilities, uid/gid remapeados)
para o parser e para a decodificação, mais `systemd-run --user --scope -p
MemoryMax=…` para dar à decodificação um teto real de memória residente via
cgroup (ver os comentários de `assertSandboxAvailable` e
`assertMemoryIsolationAvailable` em `src/services/pdfEmbeddedImages.ts`).

Os dois units reais que executam esse código já trazem hardening próprio:

```
# deploy/overtrip-api.service e deploy/overtrip-document-worker.service
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
```

Uma análise independente, testando manualmente uma unidade transitória
`systemd --user` com essas mesmas diretivas, levantou duas preocupações:

1. **`bwrap` pode falhar ao criar seus próprios namespaces** quando o
   processo que o invoca já está sob `ProtectSystem=strict`,
   `ProtectHome=true` ou `PrivateTmp=true` — isoladamente, cada uma.
2. **`systemd-run --user --scope` só funciona com uma sessão de usuário
   ativa** (`XDG_RUNTIME_DIR` e `DBUS_SESSION_BUS_ADDRESS` apontando para um
   bus real) — algo que uma unidade de **sistema** típica, sem
   `loginctl enable-linger` para o usuário de serviço, não tem.

Se qualquer uma das duas for verdade no host de destino, a extração nunca
roda de verdade em produção: ela falha fechado com `SANDBOX_UNAVAILABLE` ou
`MEMORY_ISOLATION_UNAVAILABLE` (por desenho — ver os comentários dessas
funções). Isso é seguro (nunca um fallback mais fraco), mas também significa
que o recurso simplesmente não funciona até alguém perceber e investigar.
Este script existe para investigar isso **antes** de alguém ligar o worker
em produção, de forma reproduzível e seguro de rodar.

## O que o script faz

`scripts/check-sandbox-compat.sh` (via `npm run check:sandbox-compat`):

1. Confere que `bwrap`, `prlimit`, `systemd-run`, `pdfimages` e `node`/`tsx`
   existem e são executáveis — **fail closed** (sai com erro, nada mais é
   tentado) se faltar algo.
2. Cria unidades `systemd --user` **transitórias e descartáveis**
   (`--collect`) para testar `bwrap` sob cada uma das quatro diretivas do
   unit real, isoladamente, e depois as quatro juntas — exatamente os
   mesmos argumentos de `sandboxArgs()` em `pdfEmbeddedImages.ts`.
3. Testa `systemd-run --user --scope -p MemoryMax=…` com a sessão atual e,
   em seguida, com `XDG_RUNTIME_DIR`/`DBUS_SESSION_BUS_ADDRESS` removidas —
   o que uma unidade de sistema sem sessão veria.
4. Roda a cadeia **real** — `extractEmbeddedImages` +
   `processPdfCandidateSandboxed`, o mesmo código de produção, nunca uma
   reimplementação — contra um **PDF sintético gerado em memória a cada
   execução** (`scripts/lib/sandboxCompatProbe.ts`; nunca um documento real,
   nunca dados de cliente), dentro de uma unidade transitória com as quatro
   diretivas juntas.
5. Se executado como root (`sudo npm run check:sandbox-compat`), repete o
   passo 4 como unidade de **sistema** transitória (ainda descartável,
   ainda sem tocar o unit real) — uma aproximação mais próxima do domínio de
   privilégio real.
6. Aceita a sonda somente quando o processo retorna código zero **e** o relatório JSON contém sucesso. Cada chamada transitória tem limite de 40 segundos e encerramento forçado após mais cinco; a limpeza também é limitada. A ausência de gerenciador `--user` é reportada e, quando executado como root, não impede tentar a unidade de sistema.
7. Detecta caminhos reais em `/home`, `/root`, `/run/user`, `/tmp` e `/var/tmp`, que podem ficar ocultos por `ProtectHome` ou `PrivateTmp`; nesse caso a cadeia é marcada inconclusiva, sem atribuir a falha ao sandbox. Execute a partir de uma instalação acessível ao serviço.
8. Limpa tudo que criou (unidades transitórias, diretório temporário) ao
   terminar, inclusive se interrompido (`trap ... EXIT INT TERM`).

Nunca altera `deploy/*.service`, nunca instala nada, nunca lê ou grava fora
do seu próprio diretório temporário, nunca precisa (nem usa, exceto para a
aproximação opcional do passo 5) privilégio de root, e **nunca afrouxa**
nenhuma das quatro diretivas para "fazer passar" — se a sandbox real não
funciona sob elas, o script relata isso como incompatibilidade, não como
algo a corrigir removendo proteção.

## Como rodar

```sh
npm run check:sandbox-compat
```

Só a sonda da cadeia real (sem as unidades transitórias de systemd — útil
para depurar o driver em si, nunca como substituto da verificação completa):

```sh
npm run check:sandbox-compat:probe
```

Variáveis de ambiente opcionais (todas com o mesmo padrão de produção se
omitidas): `SANDBOX_CHECK_BWRAP_PATH`, `SANDBOX_CHECK_LIMITER_PATH`,
`SANDBOX_CHECK_SYSTEMD_RUN_PATH`, `SANDBOX_CHECK_PDFIMAGES_PATH`.

## Resultado observado neste host de desenvolvimento (não é produção)

Rodado em 2026-11-21, nesta sessão `--user` (bubblewrap 0.9.0, systemd 255,
`kernel.unprivileged_userns_clone=1`):

| Diretiva isolada           | `bwrap` cria namespace? |
|-----------------------------|:---:|
| nenhuma (linha de base)     | ✅ |
| `NoNewPrivileges=true`      | ✅ |
| `PrivateTmp=true`           | ❌ |
| `ProtectSystem=strict`      | ❌ |
| `ProtectHome=true`          | ❌ |
| as quatro juntas (= unit real) | ❌ |

`systemd-run --user --scope -p MemoryMax=…`: funciona com a sessão atual;
falha (`Failed to connect to bus: No medium found`) sem
`XDG_RUNTIME_DIR`/`DBUS_SESSION_BUS_ADDRESS` — exatamente o que uma unidade
de sistema sem `loginctl enable-linger` veria.

Resultado fim a fim (passo 4, cadeia real): `{"ok":false,"stage":"extract","code":"SANDBOX_UNAVAILABLE"}`.

**Isto confirma, de forma reproduzível, a preocupação levantada pela análise
independente — nesta máquina.** Isto **não é** uma validação de produção:

- Este host não tem a unidade real (`overtrip-document-worker.service` é um
  processo de **sistema**, `User=overtrip`, instalado por root em
  `multi-user.target`); aqui só existe uma aproximação `--user`, no mesmo
  uid que roda este terminal — um domínio de privilégio diferente.
- Não havia root disponível nesta sessão para tentar a aproximação de
  unidade de sistema (passo 5) — o script já relata isto explicitamente
  quando roda sem root, em vez de silenciar a lacuna.
- Kernel, versão do systemd, política de AppArmor e configuração de
  `unprivileged_userns_clone` variam entre hosts; o resultado acima **não
  deve ser extrapolado para a VM Oracle de produção** sem rodar esta mesma
  verificação lá.

## Se o resultado for "incompatível" no host de destino

**Não afrouxe** `ProtectSystem`, `ProtectHome`, `PrivateTmp` ou
`NoNewPrivileges` nos units reais para fazer a extração "funcionar" — isso
remove exatamente a proteção que esse hardening existe para dar, trocando um
recurso que falha fechado por um host com superfície de ataque maior.
Trate como um bloqueador de implantação deste recurso específico neste host:
registre o resultado (ex.: anexando a saída deste script a um apontamento em
`deploy/ORACLE_STATUS.md`, do jeito que esse arquivo já registra o que foi e
não foi validado) e leve para quem decide a arquitetura de implantação
decidir o próximo passo — por exemplo, um mecanismo de sandbox diferente, ou
isolar o worker de documentos num host/unit sem esse hardening específico.
Este script não prescreve qual delas: só prova, de forma repetível, se o
mecanismo atual funciona ou não neste host.

## Testes automatizados

`tests/sandbox-compat-probe.test.ts` cobre a parte pura/testável
(`scripts/lib/sandboxCompatProbe.ts`): a fixture sintética e o
mapeamento de cada `PdfImagesError` para o relatório (`ok`/`stage`/`code`),
incluindo os casos de sandbox real ausente — mesmo padrão de
`it.skipIf(!sandboxAvailable)` já usado em `tests/pdf-embedded-images.test.ts`
para o que exige `bwrap`/`systemd-run`/`pdfimages` reais. A parte que cria
unidades `systemd --user` transitórias não é exercida por esses testes (CI
não tem, em geral, um gerenciador `systemd --user` com sessão própria) —
ela só é verificada rodando o script de verdade, como descrito acima.

Os testes de `tests/sandbox-compat-shell.test.ts` usam executáveis simulados para verificar os códigos de saída, ausência de gerenciador de usuário, caminhos protegidos e aplicação de timeout, sem criar unidades reais.
