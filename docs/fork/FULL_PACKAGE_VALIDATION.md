# Validacao funcional do pacote completo na VFX TEST

Data: 2026-10-14. Versao: `3.2.2-fork.1`.

`DECISAO`: o usuario pediu a validacao do pacote completo na VFX TEST, sem
criar outra conta Windows e sem alterar a instalacao atual. O ensaio usa
somente a janela existente, `PlaceId=76624397270311`, `GameId=10764893534`.
Nao instala arquivos, nao abre outro Studio, nao salva/publica o place e nao
faz push. Os gates de instalacao e lancamento do perfil dedicado continuam
separados; este procedimento nao remove suas protecoes.

## Resultado confirmado

`CONFIRMADO`: `local/vfx-package-5c2ddb52dedc.json` terminou com codigo zero,
`completed=true` e `passed=true`. O servidor CLI real do fork foi iniciado sem
flags de instalacao, em porta loopback exclusiva, com autenticacao aleatoria
mantida em memoria e registro de processos dentro de `local/`. As chamadas
usaram MCP stdio, incluindo inicializacao do protocolo e listagem de 49 tools.

O pacote inteiro foi carregado em Edit e nos contextos reais Server/Client
de dois ciclos consecutivos de Play. Em cada carga foram conferidos os 45
fontes do artefato: entrypoint e 44 ModuleScripts, incluindo os 40 modulos do
plugin, tres bibliotecas de runtime e o pacote services.

Passaram:

- Interface nativa `DockWidgetPluginGui`, versao e identidade de sessao.
- Consulta do place, criacao de objetos temporarios, alteracao de propriedade,
  escrita/leitura de Source e repeticao segura de operation_id sem duplicar
  a escrita.
- Reinicio do servidor MCP na mesma porta e reconexao do plugin, seguida de
  nova consulta pela identidade preservada.
- Inicio automatico pelo controle real do fork, registro do servidor e do
  cliente pelo broker real e execucao Luau nos dois peers.
- `eval_server_runtime` e `eval_client_runtime` pelos bridges reais do jogo,
  incluindo require do ModuleScript editado anteriormente.
- MicroProfiler no cliente pelo MCP/broker: backend compativel e pronto,
  snapshot de 3284768 bytes e dois frames analisados. A biblioteca LibMP
  empacotada foi realmente executada.
- Dois Stops pelo proprio fork, com retorno nativo a Edit e nenhuma execucao
  anterior pendente antes do proximo inicio.
- Output filtrado pelo escopo sem novos erros do ensaio. Erros anteriores do
  FishCatalogStudio na VFX TEST nao foram atribuidos ao fork.

Os intervalos observados de Stop foram 96112 ms e 120367 ms. Incluem entrega
ao controlador e confirmacao externa de Edit; nao sao medicoes exclusivas do
motor nem do deadline interno do MCP. O inicio tem prazo de 180 segundos
neste carregador para incluir a entrega artificial dos fontes de runtime;
o padrao de inicio do produto permanece em 60 segundos.

## Isolamento do pacote

`PluginScope` permite um atributo opcional `MCPIsolationScope` no Script raiz,
com 1 a 48 letras, digitos ou underscores. Sem o atributo, os identificadores
e o objeto nativo de settings permanecem iguais aos anteriores.

Com o escopo do ensaio, ficam separados o identificador em CoreGui, a chave de
topologia em test args, o RemoteFunction do broker, scripts/bindables de eval,
o widget/toolbar e as chaves de settings. A copia isolada tambem nao executa
a limpeza de atributos legados do plugin instalado. Os settings continuam
usando GetSetting/SetSetting nativos, sem simular acknowledgements.

Separar os test args e necessario: a copia instalada tambem carrega durante
Play e nao deve adotar a identidade/endereco do fork. A versao instalada nao
foi desativada, substituida ou editada.

