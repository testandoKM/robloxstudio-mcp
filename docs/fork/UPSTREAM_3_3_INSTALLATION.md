# KMCP 3.3.0-fork.1: integracao e instalacao local

Data: 2026-10-19.

`DECISAO`: o usuario autorizou incorporar a atualizacao do Chrrxs, fazer
backup, instalar a correcao do cliente e validar carregamento nativo e
Play/Stop na VFX TEST antes de usar no principal. Nao editar scripts nem mapa,
nao criar conta Windows e nao publicar o place.

## Composicao

`CONFIRMADO`: merge da tag upstream `v3.3.0` (`e81074b`) sobre o KMCP
`92c4ec9`, com versao conjunta `3.3.0-fork.1`. Os conflitos textuais eram
somente os campos de versao dos manifests e lockfile.

Foram preservados o nome KMCP, o registro por WebSocket, o controle limitado
de chamadas pendentes, a protecao de ownership da sessao de Play e a
[correcao de registro do cliente](CLIENT_REGISTRATION_RECOVERY.md).

O upstream acrescenta edicoes multiplas de scripts com revisao esperada e
dry-run, protecao contra caminhos ambiguos, filtros/limites de busca,
geracao assincrona de modelos e melhorias de input virtual. Origem:
[release 3.3.0](https://github.com/Chrrxs/robloxstudio-mcp/releases/tag/v3.3.0).
Nenhuma dessas ferramentas foi usada para editar o jogo nesta instalacao.

## Backup e isolamento

`CONFIRMADO`: backup privado em
`local/upgrade-backup-2026-10-19T17-23-41.889Z/`, ignorado pelo Git.
O manifesto verifica SHA-256 de 2.371 arquivos: Plugins, pacote
`ChrrxsMCP-3.2.2-fork.1`, configuracao do Codex e InstalledPlugins.
Credenciais e configuracoes pessoais nao sao versionadas.

O pacote novo foi instalado em `ChrrxsMCP-3.3.0-fork.1`, com scripts npm
desativados. A pasta da versao anterior permanece preservada.
O lab estava em Play na conexao antiga no inicio da task; nao foi parado
nem usado para os testes. A porta de uso diario permanece 58742.

## Verificacao e estado

`CONFIRMADO`: builds do core, dos dois CLIs e dos dois plugins passaram.
Lint terminou com zero erros e 40 avisos preexistentes. Verificacoes de
conteudo dos pacotes e instaladores relocados de ambas as variantes passaram.
A suite de seguranca de assets passou (4 testes).
O core passou com 64 suites, 1.167 testes aprovados e 13 ignorados, usando
dois workers. A primeira execucao foi interrompida para reduzir concorrencia;
o resultado aprovado e da execucao completa posterior. Os testes de
isolamento de portas tambem passaram.
O conjunto offline do runner passou, incluindo os fixtures de instalacao,
credenciais, reparo, cache, limpeza e retencao de artefatos; esses fixtures
nao criaram uma conta Windows nem abriram uma sessao de Studio.

`CONFIRMADO`: arquivo instalado igual ao bundle transformado somente para a
porta 58742; CLI instalado identico ao build. O CLI instalado iniciou em
primary isolado e anunciou 3.3.0-fork.1 e 49 ferramentas, incluindo os campos
novos de busca e edicao da 3.3.0.

| Artefato | SHA-256 |
| --- | --- |
| Plugin sem configuracao de porta | `3086808be15a7c51a875d810dfe625208d517f8daa9afb87642795d90a4e937b` |
| Plugin instalado, porta 58742 | `b26611e78a6fae020acd766f1efae34f3b494694fdbd9958bf720bc50dec8af3` |
| CLI instalado | `bda3105c52dabf9412b5a527e52dbcb7540f7f01fa72cf853b3422e811439701` |

Uma primeira conferencia detectou que o arquivo tinha voltado ao hash da
3.2.2-fork.1 e a janela ainda carregava essa versao. O CLI antigo configurado
com auto-install pode repor seu bundle ao iniciar. O caminho da conexao
`robloxstudio` foi atualizado para o novo pacote e o arquivo foi reinstalado.
O TOML foi validado por parser: somente o caminho do primeiro argumento mudou;
porta, demais campos e credenciais foram preservados. Uma copia adicional
`config-before-activation.toml` foi salva no backup antes dessa troca.
Referencia: [configuracao MCP do Codex](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
Processos antigos nao foram encerrados a forca. A ativacao do listener de
uso diario foi conferida separadamente ao final, conforme registro abaixo.

A VFX TEST foi confirmada pelo PlaceId `76624397270311`, GameId `10764893534`
e conteudo. Antes da instalacao, estava em Edit, com HttpEnabled=false,
23 scripts registrados por hash e 883 descendentes de Workspace registrados
por caminho/classe. Snapshot privado: `local/native-upgrade-game-before.json`.

## Carregamento nativo e dois Play/Stop

`CONFIRMADO`: depois da reabertura, o carregador nativo apresentou
`PluginDebugService.user_MCPPlugin.rbxmx.MCPPlugin`, versao 3.3.0-fork.1 e
`PluginScope.isolated=false`. Os 49 Sources conferiram por SHA-256 com o
arquivo instalado em Edit, Server e Client (normalizacao CRLF/LF).
Nenhum Source foi substituido em memoria e nenhum bootstrap foi criado.

Somente a conexao da VFX foi apontada temporariamente para o CLI instalado,
rodando em primary isolado, para preservar o listener antigo do principal.
As chamadas MCP de Play/Stop e as consultas Server/Client usaram esse CLI.
O MCP oficial foi usado para conferir o loader e selecionar a conexao quando
a nova janela ainda nao estava acessivel pelo listener KMCP antigo.

Dois ciclos consecutivos de Play/Stop automaticos passaram. Servidor e
`client-1` apareceram nos dois inicios e o cliente respondeu a execucao Luau.
O segundo inicio levou 9.581 ms. Os Stops levaram 6.925 ms e 5.677 ms,
incluindo o controlador; cada Stop foi enviado uma unica vez. Antes do
segundo inicio e ao final, `EditModeActive=true` e
`playtestTaskPending=false` foram conferidos no estado nativo.

Os hashes dos 23 scripts e a lista ordenada dos 883 descendentes de Workspace
permaneceram identicos, inclusive na comparacao apos reabrir o place.
HttpEnabled permaneceu false. Nenhum script, mapa, fixture persistente,
salvamento/publicacao de place ou teste no lab foi feito. O Output apresentou
os erros conhecidos de FishCatalogStudio2/GameShared e SLASH_PLUGIN_TEST,
avisos internos do Roblox e uma consulta de auditoria com caminho incorreto,
posteriormente corrigida; nenhuma falha dos ciclos foi atribuida ao KMCP.

Evidencias privadas: `local/native-upgrade-validation.json`,
`local/native-upgrade-{edit,server,client}.json`, snapshots antes/depois e
logs dos ciclos. Essa validacao confirma funcionamento nativo e disponibilidade
do cliente nos ciclos observados; nao garante ausencia de toda falha futura.

## Encerramento e ativacao

`CONFIRMADO`: VFX voltou a Edit sem chamada pendente. Sua URL e a URL lembrada
foram restauradas para `http://localhost:58742`. O controlador e o CLI isolado
foram encerrados. A porta temporaria do teste nao e a configuracao de uso diario.

Durante a transicao, o listener antigo ainda anunciava 3.2.2-fork.1 e a VFX
nova reportou `WebSocket error 400`. A configuracao foi recarregada pelo app;
nao foi necessario matar processos. A consulta final confirmou o listener
3.3.0-fork.1 em 58742, processo do novo pacote, zero requisicoes pendentes,
e a VFX respondeu pela conexao normal `robloxstudio`, com plugin 3.3.0-fork.1,
URL restaurada, Edit pronto e sem chamada de Play pendente. O hash do arquivo
instalado permaneceu igual ao registrado acima.

**Limite no principal:** a janela do lab preservada ainda carrega o plugin
3.2.2-fork.1 em Edit, confirmado somente por leitura do Source do modulo de
versao (PlaceId 12945539369, GameId 4528135208, 178 raizes de Workspace).
Para carregar o novo plugin no principal, preservar o trabalho aberto e
reabrir essa janela quando conveniente. Nao declarar a janela antiga
atualizada: ela nao foi fechada, editada nem usada para Play/Stop desta task.

O ensaio dirigido nao equivale aos gates integrais de release com perfil
Windows dedicado. As evidencias historicas da versao anterior permanecem em
[LOCAL_INSTALLATION.md](LOCAL_INSTALLATION.md).
