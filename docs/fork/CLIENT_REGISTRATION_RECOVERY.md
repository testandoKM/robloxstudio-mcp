# Cliente de Play e comparacao com o upstream 3.3.0

Data: 2026-10-19. Candidato: **3.2.2-fork.2**. Instalacao em uso: **3.2.2-fork.1**.

## Diagnostico

`CONFIRMADO`: o usuario relatou repetidos avisos de cliente ausente durante Play.
Na inspecao inicial, o lab tinha Edit, Server e Client; uma consulta somente
leitura a `client-1` confirmou `IsClient`, `IsRunning` e `LocalPlayer`. O Output
tambem continha `/ready metadata refresh timed out after 20 seconds`.

`CONFIRMADO` no codigo anterior: embora o fork abrisse o transporte principal
diretamente por WebSocket, `ClientBroker.registerProxyEntry` ainda aguardava
`HttpService.RequestAsync('/ready')`, sem prazo proprio. Uma chamada pendente
mantinha `registering=true` e impedia a tentativa seguinte. A atualizacao dos
metadados e a retirada de clientes tambem dependiam de HTTP.

`INFERENCIA`: essa dependencia pode explicar parte dos avisos anteriores.
Nao recuperamos a trilha completa de cada ocorrencia, portanto nao atribuimos
todos os relatos a uma unica causa. Um cliente ativo agora nao invalida uma
falha intermitente anterior.

## Correcao

- Registro e retirada de clientes passam pelo WebSocket do servidor de Play.
  Atualizacoes dos metadados usam esse canal no modo de registro do fork.
- Cada pedido tem resposta identificada, prazo de cinco segundos e limite
  de 128 pedidos pendentes; respostas antigas nao alteram a nova conexao.
- O broker preserva tentativas com atraso progressivo e registra novamente
  os clientes depois da reconexao. Uma resposta de geracao antiga nao libera
  nem sobrescreve uma tentativa nova.
- O servidor vincula o pedido ao dono real do socket. Preserva validacao de
  versao, papel e instancia/grupo; outro transporte nao pode assumir ou retirar
  um cliente. Mensagens de controle tem limite de 8 KiB e fila limitada.
- O controle de registro fica separado das escritas de ferramentas e de seus
  contratos de deduplicacao e resultado desconhecido. O fluxo HTTP legado do
  transporte continua disponivel para os consumidores que o usam.

## Validacao na VFX TEST

`CONFIRMADO`: `local/vfx-package-e1e9c2a8e953.json` terminou com `passed=true`,
`completed=true` e `installationPreserved=true`. Ensaio dirigido autorizado,
sem conta Windows adicional, sem instalacao e sem salvar/publicar o place.
Alvo: PlaceId `76624397270311`, GameId `10764893534`.

O pacote completo foi carregado temporariamente em Edit, Server e Client,
com paridade dos 45 fontes. Passaram edicao, deduplicacao, runtime eval nos
dois lados, MicroProfiler, reconexao e dois ciclos automaticos de Play/Stop.
Os Stops duraram 3990 e 5001 ms no ensaio.

No segundo ciclo, um proxy loopback do ensaio reteve a resposta HTTP de
`/ready`, mantendo WebSockets disponiveis. Uma chamada HTTP real do plugin
ficou retida. Mesmo assim, o cliente se registrou, executou comandos e voltou
apos reiniciar o CLI isolado. A consulta depois da reconexao confirmou cliente
real e `LocalPlayer`, ainda com a resposta HTTP retida. Isso valida a remocao
da dependencia; nao e uma medicao da fila interna do motor Roblox.

`HISTORICO`: duas preparacoes anteriores tentaram ocupar cinco chamadas HTTP.
Uma sexta chamada chegou ao listener; nao houve saturacao comprovada neste
ambiente. Esses ensaios foram recusados e limpos, sem serem apresentados como
aprovados. A preparacao final bloqueia diretamente o endpoint relevante.

O MCP oficial foi necessario para a preparacao temporaria com permissao
LocalUser, apos o KMCP recusar a alteracao de `HttpEnabled`. O CLI, transporte,
broker e ferramentas sob teste eram os do KMCP, sem simulacao do cliente.
A limpeza retornou a Edit, restaurou `HttpEnabled=false`, preservou as 15
raizes do Workspace e deixou zero fixtures `ForkVFX_`/`__ForkPackage_`.
Os hashes do plugin e CLI instalados permaneceram iguais.

Artefatos testados:

| Artefato | SHA-256 |
| --- | --- |
| `studio-plugin/MCPPlugin.rbxmx` | `c1a2161682b8deb78738be0923b27b5c979568138913423ef2d7e5d60f1ade72` |
| `packages/robloxstudio-mcp/dist/index.js` | `6b38feead4badbc0e1a3140cfb3f1477ad58a610cb53fd0f09cdc274d94c4c8f` |

Build dos tres pacotes, compilacao dos plugins principal/Inspector, verificacao
de empacotamento e testes do instalador em diretorios temporarios passaram.
Passaram **305 testes em nove suites**: transporte, registro por socket,
entrega de respostas, seguranca HTTP, servidor HTTP, controle de Play,
teardown, identidade de processos e direcionamento de runtime.
Lint: zero erros e 40 avisos preexistentes.

Repetir com `node scripts/fork/vfx-package-lab.mjs --vfx-directed --client-recovery`,
usando o controlador descrito em [FULL_PACKAGE_VALIDATION.md](FULL_PACKAGE_VALIDATION.md).
O proxy e as requisicoes retidas sao liberados no encerramento. O teste nao
substitui o gate integral de release, multiplayer ou o carregamento nativo do
arquivo instalado. **A versao nova ainda precisa ser instalada e recarregada
nas janelas antes de beneficiar as outras conversas.**

## Upstream 3.3.0

`CONFIRMADO`: o fetch do upstream trouxe a tag `v3.3.0`, commit `e81074b`,
publicada em 2026-10-18. As
[notas oficiais](https://github.com/Chrrxs/robloxstudio-mcp/releases/tag/v3.3.0)
e o diff local de `v3.2.1..v3.3.0` mostram:

- Edicoes de script em lote, revisao esperada e previa de alteracoes.
- Geracao de modelos assincrona e espera por status de operacoes.
- Movimento e rolagem do mouse.
- Busca de objetos limitada e protecao para caminhos com nomes duplicados.
- Compatibilidade de jobs/esperas com proxies de versao anterior.

Sao seis commits e 44 arquivos alterados. O upstream nao alterou ClientBroker,
PluginSession ou StudioWebSocket nesse intervalo; nao corrigiu a dependencia
HTTP do cliente. As correcoes de direcionamento de clientes da 3.2.1 ja faziam
parte da base do KMCP.

`DECISAO` de implementacao: manter as correcoes do fork e entregar esta recuperacao de
cliente separadamente. A 3.3.0 foi baixada para comparacao, **sem merge ou
instalacao**. Suas melhorias sao candidatas a uma integracao posterior com
testes dos novos contratos; trocar pelo pacote original descartaria as
correcoes especificas do KMCP.
