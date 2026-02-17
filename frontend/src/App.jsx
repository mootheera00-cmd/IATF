import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import { 
  LayoutDashboard, FileText, FolderOpen, Plus, FileCheck, 
  LogOut, CheckCircle, ExternalLink, X, Trash2, Edit3, AlertCircle,
  GitPullRequest, Upload, Download, XCircle, RotateCcw
} from 'lucide-react';

const API_URL = 'http://localhost:3000/api';

function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('dashboard'); // dashboard, documents, masterlist, change-requests
  const [docs, setDocs] = useState([]);
  const [changeRequests, setChangeRequests] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReviseOpen, setIsReviseOpen] = useState(false);
  const [isCRModalOpen, setIsCRModalOpen] = useState(false);
  const [isCRDecisionOpen, setIsCRDecisionOpen] = useState(false);
  const [isCRUploadOpen, setIsCRUploadOpen] = useState(false);
  
  // Data States
  const [formData, setFormData] = useState({ doc_no: '', title: '', level: 'Work Instruction', reviewed_by: '', approved_by: '' });
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [selectedCR, setSelectedCR] = useState(null);
  const [file, setFile] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem('nsk_user');
    if (saved) setUser(JSON.parse(saved));
    fetchDocs();
    fetchChangeRequests();
  }, []);

  const fetchDocs = () => {
    axios.get(`${API_URL}/documents`)
      .then(res => setDocs(res.data))
      .catch(err => console.error("Fetch Error:", err));
  };

  const fetchChangeRequests = () => {
    axios.get(`${API_URL}/change-requests`)
      .then(res => setChangeRequests(res.data))
      .catch(err => console.error("Fetch CR Error:", err));
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
          <button className={`nav-link ${view==='change-requests'?'active':''}`} onClick={()=>setView('change-requests')}><GitPullRequest/> Change Requests</button>
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
            <h2>
              {view === 'masterlist' ? 'Approved Master List' : 
               view === 'change-requests' ? 'Change Requests' : 
               'Document Explorer'}
            </h2>
            <p>NSK IATF 16949 Document Control System</p>
          </div>
          {view === 'change-requests' ? (
            <button className="btn-primary" onClick={()=>setIsCRModalOpen(true)}><Plus/> New Change Request</button>
          ) : (
            <button className="btn-primary" onClick={()=>setIsModalOpen(true)}><Plus/> Register New</button>
          )}
        </header>

        {/* Render Change Requests View */}
        {view === 'change-requests' ? (
          <ChangeRequestsView 
            user={user}
            changeRequests={changeRequests}
            onRefresh={fetchChangeRequests}
            onOpenDecision={(cr) => { setSelectedCR(cr); setIsCRDecisionOpen(true); }}
            onOpenUpload={(cr) => { setSelectedCR(cr); setIsCRUploadOpen(true); }}
          />
        ) : (
          <>
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
          </>
        )}
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

      {/* --- Modal: Create Change Request --- */}
      {isCRModalOpen && (
        <CreateCRModal 
          docs={docs}
          user={user}
          onClose={() => setIsCRModalOpen(false)}
          onRefresh={fetchChangeRequests}
        />
      )}

      {/* --- Modal: Manager Decision --- */}
      {isCRDecisionOpen && selectedCR && (
        <CRDecisionModal 
          cr={selectedCR}
          user={user}
          onClose={() => { setIsCRDecisionOpen(false); setSelectedCR(null); }}
          onRefresh={fetchChangeRequests}
        />
      )}

      {/* --- Modal: Upload Files --- */}
      {isCRUploadOpen && selectedCR && (
        <CRUploadModal 
          cr={selectedCR}
          user={user}
          onClose={() => { setIsCRUploadOpen(false); setSelectedCR(null); }}
          onRefresh={fetchChangeRequests}
        />
      )}
    </div>
  );
}

