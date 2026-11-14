# Row-level security tests for supabase/schema.sql. See the README section "Testing the database rules".
import json, uuid, sys, psycopg2
P = json.load(open(sys.argv[1]))
import os
conn = psycopg2.connect(dbname=os.environ.get('PGDATABASE', 'gather'), user=os.environ.get('PGUSER', 'postgres'), host=os.environ.get('PGHOST', '/var/run/postgresql'))
results = []
def ok(c, m): results.append(c); print(('PASS ' if c else 'FAIL ') + m)
U = {n: str(uuid.uuid4()) for n in ['alice', 'bob', 'carl', 'dana', 'erin', 'vic', 'zed', 'pat', 'quinn']}
def admin(sql, a=None):
    with conn.cursor() as c: c.execute(sql, a); conn.commit()
for n, u in U.items(): admin("insert into auth.users values (%s, %s)", (u, n + '@x.com'))
def run(who, sql, a=None, fetch=True):
    """Runs one statement as a signed-in user. Returns rows, rowcount, or ('ERR', message)."""
    try:
        with conn.cursor() as c:
            c.execute("set local role authenticated; select set_config('request.jwt.claim.sub', %s, true)", (U[who],))
            c.execute(sql, a)
            out = c.fetchall() if (fetch and c.description) else c.rowcount
        conn.commit(); return out
    except Exception as e:
        conn.rollback(); return ('ERR', str(e).split('\n')[0])
def err(r): return isinstance(r, tuple) and r[0] == 'ERR'
def pid(who): return run(who, "select (ensure_me(%s)).id", (who.title(),))[0][0]

ids = {n: pid(n) for n in ['alice', 'bob', 'carl', 'dana', 'erin', 'vic', 'zed']}
ok(all(ids.values()) and len(set(ids.values())) == 7, 'ensure_me creates one profile per account')
ok(pid('alice') == ids['alice'], 'ensure_me is stable across sign-ins')
J = json.dumps
perm = J(P['organised'])
# alice creates an organised event the way the app's sync does: event, then her owner membership, then the rest.
E = 'evE'
r = run('alice', "insert into events (id,name,date,created_by,permissions,features,privacy,complexity) values (%s,'Expo','2026-12-01',%s,%s,'[\"vendors\",\"dependencies\"]','link','organised')", (E, ids['alice'], perm))
ok(r == 1, 'owner creates an event')
ok(run('alice', "insert into memberships (id,event_id,user_id,role) values ('mA',%s,%s,'owner')", (E, ids['alice'])) == 1, 'creator adds own owner membership')
ok(err(run('zed', "insert into memberships (id,event_id,user_id,role) values ('mZ',%s,%s,'owner')", (E, ids['zed']))), 'outsider cannot make themselves owner')
ok(run('alice', "insert into event_private values (%s, 5000, '{}')", (E,)) == 1, 'owner adds private budget')
for i, (n, role) in enumerate([('bob', 'manager'), ('carl', 'lead'), ('dana', 'member'), ('erin', 'guest'), ('vic', 'vendor')]):
    r = run('alice', "insert into memberships (id,event_id,user_id,role) values (%s,%s,%s,%s)", ('m%d' % i, E, ids[n], role)); ok(r == 1, 'owner adds %s as %s' % (n, role))
run('alice', "insert into committees (id,event_id,name) values ('cA',%s,'Alpha'),('cB',%s,'Beta')", (E, E))
run('alice', "insert into committee_budgets values ('cA',%s,1000),('cB',%s,800)", (E, E))
ok(run('alice', "insert into committee_memberships values ('cm1','cA',%s,'lead'),('cm2','cA',%s,'member')", (ids['carl'], ids['dana'])) == 2, 'owner staffs team Alpha')
run('alice', "insert into tasks (id,event_id,committee_id,title,assignee_id) values ('t1',%s,'cA','Book venue',%s),('t2',%s,'cB','Print badges',%s),('t3',%s,null,'Vendor menu',%s)", (E, ids['dana'], E, ids['bob'], E, ids['vic']))
run('alice', "insert into expenses (id,event_id,committee_id,title,amount) values ('x1',%s,'cA','Deposit',300)", (E,))
run('alice', "insert into invitations (id,event_id,user_id,name) values ('i1',%s,%s,'Erin'),('i2',%s,null,'Walk-in')", (E, ids['erin'], E))
run('alice', "insert into announcements (id,event_id,scope,user_id,text) values ('a1',%s,'event',%s,'Hello all'),('a2',%s,'internal',%s,'Budget is tight'),('a3',%s,'team',%s,'Alpha only')", (E, ids['alice'], E, ids['alice'], E, ids['alice']))
run('alice', "update announcements set committee_id='cA' where id='a3'")
run('alice', "insert into files (id,event_id,name,confidential,vendor_shared) values ('f1',%s,'Contract.pdf',true,false),('f2',%s,'Floor plan.pdf',false,true),('f3',%s,'Notes.doc',false,false)", (E, E, E))

