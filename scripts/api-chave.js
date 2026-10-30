// Cria uma chave de API pelo PC (sem precisar da tela): node scripts/api-chave.js "Claude" [escopos] [--leitura]
// Lista: node scripts/api-chave.js --listar · Revoga: node scripts/api-chave.js --revogar <id>
const K = require('../src/api-ia/chaves');
const { one, all } = require('../src/db');

const arg = process.argv.slice(2);
if (arg[0] === '--listar') { console.table(K.lista().map(({ chave_hash, ...c }) => c)); process.exit(0); }
if (arg[0] === '--revogar') { console.log(K.revogar(Number(arg[1]))); process.exit(0); }

const nome = arg[0] || 'Chave de IA';
const escopos = arg[1] && !arg[1].startsWith('--') ? arg[1] : '*';
const leitura = arg.includes('--leitura');
const u = one("SELECT id,nome FROM usuarios WHERE perfil='adm' AND ativo=1 ORDER BY id LIMIT 1");
if (!u) { console.error('Nenhum administrador no sistema. Crie o primeiro acesso antes.'); process.exit(1); }
const nova = K.criar({ nome, usuarioId: u.id, escopos, somente_leitura: leitura, criadaPor: u.id });
console.log(`\n  Chave criada para ${u.nome} (${nova.escopos.join(', ')}${leitura ? ', só leitura' : ''}):\n`);
console.log('   ' + nova.chave);
console.log('\n  Guarde agora: ela não aparece de novo.\n  Use assim:  curl -H "Authorization: Bearer <chave>" <endereço>/api/ia/manifesto\n');
