# Fork Roblox Studio MCP

`DECISAO` - 2026-10-14: criar um projeto separado para investigar e melhorar a estabilidade do Chrrxs MCP, comecando pela comparacao da instalacao 3.2.0 com a versao atual e pelo travamento da conexao.

- Fork: <https://github.com/testandoKM/robloxstudio-mcp>
- Original: <https://github.com/Chrrxs/robloxstudio-mcp>
- `origin` aponta para o fork; `upstream` aponta para o original.
- Base inicial: `v3.2.1`, commit `1383d30`; baseline instalado: `v3.2.0`, commit `08c25c1`.
- A licenca MIT e os avisos originais permanecem preservados em `LICENSE`.

## Primeira investigacao

Leia [o relatorio de conexao](docs/fork/CONNECTION_INVESTIGATION.md). O diagnostico coleta apenas campos permitidos de `/health` e, opcionalmente, uma consulta `get_place_info`. Nao inicia outro servidor, troca portas, instala plugin nem altera o DataModel.

A continuacao esta em [correcao experimental da abertura do canal](docs/fork/CONNECTION_RECOVERY.md).
A versao `3.2.2-fork.1` prepara registro direto por WebSocket e limita chamadas
nativas pendentes. Abertura do canal, consulta e reconexao passaram em uma nova
janela da VFX TEST. Um ensaio dirigido de Play/Stop tambem passou nessa janela,
com Play manual e o transporte do fork temporario em memoria, sem conta Windows
adicional. A continuacao corrigiu o controle de sessao e validou dois ciclos
automaticos consecutivos com os modulos reais de Play/Stop, tambem temporarios.
A [validacao funcional do pacote completo](docs/fork/FULL_PACKAGE_VALIDATION.md)
tambem passou: UI, CLI MCP, broker/execucao Server e Client, profiler,
reconexao e dois ciclos de Play/Stop, com o pacote temporario em memoria.
Instalacao/auto-load por arquivo e gates integrais de release permanecem
separados; o artefato nao substituiu a instalacao de uso diario.

```powershell
node scripts/fork/connection-snapshot.mjs --samples 3 --interval-ms 12000 --probe --output local/connection-snapshot.json
node scripts/fork/compare-transport-regression.mjs
```

Use `--installed-root <pasta-do-pacote>` para comparar a versao e os hashes dos arquivos instalados. O token local e lido somente com `--probe`, mantido em memoria e nunca incluido no resultado. O destino dos snapshots precisa estar dentro de `local/`.

Os testes de comparacao executam dois casos existentes do original contra o transporte de cada tag. A versao antiga deve falhar nesses casos; a atual deve passar. Isso valida as correcoes simuladas, sem provar que elas resolvem a conexao deste computador.

## Desenvolvimento

Node.js 22 ou superior. Instale as dependencias com `npm ci`. Consulte [building-from-source](docs/building-from-source.md) e [tests/README.md](tests/README.md).

Ao preparar uma versao para teste, mantenha servidor e plugin com a mesma versao. Use `npm run build:plugin:artifact` para gerar somente o artefato. Testes de recuperacao com Studio devem ocorrer em um ambiente isolado antes de substituir a instalacao de uso diario.
