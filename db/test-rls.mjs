// Applies the migrations to an in-memory Postgres (PGlite) and checks the access rules.
// auth.user_id() and the JWT email claim are stubbed with session settings.
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
const dir = new URL('./migrations/', import.meta.url).pathname;
await db.exec(`create schema auth; create function auth.user_id() returns text language sql stable as $$ select nullif(current_setting('app.uid', true), '') $$; create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;`);
for (const f of fs.readdirSync(dir).sort()) { await db.exec(fs.readFileSync(dir + f, 'utf8')); console.log('ok', f); }
await db.exec(`create role app; grant usage on schema public, auth to app; grant all on all tables in schema public to app; grant execute on all functions in schema public to app;`);
const as = async (uid, email, sql) => {
  await db.exec(`set role postgres; set app.uid = '${uid}'; set request.jwt.claims = '{"email":"${email}"}'; set role app;`);
  return db.query(sql);
};
const w = (await as('u1','a@x.lt',`select create_wedding_with_defaults('Mūsų', '2027-06-12', 100, 2000000) id`)).rows[0].id;
console.log('categories', (await as('u1','a@x.lt',`select count(*) from categories`)).rows[0]);
console.log('stranger sees', (await as('u9','z@x.lt',`select count(*) from categories`)).rows[0]);
const tok = (await as('u1','a@x.lt',`insert into invitations (wedding_id,email,role) values ('${w}','e@x.lt','editor') returning token`)).rows[0].token;
try { await as('u2','wrong@x.lt',`select accept_invitation('${tok}')`); } catch (e) { console.log('wrong email rejected:', e.message); }
await as('u2','e@x.lt',`select accept_invitation('${tok}')`);
const cat = (await as('u2','e@x.lt',`select id from categories limit 1`)).rows[0].id;
const ex = (await as('u2','e@x.lt',`insert into expenses (wedding_id,category_id,title,planned_cents) values ('${w}','${cat}','Salė',500000) returning id`)).rows[0].id;
await as('u1','a@x.lt',`insert into expense_private_notes (expense_id,wedding_id,body) values ('${ex}','${w}','slapta')`);
console.log('editor private notes', (await as('u2','e@x.lt',`select count(*) from expense_private_notes`)).rows[0]);
console.log('editor updates', (await as('u2','e@x.lt',`update expenses set contracted_cents=480000 where id='${ex}' returning id`)).rows.length);
try { await as('u2','e@x.lt',`update categories set name='x' returning id`).then(r=>console.log('editor cat update rows', r.rows.length)); } catch(e){console.log(e.message)}
console.log('editor deletes wedding', (await as('u2','e@x.lt',`delete from weddings returning id`)).rows.length);
console.log('audit rows', (await as('u1','a@x.lt',`select action, diff from audit_log order by id`)).rows);
console.log('export keys', Object.keys((await as('u1','a@x.lt',`select export_wedding('${w}') j`)).rows[0].j).length);
await as('u1','a@x.lt',`select delete_my_data()`);
await db.exec('set role postgres');
console.log('weddings left', (await db.query(`select count(*) from weddings`)).rows[0]);
