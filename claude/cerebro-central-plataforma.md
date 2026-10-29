## Cérebro central da plataforma (29/10/2026) — no ar, alcançado por todas as imobiliárias

Decisão do Thiago: **uma chave só, da plataforma**, e toda imobiliária usa de graça, sem configurar nada —
primeiro para a IA (Gemini), depois, pela mesma ideia, para a estação dos PCs virtuais.

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
- Pendente (pequeno): reaplicar `sql/plataforma-cofre-central.sql` para a versão nova da `anota_ia_uso`
  (a atual registra "postgres" quando a chamada vem do PC com usuário superusuário) e apagar a linha de
  teste: `DELETE FROM plataforma.ia_uso WHERE modelo = 'teste-cofre';`. O pedido de confirmação do Supabase
  ficou sem resposta na sessão de 29/10.
