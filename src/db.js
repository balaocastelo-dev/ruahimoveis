// Escolhe o banco: com DATABASE_URL usa o Postgres online (Supabase, mesmo banco do link na Vercel);
// sem ela, usa o SQLite local do PC (data/house.db; o arquivo antigo data/ruah.db continua valendo).
module.exports = process.env.DATABASE_URL || require('./config').DATABASE_URL
  ? require('./db-pg')
  : require('./db-sqlite');
