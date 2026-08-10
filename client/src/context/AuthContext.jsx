import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user,setUser] = useState(null); const [loading,setLoading] = useState(true);
  useEffect(() => { api('/auth/me').then((r)=>setUser(r.data)).catch(()=>setUser(null)).finally(()=>setLoading(false)); }, []);
  const login = async (values) => { const r = await api('/auth/login',{method:'POST',body:values}); setUser(r.data); return r.data; };
  const register = async (values) => { const r = await api('/auth/register',{method:'POST',body:values}); setUser(r.data); return r.data; };
  const logout = async () => { await api('/auth/logout',{method:'POST'}); setUser(null); };
  return <AuthContext.Provider value={{user,loading,login,register,logout}}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);

