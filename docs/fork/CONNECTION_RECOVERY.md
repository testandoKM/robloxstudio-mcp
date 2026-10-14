# Correcao experimental da abertura do canal

Data: 2026-10-14. Branch: `codex/connection-investigation`.
Versao preparada: `3.2.2-fork.1`. Estado: **canal, reconexao e Play/Stop dirigido
validados na VFX TEST; gates do plugin completo pendentes; instalacao principal preservada**.

## Escopo autorizado

`DECISAO`: corrigir no fork e testar em um Studio separado usando **VFX TEST**,
`PlaceId=76624397270311`, `GameId=10764893534`, antes de substituir a instalacao
atual. Catch & Clean, Script Sync, publicacao e push ficam fora desta etapa.

`DECISAO` - 2026-10-14: por pedido explicito do usuario, executar tambem um
ensaio dirigido de Play/Stop na propria VFX TEST aberta, sem conta Windows
adicional e sem instalar o fork. A conta separada continua sendo requisito do
executor automatico completo, nao desse ensaio manual de componente. Usar
somente fontes temporarios e servidor loopback isolado; nao alterar o perfil
do Windows nem fingir que o gate automatico passou.

O [relatorio inicial](CONNECTION_INVESTIGATION.md) registra a instalacao 3.2.0
sem WebSocket ativo e a comparacao com a release original 3.2.1. Suas conclusoes
e contagens de teste sao historicas; este documento registra a continuacao.

## O que foi observado

`CONFIRMADO`: o registro HTTP pode ficar pendente antes da criacao do WebSocket.
Na sessao antiga do lab, o modulo de estado do plugin registrava repeticoes de
`/ready registration timed out after 20 seconds`. Um registro listado pelo
servidor nao comprova a abertura do canal.

`CONFIRMADO` em reproducao controlada na VFX TEST: o transporte compilado da
base 3.2.1 emitiu `/ready`, o servidor isolado reteve a resposta e o plugin
atingiu o prazo de 20 segundos sem abrir o canal. A coleta local
`vfx-baseline-e0aeeb7012b1.json` registrou esse resultado e a limpeza do fixture.
Esse teste reteve deliberadamente a resposta; nao prova por que o HTTP da
instalacao original ficou pendente.

`CONFIRMADO`: nas tentativas nativas posteriores, a criacao falhou com a
categoria antes escondida pelo diagnostico generico:

```text
Too many WebStreamClients active, please close existing ones before creating new ones
```

A coleta local `vfx-fixed-dcf606ae8d50.json` registrou esse erro. A API permite
quatro WebStreamClients por plugin e oferece `Close`; o objeto herda de
`Object`, nao de `Instance`, e nao tem `Destroy`. Fontes primarias:
[HttpService](https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/HttpService.yaml),
[WebStreamClient](https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/WebStreamClient.yaml).

`INFERENCIA`: operacoes nativas antigas ou referencias retidas podem contribuir
para a saturacao. A investigacao **nao atribuiu a origem desses quatro clientes**
ao plugin original, ao fixture ou a um defeito do motor. O erro confirma o
impedimento daquela janela, sem estabelecer a causa do travamento historico.

`CONFIRMADO`: reter cinco requisicoes nativas no fixture nao demonstrou saturar
a quota HTTP do plugin testado. A prova de bloqueio usa a resposta `/ready`
retida, e nao essa suposicao de quota. A versao atual do fixture removeu aquelas
cinco requisicoes desnecessarias.

## Mudancas preparadas

- Registro direto no upgrade nativo `/studio/connect`, sem depender de um
  `/ready` HTTP anterior. O servidor reutiliza a validacao existente de
  topologia e versao, limita metadados a 4096 bytes e preserva a verificacao de
  Origin e a autenticacao das ferramentas. O primeiro frame `ready` deve
  corresponder ao peer, instancia, grupo e protocolo esperados.
- Compatibilidade com `/ready` e `/studio` preservada. O caminho legado troca
  para registro no socket quando o HTTP trava; sessoes novas tambem evitam
  esperar por um registro HTTP nativo ainda pendente da sessao anterior.
- No maximo uma chamada nativa de registro HTTP e uma de criacao de socket
  pendentes por modulo. O prazo aposenta a tentativa sem cancelar sua thread
  dentro da chamada nativa; se ela devolver um cliente atrasado, ele recebe
  `Close` e nao substitui a sessao atual. Uma criacao pendente nao gera novas
  criacoes simultaneas.
