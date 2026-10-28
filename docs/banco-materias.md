# Banco de matérias do blog (plataforma)

Todas as imobiliárias da plataforma recebem matérias novas no blog, todo dia, sem que um texto
se repita entre elas. **Cada matéria vai para uma imobiliária só.**

## Caminho de uma matéria

1. **Escrita** (tarefa agendada do Claude): `node scripts/banco-materias.mjs preparar` diz quantas
   escrever e quais temas já existem; cada matéria passa por `conferir` e entra com `adicionar` no
   ramo `plataforma/banco-materias` (instruções para quem escreve: `ROTINA.md` e `pauta.md` do ramo).
   - O nome da imobiliária é escrito como `{{cliente}}`; nome real é recusado.
   - Campo `tema` obrigatório; tema igual ou título parecido com outro do banco é recusado.
   - Links internos só para `/blog` e `/blog/categoria/...`.
2. **Capa** (PC da RTX 4090): `scripts/capa_blog_banco.py` lê `capas/pendentes.json` do ramo, gera e
   confere a foto (gerador do Balão) e prende com `banco-materias.mjs capa`. A matéria fica `pronta`.
   Tarefa do Windows `\HerreraHouse\Capa do banco de materias` (23h10 e 3h40), instalada por
   `scripts\instalar_tarefa_capa_banco.ps1`.
3. **Banco** (`plataforma.materias`, Supabase): o ciclo (`POST corretordofuturo.app/banco-ciclo`,
   pg_cron às 20h30 e 4h30) traz as prontas do ramo, conferindo de novo formato e régua.
4. **Entrega** (`plataforma.entregar_materias()`): para cada imobiliária ativa, conforme o plano
   (Essencial 1, Profissional 2, Rede/Fundador 3 por dia; `materias_dia` no painel troca), escolhe
   matérias livres e grava em `<imobiliária>.blog_materias`, com `{{cliente}}` trocado pelo nome e
   o horário (6h, 12h, 18h). Reserva: pg_cron às 5h entrega direto no banco.
5. **Blog** da imobiliária: `src/blog/diario.js` junta o ramo próprio dela (se houver) e
   `blog_materias`; a matéria só aparece na hora marcada e com capa.

## Garantias

- `entregue_a` é preenchido uma vez, com trava de linha (`FOR UPDATE SKIP LOCKED`): nenhuma
  matéria vai para duas imobiliárias.
- Índice único `(entregue_a, publicar_em)`: rodar a entrega de novo não duplica.
- Tema único no banco; a mesma imobiliária não recebe o mesmo tema em 90 dias.
- Notícia vence em 5 dias (`valido_ate`); vencida não é entregue.

## Acompanhar

Painel do gestor (`corretordofuturo.app/gestor`) → "Banco de matérias do blog": dias de estoque
(vermelho abaixo de 3), prontas por tipo, entregas por dia, quanto cada imobiliária recebe (troca
"por dia") e as últimas entregas. Botão "Buscar prontas e entregar agora".
Resumo público sem segredo (usado pela rotina que escreve): `/banco-materias/situacao.json`.

SQL: `sql/plataforma-banco-materias.sql`. Teste: `node test/banco-materias.js`.
