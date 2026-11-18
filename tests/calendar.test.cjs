/* eslint-disable @typescript-eslint/no-require-imports -- Node tests load CommonJS and transpiled TS modules. */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const compiled = new Map();
function loadSource(file, mocks = {}) {
  if (!compiled.has(file)) {
    compiled.set(file, ts.transpileModule(readFileSync(resolve(__dirname, '..', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
      fileName: file,
    }).outputText);
  }
  const loadedModule = { exports: {} };
  const mockedRequire = (id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id.startsWith('@/') || id.startsWith('.')) throw new Error(`Missing mock: ${id}`);
    return require(id);
  };
  new Function('require', 'module', 'exports', compiled.get(file))(mockedRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

function database(respond) {
  const queries = [];
  return {
    queries,
    from(table) {
      const q = { table, filters: [], operation: 'select' };
      queries.push(q);
      const chain = {
        select(fields) { q.fields = fields; return chain; },
        insert(values) { q.operation = 'insert'; q.values = values; return chain; },
        eq(key, value) { q.filters.push([key, value]); return chain; },
        gte() { return chain; }, lte() { return chain; }, order() { return chain; },
        in() { return chain; },
        range(from, to) { q.range = [from, to]; return chain; },
        single() { return chain; }, maybeSingle() { return chain; },
        then(onFulfilled, onRejected) { return Promise.resolve(respond(q)).then(onFulfilled, onRejected); },
      };
      return chain;
    },
  };
}

function accessFor(role, db) {
  return loadSource('src/lib/scheduling-access.ts', {
    react: { cache: (fn) => fn },
    '@/lib/auth': {
      getAuthedUser: async () => ({ user: role === 'anonymous' ? null : { id: 'logged-in-user', email: 'teacher@example.com' } }),
      getIsAdmin: async () => role === 'admin',
    },
    '@/lib/dashboard': { getDashboardInstructor: async () => ({ instructor: role === 'instructor' ? { id: 'teacher-a', ime: 'Ana', prezime: 'Anić' } : null }) },
    '@/lib/supabase/admin': { createAdminClient: () => db },
  }).requireSchedulingAccess;
}

const constants = loadSource('src/lib/constants.ts');
function actionsFor(role, db, events = [], refreshed = []) {
  return loadSource('src/app/admin/actions.ts', {
    '@/lib/scheduling-access': { requireSchedulingAccess: accessFor(role, db) },
    '@/lib/auth': {
      getAuthedUser: async () => ({ user: role === 'anonymous' ? null : { id: 'logged-in-user' } }),
      getIsAdmin: async () => role === 'admin',
    },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/audit': { logActivity: (...args) => events.push(args) },
    '@/lib/constants': constants,
    '@/lib/settings': { termMozeNovoPredavanje: async () => ({ ok: true }) },
    '@/lib/zauzetost-zahteva': {
      deteImaZahtev: async () => null,
      instruktorSlobodanZaNastavak: async () => null,
      trajanjeVrste: async () => 45,
      proveriMestoZahteva: async () => null,
    },
    'next/cache': { revalidatePath: (path) => refreshed.push(path) },
    'next/navigation': { redirect: (path) => { throw new Error(`redirect:${path}`); } },
    '@/lib/stanje': {}, '@/lib/stanje-svih': {}, '@/lib/term-categories': {},
    '@/lib/client-pol': {}, '@/lib/datum': {}, '@/lib/blokade': {},
  });
}

for (const role of ['admin', 'instructor']) {
  test(`${role} can book for another teacher and client; audit records the actual role`, async () => {
    const db = database((q) => {
      if (q.operation === 'insert') return { data: { id: 'new-term' } };
      if (q.table === 'app_settings') return { data: { value: '4' } };
      if (q.table === 'term_categories') return { data: { id: 'individual' } };
      return { data: null, count: 0 };
    });
    const events = [], refreshed = [];
    const actions = actionsFor(role, db, events, refreshed);
    assert.equal((await actions.createTermAsAdmin('teacher-b', '2026-11-23', 0, null, 'individual')).termId, 'new-term');
    assert.equal(db.queries.find((q) => q.operation === 'insert').values.instructor_id, 'teacher-b');
    assert.equal(events[0][0].role, role === 'admin' ? 'admin' : 'instruktor');
    assert.equal(events[0][0].id, 'logged-in-user');
    assert.ok(refreshed.includes('/dashboard') && refreshed.includes('/admin/kalendar'));

    db.queries.length = 0;
    const term = { id: 'new-term', instructor_id: 'teacher-b', date: '2026-11-23', slot_index: 0 };
    const lessonDb = database((q) => {
      if (q.operation === 'insert') return { error: null };
      if (q.table === 'terms') return { data: q.fields.startsWith('id, instructor_id') ? term : null };
      return { data: q.fields === 'id' ? null : [] };
    });
    const lesson = await actionsFor(role, lessonDb).createPredavanjeAsAdmin('new-term', 'unlinked-child', false, false, null, 'reading');
    assert.deepEqual(lesson, {});
    assert.equal(lessonDb.queries.find((q) => q.table === 'predavanja' && q.operation === 'insert').values.client_id, 'unlinked-child');
    assert.equal(lessonDb.queries.find((q) => q.table === 'instructor_clients').values.instructor_id, 'teacher-b');
  });
}

for (const role of ['anonymous', 'student']) {
  test(`${role} cannot use staff booking actions`, async () => {
    const db = database(() => { throw new Error('Unauthorized database access'); });
    const actions = actionsFor(role, db);
    assert.ok((await actions.createTermAsAdmin('teacher-b', '2026-11-23', 0, null, 'individual')).error);
    assert.ok((await actions.createPredavanjeAsAdmin('term', 'child', false, false, null)).error);
    assert.ok((await actions.addPotentialClientsAsAdmin('term', [{ ime: 'Dete' }])).error);
    assert.equal((await actions.repeatTermAsAdmin('teacher-b', '2026-11-23', 0, null, 'individual', null, ['child'], null, 1)).failed.length, 1);
    assert.equal((await actions.createBulkZahteviAsAdmin('child', null, [{ date: '2026-11-23', slotIndex: 0 }])).failed.length, 1);
    assert.equal(db.queries.length, 0);
  });
}

test('instructor still cannot edit another term through admin actions', async () => {
  const db = database(() => { throw new Error('Admin-only database access'); });
  const actions = actionsFor('instructor', db);
  assert.ok((await actions.updateTermMetaAsAdmin('another-term', { term_category_id: 'group', napomena: null })).error);
  assert.equal(db.queries.length, 0);
});

test('instructor can book testing and a class awaiting an instructor', async () => {
  const db = database((q) => ({ data: q.operation === 'insert' ? null : [], error: null }));
  const actions = actionsFor('instructor', db);
  assert.deepEqual(await actions.addPotentialClientsAsAdmin('test-term', [{ ime: 'Dete', prezime: 'Test' }]), {});
  assert.equal(db.queries.find((q) => q.table === 'potential_clients').values[0].term_id, 'test-term');
  assert.deepEqual(await actions.createBulkZahteviAsAdmin('child', 'reading', [{ date: '2026-11-23', slotIndex: 0 }]), { failed: [] });
  assert.equal(db.queries.find((q) => q.table === 'zahtevi_za_cas' && q.operation === 'insert').values[0].instructor_id, null);
});

const Calendar = loadSource('src/app/dashboard/CalendarView.tsx', {
  'next/navigation': { useRouter: () => ({ refresh() {} }) },
  'next/link': ({ children, ...props }) => React.createElement('a', props, children),
  '@/lib/use-kalendar-realtime': { useKalendarRealtime() {} },
  '@/lib/constants': constants,
  '@/app/dashboard/termin/actions': { moveTermAsInstructor() {} },
}).default;
const otherTerm = {
  id: 'term-b', instructor_id: 'teacher-b', date: '2026-11-23', slot_index: 0,
  instructor: { ime: 'Drugi', prezime: 'Profesor' },
  predavanja: [{ id: 'lesson', client_id: 'child', client: { ime: 'Drugo', prezime: 'Dete' } }],
};
function renderCalendar(overrides = {}) {
  return renderToStaticMarkup(React.createElement(Calendar, {
    view: 'dan', terms: [], otherTerms: [otherTerm], instructorId: 'teacher-a', instructorColor: '#123456',
    startOfWeek: '2026-11-23', singleDay: '2026-11-23', monthStart: '2026-11-01', ...overrides,
  }));
}

for (const view of ['dan', 'nedelja']) {
  test(`${view}: other teachers' classes and testing children are visible`, () => {
    const html = renderCalendar({ view, otherTerms: [otherTerm, {
      ...otherTerm, id: 'testing', slot_index: 1, predavanja: [],
      term_category: { is_testing: true }, potential_clients: [{ id: 'potential', ime: 'Test', prezime: 'Dete' }],
    }] });
    assert.match(html, /Drugi Profesor/);
    assert.match(html, /Drugo Dete/);
    assert.match(html, /Testiranje/);
    assert.match(html, /Test Dete/);
  });
}

test('month includes other teachers and pending classes in the daily count', () => {
  const html = renderCalendar({ view: 'mesec', otherTerms: [otherTerm, { ...otherTerm, id: 'request', request_id: 'request' }] });
  assert.match(html, /2 termin\(a\)/);
});

test('own continuation does not hide other teachers in the same slot', () => {
  const html = renderCalendar({ terms: [{
    ...otherTerm, id: 'own-spillover', instructor_id: 'teacher-a', predavanja: [],
    nastavak_of_term_id: 'parent', napomena: constants.AUTO_SPILLOVER_NAPOMENA,
  }] });
  assert.match(html, /Drugo Dete/);
  assert.match(html, /Nastavak dužeg časa/);
});

test('cancelled own classes in the month link to the day instead of a deleted term', () => {
  const html = renderCalendar({ view: 'mesec', otherTerms: [{ ...otherTerm, id: 'otkazan-own', instructor_id: 'teacher-a', cancelled: true }] });
  assert.match(html, /Otkazano/);
  assert.doesNotMatch(html, /href="\/dashboard\/termin\/otkazan-own"/);
});

test('personal block allows scheduling for others; global block prevents it', () => {
  const block = { date: '2026-11-23', slot_index: 0, napomena: null };
  const booking = /href="\/dashboard\/termin\/novi\?date=2026-11-23&amp;slot=0"/;
  assert.match(renderCalendar({ blockedSlots: [{ ...block, ownOnly: true }] }), booking);
  for (const blocks of [[block], [block, { ...block, ownOnly: true }], [{ ...block, ownOnly: true }, block]]) {
    assert.doesNotMatch(renderCalendar({ blockedSlots: blocks }), booking);
  }
});

function findComponent(node, component) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === component) return node;
  for (const child of React.Children.toArray(node.props?.children)) {
    const found = findComponent(child, component);
    if (found) return found;
  }
  return null;
}

