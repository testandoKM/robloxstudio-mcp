# Instalacao local do fork e validacao nativa na VFX TEST

Data local: 2026-10-14. Versao: `3.2.2-fork.1`.

`DECISAO`: o usuario autorizou instalar o fork, preservar a versao atual em
backup e testar carregamento e Play/Stop na VFX TEST antes de usar no projeto
principal. Nao criar outra conta Windows. Nenhum push ou salvamento/publicacao
de place foi autorizado nesta etapa.

## Backup e instalacao confirmados

`CONFIRMADO`: backup em
`local/install-backup-2026-10-15T00-53-51-542Z/`, ignorado pelo Git. Inclui a
pasta Plugins, a instalacao completa `ChrrxsMCP-3.2.0`, a configuracao do Codex,
settings dos plugins locais e settings do Studio. `manifest.json` registra
SHA-256 de 2.374 arquivos; `critical-manifest.json` destaca os arquivos
essenciais. Configuracoes pessoais e credenciais nao sao versionadas.

Baseline preservado:

| Arquivo | SHA-256 |
| --- | --- |
| Plugin 3.2.0 | `4a66254178ecc3e64fd9463d26ac405bfa2eb726aafb3bd374ec17d33595272b` |
| CLI 3.2.0 | `3aadc948a64b99a883d152d0d2ba9161e43f22e6bf681a342051c587704b4ae0` |

O pacote foi empacotado do worktree e instalado com scripts npm desativados
em `%LOCALAPPDATA%/Roblox/ChrrxsMCP-3.2.2-fork.1/`. A pasta antiga permanece
preservada. O instalador `--install-bundled-plugin` copiou o artefato exato do
pacote para `%LOCALAPPDATA%/Roblox/Plugins/MCPPlugin.rbxmx`.

Foi usada a configuracao suportada `ROBLOX_STUDIO_PORT=58742`, separada da
conexao antiga em 58741 que atendia o lab aberto. O instalador altera somente
a porta e suas chaves de URL lembrada no XML; a igualdade com essa
transformacao do artefato original foi conferida. O Codex aponta para o novo
CLI, com loopback `127.0.0.1`, a mesma porta e `tool_timeout_sec=180`, preservando
os demais campos. Configuracao TOML validada por parser. O timeout externo
comporta a observacao de teardown de ate 120 segundos do core.

| Arquivo instalado | SHA-256 |
| --- | --- |
| Plugin configurado para 58742 | `c957eda2f852221d0c07a93ab9acbbd485d87d193eedbe839eaea0e1f6103647` |
| CLI do fork | `f8336ddcaf1b807102c76ab3296e92e932bab6b9e20eee8e18a9068302b34f16` |

## Carregamento nativo

`CONFIRMADO`: o CLI instalado iniciou em modo primary, anunciou a versao
correta e 49 tools por MCP stdio. Sua opcao `--auto-install-plugin` preservou
o mesmo artefato configurado. A tentativa de abertura automatica nao confirmou
lancamento; a consulta de processos/registro nao encontrou nova janela. O
usuario fechou e reabriu somente a VFX TEST para testar a carga por arquivo.

A VFX TEST reconectou como `instance:gpo-eys`, com
`PlaceId=76624397270311`, `GameId=10764893534`; o conteudo inclui SlashParts,
Hit4 e as mesmas 15 raizes de Workspace registradas no ensaio anterior.
O plugin carregado em
`PluginDebugService.user_MCPPlugin.rbxmx.MCPPlugin` anunciou a versao correta,
criou DockWidgetPluginGui e nao possui `MCPIsolationScope`.

Os 45 Sources foram comparados por SHA-256 depois de normalizar CRLF para LF.
O loader nativo preserva CRLF em literais multiline de EvalBridges, enquanto
o parser XML usado na comparacao normaliza essas quebras. A comparacao
normalizada passou em todos os fontes; nenhuma fonte foi substituida em
memoria. A VFX iniciou em Edit pronto, sem chamada nativa pendente e com
HttpEnabled=false.

## Play/Stop e encerramento

`CONFIRMADO`: dois ciclos consecutivos de Play/Stop foram enviados pelo CLI
instalado. Server e Client registraram automaticamente. No primeiro ciclo,
os 45 fontes carregados em cada VM conferem e execucao Luau e eval de runtime
passaram nos dois lados. O segundo inicio terminou em 19.271 ms e confirmou
novamente execucao Server/Client.

| Ciclo | Stop confirmado | Estado final nativo |
| --- | --- | --- |
| 1 | 3.082 ms | EditModeActive=true, chamada pendente=false |
| 2 | 4.971 ms | EditModeActive=true, chamada pendente=false |

Cada Stop foi enviado uma unica vez. O segundo Play somente foi enviado
depois da confirmacao nativa de encerramento do primeiro.

O controle de reinicio do helper excedeu seu timeout e perdeu o processo
temporario. Uma nova consulta encontrou o CLI instalado gerenciado pelo
Codex em 58742; o plugin reconectou com o mesmo instance e peer Edit.
Um novo cliente MCP stdio do pacote instalado confirmou versao e consulta
da VFX, seguido de execucao Luau e leitura do estado nativo. Isso confirma
recuperacao da conexao apos a interrupcao; o timeout do helper nao e um
resultado aprovado do gate gerenciado de lifecycle.

