// Product configuration. Everything brand- or policy-shaped lives here so it is easy to replace.
export const BRAND = { name: 'Gather', mark: '✿', tagline: 'Every event gets its own workspace.' };

export const TONES = ['lav', 'butter', 'coral', 'mint', 'sky'];

export const CATEGORIES = [
  { id: 'birthday', label: 'Birthday', emoji: '🎂', tone: 'coral' },
  { id: 'houseparty', label: 'House Party', emoji: '🪩', tone: 'lav' },
  { id: 'dinner', label: 'Dinner', emoji: '🍝', tone: 'butter' },
  { id: 'wedding', label: 'Wedding', emoji: '💐', tone: 'coral' },
  { id: 'university', label: 'University', emoji: '🎓', tone: 'sky' },
  { id: 'networking', label: 'Networking', emoji: '🤝', tone: 'mint' },
  { id: 'conference', label: 'Conference', emoji: '🎤', tone: 'sky' },
  { id: 'corporate', label: 'Corporate', emoji: '🏢', tone: 'lav' },
  { id: 'festival', label: 'Festival', emoji: '🎪', tone: 'butter' },
  { id: 'celebration', label: 'Celebration', emoji: '🎉', tone: 'mint' },
  { id: 'other', label: 'Other', emoji: '✨', tone: 'lav' },
];
export const category = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

// Workspace sections (modules). `setup` is always available to the owner.
export const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'planner', label: 'Planner', icon: 'sparkle' },
  { id: 'people', label: 'People', icon: 'users' },
  { id: 'teams', label: 'Teams', icon: 'flag' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks' },
  { id: 'schedule', label: 'Schedule', icon: 'clock' },
  { id: 'budget', label: 'Budget', icon: 'wallet' },
  { id: 'gallery', label: 'Gallery', icon: 'image' },
  { id: 'updates', label: 'Updates', icon: 'megaphone' },
  { id: 'files', label: 'Files', icon: 'folder' },
  { id: 'setup', label: 'Setup', icon: 'sliders' },
];

// Optional capabilities an owner can switch on at any time.
export const FEATURES = [
  { id: 'plusOnes', label: 'Plus-ones', hint: 'Guests can bring someone along.' },
  { id: 'volunteering', label: 'Guest volunteering', hint: 'Guests can offer to join a team.' },
  { id: 'checkIn', label: 'Door check-in', hint: 'Mark guests as arrived on the day.' },
  { id: 'dependencies', label: 'Task dependencies', hint: 'Tasks can wait on other tasks.' },
  { id: 'calendar', label: 'Task calendar', hint: 'See deadlines on a month grid.' },
  { id: 'vendors', label: 'Vendors', hint: 'Give suppliers a limited view.' },
  { id: 'groups', label: 'Departments', hint: 'Group teams under departments.' },
];

// Complexity presets only choose the *starting* layout. Nothing is locked.
export const COMPLEXITY = {
  simple: {
    label: 'Simple', blurb: 'House parties, dinners, birthdays.', emoji: '🎈', tone: 'coral', teamWord: 'Committee',
    modules: ['overview', 'people', 'teams', 'tasks', 'schedule', 'budget', 'gallery', 'updates'],
    features: ['plusOnes', 'volunteering'], taskView: 'list',
    teams: [['Drinks', '🍹', 'sky'], ['Food', '🍕', 'coral'], ['Music', '🎵', 'lav'], ['Decoration', '🎈', 'butter']],
  },
  organised: {
    label: 'Organised', blurb: 'Weddings, university and networking events.', emoji: '🗂️', tone: 'lav', teamWord: 'Team',
    modules: ['overview', 'people', 'teams', 'tasks', 'schedule', 'budget', 'gallery', 'updates', 'files'],
    features: ['plusOnes', 'checkIn', 'calendar', 'dependencies'], taskView: 'board',
    teams: [['Registration', '🎟️', 'sky'], ['Marketing', '📣', 'coral'], ['Logistics', '🚚', 'butter'], ['Hospitality', '☕', 'mint']],
  },
  large: {
    label: 'Large', blurb: 'Conferences, festivals, corporate productions.', emoji: '🏟️', tone: 'sky', teamWord: 'Team',
    modules: ['overview', 'people', 'teams', 'tasks', 'schedule', 'budget', 'gallery', 'updates', 'files'],
    features: ['checkIn', 'calendar', 'dependencies', 'vendors', 'groups'], taskView: 'board',
    teams: [['Marketing', '📣', 'coral'], ['Sponsorship', '🤝', 'mint'], ['Operations', '⚙️', 'lav'], ['Logistics', '🚚', 'butter'], ['Registration', '🎟️', 'sky'], ['Hospitality', '☕', 'mint'], ['Finance', '💷', 'butter'], ['Production', '🎬', 'lav']],
  },
};
export const suggestComplexity = (n) => (n > 150 ? 'large' : n > 30 ? 'organised' : 'simple');

