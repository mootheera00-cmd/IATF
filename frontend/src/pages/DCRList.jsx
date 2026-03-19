// frontend/src/pages/DCRList.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { dcrAPI } from '../api';
import { Plus, Filter, Search, AlertCircle, RefreshCw } from 'lucide-react';

export default function DCRList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [dcrs, setDcrs] = useState([]);
  const [filteredDcrs, setFilteredDcrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [filters, setFilters] = useState({
    category: 'All',
    search: '',
  });

  useEffect(() => {
    fetchDCRs();
  }, [user?.role, searchParams]);

  const fetchDCRs = async () => {
    try {
      setLoading(true);
      const roleFromQuery = searchParams.get('role');
      const statusFromQuery = searchParams.get('status');
      const requestedRole = roleFromQuery || 'all';

      const response = await dcrAPI.list(requestedRole);
      let items = response.data.change_requests || [];

      if (statusFromQuery) {
        items = items.filter((item) => String(item.status || '').toLowerCase() === String(statusFromQuery).toLowerCase());
      }

      setDcrs(items);
      setFilteredDcrs(items);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch change requests');
    } finally {
      setLoading(false);
    }
  };

  const categoryOptions = [
    'All',
    'Quality Manual',
    'Procedure',
    'Work Instruction',
    'Support Document',
    'Outside Document',
    'Operation Standard',
    'Form',
    'Report'
  ];

  const normalizeCategory = (value) => {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return '';
    if (text.includes('quality manual') || text === 'qm') return 'Quality Manual';
    if (text.includes('procedure')) return 'Procedure';
    if (text.includes('work instruction') || text === 'wi' || text.includes('wi ')) return 'Work Instruction';
    if (text.includes('support')) return 'Support Document';
    if (text.includes('outside')) return 'Outside Document';
    if (text.includes('operation standard')) return 'Operation Standard';
    if (text.includes('form')) return 'Form';
    if (text.includes('report')) return 'Report';
    return value;
  };

  const formatDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getStatusWithActionDates = (dcr) => {
    return `Request; ${formatDate(dcr.submitted_at || dcr.created_at)} | Reject; ${formatDate(dcr.rejected_at)} | Approve; ${formatDate(dcr.final_approved_at || dcr.preapproved_at)}`;
  };

  const applyFilters = (dcrs) => {
    let result = dcrs;

    // Filter by category
    if (filters.category !== 'All') {
      result = result.filter((dcr) => normalizeCategory(dcr.document_category || dcr.level) === filters.category);
    }

    // Search by document number
    if (filters.search) {
      const query = filters.search.toLowerCase();
      result = result.filter(dcr =>
        (dcr.doc_no || dcr.doc_number || '').toLowerCase().includes(query)
      );
    }

    return result;
  };

  useEffect(() => {
    setFilteredDcrs(applyFilters(dcrs));
  }, [filters, dcrs]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'Approved':
        return 'bg-green-100 text-green-700 border border-green-200';
      case 'Rejected':
        return 'bg-red-100 text-red-700 border border-red-200';
      case 'Pending Approval':
        return 'bg-amber-100 text-amber-700 border border-amber-200';
      case 'Pending Checker Approval':
        return 'bg-amber-100 text-amber-700 border border-amber-200';
      case 'Pending Approver Approval':
        return 'bg-indigo-100 text-indigo-700 border border-indigo-200';
      case 'Pending DC Final Approval':
        return 'bg-sky-100 text-sky-700 border border-sky-200';
      case 'Submitted':
        return 'bg-blue-100 text-blue-700 border border-blue-200';
      case 'DC Approved':
        return 'bg-cyan-100 text-cyan-700 border border-cyan-200';
      case 'Released':
        return 'bg-purple-100 text-purple-700 border border-purple-200';
      default:
        return 'bg-slate-100 text-slate-700 border border-slate-200';
    }
  };

  const getWorkflowStepByStatus = (status) => {
    switch ((status || '').toLowerCase()) {
      case 'draft':
      case 'submitted':
        return 1;
      case 'dc approved':
        return 2;
      case 'pre-approved':
      case 'returned for revision':
      case 'rejected':
        return 2;
      case 'pending approval':
      case 'pending checker approval':
        return 3;
      case 'pending approver approval':
        return 4;
      case 'pending dc final approval':
        return 4;
      case 'approved':
      case 'released':
        return 4;
      case 'effective':
        return 5;
      default:
        return 1;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header with Create Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Change Requests</h1>
          <p className="text-gray-600 mt-1">
            All change requests from all users and all IDs are shown collectively. Press Refresh to update history.
          </p>
          <p className="text-sm text-purple-700 mt-1 font-medium">Click any row in the history table to open workflow popup.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchDCRs}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-all duration-200"
          >
            <RefreshCw size={20} />
            Refresh
          </button>
          <button
            onClick={() => navigate('/dcr/create')}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:shadow-lg hover:shadow-purple-500/40 transition-all duration-300"
          >
            <Plus size={20} />
            Change Request
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6 hover:shadow-lg transition-shadow duration-300">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-4 top-4 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Search by document number..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="w-full pl-12 pr-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-100 transition-all"
            />
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-3">
            <Filter className="text-slate-400" size={20} />
            <select
              value={filters.category}
              onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
              className="flex-1 px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-100 transition-all font-medium text-gray-900"
            >
              {categoryOptions.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 flex gap-3">
          <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
          <p className="text-red-800 font-medium">{error}</p>
        </div>
      )}

      {/* DCR Table */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-200 hover:shadow-xl transition-shadow duration-300">
        {loading ? (
          <div className="p-16 text-center">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-slate-200 border-t-purple-600 mb-4"></div>
            <p className="text-gray-600 font-medium">Loading change requests...</p>
          </div>
        ) : filteredDcrs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                  <th className="px-8 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wide">No.</th>
                  <th className="px-8 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wide">Document No.</th>
                  <th className="px-8 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wide">Document Name</th>
                  <th className="px-8 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wide">Reason</th>
                  <th className="px-8 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wide">Status (Request; Date, Reject; Date, Approve; Date)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-8 text-center text-slate-500">Loading change requests...</td>
                  </tr>
                ) : filteredDcrs.map((dcr) => (
                  <tr
                    key={dcr.id}
                    onClick={() => setSelectedHistory(dcr)}
                    className="hover:bg-slate-50 transition-colors duration-200 group cursor-pointer"
                  >
                    <td className="px-8 py-5 text-sm font-semibold text-purple-700 underline">{String(dcr.id || '').padStart(4, '0')}</td>
                    <td className="px-8 py-5 text-sm font-mono text-slate-700">{dcr.doc_no || dcr.doc_number || '-'}</td>
                    <td className="px-8 py-5 text-sm font-medium text-gray-900 max-w-xs truncate">
                      {dcr.title || dcr.document_title || 'Document'}
                    </td>
                    <td className="px-8 py-5 text-sm text-gray-700 max-w-sm truncate">
                      {dcr.reason || '-'}
                    </td>
                    <td className="px-8 py-5 text-sm text-gray-700">
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1.5 rounded-lg text-xs font-bold ${getStatusColor(dcr.status)}`}>
                          {dcr.status}
                        </span>
                        <span className="text-xs text-slate-600">{getStatusWithActionDates(dcr)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-16 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-slate-100 rounded-full mb-4">
              <Filter className="w-10 h-10 text-slate-400" />
            </div>
            <p className="text-gray-900 font-bold text-lg mb-2">
              {dcrs.length === 0 ? 'No change requests yet' : 'No results match your filters'}
            </p>
            <p className="text-gray-600">
              {dcrs.length === 0 
                ? 'Create your first change request to get started' 
                : 'Try adjusting your search or filter criteria'}
            </p>
          </div>
        )}
      </div>

      {selectedHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-5xl max-h-[95vh] overflow-auto bg-white rounded-2xl shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Change Request Workflow</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Request #{String(selectedHistory.id || '').padStart(4, '0')} · {selectedHistory.doc_no || selectedHistory.doc_number || '-'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHistory(null)}
                className="px-3 py-2 text-sm font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-sm text-gray-700">
                  Current request status: <span className="font-bold text-purple-700">{selectedHistory.status || '-'}</span>
                </p>
                <p className="text-sm text-gray-700 mt-1">
                  {getStatusWithActionDates(selectedHistory)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="overflow-x-auto">
                  <div className="w-full min-w-[680px]">
                    {(() => {
                      const currentStep = getWorkflowStepByStatus(selectedHistory.status);
                      const steps = [
                        { title: 'Submit Request', desc: 'Create and submit change request' },
                        { title: 'DC Initial', desc: 'Document Control approve/reject request' },
                        { title: 'Checker Review', desc: 'Selected checker approve/reject revised files' },
                        { title: 'Approver Review', desc: 'Auto-assigned approver approve/reject' },
                        { title: 'Released', desc: 'Revision released for use' }
                      ];

                      return (
                        <div className="space-y-4">
                          <div className="flex items-center">
                            {steps.map((step, index) => {
                              const stepNo = index + 1;
                              const isDone = currentStep > stepNo;
                              const isCurrent = currentStep === stepNo;
                              const isActive = currentStep >= stepNo;

                              return (
                                <React.Fragment key={step.title}>
                                  <div className="flex flex-col items-center w-[140px]">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 ${isDone ? 'bg-purple-600 border-purple-600 text-white' : isCurrent ? 'bg-white border-purple-600 text-purple-700' : isActive ? 'bg-purple-100 border-purple-300 text-purple-700' : 'bg-white border-slate-300 text-slate-500'}`}>
                                      {isDone ? '✓' : stepNo}
                                    </div>
                                  </div>
                                  {index < steps.length - 1 && (
                                    <div className={`h-1 flex-1 rounded ${currentStep > stepNo ? 'bg-purple-600' : 'bg-slate-300'}`}></div>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </div>

                          <div className="flex items-start">
                            {steps.map((step, index) => {
                              const stepNo = index + 1;
                              const isActive = currentStep >= stepNo;
                              return (
                                <React.Fragment key={step.title}>
                                  <div className="w-10"></div>
                                  {index < steps.length - 1 ? (
                                    <div className="flex-1 px-2 text-center">
                                      <p className={`text-xs font-bold ${isActive ? 'text-gray-900' : 'text-slate-500'}`}>{step.title}</p>
                                      <p className="text-[11px] text-slate-500 mt-1 leading-4">{step.desc}</p>
                                    </div>
                                  ) : (
                                    <div className="w-10"></div>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
