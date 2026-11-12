// Permission checks are always scoped to one event and derived from the member's role in that event.
// The owner can do everything; every other role reads the event's editable permission matrix.
import { S, eventById, roleIn, meId, teamMembers, myTeams, tasksOf, has } from './store.js';

export function can(eventId, cap, userId = meId()) {
  const role = roleIn(eventId, userId);
  if (!role) return false;
  if (role === 'owner') return true;
  return !!eventById(eventId)?.permissions?.[role]?.[cap];
}
// The planner drafts teams, tasks and invitations, so it is offered only to people who may change all three.
export const canPlan = (eventId) => can(eventId, 'manageTeams') && can(eventId, 'manageTasks') && can(eventId, 'manageGuests');
export const isOwner = (eventId) => roleIn(eventId) === 'owner';
export const isOrganiser = (eventId) => ['owner', 'manager', 'lead', 'member'].includes(roleIn(eventId));
export const leadsTeam = (committeeId, userId = meId()) => teamMembers(committeeId).some((m) => m.userId === userId && m.role === 'lead');
export const inTeam = (committeeId, userId = meId()) => teamMembers(committeeId).some((m) => m.userId === userId);
export const canManageTeam = (c) => can(c.eventId, 'manageTeams') || leadsTeam(c.id);
// Full edit: organisers with the capability, or the lead of the task's team.
export const canEditTask = (t) => can(t.eventId, 'manageTasks') || (t.committeeId && leadsTeam(t.committeeId));
// Progress updates (status, checklists, comments): also the person the task is assigned to.
export const canUpdateTask = (t) => canEditTask(t) || t.assigneeId === meId();
export const canCreateTask = (eventId) => can(eventId, 'manageTasks') || myTeams(eventId).some((c) => leadsTeam(c.id));
export const canAddExpense = (eventId) => can(eventId, 'manageBudget') || (can(eventId, 'viewBudget') && myTeams(eventId).some((c) => leadsTeam(c.id)));

export function visibleTasks(eventId) {
  const all = tasksOf(eventId);
  return can(eventId, 'viewTasks') ? all : all.filter((t) => t.assigneeId === meId());
}
export function canSeePost(p) {
  if (p.scope === 'event') return true;
  if (!can(p.eventId, 'viewInternal')) return false;
  return p.scope === 'internal' || can(p.eventId, 'manageTeams') || inTeam(p.committeeId);
}
export function canSeeFile(f) {
  const role = roleIn(f.eventId);
  if (role === 'vendor') return !!f.vendorShared;
  if (!can(f.eventId, 'viewFiles')) return false;
  return !f.confidential || can(f.eventId, 'viewConfidential');
}
// Which workspace sections this person sees for this event.
export function sectionsFor(ev) {
  const id = ev.id; const role = roleIn(id); const mine = S().tasks.some((t) => t.eventId === id && t.assigneeId === meId());
  const show = {
    overview: true,
    people: can(id, 'viewGuests') || can(id, 'manageGuests'),
    teams: can(id, 'viewTeams') || (role === 'guest' && has(ev, 'volunteering')),
    tasks: can(id, 'viewTasks') || mine || role === 'vendor',
    schedule: true,
    budget: can(id, 'viewBudget'),
    gallery: can(id, 'viewOrganiserGallery') || can(id, 'viewMemories'),
    updates: true,
    files: can(id, 'viewFiles') || role === 'vendor',
  };
  const list = ev.modules.filter((m) => show[m]);
  if (canPlan(id)) list.splice(1, 0, 'planner');
  if (role === 'owner') list.push('setup');
  return list;
}
