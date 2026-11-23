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
        select(fields, options) { q.fields = fields; q.options = options; return chain; },
        insert(values) { q.operation = 'insert'; q.values = values; return chain; },
        delete() { q.operation = 'delete'; return chain; },
        update(values) { q.operation = 'update'; q.values = values; return chain; },
        or(filter) { q.orFilter = filter; return chain; },
        eq(key, value) { q.filters.push([key, value]); return chain; },
        gte() { return chain; }, lte() { return chain; }, order() { return chain; },
        in() { return chain; },
        range(from, to) { q.range = [from, to]; return chain; },
        limit(n) { q.limit = n; return chain; },
        single() { return chain; }, maybeSingle() { return chain; },
        then(onFulfilled, onRejected) { return Promise.resolve(respond(q)).then(onFulfilled, onRejected); },
      };
      return chain;
    },
    rpc(name, args) {
      const q = { table: 'rpc', name, args };
      queries.push(q);
      return Promise.resolve(respond(q));
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
    '@/lib/payment-starts': loadSource('src/lib/payment-starts.ts'),
    '@/lib/napomena-termina': loadSource('src/lib/napomena-termina.ts'),
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
      ucionicaRezervisana: async () => null,
    },
    'next/cache': { revalidatePath: (path) => refreshed.push(path) },
    'next/navigation': { redirect: (path) => { throw new Error(`redirect:${path}`); } },
    '@/lib/stanje': {}, '@/lib/stanje-svih': {}, '@/lib/term-categories': {},
    '@/lib/client-pol': {}, '@/lib/datum': loadSource('src/lib/datum.ts'), '@/lib/blokade': {},
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
      if (q.table === 'terms') return { data: q.fields.startsWith('id, instructor_id') || q.fields === '*' ? term : null };
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

test('cancelling a class can mark it charged and keep the reason', async () => {
  const db = database((q) => {
    if (q.table === 'zahtevi_za_cas' && q.operation === 'select') {
      return { data: { client_id: 'child', requested_date: '2026-11-24', requested_slot_index: 3, client: { ime: 'Vukašin', prezime: 'V' }, term_type: null, classroom: null }, error: null };
    }
    return { data: null, error: null };
  });
  const actions = actionsFor('admin', db);
  const res = await actions.otkaziCasoveAsAdmin([], ['request-1'], [], { naplaceno: true, razlog: '  Bolest,   javili kasno ' });
  assert.equal(res.otkazano, 1);
  const upis = db.queries.find((q) => q.table === 'otkazani_termini' && q.operation === 'insert').values;
  assert.equal(upis.placeno, true);
  assert.equal(upis.razlog, 'Bolest, javili kasno');
  assert.equal(upis.instructor_id, null);

  const db2 = database((q) => (q.table === 'zahtevi_za_cas' && q.operation === 'select'
    ? { data: { client_id: 'child', requested_date: '2026-11-24', requested_slot_index: 3, client: { ime: 'V' } }, error: null }
    : { data: null, error: null }));
  await actionsFor('admin', db2).otkaziCasoveAsAdmin([], ['request-2']);
  const bez = db2.queries.find((q) => q.table === 'otkazani_termini' && q.operation === 'insert').values;
  assert.equal(bez.placeno, false);
  assert.equal('razlog' in bez, false);
});

