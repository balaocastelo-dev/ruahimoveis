// Página inicial: link do sistema (#/...) abre a entrada; o resto vai para o portal de imóveis.
location.replace(location.hash && location.hash.length > 2 ? '/entrar' + location.hash : '/imoveis');
