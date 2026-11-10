// Live end-to-end check against the real Neon Auth + Data API.
// Run: npm run test:api   (creates throwaway vs-e2e-*@example.com users; their data is deleted at the end)
const AUTH = process.env.VITE_NEON_AUTH_URL ?? 'https://ep-billowing-mouse-b9xp0rz8.neonauth.c-7.eu-central-1.aws.neon.tech/neondb/auth';
const API = process.env.VITE_NEON_DATA_API_URL ?? 'https://ep-billowing-mouse-b9xp0rz8.apirest.c-7.eu-central-1.aws.neon.tech/neondb/rest/v1';
const ORIGIN = 'http://localhost:5173';
const run = Date.now().toString(36);

async function user(tag) {
  const email = `vs-e2e-${tag}-${run}@example.com`;
  const res = await fetch(`${AUTH}/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ email, password: 'E2e-pass-123!', name: `E2E ${tag}` }),
  });
  if (!res.ok) throw new Error(`sign-up ${res.status} ${await res.text()}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const t = await fetch(`${AUTH}/token`, { headers: { Cookie: cookie, Origin: ORIGIN } });
  const { token } = await t.json();
  return { email, token };
}

async function api(u, path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${u.token}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

let failures = 0;
function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
  if (!ok) failures++;
}

const a = await user('owner');
const b = await user('editor');
const c = await user('stranger');

const w = await api(a, '/rpc/create_wedding_with_defaults', {
  method: 'POST',
  body: { p_name: 'E2E vestuvės', p_date: '2027-06-12', p_guest_count: 100, p_budget_cents: 2000000 },
});
check('owner creates wedding', w.status === 200 && typeof w.data === 'string', `status ${w.status} ${JSON.stringify(w.data).slice(0, 200)}`);
const wid = w.data;

const cats = await api(a, `/categories?wedding_id=eq.${wid}&select=id,name&order=sort_order`);
check('22 default categories', cats.data?.length === 22, `got ${cats.data?.length}`);

const strangerCats = await api(c, `/categories?wedding_id=eq.${wid}`);
check('stranger sees nothing', strangerCats.data?.length === 0);

const inv = await api(a, '/invitations', { method: 'POST', prefer: 'return=representation', body: { wedding_id: wid, email: b.email, role: 'editor' } });
check('owner creates invitation', inv.status === 201, `status ${inv.status}`);
const token = inv.data?.[0]?.token;

const wrong = await api(c, '/rpc/accept_invitation', { method: 'POST', body: { p_token: token } });
check('wrong user cannot accept', wrong.status >= 400, wrong.data?.message);

const acc = await api(b, '/rpc/accept_invitation', { method: 'POST', body: { p_token: token } });
check('invited editor accepts', acc.status === 200 && acc.data === wid, `status ${acc.status} ${acc.data?.message ?? ''}`);

const exp = await api(b, '/expenses', {
  method: 'POST', prefer: 'return=representation',
  body: { wedding_id: wid, category_id: cats.data[0].id, title: 'Salė', planned_cents: 500000 },
});
check('editor adds expense', exp.status === 201, `status ${exp.status}`);
const eid = exp.data?.[0]?.id;

await api(a, '/expense_private_notes', { method: 'POST', body: { expense_id: eid, wedding_id: wid, body: 'slapta' } });
const notes = await api(b, `/expense_private_notes?expense_id=eq.${eid}`);
check('editor cannot read private notes', notes.data?.length === 0);

const catEdit = await api(b, `/categories?id=eq.${cats.data[0].id}`, { method: 'PATCH', prefer: 'return=representation', body: { name: 'x' } });
check('editor cannot rename category', (catEdit.data?.length ?? 0) === 0);

const pay = await api(b, '/payments', { method: 'POST', prefer: 'return=representation', body: { wedding_id: wid, expense_id: eid, amount_cents: 100000, due_date: '2026-12-01' } });
check('editor adds payment', pay.status === 201, `status ${pay.status}`);

const hist = await api(a, `/audit_log?row_id=eq.${eid}&select=action`);
check('history recorded', hist.data?.length >= 1, `rows ${hist.data?.length}`);

const del = await api(b, `/weddings?id=eq.${wid}`, { method: 'DELETE', prefer: 'return=representation' });
check('editor cannot delete wedding', (del.data?.length ?? 0) === 0);

// Clean up: owner deletes everything they own
const gone = await api(a, '/rpc/delete_my_data', { method: 'POST', body: {} });
check('owner deletes own data', gone.status === 204 || gone.status === 200, `status ${gone.status}`);
const after = await api(a, `/weddings?id=eq.${wid}`);
check('wedding gone', after.data?.length === 0);

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
