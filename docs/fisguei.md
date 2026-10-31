# Fisguei

Página `#/fisguei` (também `/fisguei`) do Herrera HOUSE IA. Traz para dentro do sistema os anúncios e proprietários que a equipe abre no Fisgar e põe o robô **TH-IA-GO CORRETOR** para perguntar pelo WhatsApp se a pessoa é a dona do imóvel.

## Como os dados chegam

1. A extensão do Chrome `extensao-fisguei/` fica ligada no `painel.fisgar.com.br`.
2. Ela só copia as respostas que o próprio painel recebe (não faz chamada nova e não gasta crédito):
   - `properties/getAll` (lista da Base de Anúncios) e `properties/announce/getAllInfoById/:id` (ficha) → `fisguei_anuncios`;
   - `owners/GetPeople` (aba Proprietários) → `fisguei_pessoas`;
   - `owners/GetPersonInfo` (botão Consultar, o que gasta crédito no Fisgar) → telefones e e-mails em `fisguei_contatos`.
3. Envia em lotes para `POST /fisguei-api/receber` com o cabeçalho `X-Fisguei-Chave` (gerada em Fisguei → Gerar chave; o banco guarda só o hash).
4. `src/fisguei/normaliza.js` traduz o formato do Fisgar. Anúncio só de locação fica de fora (a imobiliária cliente, a imobiliária, só vende). O CPF/CNPJ que o Fisgar devolve **não é gravado**: vira um hash para reconhecer a mesma pessoa.

## Robô TH-IA-GO CORRETOR

- `src/fisguei/robo.js`, biblioteca Baileys (WhatsApp por aparelho conectado). Roda **só no PC** (na Vercel fica desligado); `FISGUEI_ROBO=0` no `.env` desliga.
- Sessão em `data\whatsapp-thiago`. O QR code aparece na tela Fisguei (gravado no banco, então dá para ler de qualquer lugar).
- Fila (`src/fisguei/base.js`): endereços mais antigos primeiro; dentro do endereço, quem o IPTU aponta como proprietário primeiro; só celular (fixo fica guardado); confere se o número tem WhatsApp antes de mandar.
- Segurança do número: intervalo mínimo de 60 s (padrão 90 s, com variação), limite por dia (padrão 80, teto 200), horário 9h–19h, seg a sáb, domingo nunca. Um número não é abordado de novo em 30 dias, mesmo que apareça em outro endereço.
- Respostas: **SIM** → dono confirmado, endereço vira oportunidade no Radar (status em contato) e o resto da fila do endereço para; **NÃO** → pessoa sai da fila; **não tenho interesse / já vendi** → endereço sai da abordagem; **PARAR** → número na lista não contatar (`fisguei_bloqueios`). Qualquer outra resposta vai para o corretor ("Precisa do corretor"). Depois da primeira resposta o robô só reage a PARAR; o corretor conversa pela própria tela (a mensagem sai pela linha do robô).
- Mensagem editável em Fisguei → Ajustes; precisa conter "PARAR".

## Telas

- Lista com filtros (precisa do corretor, com proprietário, robô abordando, dono confirmou, sem proprietário, particulares…), busca e **Mapa** (Leaflet + OpenStreetMap, até 3.000 pontos).
- Ficha: detalhes e fotos, **Proprietários** (telefones, situação de cada número, conversa), **Mapa** e **Street View** (Google, sem chave), levar para o Radar, pausar o robô no endereço, descartar.

## Banco

Tabelas `fisguei_*` no `src/db-sqlite.js`, `sql/schema.sql` e `sql/fisguei.sql` (aplicar no Supabase). Teste: `node test/fisguei.js` (passa no SQLite e no Postgres).

## Robô "Buscar dados" (26/10/2026)

