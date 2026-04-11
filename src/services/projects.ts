import { supabase } from './supabase';
import type { Project, Todo } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToProject(r: any): Project {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? '',
    status: r.status,
    priority: r.priority,
    assignedTo: r.assigned_to ?? '',
    notes: r.notes ?? '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToTodo(r: any): Todo {
  return {
    id: r.id,
    text: r.text,
    completed: r.completed,
    projectId: r.project_id ?? undefined,
    priority: r.priority,
    dueDate: r.due_date ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToProject);
}

export async function upsertProject(project: Project): Promise<void> {
  const { error } = await supabase.from('projects').upsert({
    id: project.id,
    title: project.title,
    description: project.description,
    status: project.status,
    priority: project.priority,
    assigned_to: project.assignedTo,
    notes: project.notes,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  });
  if (error) throw error;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchTodos(): Promise<Todo[]> {
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToTodo);
}

export async function upsertTodo(todo: Todo): Promise<void> {
  const { error } = await supabase.from('todos').upsert({
    id: todo.id,
    text: todo.text,
    completed: todo.completed,
    project_id: todo.projectId ?? null,
    priority: todo.priority,
    due_date: todo.dueDate ?? null,
    created_at: todo.createdAt,
    updated_at: todo.updatedAt,
  });
  if (error) throw error;
}

export async function deleteTodo(id: string): Promise<void> {
  const { error } = await supabase.from('todos').delete().eq('id', id);
  if (error) throw error;
}
