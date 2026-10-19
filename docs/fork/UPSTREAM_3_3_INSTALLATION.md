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
Processos antigos nao foram encerrados e a versao do listener de uso diario
ainda precisa ser conferida apos a ativacao. Nao confundir o CLI de validacao
isolado com o listener que atende o principal.

A VFX TEST foi confirmada pelo PlaceId `76624397270311`, GameId `10764893534`
e conteudo. Antes da instalacao, estava em Edit, com HttpEnabled=false,
23 scripts registrados por hash e 883 descendentes de Workspace registrados
por caminho/classe. Snapshot privado: `local/native-upgrade-game-before.json`.

**Pendente:** reabrir a janela inteira da VFX TEST, verificar os fontes
carregados e executar dois
ciclos reais de Play/Stop pelo CLI instalado. Nao considerar esta versao
validada no carregador nativo nem ativada no principal antes dessas etapas.

O ensaio dirigido nao equivale aos gates integrais de release com perfil
Windows dedicado. As evidencias historicas da versao anterior permanecem em
[LOCAL_INSTALLATION.md](LOCAL_INSTALLATION.md).