def count(who, table): r = run(who, 'select count(*) from ' + table + " where " + ("id = 'evE'" if table == 'events' else "event_id = 'evE'")); return r[0][0] if not err(r) else r
# --- reading ---
ok(count('erin', 'events') == 1 and count('zed', 'events') == 0, 'guest sees the event, outsider does not')
ok(count('erin', 'event_private') == 0 and count('erin', 'expenses') == 0 and count('erin', 'committee_budgets') == 0, 'guest cannot see any budget figures')
ok(count('bob', 'event_private') == 1 and count('bob', 'expenses') == 1, 'manager sees the budget')
ok(count('dana', 'expenses') == 0, 'team member (default permissions) cannot see the budget')
ok(run('erin', "select id from announcements order by id") == [('a1',)], 'guest sees only the event-wide announcement')
ok(run('dana', "select id from announcements order by id") == [('a1',), ('a2',), ('a3',)], 'team member sees internal and own-team posts')
ok(run('bob', "select id from announcements where scope='team'") == [('a3',)], 'manager sees team posts')
ok(run('erin', "select id from invitations") == [('i1',)], 'guest sees only their own invitation in an organised event')
ok(count('bob', 'invitations') == 2, 'manager sees the whole guest list')
ok(run('vic', "select id from files") == [('f2',)], 'vendor sees only the file shared with vendors')
ok(run('dana', "select id from files order by id") == [('f2',), ('f3',)], 'member sees non-confidential files only')
ok(count('bob', 'files') == 3, 'manager sees confidential files')
ok(run('vic', "select id from tasks") == [('t3',)], 'vendor sees only their own task')
ok(count('dana', 'tasks') == 3, 'member sees all tasks')
ok(count('zed', 'tasks') == 0 and count('zed', 'invitations') == 0 and count('zed', 'memberships') == 0, 'outsider sees nothing')
ok(run('erin', "select count(*) from people")[0][0] >= 5, 'event members can see each other')
ok(run('zed', "select count(*) from people")[0][0] == 1, 'outsider sees only themselves')
# --- writing ---
ok(run('dana', "update tasks set status='doing' where id='t1'") == 1, 'assignee updates progress')
ok(err(run('dana', "update tasks set title='Hacked' where id='t1'")), 'assignee cannot rename the task')
ok(run('dana', "update tasks set status='done' where id='t2'") == 0, 'member cannot update a task that is not theirs')
ok(run('carl', "insert into tasks (id,event_id,committee_id,title) values ('t4',%s,'cA','Lead task')", (E,)) == 1, 'team lead creates a task in their team')
ok(err(run('carl', "insert into tasks (id,event_id,committee_id,title) values ('t5',%s,'cB','Other team')", (E,))), 'team lead cannot create tasks in another team')
ok(run('carl', "update tasks set title='Book the venue' where id='t1'") == 1, 'team lead edits task details in their team')
ok(run('carl', "insert into memberships (id,event_id,user_id,role) values ('mq',%s,%s,'member')", (E, ids['zed'])) == 1, 'team lead adds a new person to the event')
ok(err(run('carl', "insert into memberships (id,event_id,user_id,role) values ('mq2',%s,%s,'manager')", (E, ids['zed']))), 'team lead cannot appoint managers')
run('alice', "delete from memberships where id='mq'")
ok(run('carl', "update committees set status='atrisk' where id='cA'") == 1 and run('carl', "update committees set status='atrisk' where id='cB'") == 0, 'team lead updates only their own team status')
ok(run('carl', "delete from committees where id='cA'") == 0, 'team lead cannot delete a team')
ok(err(run('erin', "insert into tasks (id,event_id,title) values ('tx',%s,'Guest task')", (E,))), 'guest cannot create tasks')
ok(run('erin', "update invitations set rsvp = rsvp || '{\"status\":\"going\",\"dietary\":\"Vegan\"}' where id='i1'") == 1, 'guest updates their own RSVP')
ok(err(run('erin', "update invitations set reminders = 9 where id='i1'")), 'guest cannot change anything else on the invitation')
ok(run('erin', "update invitations set rsvp='{}' where id='i2'") == 0, 'guest cannot touch other invitations')
ok(run('erin', "update announcements set comments='[{\"text\":\"yay\"}]' where id='a1'") == 1, 'guest comments on an announcement')
ok(err(run('erin', "update announcements set text='edited' where id='a1'")), 'guest cannot edit someone else’s announcement')
ok(err(run('erin', "insert into announcements (id,event_id,scope,user_id,text) values ('ax',%s,'event',%s,'spam')", (E, ids['erin']))), 'guest cannot post announcements in an organised event')
ok(run('bob', "update events set name='Renamed' where id=%s", (E,)) == 0, 'manager cannot change event settings (owner only)')
ok(run('bob', "update event_private set budget=6000 where event_id=%s", (E,)) == 1, 'manager updates the budget total')
ok(err(run('bob', "update memberships set role='guest' where id='mA'")) or run('bob', "update memberships set role='guest' where id='mA'") == 0, 'manager cannot demote the owner')
ok(run('bob', "update memberships set role='lead' where id='m3'") == 1, 'manager changes a guest’s role')
run('alice', "update memberships set role='guest' where id='m3'")
ok(err(run('erin', "insert into notifications (id,user_id,event_id,text) values ('n1',%s,%s,'hi')", (ids['zed'], E))), 'cannot notify someone outside the event')
ok(run('erin', "insert into notifications (id,user_id,event_id,text) values ('n2',%s,%s,'hi')", (ids['alice'], E)) == 1, 'can notify someone in the same event')
ok(run('alice', "select count(*) from notifications")[0][0] == 1 and run('bob', "select count(*) from notifications")[0][0] == 0, 'notifications are private to the recipient')
# --- galleries and storage ---
ok(run('erin', "insert into media (id,event_id,gallery,user_id) values ('md1',%s,'memories',%s)", (E, ids['erin'])) == 1, 'guest adds to event memories')
ok(err(run('erin', "insert into media (id,event_id,gallery,user_id) values ('md2',%s,'organiser',%s)", (E, ids['erin']))), 'guest cannot add to the organiser gallery')
ok(err(run('erin', "insert into media (id,event_id,gallery,user_id) values ('md3',%s,'memories',%s)", (E, ids['bob']))), 'cannot post media as someone else')
ok(run('erin', "insert into storage.objects (bucket_id,name,owner) values ('media','evE/memories/md1.jpg',%s)", (U['erin'],)) == 1, 'guest uploads a memories photo')
ok(err(run('erin', "insert into storage.objects (bucket_id,name,owner) values ('media','evE/organiser/x.jpg',%s)", (U['erin'],))), 'guest cannot upload to the organiser folder')
ok(run('zed', "select count(*) from storage.objects")[0][0] == 0 and run('dana', "select count(*) from storage.objects")[0][0] == 1, 'only event members can read photos')
# --- permission matrix is live ---
run('alice', "update events set permissions = jsonb_set(permissions, '{guest,viewBudget}', 'true') where id=%s", (E,))
ok(count('erin', 'expenses') == 1, 'owner switches on budget for guests and it takes effect immediately')
run('alice', "update events set permissions = jsonb_set(permissions, '{guest,viewBudget}', 'false') where id=%s", (E,))
ok(count('erin', 'expenses') == 0, 'and switching it off hides it again')
# --- invitation links ---
p = run('zed', "select invite_preview(%s)", (E,))[0][0]; ok(p and p.get('name') == 'Expo' and p.get('hostName') == 'Alice', 'link event shows a preview to a signed-in stranger')
run('alice', "insert into events (id,name,date,created_by,privacy) values ('evP','Private dinner','2026-12-02',%s,'private')", (ids['alice'],)); run('alice', "insert into memberships values ('mP','evP',%s,'owner')", (ids['alice'],))
ok(run('zed', "select invite_preview('evP')")[0][0] == {'id': 'evP', 'private': True}, 'private event reveals nothing in the preview')
ok(err(run('zed', "select respond_to_invite('evP', '{\"status\":\"going\"}')")), 'cannot join a private event from a link')
run('zed', "select respond_to_invite(%s, '{\"status\":\"going\",\"dietary\":\"Halal\",\"checkedIn\":true}')", (E,))
ok(count('zed', 'events') == 1 and run('zed', "select rsvp->>'status', rsvp->>'dietary', rsvp ? 'checkedIn' from invitations")[0] == ('going', 'Halal', False), 'link RSVP joins as a guest and keeps only reply fields')
ok(run('alice', "select count(*) from notifications where text like '%%Zed replied%%'")[0][0] == 1, 'host is notified of the link RSVP')
# --- email invitations before an account exists ---
run('alice', "insert into people (id,name,email,created_by) values ('pPat','Pat','PAT@x.com',%s)", (ids['alice'],))
run('alice', "insert into memberships values ('mPat',%s,'pPat','member')", (E,)); run('alice', "insert into tasks (id,event_id,title,assignee_id) values ('t9',%s,'Pat job','pPat')", (E,))
pat = pid('pat'); ok(pat == 'pPat', 'signing up with an invited email claims the placeholder profile')
ok(run('pat', "select title from tasks where assignee_id = me()") == [('Pat job',)] and run('pat', "select my_role(%s)", (E,))[0][0] == 'member', 'their role and tasks are waiting for them')
run('alice', "insert into people (id,name,email,created_by) values ('pBob2','Bob again','bob@x.com',%s)", (ids['alice'],)); run('alice', "insert into memberships values ('mB2','evP','pBob2','guest')")
run('alice', "insert into invitations (id,event_id,user_id,name,email) values ('iB2','evP','pBob2','Bob again','bob@x.com')")
pid('bob'); ok(run('bob', "select my_role('evP')")[0][0] == 'guest' and run('admin' if False else 'alice', "select count(*) from people where id='pBob2'")[0][0] == 0, 'an existing account picks up a later email invitation on next sign-in')
run('alice', "insert into invitations (id,event_id,user_id,name,email) values ('iQ','evP',null,'Quinn','quinn@x.com')")
pid('quinn'); ok(run('quinn', "select my_role('evP')")[0][0] == 'guest' and run('quinn', "select count(*) from invitations")[0][0] == 1, 'an email-only invitation is claimed at sign-up')
ok(err(run('zed', "update people set auth_user_id = null where id = me()")), 'nobody can unlink an account from the app')
ok(run('zed', "update people set name='Hijack' where id=%s", (ids['alice'],)) == 0, 'cannot rename another account')
# --- import ---
good = {'people': [{'id': 'pS1', 'name': 'Sample Sam', 'email': '', 'tone': 'lav', 'bio': '', 'created_at': '2026-01-01T00:00:00Z'}],
        'events': [{'id': 'evS', 'name': 'Sample', 'category': 'other', 'description': '', 'start_time': '19:00', 'end_time': '', 'location': '', 'expected': 10, 'privacy': 'private', 'complexity': 'simple', 'task_view': 'list', 'currency': '£', 'date': '2026-12-12', 'created_by': ids['zed'], 'permissions': P['simple'], 'features': [], 'modules': [], 'cover': {}, 'created_at': '2026-01-01T00:00:00Z'}],
        'memberships': [{'id': 'mS1', 'event_id': 'evS', 'user_id': 'pS1', 'role': 'owner'}],
        'announcements': [{'id': 'aS1', 'event_id': 'evS', 'scope': 'event', 'user_id': 'pS1', 'text': 'From sample', 'at': '2026-01-01T00:00:00Z', 'comments': [], 'committee_id': None, 'media_id': None}]}