const calendarLinks = [];
const Calendar = loadSource('src/app/dashboard/CalendarView.tsx', {
  'next/navigation': { useRouter: () => ({ refresh() {} }) },
  'next/link': ({ children, ...props }) => { calendarLinks.push({ ...props }); delete props.prefetch; return React.createElement('a', props, children); },
  '@/lib/use-kalendar-realtime': { useKalendarRealtime() {} },
  '@/components/KalendarVeza': () => null,
  '@/components/Oblacic': { __esModule: true, default: ({ children }) => children, OblacicRed: ({ children }) => children, OblacicDugme: ({ children }) => children },
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

test('calendar cells and period links do not automatically prefetch pages', () => {
  calendarLinks.length = 0;
  for (const view of ['dan', 'nedelja', 'mesec']) renderCalendar({ view });
  assert.ok(calendarLinks.some((link) => link.href.startsWith('/dashboard/termin/novi')));
  assert.ok(calendarLinks.every((link) => link.prefetch === false));
});

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
      '@/lib/svi-redovi': loadSource('src/lib/svi-redovi.ts'),
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

test('retrying the whole booking creates one term and one lesson', async () => {
  const bookingId = '11111111-1111-4111-8111-111111111111';
  let saved = null;
  const children = new Set();
  const db = database((q) => {
    if (q.table === 'term_categories') return { data: { id: 'individual', jedan_klijent_po_terminu: true } };
    if (q.table === 'app_settings') return { data: { value: '4' } };
    if (q.table === 'terms') {
      if (q.operation === 'insert') { saved = { ...q.values }; return { data: { id: saved.id } }; }
      if (q.options?.head) return { count: saved ? 1 : 0, data: null };
      if (q.filters.some(([key]) => key === 'nastavak_of_term_id')) return { data: [] };
      if (q.filters.some(([key, value]) => key === 'id' && value === bookingId)) return { data: saved };
      return { data: null };
    }
    if (q.table === 'predavanja') {
      if (q.operation === 'insert') { children.add(q.values.client_id); return { error: null }; }
      if (q.fields === 'id') return { data: null };
      return { data: [...children].map((client_id) => ({ client_id })) };
    }
    return { data: null, error: null };
  });
  const action = actionsFor('instructor', db).bookTermWithLessons;
  const payload = { bookingId, instructorId: 'teacher-b', date: '2026-11-23', slotIndex: 0, classroomId: null, termCategoryId: 'individual', napomena: null, nastavakOfTermId: null, clientIds: ['child'], termTypeId: null, potentialClients: [], repeatDays: 0 };
  assert.equal((await action(payload)).termId, bookingId);
  assert.equal((await action(payload)).termId, bookingId);
  assert.equal(db.queries.filter((q) => q.table === 'terms' && q.operation === 'insert').length, 1);
  assert.equal(db.queries.filter((q) => q.table === 'predavanja' && q.operation === 'insert').length, 1);
});

test('student cannot submit a combined staff booking', async () => {
  const db = database(() => { throw new Error('Unauthorized access'); });
  assert.ok((await actionsFor('student', db).bookTermWithLessons({})).error);
  assert.equal(db.queries.length, 0);
});

test('bulk Delete uses one transactional database call', async () => {
  const db = database((q) => { assert.equal(q.name, 'delete_calendar_entries'); return { data: null, error: null }; });
  assert.deepEqual(await actionsFor('admin', db).deleteTermsAsAdmin(['term'], ['cancelled'], ['request']), { failed: [] });
  assert.equal(db.queries.length, 1);
  assert.deepEqual(db.queries[0].args, { p_term_ids: ['term'], p_request_ids: ['request'], p_cancelled_ids: ['cancelled'] });
});

test('a transactional deletion error never falls back to separate destructive writes', async () => {
  const db = database(() => ({ error: { code: '23503', message: 'Constraint violation' } }));
  const result = await actionsFor('admin', db).deleteTermsAsAdmin(['term']);
  assert.equal(result.failed[0].error, 'Constraint violation');
  assert.equal(db.queries.length, 1);
});

test('hard-delete cleanup removes only payment starts at the selected child and time', async () => {
  const db = database(() => ({ error: null }));
  const starts = [{ client_id: '11111111-1111-4111-8111-111111111111', date: '2027-03-01', slot_index: 4 }];
  assert.equal(await loadSource('src/lib/payment-starts.ts').deletePaymentStarts(db, [...starts, ...starts]), null);
  assert.equal(db.queries.length, 1);
  assert.equal(db.queries[0].operation, 'delete');
  assert.equal(db.queries[0].table, 'placeni_paketi');
  assert.equal(db.queries[0].orFilter, 'and(client_id.eq.11111111-1111-4111-8111-111111111111,od_datum.eq.2027-03-01,od_slot.eq.4)');
});

test('missing calendar RPC is retried after a minute even with continuous requests', async (t) => {
  let now = 1000, calls = 0;
  t.mock.method(Date, 'now', () => now);
  const { readCalendarRpc } = loadSource('src/lib/calendar-rpc.ts');
  const db = { rpc: async () => { calls++; return calls === 1 ? { data: null, error: { code: 'PGRST202' } } : { data: { terms: [] }, error: null }; } };
  await readCalendarRpc(db, '2027-03-01', '2027-03-07');
  now += 30_000;
  await readCalendarRpc(db, '2027-03-01', '2027-03-07');
  assert.equal(calls, 1);
  now += 31_000;
  assert.deepEqual((await readCalendarRpc(db, '2027-03-01', '2027-03-07')).data, { terms: [] });
  assert.equal(calls, 2);
});

test('calendar connection failures are retried immediately', async () => {
  let calls = 0;
  const { readCalendarRpc } = loadSource('src/lib/calendar-rpc.ts');
  const db = { rpc: async () => { calls++; return { data: null, error: { code: 'NETWORK_ERROR' } }; } };
  await readCalendarRpc(db, '2027-03-01', '2027-03-07');
  await readCalendarRpc(db, '2027-03-01', '2027-03-07');
  assert.equal(calls, 2);
});

function realtimeHarness(t) {
  const slots = [];
  let cursor = 0, effects = [], nextTimer = 1, broadcasts, refreshes = 0, latestPaused = false, latestSnapshot = {};
  const timers = new Map();
  const oldWindow = global.window, oldDocument = global.document;
  global.window = {
    setTimeout: (fn) => { const id = nextTimer++; timers.set(id, fn); return id; },
    clearTimeout: (id) => timers.delete(id), setInterval: () => 0, clearInterval() {},
    addEventListener() {}, removeEventListener() {},
  };
  global.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  t.after(() => { global.window = oldWindow; global.document = oldDocument; });
  const depsEqual = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const transition = { pending: false };
  const react = {
    useRef(value) { const i = cursor++; if (!slots[i]) slots[i] = { current: value }; return slots[i]; },
    useCallback(fn, deps) { const i = cursor++; if (!depsEqual(slots[i]?.deps, deps)) slots[i] = { deps, fn }; return slots[i].fn; },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!depsEqual(slots[i]?.deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
    },
    useTransition: () => [transition.pending, (fn) => { transition.pending = true; fn(); }],
  };
  const router = { refresh: () => refreshes++ };
  const channel = { on(_event, _filter, fn) { broadcasts = fn; return channel; }, subscribe() { return channel; } };
  const hook = loadSource('src/lib/use-kalendar-realtime.ts', {
    react,
    'next/navigation': { useRouter: () => router },
    '@/lib/supabase/client': { createClient: () => ({ channel: () => channel, removeChannel() {} }) },
  }).useKalendarRealtime;
  let refresh;
  const render = (paused = latestPaused, snapshot = latestSnapshot) => {
    latestPaused = paused; latestSnapshot = snapshot; cursor = 0; effects = [];
    refresh = hook(paused, snapshot);
    for (const effect of effects) effect();
  };
  render();
  return {
    render, refresh: () => refresh(), broadcast: () => broadcasts(), count: () => refreshes,
    flush: () => { const queued = [...timers.values()]; timers.clear(); for (const fn of queued) fn(); },
    complete: (snapshot = latestSnapshot) => { transition.pending = false; render(latestPaused, snapshot); },
  };
}

test('realtime and fallback refresh requests share one in-flight calendar load', (t) => {
  const h = realtimeHarness(t);
  h.refresh();
  h.render();
  h.refresh();
  assert.equal(h.count(), 1);
  h.complete();
  h.refresh();
  assert.equal(h.count(), 2);
});

test('a broadcast during a calendar fetch is not lost', (t) => {
  const h = realtimeHarness(t);
  h.refresh();
  h.render();
  h.broadcast();
  h.flush();
  assert.equal(h.count(), 1);
  h.complete({ pendingRequests: ['new-request'] });
  h.flush();
  assert.equal(h.count(), 2);
});

test('own operation broadcasts do not fetch again after fresh pending-class data arrives', (t) => {
  const h = realtimeHarness(t);
  h.render(true);
  h.broadcast();
  h.flush();
  assert.equal(h.count(), 0);
  h.render(false, { pendingRequests: ['saved-request'] });
  h.flush();
  assert.equal(h.count(), 0);
});

test('occupied starts include long-class continuations and the requested class duration', () => {
  const { unavailableCalendarStarts } = loadSource('src/lib/calendar-availability.ts');
  const occupied = unavailableCalendarStarts([
    { clientId: 'child-a', date: '2027-03-02', slot: 2, slots: 2 },
    { clientId: 'other-child', date: '2027-03-02', slot: 10, slots: 2 },
  ], ['child-a'], 2);
  assert.deepEqual([...occupied], ['2027-03-02|1', '2027-03-02|2', '2027-03-02|3']);
  assert.equal(occupied.has('2027-03-02|4'), false);
  assert.equal(occupied.has('2027-03-02|10'), false);
});

test('backup covers every table created by the migrations', () => {
  const { BEKAP_TABELE } = loadSource('src/lib/bekap.ts', { 'server-only': {} });
  const { readdirSync } = require('node:fs');
  const dir = resolve(__dirname, '..', 'supabase', 'migrations');
  const created = new Set();
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql'))) {
    for (const m of readFileSync(resolve(dir, f), 'utf8').matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?(\w+)/gi)) created.add(m[1].toLowerCase());
  }
  created.delete('terms_new'); // privremena tabela iz migracije 002
  const missing = [...created].filter((t) => !BEKAP_TABELE.includes(t));
  assert.deepEqual(missing, []);
});

