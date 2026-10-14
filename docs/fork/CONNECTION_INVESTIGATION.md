# Investigacao inicial da conexao

Data: 2026-10-14. Horarios deste documento: America/Sao_Paulo.

## Objetivo e estado do projeto

`DECISAO`: criar um fork separado, comparar a instalacao de uso diario com o original atual e investigar o travamento antes de substituir o plugin ou alterar o jogo.

`CONFIRMADO`: fork criado em <https://github.com/testandoKM/robloxstudio-mcp>. `origin` aponta para o fork e `upstream` para Chrrxs. A branch de trabalho e `codex/connection-investigation`, baseada na release atual `v3.2.1`.

| Base | Versao | Commit |
| --- | --- | --- |
| Pacote e plugin instalados | 3.2.0 | Tag original `08c25c1ef5c7b4c990bc222029ac8d9109396f2a` |
| Release atual e base do fork | 3.2.1 | `1383d305ee91a4ab5903b1af543c27f01bb58022` |

O commit da instalacao e identificado pela tag correspondente a versao do pacote; nao e uma afirmacao de reproducibilidade binaria de todo o bundle.

## Evidencia da instalacao e do travamento

`CONFIRMADO` por leitura do pacote, hashes e `/health`:

- Servidor e plugin reportam `3.2.0`; o arquivo instalado do plugin e identico ao distribuido pelo pacote instalado.
- SHA-256 do plugin: `4a66254178ecc3e64fd9463d26ac405bfa2eb726aafb3bd374ec17d33595272b`.
- SHA-256 do bundle do servidor instalado: `3aadc948a64b99a883d152d0d2ba9161e43f22e6bf681a342051c587704b4ae0`.
- Um unico listener MCP em `127.0.0.1:58741` na faixa inspecionada 58741-58750. Quatro processos Node do pacote instalado e um processo Studio foram observados.
- As conexoes TCP persistentes com o listener pertenciam aos outros tres processos Node; nao havia transporte WebSocket do Studio ativo na coleta.

`CONFIRMADO`: tres amostras consecutivas, coletadas as **17:56:05, 17:56:17 e 17:56:29**, mostraram:

| Campo | Resultado nas tres amostras |
| --- | --- |
| `pluginConnected` | `true` |
| `mcpServerActive` | `true` |
| `peerCount` | `1` |
| `activeWebSockets` | **`0`** |
| `pendingRequests` antes da consulta | `0` |
| Place e modo registrados | lab, `12945539369`, Edit |

Uma consulta somente leitura `get_place_info`, enviada diretamente ao servidor principal depois dessas amostras, retornou HTTP 500 em aproximadamente **2,96 segundos**:

```text
request_disconnected
stage: queued
outcome: not_executed
executionOutcome: not_executed
```

Isso confirma falha tambem no caminho HTTP direto ao principal; o sintoma nao esta restrito ao encaminhamento de uma sessao MCP secundaria.

`HISTORICO` da analise imediatamente anterior, na mesma conversa: `get_connected_instances` listou o lab, mas `get_place_info` terminou apos cerca de 30 segundos com `request_timeout`, `queued` e `not_executed`.

`CONFIRMADO`: o codigo de `/health`, nas duas tags, calcula `pluginConnected` pela existencia de peers registrados. O registro `/ready` ocorre antes da abertura do WebSocket. Portanto, esse campo isolado nao comprova que o Studio recebe comandos.

`INFERENCIA`: a sessao esta repetindo registro/abertura de transporte, ou perdendo esse transporte antes de conseguir consumir comandos. A coleta confirma ausencia do canal e registros recentes; **nao identifica a causa da falha de abertura**. A mudanca de timestamps e a alternancia entre timeout e desconexao sao consistentes com registro seguido de expiracao.

`CONFIRMADO` por leitura de `packages/core/src/server.ts`: o modelo de varias sessoes usa um principal na porta fixa e proxies para as demais sessoes. A funcao generica `listenWithRetry` aceita portas alternativas, mas o startup chama essa funcao com apenas uma tentativa. Os quatro processos observados nao comprovam processos abandonados ou conflito de porta; nao foram encerrados.

## O que mudou na 3.2.1

