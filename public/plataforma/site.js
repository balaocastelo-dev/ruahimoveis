/* Herrera HOUSE IA — página de vendas: números contando, telas aparecendo, abas, a planta e o "Fale com a gente" pelo WhatsApp. */
(function () {
  document.documentElement.classList.add('js');
  var calmo = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // vídeo do 3D: sem movimento quando a pessoa pediu menos movimento; pausa fora da tela
  var video = document.querySelector('.palco video');
  if (video) {
    if (calmo) { video.removeAttribute('autoplay'); video.pause(); }
    else if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { var p = video.play(); if (p && p.catch) p.catch(function () {}); } else video.pause(); }); }, { threshold: 0.15 }).observe(video);
    }
  }

  // números contando quando aparecem
  function formata(n) { return Math.round(n).toLocaleString('pt-BR'); }
  var numeros = Array.prototype.slice.call(document.querySelectorAll('[data-conta]'));
  function conta(el) {
    var alvo = +el.dataset.conta, suf = el.dataset.suf || '', ini = null, dur = 1400;
    function passo(t) { if (ini === null) ini = t; var k = Math.min(1, (t - ini) / dur); var e = 1 - Math.pow(1 - k, 3); el.textContent = formata(alvo * e) + suf; if (k < 1) requestAnimationFrame(passo); }
    requestAnimationFrame(passo);
  }
  if (!calmo && 'IntersectionObserver' in window && numeros.length) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { conta(e.target); io.unobserve(e.target); } }); }, { threshold: 0.6 });
    numeros.forEach(function (n) { n.textContent = '0' + (n.dataset.suf || ''); io.observe(n); });
  }

  // blocos aparecendo ao rolar
  var revelar = Array.prototype.slice.call(document.querySelectorAll('.revelar'));
  if ('IntersectionObserver' in window && !calmo) {
    var ir = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('visto'); ir.unobserve(e.target); } }); }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revelar.forEach(function (r) { ir.observe(r); });
  } else revelar.forEach(function (r) { r.classList.add('visto'); });

  // a planta: toca no cômodo, a ficha mostra o que ele faz e leva à seção
  var fichas = {};
  document.querySelectorAll('.legenda-comodos li[data-comodo]').forEach(function (li) {
    fichas[li.dataset.comodo] = { titulo: li.querySelector('h3').textContent, texto: li.querySelector('p').textContent, ir: li.dataset.ir };
  });
  var ficha = document.getElementById('ficha');
  function mostra(chave) {
    var f = fichas[chave];
    if (!f || !ficha) return;
    document.querySelectorAll('.planta .comodo').forEach(function (c) { var s = c.dataset.comodo === chave; c.classList.toggle('ativo', s); c.setAttribute('aria-pressed', s ? 'true' : 'false'); });
    ficha.innerHTML = '';
    var h = document.createElement('h3'); h.textContent = f.titulo;
    var p = document.createElement('p'); p.textContent = f.texto;
    ficha.appendChild(h); ficha.appendChild(p);
    if (f.ir) { var a = document.createElement('a'); a.href = f.ir; a.textContent = 'Ver na página'; ficha.appendChild(a); }
  }
  document.querySelectorAll('.planta .comodo').forEach(function (c) {
    function age() {
      if (c.dataset.comodo === 'entrada') { document.getElementById('contato').scrollIntoView(); var n = document.querySelector('form.fale input'); if (n) n.focus({ preventScroll: true }); return; }
      mostra(c.dataset.comodo);
    }
    c.addEventListener('click', age);
    c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); age(); } });
  });
  mostra('escritorio');
  var planta = document.querySelector('.planta');
  if (planta && 'IntersectionObserver' in window && !calmo) {
    var ip = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { planta.classList.add('desenhar'); ip.disconnect(); } }, { threshold: 0.3 });
    ip.observe(planta);
  }

  // abas das telas (teclado: setas esquerda/direita)
  var abas = Array.prototype.slice.call(document.querySelectorAll('[data-abas] [role=tab]'));
  function abre(aba, foco) {
    abas.forEach(function (a) {
      var sel = a === aba;
      a.setAttribute('aria-selected', sel ? 'true' : 'false'); a.tabIndex = sel ? 0 : -1;
      var painel = document.getElementById(a.getAttribute('aria-controls')); if (painel) painel.hidden = !sel;
    });
    if (foco) aba.focus();
  }
  abas.forEach(function (a, i) {
    a.addEventListener('click', function () { abre(a); });
    a.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); abre(abas[(i + (e.key === 'ArrowRight' ? 1 : abas.length - 1)) % abas.length], true); }
    });
  });

  // Fale com a gente: abre o WhatsApp com a mensagem pronta (nada é gravado)
  var form = document.querySelector('form.fale');
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var d = new FormData(form);
    var linhas = ['Olá! Quero conhecer o Herrera HOUSE IA.', '',
      'Nome: ' + (d.get('nome') || ''),
      'Sou: ' + (d.get('perfil') || ''),
      'Cidade: ' + (d.get('cidade') || '')];
    if (d.get('mensagem')) linhas.push('', String(d.get('mensagem')));
    window.open('https://wa.me/' + form.dataset.whatsapp + '?text=' + encodeURIComponent(linhas.join('\n')), '_blank', 'noopener');
  });
  var ano = document.getElementById('ano'); if (ano) ano.textContent = new Date().getFullYear();
})();
