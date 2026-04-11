import { useState } from 'react';
import {
  Plus, Trash2, Edit2, ChevronDown, ChevronRight,
  CheckSquare, Square, ListTodo, FolderKanban,
} from 'lucide-react';
import type { Project, Todo, Priority, ProjectStatus } from '../types';

interface VAHubProps {
  projects: Project[];
  todos: Todo[];
  onAddProject: (project: Project) => void;
  onUpdateProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
  onAddTodo: (todo: Todo) => void;
  onToggleTodo: (todo: Todo) => void;
  onDeleteTodo: (id: string) => void;
}

const STATUS_CONFIG: Record<ProjectStatus, { label: string; cls: string }> = {
  pending:     { label: 'Pending',     cls: 'bg-slate-100 text-slate-600' },
  in_progress: { label: 'In Progress', cls: 'bg-blue-100 text-blue-700' },
  approved:    { label: 'Approved',    cls: 'bg-teal-100 text-teal-700' },
  completed:   { label: 'Completed',   cls: 'bg-emerald-100 text-emerald-700' },
};

const PRIORITY_CONFIG: Record<Priority, { label: string; cls: string }> = {
  low:    { label: 'Low',    cls: 'bg-slate-50 text-slate-500 border border-slate-200' },
  medium: { label: 'Medium', cls: 'bg-amber-50 text-amber-600 border border-amber-200' },
  high:   { label: 'High',   cls: 'bg-red-50 text-red-600 border border-red-200' },
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
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-4">
      <h3 className="font-semibold text-slate-800">{initial?.title ? 'Edit Project' : 'New Project'}</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs font-medium text-slate-600 block mb-1">Title *</label>
          <input
            value={form.title}
            onChange={e => set('title', e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="Project title"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Status</label>
          <select
            value={form.status}
            onChange={e => set('status', e.target.value as ProjectStatus)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="approved">Approved</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Priority</label>
          <select
            value={form.priority}
            onChange={e => set('priority', e.target.value as Priority)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-slate-600 block mb-1">Assigned To</label>
          <input
            value={form.assignedTo}
            onChange={e => set('assignedTo', e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="VA name or team member"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-slate-600 block mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            rows={2}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="What needs to be done..."
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-slate-600 block mb-1">Notes / Progress Updates</label>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            rows={3}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="Progress notes, links, updates..."
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => { if (form.title.trim()) onSave(form); }}
          disabled={!form.title.trim()}
          className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Save Project
        </button>
        <button
          onClick={onCancel}
          className="border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function TodoRow({
  todo,
  onToggle,
  onDelete,
}: {
  todo: Todo;
  onToggle: (t: Todo) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors group">
      <button
        onClick={() => onToggle({ ...todo, completed: !todo.completed, updatedAt: new Date().toISOString() })}
        className="flex-shrink-0 text-slate-400 hover:text-teal-600 transition-colors"
      >
        {todo.completed
          ? <CheckSquare size={16} className="text-teal-600" />
          : <Square size={16} />
        }
      </button>
      <span className={`flex-1 text-sm ${todo.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
        {todo.text}
      </span>
      <button
        onClick={() => onDelete(todo.id)}
        className="text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        title="Delete task"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export default function VAHub({
  projects, todos,
  onAddProject, onUpdateProject, onDeleteProject,
  onAddTodo, onToggleTodo, onDeleteTodo,
}: VAHubProps) {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [newTodoText, setNewTodoText] = useState('');

  const filtered = filter === 'all'
    ? projects
    : projects.filter(p => p.status === filter);

  const incompleteTodos = todos.filter(t => !t.completed);
  const completedTodos = todos.filter(t => t.completed);

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

  function handleAddTodo() {
    if (!newTodoText.trim()) return;
    const now = new Date().toISOString();
    onAddTodo({
      id: `todo_${Date.now()}`,
      text: newTodoText.trim(),
      completed: false,
      priority: 'medium',
      createdAt: now,
      updatedAt: now,
    });
    setNewTodoText('');
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
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FolderKanban size={22} className="text-teal-600" /> VA Hub
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage projects and shared tasks for your virtual assistants.
          </p>
        </div>
        {!showForm && !editingProject && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex-shrink-0"
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
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {/* Status filter tabs */}
        <div className="flex items-center gap-1 px-4 pt-4 pb-3 border-b border-slate-100 overflow-x-auto">
          {filterTabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                filter === id
                  ? 'bg-teal-50 text-teal-700'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
            >
              {label}
              <span className="ml-1 opacity-50">({counts[id]})</span>
            </button>
          ))}
        </div>

        <div className="divide-y divide-slate-100">
          {filtered.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-10">
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
                      <h3 className="font-semibold text-slate-800">{project.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>
                        {s.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.cls}`}>
                        {p.label}
                      </span>
                    </div>

                    {project.description && (
                      <p className="text-sm text-slate-500 mt-1">{project.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 mt-1.5">
                      {project.assignedTo && (
                        <p className="text-xs text-slate-400">
                          Assigned to: <span className="font-medium text-slate-600">{project.assignedTo}</span>
                        </p>
                      )}
                      {projectTodoCount > 0 && (
                        <p className="text-xs text-slate-400">
                          {projectTodoDone}/{projectTodoCount} tasks done
                        </p>
                      )}
                    </div>

                    {project.notes && (
                      <div className="mt-2">
                        <button
                          onClick={() => toggleNotes(project.id)}
                          className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 transition-colors"
                        >
                          {notesExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          {notesExpanded ? 'Hide notes' : 'Show notes'}
                        </button>
                        {notesExpanded && (
                          <p className="mt-1.5 text-sm text-slate-600 bg-slate-50 px-3 py-2.5 rounded-lg whitespace-pre-wrap border border-slate-100">
                            {project.notes}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setEditingProject(project)}
                      className="text-slate-400 hover:text-teal-600 p-1.5 rounded-lg hover:bg-teal-50 transition-colors"
                      title="Edit project"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${project.title}"?`)) onDeleteProject(project.id);
                      }}
                      className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
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

      {/* Shared To-Do List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <ListTodo size={16} className="text-teal-600" /> Shared To-Do List
          </h2>
          <span className="text-xs text-slate-400">
            {incompleteTodos.length} remaining
          </span>
        </div>

        {/* Add new todo */}
        <div className="px-5 py-3 border-b border-slate-100">
          <div className="flex gap-2">
            <input
              value={newTodoText}
              onChange={e => setNewTodoText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddTodo(); }}
              placeholder="Add a new task... (press Enter)"
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              onClick={handleAddTodo}
              disabled={!newTodoText.trim()}
              className="bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white px-3 py-2 rounded-lg transition-colors"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {incompleteTodos.length === 0 && completedTodos.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">
              No tasks yet. Add one above.
            </p>
          )}

          {incompleteTodos.map(todo => (
            <TodoRow key={todo.id} todo={todo} onToggle={onToggleTodo} onDelete={onDeleteTodo} />
          ))}

          {completedTodos.length > 0 && (
            <>
              <div className="px-5 py-2 bg-slate-50">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                  Completed ({completedTodos.length})
                </p>
              </div>
              {completedTodos.map(todo => (
                <TodoRow key={todo.id} todo={todo} onToggle={onToggleTodo} onDelete={onDeleteTodo} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
