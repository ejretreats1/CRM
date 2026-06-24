import { useState, useEffect, useRef } from 'react';
import { cacheGet, cacheSet } from '../services/appCache';
import {
  Plus, Trash2, Edit2, ChevronDown, ChevronRight,
  CheckSquare, Square, ListTodo, FolderKanban, Hash, Bell, Clock, ClipboardList,
} from 'lucide-react';
import type { View } from '../types';
import type { Project, Todo, Priority, ProjectStatus, TodoAssignee } from '../types';

interface SlackChannel { id: string; name: string; }
interface SlackMessage { ts: string; text: string; username: string; attachmentText: string; channelName: string; }

interface VAHubProps {
  projects: Project[];
  todos: Todo[];
  slackToken: string;
  slackChannels: SlackChannel[];
  onAddProject: (project: Project) => void;
  onUpdateProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
  onAddTodo: (todo: Todo) => void;
  onToggleTodo: (todo: Todo) => void;
  onDeleteTodo: (id: string) => void;
  onNavigate?: (view: View, extra?: string) => void;
}

const STATUS_CONFIG: Record<ProjectStatus, { label: string; cls: string }> = {
  pending:     { label: 'Pending',     cls: 'bg-[#1e2d45] text-[#b8d4f0]' },
  in_progress: { label: 'In Progress', cls: 'bg-[#162035] text-[#6ab0f5]' },
  approved:    { label: 'Approved',    cls: 'bg-[#162035] text-[#4a90d9]' },
  completed:   { label: 'Completed',   cls: 'bg-[#0a2518] text-[#4ab57a]' },
};

const PRIORITY_CONFIG: Record<Priority, { label: string; cls: string }> = {
  low:    { label: 'Low',    cls: 'bg-[#1e2d45] text-[#b8d4f0] border border-[#1e2d45]' },
  medium: { label: 'Medium', cls: 'bg-[#2a1a0a] text-[#d0954a] border border-[#5a3010]' },
  high:   { label: 'High',   cls: 'bg-[#2a0e0e] text-[#e05c5c] border border-[#5a1a1a]' },
};

type StatusFilter = 'all' | ProjectStatus;

interface ProjectFormData {
  title: string;
  description: string;
  status: ProjectStatus;
  priority: Priority;
  assignedTo: string;
  notes: string;
}

function ProjectForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<ProjectFormData>;
  onSave: (data: ProjectFormData) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ProjectFormData>({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    status: initial?.status ?? 'pending',
    priority: initial?.priority ?? 'medium',
    assignedTo: initial?.assignedTo ?? '',
    notes: initial?.notes ?? '',
  });

  const set = <K extends keyof ProjectFormData>(k: K, v: ProjectFormData[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="bg-[#1e2d45] rounded-xl border border-[#1e2d45] p-5 space-y-4">
      <h3 className="font-semibold text-white">{initial?.title ? 'Edit Project' : 'New Project'}</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs font-medium text-[#b8d4f0] block mb-1">Title *</label>
          <input
            value={form.title}
            onChange={e => set('title', e.target.value)}
            className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm bg-[#1a2335] focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
            placeholder="Project title"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[#b8d4f0] block mb-1">Status</label>
          <select
            value={form.status}
            onChange={e => set('status', e.target.value as ProjectStatus)}
            className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm bg-[#1a2335] focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
          >
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="approved">Approved</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-[#b8d4f0] block mb-1">Priority</label>
          <select
            value={form.priority}
            onChange={e => set('priority', e.target.value as Priority)}
            className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm bg-[#1a2335] focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-[#b8d4f0] block mb-1">Assigned To</label>
          <input
            value={form.assignedTo}
            onChange={e => set('assignedTo', e.target.value)}
            className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm bg-[#1a2335] focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
            placeholder="VA name or team member"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-[#b8d4f0] block mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            rows={2}
            className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm bg-[#1a2335] resize-none focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
            placeholder="What needs to be done..."
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-[#b8d4f0] block mb-1">Notes / Progress Updates</label>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            rows={3}
            className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm bg-[#1a2335] resize-none focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
            placeholder="Progress notes, links, updates..."
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => { if (form.title.trim()) onSave(form); }}
          disabled={!form.title.trim()}
          className="bg-[#4a90d9] hover:bg-[#3a80c9] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Save Project
        </button>
        <button
          onClick={onCancel}
          className="border border-[#1e2d45] bg-[#1a2335] text-[#b8d4f0] hover:bg-[#1e2d45] text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const ASSIGNEE_CONFIG: Record<TodoAssignee, { label: string; color: string; header: string; ring: string; dot: string }> = {
  ethan: { label: 'Ethan', color: 'bg-[#162035] border-[#1e3a5a]',   header: 'bg-blue-600',   ring: 'ring-blue-400',   dot: 'bg-blue-500' },
  jess:  { label: 'Jess',  color: 'bg-[#2a1a35] border-purple-200', header: 'bg-purple-600', ring: 'ring-purple-400', dot: 'bg-purple-500' },
  va:    { label: 'VA',    color: 'bg-[#162035] border-[#1e3a5a]',   header: 'bg-[#4a90d9]',   ring: 'ring-[#4a90d9]',   dot: 'bg-teal-500' },
};

function TodoCard({
  todo, onToggle, onDelete, onDragStart, onNavigate,
}: {
  todo: Todo;
  onToggle: (t: Todo) => void;
  onDelete: (id: string) => void;
  onDragStart: (id: string) => void;
  onNavigate?: (view: View, extra?: string) => void;
}) {
  // Cycle: todo → in-progress → completed → todo
  function cycleStatus() {
    const now = new Date().toISOString();
    if (!todo.inProgress && !todo.completed) {
      onToggle({ ...todo, inProgress: true,  completed: false, updatedAt: now });
    } else if (todo.inProgress) {
      onToggle({ ...todo, inProgress: false, completed: true,  updatedAt: now });
    } else {
      onToggle({ ...todo, inProgress: false, completed: false, updatedAt: now });
    }
  }

  const isInProgress = todo.inProgress && !todo.completed;
  const isOnboarding = !!(todo.linkedOwnerId && todo.linkedPropertyId);
  const borderCls = todo.completed ? 'border-[#1e2d45]' : isInProgress ? 'border-[#5a3010] bg-[#2a1a0a]' : 'border-[#1e2d45] bg-[#1a2335]';

  return (
    <div
      draggable
      onDragStart={() => onDragStart(todo.id)}
      className={`flex items-start gap-2 p-2.5 rounded-lg border shadow-sm hover:shadow cursor-grab active:cursor-grabbing group ${borderCls}`}
    >
      <button
        onClick={cycleStatus}
        className="flex-shrink-0 transition-colors mt-0.5"
        title={todo.completed ? 'Mark todo' : isInProgress ? 'Mark complete' : 'Mark in progress'}
      >
        {todo.completed
          ? <CheckSquare size={15} className="text-[#4a90d9]" />
          : isInProgress
            ? <Clock size={15} className="text-[#d0954a]" />
            : <Square size={15} className="text-[#3a5070] hover:text-[#d0954a]" />}
      </button>
      <div className="flex-1 min-w-0">
        <span className={`text-sm leading-snug ${todo.completed ? 'line-through text-[#3a5070]' : 'text-[#b8d4f0]'}`}>
          {todo.text}
        </span>
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          {isInProgress && (
            <span className="text-xs font-medium text-[#d0954a] bg-[#2a1a0a] px-1.5 py-0.5 rounded-full">In Progress</span>
          )}
          {isOnboarding && onNavigate && !todo.completed && (
            <button
              onClick={e => { e.stopPropagation(); onNavigate('property-portal', `${todo.linkedOwnerId}::${todo.linkedPropertyId}`); }}
              className="flex items-center gap-1 text-xs font-medium text-[#4a90d9] bg-[#162035] border border-[#1e3a5a] px-1.5 py-0.5 rounded-full hover:bg-[#162035] transition-colors"
            >
              <ClipboardList size={10} /> View Checklist
            </button>
          )}
        </div>
      </div>
      <button
        onClick={() => onDelete(todo.id)}
        className="text-[#3a5070] hover:text-[#e05c5c] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function CompletedTodos({ todos, onToggle, onDelete, onDragStart, onNavigate }: {
  todos: Todo[];
  onToggle: (t: Todo) => void;
  onDelete: (id: string) => void;
  onDragStart: (id: string) => void;
  onNavigate?: (view: View, extra?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (todos.length === 0) return null;
  return (
    <div className="px-2 pb-2 mt-1 border-t border-[#1e2d45] pt-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs text-[#3a5070] hover:text-[#b8d4f0] font-medium transition-colors"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {todos.length} completed
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5">
          {todos.map(t => (
            <TodoCard key={t.id} todo={t} onToggle={onToggle} onDelete={onDelete} onDragStart={onDragStart} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

function TodoColumn({
  assignee, todos, onToggle, onDelete, onDragStart, onDrop, onAddInColumn, onNavigate,
}: {
  assignee: TodoAssignee;
  todos: Todo[];
  onToggle: (t: Todo) => void;
  onDelete: (id: string) => void;
  onDragStart: (id: string) => void;
  onDrop: (assignee: TodoAssignee) => void;
  onAddInColumn: (assignee: TodoAssignee, text: string) => void;
  onNavigate?: (view: View, extra?: string) => void;
}) {
  const cfg = ASSIGNEE_CONFIG[assignee];
  const [over, setOver] = useState(false);
  const [addText, setAddText] = useState('');
  const completed   = todos.filter(t => t.completed);
  const inProgress  = todos.filter(t => t.inProgress && !t.completed);
  const todo        = todos.filter(t => !t.completed && !t.inProgress);

  function submit() {
    if (!addText.trim()) return;
    onAddInColumn(assignee, addText.trim());
    setAddText('');
  }

  return (
    <div
      className={`flex flex-col rounded-xl border-2 transition-all ${cfg.color} ${over ? cfg.ring + ' ring-2' : ''}`}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={() => { setOver(false); onDrop(assignee); }}
    >
      {/* Column header */}
      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-t-[10px] ${cfg.header}`}>
        <span className="font-semibold text-white text-sm">{cfg.label}</span>
        {inProgress.length > 0 && (
          <span className="text-xs bg-amber-400 text-white px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1">
            <Clock size={10} /> {inProgress.length}
          </span>
        )}
        <span className="ml-auto text-xs bg-[#1a2335]/20 text-white px-1.5 py-0.5 rounded-full font-medium">{todo.length + inProgress.length}</span>
      </div>

      {/* In-progress tasks */}
      {inProgress.length > 0 && (
        <div className="px-2 pt-2 space-y-1.5">
          {inProgress.map(t => (
            <TodoCard key={t.id} todo={t} onToggle={onToggle} onDelete={onDelete} onDragStart={onDragStart} onNavigate={onNavigate} />
          ))}
        </div>
      )}

      {/* Todo tasks */}
      <div className="flex-1 p-2 space-y-1.5 min-h-[80px]">
        {todo.map(t => (
          <TodoCard key={t.id} todo={t} onToggle={onToggle} onDelete={onDelete} onDragStart={onDragStart} />
        ))}
      </div>

      {/* Per-person completed section */}
      <CompletedTodos todos={completed} onToggle={onToggle} onDelete={onDelete} onDragStart={onDragStart} onNavigate={onNavigate} />

      {/* Inline add */}
      <div className="px-2 pb-2 flex gap-1">
        <input
          value={addText}
          onChange={e => setAddText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          placeholder="Add task…"
          className="flex-1 text-xs border border-[#1e2d45] rounded-lg px-2 py-1.5 bg-[#1a2335] focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
        />
        <button
          onClick={submit}
          disabled={!addText.trim()}
          className="bg-[#1a2335] border border-[#1e2d45] text-[#b8d4f0] hover:text-[#4a90d9] hover:border-[#4a90d9] disabled:opacity-40 px-2 rounded-lg transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

function timeAgoShort(ts: string): string {
  const diff = Date.now() - parseFloat(ts) * 1000;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function VAHub({
  projects, todos, slackToken, slackChannels,
  onAddProject, onUpdateProject, onDeleteProject,
  onAddTodo, onToggleTodo, onDeleteTodo, onNavigate,
}: VAHubProps) {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [vaNotifyEmail, setVaNotifyEmail] = useState('');
  const [showVaEmailEdit, setShowVaEmailEdit] = useState(false);
  const [vaEmailInput, setVaEmailInput] = useState('');
  const draggedId = useRef<string | null>(null);

  const [slackMessages, setSlackMessages] = useState<SlackMessage[]>([]);
  const [slackLoading, setSlackLoading] = useState(false);
  const [slackError, setSlackError] = useState('');
  const [slackExpanded, setSlackExpanded] = useState(false);

  useEffect(() => {
    cacheGet<string>('ej_va_notify_email').then(v => { if (v) setVaNotifyEmail(v); });
  }, []);

  function saveVaEmail() {
    cacheSet('ej_va_notify_email', vaEmailInput.trim());
    setVaNotifyEmail(vaEmailInput.trim());
    setShowVaEmailEdit(false);
  }

  async function notifyVA(taskText: string) {
    const email = vaNotifyEmail;
    if (!email) return;
    try {
      await fetch('/api/send-newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'report',
          to: email,
          toName: 'VA',
          reportSubject: 'New task assigned to you — E&J Retreats',
          reportHtml: `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:32px;color:#334155"><p style="font-size:16px">Hey! You have a new task assigned:</p><div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:16px 20px;font-size:15px;font-weight:600;color:#0f766e;margin:16px 0">${taskText}</div><p style="font-size:13px;color:#94a3b8">— E&J Retreats Team</p></body></html>`,
        }),
      });
    } catch { /* non-blocking */ }
  }

  function handleAddInColumn(assignee: TodoAssignee, text: string) {
    const now = new Date().toISOString();
    const todo: Todo = {
      id: `todo_${Date.now()}`,
      text,
      completed: false,
      assignedTo: assignee,
      priority: 'medium',
      createdAt: now,
      updatedAt: now,
    };
    onAddTodo(todo);
    if (assignee === 'va') notifyVA(text);
  }

  function handleDropOnColumn(assignee: TodoAssignee) {
    if (!draggedId.current) return;
    const todo = todos.find(t => t.id === draggedId.current);
    if (!todo || todo.assignedTo === assignee) { draggedId.current = null; return; }
    onToggleTodo({ ...todo, assignedTo: assignee, updatedAt: new Date().toISOString() });
    if (assignee === 'va' && todo.assignedTo !== 'va') notifyVA(todo.text);
    draggedId.current = null;
  }

  useEffect(() => {
    if (!slackToken || slackChannels.length === 0) { setSlackMessages([]); return; }
    async function load() {
      try {
        const results = await Promise.all(
          slackChannels.map(async (ch) => {
            const r = await fetch(`/api/slack-feed?channelId=${encodeURIComponent(ch.id)}`, {
              headers: { 'x-slack-token': slackToken },
            });
            const d = await r.json();
            if (d.error) throw new Error(d.error);
            return (d.messages ?? []).map((m: Omit<SlackMessage, 'channelName'>) => ({ ...m, channelName: ch.name || ch.id }));
          })
        );
        setSlackMessages((results.flat() as SlackMessage[]).sort((a, b) => parseFloat(b.ts) - parseFloat(a.ts)));
        setSlackError('');
      } catch (err) {
        setSlackError(err instanceof Error ? err.message : 'Could not reach Slack.');
      } finally {
        setSlackLoading(false);
      }
    }
    setSlackLoading(true);
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slackToken, JSON.stringify(slackChannels)]);

  const filtered = filter === 'all'
    ? projects
    : projects.filter(p => p.status === filter);

  const todosByAssignee = (assignee: TodoAssignee) => todos.filter(t => t.assignedTo === assignee);

  function handleSaveNew(data: ProjectFormData) {
    const now = new Date().toISOString();
    onAddProject({ id: `proj_${Date.now()}`, ...data, createdAt: now, updatedAt: now });
    setShowForm(false);
  }

  function handleSaveEdit(data: ProjectFormData) {
    if (!editingProject) return;
    onUpdateProject({ ...editingProject, ...data, updatedAt: new Date().toISOString() });
    setEditingProject(null);
  }

  function toggleNotes(id: string) {
    setExpandedNotes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const counts = {
    all: projects.length,
    pending: projects.filter(p => p.status === 'pending').length,
    in_progress: projects.filter(p => p.status === 'in_progress').length,
    approved: projects.filter(p => p.status === 'approved').length,
    completed: projects.filter(p => p.status === 'completed').length,
  };

  const filterTabs: { id: StatusFilter; label: string }[] = [
    { id: 'all',         label: 'All' },
    { id: 'pending',     label: 'Pending' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'approved',    label: 'Approved' },
    { id: 'completed',   label: 'Completed' },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FolderKanban size={22} className="text-[#4a90d9]" /> VA Hub
          </h1>
          <p className="text-sm text-[#b8d4f0] mt-0.5">
            Manage projects and shared tasks for your virtual assistants.
          </p>
        </div>
        {!showForm && !editingProject && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 bg-[#4a90d9] hover:bg-[#3a80c9] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex-shrink-0"
          >
            <Plus size={15} /> New Project
          </button>
        )}
      </div>

      {/* New project form */}
      {showForm && (
        <ProjectForm onSave={handleSaveNew} onCancel={() => setShowForm(false)} />
      )}

      {/* Projects */}
      <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] shadow-sm">
        {/* Status filter tabs */}
        <div className="flex items-center gap-1 px-4 pt-4 pb-3 border-b border-[#1e2d45] overflow-x-auto">
          {filterTabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                filter === id
                  ? 'bg-[#162035] text-[#4a90d9]'
                  : 'text-[#b8d4f0] hover:bg-[#1e2d45] hover:text-[#b8d4f0]'
              }`}
            >
              {label}
              <span className="ml-1 opacity-50">({counts[id]})</span>
            </button>
          ))}
        </div>

        <div className="divide-y divide-[#1e2d45]">
          {filtered.length === 0 && (
            <p className="text-sm text-[#3a5070] text-center py-10">
              {filter === 'all'
                ? 'No projects yet. Add your first project above.'
                : `No ${filter.replace('_', ' ')} projects.`}
            </p>
          )}

          {filtered.map(project => {
            const s = STATUS_CONFIG[project.status];
            const p = PRIORITY_CONFIG[project.priority];
            const notesExpanded = expandedNotes.has(project.id);
            const projectTodoCount = todos.filter(t => t.projectId === project.id).length;
            const projectTodoDone = todos.filter(t => t.projectId === project.id && t.completed).length;

            if (editingProject?.id === project.id) {
              return (
                <div key={project.id} className="p-4">
                  <ProjectForm
                    initial={editingProject}
                    onSave={handleSaveEdit}
                    onCancel={() => setEditingProject(null)}
                  />
                </div>
              );
            }

            return (
              <div key={project.id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-white">{project.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>
                        {s.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.cls}`}>
                        {p.label}
                      </span>
                    </div>

                    {project.description && (
                      <p className="text-sm text-[#b8d4f0] mt-1">{project.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 mt-1.5">
                      {project.assignedTo && (
                        <p className="text-xs text-[#3a5070]">
                          Assigned to: <span className="font-medium text-[#b8d4f0]">{project.assignedTo}</span>
                        </p>
                      )}
                      {projectTodoCount > 0 && (
                        <p className="text-xs text-[#3a5070]">
                          {projectTodoDone}/{projectTodoCount} tasks done
                        </p>
                      )}
                    </div>

                    {project.notes && (
                      <div className="mt-2">
                        <button
                          onClick={() => toggleNotes(project.id)}
                          className="flex items-center gap-1 text-xs text-[#4a90d9] hover:text-[#4a90d9] transition-colors"
                        >
                          {notesExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          {notesExpanded ? 'Hide notes' : 'Show notes'}
                        </button>
                        {notesExpanded && (
                          <p className="mt-1.5 text-sm text-[#b8d4f0] bg-[#1e2d45] px-3 py-2.5 rounded-lg whitespace-pre-wrap border border-[#1e2d45]">
                            {project.notes}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setEditingProject(project)}
                      className="text-[#3a5070] hover:text-[#4a90d9] p-1.5 rounded-lg hover:bg-[#162035] transition-colors"
                      title="Edit project"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${project.title}"?`)) onDeleteProject(project.id);
                      }}
                      className="text-[#3a5070] hover:text-[#e05c5c] p-1.5 rounded-lg hover:bg-[#2a0e0e] transition-colors"
                      title="Delete project"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Team To-Do Boards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <ListTodo size={16} className="text-[#4a90d9]" /> Team To-Do
          </h2>
          <button
            onClick={() => { setShowVaEmailEdit(v => !v); setVaEmailInput(vaNotifyEmail); }}
            className="flex items-center gap-1.5 text-xs text-[#b8d4f0] hover:text-[#4a90d9] border border-[#1e2d45] hover:border-[#4a90d9] px-2.5 py-1.5 rounded-lg transition-colors"
          >
            <Bell size={12} />
            {vaNotifyEmail ? 'VA notify: ' + vaNotifyEmail : 'Set VA email alerts'}
          </button>
        </div>

        {showVaEmailEdit && (
          <div className="mb-3 flex gap-2 bg-[#162035] border border-[#1e3a5a] rounded-xl px-4 py-3">
            <input
              value={vaEmailInput}
              onChange={e => setVaEmailInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveVaEmail(); }}
              placeholder="VA email for task notifications"
              className="flex-1 text-sm border border-[#1e3a5a] rounded-lg px-3 py-1.5 bg-[#1a2335] focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
            />
            <button onClick={saveVaEmail} className="bg-[#4a90d9] hover:bg-[#3a80c9] text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">Save</button>
            <button onClick={() => setShowVaEmailEdit(false)} className="text-[#b8d4f0] hover:text-[#b8d4f0] text-sm px-2">✕</button>
          </div>
        )}

        {/* 3-column board */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(['ethan', 'jess', 'va'] as TodoAssignee[]).map(assignee => (
            <TodoColumn
              key={assignee}
              assignee={assignee}
              todos={todosByAssignee(assignee)}
              onToggle={onToggleTodo}
              onDelete={onDeleteTodo}
              onDragStart={id => { draggedId.current = id; }}
              onDrop={handleDropOnColumn}
              onAddInColumn={handleAddInColumn}
              onNavigate={onNavigate}
            />
          ))}
        </div>


      </div>

      {/* Slack Feed */}
      {(slackToken && slackChannels.length > 0) && (
        <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] shadow-sm">
          <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-[#1e2d45] flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Hash size={16} className="text-[#d07af5] flex-shrink-0" />
              <h2 className="font-semibold text-white">Slack Notifications</h2>
              {slackChannels.map(ch => (
                <span key={ch.id} className="text-xs bg-[#2a1a35] text-[#d07af5] px-1.5 py-0.5 rounded-full font-medium">
                  #{ch.name || ch.id}
                </span>
              ))}
            </div>
            <span className="text-xs text-[#3a5070] flex items-center gap-1.5 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              Live · 60s
            </span>
          </div>

          {slackError ? (
            <div className="px-5 py-4 text-sm text-[#e05c5c]">{slackError}</div>
          ) : slackLoading && slackMessages.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-[#3a5070]">Loading messages...</div>
          ) : slackMessages.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-[#3a5070]">No recent messages.</div>
          ) : (
            <div className="divide-y divide-[#1e2d45]">
              {(slackExpanded ? slackMessages : slackMessages.slice(0, 5)).map(msg => {
                const body = msg.text || msg.attachmentText;
                if (!body) return null;
                return (
                  <div key={`${msg.channelName}-${msg.ts}`} className="flex items-start gap-3 px-5 py-3.5">
                    <div className="w-7 h-7 rounded-lg bg-[#2a1a35] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-[#d07af5]">{msg.username.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-[#b8d4f0]">{msg.username}</span>
                        {slackChannels.length > 1 && (
                          <span className="text-xs bg-[#2a1a35] text-[#d07af5] px-1.5 py-0.5 rounded-full">#{msg.channelName}</span>
                        )}
                        <span className="text-xs text-[#3a5070]">{timeAgoShort(msg.ts)}</span>
                      </div>
                      <p className="text-sm text-[#b8d4f0] mt-0.5 whitespace-pre-wrap break-words">{body}</p>
                      {msg.text && msg.attachmentText && msg.text !== msg.attachmentText && (
                        <p className="text-xs text-[#3a5070] mt-1 italic truncate">{msg.attachmentText}</p>
                      )}
                    </div>
                  </div>
                );
              })}
              {slackMessages.length > 5 && (
                <button
                  onClick={() => setSlackExpanded(v => !v)}
                  className="w-full py-3 text-xs font-medium text-[#d07af5] hover:text-purple-700 hover:bg-[#2a1a35] transition-colors"
                >
                  {slackExpanded ? 'Show less' : `Show ${slackMessages.length - 5} more messages`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
