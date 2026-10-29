## Cérebro central da plataforma (29/10/2026) — configurado, mas ainda não alcançado pelas imobiliárias

Decisão do Thiago: **uma chave só, da plataforma**, e toda imobiliária usa de graça, sem configurar nada —
primeiro para a IA, depois (mesma ideia) para a estação dos PCs virtuais.

### Como está montado
- Cofre: `plataforma.config` — `ia_central` (chave do Gemini), `ia_central_modelo` (`gemini-flash-latest`),
  `estacao_chave` (chave única da estação). Escrita só por funções SECURITY DEFINER
  (`plataforma.definir_ia_central`, `plataforma.definir_estacao_central`), que só o `plataforma_app` executa.
  A chave **nunca** sai numa rota: no máximo os 4 últimos dígitos.
- Leitura: `src/plataforma/central.js` (cache de 5 min, 1 min quando dá erro) pelo `PLATAFORMA_DATABASE_URL`.
- Ordem de uso: chave **própria** da imobiliária → **central** → variável do projeto
  (`GEMINI_API_KEY` / `ESTACAO_ID`+`ESTACAO_CHAVE`). Com a chave central da estação, o id da imobiliária é o
  próprio schema.
- Medição: `plataforma.ia_uso` soma chamadas e tokens por imobiliária, dia e modelo (`central.anota`).
- Scripts (rodam no PC, onde estão as senhas; imprimem só os 4 últimos dígitos):
  `scripts/chave-central.js`, `scripts/estacao-central.js`, `scripts/ia-central-testar.js`.

### O que falta (achado em 29/10, tarde)
- **`PLATAFORMA_DATABASE_URL` só existe no projeto `ruahimoveis`.** Os projetos `ondemorar`, `cademeuap`,
  `imob-casaprado` e `imob-lumen` não têm essa variável, então `central.js` devolve vazio e nada do cofre
  central chega nelas: a chave de IA central nunca foi usada (`plataforma.ia_uso` vazia) e a chave central da
  estação também não vale. Corrigir = copiar a variável do projeto `ruahimoveis` para cada projeto (mesmo
  valor) e publicar de novo. Escrever segredo na Vercel está bloqueado para o Claude no modo automático.
- A chave central do Gemini **funciona** (testada do PC em 29/10: autenticou; o Google respondeu 503
  "high demand" na hora, que é temporário). `src/agentes/ia.js` passou a tentar de novo em 429/5xx.
- **Onde morar? (ondemorar) está com os robôs desligados por variável**: `IA_MODO=desligado`,
  `ESCRITORIO=0`, `FISGUEI_ROBO=0`. Mesmo com o cofre alcançável, não haveria robô rodando lá até ele
  decidir ligar. Quem está com o escritório ao vivo e os PCs em uso é a **Casa Prado** (e a Lumen).
- Estação dos PCs virtuais: `data/estacao.json` do PC atende hoje `casaprado` e `lumen`, cada uma com chave
  própria. As entradas de `ondemorar`/`cademeuap` foram tiradas de novo (davam 401 a cada batida) e voltam
  sozinhas com `node scripts/estacao-central.js --gravar` quando a variável estiver nos projetos.
