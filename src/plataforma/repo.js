// Repositório GitHub do código e dos ramos de conteúdo da plataforma (Corretor do Futuro).
// PLATAFORMA_REPO troca o padrão. O plano de levar o código para esse repositório está em docs/PLANO-CENTRALIZACAO.md.
// Os ramos de conteudo (banco de materias, bairros, portal, conteudo-vazio) ainda moram no
// ruahimoveis; o padrao so muda quando eles forem para o repositorio novo.
const REPO = process.env.PLATAFORMA_REPO || 'balaocastelo-dev/ruahimoveis';
const RAW = `https://raw.githubusercontent.com/${REPO}`;
const GIT = `https://github.com/${REPO}.git`;
const CONTEUDO_VAZIO = `${RAW}/refs/heads/plataforma/conteudo-vazio`;

module.exports = { REPO, RAW, GIT, CONTEUDO_VAZIO };