r = run('zed', "select import_events(%s)", (J(good),)); ok(r == [(1,)], 'import adds sample events: %s' % (r,))
ok(run('zed', "select my_role('evS')")[0][0] == 'owner' and run('zed', "select role from memberships where user_id='pS1'") == [('manager',)], 'the importer becomes owner; sample owners become managers')
bad = json.loads(J(good)); bad['events'][0]['id'] = 'evS2'; bad['people'] = []; bad['memberships'] = []; bad['announcements'] = [{'id': 'aS2', 'event_id': E, 'scope': 'event', 'user_id': ids['zed'], 'text': 'Injected'}]
ok(err(run('zed', "select import_events(%s)", (J(bad),))), 'import refuses rows that point at someone else’s event')
bad2 = json.loads(J(good)); bad2['events'][0]['id'] = 'evS3'; bad2['people'] = []; bad2['memberships'] = []; bad2['announcements'] = [{'id': 'aS3', 'event_id': 'evS3', 'scope': 'event', 'user_id': ids['alice'], 'text': 'Pretending'}]
ok(err(run('zed', "select import_events(%s)", (J(bad2),))), 'import refuses posts attributed to real accounts')
ok(run('alice', "select count(*) from announcements where text in ('Injected','Pretending')")[0][0] == 0, 'nothing from a refused import was written')
# --- delete cascades ---
ok(run('bob', "delete from events where id=%s", (E,)) == 0, 'manager cannot delete the event')
ok(run('alice', "delete from events where id=%s", (E,)) == 1 and run('alice', "select count(*) from tasks where event_id=%s", (E,))[0][0] == 0, 'owner deletes the event and everything in it goes with it')
print('\n%d passed, %d failed' % (sum(results), len(results) - sum(results)))