`CONFIRMADO` por `git diff v3.2.0..v3.2.1` e [release original](https://github.com/Chrrxs/robloxstudio-mcp/releases/tag/v3.2.1):

1. **Conexoes abertas que param de responder.** A 3.2.0 atualiza a atividade do peer ao emitir seu heartbeat, sem exigir resposta. A 3.2.1 envia ping nativo, atualiza atividade ao receber pong e fecha o socket apos 30 segundos sem resposta. Isso evita manter indefinidamente um socket aberto e inutilizavel.
2. **Encerramento de Play bloqueado por HTTP.** A 3.2.1 registra a desconexao pelo proprio WebSocket e espera no maximo dois segundos pelo fechamento. Na falta do canal, o fallback HTTP ocorre em outra thread. O encerramento deixa de depender de uma requisicao HTTP que pode ficar presa atras das cinco vagas do Studio.
3. **Inicializacao e estado de Play.** Estado JSON passa de atributos para StringValues em CoreGui, evitando o limite de strings de atributos em NextGenerationReplication. Falhas numa etapa de inicializacao nao impedem todas as etapas seguintes.
4. **Outras correcoes preservadas.** Roteamento para o cliente/servidor indicado por `instance_id` e observacao de lancamento no Windows. Elas fazem parte da base atual, mas nao foram tomadas como causa deste problema de Edit.

`HISTORICO`: o log do Studio inspecionado continha **25.213** ocorrencias de `past shutdown deadline` envolvendo `MCPPlugin`. Os ultimos exemplos eram das **15:47:50**, sobretudo callbacks de `RuntimeLogBuffer` e `Communication`. Isso indica problemas de encerramento anteriores e justifica revisar a correcao de Play, mas nao prova que esse encerramento causou a falha de transporte atual. O log bruto ficou fora do repositorio.

## Verificacoes e ferramentas entregues

- `scripts/fork/connection-snapshot.mjs`: coleta campos permitidos de `/health`, identifica `registered_without_transport`, compara hashes e permite uma unica consulta opcional `get_place_info`. Aceita somente destino HTTP loopback. O token fica apenas em memoria; snapshots ficam em `local/`, ignorado pelo Git.
- `scripts/fork/compare-transport-regression.mjs`: executa dois casos existentes do original contra o transporte das duas tags. Usa copias temporarias ignoradas pelo Git e as remove ao terminar. Confere que o bridge e identico entre as tags, que os casos realmente chegam as assercoes e que o transporte atual passa primeiro.

`CONFIRMADO` no comparativo offline:

| Caso do original | Transporte 3.2.0 | Transporte 3.2.1 |
| --- | --- | --- |
| Desregistrar peers pelo frame `disconnect` | Falha esperada | Passou |
| Manter peer responsivo e remover socket aberto sem resposta | Falha esperada | Passou |

Esses resultados comprovam as diferencas nos cenarios simulados; **nao comprovam recuperacao no Studio deste computador**.

`CONFIRMADO`: as suites completas `studio-transport`, `studio-connection-diagnostics` e `studio-response-delivery` passaram: **105 testes em 3 suites**, em cerca de 36 segundos. Os dois scripts novos tambem passaram na verificacao de sintaxe. Nenhum gate E2E com Studio foi executado nesta etapa.

Comandos para repetir:

```powershell
node scripts/fork/connection-snapshot.mjs --samples 3 --interval-ms 12000 --probe --output local/connection-snapshot.json
node scripts/fork/compare-transport-regression.mjs
npm test -w packages/core -- --runInBand --runTestsByPath src/__tests__/studio-transport.test.ts src/__tests__/studio-connection-diagnostics.test.ts src/__tests__/studio-response-delivery.test.ts
```

## Proximo trabalho recomendado

1. Preparar servidor e plugin 3.2.1 num ambiente Studio isolado, confirmar os hashes e testar Edit, desconexao/reconexao e Play/Stop pelos gates pertinentes de `tests/README.md`.
2. Capturar de forma segura o estagio e a categoria da falha de abertura do WebSocket. O plugin hoje reduz certas falhas nativas a mensagens genericas para nao expor credenciais; o diagnostico precisa preservar essa protecao.
3. Melhorar o contrato de saude para distinguir cadastro, canal aberto e comando respondido. A 3.2.1 ainda calcula `pluginConnected` por cadastro, e a correcao de ping/pong so opera depois que um socket abriu.
4. Definir recuperacao com limites mensuraveis, incluindo reconexao apos reinicio do principal e competicao entre sessoes, preservando deduplicacao de escritas. Uma operacao com resultado desconhecido nunca deve ser repetida automaticamente.

## Limites desta etapa

Nenhuma alteracao de producao foi feita nos fontes originais do transporte ou plugin. A instalacao de uso diario e a configuracao MCP nao foram substituidas, nenhum processo foi encerrado e nenhuma sessao Play foi iniciada. Catch & Clean e Script Sync ficaram fora das escritas. As evidencias locais nao foram publicadas. O fork remoto contem a base original; os novos registros e ferramentas sao trabalho local ate um push autorizado.