const calendarRows = loadSource('src/lib/calendar-rows.ts');
function dashboardFor(db, serviceRoleAvailable = true) {
  const CalendarStub = () => null;
  const page = loadSource('src/app/dashboard/page.tsx', {
    '@/lib/supabase/admin': { createAdminClient: () => { if (!serviceRoleAvailable) throw new Error('No service role'); return db; } },
    '@/lib/calendar-rows': calendarRows,
    '@/lib/dashboard': { getDashboardInstructor: async () => ({ instructor: { id: 'teacher-a' } }) },
    '@/app/admin/actions': { getOdrzanoPoVrstamaZaPredavaca: async () => [] },
    '@/lib/blokade': { mapBlokada: (r) => r, mapNedeljna: (r) => r, nedeljneUDatume: () => [] },
    '@/lib/constants': constants,
    'next/navigation': { redirect: (path) => { throw new Error(`redirect:${path}`); } },
    './CalendarView': CalendarStub,
    './AddTermButton': () => null, './CalendarFilters': () => null,
    './DashboardErrorToast': () => null, './DashboardDebugLog': () => null,
  }).default;
  return { page, CalendarStub };
}

test('dashboard includes unassigned classes, missing rooms/types, continuations and cancellations', async () => {
  const pending = { id: 'pending', status: 'pending', client_id: 'waiting-child', requested_date: '2026-11-23', requested_slot_index: 2, client: { id: 'waiting-child', ime: 'Čeka', prezime: 'Čas' }, classroom: null, term_type: null };
  const db = database((q) => {
    let data = [];
    if (q.table === 'terms') data = [
      { ...otherTerm, instructor_id: 'teacher-a', id: 'own-term', classroom: null },
      { ...otherTerm, term_category: { id: 'testing', naziv: 'Testiranje', is_testing: true }, potential_clients: [{ id: 'candidate', ime: 'Test' }] },
    ];
    if (q.table === 'zahtevi_za_cas') data = [pending, {
      ...pending, id: 'long-pending', requested_slot_index: 4,
      term_type: [{ naziv: 'Duži čas', trajanje_minuta: 90 }], classroom: [{ id: 'room', naziv: 'Učionica 1' }],
    }];
    if (q.table === 'otkazani_termini') data = [{ id: 'cancelled', client_id: null, client_ime: 'Otkazani', term_date: '2026-11-23', slot_index: 6 }];
    data = data.filter((row) => q.filters.every(([key, value]) => row[key] === value));
    return { data, error: null };
  });
  const { page, CalendarStub } = dashboardFor(db);
  const tree = await page({ searchParams: Promise.resolve({ week: '2026-11-23' }) });
  const calendar = findComponent(tree, CalendarStub).props;
  assert.equal(calendar.terms.length, 1);
  assert.equal(calendar.otherTerms.length, 5);
  assert.equal(calendar.otherTerms[0].term_category.is_testing, true);
  assert.equal(calendar.otherTerms[0].potential_clients[0].id, 'candidate');
  assert.equal(calendar.otherTerms[1].request_id, 'pending');
  assert.equal(calendar.otherTerms[1].classroom, null);
  assert.equal(calendar.otherTerms[1].predavanja[0].term_type, null);
  assert.equal(calendar.otherTerms[1].predavanja[0].client.id, 'waiting-child');
  const continuation = calendar.otherTerms.find((term) => term.request_continuation);
  assert.equal(continuation.slot_index, 5);
  assert.equal(continuation.classroom.naziv, 'Učionica 1');
  assert.equal(calendar.otherTerms.at(-1).cancelled, true);
});