export const ROLES = {
  owner: { label: 'Owner', tone: 'butter', blurb: 'Full event control.' },
  manager: { label: 'Manager', tone: 'lav', blurb: 'Runs day-to-day operations.' },
  lead: { label: 'Team lead', tone: 'sky', blurb: 'Manages their own team.' },
  member: { label: 'Team member', tone: 'mint', blurb: 'Works on assigned tasks.' },
  guest: { label: 'Guest', tone: 'coral', blurb: 'RSVPs and shares memories.' },
  vendor: { label: 'Vendor', tone: 'grey', blurb: 'Sees only what is assigned.' },
};
export const ROLE_ORDER = ['owner', 'manager', 'lead', 'member', 'guest', 'vendor'];

export const CAPS = [
  { id: 'viewGuests', label: 'See the guest list', group: 'People' },
  { id: 'manageGuests', label: 'Invite and manage guests', group: 'People' },
  { id: 'viewTeams', label: 'See teams', group: 'Teams & tasks' },
  { id: 'manageTeams', label: 'Create and manage every team', group: 'Teams & tasks' },
  { id: 'viewTasks', label: 'See all tasks', group: 'Teams & tasks' },
  { id: 'manageTasks', label: 'Create and edit any task', group: 'Teams & tasks' },
  { id: 'manageSchedule', label: 'Edit the schedule', group: 'Teams & tasks' },
  { id: 'viewBudget', label: 'See the budget', group: 'Confidential' },
  { id: 'manageBudget', label: 'Record and edit expenses', group: 'Confidential' },
  { id: 'viewInternal', label: 'Read internal discussions', group: 'Confidential' },
  { id: 'viewFiles', label: 'Open the document library', group: 'Confidential' },
  { id: 'viewConfidential', label: 'Open contracts and confidential files', group: 'Confidential' },
  { id: 'postAnnouncements', label: 'Post event-wide announcements', group: 'Sharing' },
  { id: 'viewOrganiserGallery', label: 'View the organiser gallery', group: 'Sharing' },
  { id: 'addOrganiserGallery', label: 'Add to the organiser gallery', group: 'Sharing' },
  { id: 'viewMemories', label: 'View event memories', group: 'Sharing' },
  { id: 'addMemories', label: 'Add to event memories', group: 'Sharing' },
];
const all = (v) => Object.fromEntries(CAPS.map((c) => [c.id, v]));
// Default permission matrix. Guests and vendors start with no access to anything confidential.
export function defaultPermissions(complexity) {
  const simple = complexity === 'simple';
  return {
    manager: all(true),
    lead: { ...all(true), manageGuests: false, manageTeams: false, manageTasks: false, manageSchedule: false, manageBudget: false, viewConfidential: false, postAnnouncements: simple },
    member: { ...all(false), viewGuests: simple, viewTeams: true, viewTasks: true, viewInternal: true, viewFiles: !simple, viewOrganiserGallery: true, addOrganiserGallery: true, viewMemories: true, addMemories: true },
    guest: { ...all(false), viewGuests: simple, viewMemories: true, addMemories: true },
    vendor: { ...all(false) },
  };
}

export const TASK_STATUS = [
  { id: 'todo', label: 'Not started', tone: 'grey' },
  { id: 'doing', label: 'In progress', tone: 'sky' },
  { id: 'blocked', label: 'Blocked', tone: 'coral' },
  { id: 'done', label: 'Completed', tone: 'mint' },
];
export const PRIORITY = [
  { id: 'low', label: 'Low', tone: 'grey' }, { id: 'medium', label: 'Medium', tone: 'butter' }, { id: 'high', label: 'High', tone: 'coral' },
];
export const RSVP = [
  { id: 'going', label: 'Going', tone: 'mint', emoji: '🎉' },
  { id: 'maybe', label: 'Maybe', tone: 'butter', emoji: '🤔' },
  { id: 'declined', label: "Can't go", tone: 'coral', emoji: '💌' },
  { id: 'pending', label: 'No reply', tone: 'grey', emoji: '⏳' },
];
export const TEAM_STATUS = [
  { id: 'ontrack', label: 'On track', tone: 'mint' }, { id: 'atrisk', label: 'At risk', tone: 'butter' },
  { id: 'behind', label: 'Behind', tone: 'coral' }, { id: 'done', label: 'Done', tone: 'sky' },
];
export const PRIVACY = [
  { id: 'private', label: 'Invite only', hint: 'Only people you invite can see it.' },
  { id: 'link', label: 'Anyone with the link', hint: 'Share a link; guests RSVP from it.' },
  { id: 'public', label: 'Public', hint: 'Listed and open to everyone.' },
];
export const FILE_FOLDERS = ['Contracts', 'Venue', 'Vendors', 'Marketing', 'Finance', 'Links', 'General'];
export const by = (list, id) => list.find((x) => x.id === id) || list[0];