- No Radar: coluna **Fisgar** em cada anúncio (botão *Buscar dados*), botão *Buscar dados no Fisgar (lista toda)* e um cartão na ficha da oportunidade. No Fisguei: *Buscar dados no Fisgar* no anúncio e *Consultar no Fisgar · 1 crédito* em cada pessoa ainda não consultada.
- O pedido vai para `fisguei_pedidos`. A extensão (versão 1.1) pergunta a cada ~20 s em `GET /fisguei-api/pedidos/proximo?fisgar=1` (só quando há uma aba do Fisgar aberta e logada) e a própria aba do Fisgar executa, com o login dela, o mesmo que a tela "Pesquisar Proprietários": `owners/GetPeople` (tipo IPTU_ADDRESS, CEP + número), `user/CanUseFeature` (diz se a consulta já foi paga) e `owners/GetPersonInfo`. O resultado volta em `POST /fisguei-api/pedidos/:id/resultado` e cai no Fisguei; os celulares entram na fila do TH-IA-GO.
- CEP: o Radar não guarda CEP; o servidor acha pelo ViaCEP (rua + cidade), escolhendo o trecho certo da rua pelo número.
- Quem é consultado sozinho: as pessoas que o IPTU liga ao endereço, se forem até o limite (padrão 3). Prédio ou condomínio com mais gente fica como *escolher quem consultar*.
- Créditos: limite por dia (padrão 70, teto 300) em Fisguei > Limite de créditos. Conta 1 por busca de endereço e 1 por pessoa consultada (a não ser que o Fisgar diga que já foi paga). É estimativa: o saldo oficial é o do Fisgar.
- Erro de login no Fisgar devolve o pedido para a fila; pedido preso em "buscando" por 10 min volta para a fila.

## Importar para a base

- Fisguei > anúncio > *Importar para a base*: cria o imóvel em captação na carteira (tipo, endereço, CEP, áreas, quartos, valor, condomínio, IPTU, localização) e, se alguém confirmou que é dono, cria o proprietário com a origem do dado anotada. As fotos do anúncio original não são copiadas (são de terceiros).

## Fisguei inteligente (27/10/2026)

A tela Captação > Fisguei (`#/fisguei`) virou uma vitrine de cartões para operar a captação:

- **Créditos do Fisgar** no topo: saldo, gasto de hoje e do mês, ritmo por dia até o fim do mês. O saldo vem, nesta ordem:
  1. lido pela extensão (1.3.0) numa resposta do próprio Fisgar que traga o saldo (`POST /fisguei-api/creditos`);
  2. informado à mão por adm/gestor ("Corrigir saldo", `POST /api/fisguei/creditos`);
  3. estimado: plano (2.200/mês, ajustável) menos o que o sistema viu gastar no mês.
  Depois de uma leitura, o sistema desconta cada busca do robô e cada consulta feita no Fisgar com a extensão ligada.
- **Leitura da base**: frases curtas sobre o filtro atual (quedas de preço, particulares sem dono buscado, anúncios novos, m² abaixo do bairro, anúncios antigos, mesmo imóvel em vários anúncios). Cada frase aplica o filtro.
- **Sinais** de cada anúncio (src/fisguei/inteligencia.js), todos com explicação em texto: queda de preço (forte: ≥ 8% de uma vez ou ≥ 12% desde o primeiro preço), anúncio novo (≤ 7 dias), anúncio antigo (≥ 90 dias), m² ≥ 15% abaixo / ≥ 35% acima da mediana do bairro na mesma vitrine (mín. 5 anúncios; senão a cidade), particular, repetido (mesma rua, número e tipo, área parecida). Nota de 0 a 100 para ordenar.
- **Histórico de preço**: tabela `fisguei_precos`. Cada vez que a extensão manda o mesmo anúncio com outro valor, entra uma linha. Coluna `fisguei_anuncios.anunciado_desde` guarda a data mais antiga conhecida.
- **Filtros**: proprietário (sem / com / dono confirmou), sinais (vários juntos), tipo, bairros, valor, quartos, área, anunciante, andamento, só com número, só com foto; busca enquanto digita (atalho `/`); ordem; cartões ou mapa.
- **Prévia lateral** ao clicar no cartão: fotos, histórico de preço, por que apareceu, proprietários, ações (buscar dono, Radar, ficha, 3D, descartar). Setas ← → passam para o próximo.
- **Seleção em lote**: marcar vários cartões e "Buscar dono" de todos (`POST /api/fisguei/buscar-anuncios`); o limite diário de créditos continua valendo.

API: `GET /api/fisguei/explorar`, `GET /api/fisguei/explorar/mapa`, `GET|POST /api/fisguei/creditos`. Teste: `node test/fisguei-inteligente.js`.
Migração no Supabase: ver `sql/fisguei.sql` (aplicar no schema `base` e nos schemas das imobiliárias).
