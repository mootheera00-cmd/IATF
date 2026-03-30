// frontend/src/pages/Admin.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Users, RefreshCw, Save, Pencil, Trash2 } from 'lucide-react';
import { adminAPI } from '../api';

const ROLE_OPTIONS = [
  { label: 'Engineer', value: 'ENGINEER' },
  { label: 'Leader', value: 'LEADER' },
  { label: 'Assistant Manager', value: 'ASSISTANT_MANAGER' },
  { label: 'Manager', value: 'MANAGER' },
  { label: 'Admin', value: 'ADMIN' },
  { label: 'Document Controller', value: 'DOCUMENT_CONTROL' },
  { label: 'President', value: 'PRESIDENT' },
];

export default function Admin() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<number | string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingUserId, setEditingUserId] = useState<number | string | null>(null);

  const [form, setForm] = useState({
    employee: '',
    email: '',
    masterId: '',
    password: '',
    role: 'ENGINEER',
  });

  const normalizeRoleValue = (rawRole: string) => {
    const normalized = String(rawRole || '').trim().toUpperCase().replace(/\s+/g, '_');
    if (normalized === 'DOCUMENT_CONTROLLER') return 'DOCUMENT_CONTROL';
    const allowed = new Set(ROLE_OPTIONS.map((item) => item.value));
    return allowed.has(normalized) ? normalized : 'ENGINEER';
  };

  const pageTitle = useMemo(() => (editingUserId ? 'Modify User' : 'Configure User'), [editingUserId]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await adminAPI.listUsers();
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const resetForm = () => {
    setEditingUserId(null);
    setForm({
      employee: '',
      email: '',
      masterId: '',
      password: '',
      role: 'ENGINEER',
    });
  };

  const onEdit = (user: any) => {
    setEditingUserId(user.id);
    setForm({
      employee: user.name || '',
      email: user.email || '',
      masterId: user.employee_code || '',
      password: '',
      role: normalizeRoleValue(user.role),
    });
    setError('');
    setSuccess('');
  };

  const onChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onDelete = async (user: any) => {
    const confirmed = window.confirm(`Delete user "${user.name || user.employee_code || 'Unknown'}"?`);
    if (!confirmed) return;

    try {
      setDeletingUserId(user.id);
      setError('');
      setSuccess('');
      await adminAPI.deleteUser(user.id);
      setSuccess('User deleted successfully');

      if (editingUserId === user.id) {
        resetForm();
      }

      await loadUsers();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete user');
    } finally {
      setDeletingUserId(null);
    }
  };

  const fieldClass = 'w-full h-10 px-3 border border-slate-300 rounded-lg';

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const payload: Record<string, unknown> = {
        name: form.employee.trim(),
        email: form.email.trim(),
        employee_code: form.masterId.trim(),
        role: form.role,
      };

      if (!editingUserId || form.password.trim()) {
        payload.password = form.password;
      }

      if (editingUserId) {
        await adminAPI.updateUser(editingUserId, payload);
        setSuccess('User updated successfully');
      } else {
        if (!form.password.trim()) {
          setError('Password is required when creating a user');
          setSaving(false);
          return;
        }
        await adminAPI.createUser(payload);
        setSuccess('User created successfully');
      }

      await loadUsers();
      resetForm();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Users size={20} className="text-indigo-500" /> Administration</h1>
          <p className="text-slate-600 mt-1">User Management</p>
        </div>
        <button
          onClick={loadUsers}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-100"
        >
          <RefreshCw size={18} />
          Refresh Users
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm font-medium">
          {error}
        </div>
      )}
      {success && (
        <div className="px-4 py-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-medium">
          {success}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
          <Users size={18} className="text-indigo-600" />
          <h2 className="text-lg font-bold text-slate-900">User List</h2>
        </div>

        <div className="table-wrap">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left font-semibold text-slate-700">Employee</th>
                <th className="px-6 py-3 text-left font-semibold text-slate-700">Email</th>
                <th className="px-6 py-3 text-left font-semibold text-slate-700">Master ID</th>
                <th className="px-6 py-3 text-left font-semibold text-slate-700">Role</th>
                <th className="px-6 py-3 text-right font-semibold text-slate-700">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">Loading users...</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">No users found.</td>
                </tr>
              ) : users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-slate-900">{user.name || '-'}</td>
                  <td className="px-6 py-4 text-slate-700">{user.email || '-'}</td>
                  <td className="px-6 py-4 font-mono text-slate-700">{user.employee_code || '-'}</td>
                  <td className="px-6 py-4 text-slate-700">{user.role || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={() => onEdit(user)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100"
                      >
                        <Pencil size={14} />
                        Edit
                      </button>
                      <button
                        onClick={() => onDelete(user)}
                        disabled={deletingUserId === user.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 border border-red-300 rounded-lg text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        <Trash2 size={14} />
                        {deletingUserId === user.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">{pageTitle}</h2>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Employee</label>
              <input
                type="text"
                value={form.employee}
                onChange={(e) => onChange('employee', e.target.value)}
                className={fieldClass}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => onChange('email', e.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Master ID</label>
              <input
                type="text"
                value={form.masterId}
                onChange={(e) => onChange('masterId', e.target.value)}
                className={fieldClass}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Role</label>
              <select
                value={form.role}
                onChange={(e) => onChange('role', e.target.value)}
                className={fieldClass}
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => onChange('password', e.target.value)}
              placeholder={editingUserId ? 'Leave blank to keep current password' : ''}
              className={fieldClass}
              required={!editingUserId}
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-60"
            >
              <Save size={16} />
              {saving ? 'Saving...' : (editingUserId ? 'Update User' : 'Create User')}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-5 py-2.5 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-100"
            >
              Clear
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
