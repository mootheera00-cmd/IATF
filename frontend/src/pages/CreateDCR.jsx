// frontend/src/pages/CreateDCR.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { dcrAPI, documentAPI } from '../api';
import { AlertCircle, CheckCircle2, FileText, Search, Tag, Check } from 'lucide-react';

export default function CreateDCR() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState([]);
  const [docNoInput, setDocNoInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [formData, setFormData] = useState({
    document_id: '',
    reason: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await documentAPI.list();
      const docs = (response.data || []).map((doc) => ({
        id: doc.id,
        doc_no: doc.doc_no,
        title: doc.title,
        category: doc.level || 'Uncategorized',
        status: doc.status || 'Unknown',
        revision: doc.revision,
      }));
      setDocuments(docs);
    } catch (err) {
      console.error('Error fetching documents:', err);
      setError('Failed to load documents');
    }
  };

  const categories = ['All', ...new Set(documents.map((doc) => doc.category).filter(Boolean))];

  const categoryDocuments = selectedCategory === 'All'
    ? documents
    : documents.filter((doc) => doc.category === selectedCategory);

  const docSuggestions = categoryDocuments
    .filter((doc) => {
      if (!docNoInput.trim()) return true;
      const input = docNoInput.toLowerCase();
      return (doc.doc_no || '').toLowerCase().includes(input) || (doc.title || '').toLowerCase().includes(input);
    })
    .slice(0, 8);

  const selectedDocument = documents.find((doc) => String(doc.id) === String(formData.document_id));

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
  };

  const handleSelectDocument = (doc) => {
    setFormData((prev) => ({ ...prev, document_id: String(doc.id) }));
    setDocNoInput(doc.doc_no || '');
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.document_id) {
      setError('Please select a document');
      return;
    }
    
    if (!formData.reason.trim()) {
      setError('Please enter a reason for the change');
      return;
    }

    try {
      setLoading(true);
      const response = await dcrAPI.create({
        document_id: parseInt(formData.document_id),
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
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create change request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-2xl p-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Create New Change Request</h1>
        <p className="text-gray-600 text-lg">
          Select document number, input reason, and send request to Document Control.
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
          {/* Document Selection */}
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <FileText className="text-purple-600" size={18} />
              Select Document No.
              <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-start">
              <div className="min-w-0">
                <div className="relative">
                <Search className="absolute left-3 top-3.5 text-slate-400" size={18} />
                <input
                  type="text"
                  value={docNoInput}
                  onChange={(e) => {
                    setDocNoInput(e.target.value);
                    setFormData((prev) => ({ ...prev, document_id: '' }));
                  }}
                  placeholder="Type document no. (autocomplete)..."
                  className="w-full pl-10 pr-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-100 transition-all font-medium text-gray-900"
                />
              </div>

              {docSuggestions.length > 0 && (
                <div className="mt-2 w-full max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                  {docSuggestions.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => handleSelectDocument(doc)}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                    >
                      <p className="font-semibold text-gray-900">{doc.doc_no || '-'}</p>
                      <p className="text-sm text-gray-600 truncate">{doc.title}</p>
                      <p className="text-xs text-gray-500 mt-1">{doc.category} · {doc.status} · Rev {doc.revision ?? '-'}</p>
                    </button>
                  ))}
                </div>
              )}
              </div>

              <div className="w-full md:w-auto">
                <button
                  type="button"
                  onClick={() => setShowCategoryPicker((prev) => !prev)}
                  className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-4 py-3 border-2 border-slate-200 rounded-xl font-semibold text-gray-700 hover:bg-slate-50"
                >
                  <Tag size={16} />
                  {selectedCategory === 'All' ? 'Select Category' : selectedCategory}
                </button>

                {showCategoryPicker && (
                  <div className="mt-2 w-full md:w-56 rounded-xl border border-slate-200 bg-white shadow-sm p-2">
                    {categories.map((category) => (
                      <button
                        key={category}
                        type="button"
                        onClick={() => {
                          setSelectedCategory(category);
                          setShowCategoryPicker(false);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 text-sm text-left"
                      >
                        <span>{category}</span>
                        {selectedCategory === category && <Check size={14} className="text-green-600" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <input type="hidden" name="document_id" value={formData.document_id} onChange={handleChange} />

            <p className="text-sm text-gray-500 mt-2">
              {selectedDocument
                ? `Selected: ${selectedDocument.doc_no} — ${selectedDocument.title}`
                : 'Type document number and pick from suggestions'}
            </p>
          </div>

          {/* Document Name (Auto) */}
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
              placeholder="Enter short reason for document modification"
              className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-100 transition-all font-medium text-gray-900"
            />
            <div className="flex justify-between items-center mt-3">
              <p className="text-sm text-gray-500">
                Provide clear details about the required changes
              </p>
              <p className={`text-sm font-semibold ${
                formData.reason.length > 500 ? 'text-red-600' : 'text-purple-600'
              }`}>
                {formData.reason.length}/500
              </p>
            </div>
          </div>

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