O Output tem erros de componentes ja presentes: FishCatalogStudio2 depende
de GameShared, ausente na VFX; Workspace.SLASH_PLUGIN_TEST:75 tenta usar
CreateToolbar em um Script do jogo. As stacks apontam para esses componentes,
sem erro atribuido ao fork nas consultas feitas. Nenhum deles foi alterado.

`CONFIRMADO`: `local/vfx-installed-validation.json` terminou com `passed=true`.
O estado final tem as mesmas 15 raizes de Workspace, HttpEnabled=false,
Edit pronto, nenhuma chamada nativa pendente e nenhum fixture dos ensaios
anteriores. Nao houve bootstrap/substituicao de Source, salvamento/publicacao
do place ou uso do lab para os testes. O hash do plugin instalado permaneceu
igual depois da reinicializacao automatica do CLI.

## Nome publico KMCP

`DECISAO` - 2026-10-15: o usuario escolheu KMCP como nome publico. O artefato
foi recompilado com esse nome na barra, no botao, no titulo da janela e no
cabecalho. A variante de leitura usa KMCP Inspector. A interface identifica
testandoKM e mantem o credito ao Chrrxs; LICENSE nao foi alterado.

`CONFIRMADO`: antes da troca, os artefatos anterior, instalado e bundled
foram preservados em `local/name-backup-2026-10-15T03-04-37.214Z/`.
A copia bundled do CLI instalado e o arquivo na pasta Plugins foram
atualizados, para que o auto-install tambem preserve o novo nome.

| Artefato KMCP | SHA-256 |
| --- | --- |
| Modelo sem configuracao de porta | `5b4878d2f4e576fe4ca657eb7cbd4e5de7464a30787e89819e38ea171387f918` |
| Plugin instalado para 58742 | `93c98261943ccd98ddb8c7761e0cf133a74c6e4e22507768ff8e89cd7877e65c` |

A versao continua `3.2.2-fork.1`. Dos 45 fontes empacotados, somente o
entrypoint (textos da toolbar) e UI mudaram; os demais conferem com a copia
anterior. O hash do CLI permanece igual ao da instalacao original acima.
Os nomes tecnicos MCPPlugin.rbxmx, pacote npm, widget, settings e protocolo
foram preservados por compatibilidade.

Compilacao roblox-ts, geracao de ambos os modelos, verificacoes de conteudo
dos pacotes e flags/caminhos de instalacao dos CLIs passaram. Depois da
troca, consultas get_place_info do lab e da VFX TEST responderam normalmente.
Nenhum script ou mapa do jogo foi editado e nenhuma janela foi reiniciada.
O nome novo no Studio depende da proxima carga do plugin; a UI nova ainda
nao foi conferida visualmente em uma janela reaberta. Evidencia detalhada
local em `local/kmcp-name-validation.json`.

## Ativacao e limites

O arquivo instalado e a configuracao de novas conexoes apontam para o fork.
`HISTORICO`: a janela do lab e as conexoes antigas ja abertas permaneceram em
58741 com 3.2.0 durante a validacao da VFX. Para usar o fork em uma janela
antiga, reabra o Studio depois de preservar o trabalho aberto. Um cliente Codex ainda ligado
ao processo antigo precisa reiniciar somente a conexao robloxstudio; nao e
necessario mudar a porta novamente. Nao encerrar indiscriminadamente os
processos antigos, pois podem atender outras conversas.

### Principal apos reiniciar o lab

`CONFIRMADO` - 2026-10-14, horario local: depois de o usuario reiniciar o lab,
o principal conectou como `instance:ly0-2q5`, peer Edit `peer:0ua-vls`, no
servidor 58742. Plugin carregado e servidor anunciam `3.2.2-fork.1`.
PlaceId=12945539369 e GameId=4528135208 foram conferidos junto do conteudo
FishSystem, GameServer, Player_Base e Tropical_Island. Os hashes do plugin
instalado e do CLI continuam iguais aos registrados acima.

Cinco consultas temporizadas `get_place_info`, ao longo de 149 segundos,
passaram sem falha: 194-233 ms, media de 206 ms. As consultas pelo conector
MCP do Codex tambem responderam. Em todas as amostras havia transporte ativo,
nenhuma requisicao pendente e o mesmo registro de conexao do principal.
As consultas filtradas de Output nao encontraram avisos do MCP.

A conferencia usou somente leitura, sem `require`, remotes ou bindables,
sem editar scripts/mapa e sem iniciar Play ou retomar Script Sync. O lab
permaneceu em Edit, com as mesmas 178 raizes de Workspace no inicio e no fim.
Evidencia local: `local/main-fork-stability-2026-10-15T02-56-10.055Z.json`.
Esse resultado confirma conectividade em Edit durante a amostragem; nao
valida Play/Stop no principal nem garante estabilidade por tempo indefinido.

O teste dirigido na VFX foi aprovado antes de usar o projeto principal.
O ensaio dirigido nao substitui os gates integrais de release do perfil
dedicado em [tests/README.md](../../tests/README.md). A validacao anterior em
memoria permanece em [FULL_PACKAGE_VALIDATION.md](FULL_PACKAGE_VALIDATION.md).

Referencia para os campos de configuracao MCP do Codex:
[documentacao oficial](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
