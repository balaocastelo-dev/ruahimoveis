# Escritório virtual (agentes robôs)

Tela: **Vendas > Escritório virtual** (`#/whats`). A antiga tela de WhatsApp virou **Conversas do CRM** (`#/whats/conversas`).

## Os 9 agentes

| # | Agente | Setor | Fala com |
|---|--------|-------|----------|
| 1 | TH-IA-GO | Captador de oportunidades | proprietários abordados pelo robô do Fisguei |
| 2 | Ana | Apartamentos | clientes |
| 3 | Bruno | Galpões, barracões, salas, lojas | clientes |
| 4 | Teo | Terrenos e lotes | clientes |
| 5 | Clara | Casas até R$ 2 mi | clientes |
| 6 | Helena | Alto padrão (casas acima de R$ 2 mi, apartamentos acima de R$ 3 mi) | clientes |
| 7 | Vicente | Off-market (imóveis com status off-market) | clientes |
| 8 | Augusto | Gerente geral | só o dono do portal |
| 9 | Marta | Gerente dos corretores | corretores e gestores com celular cadastrado |

Os limites de valor mudam em "Regras do escritório".

## Alma (.soul)

- Padrão no código: `src/agentes/almas/NN-<agente>.soul` (cabeçalho `---` + texto em Markdown).
- Editável na mesa do agente > **Alma (.soul)** (salva no banco, vale no PC e no link). "Voltar ao padrão" volta para o arquivo.
- O sistema junta sozinho à alma, a cada mensagem: catálogo do setor (só imóveis da RUAH), ficha do lead, o que ele pediu no portal,
  a conversa, a data/hora e o formato da resposta (JSON com `mensagem` e `acoes`). Essa parte não fica na alma.

## Ações que os agentes usam no sistema

- Clientes: `atualizar_perfil`, `agendar_visita` (só imóvel do setor; a Marta avisa o corretor), `enviar_link` (página do portal;
  no off-market, link privado que sempre passa por aprovação), `transferir` (para outro agente de cliente), `chamar_corretor` (afazer + aviso).
- TH-IA-GO: `registrar_captacao` (interesse, fotos, melhor horário na oportunidade do Radar), `chamar_corretor`. Fotos que o dono manda
  ficam em `agente_midias` e podem ir para a pasta Fotos do imóvel quando ele for captado.
- Augusto: `criar_afazer` para um corretor. Rotinas: resumo da manhã, relatório do dia, alertas na hora. "relatório" no WhatsApp responde na hora.
- Marta: `criar_afazer`, `marcar_feito`. Rotinas: agenda da manhã, lembrete antes da visita, lead novo, proprietário que confirmou, afazer vencendo.
  "feito 12" e "agenda" respondem sem IA. Não manda nada antes das 7h nem depois das 21h.

## WhatsApp

- Cada agente conecta um número pelo QR code (mesa > WhatsApp > Conectar). Sessão em `data\whatsapp-agente-<agente>` no PC.
- Um agente pode usar o número de outro (mesa > Ajustes). O TH-IA-GO usa sempre a linha do robô do Fisguei; ninguém mais usa essa linha.
- Quem escreve num número: dono → Augusto; corretor → Marta; cliente com agente na mesma linha → esse agente; senão, o dono da linha.
- PARAR bloqueia o cliente. Lead novo do portal/blog vai para o agente do setor, que manda a primeira mensagem (se "puxar conversa" estiver ligado).

## Modos

- **Sugere e espera aprovação** (padrão dos agentes de cliente e do TH-IA-GO): resposta em "Para aprovar" e na conversa do CRM.
- **Responde sozinho** (padrão dos gerentes).

## Onde roda

- **Cérebro**: com a chave da API do Gemini em Escritório virtual › Configuração geral (`#/whats/config`), roda na NUVEM (Vercel):
  o agendador do Supabase (pg_cron + pg_net) chama `POST /escritorio-ciclo` a cada minuto com o token `escritorio_ciclo_token`,
  e o PC chama o mesmo endereço ~17 s depois de cada mensagem recebida. A conversa de teste responde na hora. Sem chave, o cérebro
  roda no PC com a IA local (Ollama `OLLAMA_MODEL`). A chave fica cifrada no banco (config `escritorio_ia`), legível no PC e no link.
- **Linhas de WhatsApp**: no PC, num processo separado do site (`src/agentes/servico.js`, aberto e reaberto pelo server.js), para que telas
  pesadas não travem o WhatsApp. Com o PC desligado, as respostas esperam na fila. (Decisão de 27/10: linhas continuam no PC por ora.)
`ESCRITORIO=0` no `.env` desliga. Tabelas: `agente_mensagens`, `agente_eventos`, `agente_afazeres`, `agente_midias` e a coluna `leads.agente`
(`sql/escritorio.sql`). Teste: `node test/escritorio.js`.
