# Fisguei

Página `#/fisguei` (também `/fisguei`) do Sistema RUAH. Traz para dentro do sistema os anúncios e proprietários que a equipe abre no Fisgar e põe o robô **TH-IA-GO CORRETOR** para perguntar pelo WhatsApp se a pessoa é a dona do imóvel.

## Como os dados chegam

1. A extensão do Chrome `extensao-fisguei/` fica ligada no `painel.fisgar.com.br`.
2. Ela só copia as respostas que o próprio painel recebe (não faz chamada nova e não gasta crédito):
   - `properties/getAll` (lista da Base de Anúncios) e `properties/announce/getAllInfoById/:id` (ficha) → `fisguei_anuncios`;
   - `owners/GetPeople` (aba Proprietários) → `fisguei_pessoas`;
   - `owners/GetPersonInfo` (botão Consultar, o que gasta crédito no Fisgar) → telefones e e-mails em `fisguei_contatos`.
3. Envia em lotes para `POST /fisguei-api/receber` com o cabeçalho `X-Fisguei-Chave` (gerada em Fisguei → Gerar chave; o banco guarda só o hash).
4. `src/fisguei/normaliza.js` traduz o formato do Fisgar. Anúncio só de locação fica de fora (a RUAH só vende). O CPF/CNPJ que o Fisgar devolve **não é gravado**: vira um hash para reconhecer a mesma pessoa.

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
