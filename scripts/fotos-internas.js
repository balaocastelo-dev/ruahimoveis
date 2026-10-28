// Completa a carteira: todo imóvel sem nenhuma foto recebe as fotos internas do anúncio de origem (Fisgar/Radar) ou a fachada.
// Uso: node scripts/fotos-internas.js
const FI = require('../src/services/fotos-internas');
console.log(FI.completaCarteira());
process.exit(0);
