# Testes de falha

Todos os testes foram executados em `https://avaliacao2-site.pages.dev`, usando o Google como provedor (o mesmo comportamento se aplica ao GitHub, já que as duas rotas compartilham a mesma lógica de validação em `functions/oauth/callback/[provider].js`).

## Caso 1: retorno sem cookie temporário

- **Preparação:** Início de login com Google em uma aba, copiando a URL de autorização gerada pelo Google antes de completar o login.
- **Pedido enviado:** A URL de autorização copiada foi aberta em uma janela anônima separada, que nunca recebeu o cookie `__Host-oauth-tx` (esse cookie só existe na aba original). O login foi completado normalmente na janela anônima.
- **Resultado esperado:** A rota de retorno deve recusar a resposta por falta do cookie de transação, sem criar sessão.
- **Resultado observado:** A rota respondeu com a mensagem `Cookie de transacao ausente`, sem criar sessão. **Passou.**

## Caso 2: state alterado

- **Preparação:** Início de um login com Google (criação de uma transação e do cookie `__Host-oauth-tx` válidos), sem completar o login.
- **Pedido enviado:** Requisição direta para `https://avaliacao2-site.pages.dev/oauth/callback/google?code=teste123&state=valor-errado-de-propósito`, na mesma aba/sessão de cookies em que a transação foi criada, com um `code` arbitrário e um `state` que não corresponde ao guardado no banco.
- **Resultado esperado:** A rota deve recusar a resposta comparando o resumo do `state` recebido com o resumo salvo no D1, antes de tentar trocar o código com o provedor.
- **Resultado observado:** A rota respondeu com a mensagem `State invalido`. **Passou.**

## Caso 3: reutilização da transação

- **Preparação:** Login completo com Google, com a aba Network do navegador aberta (Preserve log ativado) para capturar a requisição de retorno (`GET /oauth/callback/google?code=...&state=...`).
- **Pedido enviado:** Depois do login ser concluído com sucesso (sessão criada), a mesma `Request URL` da requisição de callback foi copiada da aba Network e reaberta em uma nova aba, repetindo exatamente a mesma requisição.
- **Resultado esperado:** A transação já havia sido apagada do banco D1 no primeiro uso, então a repetição deveria falhar ao não encontrar a transação.
- **Resultado observado:** A repetição falhou com a mensagem `Cookie de transacao ausente`. Isso ocorre porque o cookie `__Host-oauth-tx` já havia sido expirado (`Max-Age=0`) pela própria resposta do primeiro login bem-sucedido — uma camada de proteção adicional que impede a reutilização antes mesmo de consultar o banco. **Passou** (a reutilização foi bloqueada, ainda que por uma verificação anterior à consulta da transação no D1).

## Caso 4: sessão expirada

- **Preparação:** Login completo com Google, confirmando sessão ativa em `/api/me` (retornando os dados do usuário).
- **Pedido enviado:** No console do banco D1 (`oauth-sessions-avaliacao2`), execução de `UPDATE sessions SET expires_at = 0;`, seguida de uma nova consulta a `/api/me`.
- **Resultado esperado:** `/api/me` deve responder 401 Unauthorized, pois a sessão está com `expires_at` no passado.
- **Resultado observado:** `/api/me` passou a responder `Unauthorized`. **Passou.**

## Caso 5: origem inválida na saída

- **Preparação:** Sessão válida ativa (confirmada em `/api/me`).
- **Pedido enviado:** A partir do console do navegador em uma aba de **outra origem** (não `avaliacao2-site.pages.dev`), execução de:
  ```js
  fetch("https://avaliacao2-site.pages.dev/oauth/logout", { method: "POST", credentials: "include" })
    .then(r => console.log(r.status)).catch(e => console.log("erro:", e))
  ```
- **Resultado esperado:** A rota deve recusar a operação por o cabeçalho `Origin` não corresponder a `PUBLIC_BASE_URL`, e a sessão original deve permanecer válida.
- **Resultado observado:** A requisição retornou `403 Forbidden` (além de ser bloqueada pela política de CORS do navegador). Ao voltar para a aba original e recarregar `/api/me`, a sessão continuou válida, confirmando que o logout indevido não teve efeito. **Passou.**

## Caso 6: reutilização do cookie revogado

- **Preparação:** Sessão válida ativa. O valor do cookie `__Host-session` foi copiado manualmente pelas Ferramentas de Desenvolvedor (aba Application/Cookies).
- **Pedido enviado:** Logout realizado normalmente pelo botão "Sair" (que remove a sessão do D1 e expira o cookie). Em seguida, o valor antigo do cookie `__Host-session` foi restaurado manualmente nas Ferramentas de Desenvolvedor, e `/api/me` foi consultado novamente.
- **Resultado esperado:** Mesmo com o cookie restaurado, `/api/me` deve responder 401, pois a linha correspondente foi removida da tabela `sessions` no D1.
- **Resultado observado:** `/api/me` respondeu `Unauthorized`. **Passou.**

## Resumo

| Caso | Descrição | Resultado |
|---|---|---|
| 1 | Retorno sem cookie temporário | ✅ Recusado |
| 2 | State alterado | ✅ Recusado |
| 3 | Reutilização da transação | ✅ Recusado |
| 4 | Sessão expirada | ✅ 401 |
| 5 | Origem inválida na saída | ✅ Recusado (403), sessão preservada |
| 6 | Cookie de sessão revogado | ✅ 401 |
