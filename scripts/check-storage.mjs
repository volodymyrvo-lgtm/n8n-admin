// Перевірка Supabase Storage з реальними ключами з .env:
//   npm run storage:check
// Завантажує крихітний PNG, відкриває його за підписаним URL, скачує,
// видаляє й переконується, що файлу більше немає. Нічого не лишає в бакеті.
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_BANNERS_BUCKET } = process.env;
for (const [name, value] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_BANNERS_BUCKET })) {
  if (!value?.trim()) {
    console.error(`✗ ${name} не задана (запускайте через npm run storage:check, щоб підхопити .env)`);
    process.exit(1);
  }
}
if (/\/(rest|storage)\/v1\/?$/.test(SUPABASE_URL)) {
  console.error('✗ SUPABASE_URL має бути без /rest/v1 — лише https://<ref>.supabase.co');
  process.exit(1);
}

const client = createClient(SUPABASE_URL.replace(/\/+$/, ''), SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const bucket = client.storage.from(SUPABASE_BANNERS_BUCKET);
const path = `healthcheck/${randomUUID()}.png`;
// 1x1 прозорий PNG
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

let failed = false;
const step = async (label, fn) => {
  try {
    await fn();
    console.log(`✓ ${label}`);
  } catch (error) {
    failed = true;
    console.error(`✗ ${label}: ${error.message}`);
    throw error;
  }
};

try {
  await step('upload (бакет існує, ключ має доступ)', async () => {
    const { error } = await bucket.upload(path, png, { contentType: 'image/png', upsert: false });
    if (error) throw error;
  });

  await step('upload того ж шляху відхиляється (upsert: false)', async () => {
    const { error } = await bucket.upload(path, png, { contentType: 'image/png', upsert: false });
    if (!error) throw new Error('повторне завантаження пройшло — файл міг бути перезаписаний');
  });

  let signedUrl;
  await step('createSignedUrl', async () => {
    const { data, error } = await bucket.createSignedUrl(path, 60);
    if (error) throw error;
    signedUrl = data.signedUrl;
  });

  await step('підписаний URL відкривається як image/png', async () => {
    const res = await fetch(signedUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get('content-type');
    if (!type?.startsWith('image/png')) throw new Error(`content-type: ${type}`);
  });

  await step('download повертає ті самі байти', async () => {
    const { data, error } = await bucket.download(path);
    if (error) throw error;
    const bytes = Buffer.from(await data.arrayBuffer());
    if (!bytes.equals(png)) throw new Error('байти відрізняються');
  });
} catch {
  // деталі вже виведено у step
} finally {
  const { error } = await bucket.remove([path]);
  if (error) {
    failed = true;
    console.error(`✗ remove: ${error.message} (видаліть ${path} вручну в дашборді)`);
  } else {
    const { error: after } = await bucket.download(path);
    if (after) {
      console.log('✓ remove (файл видалено)');
    } else {
      failed = true;
      console.error('✗ remove: файл після видалення досі доступний');
    }
  }
}

console.log(failed ? '\nПеревірка НЕ пройдена' : '\nStorage працює: ключі, бакет і права в порядку');
process.exit(failed ? 1 : 0);
