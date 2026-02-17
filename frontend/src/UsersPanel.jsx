// src/UsersPanel.jsx
import { useEffect, useState } from 'react';

export default function UsersPanel() {
  const [roles, setRoles]   = useState([]);
  const [users, setUsers]   = useState([]);
  const [msg, setMsg]       = useState('');

  // ฟอร์มเพิ่มผู้ใช้
  const [employeeCode, setEmployeeCode] = useState('');
  const [name, setName]                 = useState('');
  const [password, setPassword]         = useState('');
  const [roleId, setRoleId]             = useState('');

  const token = localStorage.getItem('token') || '';

  async function loadRoles() {
    setMsg('Loading roles ...');
    try {
      const res = await fetch('/api/users/roles', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRoles(data);
      setMsg('');
    } catch (err) {
      setMsg('❌ ' + err.message);
    }
  }

  async function loadUsers() {
    setMsg('Loading users ...');
    try {
      const res = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setUsers(data);
      setMsg(`✅ Loaded ${data.length} users`);
    } catch (err) {
      setMsg('❌ ' + err.message);
    }
  }

  useEffect(() => {
    if (token) {
      loadRoles();
      loadUsers();
    }
  }, [token]);

  async function handleAddUser(e) {
    e.preventDefault();
    setMsg('Creating user ...');
    try {
      const body = {
        employee_code: employeeCode,
        name,
        password,
      };
      if (roleId) body.role_id = Number(roleId);

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      await loadUsers();
      setEmployeeCode(''); setName(''); setPassword(''); setRoleId('');
      setMsg('✅ User created');
    } catch (err) {
      setMsg('❌ ' + err.message);
    }
  }

  return (
    <section style={{ marginTop: 24 }}>
      <h2>Users</h2>
      {msg && <p style={{ color: msg.startsWith('✅') ? 'green' : msg.startsWith('❌') ? 'crimson' : '#555' }}>{msg}</p>}

      {/* Add User */}
      <form onSubmit={handleAddUser} style={{ display: 'grid', gap: 8, maxWidth: 420, marginBottom: 16 }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <label htmlFor="emp">Employee Code</label>
          <input id="emp" value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} required />
        </div>
        <div style={{ display: 'grid', gap: 4 }}>
          <label htmlFor="name">Name</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div style={{ display: 'grid', gap: 4 }}>
          <label htmlFor="pass">Password</label>
          <input id="pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div style={{ display: 'grid', gap: 4 }}>
          <label htmlFor="role">Role</label>
          <select id="role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">(none)</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <button type="submit">Add User</button>
        </div>
      </form>

      {/* Users table */}
      <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse', minWidth: 520 }}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Emp Code</th>
            <th>Name</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 ? (
            <tr><td colSpan="4" style={{ color: '#666' }}>(no data)</td></tr>
          ) : users.map(u => (
            <tr key={u.id}>
              <td>{u.id}</td>
              <td>{u.employee_code}</td>
              <td>{u.name}</td>
              <td>{u.role || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}