test('dashboard never substitutes a calendar restricted by instructor RLS', async () => {
  const db = database(() => { throw new Error('Should not read a partial calendar'); });
  const { page } = dashboardFor(db, false);
  await assert.rejects(() => page({ searchParams: Promise.resolve({}) }), /No service role/);
  assert.equal(db.queries.length, 0);
});

for (const view of ['dan', 'nedelja', 'mesec']) {
  test(`${view}: appointments remain visible with any combination of missing instructor, room and type`, () => {
    const unassigned = {
      ...otherTerm, id: 'request', request_id: 'request', instructor_id: null, instructor: null,
      classroom: null, predavanja: [{ id: 'child', client: { ime: 'Bez', prezime: 'Dodele' } }],
    };
    const html = renderCalendar({ view, otherTerms: [
      otherTerm, unassigned,
      { ...otherTerm, id: 'assigned-with-room', classroom: { id: 'room-2', naziv: 'Učionica 2' } },
      { ...unassigned, id: 'with-room', classroom: { id: 'room', naziv: 'Učionica 1' } },
      { ...unassigned, id: 'continuation', request_continuation: true, slot_index: 1 },
      { ...unassigned, id: 'cancelled', request_id: undefined, cancelled: true, slot_index: 2 },
    ] });
    for (const label of ['Drugi Profesor', 'Bez instruktora', 'Bez učionice', 'Bez vrste', 'Bez Dodele', 'Učionica 1', 'Učionica 2', 'Nastavak dužeg časa', 'Otkazano']) {
      assert.ok(html.includes(label), `Missing ${label}`);
    }
  });
}

