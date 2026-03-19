// frontend/src/pages/UploadRevision.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { dcrAPI } from '../api';
import { Upload, AlertCircle, CheckCircle2, FileText, ArrowLeft, Shield, CheckCircle } from 'lucide-react';

export default function UploadRevision() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [files, setFiles] = useState<{ original: File | null; pdf: File | null }>({
    original: null,
    pdf: null,
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkers, setCheckers] = useState<any[]>([]);
  const [checkerId, setCheckerId] = useState('');
  const [approvers, setApprovers] = useState<any[]>([]);
  const [approverId, setApproverId] = useState('');
  const [reuploadInfo, setReuploadInfo] = useState<any | null>(null);
  const [documentLevel, setDocumentLevel] = useState('');
  const [dragActive, setDragActive] = useState({
    original: false,
    pdf: false,
  });

  useEffect(() => {
    const fetchCheckers = async () => {
      try {
        const response = await dcrAPI.listCheckers();
        setCheckers(response.data?.checkers || []);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load checker list');
      }
    };

    const fetchCr = async () => {
      if (!id) return;
      try {
        const response = await dcrAPI.getDetail(id);
        const changeRequest = response.data?.change_request || response.data || null;
        if (changeRequest?.request_type === 'REUPLOAD') {
          setReuploadInfo(changeRequest);
        }
        if (changeRequest?.document_level) {
          setDocumentLevel(String(changeRequest.document_level));
        }
      } catch (err) {
        // Ignore; fall back to standard behavior
      }
    };

    fetchCheckers();
    fetchCr();
  }, [id]);

  useEffect(() => {
    const loadApprovers = async () => {
      try {
        if (!documentLevel) return;
        const response = await dcrAPI.listApprovers(documentLevel);
        const items = response.data?.approvers || [];
        setApprovers(items);
        if (items.length > 0) {
          setApproverId(String(items[0]?.id || ''));
        }
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load approver list');
      }
    };

    loadApprovers();
  }, [documentLevel]);

  const isAllowedSourceFile = (name?: string) => {
    const lower = String(name || '').toLowerCase();
    return lower.endsWith('.doc') || lower.endsWith('.docx') || lower.endsWith('.xls') || lower.endsWith('.xlsx');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'original' | 'pdf') => {
    const file = e.target.files?.[0];
    if (file) {
      if (type === 'original' && !isAllowedSourceFile(file.name)) {
        setError('Original file must be Word/Excel format (.doc, .docx, .xls, .xlsx)');
        return;
      }
      if (type === 'pdf' && !file.name.endsWith('.pdf')) {
        setError('PDF file must be in .pdf format');
        return;
      }
      setFiles(prev => ({ ...prev, [type]: file }));
      setError('');
    }
  };

  const handleDrag = (e: React.DragEvent<HTMLDivElement>, type: 'original' | 'pdf', isDrag: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(prev => ({ ...prev, [type]: isDrag }));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, type: 'original' | 'pdf') => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(prev => ({ ...prev, [type]: false }));

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileChange({ target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>, type);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!files.original) {
      setError('Please upload the original file (.docx)');
      return;
    }

    if (!files.pdf) {
      setError('Please upload the PDF file');
      return;
    }

    if (!checkerId) {
      setError('Please select checker (Assistant Manager or Manager)');
      return;
    }

    if (!approverId) {
      setError('Please select approver');
      return;
    }

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('source', files.original);
      formData.append('pdf', files.pdf);
      formData.append('checker_id', checkerId);
  formData.append('approver_id', approverId);

      if (reuploadInfo?.request_type === 'REUPLOAD' && reuploadInfo?.reupload_target_revision_id) {
        formData.append('target_revision_id', String(reuploadInfo.reupload_target_revision_id));
      }

      await dcrAPI.uploadRevision(id || '', formData);
      setSuccess('Files uploaded successfully. Sent to checker with notification.');
      setTimeout(() => navigate(`/dcr/${id}`), 2000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to upload files');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Back Button */}
      <button
        onClick={() => navigate(`/dcr/${id}`)}
        className="inline-flex items-center gap-2 text-purple-600 font-semibold hover:text-purple-700 hover:gap-3 transition-all"
      >
        <ArrowLeft size={20} />
        Back to Change Request
      </button>

      {/* Header */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-2xl p-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Upload Revision</h1>
        <p className="text-gray-600 text-lg">
          Change Request <span className="font-bold">#{String(id).padStart(4, '0')}</span>
        </p>
        <p className="text-gray-600 mt-3">
          Upload revised source and PDF, then select checker and approver.
        </p>
        {reuploadInfo?.request_type === 'REUPLOAD' && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            Re-upload request for revision {reuploadInfo?.reupload_target_revision_id || '-'}.
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
        <label className="block text-sm font-bold text-gray-900 mb-3">
          Checker (Assistant Manager / Manager)
          <span className="text-red-500">*</span>
        </label>
        <select
          value={checkerId}
          onChange={(e) => setCheckerId(e.target.value)}
          className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-100 transition-all font-medium text-gray-900"
        >
          <option value="">Select checker</option>
          {checkers.map((checker) => (
            <option key={checker.id} value={checker.id}>
              {checker.employee_code} - {checker.name} ({String(checker.role_name || '').replace(/_/g, ' ')})
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
        <label className="block text-sm font-bold text-gray-900 mb-3">
          Approver
          <span className="text-red-500">*</span>
        </label>
        <select
          value={approverId}
          onChange={(e) => setApproverId(e.target.value)}
          className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-100 transition-all font-medium text-gray-900"
        >
          <option value="">Select approver</option>
          {approvers.map((approver) => (
            <option key={approver.id} value={approver.id}>
              {approver.employee_code} - {approver.name} ({String(approver.role_name || '').replace(/_/g, ' ')})
            </option>
          ))}
        </select>
        {(documentLevel === 'L1' || documentLevel === 'L2') && (
          <p className="text-xs text-slate-500 mt-2">L1/L2 documents require President approval.</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Error Alert */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 flex gap-3">
            <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
            <p className="text-red-800 font-medium">{error}</p>
          </div>
        )}

        {/* Success Alert */}
        {success && (
          <div className="bg-green-50 border-l-4 border-green-500 rounded-lg p-4 flex gap-3">
            <CheckCircle2 className="text-green-600 flex-shrink-0 mt-0.5" size={20} />
            <p className="text-green-800 font-medium">{success}</p>
          </div>
        )}

        {/* File Upload Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Original File Upload */}
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="text-purple-600" size={18} />
              Original Document
              <span className="text-red-500">*</span>
            </label>
            <div
              onDragEnter={(e) => handleDrag(e, 'original', true)}
              onDragLeave={(e) => handleDrag(e, 'original', false)}
              onDragOver={(e) => handleDrag(e, 'original', true)}
              onDrop={(e) => handleDrop(e, 'original')}
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 cursor-pointer ${
                dragActive.original
                  ? 'border-purple-600 bg-purple-50 shadow-lg'
                  : 'border-slate-300 hover:border-purple-500 hover:bg-purple-50'
              } ${files.original ? 'bg-green-50 border-green-400' : ''}`}
            >
              <input
                type="file"
                accept=".doc,.docx,.xls,.xlsx"
                onChange={(e) => handleFileChange(e, 'original')}
                className="hidden"
                id="original-upload"
              />
              <label htmlFor="original-upload" className="cursor-pointer block">
                {files.original ? (
                  <>
                    <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
                    <p className="font-bold text-green-900">{files.original.name}</p>
                    <p className="text-sm text-green-700 mt-1">
                      {(files.original.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </>
                ) : (
                  <>
                    <Upload className="w-12 h-12 text-purple-600 mx-auto mb-3" />
                    <p className="font-bold text-gray-900">
                      Drag and drop or click
                    </p>
                    <p className="text-sm text-gray-600 mt-1">Word/Excel files accepted (.doc, .docx, .xls, .xlsx)</p>
                    <p className="text-xs text-gray-500 mt-2">Max size: 100 MB</p>
                  </>
                )}
              </label>
            </div>
          </div>

          {/* PDF File Upload */}
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="text-blue-600" size={18} />
              PDF Version
              <span className="text-red-500">*</span>
            </label>
            <div
              onDragEnter={(e) => handleDrag(e, 'pdf', true)}
              onDragLeave={(e) => handleDrag(e, 'pdf', false)}
              onDragOver={(e) => handleDrag(e, 'pdf', true)}
              onDrop={(e) => handleDrop(e, 'pdf')}
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 cursor-pointer ${
                dragActive.pdf
                  ? 'border-blue-600 bg-blue-50 shadow-lg'
                  : 'border-slate-300 hover:border-blue-500 hover:bg-blue-50'
              } ${files.pdf ? 'bg-green-50 border-green-400' : ''}`}
            >
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => handleFileChange(e, 'pdf')}
                className="hidden"
                id="pdf-upload"
              />
              <label htmlFor="pdf-upload" className="cursor-pointer block">
                {files.pdf ? (
                  <>
                    <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
                    <p className="font-bold text-green-900">{files.pdf.name}</p>
                    <p className="text-sm text-green-700 mt-1">
                      {(files.pdf.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </>
                ) : (
                  <>
                    <Upload className="w-12 h-12 text-blue-600 mx-auto mb-3" />
                    <p className="font-bold text-gray-900">
                      Drag and drop or click
                    </p>
                    <p className="text-sm text-gray-600 mt-1">Only .pdf files accepted</p>
                    <p className="text-xs text-gray-500 mt-2">Max size: 100 MB</p>
                  </>
                )}
              </label>
            </div>
          </div>
        </div>

        {/* Important Notes */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-2xl p-8">
          <h3 className="font-bold text-amber-900 mb-4 flex items-center gap-2">
            <Shield className="text-amber-600" size={24} />
            Important File Requirements
          </h3>
          <ul className="space-y-3">
            <li className="flex gap-3 text-amber-800">
              <CheckCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={18} />
              <span><strong>Content Match:</strong> Both files must contain identical content</span>
            </li>
            <li className="flex gap-3 text-amber-800">
              <CheckCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={18} />
              <span><strong>PDF Format:</strong> PDF should be the exact printable version of the source file</span>
            </li>
            <li className="flex gap-3 text-amber-800">
              <CheckCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={18} />
              <span><strong>File Integrity:</strong> Files will be verified using cryptographic hashing</span>
            </li>
            <li className="flex gap-3 text-amber-800">
              <CheckCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={18} />
              <span><strong>Next Step:</strong> After upload, checker receives this request first</span>
            </li>
          </ul>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading || !files.original || !files.pdf}
            className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white py-4 rounded-xl font-bold hover:shadow-lg hover:shadow-purple-500/40 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-lg flex items-center justify-center gap-2"
          >
            <Upload size={20} />
            {loading ? 'Uploading...' : 'Submit Revision'}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/dcr/${id}`)}
            className="flex-1 bg-white border-2 border-slate-300 text-slate-700 py-4 rounded-xl font-bold hover:bg-slate-50 transition-all duration-300 text-lg"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
