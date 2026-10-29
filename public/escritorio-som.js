// Sons sintetizados, sem arquivos. O AudioContext nasce somente após gesto do usuário.
export function criaSom({ reduz, digitando, mudou = () => {} }) {
  let ligado = false, contexto = null, volume = null, teclado = null, ruido = null, fechado = false, ultimo = 0;
  const fontes = new Set();
  let reducao = reduz();
  try { ligado = localStorage.getItem('jg3d-som') === '1' && !reduz(); } catch {}
  function silencia() {
    clearInterval(teclado); teclado = null;
    for (const f of fontes) { try { f.stop(); } catch {} } fontes.clear();
  }
  function atualiza() {
    const atual = reduz();
    if (atual && ligado) { ligado = false; silencia(); contexto?.suspend().catch(() => {}); mudou(); }
    if (atual !== reducao) { reducao = atual; mudou(); }
  }
  function nota(freq, inicio, duracao, ganho = 0.12, tipo = 'sine') {
    const osc = contexto.createOscillator(), g = contexto.createGain();
    osc.type = tipo; osc.frequency.value = freq; osc.connect(g); g.connect(volume);
    const t = contexto.currentTime + inicio;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(ganho, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + duracao);
    fontes.add(osc); osc.onended = () => { fontes.delete(osc); osc.disconnect(); g.disconnect(); };
    osc.start(t); osc.stop(t + duracao + 0.01);
  }
  function tecla() {
    atualiza();
    if (!ligado || document.hidden || contexto?.state !== 'running' || !digitando()) return;
    const fonte = contexto.createBufferSource(), g = contexto.createGain(), filtro = contexto.createBiquadFilter();
    fonte.buffer = ruido; filtro.type = 'bandpass'; filtro.frequency.value = 1100 + Math.random() * 900; filtro.Q.value = 0.8;
    fonte.connect(filtro); filtro.connect(g); g.connect(volume);
    const t = contexto.currentTime; g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
    fontes.add(fonte); fonte.onended = () => { fontes.delete(fonte); fonte.disconnect(); filtro.disconnect(); g.disconnect(); };
    fonte.start(); fonte.stop(t + 0.03);
  }
  async function gesto() {
    atualiza(); if (!ligado || fechado) return;
    const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) { ligado = false; mudou(); return; }
    if (!contexto) {
      contexto = new Audio(); volume = contexto.createGain(); volume.gain.value = 0.055; volume.connect(contexto.destination);
      ruido = contexto.createBuffer(1, Math.ceil(contexto.sampleRate * 0.035), contexto.sampleRate);
      const amostras = ruido.getChannelData(0); for (let i = 0; i < amostras.length; i++) amostras[i] = Math.random() * 2 - 1;
    }
    try { await contexto.resume(); } catch { return; }
    if (!fechado && ligado && !teclado) teclado = setInterval(tecla, 155);
  }
  async function alterna() {
    if (reduz() || fechado) return;
    ligado = !ligado; try { localStorage.setItem('jg3d-som', ligado ? '1' : '0'); } catch {}
    mudou();
    if (ligado) await gesto(); else { silencia(); contexto?.suspend().catch(() => {}); }
  }
  function acao(tipo) {
    atualiza(); if (!ligado || document.hidden || contexto?.state !== 'running') return;
    if (performance.now() - ultimo < 300) return; ultimo = performance.now();
    if (tipo === 'venda') [261.63, 329.63, 392].forEach((f, i) => nota(f, i * 0.06, 1.1, 0.08));
    else if (tipo === 'lead') { for (const inicio of [0, 0.22]) { nota(440, inicio, 0.16, 0.08); nota(480, inicio, 0.16, 0.08); } }
    else { nota(880, 0, 0.25, 0.09); nota(1320, 0.04, 0.18, 0.035); }
  }
  function fecha() { fechado = true; silencia(); contexto?.close().catch(() => {}); ruido = null; volume = null; }
  return { gesto, alterna, acao, atualiza, fecha, get ligado() { return ligado; } };
}
