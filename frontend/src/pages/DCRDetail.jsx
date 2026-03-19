// frontend/src/pages/DCRDetail.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { dcrAPI } from '../api';
import {
  AlertCircle, CheckCircle2, Download, Upload, Clock, ArrowLeft,
  FileText, User, Calendar, MessageSquare, ChevronDown, ChevronUp,
  ThumbsUp, ThumbsDown
} from 'lucide-react';
import DCRStepper from '../components/DCRStepper';

export default function DCRDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dcr, setDcr] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    details: true,
    approvals: true,
  });
  const [decision, setDecision] = useState({
    action: '',
    comments: '',
  });

  useEffect(() => {
    fetchDCRDetail();
  }, [id]);

  const fetchDCRDetail = async () => {
    try {
      setLoading(true);
      const response = await dcrAPI.getDetail(id);
      const payload = response.data || {};
      const changeRequest = payload.change_request || payload;
      setDcr(changeRequest && changeRequest.id ? changeRequest : null);
      setApprovals(payload.approval_history || payload.approvals || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch change request');
    } finally {
      setLoading(false);
    }
  };

  const handleApprovalDecision = async (action) => {
    if (!decision.comments.trim() && action !== 'Approve') {
      setError('Please provide comments for this decision');
      return;
    }

    try {
      setActionLoading(true);
      setError('');
      await dcrAPI.makeDecision(id, action, decision.comments);
      setSuccess(action === 'Approve' ? 'APPROVED' : 'REJECTED');
      await fetchDCRDetail();
      setDecision({ action: '', comments: '' });
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${action.toLowerCase()} change request`);
      setSuccess('');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitDraft = async () => {
    try {
      setActionLoading(true);
      setError('');
      await dcrAPI.submit(id);
      setSuccess('Draft submitted successfully. Notifications have been sent.');
      await fetchDCRDetail();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit draft change request');
      setSuccess('');
    } finally {
      setActionLoading(false);
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const getStatusColor = (status) => {
    const colors = {
      'Draft': 'from-slate-500 to-slate-600',
      'Submitted': 'from-blue-500 to-blue-600',
      'DC Approved': 'from-cyan-500 to-blue-600',
      'Pending Approval': 'from-amber-500 to-orange-600',
      'Pending Checker Approval': 'from-amber-500 to-orange-600',
      'Pending Approver Approval': 'from-indigo-500 to-violet-600',
      'Pending DC Final Approval': 'from-sky-600 to-blue-700',
      'Pre-Approved': 'from-green-500 to-emerald-600',
      'Revision Pending': 'from-orange-500 to-red-600',
      'Approved': 'from-green-500 to-emerald-600',
      'Rejected': 'from-red-500 to-rose-600',
      'Released': 'from-purple-500 to-indigo-600',
    };
    return colors[status] || 'from-slate-500 to-slate-600';
  };

  const getLatestRevision = () => {
    if (!dcr) return null;
    const revisions = Array.isArray(dcr.revisions) ? dcr.revisions : [];
    if (revisions.length > 0) {
      return revisions[0];
    }
    if (dcr.revision_id) {
      return {
        id: dcr.revision_id,
        original_uri: dcr.original_uri,
        pdf_uri: dcr.pdf_uri,
      };
    }
    return null;
  };

  const basename = (value) => {
    if (!value) return '-';
    return String(value).split('\\').pop().split('/').pop();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-slate-200 border-t-purple-600"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading change request...</p>
        </div>
      </div>
    );
  }

  if (!dcr) {
    return (
      <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 flex gap-3">
        <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
        <div>
          <p className="font-bold text-red-900">Change Request Not Found</p>
          <p className="text-red-700 text-sm mt-1">The requested change request could not be found.</p>
        </div>
      </div>
    );
  }

  const normalizedRole = String(user?.role || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const isDcRole = ['DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER', 'ADMIN'].includes(normalizedRole);
  const isRequester = dcr.requester_id === user?.id;
  const isChecker = Number(dcr.checker_id) === Number(user?.id);
  const isApprover = Number(dcr.approver_id) === Number(user?.id);
  const canSubmitDraft = isRequester && dcr.status === 'Draft';
  const canApprove =
    !isRequester && (
      (isDcRole && ['Submitted', 'Pending DC Final Approval'].includes(dcr.status)) ||
      (isChecker && ['Pending Checker Approval', 'Pending Approval'].includes(dcr.status)) ||
      (isApprover && dcr.status === 'Pending Approver Approval')
    );
  const canUploadRevision = isRequester && ['DC Approved', 'Pre-Approved', 'Returned for Revision'].includes(dcr.status);
  const decisionHint = dcr.status === 'Submitted'
    ? 'Document Control decision'
    : dcr.status === 'Pending Checker Approval' || dcr.status === 'Pending Approval'
      ? 'Checker decision'
      : dcr.status === 'Pending Approver Approval'
        ? 'Approver decision'
        : dcr.status === 'Pending DC Final Approval'
          ? 'Final Document Control decision'
          : 'Decision';
  const latestRevision = getLatestRevision();

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Back Button */}
      <button
        onClick={() => navigate('/dcr')}
        className="inline-flex items-center gap-2 text-purple-600 font-semibold hover:text-purple-700 hover:gap-3 transition-all"
      >
        <ArrowLeft size={20} />
        Back to Change Requests
      </button>

      {/* Stepper Workflow */}
      <DCRStepper currentStatus={dcr.status} history={approvals} />

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 flex gap-3">
          <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-bold text-red-900">Action failed</p>
            <p className="text-red-700 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border-l-4 border-green-500 rounded-lg p-4 flex gap-3">
          <CheckCircle2 className="text-green-600 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-bold text-green-900">Success</p>
            <p className="text-green-700 text-sm mt-1">{success}</p>
          </div>
        </div>
      )}

      {canSubmitDraft && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-amber-900">Draft is not yet sent for approval</h3>
              <p className="text-amber-800 text-sm mt-1">Submit this draft to notify Document Control and move to the next step.</p>
            </div>
            <button
              onClick={handleSubmitDraft}
              disabled={actionLoading}
              className="inline-flex items-center justify-center gap-2 bg-amber-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-amber-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Submit Draft
            </button>
          </div>
        </div>
      )}

      {/* Header Card */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        <div className={`bg-gradient-to-r ${getStatusColor(dcr.status)} p-8 text-white`}>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-2">Change Request #{String(dcr.id).padStart(4, '0')}</h1>
              <p className="text-lg text-white/90">{dcr.document_title}</p>
            </div>
            <span className="px-6 py-3 bg-white/20 backdrop-blur-sm rounded-xl font-bold text-sm text-white border border-white/30">
              {dcr.status}
            </span>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-3 gap-6 p-8 border-t border-slate-200 bg-slate-50">
          <div>
            <p className="text-sm text-gray-600 font-bold uppercase tracking-wide">Requester</p>
            <p className="text-lg font-bold text-gray-900 mt-2 flex items-center gap-2">
              <User size={18} className="text-purple-600" />
              {dcr.requester_name}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 font-bold uppercase tracking-wide">Submitted Date</p>
            <p className="text-lg font-bold text-gray-900 mt-2 flex items-center gap-2">
              <Calendar size={18} className="text-purple-600" />
              {dcr.submitted_at ? new Date(dcr.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not submitted'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 font-bold uppercase tracking-wide">Document ID</p>
            <p className="text-lg font-bold text-gray-900 mt-2 flex items-center gap-2">
              <FileText size={18} className="text-purple-600" />
              #{dcr.document_id}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 font-bold uppercase tracking-wide">Document Level</p>
            <p className="text-lg font-bold text-gray-900 mt-2">{dcr.document_level || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 font-bold uppercase tracking-wide">Checker</p>
            <p className="text-lg font-bold text-gray-900 mt-2">{dcr.checker_name || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 font-bold uppercase tracking-wide">Approver</p>
            <p className="text-lg font-bold text-gray-900 mt-2">{dcr.approver_name || '-'}</p>
          </div>
        </div>
      </div>

      {/* Details Section */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        <button
          onClick={() => toggleSection('details')}
          className="w-full px-8 py-5 border-b border-slate-200 flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <h2 className="text-lg font-bold text-gray-900">Request Details</h2>
          {expandedSections.details ? <ChevronUp className="text-purple-600" /> : <ChevronDown className="text-slate-400" />}
        </button>
        {expandedSections.details && (
          <div className="p-8">
            <div>
              <p className="text-sm text-gray-600 font-bold uppercase tracking-wide mb-3">Reason for Change</p>
              <p className="text-gray-900 p-5 bg-slate-50 rounded-xl border border-slate-200 whitespace-pre-wrap">
                {dcr.reason}
              </p>
            </div>

            <div className="mt-6">
              <p className="text-sm text-gray-600 font-bold uppercase tracking-wide mb-3">Requester Attachments</p>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-700">Source File (Word/Excel)</span>
                  <span className="text-slate-600">{basename(latestRevision?.original_uri)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-700">PDF File</span>
                  <span className="text-slate-600">{basename(latestRevision?.pdf_uri)}</span>
                </div>
                {!latestRevision?.original_uri && !latestRevision?.pdf_uri && (
                  <p className="text-xs text-slate-500">No requester files uploaded yet.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Approvals Section */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        <button
          onClick={() => toggleSection('approvals')}
          className="w-full px-8 py-5 border-b border-slate-200 flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <h2 className="text-lg font-bold text-gray-900">Approval Timeline</h2>
          {expandedSections.approvals ? <ChevronUp className="text-purple-600" /> : <ChevronDown className="text-slate-400" />}
        </button>
        {expandedSections.approvals && (
          <div className="p-8 space-y-8">
            {/* Approval Timeline */}
            <div className="space-y-6">
              {approvals.length > 0 ? (
                approvals.map((approval, idx) => (
                  <div key={idx} className="flex gap-6">
                    <div className="flex flex-col items-center">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-lg ${
                        ['Approve', 'Approved'].includes(approval.decision) ? 'bg-gradient-to-br from-green-500 to-emerald-600' : 'bg-gradient-to-br from-red-500 to-rose-600'
                      }`}>
                        {['Approve', 'Approved'].includes(approval.decision) ? <ThumbsUp size={20} /> : <ThumbsDown size={20} />}
                      </div>
                      {idx < approvals.length - 1 && <div className="w-0.5 h-16 bg-slate-300 mt-2"></div>}
                    </div>
                    <div className="flex-1 pt-2">
                      <div className={`p-5 rounded-xl border-l-4 ${
                        ['Approve', 'Approved'].includes(approval.decision)
                          ? 'bg-green-50 border-l-green-500' 
                          : 'bg-red-50 border-l-red-500'
                      }`}>
                        <p className={`font-bold text-lg ${
                          ['Approve', 'Approved'].includes(approval.decision) ? 'text-green-900' : 'text-red-900'
                        }`}>
                          {approval.decision} by {approval.approver_name}
                        </p>
                        <p className={`text-sm mt-1 ${
                          ['Approve', 'Approved'].includes(approval.decision) ? 'text-green-700' : 'text-red-700'
                        }`}>
                          {new Date(approval.decided_at).toLocaleString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                        {approval.comments && (
                          <p className="text-gray-700 mt-3 p-3 bg-white rounded border border-slate-200 text-sm">
                            "{approval.comments}"
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-200">
                  <Clock className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium">Awaiting approval</p>
                </div>
              )}
            </div>

            {/* Action Panel */}
            {canApprove && (
              <div className="border-t border-slate-200 pt-8 space-y-4">
                <h3 className="font-bold text-gray-900 text-lg">{decisionHint}</h3>
                <textarea
                  value={decision.comments}
                  onChange={(e) => setDecision(prev => ({ ...prev, comments: e.target.value }))}
                  placeholder="Add comments for your decision..."
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-100 transition-all resize-none"
                  rows={3}
                />
                <div className="flex gap-4">
                  <button
                    onClick={() => handleApprovalDecision('Approve')}
                    disabled={actionLoading}
                    className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 text-white py-3 rounded-xl font-bold hover:shadow-lg hover:shadow-green-500/40 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <ThumbsUp size={20} />
                    Approve
                  </button>
                  <button
                    onClick={() => handleApprovalDecision('Reject')}
                    disabled={actionLoading}
                    className="flex-1 bg-gradient-to-r from-red-600 to-rose-600 text-white py-3 rounded-xl font-bold hover:shadow-lg hover:shadow-red-500/40 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <ThumbsDown size={20} />
                    Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* File Upload Section */}
      {canUploadRevision && (
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-2xl p-8">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-2xl font-bold text-blue-900 mb-2">Upload Revision</h3>
              <p className="text-blue-800">
                Request is ready for revision upload. Submit revised source + PDF to continue workflow.
              </p>
            </div>
            <Upload className="text-blue-600" size={32} />
          </div>
          <button
            onClick={() => navigate(`/dcr/${id}/upload`)}
            className="mt-6 inline-flex items-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/40 transition-all duration-300"
          >
            <Upload size={20} />
            Upload Files
          </button>
        </div>
      )}
    </div>
  );
}
