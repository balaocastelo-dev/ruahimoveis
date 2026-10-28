#!/usr/bin/env bash
# Herrera HOUSE IA · ensaio LOCAL da migração fase 1 (multi-imobiliária). NUNCA toca no banco online:
# sobe um Postgres 16 temporário nesta máquina (diretório temporário, porta livre, só 127.0.0.1), monta o schema "ruah"
# como na produção, roda sql/migracao/01 e 02, confere, desfaz com 09, confere de novo, repete 01+02 (idempotência)
# e roda os testes do sistema contra esse Postgres (MULTI=1, IMOBILIARIA_PADRAO=ruah). No fim desliga e apaga tudo.
#
# Uso:   bash scripts/ensaio-migracao.sh            (MANTER=1 deixa o cluster no ar para olhar; TESTES="painel fisguei" escolhe)
# Requer: /usr/lib/postgresql/16/bin (initdb, pg_ctl), /usr/bin/psql, node 22 e node_modules instalado.
# Como root: o Postgres não roda como root; o cluster é criado e ligado com o usuário "postgres" (runuser).
set -uo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PSQL="${PSQL:-/usr/bin/psql}"
APP_ROLE=ruah_app
APP_SENHA=ensaio_local_123
# Testes que aceitam DATABASE_URL (sobem o server.js ou usam src/db). Ficam de fora: bairros, condominios, mercado, og,
# portal e versoes (apagam DATABASE_URL de propósito: são só SQLite), isolamento e catalogo-tabelas (SQLite direto)
# e sql-tenant (não usa banco).
TESTES_PADRAO="smoke painel blog fisguei fisguei-inteligente escritorio radar alertas vigia"
TESTES="${TESTES:-$TESTES_PADRAO}"

# ---- trava de segurança: este script só fala com o Postgres que ele mesmo criou ----
unset DATABASE_URL PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSERVICE
[ -f "$RAIZ/.env" ] && grep -q '^DATABASE_URL=' "$RAIZ/.env" && echo "aviso: .env tem DATABASE_URL; o ensaio sobrepõe com a URL local em cada comando."

FALHAS=0; OKS=0
ok()    { OKS=$((OKS+1)); printf '  \033[32mok\033[0m  %s\n' "$*"; }
falha() { FALHAS=$((FALHAS+1)); printf '  \033[31mFALHOU\033[0m  %s\n' "$*"; }
titulo(){ printf '\n\033[1m== %s\033[0m\n' "$*"; }
ms()    { date +%s%3N; }
declare -a TEMPOS=()
cronometra() { # cronometra "rótulo" comando...
  local r="$1"; shift; local t0; t0=$(ms); "$@"; local rc=$?; local dt=$(( $(ms) - t0 ))
  TEMPOS+=("$(printf '%-44s %6d ms%s' "$r" "$dt" "$([ $rc -ne 0 ] && echo '  (erro)')")"); return $rc
}

# ---- 0. cluster temporário ----
COMO=()
if [ "$(id -u)" = 0 ]; then
  id postgres >/dev/null 2>&1 || { echo "Rodando como root e sem usuário 'postgres': crie um usuário comum e rode com ele."; exit 2; }
  COMO=(runuser -u postgres --)
fi
DIR="$(mktemp -d /tmp/ensaio-migracao.XXXXXX)"; chmod 755 "$DIR"
[ ${#COMO[@]} -gt 0 ] && chown postgres "$DIR"
PORTA="$(node -e "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})")"
LOG="$DIR/log"; mkdir -p "$LOG"; chmod 777 "$LOG"

limpa() {
  local rc=$?
  if [ "${MANTER:-0}" = 1 ]; then echo "MANTER=1: cluster no ar em 127.0.0.1:$PORTA (dados em $DIR). Para parar: ${COMO[*]} $PGBIN/pg_ctl -D $DIR/dados stop; rm -rf $DIR"; exit $rc; fi
  "${COMO[@]}" "$PGBIN/pg_ctl" -D "$DIR/dados" -m fast stop >/dev/null 2>&1
  rm -rf "$DIR"
  exit $rc
}
trap limpa EXIT INT TERM

