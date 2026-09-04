import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const txt = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

const file = process.argv[2] || 'schema.sql';
const sql = readFileSync(join(__dirname, '..', 'supabase', file), 'utf8');

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

const run = async () => {
  await client.connect();
  console.log(`connected, applying ${file}...`);
  await client.query(sql);
  console.log('applied ok');
  await client.end();
};

run().catch((e) => {
  console.error('migration failed:', e.message);
  process.exit(1);
});
