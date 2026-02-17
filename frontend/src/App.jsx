import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import { 
  LayoutDashboard, FileText, FolderOpen, Plus, FileCheck, 
  LogOut, CheckCircle, ExternalLink, X, Trash2, Edit3, AlertCircle 
} from 'lucide-react';

const API_URL = 'http://localhost:3000/api';

function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('dashboard'); // dashboard, documents, masterlist
  const [docs, setDocs] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReviseOpen, setIsReviseOpen] = useState(false);
  
  // Data States
  const [formData, setFormData] = useState({ doc_no: '', title: '', level: 'Work Instruction', reviewed_by: '', approved_by: '' });
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [file, setFile] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem('nsk_user');
    if (saved) setUser(JSON.parse(saved));
    fetchDocs();
  }, []);

  const fetchDocs = () => {
    axios.get(`${API_URL}/documents`)
      .then(res => setDocs(res.data))
      .catch(err => console.error("Fetch Error:", err));
  };

  const handleApprove = async (doc) => {
    let nextStatus = doc.status === 'WAITING REVIEW' ? 'WAITING APPROVE' : 'RELEASED';
    if(!window.confirm(`ยืนยันการอนุมัติไปสถานะ: ${nextStatus}?`)) return;
    try {
      await axios.patch(`${API_URL}/documents/${doc.id}/status`, { status: nextStatus });
      fetchDocs();
    } catch (err) { alert("Approve Failed"); }
  };

  const getFileUrl = (path) => {
    if(!path) return '#';
    const fileName = path.split(/[/\\]/).pop();
    return `http://localhost:3000/uploads/${fileName}`;
  };

  // Logic การกรองข้อมูลแบ่งหมวดหมู่
  const filteredDocs = docs.filter(d => {
    const matchCategory = selectedCategory === 'All' || d.level === selectedCategory;
    const matchView = view === 'masterlist' ? d.status === 'RELEASED' : true;
    return matchCategory && matchView;
  });

  const categories = ['All', 'Manual', 'Procedure', 'Work Instruction', 'Form'];

  // --- Render Login ---
  if (!user) return <Login onLogin={setUser} />;

  // --- Render App Layout ---
  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-box"><FileText size={30} color="white"/></div>
          <span>NSK IATF</span>
        </div>
        <nav className="sidebar-nav">
          <button className={`nav-link ${view==='dashboard'?'active':''}`} onClick={()=>setView('dashboard')}><LayoutDashboard/> Dashboard</button>
          <button className={`nav-link ${view==='documents'?'active':''}`} onClick={()=>setView('documents')}><FolderOpen/> Control Table</button>
          <button className={`nav-link ${view==='masterlist'?'active':''}`} onClick={()=>setView('masterlist')}><FileCheck/> Master List</button>
        </nav>
        <div className="sidebar-footer">
          <div className="u-info">
            <p className="u-name">{user.name}</p>
            <p className="u-role">{user.role}</p>
          </div>
          <LogOut className="logout-icon" onClick={()=>{localStorage.clear(); window.location.reload();}} />
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="content-header">
          <div>
            <h2>{view === 'masterlist' ? 'Approved Master List' : 'Document Explorer'}</h2>
            <p>NSK IATF 16949 Document Control System</p>
          </div>
          <button className="btn-primary" onClick={()=>setIsModalOpen(true)}><Plus/> Register New</button>
        </header>

        {/* Category Tabs (ระบบแบ่งหมวดหมู่) */}
        <div className="category-bar">
          {categories.map(cat => (
            <button 
              key={cat} 
              className={`cat-tab ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Doc No.</th>
                <th>Title</th>
                <th>Category</th>
                <th>Status</th>
                <th>Rev.</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.map(doc => (
                <tr key={doc.id}>
                  <td className="doc-no">{doc.doc_no}</td>
                  <td className="doc-title">{doc.title}</td>
                  <td><span className="badge-level">{doc.level}</span></td>
                  <td><span className={`status-tag ${doc.status.replace(' ', '-')}`}>{doc.status}</span></td>
                  <td className="rev-no">R{doc.revision}</td>
                  <td>
                    <div className="action-group">
                      <a href={getFileUrl(doc.file_path_pdf)} target="_blank" rel="noreferrer" className="pdf-btn"><ExternalLink size={20}/></a>
                      {doc.status === 'RELEASED' && <Edit3 className="btn-revise" onClick={()=>{setSelectedDoc(doc); setIsReviseOpen(true);}} title="Request Revision" />}
                      {doc.status !== 'RELEASED' && <CheckCircle className="btn-approve" onClick={()=>handleApprove(doc)} title="Approve" />}
                      <Trash2 className="btn-delete" onClick={() => { if(window.confirm("ลบเอกสารนี้?")) axios.delete(`${API_URL}/documents/${doc.id}`).then(fetchDocs) }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredDocs.length === 0 && <div className="empty-msg">No documents found.</div>}
        </div>
      </main>

      {/* --- Modal: Register New Document --- */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header"><h3>ขอขึ้นทะเบียนเอกสารใหม่</h3><X onClick={()=>setIsModalOpen(false)} cursor="pointer"/></div>
            <form onSubmit={async (e)=>{
              e.preventDefault();
              const d = new FormData();
              Object.keys(formData).forEach(key => d.append(key, formData[key]));
              d.append('pdfFile', file);
              d.append('prepared_by', user.name);
              await axios.post(`${API_URL}/documents`, d);
              setIsModalOpen(false); fetchDocs();
            }} className="modal-form">
              <input placeholder="Doc No. (เช่น WI-QA-001)" onChange={e=>setFormData({...formData, doc_no:e.target.value})} required />
              <input placeholder="Document Title (ชื่อเอกสาร)" onChange={e=>setFormData({...formData, title:e.target.value})} required />
              <select onChange={e=>setFormData({...formData, level:e.target.value})}>
                <option>Work Instruction</option><option>Procedure</option><option>Manual</option><option>Form</option>
              </select>
              <div className="form-row">
                <input placeholder="Reviewer" onChange={e=>setFormData({...formData, reviewed_by:e.target.value})} required />
                <input placeholder="Approver" onChange={e=>setFormData({...formData, approved_by:e.target.value})} required />
              </div>
              <label>เลือกไฟล์ PDF *</label>
              <input type="file" accept=".pdf" onChange={e=>setFile(e.target.files[0])} required />
              <button type="submit" className="btn-submit">Submit for Review</button>
            </form>
          </div>
        </div>
      )}

      {/* --- Modal: Revision Request --- */}
      {isReviseOpen && selectedDoc && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header"><h3>ขอแก้ไขเอกสาร: {selectedDoc.doc_no}</h3><X onClick={()=>setIsReviseOpen(false)} cursor="pointer"/></div>
            <p className="rev-alert">กำลังอัปเดตจาก R{selectedDoc.revision} → <b>R{selectedDoc.revision + 1}</b></p>
            <form onSubmit={async (e)=>{
              e.preventDefault();
              const d = new FormData();
              d.append('doc_id', selectedDoc.id);
              d.append('title', e.target.title.value);
              d.append('level', selectedDoc.level);
              d.append('current_rev', selectedDoc.revision);
              d.append('pdfFile', file);
              await axios.post(`${API_URL}/documents/revise`, d);
              setIsReviseOpen(false); fetchDocs();
            }} className="modal-form">
              <input name="title" defaultValue={selectedDoc.title} placeholder="ชื่อเอกสารใหม่" required />
              <label>อัปโหลด PDF ฉบับแก้ไข *</label>
              <input type="file" accept=".pdf" onChange={e=>setFile(e.target.files[0])} required />
              <button type="submit" className="btn-submit revise">Submit Revised Version</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Login Component ---
function Login({ onLogin }) {
  const [error, setError] = useState('');
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_URL}/auth/login`, { employee_code: e.target.code.value, password: e.target.pass.value });
      localStorage.setItem('nsk_user', JSON.stringify(res.data.user));
      onLogin(res.data.user);
    } catch { setError('Invalid Employee Code or Password'); }
  };
  return (
    <div className="login-page">
      <form className="login-box" onSubmit={handleLogin}>
        <div className="login-logo"><FileText size={45} color="white"/></div>
        <h1>NSK IATF LOGIN</h1>
        {error && <div className="err-msg"><AlertCircle size={18}/> {error}</div>}
        <input name="code" placeholder="Employee Code" required />
        <input name="pass" type="password" placeholder="Password" required />
        <button type="submit">Sign In</button>
      </form>
    </div>
  );
}

export default App;