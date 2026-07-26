"use client";

import { useEffect, useState } from "react";
import { FolderKanban, LoaderCircle, Pencil, Plus, Save, X } from "lucide-react";

type Project = { id: string; name: string; description: string | null };

export function ProjectSettings() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    fetch("/api/projects", { cache: "no-store" }).then(async response => {
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Projects could not be loaded.");
      setProjects(body.projects);
    }).catch(reason => setError(reason instanceof Error ? reason.message : "Projects could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  const close = () => { setCreating(false); setEditing(null); setError(""); };
  const create = () => { setEditing(null); setCreating(true); setName(""); setDescription(""); setError(""); };
  const edit = (project: Project) => { setCreating(false); setEditing(project); setName(project.name); setDescription(project.description || ""); setError(""); };
  const save = async () => {
    if (!name.trim()) return setError("Enter a project name.");
    setBusy(true); setError("");
    const response = await fetch("/api/projects", {
      method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(editing ? { id: editing.id } : {}), name, description: description || null }),
    });
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) return setError(body?.error || "Project changes could not be saved.");
    if (editing) setProjects(items => items.map(item => item.id === editing.id ? body.project : item));
    else setProjects(items => [...items, body.project]);
    close();
  };

  return (
    <section className="settings-section" aria-labelledby="workspace-projects-title">
      <div className="settings-section-header"><FolderKanban size={19} /><div><h3 id="workspace-projects-title">Workspace projects</h3><p>Create and rename workspaces for related validation runs.</p></div></div>
      {error && <div className="auth-error" role="alert">{error}</div>}
      {loading ? <p role="status" className="project-settings-loading"><LoaderCircle className="animate-spin" size={16} /> Loading projects…</p> : (
        <div className="project-settings-list">
          {projects.map(project => <article key={project.id}><div><b>{project.name}</b><p>{project.description || "No description"}</p></div><button type="button" className="button ghost button-small" onClick={() => edit(project)}><Pencil size={14} /> Edit</button></article>)}
          <button type="button" className="button ghost button-small" onClick={create}><Plus size={14} /> Create project</button>
        </div>
      )}
      {(creating || editing) && <div className="project-settings-editor" role="dialog" aria-modal="true" aria-labelledby="project-editor-title">
        <div className="settings-section-header"><div><h4 id="project-editor-title">{editing ? "Edit project" : "Create project"}</h4></div><button type="button" className="icon-button" aria-label="Close project editor" onClick={close}><X size={16} /></button></div>
        <label className="settings-field"><span>Project name</span><input value={name} onChange={event => setName(event.target.value)} maxLength={120} autoFocus /></label>
        <label className="settings-field"><span>Description</span><textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={500} /></label>
        <button type="button" className="button button-small" onClick={save} disabled={busy}>{busy ? <LoaderCircle className="animate-spin" size={14} /> : <Save size={14} />}{busy ? "Saving…" : editing ? "Save project" : "Create project"}</button>
      </div>}
    </section>
  );
}
