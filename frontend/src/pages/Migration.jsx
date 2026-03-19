import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Upload, FileText, Lock, ShieldCheck, AlertTriangle, CheckCircle, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Migration() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  useEffect(() => {
    // Strict Access Control
    if (user && user.role !== 'ADMIN') {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  if (!user || user.role !== 'ADMIN') return null; // Prevent flicker

  const [formData, setFormData] = useState({
    doc_no: '',
    title: '',
    level: 'Work Instruction',
    revision: '00'
  });
  const [files, setFiles] = useState({
    pdf: null,
    source: null
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Refs for file inputs
  const pdfInputRef = useRef(null);
  const sourceInputRef = useRef(null);

  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    if (type === 'pdf') {
       if (file.type !== 'application/pdf') {
         setError('Only PDF files are allowed for the Controlled Copy.');
         return;
       }
    } else if (type === 'source') {
       const validTypes = [
         'application/msword', 
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
       ];
       if (!validTypes.includes(file.type)) {
         setError('Only Word (.doc, .docx) or Excel (.xls, .xlsx) files are allowed for the Master Source.');
         return;
       }
    }
    
    setFiles(prev => ({ ...prev, [type]: file }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    // Double check
    if (!files.pdf || !files.source) {
      setError('Both files are mandatory.');
      setLoading(false);
      return;
    }

    try {
      const data = new FormData();
      data.append('doc_no', formData.doc_no);
      data.append('title', formData.title);
      data.append('level', formData.level);
      data.append('revision', formData.revision);
      data.append('pdf_file', files.pdf);
      data.append('source_file', files.source);

      // Get token from storage (assuming standard auth setup)
      const token = localStorage.getItem('token') || JSON.parse(localStorage.getItem('nsk_user'))?.token;
      
      // Adjust URL based on your API structure (e.g. /api/admin/migrate based on server.js)
      // Wait, server.js said: app.use('/api/admin', migrationRoutes);
      // So path is /api/admin/migrate
      await axios.post('http://localhost:4550/api/admin/migrate', data, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}` 
        }
      });

      setSuccess('Migration Complete: Document has been registered as Active/Released.');
      // Reset form
      setFormData({ doc_no: '', title: '', level: 'Work Instruction', revision: '00' });
      setFiles({ pdf: null, source: null });
      if(pdfInputRef.current) pdfInputRef.current.value = "";
      if(sourceInputRef.current) sourceInputRef.current.value = "";

    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Migration Failed. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = formData.doc_no && formData.title && files.pdf && files.source;

  return (
    <div className="min-h-screen bg-slate-50 p-8 flex justify-center">
      <div className="w-full max-w-5xl">
        
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-800 flex items-center gap-3">
              <ShieldCheck className="w-10 h-10 text-emerald-600" />
              Legacy Migration Module
            </h1>
            <p className="text-slate-500 mt-2">
              Migrate existing documents to IATF 2026 System. <br/>
              <span className="text-amber-600 font-bold text-xs uppercase tracking-wider">
                Authorized Personnel Only • Audit Trail Active
              </span>
            </p>
          </div>

          <div className="flex gap-4">
            <button 
              onClick={handleSubmit}
              disabled={loading}
              className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 shadow-md flex items-center gap-2"
            >
              <Upload size={18} />
              {loading ? 'Processing...' : 'Upload Document'}
            </button>
            <button onClick={() => navigate('/')} className="px-4 py-2 text-slate-500 hover:bg-slate-200 rounded-lg border border-slate-300">
              Cancel
            </button>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
          <div className="p-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
          
          <div className="p-8">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 flex items-center gap-3 rounded-r">
                <AlertTriangle /> {error}
              </div>
            )}
             {success && (
              <div className="mb-6 p-4 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-700 flex items-center gap-3 rounded-r">
                <CheckCircle /> {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Left Col: Metadata */}
              <div className="lg:col-span-1 space-y-6">
                <h3 className="font-bold text-slate-700 uppercase text-sm tracking-wider border-b pb-2">Document Metadata</h3>
                
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">Document No.</label>
                  <input 
                    type="text" 
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-sm"
                    placeholder="e.g. WI-QA-005"
                    value={formData.doc_no}
                    onChange={e => setFormData({...formData, doc_no: e.target.value})}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">Document Title</label>
                  <input 
                    type="text" 
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="e.g. Final Inspection Standard"
                    value={formData.title}
                    onChange={e => setFormData({...formData, title: e.target.value})}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div>
                    <label className="block text-sm font-semibold text-slate-600 mb-1">Category</label>
                    <select 
                      className="w-full p-3 border border-slate-300 rounded-lg outline-none bg-white"
                      value={formData.level}
                      onChange={e => setFormData({...formData, level: e.target.value})}
                    >
                      <option>Quality Manual</option>
                      <option>Procedure</option>
                      <option>Work Instruction</option>
                      <option>Support Document</option>
                      <option>Outside Document</option>
                      <option>Operation Standard</option>
                      <option>Form</option>
                      <option>Report</option>
                    </select>
                   </div>
                   <div>
                    <label className="block text-sm font-semibold text-slate-600 mb-1">Cur. Rev.</label>
                    <input 
                      type="text" 
                      className="w-full p-3 border border-slate-300 rounded-lg outline-none font-mono text-center"
                      value={formData.revision}
                      onChange={e => setFormData({...formData, revision: e.target.value})}
                      placeholder="00"
                    />
                   </div>
                </div>
              </div>

              {/* Right Col: Dual Upload */}
              <div className="lg:col-span-2 space-y-6">
                <h3 className="font-bold text-slate-700 uppercase text-sm tracking-wider border-b pb-2">Secure File Storage</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Slot A: Public PDF */}
                  <div className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center transition-all ${files.pdf ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 hover:border-emerald-400 hover:bg-slate-50'}`}>
                    <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-3">
                      <FileText />
                    </div>
                    <p className="font-bold text-slate-700 mb-1">Distribution Copy</p>
                    <p className="text-xs text-slate-400 mb-4 text-center">PDF Only • Accessible to Users</p>
                    
                    {files.pdf ? (
                      <div className="bg-white px-3 py-2 rounded border border-emerald-200 flex items-center gap-2 text-sm text-emerald-700 shadow-sm">
                        <CheckCircle size={16} />
                        <span className="truncate max-w-[150px]">{files.pdf.name}</span>
                        <button onClick={() => setFiles({...files, pdf: null})} className="text-slate-400 hover:text-red-500"><X size={16}/></button>
                      </div>
                    ) : (
                      <button onClick={() => pdfInputRef.current.click()} className="px-6 py-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 shadow-sm font-bold flex items-center gap-2">
                        <Upload size={16} />
                        Upload PDF
                      </button>
                    )}
                    <input type="file" accept="application/pdf" ref={pdfInputRef} onChange={e => handleFileChange(e, 'pdf')} className="hidden" />
                  </div>

                  {/* Slot B: Private Source */}
                  <div className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center transition-all ${files.source ? 'border-amber-400 bg-amber-50' : 'border-slate-300 hover:border-amber-400 hover:bg-slate-50'}`}>
                    <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-3">
                      <Lock />
                    </div>
                    <p className="font-bold text-slate-700 mb-1">Master Source File</p>
                    <p className="text-xs text-slate-400 mb-4 text-center">Word/Excel Only • Encrypted/Locked</p>
                    
                    {files.source ? (
                      <div className="bg-white px-3 py-2 rounded border border-amber-200 flex items-center gap-2 text-sm text-amber-700 shadow-sm">
                        <CheckCircle size={16} />
                        <span className="truncate max-w-[150px]">{files.source.name}</span>
                        <button onClick={() => setFiles({...files, source: null})} className="text-slate-400 hover:text-red-500"><X size={16}/></button>
                      </div>
                    ) : (
                      <button onClick={() => sourceInputRef.current.click()} className="px-6 py-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 shadow-sm font-bold flex items-center gap-2">
                        <Upload size={16} />
                        Upload Source
                      </button>
                    )}
                    <input type="file" accept=".doc,.docx,.xls,.xlsx" ref={sourceInputRef} onChange={e => handleFileChange(e, 'source')} className="hidden" />
                  </div>

                </div>

                <div className="bg-blue-50 p-4 rounded-lg flex gap-3 text-sm text-blue-900 border border-blue-100">
                  <div className="shrink-0 mt-0.5"><ShieldCheck size={18}/></div>
                  <div>
                    <strong>Compliance Notice:</strong> <br/>
                    By submitting, you certify that these documents match the valid revision approved in the legacy system. This action will be logged in the IATF Audit Trail.
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button 
                    type="submit" 
                    className={`
                      px-8 py-4 rounded-xl font-bold text-lg shadow-lg flex items-center gap-2
                      ${loading 
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                        : isFormValid 
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-emerald-500/30 transform hover:-translate-y-1 transition-all'
                          : 'bg-slate-300 text-slate-500 hover:bg-slate-400' 
                      }
                    `}
                    onClick={(e) => {
                      if (!isFormValid) {
                        e.preventDefault();
                        setError('Please fill in all fields and upload both files to proceed.');
                      }
                    }}
                  >
                    {loading ? 'Processing...' : (
                      <>
                        <Upload size={24} />
                        Upload Document
                      </>
                    )}
                  </button>
                </div>

              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
