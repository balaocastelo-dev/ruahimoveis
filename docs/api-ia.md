# Controle do sistema por IA — como funciona por dentro

Resumo técnico. O catálogo das rotas está em [api.md](api.md).

## Peças
| arquivo | o que é |
|---|---|
| `src/api-ia/chaves.js` | cria, confere e revoga chaves; mapa caminho → escopo; limite por minuto; registro de uso |
| `src/api-ia/registro.js` | catálogo das ações (232, sendo 209 por chave) e os geradores de OpenAPI e de ferramentas de LLM |
| `src/api-ia/index.js` | middleware `porChave` + rotas `/api/chaves` e `/api/ia/*` |
| `scripts/api-chave.js` | cria/lista/revoga chave pelo PC |
| `scripts/mcp-herrera.mjs` | servidor MCP (Node puro, sem dependência) que publica as ações como ferramentas |
| `sql/api-ia.sql` | tabelas `api_chaves` e `api_log` em todos os schemas (migração `api_ia_chaves` já aplicada no Supabase) |
| `test/api-ia.js` | teste ponta a ponta (entrou no `npm test`) |

## Como a chave entra
`server.js` monta `apiIA.porChave` em `/api` e `/gestor-api` **antes** do `mesmaOrigem`. A chave resolve o
usuário (`req.usuario`) e marca `req.apiChave`; daí:
- `auth.exigeLogin` devolve na hora se `req.usuario` já existe;
- `auth.mesmaOrigem` pula o CSRF quando há `req.apiChave` (não é navegador).

Nada mais no sistema precisou mudar: as 209 rotas passaram a aceitar chave sem reescrever handler nenhum.
Permissão continua sendo a do usuário dono da chave (`exigePerfil`, `veTudo`, filtro por corretor), e o escopo
só diminui. Segurança: hash SHA-256 da chave, comparação em tempo constante, prazo, lista de IP,
somente-leitura, limite por minuto e registro de cada chamada.

## Rotas novas
`/api/chaves` (listar, criar, revogar, log) e `/api/ia/*`: `manifesto`, `acoes`, `ferramentas.json`,
`openapi.json`, `estado`, `eventos`, `executar`, `esquema`, `consulta`, `config`.

`POST /api/ia/executar` acha a ação no registro, monta o caminho e chama o próprio sistema
(`127.0.0.1:PORT` no PC, o próprio host na Vercel) repassando a chave — por isso vale exatamente a mesma
permissão da chamada direta.

`POST /api/ia/consulta` só aceita `SELECT`/`WITH`, recusa `;` e qualquer comando de escrita, e força `LIMIT`.

## O que falta (opcional)
- Tela em Sistema › Configurações para criar/revogar chave pelo navegador (hoje é pela API ou pelo script).
- Webhooks de saída (hoje a IA acompanha por `GET /api/ia/eventos?desde=`).
