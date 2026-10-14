# Roblox Studio MCP - fork de testandoKM

- Este repositorio e um projeto separado de Catch & Clean. Nao alterar gameplay, Script Sync ou arquivos de outros projetos nesta task.
- Leia `FORK.md` e a documentacao pertinente antes de trabalhar. Inspecione o codigo, o Git diff e alteracoes locais existentes.
- Preserve as ferramentas, os contratos de recuperacao e a protecao contra repeticao de escritas com resultado desconhecido.
- Distinga evidencias `CONFIRMADO`, `HISTORICO`, `INFERENCIA` e `DECISAO` nos registros de investigacao.
- Nunca versionar tokens, chaves, configuracoes pessoais, dumps de autenticacao ou logs brutos do Studio. Evidencias locais ficam em `local/`, ja ignorado pelo Git.
- A investigacao inicial usa consultas somente leitura. Nao encerrar processos nem iniciar Play para testar conectividade no jogo aberto.
- Para preparar artefatos sem instalar no Studio do usuario, use `npm run build:plugin:artifact`. O build normal do plugin pode instalar arquivos; confira os efeitos antes de executa-lo.
- Testes que usam Studio devem seguir `tests/README.md` e isolamento de teste. Nao declarar recuperacao validada no Studio com base apenas em testes simulados.
- Ao concluir alteracoes, revise o diff, execute as verificacoes pertinentes e faca commit apenas do trabalho da task. Push e instalacao dependem do escopo autorizado pelo usuario.
