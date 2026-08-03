"use client";

import { useEffect, useState } from "react";
import { FolderKanban, LoaderCircle, Pencil, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PanelTransition } from "@/components/ui/panel-transition";

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
    setBusy(true);
    setError("");
    const response = await fetch("/api/projects", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
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
    <Card className="grid gap-sb-5 p-sb-5 md:p-sb-6" role="region" aria-labelledby="workspace-projects-title">
      <div className="flex items-start gap-sb-3 border-b border-sb-border-hairline pb-sb-4 text-sb-text-secondary"><FolderKanban size={19} /><div><h3 className="m-0 text-base font-[480] text-sb-text-primary" id="workspace-projects-title">Workspace projects</h3><p className="m-0 text-sm leading-relaxed">Create and rename workspaces for related validation runs.</p></div></div>
      {error && <Card className="border-sb-verdict-avoid p-sb-3 text-sm text-sb-verdict-avoid" role="alert">{error}</Card>}
      {loading ? (
        <p role="status" className="m-0 inline-flex items-center gap-sb-2 text-sm text-sb-text-secondary"><LoaderCircle className="animate-spin" size={16} /> Loading projects…</p>
      ) : (
        <div className="grid gap-sb-3">
          {projects.map(project => (
            <article className="flex flex-col gap-sb-3 border-b border-sb-border-hairline pb-sb-3 last:border-0 sm:flex-row sm:items-center sm:justify-between" key={project.id}>
              <div><b className="text-sm">{project.name}</b><p className="m-0 text-sm text-sb-text-secondary">{project.description || "No description"}</p></div>
              <Button type="button" variant="ghost" className="self-start" onClick={() => edit(project)}><Pencil size={14} /> Edit</Button>
            </article>
          ))}
          <Button type="button" variant="secondary" className="w-fit" onClick={create}><Plus size={14} /> Create project</Button>
        </div>
      )}
      <PanelTransition isOpen={Boolean(creating || editing)}>
        <Card className="grid gap-sb-4 bg-sb-bg-surface-2 p-sb-4" role="dialog" aria-modal="true" aria-labelledby="project-editor-title">
          <div className="flex items-center justify-between gap-sb-3"><h4 className="m-0 text-base font-[480]" id="project-editor-title">{editing ? "Edit project" : "Create project"}</h4><Button type="button" variant="ghost" className="min-h-8 px-sb-2" aria-label="Close project editor" onClick={close}><X size={16} /></Button></div>
          <label className="grid gap-sb-2 text-sm font-medium"><span>Project name</span><Input value={name} onChange={event => setName(event.target.value)} maxLength={120} autoFocus /></label>
          <label className="grid gap-sb-2 text-sm font-medium"><span>Description</span><textarea className="min-h-24 w-full resize-y rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-1 px-sb-3 py-sb-2 text-sm text-sb-text-primary focus:border-sb-border-focus focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus" value={description} onChange={event => setDescription(event.target.value)} maxLength={500} /></label>
          <Button type="button" className="w-fit" onClick={save} disabled={busy}>{busy ? <LoaderCircle className="animate-spin" size={14} /> : <Save size={14} />}{busy ? "Saving…" : editing ? "Save project" : "Create project"}</Button>
        </Card>
      </PanelTransition>
    </Card>
  );
}