test('daily backup cron refuses calls without the secret', async () => {
  let ran = 0;
  const route = loadSource('src/app/api/cron/bekap/route.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => ({}) },
    '@/lib/bekap': { sacuvajDnevniBekap: async () => { ran++; return { ime: 'bekap-2026-11-23.json.gz', redova: 1, velicina: 10, obrisano: 0, greskeTabela: {} }; } },
  });
  const old = process.env.CRON_SECRET;
  const log = console.log, err = console.error;
  console.log = () => {}; console.error = () => {};
  try {
    delete process.env.CRON_SECRET;
    assert.equal((await route.GET(new Request('https://x/api/cron/bekap'))).status, 500);
    process.env.CRON_SECRET = 'tajna';
    assert.equal((await route.GET(new Request('https://x/api/cron/bekap', { headers: { authorization: 'Bearer pogresno' } }))).status, 401);
    assert.equal(ran, 0);
    assert.equal((await route.GET(new Request('https://x/api/cron/bekap', { headers: { authorization: 'Bearer tajna' } }))).status, 200);
    assert.equal(ran, 1);
  } finally {
    if (old === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = old;
    console.log = log; console.error = err;
  }
});

test('daily backup is saved per day and only backups older than 90 days are removed', async () => {
  const { sacuvajDnevniBekap } = loadSource('src/lib/bekap.ts', { 'server-only': {} });
  const uploads = [], removed = [];
  const files = ['bekap-2026-11-22.json.gz', 'bekap-2026-08-25.json.gz', 'bekap-2026-08-24.json.gz', 'bekap-2026-01-01.json.gz', 'nesto-drugo.txt'];
  const db = database(() => ({ data: [{ id: 1 }], error: null }));
  const admin = {
    from: db.from,
    storage: {
      getBucket: async () => ({ data: {}, error: null }),
      from: () => ({
        upload: async (ime, sadrzaj, opts) => { uploads.push({ ime, opts, size: sadrzaj.length }); return { error: null }; },
        list: async () => ({ data: files.map((name) => ({ name, metadata: { size: 100 } })), error: null }),
        remove: async (imena) => { removed.push(...imena); return { data: imena.map((name) => ({ name })), error: null }; },
      }),
    },
  };
  const res = await sacuvajDnevniBekap(admin, 'test', new Date('2026-11-23T01:30:00Z'));
  assert.equal(res.ime, 'bekap-2026-11-23.json.gz');
  assert.equal(uploads[0].opts.upsert, true);
  assert.deepEqual(removed.sort(), ['bekap-2026-01-01.json.gz', 'bekap-2026-08-24.json.gz']);
  assert.equal(res.obrisano, 2);
});