// --- Change Requests View Component ---
function ChangeRequestsView({ user, changeRequests, onRefresh, onOpenDecision, onOpenUpload }) {
  const getStatusBadge = (status) => {
    const statusMap = {
      'Draft': 'badge-draft',
      'Submitted': 'badge-submitted',
      'Pre-Approved': 'badge-preapproved',
      'Pending Approval': 'badge-pending',
      'Approved': 'badge-approved',
      'Rejected': 'badge-rejected',
      'Returned for Revision': 'badge-returned'
    };
    return statusMap[status] || 'badge-default';
  };

  const canManageRequest = (cr) => {
    return (user.role === 'MANAGER' || user.role === 'QMR') && cr.manager_id === user.id;
  };

  const canUploadFiles = (cr) => {
    return cr.requester_id === user.id && (cr.status === 'Pre-Approved' || cr.status === 'Returned for Revision');
  };

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>CR #</th>
            <th>Document</th>
            <th>Requester</th>
            <th>Manager</th>
            <th>Status</th>
            <th>Submitted</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {changeRequests.map(cr => (
            <tr key={cr.id}>
              <td className="cr-id">#{cr.id}</td>
              <td className="doc-title">{cr.doc_number} - {cr.document_title}</td>
              <td>{cr.requester_name}</td>
              <td>{cr.manager_name || '-'}</td>
              <td><span className={`status-badge ${getStatusBadge(cr.status)}`}>{cr.status}</span></td>
              <td>{cr.submitted_at ? new Date(cr.submitted_at).toLocaleDateString() : '-'}</td>
              <td>
                <div className="action-group">
                  {cr.status === 'Submitted' && canManageRequest(cr) && (
                    <CheckCircle 
                      className="btn-approve" 
                      onClick={() => onOpenDecision(cr)}
                      title="Review Request"
                    />
                  )}
                  {cr.status === 'Pending Approval' && canManageRequest(cr) && (
                    <CheckCircle 
                      className="btn-approve" 
                      onClick={() => onOpenDecision(cr)}
                      title="Final Review"
                    />
                  )}
                  {canUploadFiles(cr) && (
                    <Upload 
                      className="btn-upload" 
                      onClick={() => onOpenUpload(cr)}
                      title="Upload Files"
                    />
                  )}
                  {cr.status === 'Pre-Approved' && cr.downloadLink && cr.requester_id === user.id && (
                    <Download 
                      className="btn-download" 
                      onClick={() => window.open(`${API_URL}${cr.downloadLink}`, '_blank')}
                      title="Download Source File"
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {changeRequests.length === 0 && <div className="empty-msg">No change requests found.</div>}
    </div>
  );
}

// --- Create CR Modal Component ---
function CreateCRModal({ docs, user, onClose, onRefresh }) {
  const [selectedDocId, setSelectedDocId] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Create and submit in one go
      const createRes = await axios.post(`${API_URL}/change-requests`, {
        document_id: selectedDocId,
        reason: reason
      });
      const crId = createRes.data.cr_id;
      
      // Submit it
      await axios.post(`${API_URL}/change-requests/${crId}/submit`);
      
      alert('Change request submitted successfully!');
      onRefresh();
      onClose();
    } catch (err) {
      alert('Error creating change request: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>Create Change Request</h3>
          <X onClick={onClose} cursor="pointer"/>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <label>Select Document *</label>
          <select 
            value={selectedDocId} 
            onChange={e => setSelectedDocId(e.target.value)}
            required
          >
            <option value="">-- Select a document --</option>
            {docs.map(doc => (
              <option key={doc.id} value={doc.id}>
                {doc.doc_no} - {doc.title}
              </option>
            ))}
          </select>
          
          <label>Reason for Change *</label>
          <textarea 
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Describe the reason for requesting this change..."
            rows="4"
            required
          />
          
          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>
      </div>
    </div>
  );
}

// --- CR Decision Modal Component ---
function CRDecisionModal({ cr, user, onClose, onRefresh }) {
  const [decision, setDecision] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const isInitialDecision = cr.status === 'Submitted';
  const isFinalReview = cr.status === 'Pending Approval';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!decision) {
      alert('Please select a decision');
      return;
    }
    
    setLoading(true);
    try {
      const endpoint = isInitialDecision ? 'decision' : 'review';
      await axios.post(`${API_URL}/change-requests/${cr.id}/${endpoint}`, {
        decision: decision,
        comment: comment
      });
      
      alert(`Change request ${decision.toLowerCase()} successfully!`);
      onRefresh();
      onClose();
    } catch (err) {
      alert('Error processing decision: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>{isInitialDecision ? 'Initial Review' : 'Final Review'} - CR #{cr.id}</h3>
          <X onClick={onClose} cursor="pointer"/>
        </div>
        <div className="cr-info">
          <p><strong>Document:</strong> {cr.doc_number} - {cr.document_title}</p>
          <p><strong>Requester:</strong> {cr.requester_name}</p>
          <p><strong>Reason:</strong> {cr.reason}</p>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <label>Decision *</label>
          <div className="decision-buttons">
            {isInitialDecision ? (
              <>
                <button 
                  type="button"
                  className={`btn-decision ${decision === 'Approve' ? 'selected approve' : ''}`}
                  onClick={() => setDecision('Approve')}
                >
                  <CheckCircle size={20}/> Approve
                </button>
                <button 
                  type="button"
                  className={`btn-decision ${decision === 'Reject' ? 'selected reject' : ''}`}
                  onClick={() => setDecision('Reject')}
                >
                  <XCircle size={20}/> Reject
                </button>
              </>
            ) : (
              <>
                <button 
                  type="button"
                  className={`btn-decision ${decision === 'Approve' ? 'selected approve' : ''}`}
                  onClick={() => setDecision('Approve')}
                >
                  <CheckCircle size={20}/> Final Approve
                </button>
                <button 
                  type="button"
                  className={`btn-decision ${decision === 'Return' ? 'selected return' : ''}`}
                  onClick={() => setDecision('Return')}
                >
                  <RotateCcw size={20}/> Return for Revision
                </button>
              </>
            )}
          </div>
          
          <label>Comment (Optional)</label>
          <textarea 
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Add comments for this decision..."
            rows="3"
          />
          
          <button type="submit" className="btn-submit" disabled={loading || !decision}>
            {loading ? 'Processing...' : 'Submit Decision'}
          </button>
        </form>
      </div>
    </div>
  );
}

// --- CR Upload Modal Component ---
function CRUploadModal({ cr, user, onClose, onRefresh }) {
  const [sourceFile, setSourceFile] = useState(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!sourceFile || !pdfFile) {
      alert('Both source file and PDF file are required');
      return;
    }
    
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('source', sourceFile);
      formData.append('pdf', pdfFile);
      
      await axios.post(`${API_URL}/change-requests/${cr.id}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      alert('Files uploaded successfully! Pending final approval.');
      onRefresh();
      onClose();
    } catch (err) {
      alert('Error uploading files: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>Upload Revised Documents - CR #{cr.id}</h3>
          <X onClick={onClose} cursor="pointer"/>
        </div>
        <div className="cr-info">
          <p><strong>Document:</strong> {cr.doc_number} - {cr.document_title}</p>
          <p className="info-alert">Please upload both the edited source file (Word/Excel) and a PDF version.</p>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <label>Source File (Word/Excel) *</label>
          <input 
            type="file" 
            accept=".doc,.docx,.xls,.xlsx"
            onChange={e => setSourceFile(e.target.files[0])}
            required
          />
          {sourceFile && <p className="file-info">Selected: {sourceFile.name}</p>}
          
          <label>PDF File *</label>
          <input 
            type="file" 
            accept=".pdf"
            onChange={e => setPdfFile(e.target.files[0])}
            required
          />
          {pdfFile && <p className="file-info">Selected: {pdfFile.name}</p>}
          
          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? 'Uploading...' : 'Upload Files'}
          </button>
        </form>
      </div>
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