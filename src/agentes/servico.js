// Processo separado do site, no PC: só as linhas de WhatsApp dos agentes (QR code) e a fila de envio.
// Fica fora do processo do site para que telas pesadas (vitrines, 3D, importações) não travem o WhatsApp.
// O server.js (src/pc.js) abre um destes processos por imobiliária do PC e o reabre sozinho se ele cair.
//   node src/agentes/servico.js [<slug da imobiliária>]   (sem slug: IMOBILIARIA_PADRAO, hoje 'ruah')
const tenant = require('../tenant');
const slug = tenant.contexto(process.argv[2] || tenant.padrao().slug).slug;
// a RUAH mantém o nome de processo de sempre (scripts do PC procuram por ele); as outras levam o slug
process.title = slug === require('../pc').slugRaiz() ? 'ruah-escritorio' : `escritorio-${slug}`;
tenant.comImobiliaria(slug, () => require('./escritorio').iniciar());
process.on('unhandledRejection', (e) => console.error(new Date().toLocaleTimeString('pt-BR'), `[escritório ${slug}] erro solto:`, e && e.message || e));
// Se o site fechar (ou for derrubado), este processo fecha junto: nunca ficam duas cópias segurando o mesmo WhatsApp.
process.on('disconnect', () => process.exit(0));