test('notes: appended once, replaced on request, automatic continuations untouched', async () => {
  const { spojiNapomene } = loadSource('src/lib/napomena-termina.ts');
  assert.equal(spojiNapomene(null, ' nadoknada '), 'nadoknada');
  assert.equal(spojiNapomene('Doneti svesku', 'nadoknada'), 'Doneti svesku\nnadoknada');
  assert.equal(spojiNapomene('Doneti svesku\nnadoknada', 'nadoknada'), 'Doneti svesku\nnadoknada');

  const db = database((q) => {
    if (q.table === 'terms' && q.operation === 'select') {
      return { data: [
        { id: 'term-1', napomena: 'Doneti svesku' },
        { id: 'spill', napomena: 'Automatski zauzeto (nastavak dužeg časa)' },
      ], error: null };
    }
    if (q.table === 'zahtevi_za_cas' && q.operation === 'select') return { data: [{ id: 'req-1', napomena: null }], error: null };
    return { data: null, error: null };
  });
  const res = await actionsFor('admin', db).postaviNapomenuAsAdmin(['term-1', 'spill'], ['req-1'], 'nadoknada', false);
  assert.equal(res.promenjeno, 2);
  const updates = db.queries.filter((q) => q.operation === 'update');
  assert.deepEqual(updates.map((q) => [q.table, q.values.napomena, q.filters[0][1]]), [
    ['terms', 'Doneti svesku\nnadoknada', 'term-1'],
    ['zahtevi_za_cas', 'nadoknada', 'req-1'],
  ]);

  const db2 = database(() => ({ data: [], error: null }));
  await actionsFor('admin', db2).createBulkZahteviAsAdmin('child', null, [{ date: '2026-11-24', slotIndex: 2 }], null, ' nadoknada ');
  assert.equal(db2.queries.find((q) => q.table === 'zahtevi_za_cas' && q.operation === 'insert').values[0].napomena, 'nadoknada');
});

