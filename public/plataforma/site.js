/* Herrera HOUSE IA — página de vendas: a planta interativa e o "Fale com a gente" pelo WhatsApp. */
(function () {
  var fichas = {};
  document.querySelectorAll('.legenda li[data-comodo]').forEach(function (li) {
    fichas[li.dataset.comodo] = { titulo: li.querySelector('h3').textContent, texto: li.querySelector('p').textContent, li: li };
  });
  var ficha = document.getElementById('ficha');
  function mostra(chave) {
    var f = fichas[chave];
    if (!f || !ficha) return;
    document.querySelectorAll('.planta .comodo').forEach(function (c) { c.classList.toggle('ativo', c.dataset.comodo === chave); c.setAttribute('aria-pressed', c.dataset.comodo === chave ? 'true' : 'false'); });
    document.querySelectorAll('.legenda li').forEach(function (li) { li.classList.toggle('ativo', li === f.li); });
    ficha.innerHTML = '';
    var h = document.createElement('h3'); h.textContent = f.titulo;
    var p = document.createElement('p'); p.textContent = f.texto;
    ficha.appendChild(h); ficha.appendChild(p);
  }
  document.querySelectorAll('.planta .comodo').forEach(function (c) {
    function age() {
      if (c.dataset.comodo === 'entrada') { document.getElementById('contato').scrollIntoView(); var n = document.querySelector('form.fale input'); if (n) n.focus({ preventScroll: true }); return; }
      mostra(c.dataset.comodo);
    }
    c.addEventListener('click', age);
    c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); age(); } });
  });
  mostra('captacao');

  var form = document.querySelector('form.fale');
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var d = new FormData(form);
    var linhas = ['Olá! Quero conhecer o Herrera HOUSE IA.', '',
      'Nome: ' + (d.get('nome') || ''),
      'Sou: ' + (d.get('perfil') || ''),
      'Cidade: ' + (d.get('cidade') || '')];
    if (d.get('mensagem')) linhas.push('', String(d.get('mensagem')));
    var numero = form.dataset.whatsapp;
    window.open('https://wa.me/' + numero + '?text=' + encodeURIComponent(linhas.join('\n')), '_blank', 'noopener');
  });
  var ano = document.getElementById('ano'); if (ano) ano.textContent = new Date().getFullYear();
})();