test('a calendar with over 1000 entries loads every row', async () => {
  const all = Array.from({ length: 1005 }, (_, id) => ({ id }));
  const calls = [];
  const rows = await calendarRows.readAllCalendarRows('Calendar', async (from, to) => {
    calls.push([from, to]);
    return { data: all.slice(from, to + 1), error: null };
  });
  assert.deepEqual(rows, all);
  assert.equal(calls.length, 3);
});

test('calendar read errors cannot silently hide a page of appointments', async () => {
  await assert.rejects(
    () => calendarRows.readAllCalendarRows('Calendar', async () => ({ data: null, error: { message: 'Database unavailable' } })),
    /Database unavailable/
  );
});

for (const mode of ['admin', 'instructor']) {
  test(`${mode} booking form offers all teachers and clients and returns to the correct calendar`, async () => {
    const db = database((q) => ({ data: q.table === 'instructors' ? [{ id: 'teacher-a' }, { id: 'teacher-b' }] : q.table === 'clients' ? [{ id: 'unlinked-child' }] : [] }));
    const Form = () => null;
    const page = loadSource('src/components/TermBookingPage.tsx', {
      '@/lib/supabase/admin': { createAdminClient: () => db },
      '@/lib/scheduling-access': { requireSchedulingAccess: accessFor(mode === 'admin' ? 'admin' : 'instructor', db) },
      '@/app/admin/termin/novi/AdminTerminForm': Form,
      '@/lib/constants': constants,
      '@/lib/settings': { getMaxTerminaPoSlotu: async () => 4 },
      '@/app/admin/actions': {
        getTermTypes: async () => [], getTermCategories: async () => [], getAllClientsCompletedProgramIds: async () => new Map(),
        getTakenForSlot: async () => ({ takenInstructorIds: [], takenClassroomIds: [], blockedInstructorIds: [], blocked: null }),
      },
      'next/navigation': { redirect: (path) => { throw new Error(`redirect:${path}`); } },
      'next/link': () => null,
    }).default;
    const tree = await page({ mode, searchParams: Promise.resolve({ date: '2026-11-23', slot: '3' }) });
    const form = findComponent(tree, Form).props;
    assert.equal(form.instructors.length, 2);
    assert.equal(form.clients[0].id, 'unlinked-child');
    assert.equal(form.calendarHref, mode === 'admin' ? '/admin/kalendar' : '/dashboard');
    assert.equal(form.defaultSlotIndex, 3);
    assert.equal(db.queries.some((q) => q.operation === 'insert'), false);
  });
}
