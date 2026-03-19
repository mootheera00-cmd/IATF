// frontend/src/pages/CreateDCR.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { dcrAPI, documentAPI } from '../api';
import { AlertCircle, CheckCircle2, FileText, Search, Tag } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function CreateDCR() {
  const { user, roleMode } = useAuth();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<any[]>([]);
  const [requestMode, setRequestMode] = useState<'CHANGE' | 'NEW' | 'REUPLOAD'>('CHANGE');
  const [docNoInput, setDocNoInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newSubCategory, setNewSubCategory] = useState('');
  const [newDocumentName, setNewDocumentName] = useState('');
  const [generatedDocNo, setGeneratedDocNo] = useState('');
  const [generatedLevel, setGeneratedLevel] = useState('');
  const [previewMessage, setPreviewMessage] = useState('');
  const [formData, setFormData] = useState({
    document_id: '',
    reason: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [reuploadOptions, setReuploadOptions] = useState<any | null>(null);
  const [reuploadDocumentId, setReuploadDocumentId] = useState('');
  const [reuploadRevisionId, setReuploadRevisionId] = useState('');
  const [reuploadAssigneeId, setReuploadAssigneeId] = useState('');
  const [reuploadSearchInput, setReuploadSearchInput] = useState('');

  const normalizedRole = String((user as any)?.actual_role || (user as any)?.role || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const isDcRole = ['DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER'].includes(normalizedRole) && roleMode !== 'USER';

  useEffect(() => {
    if (isDcRole) {
      setRequestMode('REUPLOAD');
    }
    fetchDocuments();
  }, [isDcRole]);

  useEffect(() => {
    if (requestMode !== 'REUPLOAD') return;
    if (!reuploadDocumentId) {
      setReuploadOptions(null);
      return;
    }

    const loadReuploadOptions = async () => {
      try {
        const response = await dcrAPI.getReuploadOptions(reuploadDocumentId);
        const payload = response.data || null;
        setReuploadOptions(payload);
        const defaultRevision = payload?.current_revision_id || payload?.revisions?.[0]?.id || '';
        setReuploadRevisionId(String(defaultRevision || ''));
        const defaultAssignee = payload?.default_assignee_id || payload?.users?.[0]?.id || '';
        setReuploadAssigneeId(String(defaultAssignee || ''));
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load re-upload options');
      }
    };

    loadReuploadOptions();
  }, [requestMode, reuploadDocumentId]);

  useEffect(() => {
    if (requestMode !== 'NEW') return;
    if (!newCategory || !newSubCategory) {
      setGeneratedDocNo('');
      setGeneratedLevel('');
      return;
    }

    const loadPreview = async () => {
      try {
        setPreviewMessage('Generating document number...');
        const response = await dcrAPI.previewNewDocument({
          category: newCategory,
          subCategory: newSubCategory
        });
        setGeneratedDocNo(response.data?.documentNo || '');
        setGeneratedLevel(response.data?.level || '');
        setPreviewMessage('');
      } catch (err: any) {
        setGeneratedDocNo('');
        setGeneratedLevel('');
        setPreviewMessage(err.response?.data?.message || 'Unable to generate document number');
      }
    };

    loadPreview();
  }, [requestMode, newCategory, newSubCategory]);

  const fetchDocuments = async () => {
    try {
      const response = await documentAPI.list();
      const docs = (response.data || []).map((doc: any) => ({
        id: doc.id,
        doc_no: doc.doc_no,
        title: doc.title,
        category: doc.level || 'Uncategorized',
        status: doc.status || 'Unknown',
        revision: doc.revision,
      }));
      const releasedOnly = docs.filter((doc: any) => String(doc.status || '').trim().toLowerCase() === 'released');
      setDocuments(releasedOnly);
    } catch (err) {
      console.error('Error fetching documents:', err);
      setError('Failed to load documents');
    }
  };

  const categories = [...new Set(documents.map((doc) => doc.category).filter(Boolean))].sort();

  const categoryDocuments = selectedCategory
    ? documents.filter((doc) => doc.category === selectedCategory)
    : [];

  const docSuggestions = categoryDocuments
    .filter((doc) => {
      if (!docNoInput.trim()) return true;
      const input = docNoInput.toLowerCase();
      return (doc.doc_no || '').toLowerCase().includes(input) || (doc.title || '').toLowerCase().includes(input);
    })
    .slice(0, 10);

  const reuploadSuggestions = documents
    .filter((doc) => {
      if (!reuploadSearchInput.trim()) return true;
      const input = reuploadSearchInput.toLowerCase();
      return (doc.doc_no || '').toLowerCase().includes(input) || (doc.title || '').toLowerCase().includes(input);
    })
    .slice(0, 8);

  const selectedDocument = documents.find((doc) => String(doc.id) === String(formData.document_id));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
  };

  const handleSelectDocument = (doc: any) => {
    setFormData((prev) => ({ ...prev, document_id: String(doc.id) }));
    setDocNoInput(doc.doc_no || '');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (isDcRole && requestMode !== 'REUPLOAD') {
      setError('Document Control users can only create re-upload requests.');
      return;
    }

    if (!formData.reason.trim()) {
      setError('Please enter a reason for the change');
      return;
    }

    if (requestMode === 'NEW') {
      if (!newCategory || !newSubCategory) {
        setError('Please select category and sub-category');
        return;
      }
      if (!newDocumentName.trim()) {
        setError('Please enter document name');
        return;
      }
    } else if (requestMode === 'REUPLOAD') {
      if (!reuploadDocumentId) {
        setError('Please select a document for re-upload');
        return;
      }
      if (!reuploadRevisionId) {
        setError('Please select a revision to re-upload');
        return;
      }
      if (!reuploadAssigneeId) {
        setError('Please select the uploader');
        return;
      }
    } else if (!formData.document_id) {
      setError('Please select a document');
      return;
    }

    try {
      setLoading(true);

      if (requestMode === 'REUPLOAD') {
        const response = await dcrAPI.createReupload({
          document_id: parseInt(reuploadDocumentId, 10),
          target_revision_id: parseInt(reuploadRevisionId, 10),
          assignee_id: parseInt(reuploadAssigneeId, 10),
          reason: formData.reason,
        });

        const crId = response.data?.change_request_id || response.data?.cr_id || response.data?.id;
        if (!crId) {
          throw new Error('Create succeeded but change request id was not returned');
        }

        setSuccess('Re-upload request created and sent to uploader.');
        setTimeout(() => {
          navigate(`/dcr/${crId}`);
        }, 1500);
      } else {
        const response = requestMode === 'NEW'
          ? await dcrAPI.createNewDocument({
              category: newCategory,
              subCategory: newSubCategory,
              reason: formData.reason,
              documentName: newDocumentName
            })
          : await dcrAPI.create({
              document_id: parseInt(formData.document_id, 10),
              reason: formData.reason,
            });

        const crId = response.data?.change_request_id || response.data?.cr_id || response.data?.id;

        if (!crId) {
          throw new Error('Create succeeded but change request id was not returned');
        }

        await dcrAPI.submit(crId);

        setSuccess('Change request submitted successfully. Document Control has been notified.');
        setTimeout(() => {
          navigate(`/dcr/${crId}`);
        }, 1500);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create change request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-2xl p-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Create/Change Request</h1>
        <p className="text-gray-600 text-lg">
          Create a new document request or submit a change request.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Error Alert */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 flex gap-3">
            <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-bold text-red-900">Error</p>
              <p className="text-red-700 text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        {isDcRole && (
          <div className="bg-amber-50 border-l-4 border-amber-400 rounded-lg p-4 flex gap-3">
            <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-bold text-amber-900">Document Control restriction</p>
              <p className="text-amber-700 text-sm mt-1">Only re-upload requests are allowed for Document Control users.</p>
            </div>
          </div>
        )}

        {/* Success Alert */}
        {success && (
          <div className="bg-green-50 border-l-4 border-green-500 rounded-lg p-4 flex gap-3">
            <CheckCircle2 className="text-green-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-bold text-green-900">Success</p>
              <p className="text-green-700 text-sm mt-1">{success}</p>
            </div>
          </div>
        )}

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 space-y-6">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => { setRequestMode('CHANGE'); setSelectedCategory(''); setDocNoInput(''); setFormData(prev => ({ ...prev, document_id: '' })); }}
              disabled={isDcRole}
              className={`px-4 py-2 rounded-xl font-semibold border ${requestMode === 'CHANGE' ? 'bg-purple-600 text-white border-purple-600' : 'border-slate-200 text-slate-700 hover:bg-slate-50'} ${isDcRole ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Change Request
            </button>
            <button
              type="button"
              onClick={() => setRequestMode('NEW')}
              disabled={isDcRole}
              className={`px-4 py-2 rounded-xl font-semibold border ${requestMode === 'NEW' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-700 hover:bg-slate-50'} ${isDcRole ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Create New Document
            </button>
            <button
              type="button"
              onClick={() => setRequestMode('REUPLOAD')}
              className={`px-4 py-2 rounded-xl font-semibold border ${requestMode === 'REUPLOAD' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
            >
              Re-Upload Request
            </button>
          </div>

          {requestMode === 'NEW' && (
            <div className="grid gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-3">
                  Category
                  <span className="text-red-500">*</span>
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => {
                    setNewCategory(e.target.value);
                    setNewSubCategory('');
                  }}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
                >
                  <option value="">Select category</option>
                  <option value="Form">Form</option>
                  <option value="Procedure">Procedure</option>
                  <option value="Support">Support</option>
                  <option value="Work Instruction">Work Instruction</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-900 mb-3">
                  Sub-Category
                  <span className="text-red-500">*</span>
                </label>
                <select
                  value={newSubCategory}
                  onChange={(e) => setNewSubCategory(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
                >
                  <option value="">Select sub-category</option>
                  {newCategory === 'Form' && (
                    <>
                      <option value="Investigation">Investigation</option>
                      <option value="Test">Test</option>
                      <option value="DOC LAB Control">DOC LAB Control</option>
                      <option value="Calibration">Calibration</option>
                      <option value="Document">Document</option>
                      <option value="Traning">Traning</option>
                    </>
                  )}
                  {newCategory === 'Procedure' && (
                    <option value="Procedure">Procedure</option>
                  )}
                  {newCategory === 'Support' && (
                    <>
                      <option value="Investigation">Investigation</option>
                      <option value="Test">Test</option>
                      <option value="DOC LAB Control">DOC LAB Control</option>
                      <option value="Calibration">Calibration</option>
                      <option value="Traning">Traning</option>
                    </>
                  )}
                  {newCategory === 'Work Instruction' && (
                    <>
                      <option value="Investigation">Investigation</option>
                      <option value="Test">Test</option>
                      <option value="DOC LAB Control">DOC LAB Control</option>
                      <option value="Calibration">Calibration</option>
                    </>
                  )}
                </select>
                {previewMessage && (
                  <p className="text-xs text-slate-500 mt-2">{previewMessage}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-900 mb-3">
                  Document Name
                  <span className="text-red-500">*</span>
                </label>
                <input
                  value={newDocumentName}
                  onChange={(event) => setNewDocumentName(event.target.value)}
                  placeholder="Enter document name"
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-900 mb-3">Document No.</label>
                <input
                  value={generatedDocNo}
                  readOnly
                  placeholder="Auto-generated document number"
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl bg-slate-50 text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-900 mb-3">Level</label>
                <input
                  value={generatedLevel}
                  readOnly
                  placeholder="Auto-filled level"
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl bg-slate-50 text-gray-900"
                />
              </div>
            </div>
          )}

          {requestMode === 'REUPLOAD' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-3">Document Number / Name</label>
                <div className="relative">
                  <Search className="absolute left-4 top-4 text-slate-400" size={18} />
                  <input
                    type="text"
                    value={reuploadSearchInput}
                    onChange={(e) => setReuploadSearchInput(e.target.value)}
                    placeholder="Search document number or name..."
                    className="w-full pl-12 pr-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                  />
                </div>
                {reuploadSuggestions.length > 0 && (
                  <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-200">
                    {reuploadSuggestions.map((doc) => (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => {
                          setReuploadDocumentId(String(doc.id));
                          setReuploadSearchInput(`${doc.doc_no || ''} - ${doc.title || ''}`);
                          setError('');
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-white"
                      >
                        <p className="font-semibold text-gray-900">{doc.doc_no}</p>
                        <p className="text-sm text-gray-600">{doc.title}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {reuploadOptions && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-3">Revision to Re-Upload</label>
                    <select
                      value={reuploadRevisionId}
                      onChange={(e) => setReuploadRevisionId(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                    >
                      {reuploadOptions.revisions?.map((rev: any) => (
                        <option key={rev.id} value={rev.id}>
                          {rev.rev_code || rev.revision_number || `Rev ${rev.id}`} {rev.id === reuploadOptions.current_revision_id ? '(Current)' : '(Obsolete)'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-3">Assign Uploader</label>
                    <select
                      value={reuploadAssigneeId}
                      onChange={(e) => setReuploadAssigneeId(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                    >
                      {(reuploadOptions.users || []).map((userItem: any) => (
                        <option key={userItem.id} value={userItem.id}>
                          {userItem.employee_code} - {userItem.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Document Selection */}
          {requestMode === 'CHANGE' && (
          <div className="space-y-4">

            {/* Step 1 — Category */}
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                <Tag className="text-purple-500" size={16} />
                Step 1 — Select Category
                <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(cat);
                      setDocNoInput('');
                      setFormData(prev => ({ ...prev, document_id: '' }));
                    }}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                      selectedCategory === cat
                        ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-purple-400 hover:bg-purple-50'
                    }`}
                  >
                    {cat}
                    {selectedCategory === cat && (
                      <span className="ml-1.5 text-xs bg-white/25 rounded px-1">
                        {documents.filter(d => d.category === cat).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {!selectedCategory && (
                <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                  <AlertCircle size={12} /> Please select a category first to see available documents.
                </p>
              )}
            </div>

            {/* Step 2 — Document search (only active after category chosen) */}
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                <FileText className="text-purple-600" size={16} />
                Step 2 — Search &amp; Select Document
                <span className="text-red-500">*</span>
                {selectedCategory && (
                  <span className="text-xs font-normal text-slate-400">
                    — {categoryDocuments.length} document{categoryDocuments.length !== 1 ? 's' : ''} in &ldquo;{selectedCategory}&rdquo;
                  </span>
                )}
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-3.5 text-slate-400" size={18} />
                <input
                  type="text"
                  value={docNoInput}
                  onChange={(e) => {
                    setDocNoInput(e.target.value);
                    setFormData((prev) => ({ ...prev, document_id: '' }));
                  }}
                  placeholder={selectedCategory ? `Search in ${selectedCategory}...` : 'Select a category first…'}
                  disabled={!selectedCategory}
                  className={`w-full pl-10 pr-4 py-3 border-2 rounded-xl focus:outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-100 transition-all font-medium text-gray-900 ${
                    !selectedCategory ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-white border-slate-200'
                  }`}
                />
              </div>

              {/* Suggestions dropdown */}
              {selectedCategory && docSuggestions.length > 0 && (
                <div className="mt-2 w-full max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white shadow-md">
                  {docSuggestions.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => handleSelectDocument(doc)}
                      className={`w-full text-left px-4 py-3 hover:bg-purple-50 border-b border-slate-100 last:border-b-0 transition-colors ${
                        String(formData.document_id) === String(doc.id) ? 'bg-purple-50 border-l-4 border-l-purple-500' : ''
                      }`}
                    >
                      <p className="font-semibold text-gray-900">{doc.doc_no || '-'}</p>
                      <p className="text-sm text-gray-600 truncate">{doc.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Rev {doc.revision ?? '-'} · {doc.status}</p>
                    </button>
                  ))}
                </div>
              )}

              {/* No results */}
              {selectedCategory && docNoInput && docSuggestions.length === 0 && (
                <p className="text-sm text-slate-500 mt-2 px-1">No documents found matching &ldquo;{docNoInput}&rdquo; in {selectedCategory}.</p>
              )}
            </div>

            <input type="hidden" name="document_id" value={formData.document_id} onChange={handleChange} />

            <p className="text-sm text-gray-500">
              {selectedDocument
                ? <span className="text-green-700 font-semibold">✓ Selected: {selectedDocument.doc_no} — {selectedDocument.title}</span>
                : selectedCategory ? 'Search above and click a document to select it' : 'Select a category to begin'}
            </p>
          </div>
          )}

          {/* Document Name (Auto) */}
          {requestMode === 'CHANGE' && (
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-3">
              Document Name
            </label>
            <input
              type="text"
              value={selectedDocument?.title || ''}
              readOnly
              placeholder="Select document number to auto-fill document name"
              className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl bg-slate-50 text-gray-900"
            />
          </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-3">
              Short Reason
              <span className="text-red-500">*</span>
            </label>
            <input
              name="reason"
              value={formData.reason}
              onChange={handleChange}
              maxLength={500}
              placeholder={requestMode === 'NEW'
                ? 'Enter short reason for creating a new document'
                : 'Enter short reason for document modification'}
              className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-100 transition-all font-medium text-gray-900"
            />
            <div className="flex justify-between items-center mt-3">
              <p className="text-sm text-gray-500">
                {requestMode === 'NEW'
                  ? 'Provide clear details about the new document request'
                  : 'Provide clear details about the required changes'}
              </p>
              <p className={`text-sm font-semibold ${
                formData.reason.length > 500 ? 'text-red-600' : 'text-purple-600'
              }`}>
                {formData.reason.length}/500
              </p>
            </div>
          </div>

          {requestMode === 'CHANGE' && (
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-3">Current Revision</label>
              <input
                type="text"
                value={selectedDocument?.revision ?? ''}
                readOnly
                placeholder="Select document number to show current revision"
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl bg-slate-50 text-gray-900"
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white py-4 rounded-xl font-bold hover:shadow-lg hover:shadow-purple-500/40 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
          >
            {loading ? 'Submitting...' : 'Send Request'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/dcr')}
            className="flex-1 bg-white border-2 border-slate-300 text-slate-700 py-4 rounded-xl font-bold hover:bg-slate-50 transition-all duration-300 text-lg"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
