import { useEffect, useState } from 'react';
import { ArrowRight, FolderKanban, Plus, Settings } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import { api } from '../lib/api';

export default function Workspace() {
  const { workspaceId } = useParams();
  const [workspace, setWorkspace] = useState(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', key: '', description: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api(`/workspaces/${workspaceId}`).then((response) => setWorkspace(response.data)).catch((loadError) => setError(loadError.message));
  useEffect(() => {
    load();
  }, [workspaceId]);

  const openCreate = () => {
    setError('');
    setModal(true);
  };
  const create = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api(`/workspaces/${workspaceId}/projects`, { method: 'POST', body: form });
      setModal(false);
      setForm({ name: '', key: '', description: '' });
      load();
    } catch (createError) {
      setError(createError.message);
    } finally {
      setBusy(false);
    }
  };

  if (!workspace && !error) return <Spinner label="Opening workspace"/>;

  return <div className="page">
    <header className="page-header workspace-heading">
      <div><span className="kicker">WORKSPACE · {workspace?.role}</span><h1>{workspace?.name}</h1><p>{workspace ? `${workspace._count.members} people building across ${workspace.projects.length} projects.` : ''}</p></div>
      <div className="header-actions"><Link className="button ghost" to={`/app/workspaces/${workspaceId}/settings`}><Settings size={16}/>Settings</Link>{['OWNER', 'ADMIN'].includes(workspace?.role) && <button className="button primary" onClick={openCreate}><Plus size={16}/>New project</button>}</div>
    </header>
    {error && !modal && <div className="banner error">{error}</div>}
    <section className="section-heading"><div><h2>Projects</h2><p>Active work in this workspace</p></div></section>
    {workspace?.projects.length ? <div className="project-list">{workspace.projects.map((project, index) => <Link to={`/app/projects/${project.id}`} key={project.id} className="project-row"><span className={`project-symbol symbol-${index % 5}`}><FolderKanban size={19}/></span><div><h3>{project.name}</h3><p>{project.description || 'No description yet'}</p></div><span className="project-key">{project.key}</span><span>{project._count.tasks} issues</span><ArrowRight size={18}/></Link>)}</div> : <EmptyState title="No projects yet" description="Projects organize a focused stream of work and its custom workflow." action={['OWNER', 'ADMIN'].includes(workspace?.role) ? <button className="button primary" onClick={openCreate}><Plus size={16}/>Create a project</button> : null}/>}

    {modal && <Modal title="Create project" description="Default workflow stages are added automatically." onClose={() => setModal(false)}><form className="modal-form" onSubmit={create}>
      {error && <div className="form-error">{error}</div>}
      <label>Project name<input autoFocus required minLength="2" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Mobile app"/></label>
      <label>Project key<input required minLength="2" maxLength="8" pattern="[A-Za-z][A-Za-z0-9]{1,7}" title="Use 2–8 letters or numbers and start with a letter." value={form.key} onChange={(event) => setForm({ ...form, key: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} placeholder="MOB"/><span className="field-hint">2–8 letters or numbers; start with a letter.</span></label>
      <label>Description<textarea rows="3" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What is this project responsible for?"/></label>
      <div className="modal-actions"><button type="button" className="button ghost" onClick={() => setModal(false)}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Creating…' : 'Create project'}</button></div>
    </form></Modal>}
  </div>;
}
