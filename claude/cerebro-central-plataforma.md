## Cérebro central da plataforma (29/10/2026) — no ar, alcançado por todas as imobiliárias

Decisão do Thiago: **uma chave só, da plataforma**, e toda imobiliária usa de graça, sem configurar nada —
para a IA (Claude e Gemini) e, pela mesma ideia, para a estação dos PCs virtuais.

### Claude (Anthropic) é quem atende primeiro (29/10, 17h)
- Thiago mandou a chave dele da Anthropic (termina em **JQAA**), gravada no cofre em `ia_central_anthropic`
  com o modelo `claude-sonnet-5-5` (`plataforma.definir_ia_central_anthropic`,
  `sql/plataforma-anthropic-central.sql`).
- `src/agentes/ia.js` chama a Messages API (`anthropic-version: 2023-06-01`). **Sem `temperature`**: os
  modelos novos recusam ("temperature is deprecated for this model"). O JSON é pedido no texto do system e
  as cercas de código são removidas da resposta.
- Ordem: `ia_central_preferido='gemini'` manda no Gemini; senão **Claude**; senão Gemini (próprio ou
  central); senão Ollama. Se o escolhido falhar, cai no outro sozinho. Testado no PC em 29/10 17h:
  resposta do `claude-sonnet-5-5` em 1,4 s, consumo registrado como `ruah` em `plataforma.ia_uso`.
  No mesmo teste o **Gemini estourou 40 s** — mais um motivo para o Claude na frente.
- Os PCs dos robôs (estação) também passam a operar com o Claude central quando a imobiliária não escolheu
  provedor (`src/estacao/servidor.js`; a estação já falava com a Anthropic em `src/estacao/ia-visao.js`).
- O gasto cai na conta Anthropic do Thiago; quem vê quanto cada imobiliária consumiu é `plataforma.ia_uso`
  (a tela "Cérebro" no painel do gestor ainda é tarefa do Codex).

### Como está montado
- Cofre: `plataforma.config` — `ia_central` (chave do Gemini), `ia_central_modelo` (`gemini-flash-latest`),
  `estacao_chave` (chave única da estação). Escrita só por funções SECURITY DEFINER
  (`plataforma.definir_ia_central`, `plataforma.definir_estacao_central`), executáveis apenas pelo
  `plataforma_app`. A chave **nunca** sai numa rota: no máximo os 4 últimos dígitos.
- Leitura (`src/plataforma/central.js`, cache de 5 min / 1 min em erro), em dois caminhos:
  1. `PLATAFORMA_DATABASE_URL`, quando o projeto tem essa variável (hoje só `ruahimoveis`);
  2. **a própria conexão da imobiliária**, por `plataforma.cofre_central()` — todos os schemas moram no
     mesmo Postgres. A função devolve só as três chaves centrais; `plataforma.config` continua invisível
     para os papéis `<slug>_app`. **Nenhuma variável nova é necessária em projeto nenhum.**
- Medição: `plataforma.anota_ia_uso(...)` soma chamadas e tokens em `plataforma.ia_uso`. De quem é o gasto
  vem do usuário do banco (`ondemorar_app` → `ondemorar`), então uma imobiliária não lança consumo no nome
  de outra. `plataforma.ia_uso` também fica invisível para elas.
- SQL: `sql/plataforma-ia-central.sql`, `sql/plataforma-estacao-central.sql`, `sql/plataforma-cofre-central.sql`.
  Imobiliária nova precisa do `GRANT USAGE/EXECUTE` do último arquivo (ou fazer isso no painel do gestor, ao
  criar o schema).
- Scripts (rodam no PC, onde estão as senhas; imprimem só os 4 últimos dígitos):
  `scripts/chave-central.js` (chave de IA), `scripts/estacao-central.js` (chave da estação +
  `data/estacao.json`), `scripts/ia-central-testar.js` (chamada de verdade ao Gemini + consumo).

### Chave da estação: as três formas valem juntas
`src/estacao/servidor.js` aceita, ao mesmo tempo: a chave própria da imobiliária (gerada na tela, cifrada no
banco), a do projeto (`ESTACAO_ID` + `ESTACAO_CHAVE`) e a central. A batida guarda qual delas a estação usou
de fato, e o passe da tela é assinado com essa — trocar de forma não derruba o PC de ninguém. Casa Prado e
Lumen usam a do projeto; Onde morar? e Cadê meu AP? usam a central. As quatro batem na estação desde
29/10 16h55 (confirmado em `<schema>.config.estacao_status`).

### Estado e pendências
- Chave central do Gemini: **válida** (testada do PC: autenticou; o Google devolveu 503 "high demand" na
  hora, que é temporário). `src/agentes/ia.js` passou a tentar de novo em 429/5xx (1,2 s e 3 s).
- `plataforma.ia_uso` só vai encher quando algum robô pensar de verdade. Onde morar? está com os robôs
  desligados por variável (`IA_MODO=desligado`, `ESCRITORIO=0`, `FISGUEI_ROBO=0`); quem usa o escritório ao
  vivo e os PCs é a **Casa Prado** (e a Lumen).
- Pendente (pequeno): duas linhas de teste minhas em `plataforma.ia_uso` (imobiliária "postgres", modelos
  `teste-cofre` e `gemini-flash-latest`). O `plataforma_app` não tem DELETE nessa tabela e o pedido de
  confirmação do Supabase não foi respondido/foi cancelado. Para limpar:
  `DELETE FROM plataforma.ia_uso WHERE imobiliaria = 'postgres' OR modelo = 'teste-cofre';`
