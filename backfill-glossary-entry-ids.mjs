import 'dotenv/config';
import crypto from 'node:crypto';
import { Client } from 'pg';

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

await client.connect();

const res = await client.query('select id, glossary_name, all_gloss_rules from glossaries');

for (const row of res.rows) {
  const root = row.all_gloss_rules;
  if (!root || !Array.isArray(root.entries)) {
    console.log('skip', row.glossary_name, '- no entries array');
    continue;
  }

  let assigned = 0;
  const entries = root.entries.map((entry) => {
    if (entry && typeof entry === 'object' && !entry.id) {
      assigned += 1;
      return { id: crypto.randomUUID(), ...entry };
    }
    return entry;
  });

  if (assigned === 0) {
    console.log('skip', row.glossary_name, '- all entries already have id');
    continue;
  }

  await client.query('update glossaries set all_gloss_rules = $1 where id = $2', [
    JSON.stringify({ ...root, entries }),
    row.id,
  ]);
  console.log('updated', row.glossary_name, '-', assigned, 'entries got a new id');
}

await client.end();
