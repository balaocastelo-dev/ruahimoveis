# Tarefa: tela "Cérebro da plataforma" no painel do gestor (corretordofuturo.app/gestor)

Decisão do Thiago (29/10/2026): a chave do Gemini é **uma só, da plataforma**. Todas as imobiliárias usam
de graça, sem configurar nada, e o dono da plataforma vê quanto cada uma consumiu. A parte de baixo já está
pronta e no ar (commit 2d360c5): `src/plataforma/central.js`, `src/agentes/ia.js`, `plataforma.ia_uso` e a
função `plataforma.definir_ia_central(chave, modelo)`. **Falta só a tela.**

Ler antes: `src/plataforma/gestor.js` (o painel inteiro: sessão, rotas, `q()`/`um()`, páginas em HTML),
`src/plataforma/central.js`, `src/agentes/ia.js`, `docs/escritorio.md`.

## O que fazer

Nova seção "Cérebro" no painel do gestor, no mesmo visual das outras páginas de lá:

1. **Chave central**: mostra se existe (`…últimos 4 dígitos`), o modelo em uso e quando foi trocada.
   Campo para colar uma chave nova e botão "Guardar" → chama `SELECT plataforma.definir_ia_central($1,$2)`
   (nunca escreva direto em `plataforma.config`; a função é quem tem permissão). Botão "Remover" passa NULL.
   A chave **nunca** volta para o navegador: só os 4 últimos dígitos. Botão "Testar" faz uma pergunta curta
   ao Gemini com a chave central (reaproveitar a lógica de `IA.testar`, mas usando a chave central) e mostra
   ok/erro + o tempo.
2. **Modelo**: lista os modelos da chave (o mesmo endpoint que `IA.testar` já usa) e deixa escolher.
3. **Consumo**: tabela a partir de `plataforma.ia_uso` com, por imobiliária: chamadas, tokens de entrada,
   tokens de saída e erros — nas visões **hoje**, **este mês** e **mês passado**, com uma linha de total.
   Ordenar pelo maior consumo. Mostrar também um gráfico simples (barras em HTML/CSS, sem biblioteca) dos
   últimos 30 dias somando todas.
4. **Custo estimado** (opcional, só se ficar simples): preço por milhão de tokens configurável em
   `plataforma.config` (`ia_preco_entrada` / `ia_preco_saida`, em reais), para a tabela mostrar o valor
   estimado por imobiliária. Se não houver preço configurado, a coluna some.
5. **Teto de uso** (opcional, se der): campo `ia_limite_mes` em `plataforma.config`; quando o total do mês
   passar do teto, a tela avisa em vermelho. (Não bloquear nada automaticamente por enquanto.)

## Regras
- Só o gestor logado no painel da plataforma acessa; nada disso aparece para as imobiliárias.
- Nenhuma biblioteca nova; HTML gerado como o resto de `gestor.js`; textos em português.
- Não mexer em `src/agentes/ia.js` nem em `src/plataforma/central.js` além do necessário para reaproveitar
  funções (a leitura da chave pelas imobiliárias já funciona e está no ar).
- `npm test` antes de subir. Commit e push em main; resumo na seção "Resultado" deste arquivo.

## Prompt pronto para o Codex
> Leia docs/tarefa-cerebro-plataforma.md e implemente a tela "Cérebro" no painel do gestor da plataforma.
> Use a função plataforma.definir_ia_central para gravar a chave e a tabela plataforma.ia_uso para o consumo.
> A chave nunca pode voltar para o navegador (só os 4 últimos dígitos). npm test antes de subir; commit e
> push em main, mensagens em português.
