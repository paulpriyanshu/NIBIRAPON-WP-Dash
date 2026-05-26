'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, ShieldCheck, User, Eye, EyeOff, Loader2, UserCog } from 'lucide-react';

interface UserRow {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  phone: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
}

const ROLES = ['admin', 'manager', 'user', 'reviewer'] as const;
const ROLE_COLORS: Record<string, string> = {
  admin:    'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  manager:  'bg-blue-100   dark:bg-blue-900/30   text-blue-700   dark:text-blue-300',
  user:     'bg-gray-100   dark:bg-[#2a3942]      text-gray-600   dark:text-[#8696a0]',
  reviewer: 'bg-amber-100  dark:bg-amber-900/30   text-amber-700  dark:text-amber-300',
};

const BLANK = { name: '', email: '', username: '', phone: '', password: '', role: 'user' as string };

export default function UserManagement() {
  const [users, setUsers]       = useState<UserRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ ...BLANK });
  const [showPw, setShowPw]     = useState(false);
  const [saving, setSaving]     = useState(false);
  const [formErr, setFormErr]   = useState('');
  const [editId, setEditId]     = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<UserRow & { password: string }>>({});
  const [me, setMe]             = useState<{ role: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const [usersRes, meRes] = await Promise.all([
      fetch('/api/admin/users'),
      fetch('/api/auth/me'),
    ]);
    if (usersRes.ok) setUsers(await usersRes.json());
    if (meRes.ok) setMe(await meRes.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const isAdmin = me?.role === 'admin';

  const createUser = async () => {
    setFormErr('');
    if (!form.name.trim() || !form.password.trim()) { setFormErr('Name and password are required'); return; }
    if (!form.email.trim() && !form.username.trim() && !form.phone.trim()) {
      setFormErr('Provide at least one of email, username, or phone'); return;
    }
    setSaving(true);
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:     form.name.trim(),
        email:    form.email.trim()    || undefined,
        username: form.username.trim() || undefined,
        phone:    form.phone.trim()    || undefined,
        password: form.password,
        role:     form.role,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setFormErr(data.error || 'Failed to create user'); return; }
    setUsers((u) => [data, ...u]);
    setShowForm(false);
    setForm({ ...BLANK });
  };

  const saveEdit = async (id: string) => {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editDraft),
    });
    if (res.ok) { await load(); setEditId(null); }
  };

  const toggleActive = async (u: UserRow) => {
    await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    setUsers((prev) => prev.map((r) => r.id === u.id ? { ...r, isActive: !r.isActive } : r));
  };

  const deleteUser = async (id: string) => {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (res.ok) setUsers((u) => u.filter((r) => r.id !== id));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 size={22} className="animate-spin text-[#25D366]" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-60 gap-3 text-gray-400 dark:text-[#667781]">
        <ShieldCheck size={40} className="opacity-40" />
        <p className="text-sm">Only admins can manage users.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-[#2a3942] shrink-0">
        <div className="flex items-center gap-2">
          <UserCog size={20} className="text-[#25D366]" />
          <h1 className="text-base font-semibold text-[#111b21] dark:text-[#e9edef]">User Management</h1>
          <span className="text-xs bg-gray-100 dark:bg-[#2a3942] text-gray-500 dark:text-[#8696a0] px-2 py-0.5 rounded-full">{users.length}</span>
        </div>
        <button
          onClick={() => { setShowForm(true); setFormErr(''); setForm({ ...BLANK }); }}
          className="flex items-center gap-1.5 bg-[#25D366] hover:bg-[#22c55e] text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus size={14} /> New User
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="px-6 py-4 bg-gray-50 dark:bg-[#111b21] border-b border-gray-100 dark:border-[#2a3942] shrink-0">
          <p className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide mb-3">Create New User</p>
          <div className="grid grid-cols-2 gap-3">
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Full name *" className="col-span-2 input-field" />
            <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="Email" type="email" className="input-field" />
            <input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              placeholder="Username" className="input-field" />
            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="Phone (with country code)" className="input-field" />
            <div className="relative">
              <input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Password *" type={showPw ? 'text' : 'password'} className="input-field w-full pr-9" />
              <button type="button" onClick={() => setShowPw((p) => !p)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="input-field">
              {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
          </div>
          {formErr && <p className="text-xs text-red-500 mt-2">{formErr}</p>}
          <div className="flex gap-2 mt-3">
            <button onClick={createUser} disabled={saving}
              className="flex items-center gap-1.5 bg-[#25D366] hover:bg-[#22c55e] text-white text-sm px-3 py-1.5 rounded-lg disabled:opacity-60">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Create
            </button>
            <button onClick={() => setShowForm(false)}
              className="flex items-center gap-1 text-sm text-gray-500 dark:text-[#8696a0] px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#2a3942]">
              <X size={13} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Users list */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-[#2a3942] text-[10px] uppercase tracking-wide text-gray-400 dark:text-[#667781]">
              <th className="text-left px-6 py-3 font-semibold">User</th>
              <th className="text-left px-4 py-3 font-semibold">Credentials</th>
              <th className="text-left px-4 py-3 font-semibold">Role</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-right px-6 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isEditing = editId === u.id;
              return (
                <tr key={u.id} className="border-b border-gray-50 dark:border-[#2a3942] hover:bg-gray-50 dark:hover:bg-[#1f2c34] transition-colors">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#25D366]/10 flex items-center justify-center text-[#25D366] font-semibold text-xs shrink-0">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      {isEditing ? (
                        <input value={editDraft.name ?? u.name}
                          onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                          className="text-sm font-medium bg-transparent border-b border-[#25D366] outline-none text-[#111b21] dark:text-[#e9edef] w-32" />
                      ) : (
                        <div>
                          <p className="font-medium text-[#111b21] dark:text-[#e9edef]">{u.name}</p>
                          <p className="text-[10px] text-gray-400 dark:text-[#667781]">
                            {new Date(u.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                          </p>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5 text-[11px] text-gray-500 dark:text-[#8696a0] font-mono">
                      {u.email    && <p>✉ {u.email}</p>}
                      {u.username && <p>@ {u.username}</p>}
                      {u.phone    && <p>📱 {u.phone}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <select value={editDraft.role ?? u.role}
                        onChange={(e) => setEditDraft((d) => ({ ...d, role: e.target.value }))}
                        className="text-xs border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] rounded-lg px-2 py-1 outline-none">
                        {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                      </select>
                    ) : (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${ROLE_COLORS[u.role] || ROLE_COLORS.user}`}>
                        {u.role}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(u)}
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold cursor-pointer ${u.isActive ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`}>
                      {u.isActive ? 'Active' : 'Disabled'}
                    </button>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {isEditing ? (
                        <>
                          <button onClick={() => saveEdit(u.id)}
                            className="p-1.5 rounded-lg bg-[#25D366] text-white hover:bg-[#22c55e]">
                            <Check size={13} />
                          </button>
                          <button onClick={() => setEditId(null)}
                            className="p-1.5 rounded-lg bg-gray-100 dark:bg-[#2a3942] text-gray-500 hover:bg-gray-200 dark:hover:bg-[#3a4a52]">
                            <X size={13} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditId(u.id); setEditDraft({}); }}
                            className="p-1.5 rounded-lg bg-gray-100 dark:bg-[#2a3942] text-gray-500 dark:text-[#8696a0] hover:bg-gray-200 dark:hover:bg-[#3a4a52]">
                            <Edit2 size={13} />
                          </button>
                          <button onClick={() => deleteUser(u.id)}
                            className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40">
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-400 dark:text-[#667781]">
            <User size={32} className="opacity-40" />
            <p className="text-sm">No users yet. Create the first one.</p>
          </div>
        )}
      </div>

      <style jsx>{`
        .input-field {
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.8125rem;
          outline: none;
          background: white;
          color: #111b21;
          width: 100%;
        }
        :global(.dark) .input-field {
          border-color: #2a3942;
          background: #1f2c34;
          color: #e9edef;
        }
        .input-field:focus {
          border-color: #25D366;
        }
        select.input-field {
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