test('full lists are read in pages so children past the first 1000 rows are not lost', async () => {
  const { sviRedovi } = loadSource('src/lib/svi-redovi.ts');
  const svi = Array.from({ length: 1234 }, (_, i) => ({ id: i }));
  const pozivi = [];
  const redovi = await sviRedovi(async (od, doReda) => { pozivi.push([od, doReda]); return { data: svi.slice(od, doReda + 1), error: null }; });
  assert.equal(redovi.length, 1234);
  assert.deepEqual(pozivi, [[0, 499], [500, 999], [1000, 1499]]);
});

test('instructor double-booking is refused unless the exception is checked', async () => {
  const napravi = (uUcionici) => database((q) => {
    if (q.operation === 'insert') return { data: { id: 'novi' }, error: null };
    if (q.table === 'app_settings') return { data: { value: '4' } };
    if (q.table === 'term_categories') return { data: { id: 'individual' } };
    if (q.table === 'terms' && q.fields === 'id') return { data: [{ id: 'nastavak-55' }], error: null };
    if (q.table === 'terms' && q.fields === 'id, instructor_id') return { data: uUcionici, error: null };
    return { data: null, count: 0 };
  });
  const bez = napravi([]);
  const r1 = await actionsFor('admin', bez).createTermAsAdmin('teacher-a', '2026-12-01', 7, null, 'individual');
  assert.match(r1.error, /već ima termin/);
  assert.equal(bez.queries.some((q) => q.operation === 'insert'), false);

  const sa = napravi([{ id: 'nastavak-55', instructor_id: 'teacher-a' }]);
  const r2 = await actionsFor('admin', sa).createTermAsAdmin('teacher-a', '2026-12-01', 7, 'room-1', 'individual', null, null, null, true);
  assert.equal(r2.termId, 'novi');
  assert.equal(sa.queries.find((q) => q.operation === 'insert').values.dozvoli_preklapanje, true);

  const tudja = napravi([{ id: 'drugi-cas', instructor_id: 'teacher-b' }]);
  const r3 = await actionsFor('admin', tudja).createTermAsAdmin('teacher-a', '2026-12-01', 7, 'room-1', 'individual', null, null, null, true);
  assert.match(r3.error, /učionica je već zauzeta/i);
});

test('assigning an instructor over their own 55-min continuation needs the exception', async () => {
  const napravi = () => database((q) => {
    if (q.table === 'zahtevi_za_cas' && q.operation === 'select') {
      return { data: { id: 'z1', status: 'pending', client_id: 'child', requested_date: '2026-12-01', requested_slot_index: 7, term_type_id: null, classroom_id: null }, error: null };
    }
    if (q.table === 'terms' && q.operation === 'select' && q.fields === '*') {
      return { data: [{ id: 'nastavak', classroom_id: null, napomena: 'Automatski zauzeto (nastavak dužeg časa)', dozvoli_preklapanje: false }], error: null };
    }
    if (q.table === 'terms' && q.operation === 'insert') return { data: { id: 'novi-termin' }, error: null };
    if (q.table === 'predavanja' && q.operation === 'insert') return { data: { id: 'novi-cas' }, error: null };
    return { data: [], error: null };
  });
  const bez = napravi();
  const r1 = await actionsFor('admin', bez).assignInstructorToZahtevAsAdmin('z1', 'teacher-a');
  assert.match(r1.error, /nastavak svog dužeg časa/);
  assert.equal(bez.queries.some((q) => q.operation === 'insert'), false);

  const sa = napravi();
  const r2 = await actionsFor('admin', sa).assignInstructorToZahtevAsAdmin('z1', 'teacher-a', true);
  assert.deepEqual(r2, {});
  const termin = sa.queries.find((q) => q.table === 'terms' && q.operation === 'insert').values;
  assert.equal(termin.dozvoli_preklapanje, true);
  assert.equal(sa.queries.find((q) => q.table === 'predavanja' && q.operation === 'insert').values.term_id, 'novi-termin');
});
