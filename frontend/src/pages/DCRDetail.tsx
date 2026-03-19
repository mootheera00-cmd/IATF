// frontend/src/pages/DCRDetail.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { dcrAPI } from '../api';
import {
  AlertCircle, CheckCircle2, Download, Upload, Clock, ArrowLeft,
  FileText, User, Calendar,
  ThumbsUp, ThumbsDown, X
} from 'lucide-react';
import DCRStepper from '../components/DCRStepper';

export default function DCRDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dcr, setDcr] = useState<any | null>(null);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const [decision, setDecision] = useState({
    action: '',
    comments: '',
  });
  const [decisionFiles, setDecisionFiles] = useState<{
    signedPdf: File | null;
    markedPdf: File | null;
    source: File | null;
  }>({
    signedPdf: null,
    markedPdf: null,
    source: null
  });
  const [nonSignedPdf, setNonSignedPdf] = useState<File | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [adminDeleteReason, setAdminDeleteReason] = useState('');
  const [activeTab, setActiveTab] = useState<'details' | 'timeline'>('details');

  useEffect(() => {
    fetchDCRDetail();
  }, [id]);

  const fetchDCRDetail = async () => {
    try {
      setLoading(true);
      const response = await dcrAPI.getDetail(id || '');
      const payload = response.data || {};
      const changeRequest = payload.change_request || payload;
      setDcr(changeRequest && changeRequest.id ? changeRequest : null);
      setApprovals(payload.approval_history || payload.approvals || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch change request');
    } finally {
      setLoading(false);
    }
  };

  const handleApprovalDecision = async (action: string) => {
    if (!decision.comments.trim() && action !== 'Approve') {
      setError('Please provide comments for this decision');
      return;
    }

    // Confirm before rejecting
    if (action === 'Reject') {
      const confirmed = window.confirm(
        `Are you sure you want to REJECT this change request?\n\nThis will return the ticket to revision. Please make sure your comments are filled in.`
      );
      if (!confirmed) return;
    }

  const needsSignedPdf = ['Pending Checker', 'Pending Approval', 'Pending Approver'].includes(dcr.status);
    if (action === 'Approve' && needsSignedPdf && !decisionFiles.signedPdf) {
      setError('Please upload signed PDF for approval');
      return;
    }

    const needsDcSource = dcr.status === 'Pending DC Review' && isDcRole;
    const hasExistingSource = Boolean(dcr.dc_source_uri || getLatestRevision()?.original_uri);
    if (action === 'Approve' && needsDcSource && !decisionFiles.source && !hasExistingSource) {
      // Source file is optional for new document approvals.
    }

    try {
      setActionLoading(true);
      setError('');
      await dcrAPI.makeDecision(id || '', action, decision.comments, {
        signedPdf: decisionFiles.signedPdf,
        markedPdf: decisionFiles.markedPdf,
        source: decisionFiles.source
      });
      setSuccess(action === 'Approve' ? 'APPROVED' : 'REJECTED');
      await fetchDCRDetail();
      setDecision({ action: '', comments: '' });
      setDecisionFiles({ signedPdf: null, markedPdf: null, source: null });
    } catch (err: any) {
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
      await dcrAPI.submit(id || '');
      setSuccess('Draft submitted successfully. Notifications have been sent.');
      await fetchDCRDetail();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit draft change request');
      setSuccess('');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadDcSource = async () => {
    try {
      setActionLoading(true);
      setError('');
      const response = await dcrAPI.getSourceDownloadLink(id || '');
      const link = response.data?.downloadLink;
      if (!link) {
        throw new Error('Download link not available');
      }
      window.open(link, '_blank');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to download source file');
    } finally {
      setActionLoading(false);
    }
  };

  // toggleSection no longer used — sections replaced with tabs

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'Draft': 'from-slate-500 to-slate-600',
  'Pending DC Review': 'from-blue-500 to-blue-600',
  'Pending Revision': 'from-cyan-500 to-blue-600',
  'Returned for Revision': 'from-rose-500 to-red-600',
  'Pending Approval': 'from-amber-500 to-orange-600',
  'Pending Checker': 'from-amber-500 to-orange-600',
  'Pending Approver': 'from-indigo-500 to-violet-600',
  'Pending Non-Sign PDF': 'from-emerald-500 to-teal-600',
  'Pending Final DC Release': 'from-sky-600 to-blue-700',
      'Closed': 'from-slate-400 to-slate-500',
      'Pre-Approved': 'from-green-500 to-emerald-600',
      'Revision Pending': 'from-orange-500 to-red-600',
      'Approved': 'from-green-500 to-emerald-600',
      'Rejected': 'from-red-500 to-rose-600',
      'Released': 'from-purple-500 to-indigo-600',
      'Delete Requested': 'from-orange-500 to-amber-600',
      'Deleted': 'from-slate-500 to-slate-700',
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

  const basename = (value?: string) => {
    if (!value) return '-';
    return String(value).split('\\').pop()?.split('/').pop();
  };

  const formatRoleLabel = (value?: string) => {
    const normalized = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/_/g, ' ');
    if (!normalized) return '';
    if (normalized.includes('document')) return 'Document Control';
    if (normalized.includes('checker')) return 'Checker';
    if (normalized.includes('approver')) return 'Approver';
    return normalized.replace(/\b\w/g, (m) => m.toUpperCase());
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

  const normalizedRole = String((user as any)?.role || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const isDcRole = ['DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER', 'ADMIN'].includes(normalizedRole);
  const isAdmin = normalizedRole === 'ADMIN';
  const isRequester = dcr.requester_id === (user as any)?.id;
  const isReuploadAssignee = dcr.reupload_assignee_id && Number(dcr.reupload_assignee_id) === Number((user as any)?.id);
  const isChecker = Number(dcr.checker_id) === Number((user as any)?.id);
  const isApprover = Number(dcr.approver_id) === Number((user as any)?.id);
  const canSubmitDraft = isRequester && dcr.status === 'Draft';
  const canApprove =
    !isRequester && (
      (isDcRole && ['Pending DC Review', 'Pending Final DC Release'].includes(dcr.status)) ||
      (isChecker && ['Pending Checker', 'Pending Approval'].includes(dcr.status)) ||
      (isApprover && dcr.status === 'Pending Approver')
    );
  const canUploadRevision = (isRequester || isReuploadAssignee) && ['Pending Revision', 'Pre-Approved', 'Returned for Revision'].includes(dcr.status);
  const canUploadNonSignedPdf = isRequester && dcr.status === 'Pending Non-Sign PDF';
  const canCloseTicket = isRequester && ['Pending Revision', 'Returned for Revision'].includes(dcr.status);
  const canRequestDelete = isRequester && !['Deleted', 'Delete Requested'].includes(dcr.status);
  const canApproveDelete = isAdmin && dcr.status === 'Delete Requested';
  const canAdminDeleteDirect = isAdmin && !['Deleted', 'Delete Requested'].includes(dcr.status);
  const canReviewRevisionFiles = (isChecker || isApprover || isDcRole)
    && ['Pending Checker', 'Pending Approval', 'Pending Approver', 'Pending Final DC Release'].includes(dcr.status);
  const decisionHint = dcr.status === 'Pending DC Review'
    ? 'Document Control decision'
    : dcr.status === 'Pending Checker' || dcr.status === 'Pending Approval'
      ? 'Checker decision'
      : dcr.status === 'Pending Approver'
        ? 'Approver decision'
  : dcr.status === 'Pending Non-Sign PDF'
    ? 'Requester uploads non-signed PDF'
        : dcr.status === 'Pending Final DC Release'
          ? 'Final Document Control decision'
          : 'Decision';
  const latestRevision = getLatestRevision();
  const canDownloadSource = isRequester
    && ['Pending Revision', 'Returned for Revision'].includes(dcr.status)
    && Boolean(dcr.dc_source_uri || latestRevision?.original_uri);
  const requiresSignedPdf = ['Pending Checker', 'Pending Approval', 'Pending Approver'].includes(dcr.status);
  const currentActorLabel = isRequester
    ? 'Requester'
    : isChecker
      ? 'Checker'
      : isApprover
        ? 'Approver'
        : isDcRole
          ? 'DC'
          : String((user as any)?.role || 'User');

  const canDownloadMarkedPdf = isRequester && dcr?.marked_pdf_downloads;
  const handleDownloadMarkedPdf = (url?: string) => {
    if (!url) return;
    window.open(url, '_blank');
  };

  const docInfoLabel = `${dcr.doc_number || dcr.doc_no || dcr.document_id || '-'} | ${dcr.document_level || '-'} | Rev ${latestRevision?.rev_code || latestRevision?.revision_number || '-'}`;

  const handleDownloadRevisionFiles = async () => {
    try {
      setActionLoading(true);
      setError('');
      const response = await dcrAPI.getRevisionDownloadLinks(id || '');
      const sourceLink = response.data?.source;
      const pdfLink = response.data?.pdf;
      if (!sourceLink && !pdfLink) {
        throw new Error('Download links not available');
      }
      if (sourceLink) window.open(sourceLink, '_blank');
      if (pdfLink) window.open(pdfLink, '_blank');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to download revision files');
    } finally {
      setActionLoading(false);
    }
  };

  const handleViewRevisionPdf = async () => {
    try {
      setActionLoading(true);
      setError('');
      const response = await dcrAPI.getRevisionDownloadLinks(id || '');
      const pdfLink = response.data?.pdf;
      if (!pdfLink) {
        throw new Error('PDF file not available for viewing');
      }
      const inlineLink = `${pdfLink}${pdfLink.includes('?') ? '&' : '?'}disposition=inline`;
      window.open(inlineLink, '_blank');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to view PDF');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadRevisionPdf = async () => {
    try {
      setActionLoading(true);
      setError('');
      const response = await dcrAPI.getRevisionDownloadLinks(id || '');
      const pdfLink = response.data?.pdf;
      if (!pdfLink) {
        throw new Error('PDF file not available for download');
      }
      window.open(pdfLink, '_blank');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to download PDF');
    } finally {
      setActionLoading(false);
    }
  };


  const handleUploadNonSignedPdf = async () => {
    if (!nonSignedPdf) {
      setError('Please select a non-signed PDF file');
      return;
    }

    try {
      setActionLoading(true);
      setError('');
      const formData = new FormData();
      formData.append('non_signed_pdf', nonSignedPdf);
      await dcrAPI.uploadNonSignedPdf(id || '', formData);
      setSuccess('Non-signed PDF uploaded successfully. Sent to Document Control for final release.');
      setNonSignedPdf(null);
      await fetchDCRDetail();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to upload non-signed PDF');
      setSuccess('');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloseTicket = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to CLOSE this ticket?\n\nThis will end the workflow without completing the revision. This cannot be undone.'
    );
    if (!confirmed) return;
    try {
      setActionLoading(true);
      setError('');
      await dcrAPI.closeTicket(id || '');
      setSuccess('Change request closed successfully.');
      await fetchDCRDetail();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to close change request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestDelete = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to request deletion of this change request?\n\nAn admin will need to approve the deletion.'
    );
    if (!confirmed) return;
    try {
      setActionLoading(true);
      setError('');
      await dcrAPI.requestDelete(id || '', deleteReason || undefined);
      setSuccess('Delete request sent to admin for approval.');
      setDeleteReason('');
      await fetchDCRDetail();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to request delete');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveDelete = async () => {
    const label = canApproveDelete ? 'approve this deletion request' : 'permanently delete this change request';
    const confirmed = window.confirm(
      `Are you sure you want to ${label}?\n\nThis action cannot be undone.`
    );
    if (!confirmed) return;
    try {
      setActionLoading(true);
      setError('');
      await dcrAPI.approveDelete(id || '', adminDeleteReason || undefined);
      setSuccess('Change request deleted successfully.');
      setAdminDeleteReason('');
      await fetchDCRDetail();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete change request');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Top Bar ──────────────────────────────────────────────────────────── */}
      <div className={`bg-gradient-to-r ${getStatusColor(dcr.status)} px-4 py-3 rounded-xl mb-3 shadow`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate('/dcr')}
              className="text-white/80 hover:text-white transition-colors flex-shrink-0"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <p className="text-white/70 text-xs font-medium">Change Request</p>
              <h1 className="text-white font-bold text-base leading-tight truncate">
                #{String(dcr.id).padStart(4, '0')} — {dcr.document_title}
              </h1>
            </div>
          </div>
          <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-lg font-bold text-xs text-white border border-white/30 flex-shrink-0">
            {dcr.status}
          </span>
        </div>
      </div>

      {/* ── Alerts (toast-style, dismissible) ────────────────────────────────── */}
      {error && (
        <div className="mb-2 bg-red-50 border border-red-300 rounded-lg px-3 py-2 flex items-center gap-2 text-sm">
          <AlertCircle className="text-red-500 flex-shrink-0" size={15} />
          <span className="text-red-800 flex-1">{error}</span>
          <button onClick={() => setError('')}><X size={14} className="text-red-400 hover:text-red-600" /></button>
        </div>
      )}
      {success && (
        <div className="mb-2 bg-green-50 border border-green-300 rounded-lg px-3 py-2 flex items-center gap-2 text-sm">
          <CheckCircle2 className="text-green-500 flex-shrink-0" size={15} />
          <span className="text-green-800 flex-1">{success}</span>
          <button onClick={() => setSuccess('')}><X size={14} className="text-green-400 hover:text-green-600" /></button>
        </div>
      )}

      {/* ── Stepper ──────────────────────────────────────────────────────────── */}
      <div className="mb-3">
        <DCRStepper currentStatus={dcr.status} history={approvals} />
      </div>

      {/* ── Main Two-Column Grid ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 flex-1 min-h-0">

        {/* ── LEFT: Meta info + tabbed content ─────────────────────────────── */}
        <div className="lg:col-span-3 flex flex-col gap-3 min-h-0">

          {/* Meta card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Requester</p>
                <p className="font-semibold text-slate-800 flex items-center gap-1 mt-0.5">
                  <User size={13} className="text-purple-500" />{dcr.requester_name || '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Submitted</p>
                <p className="font-semibold text-slate-800 flex items-center gap-1 mt-0.5">
                  <Calendar size={13} className="text-purple-500" />
                  {dcr.submitted_at
                    ? new Date(dcr.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'Not submitted'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Doc ID</p>
                <p className="font-semibold text-slate-800 flex items-center gap-1 mt-0.5">
                  <FileText size={13} className="text-purple-500" />#{dcr.document_id}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Level</p>
                <p className="font-semibold text-slate-800 mt-0.5">{dcr.document_level || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Checker</p>
                <p className="font-semibold text-slate-800 mt-0.5">{dcr.checker_name || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Approver</p>
                <p className="font-semibold text-slate-800 mt-0.5">{dcr.approver_name || '-'}</p>
              </div>
            </div>
          </div>

          {/* Tabbed panel: Details | Timeline */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Tab headers */}
            <div className="flex border-b border-slate-200 text-sm font-semibold flex-shrink-0">
              <button
                onClick={() => setActiveTab('details')}
                className={`flex-1 py-2.5 transition-colors ${activeTab === 'details' ? 'text-purple-700 border-b-2 border-purple-600 bg-purple-50' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Details & Files
              </button>
              <button
                onClick={() => setActiveTab('timeline')}
                className={`flex-1 py-2.5 transition-colors ${activeTab === 'timeline' ? 'text-purple-700 border-b-2 border-purple-600 bg-purple-50' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Approval Timeline {approvals.length > 0 && <span className="ml-1 text-xs bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-full">{approvals.length}</span>}
              </button>
            </div>

            {/* Tab body — scrollable */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">

              {activeTab === 'details' && (
                <>
                  {/* Reason */}
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Reason for Change</p>
                    <p className="text-slate-800 bg-slate-50 rounded-lg border border-slate-200 p-3 whitespace-pre-wrap text-sm leading-relaxed">
                      {dcr.reason}
                    </p>
                  </div>

                  {/* DC Source */}
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">DC Source File</p>
                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-700">Word/Excel</span>
                        <span className="text-slate-500 text-xs truncate max-w-[180px]">
                          {basename(dcr.dc_source_name || dcr.dc_source_uri || latestRevision?.original_uri) || '—'}
                        </span>
                      </div>
                      {canDownloadSource && (
                        <button onClick={handleDownloadDcSource} disabled={actionLoading}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-800 disabled:opacity-50">
                          <Download size={13} /> Download source
                        </button>
                      )}
                      {!dcr.dc_source_uri && !latestRevision?.original_uri && (
                        <p className="text-xs text-slate-400">No DC source file yet.</p>
                      )}
                    </div>
                  </div>

                  {/* Requester attachments */}
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Requester Attachments</p>
                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-700">Source (Word/Excel)</span>
                        <span className="text-slate-500 text-xs truncate max-w-[180px]">{basename(latestRevision?.original_uri) || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-700">PDF</span>
                        <span className="text-slate-500 text-xs truncate max-w-[180px]">{basename(latestRevision?.pdf_uri) || '—'}</span>
                      </div>
                      {canReviewRevisionFiles && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button onClick={handleViewRevisionPdf} disabled={actionLoading}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-50">
                            <Download size={13} /> View PDF
                          </button>
                          <button onClick={handleDownloadRevisionPdf} disabled={actionLoading}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-800 disabled:opacity-50">
                            <Download size={13} /> Download PDF
                          </button>
                          <button onClick={handleDownloadRevisionFiles} disabled={actionLoading}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 disabled:opacity-50">
                            <Download size={13} /> Word+PDF
                          </button>
                        </div>
                      )}
                      {canDownloadMarkedPdf && (
                        <div className="pt-2 border-t border-slate-200 space-y-1">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Marked PDFs</p>
                          <div className="flex flex-wrap gap-2">
                            {dcr.marked_pdf_downloads?.checker && (
                              <button onClick={() => handleDownloadMarkedPdf(dcr.marked_pdf_downloads?.checker)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:text-rose-800">
                                <Download size={13} /> Checker
                              </button>
                            )}
                            {dcr.marked_pdf_downloads?.approver && (
                              <button onClick={() => handleDownloadMarkedPdf(dcr.marked_pdf_downloads?.approver)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:text-rose-800">
                                <Download size={13} /> Approver
                              </button>
                            )}
                            {dcr.marked_pdf_downloads?.dc && (
                              <button onClick={() => handleDownloadMarkedPdf(dcr.marked_pdf_downloads?.dc)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:text-rose-800">
                                <Download size={13} /> DC
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      {!latestRevision?.original_uri && !latestRevision?.pdf_uri && (
                        <p className="text-xs text-slate-400">No files uploaded yet.</p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'timeline' && (
                <div className="space-y-3">
                  {approvals.length > 0 ? (
                    approvals.map((approval, idx) => {
                      const isApproved = ['Approve', 'Approved'].includes(approval.decision);
                      return (
                        <div key={idx} className={`rounded-lg border-l-4 p-3 ${isApproved ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white flex-shrink-0 ${isApproved ? 'bg-green-500' : 'bg-red-500'}`}>
                                {isApproved ? <ThumbsUp size={12} /> : <ThumbsDown size={12} />}
                              </div>
                              <p className={`font-bold text-sm ${isApproved ? 'text-green-900' : 'text-red-900'}`}>
                                {approval.decision} — {formatRoleLabel(approval.approver_role || approval.decided_by_role || approval.stage)} {approval.approver_name || ''}
                              </p>
                            </div>
                            <p className={`text-xs flex-shrink-0 ${isApproved ? 'text-green-600' : 'text-red-600'}`}>
                              {new Date(approval.decided_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          {approval.comments && (
                            <p className="mt-2 text-gray-700 bg-white rounded border border-slate-200 px-2 py-1.5 text-xs">"{approval.comments}"</p>
                          )}
                          <div className="flex gap-3 mt-1.5">
                            {isApproved && approval.decision_signed_pdf_download && (
                              <button onClick={() => handleDownloadMarkedPdf(approval.decision_signed_pdf_download)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800">
                                <Download size={12} /> Signed PDF
                              </button>
                            )}
                            {!isApproved && approval.decision_marked_pdf_download && (
                              <button onClick={() => handleDownloadMarkedPdf(approval.decision_marked_pdf_download)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:text-rose-800">
                                <Download size={12} /> Marked PDF
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8 bg-slate-50 rounded-lg border border-slate-200">
                      <Clock className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <p className="text-slate-500 text-sm">Awaiting first decision</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Action Panel ──────────────────────────────────────────── */}
        <div className="lg:col-span-2 flex flex-col gap-3">

          {/* Status info mini-card */}
          <div className="bg-slate-900 text-slate-100 rounded-xl p-3 shadow text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-400 font-semibold uppercase tracking-wide">Next Step</span>
              <span className="text-slate-200 text-right max-w-[60%]">{decisionHint === 'Decision' ? 'Awaiting action' : decisionHint}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-semibold uppercase tracking-wide">Actor</span>
              <span className="text-slate-200">{currentActorLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-semibold uppercase tracking-wide">Doc</span>
              <span className="text-slate-200 text-right max-w-[60%] truncate">{docInfoLabel}</span>
            </div>
          </div>

          {/* Actions scroll area */}
          <div className="flex flex-col gap-2 overflow-y-auto flex-1">

            {/* Submit Draft */}
            {canSubmitDraft && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="font-bold text-amber-900 text-sm mb-1">Submit Draft</p>
                <p className="text-amber-700 text-xs mb-2">Notify Document Control and start the workflow.</p>
                <button onClick={handleSubmitDraft} disabled={actionLoading}
                  className="w-full bg-amber-500 text-white py-2 rounded-lg font-bold text-sm hover:bg-amber-600 transition disabled:opacity-50">
                  Submit Draft
                </button>
              </div>
            )}

            {/* Upload Revision */}
            {canUploadRevision && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="font-bold text-blue-900 text-sm mb-1 flex items-center gap-1.5"><Upload size={14} /> Upload Revision</p>
                <p className="text-blue-700 text-xs mb-2">
                  Submit revised source + PDF to continue.
                  {dcr.request_type === 'REUPLOAD' && <span className="block mt-0.5">Re-upload by {dcr.reupload_requested_by_name || 'Requester'}.</span>}
                </p>
                <button onClick={() => navigate(`/dcr/${id}/upload`)} disabled={actionLoading}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold text-sm hover:bg-blue-700 transition disabled:opacity-50">
                  Go to Upload
                </button>
              </div>
            )}

            {/* Upload Non-Signed PDF */}
            {canUploadNonSignedPdf && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
                <p className="font-bold text-emerald-900 text-sm flex items-center gap-1.5"><Upload size={14} /> Non-Signed PDF</p>
                <p className="text-emerald-700 text-xs">Upload for final DC review.</p>
                <input type="file" accept="application/pdf" onChange={(e) => setNonSignedPdf(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-slate-700 file:mr-2 file:rounded file:border-0 file:bg-emerald-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-emerald-700" />
                {nonSignedPdf && <p className="text-xs text-emerald-600 truncate">{nonSignedPdf.name}</p>}
                <button onClick={handleUploadNonSignedPdf} disabled={actionLoading || !nonSignedPdf}
                  className="w-full bg-emerald-600 text-white py-2 rounded-lg font-bold text-sm hover:bg-emerald-700 transition disabled:opacity-50">
                  Upload
                </button>
              </div>
            )}

            {/* Approve / Reject panel */}
            {canApprove && (
              <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2 shadow-sm">
                <p className="font-bold text-slate-800 text-sm">{decisionHint}</p>
                <textarea
                  value={decision.comments}
                  onChange={(e) => setDecision(prev => ({ ...prev, comments: e.target.value }))}
                  placeholder="Comments for your decision…"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 resize-none"
                  rows={3}
                />
                {isDcRole && dcr.status === 'Pending DC Review' && (
                  <div>
                    <p className="text-xs font-bold text-slate-600 mb-1">Source file for requester</p>
                    <input type="file" accept=".doc,.docx,.xls,.xlsx"
                      onChange={(e) => setDecisionFiles(p => ({ ...p, source: e.target.files?.[0] || null }))}
                      className="block w-full text-xs text-slate-700 file:mr-2 file:rounded file:border-0 file:bg-blue-600 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white hover:file:bg-blue-700" />
                    {decisionFiles.source && <p className="text-xs text-slate-500 truncate mt-0.5">{decisionFiles.source.name}</p>}
                  </div>
                )}
                {requiresSignedPdf && (
                  <div>
                    <p className="text-xs font-bold text-slate-600 mb-1">Signed PDF <span className="text-red-500">*</span></p>
                    <input type="file" accept="application/pdf"
                      onChange={(e) => setDecisionFiles(p => ({ ...p, signedPdf: e.target.files?.[0] || null }))}
                      className="block w-full text-xs text-slate-700 file:mr-2 file:rounded file:border-0 file:bg-purple-600 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white hover:file:bg-purple-700" />
                    {decisionFiles.signedPdf && <p className="text-xs text-slate-500 truncate mt-0.5">{decisionFiles.signedPdf.name}</p>}
                  </div>
                )}
                <div>
                  <p className="text-xs font-bold text-slate-600 mb-1">Marked PDF <span className="text-slate-400">(optional)</span></p>
                  <input type="file" accept="application/pdf"
                    onChange={(e) => setDecisionFiles(p => ({ ...p, markedPdf: e.target.files?.[0] || null }))}
                    className="block w-full text-xs text-slate-700 file:mr-2 file:rounded file:border-0 file:bg-slate-600 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white hover:file:bg-slate-700" />
                  {decisionFiles.markedPdf && <p className="text-xs text-slate-500 truncate mt-0.5">{decisionFiles.markedPdf.name}</p>}
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => handleApprovalDecision('Approve')} disabled={actionLoading}
                    className="flex-1 bg-green-600 text-white py-2 rounded-lg font-bold text-sm hover:bg-green-700 transition disabled:opacity-50 flex items-center justify-center gap-1.5">
                    <ThumbsUp size={15} /> Approve
                  </button>
                  <button onClick={() => handleApprovalDecision('Reject')} disabled={actionLoading}
                    className="flex-1 bg-red-600 text-white py-2 rounded-lg font-bold text-sm hover:bg-red-700 transition disabled:opacity-50 flex items-center justify-center gap-1.5">
                    <ThumbsDown size={15} /> Reject
                  </button>
                </div>
              </div>
            )}

            {/* Close ticket */}
            {canCloseTicket && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="font-bold text-slate-800 text-sm mb-1">Close Ticket</p>
                <p className="text-slate-500 text-xs mb-2">End the workflow without completing the revision.</p>
                <button onClick={handleCloseTicket} disabled={actionLoading}
                  className="w-full bg-slate-700 text-white py-2 rounded-lg font-bold text-sm hover:bg-slate-800 transition disabled:opacity-50">
                  Close Ticket
                </button>
              </div>
            )}

            {/* Request delete */}
            {canRequestDelete && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 space-y-2">
                <p className="font-bold text-rose-900 text-sm">Request Deletion</p>
                <input value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="w-full px-3 py-1.5 border border-rose-200 rounded-lg text-xs focus:outline-none focus:border-rose-500" />
                <button onClick={handleRequestDelete} disabled={actionLoading}
                  className="w-full bg-rose-600 text-white py-2 rounded-lg font-bold text-sm hover:bg-rose-700 transition disabled:opacity-50">
                  Request Delete
                </button>
              </div>
            )}

            {/* Admin delete */}
            {(canApproveDelete || canAdminDeleteDirect) && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                <p className="font-bold text-orange-900 text-sm">Admin Delete</p>
                <input value={adminDeleteReason} onChange={(e) => setAdminDeleteReason(e.target.value)}
                  placeholder="Admin reason (optional)"
                  className="w-full px-3 py-1.5 border border-orange-200 rounded-lg text-xs focus:outline-none focus:border-orange-500" />
                <button onClick={handleApproveDelete} disabled={actionLoading}
                  className="w-full bg-orange-600 text-white py-2 rounded-lg font-bold text-sm hover:bg-orange-700 transition disabled:opacity-50">
                  {canApproveDelete ? 'Approve Delete' : 'Delete Now'}
                </button>
              </div>
            )}

            {/* No action available */}
            {!canApprove && !canSubmitDraft && !canUploadRevision && !canUploadNonSignedPdf && !canCloseTicket && !canRequestDelete && !canApproveDelete && !canAdminDeleteDirect && (
              <div className="text-center py-6 bg-slate-50 rounded-xl border border-slate-200">
                <Clock className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-slate-500 text-sm font-medium">No action required</p>
                <p className="text-slate-400 text-xs mt-1">Waiting for another party to act.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
