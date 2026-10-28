# LGPD e operação limpa (28/10/2026)

Pedido do Thiago: deixar claro que o Herrera HOUSE IA é um sistema independente, que usa dados de anúncios já
públicos e serviços contratados pela imobiliária, com termos e privacidade escritos e a operação sem brecha jurídica.

## Onde está
| O quê | Endereço | Código |
|---|---|---|
| Sobre nós, Termos de uso, Privacidade e LGPD da plataforma | corretordofuturo.app/sobre, /termos, /privacidade | src/plataforma/legal.js, textos em src/lgpd/textos.js |
| Pedido do titular na plataforma | POST corretordofuturo.app/privacidade/pedido → plataforma.titular_pedidos | src/lgpd/index.js (registrarPlataforma) |
| Privacidade e Termos de cada imobiliária (ela = controladora) | <imobiliária>/privacidade e /termos, links no rodapé do portal e do blog | src/routes/portal.js (paginaLegal) |
| Pedido do titular no portal | POST <imobiliária>/privacidade/pedido → titular_pedidos da imobiliária | src/lgpd/index.js (registrar) |
| Tela no sistema | Sistema › Privacidade e LGPD (#/privacidade): pedidos, prazo de 15 dias, "não contatar" manual | public/lgpd.js, src/routes/lgpd.js |
| Aceite dos Termos | todo usuário aceita a versão atual ao entrar (config lgpd_aceite_u<id>, auditoria lgpd_aceite) | public/lgpd.js, src/routes/lgpd.js |
| Painel do gestor | seção "Pedidos de titulares (LGPD)" | src/plataforma/gestor.js, public/gestor/gestor.js |
| Lista "não contatar" comum | plataforma.nao_contatar (hash do telefone); funções lgpd.opor() e lgpd.pode_contatar() | sql/lgpd.sql |

Mudou o texto de forma relevante → trocar `VERSAO` em src/lgpd/index.js (todos aceitam de novo).

## Papéis
- Imobiliária cliente = **controladora** dos proprietários, clientes, conversas e consultas que ela faz (inclusive no Fisgar,
  que se declara operador e põe o assinante como controlador: fisgar.com.br/lgpd).
- Herrera HOUSE IA = **operadora** desses dados e **controladora** só das contas, cobrança e base comum (anúncios, prédios, bairros).

## Salvaguardas no código (o que sustenta o legítimo interesse)
- Robô de captação: só o imóvel anunciado, 9h–19h seg–sáb, limite por dia, intervalo mínimo, PARAR obrigatório.
- Toda primeira mensagem diz de onde veio o contato e leva a /privacidade (comTransparencia em src/fisguei/base.js;
  modelo editado sem o link ganha a linha no fim).
- PARAR, pedido de oposição ou de eliminação → telefone bloqueado na imobiliária e na lista comum (nenhuma imobiliária chama de novo).
- CPF/CNPJ do Fisgar não é gravado; proprietário nunca aparece no portal; fotos de terceiros só como "foto interna".
- Leitura de portais só do que o robots.txt libera; sites que bloqueiam não são lidos.

## Avaliação de legítimo interesse (resumo, para o advogado completar)
1. Finalidade: oferecer corretagem ao dono de imóvel que ele próprio anunciou à venda/locação. Interesse concreto e lícito.
2. Necessidade: só nome e telefone do possível dono e o endereço do anúncio; sem CPF, sem dados sensíveis; uma abordagem.
3. Balanceamento: o titular pôs o imóvel no mercado (expectativa razoável de contato de corretores); salvaguardas acima;
   opt-out na primeira mensagem e lista comum. Risco residual: possível proprietário errado (base IPTU) → a mensagem pergunta
   "você é o proprietário?"; quem responde NÃO sai da fila e não recebe outra mensagem.

## Pendências (fora do código)
- Variáveis na Vercel: PLATAFORMA_RAZAO_SOCIAL, PLATAFORMA_CNPJ, PLATAFORMA_EMAIL_PRIVACIDADE (e-mail próprio, não o pessoal),
  PLATAFORMA_ENCARREGADO; em cada imobiliária: CLIENTE_CNPJ, CLIENTE_CRECI, CLIENTE_EMAIL_PRIVACIDADE, CLIENTE_ENCARREGADO.
- Revisão por advogado (os textos dizem "em revisão jurídica").
- Conferir os termos de uso do Fisgar (só a política LGPD é pública) sobre copiar dados para outro sistema pela extensão.
- Robô de WhatsApp por QR code (Baileys) não é a API oficial: risco de bloqueio do número pela Meta, não da LGPD.

Teste: node test/lgpd.js (no npm test).
