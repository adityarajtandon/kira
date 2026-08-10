import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Boxes, LayoutDashboard, LogOut, Plus, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo'; import Avatar from './Avatar';
export default function AppShell() {
  const { user,logout } = useAuth(); const navigate = useNavigate();
  const signOut = async () => { await logout(); navigate('/'); };
  return <div className="app-shell"><aside className="sidebar"><div className="sidebar-top"><Logo/><button className="icon-button" aria-label="Create workspace" onClick={()=>navigate('/app?new=workspace')}><Plus size={18}/></button></div><nav><NavLink to="/app" end><LayoutDashboard size={18}/>Overview</NavLink><NavLink to="/app"><Boxes size={18}/>Workspaces</NavLink></nav><div className="sidebar-footer"><button className="account"><Avatar name={user?.name}/><span><strong>{user?.name}</strong><small>{user?.email}</small></span></button><button className="icon-button" onClick={signOut} aria-label="Log out"><LogOut size={17}/></button></div></aside><main className="app-content"><Outlet/></main></div>;
}