- Erros de criacao revelam categorias uteis, ocultando credenciais e enderecos.
  `/health` acrescenta `transportConnected` e `connectionState`, preservando o
  significado anterior de `pluginConnected`.

O contrato esta descrito em [configuration](../configuration.md). As protecoes
existentes de deduplicacao, progresso e resultados desconhecidos permanecem.

## Verificacao e limite atual

`CONFIRMADO`: 161 testes direcionados passaram, cobrindo registro, transporte,
autenticacao, entrega, reconexao, deadlines, chamadas nativas atrasadas e
rejeicao de frames de admissao invalidos. Typecheck, build do servidor e
compilacao do plugin passaram. Lint passou sem erros; os 40 avisos existentes
de tipos `any` permanecem em codigo nao introduzido por esta task.

`CONFIRMADO`: a suite completa do core tambem passou: **1075 testes em 58
suites**, com 13 testes ignorados pelo proprio conjunto, em cerca de 147
segundos. O comparativo imutavel das tags manteve os dois casos passando na
3.2.1 e falhando da forma esperada na 3.2.0.

A ultima revisao acrescentou a protecao contra excecoes no listener de upgrade,
que nao possui a barreira de erros do Express. Depois dela, os 52 testes de
registro e seguranca passaram novamente, incluindo a nova regressao. Os gates
offline de sanitizacao de assets, conteudo dos pacotes, instalador em diretorios
temporarios, runners e isolamento de portas tambem passaram. Um fixture de
symlink de arquivo foi omitido por falta de privilegio do Windows; os testes
de junction continuaram ativos. Esses gates nao abriram um Studio real.

`CONFIRMADO`: o artefato foi gerado com `npm run build:plugin:artifact`, sem
instalacao. SHA-256: `9dd51d6b72605e9f15ba7b8877a08d060390051b9fe13100e465e9633e517d1c`.
O plugin instalado manteve o SHA-256 inicial
`4a66254178ecc3e64fd9463d26ac405bfa2eb726aafb3bd374ec17d33595272b`.

`CONFIRMADO`: o fixture temporario foi removido da VFX TEST, `HttpEnabled`
voltou ao valor inicial `false` e o Studio permaneceu em Edit. Nenhum place foi
salvo/publicado, nenhum plugin instalado foi substituido e nenhuma configuracao
MCP global foi alterada. O MCP oficial foi usado como controlador auxiliar apos
falhas do Chrrxs, inclusive falta da capacidade `LocalUser` para o ajuste
temporario de HTTP.

## Validacao nativa na nova VFX TEST

`DECISAO`: o usuario confirmou a atualizacao e abriu uma nova janela de VFX TEST.

`CONFIRMADO`: a nova sessao foi descoberta novamente nas duas conexoes MCP,
com identidade `instance:ofh-sy4` no Chrrxs e
`cb7139fe-b76b-4302-a975-d88b6714beb6` no controlador oficial. Place/game e
conteudo do Workspace foram conferidos antes da escrita. O Chrrxs instalado
voltou a responder `get_place_info` e `execute_luau` nessa janela nova.

`CONFIRMADO` no comparativo nativo, com os mesmos fontes compilados e servidor
isolado que reteve `/ready` HTTP:

| Etapa | Resultado |
| --- | --- |
| Transporte original 3.2.1, registro HTTP retido | Sem canal apos 20 segundos; timeout de registro reproduzido |
| Transporte do fork, mesmo bloqueio HTTP | Canal aberto por `/studio/connect`; `get_place_info` respondeu VFX TEST |
| Servidor de teste derruba somente seu socket | Fork reconectou sozinho e outra consulta respondeu VFX TEST |
| Dependencia de `/ready` HTTP no fork | Nenhuma requisicao de registro HTTP nas duas conexoes |
| Limpeza | Fixture removido, HTTP restaurado a `false`, Studio em Edit e Chrrxs original ainda respondendo |

Evidencias locais: `vfx-baseline-bd006de9a496.json` e
`vfx-fixed-edd7f2d524d6.json`. O fork usou o transporte compilado com SHA-256
`93886823364e79bd045499947af13c501a7999652a988ae2af4d4b95a2df8045` e o
artefato ja registrado acima, sem substituir o arquivo instalado. O teste usa
o componente de transporte real no Studio, com adaptadores de metadados e
handlers restritos; nao carrega o plugin inteiro.

