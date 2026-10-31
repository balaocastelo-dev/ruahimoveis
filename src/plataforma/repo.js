// Repositório GitHub do código e dos ramos de conteúdo da plataforma.
// O nome no GitHub ainda é ruahimoveis. PLATAFORMA_REPO troca isso quando o repositório for renomeado.
const REPO = process.env.PLATAFORMA_REPO || 'balaocastelo-dev/ruahimoveis';
const RAW = `https://raw.githubusercontent.com/${REPO}`;
const GIT = `https://github.com/${REPO}.git`;
const CONTEUDO_VAZIO = `${RAW}/refs/heads/plataforma/conteudo-vazio`;

module.exports = { REPO, RAW, GIT, CONTEUDO_VAZIO };
