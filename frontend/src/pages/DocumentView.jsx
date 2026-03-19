// frontend/src/pages/DocumentView.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { API_BASE_URL, documentAPI } from '../api';
import { ArrowLeft, Printer, Shield, Eye, Calendar, User, Download, FileText, AlertTriangle } from 'lucide-react';

export default function DocumentView() {
  const { id } = useParams();
  const [document, setDocument] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const pdfUrlRef = useRef(null);
  const closeLoggedRef = useRef(false);
  const accessSessionRef = useRef(null);
  const hasEnteredRef = useRef(false);

  useEffect(() => {
    fetchDocument();
  }, [id]);

  useEffect(() => {
    const logClose = () => {
      if (closeLoggedRef.current || !id || !hasEnteredRef.current) return;
      closeLoggedRef.current = true;

      const token = localStorage.getItem('token');
      const payload = JSON.stringify({ session_id: accessSessionRef.current || null });

      try {
        fetch(`${API_BASE_URL}/documents/${id}/close`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      } catch (_) {
      }
    };

    const handlePageHide = () => logClose();
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);

    return () => {
      logClose();
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
      }
    };
  }, [id]);

  const fetchDocument = async () => {
    try {
      setLoading(true);
      
      // 1. Fetch Metadata
      const meta = await documentAPI.get(id);
      setDocument(meta.data);

      // 2. Fetch PDF Content securely (with Watermark)
      const blobRes = await documentAPI.view(id);
      const url = URL.createObjectURL(blobRes.data);
      setPdfUrl(url);
      pdfUrlRef.current = url;
      accessSessionRef.current = blobRes.headers?.['x-access-session'] || null;
      closeLoggedRef.current = false;
      hasEnteredRef.current = true;

    } catch (err) {
      console.error(err);
      setError('Failed to load document. It might be restricted or deleted.');
      hasEnteredRef.current = false;
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
     // Trigger browser print dialog for the iframe/window
     const iframe = document.getElementById('pdf-frame');
     if (iframe) {
         iframe.contentWindow.print();
     }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 p-4">
        <div className="text-center max-w-md">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h3>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link to="/documents" className="btn-primary inline-flex items-center gap-2">
            <ArrowLeft size={18} />
            Back to Documents
          </Link>
        </div>
      </div>
    );
  }

  const isObsolete = document.status === 'Obsolete';

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden">
      {/* Header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-4">
          <Link to="/documents" className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              {document.doc_no}
              {isObsolete && (
                <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded border border-red-200 uppercase tracking-wide">
                  OBSOLETE
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-500 truncate max-w-md">{document.title}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
            {isObsolete ? (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 animate-pulse">
                    <AlertTriangle size={16} />
                    <span className="text-xs font-bold uppercase tracking-wide">Uncontrolled Document</span>
                </div>
            ) : (
                <div className="flex items-center gap-2 text-green-700 bg-green-50 px-3 py-1.5 rounded-lg border border-green-100">
                    <Shield size={16} />
                    <span className="text-xs font-bold uppercase tracking-wide">Controlled Copy</span>
                </div>
            )}
            
            <button 
                onClick={handlePrint}
                className="bg-slate-800 text-white hover:bg-slate-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isObsolete} 
                title={isObsolete ? "Printing disabled for obsolete documents" : "Print Document"}
            >
                <Printer size={16} />
                <span>Print</span>
            </button>
        </div>
      </header>

      {/* Main Content: PDF View + Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* PDF Viewer Area */}
        <div className="flex-1 bg-slate-200 relative flex flex-col items-center justify-center p-4">
          {pdfUrl ? (
            <iframe 
                id="pdf-frame"
                src={pdfUrl} 
                className="w-full h-full rounded-lg shadow-xl border border-slate-300 bg-white"
                title="Document Viewer"
            ></iframe>
          ) : (
            <div className="text-slate-400">Loading document preview...</div>
          )}
          
          {/* Watermark Overlay (HTML-based backup) */}
          {isObsolete && (
             <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden z-20 opacity-20 select-none">
                 <div className="transform -rotate-45 whitespace-nowrap text-9xl font-black text-red-600 tracking-widest border-4 border-red-600 p-8 rounded-xl mixed-blend-multiply">
                     OBSOLETE
                 </div>
             </div>
          )}
        </div>

        {/* Info Sidebar */}
        <aside className="w-80 bg-white border-l border-slate-200 overflow-y-auto hidden lg:block shrink-0">
            <div className="p-6 space-y-8">
                {/* Meta Block 1 */}
                <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Document Details</h3>
                    <div className="space-y-4">
                        <div className="flex items-start gap-3">
                            <FileText className="text-slate-400 mt-0.5" size={18} />
                            <div>
                                <p className="text-sm font-medium text-slate-900">Revision {document.revision}</p>
                                <p className="text-xs text-slate-500">Latest approved version</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <Calendar className="text-slate-400 mt-0.5" size={18} />
                            <div>
                                <p className="text-sm font-medium text-slate-900">
                                    {new Date(document.rev_date).toLocaleDateString()}
                                </p>
                                <p className="text-xs text-slate-500">Effective Date</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <User className="text-slate-400 mt-0.5" size={18} />
                            <div>
                                <p className="text-sm font-medium text-slate-900">{document.owner_name || 'System Admin'}</p>
                                <p className="text-xs text-slate-500">Document Owner</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="border-t border-slate-100 pt-6">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Security Classification</h3>
                    <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-100 text-xs text-yellow-800 leading-relaxed">
                        <p className="font-bold mb-1">confidential - Internal Use Only</p>
                        This document is intended solely for internal use. Any unauthorized distribution is prohibited. Printed copies are uncontrolled unless stamped.
                    </div>
                </div>
            </div>
        </aside>
      </div>
    </div>
  );
}