`CONFIRMADO`: no fixture antigo, liberar a resposta HTTP antes de parar o
transporte permitia uma abertura adicional durante a limpeza. O fixture agora
para o transporte antes de liberar as respostas retidas. Isso melhora o
isolamento do teste; nao e uma mudanca no plugin distribuido. Essa ordem foi
retestada nativamente em `vfx-baseline-a18398b4d5cc.json`: bloqueio reproduzido,
fixture limpo e nenhuma abertura adicional de socket durante a liberacao.

**Pendente:** gates de plugin completo e Play/Stop de `tests/README.md`. O
diagnostico publico `npm run studio:test-diagnose` foi tentado e falhou antes
de abrir Studio: o Windows nao conseguiu resolver a conta padrao `StudioTests`.
Nao foi criada conta Windows, alterada credencial nem aplicado desvio ao perfil
obrigatorio. O usuario confirmou que nao possui uma conta de testes separada.
Nenhuma configuracao de Windows foi criada por esta task. O teste de componente
acima nao substitui esses gates nem comprova recuperacao de um limite nativo ja
saturado.

## Play/Stop dirigido sem outra conta Windows

`CONFIRMADO`: o ensaio foi realizado na propria VFX TEST aberta, sem instalar
arquivos e sem lancar outro Studio. O fixture carrega o mesmo transporte
compilado na VM Edit e, durante Play, na VM Server. Confere a linha de
`BindToClose` do entrypoint compilado e registra no servidor a mesma funcao
de producao `StudioWebSocket.suspendForShutdown`.

`CONFIRMADO`: a execucao conclusiva `vfx-play-stop-ef1892a81ab6.json` terminou
com codigo zero. O usuario iniciou o Play pelo botao do Studio; o controlador
oficial confirmou o place e o contexto Server, carregou o transporte do fork
e encerrou a simulacao por `StudioTestService:EndTest`. O teste verificou:

- Resposta do fork dentro do servidor real de Play, com `IsRunning=true` e
  `IsServer=true`.
- Desregistro do peer do servidor pela rotina de encerramento, antes da
  expiracao de 30 segundos. O intervalo observado foi 6169 ms desde o pedido
  ao controlador; inclui a entrega do comando, nao mede somente o callback.
- Retorno a Edit, `RunService:IsEdit()=true`, `IsRunning()=false` e nova
  resposta do transporte do fork em Edit.
- Fixture removido, HTTP restaurado a `false`, nenhum log associado ao nome
  do fixture na auditoria final em Edit e os mesmos nomes/classes na raiz de
  Workspace antes e depois.
- Hash do plugin instalado inalterado.

`HISTORICO`: a execucao `vfx-play-stop-26d09c9f4e52.json` tambem comprovou um
ciclo com consulta em Play, desregistro e consulta em Edit, mas o pedido de
segundo Play nao concluiu no controlador. A execucao inteira nao foi marcada
como aprovada. Sua limpeza foi reconciliada e concluida separadamente.

`CONFIRMADO`: o controle de Play/Stop pelo Chrrxs instalado falhou durante a
preparacao: inicio sem confirmacao de runtime no prazo, e Stop sem
reconhecimento. O controle oficial encerrou a simulacao, mas um novo inicio
automatico retornou `Start play hasn't finished yet`. Houve uma transicao
atrasada para Play; ela foi reconciliada e encerrada antes do ensaio manual.
Nao foram feitas novas tentativas automaticas de inicio apos essa recusa.

`CONFIRMADO`: apos o retorno visivel a Edit, `StudioTestService.EditModeActive`
continuou `false`, embora `RunService:IsEdit()` fosse `true` e a API oficial
aceitasse o DataModel Edit. Essa divergencia foi preservada nos resultados.
O ensaio dirigido usa o estado de execucao e o desregistro observado; **nao
afirma que a API automatica de testes ficou pronta**. Sua causa permanece
aberta, sem alterar ou enfraquecer as verificacoes do codigo de producao.

Limite: esse resultado valida o transporte e o hook real de encerramento em
Play/Stop. Os adaptadores de metadados/handlers continuam restritos; nao foram
carregados UI, roteamento de clientes, StopPlayMonitor e todos os demais
modulos do plugin completo. O gate automatico integral permanece pendente.

