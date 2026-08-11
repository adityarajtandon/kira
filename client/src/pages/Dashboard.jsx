import { useEffect, useState } from 'react';
import { ArrowUpRight, Boxes, Plus, Users } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

export default function Dashboard() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [params, setParams] = useSearchParams();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const open = params.get('new') === 'workspace';

  const load = () => api('/workspaces')
    .then((response) => setItems(response.data))
    .catch((loadError) => setError(loadError.message))
    .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const close = () => setParams({});
  const create = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/workspaces', { method: 'POST', body: { name } });
      setName('');
      close();
      load();
    } catch (createError) {
      setError(createError.message);
    } finally {
      setBusy(false);
    }
  };
  const greeting = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening';

  return <div className="page">
    <header className="page-header">
      <div><span className="kicker">OVERVIEW</span><h1>Good {greeting}, {user?.name?.split(' ')[0]}.</h1><p>Here’s where your teams are making progress.</p></div>
      <button className="button primary" onClick={() => setParams({ new: 'workspace' })}><Plus size={17}/>New workspace</button>
    </header>
    {error && <div className="banner error">{error}</div>}
    {loading ? <Spinner label="Loading workspaces"/> : items.length ? <section className="workspace-grid">{items.map((item) => <Link to={`/app/workspaces/${item.id}`} className="workspace-card" key={item.id}>
      <div className="workspace-card-top"><span className="workspace-icon">{item.name.slice(0, 1).toUpperCase()}</span><ArrowUpRight size={18}/></div>
      <div><h2>{item.name}</h2><span className="role-pill">{item.role}</span></div>
      <footer><span><Boxes size={15}/>{item._count.projects} projects</span><span><Users size={15}/>{item._count.members} members</span></footer>
    </Link>)}</section> : <EmptyState title="Create your first workspace" description="Bring projects, people, and progress together in one focused place." action={<button className="button primary" onClick={() => setParams({ new: 'workspace' })}><Plus size={16}/>Create workspace</button>}/>}

    {open && <Modal title="Create a workspace" description="A shared home for your team's projects." onClose={close}><form className="modal-form" onSubmit={create}><label>Workspace name<input autoFocus required minLength="2" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Northstar Product"/></label><div className="modal-actions"><button type="button" className="button ghost" onClick={close}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Creating…' : 'Create workspace'}</button></div></form></Modal>}
  </div>;
}
