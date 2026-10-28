// Processo separado do site, no PC: só as linhas de WhatsApp dos agentes (QR code) e a fila de envio.
// Fica fora do processo do site para que telas pesadas (vitrines, 3D, importações) não travem o WhatsApp.
// O server.js abre este processo e o reabre sozinho se ele cair.
process.title = 'ruah-escritorio';
// multi-imobiliária: as linhas e a fila rodam na imobiliária padrão (IMOBILIARIA_PADRAO, hoje 'ruah').
// TODO(fase1 · etapa plataforma): uma linha/fila por imobiliária ativa.
const tenant = require('../tenant');
tenant.comImobiliaria(tenant.padrao(), () => require('./escritorio').iniciar());
process.on('unhandledRejection', (e) => console.error(new Date().toLocaleTimeString('pt-BR'), '[escritório] erro solto:', e && e.message || e));
// Se o site fechar (ou for derrubado), este processo fecha junto: nunca ficam duas cópias segurando o mesmo WhatsApp.
process.on('disconnect', () => process.exit(0));
