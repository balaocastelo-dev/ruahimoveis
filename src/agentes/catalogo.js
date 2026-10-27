// Escritório virtual: os 9 agentes robôs da RUAH, cada um com setor, alma (.soul) e linha de WhatsApp.
// A alma padrão fica em src/agentes/almas/<NN>-<slug>.soul; a versão editada na tela fica no banco.
const fs = require('fs');
const path = require('path');

const AGENTES = [
  { slug: 'captador', n: 1, nome: 'TH-IA-GO', cargo: 'Captador de oportunidades', tipo: 'captacao', sigla: 'TH', cor: '#a8823c',
    resumo: 'Acha o dono do imóvel anunciado, confirma o interesse e pede as fotos originais.', setor: 'Base do Fisguei e do Radar' },
  { slug: 'apartamentos', n: 2, nome: 'Ana', cargo: 'Corretora de apartamentos', tipo: 'cliente', sigla: 'AN', cor: '#2f5f8a',
    resumo: 'Atende quem procura apartamento, cobertura, studio ou flat.', setor: 'Apartamentos' },
  { slug: 'comerciais', n: 3, nome: 'Bruno', cargo: 'Corretor de galpões e salas', tipo: 'cliente', sigla: 'BR', cor: '#5b6470',
    resumo: 'Galpões, barracões, salas, lojas, prédios e pontos comerciais.', setor: 'Galpões e salas' },
  { slug: 'terrenos', n: 4, nome: 'Teo', cargo: 'Corretor de terrenos', tipo: 'cliente', sigla: 'TE', cor: '#6f7d3a',
    resumo: 'Terrenos e lotes, em condomínio ou rua aberta.', setor: 'Terrenos' },
  { slug: 'casas', n: 5, nome: 'Clara', cargo: 'Corretora de casas até R$ 2 mi', tipo: 'cliente', sigla: 'CL', cor: '#2f7d4f',
    resumo: 'Casas, sobrados e casas em condomínio até R$ 2.000.000.', setor: 'Casas até R$ 2 mi' },
  { slug: 'alto-padrao', n: 6, nome: 'Helena', cargo: 'Corretora de alto padrão', tipo: 'cliente', sigla: 'HE', cor: '#7a4b8c',
    resumo: 'Casas acima de R$ 2 mi e apartamentos de luxo.', setor: 'Alto padrão' },
  { slug: 'offmarket', n: 7, nome: 'Vicente', cargo: 'Corretor Off-market Exclusive', tipo: 'cliente', sigla: 'VI', cor: '#22252a',
    resumo: 'Imóveis vendidos sem anúncio público. Só link privado aprovado.', setor: 'Off-market' },
  { slug: 'gerente', n: 8, nome: 'Augusto', cargo: 'Gerente geral · fala com o dono', tipo: 'interno', sigla: 'AU', cor: '#a63d32',
    resumo: 'Passa ao dono do portal tudo o que aconteceu no dia e avisa do que precisa de decisão.', setor: 'Dono do portal' },
  { slug: 'gerente-corretores', n: 9, nome: 'Marta', cargo: 'Gerente dos corretores', tipo: 'interno', sigla: 'MA', cor: '#9a6a10',
    resumo: 'Avisa os corretores de visitas, oportunidades e leads; lembra os afazeres.', setor: 'Equipe de corretores' },
];
const POR_SLUG = Object.fromEntries(AGENTES.map((a) => [a.slug, a]));
const CLIENTE = AGENTES.filter((a) => a.tipo === 'cliente').map((a) => a.slug);

const PASTA = path.join(__dirname, 'almas');
const arquivoAlma = (slug) => {
  const a = POR_SLUG[slug];
  return a ? path.join(PASTA, `${String(a.n).padStart(2, '0')}-${slug}.soul`) : null;
};
function almaPadrao(slug) {
  const f = arquivoAlma(slug);
  try { return fs.readFileSync(f, 'utf8'); } catch { return ''; }
}

// Separa o cabeçalho (--- chave: valor ---) do corpo da alma.
function lerAlma(texto) {
  const t = String(texto || '').replace(/\r\n/g, '\n');
  const m = t.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const cab = {};
  if (m) for (const l of m[1].split('\n')) { const x = l.match(/^\s*([a-z_]+)\s*:\s*(.*)$/i); if (x) cab[x[1].toLowerCase()] = x[2].trim(); }
  return { cabecalho: cab, corpo: (m ? m[2] : t).trim() };
}

module.exports = { AGENTES, POR_SLUG, CLIENTE, almaPadrao, arquivoAlma, lerAlma };
