// Enxuga os GLB: nas animações ficam só as rotações (e a posição do Pelvis); malha quantizada; sem lixo.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, quantize, resample } from '@gltf-transform/functions';
const [entrada, saida] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(entrada);
let tirados = 0;
for (const anim of doc.getRoot().listAnimations()) {
  for (const ch of anim.listChannels()) {
    const alvo = ch.getTargetNode(); const path = ch.getTargetPath();
    const fica = path === 'rotation' || (path === 'translation' && alvo && /Pelvis/.test(alvo.getName()));
    if (!fica) { const s = ch.getSampler(); ch.dispose(); if (s) s.dispose(); tirados++; }
  }
}
await doc.transform(resample({ tolerance: 1e-4 }), dedup(), prune(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeColor: 8, quantizeWeight: 8 }));
await io.write(saida, doc);
const fs = await import('node:fs');
console.log(`ok ${saida} canais tirados=${tirados} ${(fs.statSync(saida).size / 1024).toFixed(0)} KB`);
