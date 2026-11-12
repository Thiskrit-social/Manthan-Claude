// Sample data for the prototype. Nothing in the application logic refers to these events by id:
// they are ordinary records created through the same shapes the actions produce.
import { COMPLEXITY, defaultPermissions } from './config.js';
import { addDays } from './utils.js';

const TONES = ['lav', 'butter', 'coral', 'mint', 'sky'];
const hoursAgo = (h) => new Date(Date.now() - h * 36e5).toISOString();
let n = 0; const id = (p) => p + (++n).toString(36);

export function seed() {
  n = 0;
  const s = { v: 1, rev: 0, currentUserId: 'maya', users: {}, events: [], memberships: [], invitations: [], committees: [], committeeMemberships: [],
    tasks: [], scheduleItems: [], expenses: [], media: [], announcements: [], files: [], notifications: [], activity: [] };

  /* ---------- people ---------- */
  const people = { maya: 'Maya Chen', leo: 'Leo Martins', ava: 'Ava Thompson', dan: 'Daniel Okafor', sam: 'Sam Rivera', priya: 'Priya Nair', jonas: 'Jonas Weber',
    zoe: 'Zoe Kim', omar: 'Omar Haddad', ella: 'Ella Brooks', noor: 'Noor Rahman', theo: 'Theo Laurent', mei: 'Mei Tanaka', ravi: 'Ravi Patel', sofia: 'Sofia Rossi',
    ben: 'Ben Carter', hana: 'Hana Suzuki', luca: 'Luca Bianchi', amara: 'Amara Nwosu', kai: 'Kai Andersen', isla: 'Isla Murphy', nico: 'Nico Alvarez', tess: 'Tess Nguyen',
    helen: 'Dr. Helen Ward', jay: 'Jay Singh', ruth: 'Ruth Adeyemi', finn: "Finn O'Brien", lily: 'Lily Zhang', marc: 'Marc Dubois', gina: 'Gina Lopez' };
  Object.entries(people).forEach(([k, name], i) => { s.users[k] = { id: k, name, email: `${k}@example.com`, tone: TONES[i % 5] }; });
  s.users.maya.bio = 'Hosts too many dinners. Events officer at Kingsway Students’ Union.';
  s.users.sam.bio = 'Account manager, Brightside Catering.';

  const event = (e) => { const p = COMPLEXITY[e.complexity]; s.events.push({ modules: [...p.modules], features: [...p.features], taskView: p.taskView, permissions: defaultPermissions(e.complexity), currency: '£', budget: 0, privacy: 'private', createdAt: hoursAgo(400), ...e }); };
  const member = (eventId, userId, role, meta = {}) => s.memberships.push({ id: id('m'), eventId, userId, role, ...meta });
  const invite = (eventId, userId, status, r = {}, extra = {}) => s.invitations.push({ id: id('i'), eventId, userId, name: s.users[userId]?.name || extra.name, email: s.users[userId]?.email || extra.email || '',
    group: extra.group || '', plusOneAllowed: extra.plusOneAllowed ?? true, invitedAt: hoursAgo(200), reminders: 0, checkedIn: false,
    rsvp: { status, plusOne: false, plusOneName: '', dietary: '', arrival: '', message: '', respondedAt: status === 'pending' ? null : hoursAgo(90), ...r } });
  const team = (cid, eventId, name, icon, tone, description, budget, lead, members, extra = {}) => {
    s.committees.push({ id: cid, eventId, name, icon, tone, description, budget, status: 'ontrack', group: '', ...extra });
    s.committeeMemberships.push({ id: id('cm'), committeeId: cid, userId: lead, role: 'lead' });
    members.forEach((u) => s.committeeMemberships.push({ id: id('cm'), committeeId: cid, userId: u, role: 'member' }));
  };
  const task = (tid, eventId, committeeId, title, assigneeId, due, priority, status, x = {}) => s.tasks.push({ id: tid, eventId, committeeId, title, assigneeId, due: due === null ? '' : addDays(due), priority, status,
    description: '', subtasks: [], checklist: [], dependsOn: [], comments: [], attachments: [], createdAt: hoursAgo(150), ...x });
  const subs = (...l) => l.map((t) => ({ id: id('st'), title: t.replace(/^\*/, ''), done: t.startsWith('*') }));
  const sched = (eventId, date, start, end, title, location, ownerId, x = {}) => s.scheduleItems.push({ id: id('sc'), eventId, date, start, end, title, location, ownerId, description: '', checklist: [], reminder: 0, ...x });
  const spend = (eventId, committeeId, title, amount, status, paidBy, x = {}) => s.expenses.push({ id: id('x'), eventId, committeeId, title, amount, status, paidBy, date: addDays(-3), description: '', receipt: '', ...x });
  const pic = (eventId, gallery, emoji, tone, caption, userId, h, type = 'photo') => { const m = id('md'); s.media.push({ id: m, eventId, gallery, type, emoji, tone, caption, userId, at: hoursAgo(h), sample: true }); return m; };
  const post = (eventId, scope, userId, text, h, x = {}) => s.announcements.push({ id: id('a'), eventId, scope, committeeId: null, userId, text, at: hoursAgo(h), mediaId: null, comments: [], ...x });
  const say = (userId, text, h) => ({ id: id('k'), userId, text, at: hoursAgo(h) });
  const file = (eventId, folder, name, kind, size, userId, x = {}) => s.files.push({ id: id('f'), eventId, folder, name, kind, size, userId, at: hoursAgo(120), confidential: false, vendorShared: false, url: '', committeeId: null, ...x });
  const note = (userId, eventId, text, link, h, read = false) => s.notifications.push({ id: id('n'), userId, eventId, text, link, at: hoursAgo(h), read });
  const did = (eventId, userId, text, h) => s.activity.push({ id: id('ac'), eventId, userId, text, at: hoursAgo(h) });

  /* =====================================================================
     1. Saturday House Party — Simple event, 15 guests
     ===================================================================== */
  const dow = new Date().getDay(); let toSat = (6 - dow + 7) % 7; if (toSat < 2) toSat += 7;
  const P = 'evparty'; const pDay = addDays(toSat);
  event({ id: P, name: 'Saturday House Party', category: 'houseparty', complexity: 'simple', cover: { tone: 'lav', emoji: '🪩' },
    description: 'Flat-warming meets end-of-term party. Bring a friend, a snack and your best playlist request.',
    date: pDay, start: '19:00', end: '23:30', location: 'Maya’s flat · 14 Juniper Lane, Flat 3', expected: 15, privacy: 'link', budget: 180, createdBy: 'maya' });
  member(P, 'maya', 'owner');
  const guests = [
    ['leo', 'going', { arrival: '19:00', message: 'Bringing the cocktail shaker!' }], ['dan', 'going', { arrival: '18:30', dietary: 'No pork', message: 'Coming early to set up speakers.' }],
    ['priya', 'going', { arrival: '19:15', plusOne: true, plusOneName: 'Arjun', dietary: 'Vegetarian' }], ['zoe', 'going', { arrival: '19:00', dietary: 'Gluten-free' }],
    ['omar', 'going', { arrival: '19:30' }], ['noor', 'going', { arrival: '18:45', dietary: 'Halal', message: 'Fairy lights are sorted ✨' }],
    ['mei', 'going', { arrival: '20:00', plusOne: true, plusOneName: 'Kenji' }], ['ben', 'going', { arrival: '19:45', dietary: 'Nut allergy' }],
    ['jonas', 'maybe', { arrival: '21:00', message: 'Might be late, shift ends at 8.' }], ['sofia', 'maybe', { message: 'Depends on my train back.' }],
    ['theo', 'declined', { message: 'Away that weekend, have fun!' }], ['hana', 'declined', { message: 'Family dinner, sorry!' }],
    ['ava', 'pending'], ['ella', 'pending'], ['ravi', 'pending'],
  ];
  guests.forEach(([u, st, r]) => invite(P, u, st, r, { group: 'Friend' }));
  team('cpdrinks', P, 'Drinks', '🍹', 'sky', 'Cocktails, mocktails, ice and enough cups.', 70, 'priya', ['leo', 'omar']);
  team('cpfood', P, 'Food', '🍕', 'coral', 'Snacks, pizza order and a dessert table.', 60, 'zoe', ['ben', 'jonas']);
  team('cpmusic', P, 'Music', '🎵', 'lav', 'Playlist, speakers and keeping the neighbours happy.', 15, 'dan', ['mei']);
  team('cpdeco', P, 'Decoration', '🎈', 'butter', 'Lights, balloons and the photo corner.', 35, 'noor', ['sofia']);
  ['priya', 'zoe', 'dan', 'noor'].forEach((u) => member(P, u, 'lead'));
  ['leo', 'omar', 'ben', 'jonas', 'mei', 'sofia'].forEach((u) => member(P, u, 'member'));
  ['theo', 'hana', 'ava', 'ella', 'ravi'].forEach((u) => member(P, u, 'guest'));

  task('tp1', P, 'cpdrinks', 'Buy ice and mixers', 'leo', toSat, 'high', 'todo', { subtasks: subs('3 bags of ice', 'Tonic and soda', 'Limes and mint') });
  task('tp2', P, 'cpdrinks', 'Batch the house punch', 'priya', toSat, 'medium', 'todo', { description: 'Alcohol-free version in the blue jug.' });
  task('tp3', P, 'cpdrinks', 'Borrow extra glasses', 'omar', toSat - 1, 'low', 'doing');
  task('tp4', P, 'cpfood', 'Order pizzas for 8pm', 'zoe', toSat - 1, 'high', 'doing', { checklist: subs('*Count dietary needs', '2 vegetarian, 1 gluten-free base', 'Confirm delivery slot') });
  task('tp5', P, 'cpfood', 'Bake brownies', 'ben', toSat, 'medium', 'todo');
  task('tp6', P, 'cpfood', 'Snack bowls and dips', 'jonas', toSat, 'low', 'todo');
  task('tp7', P, 'cpmusic', 'Build the shared playlist', 'dan', toSat - 1, 'medium', 'done', { comments: [say('mei', 'Added 20 songs, please keep the ABBA.', 30)] });
  task('tp8', P, 'cpmusic', 'Test the speakers', 'mei', toSat, 'medium', 'todo');
  task('tp9', P, 'cpdeco', 'Hang fairy lights', 'noor', toSat, 'medium', 'doing');
  task('tp10', P, 'cpdeco', 'Set up the photo corner', 'sofia', toSat, 'low', 'todo');
  task('tp11', P, null, 'Warn the neighbours', 'maya', toSat - 1, 'high', 'todo', { description: 'Note under doors 2 and 4. Music off by 11:30.' });
  task('tp12', P, null, 'Tidy the flat and clear the hallway', 'maya', toSat, 'medium', 'todo');
  task('tp13', P, 'cpdeco', 'Buy balloons and tape', 'noor', -1, 'low', 'done');

  sched(P, pDay, '17:30', '18:30', 'Set-up crew arrives', 'Living room', 'noor', { checklist: subs('*Move the sofa', 'Lights up', 'Speakers plugged in'), reminder: 30 });
  sched(P, pDay, '19:00', '19:30', 'Doors open and welcome drinks', 'Hallway', 'priya', { reminder: 15 });
  sched(P, pDay, '20:00', '20:45', 'Pizza arrives', 'Kitchen', 'zoe');
  sched(P, pDay, '21:00', '21:30', 'Flat-warming toast and group photo', 'Living room', 'maya', { description: 'Everyone in the photo corner.', reminder: 10 });
  sched(P, pDay, '21:30', '23:15', 'Dance floor', 'Living room', 'dan');
  sched(P, pDay, '23:15', '23:30', 'Wind down, music off', 'Everywhere', 'maya');

  spend(P, 'cpdrinks', 'Spirits and wine', 38, 'paid', 'priya', { receipt: 'receipt-cornershop.jpg' });
  spend(P, 'cpdrinks', 'Ice, mixers and limes', 22, 'planned', 'leo');
  spend(P, 'cpfood', 'Pizza order (6 large)', 48, 'planned', 'zoe');
  spend(P, 'cpfood', 'Brownie ingredients', 9, 'paid', 'ben');
  spend(P, 'cpmusic', 'Speaker cable', 8, 'paid', 'dan');
  spend(P, 'cpdeco', 'Fairy lights and balloons', 24, 'paid', 'noor', { receipt: 'receipt-partyshop.jpg' });
  spend(P, null, 'Cups, plates and napkins', 14, 'planned', 'maya');

  pic(P, 'organiser', '🎈', 'butter', 'Balloon haul', 'noor', 20); pic(P, 'organiser', '💡', 'lav', 'Fairy lights test run', 'noor', 9);
  pic(P, 'organiser', '🛒', 'mint', 'Drinks run, round one', 'priya', 28); const brown = pic(P, 'organiser', '🍫', 'coral', 'Brownie trial batch', 'ben', 6);
  pic(P, 'memories', '🪩', 'lav', 'Found the disco ball in the loft', 'maya', 40); pic(P, 'memories', '👟', 'sky', 'Dance shoes ready', 'leo', 12);
  pic(P, 'memories', '🍹', 'coral', 'Punch practice', 'priya', 26); pic(P, 'memories', '🎧', 'mint', 'Playlist is at 4 hours already', 'dan', 18);
  pic(P, 'memories', '🛋️', 'butter', 'New sofa, who dis', 'maya', 70);

  post(P, 'event', 'maya', 'Doors at 7! Buzz Flat 3. Bring a friend if you like, just add your plus-one so we order enough pizza 🍕', 30, { comments: [say('leo', 'Can’t wait!', 28), say('priya', 'Arjun is in.', 27)] });
  post(P, 'event', 'dan', 'Shared playlist is open. Add up to five songs each.', 18);
  post(P, 'internal', 'maya', 'Leads: budget is £180 all in. Drop receipts in Budget so we can split fairly. @Zoe can you confirm the pizza slot?', 22, { comments: [say('zoe', 'On it, will confirm by Thursday.', 20)] });
  post(P, 'team', 'ben', 'Trial brownies came out great. Making a nut-free tray too.', 6, { committeeId: 'cpfood', mediaId: brown });
  post(P, 'team', 'priya', '@Leo please grab ice on the day, the freezer is full.', 10, { committeeId: 'cpdrinks' });

  did(P, 'ben', 'RSVP’d “going”', 50); did(P, 'dan', 'completed “Build the shared playlist”', 30); did(P, 'noor', 'added a photo to the organiser gallery', 9);
  did(P, 'jonas', 'RSVP’d “maybe”', 14); did(P, 'priya', 'recorded an expense: Spirits and wine', 26); did(P, 'zoe', 'moved “Order pizzas for 8pm” to in progress', 5);

  /* =====================================================================
     2. Future Connect 2026 — Organised event with large-event features, 300 guests
     ===================================================================== */
  const F = 'evfc'; const fIn = 23; const fDay = addDays(fIn);
  event({ id: F, name: 'Future Connect 2026', category: 'university', complexity: 'organised', cover: { tone: 'sky', emoji: '🎓' },
    features: ['checkIn', 'calendar', 'dependencies', 'vendors', 'groups'],
    description: 'Kingsway’s annual networking festival: 300 students and alumni, 24 employers, one day of talks, speed networking and a careers fair.',
    date: fDay, start: '10:00', end: '18:00', location: 'Kingsway Students’ Union · Great Hall', expected: 300, privacy: 'link', budget: 18500, createdBy: 'helen' });
  member(F, 'helen', 'owner'); member(F, 'maya', 'manager');
  team('cfreg', F, 'Registration', '🎟️', 'sky', 'Ticketing, badges and the welcome desk.', 1200, 'jay', ['tess', 'kai', 'lily'], { group: 'Operations' });
  team('cflog', F, 'Logistics', '🚚', 'butter', 'Venue, floor plan, AV and on-the-day run sheet.', 6200, 'finn', ['leo', 'ravi', 'theo'], { group: 'Operations', status: 'atrisk' });
  team('cfmkt', F, 'Marketing', '📣', 'coral', 'Campaign, social content and attendee comms.', 1800, 'amara', ['isla', 'nico', 'gina'], { group: 'Outreach' });
  team('cfspo', F, 'Sponsorship', '🤝', 'mint', 'Employer partners, stands and sponsor packages.', 900, 'dan', ['ruth', 'luca'], { group: 'Outreach' });
  team('cfhos', F, 'Hospitality', '☕', 'lav', 'Catering, speaker care and the volunteer lounge.', 7400, 'sofia', ['hana', 'ben', 'mei'], { group: 'Experience' });
  team('cfpro', F, 'Programme', '🎤', 'coral', 'Speakers, panels and the speed-networking format.', 1000, 'ella', ['jonas', 'zoe'], { group: 'Experience' });
  ['jay', 'finn', 'amara', 'dan', 'sofia', 'ella'].forEach((u) => member(F, u, 'lead'));
  ['tess', 'kai', 'lily', 'leo', 'ravi', 'theo', 'isla', 'nico', 'gina', 'ruth', 'luca', 'hana', 'ben', 'mei', 'jonas', 'zoe'].forEach((u) => member(F, u, 'member'));
  member(F, 'sam', 'vendor', { company: 'Brightside Catering', service: 'Lunch and refreshments', phone: '020 7946 0142' });
  member(F, 'marc', 'vendor', { company: 'Soundframe AV', service: 'Stage, sound and screens', phone: '020 7946 0188' });
  member(F, 'ava', 'guest'); invite(F, 'ava', 'pending', {}, { group: 'Student', plusOneAllowed: false });

  // 311 generated attendees so the guest table behaves like a real 300-person event.
  let seedN = 20261; const rnd = () => { seedN = (seedN * 1664525 + 1013904223) % 4294967296; return seedN / 4294967296; }; const pick = (l) => l[Math.floor(rnd() * l.length)];
  const first = ['Aisha', 'Tom', 'Chloe', 'Arjun', 'Yuki', 'Liam', 'Fatima', 'Noah', 'Grace', 'Mateo', 'Sana', 'Oliver', 'Imani', 'Jack', 'Leila', 'Ethan', 'Nina', 'Kofi', 'Emily', 'Hugo', 'Anya', 'Sami', 'Freya', 'Dev', 'Rosa', 'Callum', 'Zainab', 'Max', 'Elif', 'Joe'];
  const last = ['Khan', 'Walker', 'Ng', 'Osei', 'Clarke', 'Ivanova', 'Mensah', 'Hughes', 'Sato', 'Reid', 'Costa', 'Ali', 'Fraser', 'Petrov', 'Doyle', 'Lim', 'Baker', 'Kaur', 'Novak', 'Evans', 'Hassan', 'Wright', 'Park', 'Moreau'];
  const groups = ['Student', 'Student', 'Student', 'Student', 'Alumni', 'Alumni', 'Employer', 'Speaker', 'Faculty'];
  const diets = ['', '', '', '', '', 'Vegetarian', 'Vegan', 'Halal', 'Gluten-free', 'Nut allergy'];
  for (let i = 0; i < 311; i++) {
    const name = `${first[i % first.length]} ${last[Math.floor(rnd() * last.length)]}`; const r = rnd();
    const status = r < 0.6 ? 'going' : r < 0.69 ? 'maybe' : r < 0.77 ? 'declined' : 'pending'; const group = pick(groups);
    invite(F, null, status, status === 'going' ? { dietary: pick(diets), arrival: pick(['09:30', '09:45', '10:00', '10:00', '10:30', '11:00', '13:00']) } : {},
      { name, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@${group === 'Employer' ? 'company.example' : 'kingsway.example'}`, group, plusOneAllowed: false });
  }

  task('tf1', F, 'cflog', 'Sign venue hire agreement', 'finn', -12, 'high', 'done');
  task('tf2', F, 'cflog', 'Finalise floor plan for 24 employer stands', 'leo', 3, 'high', 'doing', { dependsOn: ['tf1', 'tf12'], description: 'Fire exits must stay clear. Stands along the east wall, stage at the north end.', subtasks: subs('*Measure the Great Hall', '*Draft layout v1', 'Walk-through with venue manager', 'Share final PDF with sponsors'), comments: [say('finn', 'Venue wants the final plan a full two weeks ahead.', 40), say('leo', 'Waiting on the last three stand sizes from Sponsorship.', 16)] });
  task('tf3', F, 'cflog', 'Book AV supplier and confirm tech spec', 'finn', -4, 'high', 'done', { dependsOn: ['tf1'] });
  task('tf4', F, 'cflog', 'Order signage and wayfinding', 'ravi', 9, 'medium', 'blocked', { dependsOn: ['tf2', 'tf15'], description: 'Blocked until the floor plan and brand kit are final.' });
  task('tf5', F, 'cflog', 'Run sheet for the day', 'leo', 12, 'medium', 'todo', { dependsOn: ['tf21'], checklist: subs('Load-in times', 'Stage cues', 'Radio channels', 'Emergency contacts') });
  task('tf6', F, 'cflog', 'Risk assessment and insurance', 'theo', 6, 'high', 'doing');
  task('tf7', F, 'cflog', 'Deliver stage plot and power plan', 'marc', 10, 'medium', 'todo', { dependsOn: ['tf2'], description: 'Vendor task for Soundframe AV.' });
  task('tf8', F, 'cfreg', 'Open registration page', 'jay', -20, 'high', 'done');
  task('tf9', F, 'cfreg', 'Design and print name badges', 'tess', 14, 'medium', 'todo', { dependsOn: ['tf10'] });
  task('tf10', F, 'cfreg', 'Close registration and export attendee list', 'kai', 11, 'high', 'todo');
  task('tf11', F, 'cfreg', 'Train welcome-desk volunteers', 'lily', 18, 'medium', 'todo', { subtasks: subs('Write desk script', 'Check-in app walkthrough', 'Accessibility briefing') });
  task('tf12', F, 'cfspo', 'Confirm final list of employer partners', 'dan', 1, 'high', 'doing', { description: '21 of 24 confirmed. Chasing three.', subtasks: subs('*Gold partners (4)', '*Silver partners (8)', 'Standard stands (12)') });
  task('tf13', F, 'cfspo', 'Collect sponsor logos and stand requirements', 'ruth', 4, 'medium', 'doing', { dependsOn: ['tf12'] });
  task('tf14', F, 'cfspo', 'Send sponsor invoices', 'luca', 7, 'medium', 'todo', { dependsOn: ['tf12'] });
  task('tf15', F, 'cfmkt', 'Finish the event brand kit', 'amara', -2, 'high', 'doing', { description: 'Two days over. Poster and badge templates are waiting on this.' });
  task('tf16', F, 'cfmkt', 'Launch social countdown campaign', 'isla', 5, 'medium', 'todo', { dependsOn: ['tf15'] });
  task('tf17', F, 'cfmkt', 'Email reminder to registered attendees', 'nico', 16, 'medium', 'todo', { dependsOn: ['tf10'] });
  task('tf18', F, 'cfmkt', 'Brief the event photographer', 'gina', 19, 'low', 'todo');
  task('tf19', F, 'cfhos', 'Confirm catering numbers and dietary breakdown', 'sofia', 13, 'high', 'todo', { dependsOn: ['tf10'] });
  task('tf20', F, 'cfhos', 'Final menu and service times', 'sam', 15, 'medium', 'todo', { dependsOn: ['tf19'], description: 'Vendor task for Brightside Catering.' });
  task('tf21', F, 'cfpro', 'Lock the programme and speaker line-up', 'ella', 2, 'high', 'doing', { subtasks: subs('*Keynote confirmed', '*Panel 1 speakers', 'Panel 2 moderator', 'Speed-networking host') });
  task('tf22', F, 'cfpro', 'Collect speaker bios and headshots', 'jonas', 8, 'low', 'todo', { dependsOn: ['tf21'] });
  task('tf23', F, 'cfpro', 'Design the speed-networking rotation', 'zoe', 10, 'medium', 'todo');
  task('tf24', F, 'cfhos', 'Speaker green room and gifts', 'hana', 17, 'low', 'todo');
  task('tf25', F, 'cfhos', 'Volunteer lounge and rota snacks', 'ben', 20, 'low', 'todo');
  task('tf26', F, null, 'Weekly steering update to the faculty', 'maya', 2, 'medium', 'todo', { checklist: subs('Budget position', 'RSVP numbers', 'Risks and blockers') });
  task('tf27', F, null, 'Approve final budget reforecast', 'maya', 6, 'high', 'todo', { dependsOn: ['tf14'] });
  task('tf28', F, 'cflog', 'Accessibility walk-through of the venue', 'maya', 9, 'medium', 'doing');
  task('tf29', F, 'cfhos', 'Order coffee cart for the careers fair', 'mei', 12, 'low', 'done');

  const setup = addDays(fIn - 1);
  sched(F, setup, '15:00', '18:00', 'Load-in and stand build', 'Great Hall', 'finn', { checklist: subs('Stage and screens', 'Stand furniture', 'Signage', 'Power test') });
  sched(F, setup, '18:00', '19:00', 'Volunteer briefing', 'Room 2.04', 'lily');
  sched(F, fDay, '08:00', '09:30', 'Final set-up and sound check', 'Great Hall', 'marc', { reminder: 30 });
  sched(F, fDay, '09:30', '10:00', 'Registration and coffee', 'Foyer', 'jay', { reminder: 15 });
  sched(F, fDay, '10:00', '10:20', 'Welcome from the Vice-Chancellor', 'Main stage', 'helen');
  sched(F, fDay, '10:20', '11:00', 'Keynote: Careers nobody has invented yet', 'Main stage', 'ella');
  sched(F, fDay, '11:15', '12:15', 'Panel: Your first five years', 'Main stage', 'jonas');
  sched(F, fDay, '12:15', '13:15', 'Lunch and employer stands', 'Great Hall', 'sofia', { description: 'Served by Brightside Catering.' });
  sched(F, fDay, '13:15', '14:45', 'Speed networking, three rounds', 'Hall B', 'zoe', { checklist: subs('Table numbers', 'Round timer', 'Conversation cards') });
  sched(F, fDay, '15:00', '16:00', 'Panel: Founders under 30', 'Main stage', 'ella');
  sched(F, fDay, '16:00', '17:30', 'Careers fair and CV clinic', 'Great Hall', 'dan');
  sched(F, fDay, '17:30', '18:00', 'Closing drinks and prize draw', 'Foyer', 'maya');

  spend(F, 'cflog', 'Great Hall venue hire', 3200, 'paid', 'finn', { receipt: 'invoice-venue.pdf', date: addDays(-12) });
  spend(F, 'cflog', 'Soundframe AV package', 2400, 'planned', 'finn', { description: '50% deposit due next week.' });
  spend(F, 'cflog', 'Signage and wayfinding', 420, 'planned', 'ravi');
  spend(F, 'cflog', 'Event insurance', 310, 'paid', 'theo', { receipt: 'policy-schedule.pdf' });
  spend(F, 'cfhos', 'Catering: lunch for 320', 5600, 'planned', 'sofia', { description: '£17.50 a head, dietary options included.' });
  spend(F, 'cfhos', 'Catering deposit', 1400, 'paid', 'sofia', { receipt: 'brightside-deposit.pdf' });
  spend(F, 'cfhos', 'Coffee cart', 380, 'paid', 'mei');
  spend(F, 'cfmkt', 'Paid social campaign', 600, 'planned', 'amara');
  spend(F, 'cfmkt', 'Posters and flyers', 340, 'paid', 'isla', { receipt: 'printshop-0921.pdf' });
  spend(F, 'cfmkt', 'Photographer, full day', 650, 'planned', 'gina');
  spend(F, 'cfreg', 'Badges and lanyards', 520, 'planned', 'tess');
  spend(F, 'cfreg', 'Registration platform fee', 290, 'paid', 'jay');
  spend(F, 'cfspo', 'Sponsor welcome packs', 480, 'planned', 'ruth');
  spend(F, 'cfpro', 'Speaker travel', 720, 'planned', 'ella');
  spend(F, 'cfpro', 'Speaker gifts', 180, 'paid', 'hana');

  pic(F, 'organiser', '📐', 'butter', 'Floor plan v1 on the whiteboard', 'leo', 44); pic(F, 'organiser', '🏛️', 'sky', 'Great Hall site visit', 'finn', 300);
  pic(F, 'organiser', '🖨️', 'coral', 'First poster proofs', 'isla', 60); pic(F, 'organiser', '🎟️', 'lav', 'Badge mock-ups', 'tess', 25);
  pic(F, 'organiser', '☕', 'mint', 'Menu tasting with Brightside', 'sofia', 90); pic(F, 'organiser', '🎬', 'sky', 'Stage walk-through', 'marc', 70, 'video');
  pic(F, 'memories', '🎓', 'sky', 'Last year’s closing photo', 'helen', 500); pic(F, 'memories', '🤝', 'mint', 'Speed networking, 2025', 'maya', 480); pic(F, 'memories', '🎤', 'coral', 'Throwback: the keynote crowd', 'amara', 460);

  post(F, 'event', 'helen', 'Registration closes in 11 days. The full programme goes live on Friday. Bring a CV and questions for our 24 employer partners.', 26, { comments: [say('ava', 'Will the CV clinic need booking?', 20), say('ella', 'Drop-in, no booking needed.', 19)] });
  post(F, 'event', 'amara', 'Keynote announced: “Careers nobody has invented yet”. Doors 9:30, talks from 10.', 70);
  post(F, 'internal', 'maya', 'Steering summary: registrations at 62%, budget tracking 4% under. Main risk is the floor plan, which is holding up signage. @Finn @Daniel let’s unblock this week.', 8, { comments: [say('dan', 'Three employers left to confirm, I’ll have sizes by tomorrow.', 6), say('finn', 'Venue walk-through booked for Thursday.', 5)] });
  post(F, 'internal', 'helen', 'Reminder that contracts and the budget workbook are organisers-only. Please don’t forward them outside the core team.', 50);
  post(F, 'team', 'finn', 'Logistics: AV spec is signed off. @Leo owns the floor plan, @Ravi signage once it lands.', 30, { committeeId: 'cflog', comments: [say('leo', 'Draft v2 going up tonight.', 12)] });
  post(F, 'team', 'dan', 'Sponsorship: 21 of 24 partners confirmed. Gold tier is full.', 14, { committeeId: 'cfspo' });
  post(F, 'team', 'amara', 'Marketing: brand kit is late, my fault. Final files tomorrow morning.', 9, { committeeId: 'cfmkt' });

  file(F, 'Contracts', 'Venue hire agreement (signed).pdf', 'pdf', '1.2 MB', 'finn', { confidential: true });
  file(F, 'Contracts', 'Brightside Catering contract.pdf', 'pdf', '860 KB', 'sofia', { confidential: true });
  file(F, 'Contracts', 'Soundframe AV quote and terms.pdf', 'pdf', '540 KB', 'finn', { confidential: true });
  file(F, 'Finance', 'Budget workbook 2026.xlsx', 'sheet', '310 KB', 'maya', { confidential: true });
  file(F, 'Finance', 'Sponsor package pricing.xlsx', 'sheet', '95 KB', 'dan', { confidential: true, committeeId: 'cfspo' });
  file(F, 'Venue', 'Great Hall floor plan v1.pdf', 'pdf', '2.4 MB', 'leo', { vendorShared: true, committeeId: 'cflog' });
  file(F, 'Venue', 'Venue access and loading bay.pdf', 'pdf', '420 KB', 'finn', { vendorShared: true });
  file(F, 'Venue', 'Risk assessment draft.docx', 'doc', '180 KB', 'theo');
  file(F, 'Vendors', 'Vendor contact sheet.xlsx', 'sheet', '40 KB', 'maya', { vendorShared: true });
  file(F, 'Vendors', 'Catering dietary summary.xlsx', 'sheet', '55 KB', 'sofia', { vendorShared: true, committeeId: 'cfhos' });
  file(F, 'Marketing', 'Poster A3 proof.png', 'image', '3.1 MB', 'isla', { committeeId: 'cfmkt' });
  file(F, 'Marketing', 'Brand kit (draft).pdf', 'pdf', '5.6 MB', 'amara', { committeeId: 'cfmkt' });
  file(F, 'Links', 'Registration page', 'link', '', 'jay', { url: 'https://example.com/future-connect/register' });
  file(F, 'Links', 'Shared programme sheet', 'link', '', 'ella', { url: 'https://example.com/future-connect/programme' });

  did(F, 'finn', 'completed “Book AV supplier and confirm tech spec”', 96); did(F, 'leo', 'moved “Finalise floor plan for 24 employer stands” to in progress', 44);
  did(F, 'ravi', 'moved “Order signage and wayfinding” to blocked', 20); did(F, 'dan', 'posted an internal update', 14); did(F, 'mei', 'completed “Order coffee cart for the careers fair”', 11);
  did(F, 'maya', 'posted an internal update', 8); did(F, 'sofia', 'recorded an expense: Catering deposit', 52);

  /* ---------- three lighter events, so one account shows several roles ---------- */
  const W = 'evwed';
  event({ id: W, name: 'Priya & Arjun’s Wedding', category: 'wedding', complexity: 'organised', cover: { tone: 'coral', emoji: '💐' }, description: 'A garden ceremony followed by dinner and dancing.',
    date: addDays(45), start: '14:00', end: '23:00', location: 'Larkfield Gardens, Surrey', expected: 90, budget: 12000, createdBy: 'priya' });
  member(W, 'priya', 'owner'); member(W, 'maya', 'guest'); member(W, 'ava', 'guest'); member(W, 'zoe', 'manager');
  invite(W, 'maya', 'pending', {}, { group: 'Friends of the bride' }); invite(W, 'ava', 'going', { dietary: 'Vegetarian', arrival: '13:30' }); invite(W, 'leo', 'maybe');
  sched(W, addDays(45), '14:00', '14:45', 'Ceremony', 'Rose garden', 'zoe'); sched(W, addDays(45), '15:00', '16:30', 'Drinks reception', 'Terrace', 'zoe'); sched(W, addDays(45), '17:00', '19:00', 'Wedding breakfast', 'Orangery', 'zoe'); sched(W, addDays(45), '19:30', '23:00', 'First dance and party', 'Orangery', 'zoe');
  post(W, 'event', 'priya', 'Invitations are out! Please RSVP and tell us about any dietary needs.', 60);

  const D = 'evdin';
  event({ id: D, name: 'Noor’s 30th Birthday Dinner', category: 'birthday', complexity: 'simple', cover: { tone: 'butter', emoji: '🎂' }, description: 'Long table, good food, terrible speeches.',
    date: addDays(9), start: '19:30', end: '22:30', location: 'Olive & Thyme, Camden', expected: 12, createdBy: 'noor' });
  member(D, 'noor', 'owner'); member(D, 'maya', 'guest'); member(D, 'leo', 'guest'); member(D, 'ava', 'guest');
  invite(D, 'maya', 'going', { arrival: '19:30', message: 'Wouldn’t miss it.' }); invite(D, 'leo', 'going'); invite(D, 'ava', 'maybe'); invite(D, 'dan', 'pending');
  sched(D, addDays(9), '19:30', '20:00', 'Arrive and order drinks', 'Olive & Thyme', 'noor'); sched(D, addDays(9), '20:00', '22:00', 'Dinner', 'Private room', 'noor');
  post(D, 'event', 'noor', 'Table is booked for 7:30. Set menu, tell me dietary needs when you RSVP!', 80);
  pic(D, 'memories', '🎂', 'butter', 'Cake tasting, strictly research', 'noor', 30);

  const C = 'evsum';
  event({ id: C, name: 'DesignOps Summit 2027', category: 'conference', complexity: 'large', cover: { tone: 'mint', emoji: '🎤' }, description: 'Two tracks, 600 attendees, one very large coffee order.',
    date: addDays(80), start: '09:00', end: '18:00', location: 'The Exchange, Manchester', expected: 600, budget: 85000, createdBy: 'theo' });
  member(C, 'theo', 'owner'); member(C, 'maya', 'lead'); member(C, 'kai', 'member'); member(C, 'lily', 'member'); member(C, 'amara', 'lead');
  team('csspk', C, 'Speakers', '🎤', 'lav', 'Call for papers, selection and speaker care.', 14000, 'maya', ['kai', 'lily'], { group: 'Programme' });
  team('csmkt', C, 'Marketing', '📣', 'coral', 'Launch campaign and ticket sales.', 9000, 'amara', [], { group: 'Outreach' });
  task('ts1', C, 'csspk', 'Shortlist keynote speakers', 'maya', 4, 'high', 'doing', { subtasks: subs('*Longlist of 12', 'Shortlist of 4', 'Fee conversations') });
  task('ts2', C, 'csspk', 'Publish call for papers', 'maya', 10, 'medium', 'todo', { dependsOn: ['ts1'] });
  task('ts3', C, 'csspk', 'Set up review panel', 'kai', 14, 'medium', 'todo');
  task('ts4', C, 'csspk', 'Draft speaker agreement', 'lily', 18, 'low', 'todo');
  task('ts5', C, 'csmkt', 'Launch early-bird tickets', 'amara', 21, 'high', 'todo');
  sched(C, addDays(80), '09:00', '09:45', 'Opening keynote', 'Main hall', 'maya'); sched(C, addDays(80), '10:00', '12:30', 'Track sessions', 'Halls A and B', 'maya');
  post(C, 'internal', 'theo', 'Welcome aboard, leads. Budgets are in your team pages.', 100);

  /* ---------- notifications ---------- */
  note('maya', W, 'Priya invited you to Priya & Arjun’s Wedding', `invite-${W}`, 60);
  note('maya', P, 'Jonas replied “maybe” to Saturday House Party', `e-${P}-people`, 14);
  note('maya', F, 'Ravi marked “Order signage and wayfinding” blocked', `e-${F}-tasks`, 20);
  note('maya', F, 'Daniel commented on your steering summary', `e-${F}-updates`, 6);
  note('maya', P, 'Ben added a photo to the Food committee', `e-${P}-gallery`, 6, true);
  note('maya', C, 'Theo assigned you: Shortlist keynote speakers', `e-${C}-tasks`, 120, true);
  note('maya', F, 'Mei completed “Order coffee cart for the careers fair”', `e-${F}-tasks`, 11, true);
  note('leo', P, 'Priya mentioned you in Saturday House Party', `e-${P}-updates`, 10);
  note('leo', F, 'Finn mentioned you in Future Connect 2026', `e-${F}-updates`, 30);
  note('leo', F, 'New task for you: Run sheet for the day', `e-${F}-tasks`, 90, true);
  note('ava', P, 'Maya invited you to Saturday House Party', `invite-${P}`, 48);
  note('ava', F, 'You’re invited to Future Connect 2026', `invite-${F}`, 100);
  note('dan', F, 'Maya mentioned you in Future Connect 2026', `e-${F}-updates`, 8);
  note('sam', F, 'New task for you: Final menu and service times', `e-${F}-tasks`, 72);
  return s;
}

// Personas offered by the demo switcher (prototype stand-in for signing in as different people).
export const PERSONAS = [
  { id: 'maya', note: 'Hosts the party, manages Future Connect, leads a team, guest elsewhere' },
  { id: 'leo', note: 'Committee member in both demo events' },
  { id: 'dan', note: 'Team lead: Music and Sponsorship' },
  { id: 'ava', note: 'Guest who has not replied yet' },
  { id: 'sam', note: 'Vendor: Brightside Catering' },
];
