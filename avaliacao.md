# Avaliação: GitHub Actions com IA
Aluno: Felipe de Lima Amarante 

## Tarefa 1
- Execução verde: https://github.com/FelpsLant/avaliacao2-site/actions/runs/38817253059
- Execução vermelha: (cole o link da execução #3)
- Linha do erro no log: (cole a linha do erro)
- Por que testar em SQLite antes do D1: erros de sintaxe são pegos sem risco e sem custo, enquanto um erro no D1 remoto afeta o banco real e é difícil de desfazer.

## Tarefa 2
- PR bloqueado e depois liberado: https://github.com/FelpsLant/avaliacao2-site/pull/1
- Push direto na main recusado: o GitHub mostrou a mensagem "You can't commit to main because it is a protected branch" ao tentar o commit direto.
- Observação: o repositório foi tornado público porque rulesets não são aplicados em repositório privado no plano gratuito.

## Tarefas 3 e 4
- Não concluídas dentro do prazo.

## Perguntas
1. O ci.yml roda por dois eventos, push (na branch) e pull_request. O status check exigido é o verificar do commit do PR.
2. PRs de fork não recebem segredos porque qualquer pessoa poderia alterar o workflow para vazá-los.
3. Declarar permissions dá ao GITHUB_TOKEN só o mínimo necessário, reduzindo o dano em caso de abuso.
4. Não. A IA pode errar e não bloqueia o merge, enquanto o status check é determinístico e imposto pelo GitHub.