O carregador `scripts/fork/vfx-package-lab.mjs` le o `.rbxmx` construido e
recria sua arvore em objetos Plugin nativos temporarios criados por
`PluginManager:CreatePlugin`. Um bootstrap apenas vincula `plugin` e `script`
ao contexto temporario e executa o entrypoint original. Nao substitui
PluginSession, handlers, UI, ClientBroker, StopPlayMonitor ou transporte.

LibMP tem cerca de 5 MB e excede o limite de atribuicao de Source do Studio.
Ela e clonada somente para leitura da copia ja carregada quando o SHA-256
nativo, calculado por EncodingService, coincide com o fonte do artefato.
Nao ha fallback para uma biblioteca diferente ou para omiti-la.

Para permitir a limpeza deterministica do contexto temporario, o pacote
agora expoe desconexao do observador de sessao, do RenderStepped e do Output.
O Unloading normal tambem chama essas rotinas. A identidade persistente usada
para reload do plugin normal continua preservada.

## Limpeza e arquivos preservados

`CONFIRMADO`: todos os objetos temporarios do ensaio foram removidos, o
Workspace manteve os mesmos nomes/classes e `HttpEnabled` voltou de `true`
temporario para seu valor original `false`. A auditoria final encontrou zero
descendentes com nomes `ForkVFX_` ou `__ForkPackage_`, e confirmou prontidao
nativa de Edit. O servidor e o controlador locais terminaram.

Os hashes antes/depois da instalacao permaneceram iguais:

| Arquivo instalado | SHA-256 |
|---|---|
| `MCPPlugin.rbxmx` 3.2.0 | `4a66254178ecc3e64fd9463d26ac405bfa2eb726aafb3bd374ec17d33595272b` |
| Servidor 3.2.0 `dist/index.js` | `3aadc948a64b99a883d152d0d2ba9161e43f22e6bf681a342051c587704b4ae0` |

O artefato e o servidor testados tambem coincidem com os builds finais:

| Artefato do fork | SHA-256 |
|---|---|
| `studio-plugin/MCPPlugin.rbxmx` | `fc609a52190479b68f3130235b437620006899926448c3af79ba6e52f534242d` |
| `packages/robloxstudio-mcp/dist/index.js` | `f8336ddcaf1b807102c76ab3296e92e932bab6b9e20eee8e18a9068302b34f16` |

134 testes focados passaram: escopo/defaults, identidade de processos,
StopPlayMonitor, controle de Play e entrega/repeticao de respostas. Build dos
tres pacotes e compilacao do plugin como artefato passaram. Lint: zero erros
e os mesmos 40 avisos preexistentes de `any`.

## Repeticao e limites

Executar `node scripts/fork/vfx-package-lab.mjs --vfx-directed` somente com
autorizacao e um controlador MCP ativo para essa VFX TEST. O protocolo usa
`local/vfx-package-control-request.json` e `vfx-package-control-reply.json`,
com `{callId,ok,result,error}` e alvo explicitamente validado. `ok` indica a
execucao do comando, nao substitui o status retornado por um handler.

Usar Chrrxs para consultas/controle em Edit. A atribuicao dos fontes exige o
MCP oficial com permissao de Source; a entrega de runtime seleciona as VMs
Server/Client explicitamente. `wait-runtime` apenas observa o Play iniciado
pelo fork, sem chamar o Play do MCP oficial. Em falha, reconciliar antes de
repetir; `cleanup-play` nao reenvia EndTest se Stop ja foi solicitado. Nao
destruir uma copia com chamada nativa pendente.

`HISTORICO`: preparacoes anteriores nao foram aprovadas integralmente:
limite de Source da LibMP, comparacao exata de float no helper, prazo curto
para entregar o runtime e uso do campo `success` em um resultado de profiler
cujo contrato usa `ok`. A limpeza dessas execucoes foi reconciliada; seus
relatorios ficam em `local/`, sem substituir a evidencia da execucao final.

Este e um ensaio funcional do pacote inteiro executado em memoria. Nao
certifica instalacao, auto-load nativo por arquivo, atualizacao, todas as 49
tools, variante inspector, multiplayer ou a suite integral de release. Esses
gates continuam distintos e nao foram apresentados como executados.