## Impedimento anterior de abertura automatica

`HISTORICO`: a tentativa unica de abrir outro Studio pelo lancador protegido foi recusada
antes da criacao do processo: uma instalacao nova tinha um download
`.crdownload` incompleto. Nenhum executavel antigo foi usado para contornar a
verificacao. Foi solicitado ao usuario concluir a atualizacao e abrir uma nova
VFX TEST. A regra de [tests/README.md](../../tests/README.md) e explicita:
"If Studio reports login, rate-limit, or missing/corrupt-file errors, stop and
address the environment before attempting another launch."

Na retomada, o usuario abriu manualmente a VFX TEST usando a instalacao nova.
Um marcador `.crdownload` ainda estava presente nessa pasta; nao foi removido
nem usado um lancador para contornar a verificacao. Os testes de componente
usaram apenas a janela ja aberta. Antes de futuros lancamentos automaticos,
conferir/finalizar a instalacao pelo procedimento proprio do repositorio.

## Como retomar a verificacao

1. Para repetir, obter uma nova janela de VFX TEST. Descobrir seus
   IDs novamente, confirmar place/game e conteudo, e conferir que nao ha
   fixtures pendentes. Nao reutilizar o ID como prova de um processo novo.
2. Preparar os builds, usar apenas a VFX TEST para o fixture e registrar o valor
   inicial de `HttpEnabled`. O teste precisa de HTTP habilitado temporariamente;
   restaurar o valor ao terminar, inclusive em falha.
3. Executar `node scripts/fork/vfx-transport-lab.mjs --official-control` com um
   controlador MCP ativo. O script publica comandos Luau em
   `local/vfx-control-request.json`. O controlador deve validar `runId` e o
   alvo VFX, executar uma vez cada `callId` no MCP oficial em Edit e gravar
   `{callId,ok,result,error}` em `local/vfx-control-reply.json`. Requisicoes de
   execucao incluem `dataModel` (Edit ou Server). Uma resposta de execucao
   precisa chegar em ate 60 segundos; controles Play/Stop tem 120 segundos.
   Em timeout, reconciliar antes de repetir. Usar filesystem pelo `node_repl`
   para essa ponte; se usar terminal, aguardar a conclusao de qualquer sessao
   retornada antes de interpretar a saida. Saida ainda vazia nao e JSON vazio.
4. O fixture usa o transporte compilado atual em um modulo temporario sob o
   PluginDebugService, metadados de sessao de teste e um servidor loopback em
   porta efemera. A unica ferramenta de fixture e `get_place_info`. Ele deve
   conectar, responder, reconectar apos fechamento pelo servidor e responder
   novamente sem `/ready` HTTP, mantendo a instalacao inalterada. Nao equivale
   a instalar/exercitar o plugin completo.
5. O modo `--baseline` exige uma copia compilada verificada do transporte
   original 3.2.1 em `local/StudioWebSocket.baseline.luau`, SHA-256
   `e037d99bcd31fb140fbc0bbfbe4d606bd47bd5857bef242f93f7f5d61e9519bc`.
   Ele deve demonstrar o bloqueio HTTP controlado. Executar somente uma
   instancia do fixture por vez e conferir a limpeza apos cada teste.
6. Para o ensaio dirigido autorizado, acrescentar `--play-cycles 1` (maximo 3).
   O controlador recebe `kind=play`, `action=start/stop`, e `kind=state` para
   reconciliacao. Antes do Play manual, carregar o fixture Edit e aguardar o
   pedido `start`; so entao orientar o usuario a apertar Play. Confirmar a VM
   Server antes de reconhecer o inicio. No Stop, usar um controle disponivel
   ou `StudioTestService:EndTest` da VM Server, confirmar encerramento e nao
   repetir operacoes com resultado desconhecido. Responder `controller` com
   a origem da acao. O pacote `kind=complete` ou o termino do processo encerra
   a ponte, inclusive em falha; nao continuar consumindo um pedido antigo.
7. Depois do teste de componente, usar o perfil isolado para o plugin completo
   na VFX TEST e executar os gates pertinentes de conexao/reconexao e Play/Stop.
   Nao substituir a instalacao principal ate concluir essa verificacao.

Relatorios locais e arquivos do controlador permanecem em `local/`, ignorado
pelo Git. Eles podem conter detalhes de diagnostico e nao devem ser publicados.