titulo "0. Postgres temporário (porta $PORTA, $DIR)"
cronometra "0 initdb" "${COMO[@]}" "$PGBIN/initdb" -D "$DIR/dados" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >"$LOG/initdb.txt" 2>&1 \
  || { cat "$LOG/initdb.txt"; exit 1; }
cronometra "0 pg_ctl start" "${COMO[@]}" "$PGBIN/pg_ctl" -D "$DIR/dados" -l "$LOG/postgres.txt" -w \
  -o "-p $PORTA -k $DIR -c listen_addresses=127.0.0.1 -c fsync=off -c timezone=UTC" start >/dev/null \
  || { cat "$LOG/postgres.txt"; exit 1; }
ok "Postgres $("$PSQL" -XAtq -h 127.0.0.1 -p "$PORTA" -U postgres -d postgres -c 'SHOW server_version') no ar"

adm()  { local db="$1"; shift; "$PSQL" -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORTA" -U postgres -d "$db" "$@"; }
admv() { adm "$1" -At -c "$2"; }                                   # um valor
app()  { PGPASSWORD=$APP_SENHA "$PSQL" -X -q -At -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORTA" -U "$APP_ROLE" -d "$1" -c "$2"; }
url()  { echo "postgres://$APP_ROLE:$APP_SENHA@127.0.0.1:$PORTA/$1?sslmode=disable"; }
mig()  { local f="$1"; shift; adm ensaio -v app_role="$APP_ROLE" "$@" -f "$RAIZ/sql/migracao/$f" >>"$LOG/migracao.txt" 2>&1; }

# ---- 1. banco "ensaio" igual à produção de hoje (schema ruah + papel ruah_app) ----
titulo "1. Montando o schema ruah como na produção"
monta() {
  adm postgres -c "CREATE ROLE $APP_ROLE LOGIN PASSWORD '$APP_SENHA'" -c "CREATE DATABASE ensaio" &&
  # como no Supabase: extensões no schema "extensions"; papel do app com search_path = ruah, extensions
  adm ensaio -c "CREATE SCHEMA extensions; CREATE EXTENSION citext SCHEMA extensions; CREATE EXTENSION pg_trgm SCHEMA extensions;
                 GRANT USAGE ON SCHEMA extensions TO $APP_ROLE;
                 ALTER ROLE $APP_ROLE SET search_path = ruah, extensions;" &&
  # mesma ordem em que entraram na produção (condominios.sql cria cond_checado, usado por índices de fisguei.sql)
  for f in schema condominios fisguei escritorio bairros; do
    adm ensaio -f "$RAIZ/sql/$f.sql" >>"$LOG/schema.txt" 2>&1 || { echo "erro em sql/$f.sql"; tail -5 "$LOG/schema.txt"; return 1; }
  done &&
  adm ensaio -c "GRANT USAGE ON SCHEMA ruah TO $APP_ROLE;
                 GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ruah TO $APP_ROLE;
                 GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ruah TO $APP_ROLE;
                 GRANT EXECUTE ON FUNCTION ruah.agora() TO $APP_ROLE;"
}
cronometra "1 schema ruah (sql/*.sql)" monta || { falha "montar schema"; exit 1; }
ok "sql/schema.sql, condominios.sql, fisguei.sql, escritorio.sql, bairros.sql aplicados ($(admv ensaio "SELECT count(*) FROM pg_tables WHERE schemaname='ruah'") tabelas em ruah)"

# dados de exemplo pequenos, inclusive os vínculos entre comum e privada nos dois sentidos
dados() {
  adm ensaio >>"$LOG/schema.txt" 2>&1 <<'SQL'
SET search_path = ruah, extensions;
INSERT INTO usuarios(nome,email,perfil,senha_hash) VALUES ('Adm','adm@ruah.com','adm','x'),('Corretor','c@ruah.com','corretor','x');
INSERT INTO tentativas_login VALUES ('adm@ruah.com', 2, 0);
INSERT INTO config VALUES ('empresa','RUAH');
INSERT INTO condominios(nome,cep,numero,bairro,cidade,uf,slug,lat,lon) VALUES
  ('Edifício Cambuí','13025000','100','Cambuí','Campinas','SP','ed-cambui',-22.89,-47.05),
  ('Residencial Taquaral','13076000','50','Taquaral','Campinas','SP','res-taquaral',-22.87,-47.04);
INSERT INTO condominio_cache VALUES (1,'resumo','{"ok":1}', ruah.agora());
INSERT INTO predios3d(tile,dados) VALUES ('t1','\x0102'::bytea);
INSERT INTO mapa3d(tile,dados) VALUES ('m1','\x03'::bytea);
INSERT INTO pois(cat,nome,lat,lon) VALUES ('escola','Escola X',-22.9,-47.0);
INSERT INTO fachadas(ref,img) VALUES ('f1','\x04'::bytea);
INSERT INTO bairros(slug,nome) VALUES ('cambui','Cambuí'),('taquaral','Taquaral');
INSERT INTO bairro_commons(titulo,ok) VALUES ('File:Cambui.jpg',1);
INSERT INTO proprietarios(nome) VALUES ('Dono');
INSERT INTO imoveis(codigo,tipo,bairro,cidade,condominio_id,corretor_id,proprietario_id,valor) VALUES ('RU001','apartamento','Cambuí','Campinas',1,2,1,900000);
INSERT INTO oportunidades(portal,titulo,condominio_id,corretor_id) VALUES ('zap','Apto Cambuí',1,2);
INSERT INTO leads(nome,telefone,corretor_id) VALUES ('Cliente','19999990000',2);
INSERT INTO fisguei_anuncios(fisgar_id,portal,titulo,bairro,valor,oportunidade_id,imovel_id,condominio_id) VALUES
  ('a1','zap','Apto 1','Cambuí',800000,1,1,1),('a2','olx','Casa 2','Taquaral',600000,NULL,NULL,2),('a3','viva','Apto 3','Centro',300000,NULL,NULL,NULL);
INSERT INTO fisguei_precos(anuncio_id,valor) VALUES (1,850000),(1,800000),(2,600000);
INSERT INTO fisguei_pessoas(anuncio_id,chave,nome) VALUES (1,'p1','Fulano');
INSERT INTO fisguei_pedidos(anuncio_id,pessoa_id) VALUES (1,1);
INSERT INTO agente_midias(agente,anuncio_id,oportunidade_id,dados) VALUES ('thiago',1,1,'\x05'::bytea);
INSERT INTO condominio_alertas(condominio_id,origem,ref_id) VALUES (1,'anuncio',1);
SQL
}
cronometra "1 dados de exemplo" dados && ok "dados de exemplo inseridos" || { falha "dados de exemplo"; tail -5 "$LOG/schema.txt"; exit 1; }

COMUNS_EXISTENTES="condominios condominio_cache predios3d mapa3d pois fachadas bairro_commons bairros fisguei_anuncios fisguei_precos tentativas_login"
# confere a lista contra src/tabelas.js (as comuns que existem no ruah do ensaio)
LISTA_JS="$(cd "$RAIZ" && node -e "const t=require('./src/tabelas');console.log([...t.COMUNS].join(' '))")"
EXIST="$(admv ensaio "SELECT string_agg(tablename,' ' ORDER BY tablename) FROM pg_tables WHERE schemaname='ruah' AND tablename = ANY(string_to_array('$LISTA_JS',' '))")"
[ "$(tr ' ' '\n' <<<"$EXIST" | sort | xargs)" = "$(tr ' ' '\n' <<<"$COMUNS_EXISTENTES" | sort | xargs)" ] \
  && ok "comuns de src/tabelas.js existentes em ruah = $(wc -w <<<"$EXIST") tabelas (as 6 da plataforma ainda não existem)" \
  || falha "lista de comuns diferente do esperado: $EXIST"

contagens() { admv ensaio "SELECT string_agg(format('%s=%s', relname, n), ' ' ORDER BY relname) FROM (
  SELECT c.relname, (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) n FROM %I.%I', ns.nspname, c.relname), false, true, '')))[1]::text::int n
  FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE ns.nspname IN ('ruah','base') AND c.relkind='r' AND c.relname <> '_migracao_fase1') x"; }
onde() { admv ensaio "SELECT string_agg(format('%s.%s', schemaname, tablename), ' ' ORDER BY tablename) FROM pg_tables WHERE schemaname IN ('ruah','base') AND tablename = ANY(string_to_array('$COMUNS_EXISTENTES',' '))"; }
estrutura() { "${COMO[@]}" "$PGBIN/pg_dump" -s -h 127.0.0.1 -p "$PORTA" -U postgres ensaio 2>/dev/null | grep -v -e '^--' -e '^\\restrict' -e '^\\unrestrict' | sed '/^$/d'; }
papel_sp() { admv postgres "SELECT coalesce((SELECT c FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole, unnest(s.setconfig) c WHERE r.rolname='$APP_ROLE' AND c LIKE 'search_path=%'),'(nenhum)')"; }

CONT0="$(contagens)"; ESTR0="$(estrutura)"; SP0="$(papel_sp)"
echo "$ESTR0" >"$LOG/estrutura-original.sql"

verifica_migrado() { # $1 = rótulo
  local r="$1" t errado=0
  for t in $COMUNS_EXISTENTES; do
    [ "$(admv ensaio "SELECT to_regclass('base.$t') IS NOT NULL AND to_regclass('ruah.$t') IS NULL")" = t ] || { errado=1; echo "    $t não está só em base"; }
  done
  [ $errado = 0 ] && ok "$r: as 11 comuns estão em base e não em ruah" || falha "$r: comuns fora de base"
  local priv; priv="$(admv ensaio "SELECT count(*) FROM pg_tables WHERE schemaname='base' AND tablename <> '_migracao_fase1' AND tablename <> ALL(string_to_array('$COMUNS_EXISTENTES',' '))")"
  local nruah; nruah="$(admv ensaio "SELECT count(*) FROM pg_tables WHERE schemaname='ruah'")"
  [ "$priv" = 0 ] && [ "$nruah" = 28 ] && ok "$r: as 28 privadas continuam em ruah, nenhuma foi para base" || falha "$r: privadas: $nruah em ruah, $priv estranhas em base"
  [ "$(contagens)" = "$CONT0" ] && ok "$r: contagens de linhas iguais às de antes (todas as 39 tabelas)" || falha "$r: contagens mudaram: $(contagens)"
  [ "$(papel_sp)" = "search_path=ruah, base, extensions" ] && ok "$r: search_path do $APP_ROLE = ruah, base, extensions" || falha "$r: search_path do papel = $(papel_sp)"
  # o app lê pelas duas formas: nome qualificado (código novo, MULTI=1) e nome solto pelo search_path (código antigo)
  local a b c d
  a="$(app ensaio "SELECT count(*) FROM condominios")"; b="$(app ensaio "SELECT count(*) FROM base.condominios")"
  c="$(app ensaio "SELECT count(*) FROM imoveis")";     d="$(app ensaio "SELECT count(*) FROM ruah.imoveis")"
  [ "$a" = 2 ] && [ "$b" = 2 ] && [ "$c" = 1 ] && [ "$d" = 1 ] && ok "$r: $APP_ROLE lê condominios (solto e base.) e imoveis (solto e ruah.)" || falha "$r: leitura do app: $a/$b/$c/$d"
  # o app escreve (GRANT + identity + DEFAULT base.agora()) e as FKs privada → comum seguem valendo entre schemas
  if app ensaio "INSERT INTO pois(cat,nome,lat,lon) VALUES ('t','ensaio',0,0); INSERT INTO base.fisguei_precos(anuncio_id,valor) VALUES (2,1);
                 INSERT INTO tentativas_login VALUES ('ensaio',1,0);
                 UPDATE fisguei_anuncios SET valor=valor WHERE id=1;
                 DELETE FROM pois WHERE nome='ensaio'; DELETE FROM base.fisguei_precos WHERE valor=1; DELETE FROM tentativas_login WHERE chave='ensaio'" >/dev/null 2>"$LOG/app-escrita.txt"; then
    ok "$r: $APP_ROLE escreve nas comuns (INSERT/UPDATE/DELETE, identity e DEFAULT base.agora())"
  else falha "$r: escrita do app: $(cat "$LOG/app-escrita.txt")"; fi
  if ! app ensaio "INSERT INTO imoveis(codigo,tipo,condominio_id) VALUES ('X1','casa',999)" >/dev/null 2>&1 \
     && [ "$(admv ensaio "SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid='base.condominios'::regclass AND connamespace='ruah'::regnamespace")" = 3 ]; then
    ok "$r: FKs privada → comum (imoveis/oportunidades/alertas → base.condominios) continuam ativas"
  else falha "$r: FK privada → comum não está valendo"; fi
  [ "$(admv ensaio "SELECT count(*) FROM pg_constraint c WHERE contype='f' AND conrelid='base.fisguei_anuncios'::regclass AND confrelid::regclass::text LIKE 'ruah.%'")" = 0 ] \
    && ok "$r: nenhuma FK comum → privada sobrou (fisguei_anuncios.oportunidade_id/imovel_id anotadas em base._migracao_fase1)" \
    || falha "$r: ainda há FK de base.fisguei_anuncios para ruah"
  [ "$(admv ensaio "SELECT count(*) FROM pg_attrdef d JOIN pg_class c ON c.oid=d.adrelid WHERE c.relnamespace='base'::regnamespace AND pg_get_expr(d.adbin,d.adrelid) LIKE '%ruah.%'")" = 0 ] \
    && ok "$r: nenhum DEFAULT de tabela comum depende do schema ruah" || falha "$r: DEFAULT em base ainda usa ruah.agora()"
}

# ---- 2. passo 1 com uma conexão antiga do app aberta (deve ser derrubada) ----
titulo "2. Migração: 01-preparar e 02-mover-comuns"
PGPASSWORD=$APP_SENHA "$PSQL" -X -q -h 127.0.0.1 -p "$PORTA" -U "$APP_ROLE" -d ensaio -c "SELECT pg_sleep(30)" >/dev/null 2>&1 &
PID_VELHA=$!; sleep 0.5
cronometra "2 01-preparar.sql" mig 01-preparar.sql && ok "01-preparar rodou" || { falha "01-preparar"; tail -20 "$LOG/migracao.txt"; exit 1; }
sleep 0.3
if ! kill -0 $PID_VELHA 2>/dev/null; then ok "01: conexão do app aberta antes (search_path antigo) foi derrubada"; else falha "01: conexão antiga do app continua aberta"; kill $PID_VELHA 2>/dev/null; fi
wait $PID_VELHA 2>/dev/null
[ "$(admv ensaio "SELECT count(*) FROM pg_class WHERE relnamespace='base'::regnamespace AND relkind='r' AND relname<>'_migracao_fase1'")" = 0 ] \
  && [ "$(admv ensaio "SELECT base.agora() ~ '^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$'")" = t ] \
  && ok "01: schema base vazio criado, base.agora() funciona" || falha "01: base não ficou como esperado"
[ "$(app ensaio "SELECT has_schema_privilege('base','USAGE') AND has_function_privilege('base.agora()','EXECUTE')")" = t ] \
  && ok "01: $APP_ROLE tem USAGE em base e EXECUTE em base.agora()" || falha "01: GRANTs em base"

# lock_timeout: com uma consulta segurando condominios, o 02 desiste em ~3 s e não move nada
PGPASSWORD=$APP_SENHA "$PSQL" -X -q -h 127.0.0.1 -p "$PORTA" -U "$APP_ROLE" -d ensaio -c "BEGIN; LOCK TABLE condominios IN ACCESS SHARE MODE; SELECT pg_sleep(8); COMMIT;" >/dev/null 2>&1 &
PID_TRAVA=$!; sleep 0.5
t0=$(ms); mig 02-mover-comuns.sql; rc=$?; dt=$(( $(ms) - t0 ))
TEMPOS+=("$(printf '%-44s %6d ms' "2 02 com tabela travada (deve desistir)" "$dt")")
if [ $rc -ne 0 ] && grep -q "lock timeout" "$LOG/migracao.txt" && [ "$(onde | grep -c 'base\.')" = 0 ]; then
  ok "02 com condominios travada: desistiu em ${dt} ms (lock_timeout 3s) e não moveu nada"
else falha "02 com tabela travada: rc=$rc, onde=$(onde)"; fi
wait $PID_TRAVA 2>/dev/null

cronometra "2 02-mover-comuns.sql" mig 02-mover-comuns.sql && ok "02-mover-comuns rodou" || { falha "02-mover-comuns"; tail -20 "$LOG/migracao.txt"; exit 1; }
grep -o "FK removida[^\[]*" "$LOG/migracao.txt" | sort -u | sed 's/^/        /'
verifica_migrado "após 01+02"

# ---- 3. rollback ----
titulo "3. Rollback (09) e conferência com o original"
cronometra "3 09-rollback.sql" mig 09-rollback.sql && ok "09-rollback rodou" || { falha "09-rollback"; tail -20 "$LOG/migracao.txt"; }
cronometra "3 09-rollback.sql (2ª vez, idempotente)" mig 09-rollback.sql && ok "09-rollback de novo: sem erro (idempotente)" || falha "09-rollback 2ª vez"
[ "$(admv ensaio "SELECT to_regnamespace('base') IS NULL")" = t ] && ok "schema base removido" || falha "schema base ficou"
[ "$(onde | grep -c 'base\.')" = 0 ] && ok "as 11 comuns voltaram para ruah" || falha "comuns ainda em base: $(onde)"
[ "$(contagens)" = "$CONT0" ] && ok "contagens iguais às originais" || falha "contagens: $(contagens)"
[ "$(papel_sp)" = "$SP0" ] && ok "search_path do $APP_ROLE voltou a: ${SP0#search_path=}" || falha "search_path do papel = $(papel_sp) (era $SP0)"
estrutura >"$LOG/estrutura-pos-rollback.sql"
if diff -u <(sort "$LOG/estrutura-original.sql") <(sort "$LOG/estrutura-pos-rollback.sql") >"$LOG/estrutura.diff"; then
  ok "estrutura do banco (pg_dump -s) idêntica à original: tabelas, índices, FKs, DEFAULTs, GRANTs"
else falha "estrutura difere da original (ver diff):"; head -30 "$LOG/estrutura.diff"; fi
[ "$(app ensaio "SELECT count(*) FROM condominios")" = 2 ] && ok "$APP_ROLE lê condominios de novo pelo search_path antigo" || falha "app não lê após rollback"

# ---- 4. de novo, duas vezes (idempotência) ----
titulo "4. 01+02 de novo, e mais uma vez (idempotência)"
cronometra "4 01-preparar.sql (de novo)" mig 01-preparar.sql && cronometra "4 02-mover-comuns.sql (de novo)" mig 02-mover-comuns.sql \
  && ok "01+02 de novo depois do rollback" || falha "01+02 depois do rollback"
cronometra "4 01-preparar.sql (3ª, nada a fazer)" mig 01-preparar.sql && cronometra "4 02-mover-comuns.sql (3ª, nada a fazer)" mig 02-mover-comuns.sql \
  && ok "01+02 sobre banco já migrado: sem erro, nada muda" || falha "01+02 repetidos"
[ "$(admv ensaio "SELECT valor FROM base._migracao_fase1 WHERE chave='search_path_antigo'")" = "ruah, extensions" ] \
  && ok "o search_path antigo anotado continua o original (não foi sobrescrito pela repetição)" || falha "search_path_antigo anotado errado"
verifica_migrado "após repetição"

# ---- 5. passo 3: tabelas novas da plataforma (das outras frentes), se já estiverem neste ramo ----
titulo "5. Passo 3 (sql/plataforma.sql e sql/plataforma-mistas.sql)"
for f in plataforma plataforma-mistas; do
  if [ -f "$RAIZ/sql/$f.sql" ]; then
    cronometra "5 sql/$f.sql" adm ensaio -f "$RAIZ/sql/$f.sql" >>"$LOG/migracao.txt" 2>&1 && ok "sql/$f.sql aplicado" || falha "sql/$f.sql"
  else echo "  (sql/$f.sql ainda não existe neste ramo: passo 3 não ensaiado)"; fi
done

# ---- 6. o sistema contra o Postgres migrado ----
titulo "6. Testes do sistema no Postgres migrado"
# banco modelo = estrutura migrada, sem linhas; cada teste ganha uma cópia limpa (os testes começam pelo /api/setup)
adm postgres -c "CREATE DATABASE modelo TEMPLATE ensaio" &&
adm modelo -c "DO \$\$ DECLARE l text; BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') INTO l FROM pg_tables WHERE schemaname IN ('ruah','base') AND tablename <> '_migracao_fase1';
  EXECUTE 'TRUNCATE ' || l || ' RESTART IDENTITY CASCADE'; END \$\$" || falha "banco modelo"
declare -A RES
roda_teste() { # $1 teste, $2 MULTI (1|0)
  local t="$1" m="$2" db="t_${1//-/_}_$2"
  adm postgres -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db TEMPLATE modelo" || return 1
  ( cd "$RAIZ" && env DATABASE_URL="$(url "$db")" MULTI="$m" IMOBILIARIA_PADRAO=ruah PG_POOL_MAX=3 \
      timeout 300 node --disable-warning=ExperimentalWarning "test/$t.js" ) >"$LOG/teste-$t-$m.txt" 2>&1
}
for m in 1 0; do
  for t in $TESTES; do
    [ -f "$RAIZ/test/$t.js" ] || continue
    t0=$(ms)
    if roda_teste "$t" "$m"; then RES[$t-$m]=ok; ok "MULTI=$m test/$t.js ($(( $(ms) - t0 )) ms)"
    else RES[$t-$m]=falhou; falha "MULTI=$m test/$t.js ($(( $(ms) - t0 )) ms) — últimas linhas:"; tail -6 "$LOG/teste-$t-$m.txt" | sed 's/^/        /'; fi
    TEMPOS+=("$(printf '%-44s %6d ms' "6 MULTI=$m test/$t.js" "$(( $(ms) - t0 ))")")
  done
done
# prova de que os testes falaram com o Postgres (e não com um SQLite): o painel deixou usuários no banco dele
[ "$(admv t_painel_1 "SELECT count(*) FROM ruah.usuarios" 2>/dev/null)" -ge 1 ] 2>/dev/null \
  && ok "test/painel.js (MULTI=1) gravou em ruah.usuarios do Postgres local ($(admv t_painel_1 "SELECT count(*) FROM ruah.usuarios") usuários)" \
  || echo "  (não deu para conferir t_painel_1)"

[ "$(admv t_fisguei_1 "SELECT count(*) FROM base.fisguei_anuncios" 2>/dev/null)" -ge 1 ] 2>/dev/null \
  && ok "test/fisguei.js (MULTI=1) gravou em base.fisguei_anuncios ($(admv t_fisguei_1 "SELECT count(*) FROM base.fisguei_anuncios") anúncios) e em ruah.fisguei_pessoas ($(admv t_fisguei_1 "SELECT count(*) FROM ruah.fisguei_pessoas"))" \
  || echo "  (não deu para conferir t_fisguei_1)"

# ---- 7. sem a muleta do search_path: só o prefixo do MULTI=1 acha as tabelas (estado do passo 5) ----
titulo "7. MULTI=1 com search_path do papel = extensions (sem ruah/base)"
adm postgres -c "ALTER ROLE $APP_ROLE SET search_path = extensions"
if app ensaio "SELECT count(*) FROM condominios" >/dev/null 2>&1; then falha "sem search_path o nome solto ainda resolve (ensaio inválido)"
else ok "nome solto não resolve mais (condominios sem schema dá erro), então só o prefixo funciona"; fi
for t in $TESTES; do
  case " smoke painel fisguei fisguei-inteligente escritorio " in *" $t "*) ;; *) continue;; esac
  t0=$(ms)
  if roda_teste "$t" 1; then
    ok "MULTI=1 sem search_path: test/$t.js ($(( $(ms) - t0 )) ms)"
  else falha "MULTI=1 sem search_path: test/$t.js — últimas linhas:"; tail -6 "$LOG/teste-$t-1.txt" | sed 's/^/        /'; fi
  TEMPOS+=("$(printf '%-44s %6d ms' "7 MULTI=1 sem search_path test/$t.js" "$(( $(ms) - t0 ))")")
done
adm postgres -c "ALTER ROLE $APP_ROLE SET search_path = ruah, base, extensions"

# ---- resumo ----
titulo "Tempos"
printf '  %s\n' "${TEMPOS[@]}"
titulo "Resultado: $OKS ok, $FALHAS falha(s)"
[ "$FALHAS" = 0 ]
