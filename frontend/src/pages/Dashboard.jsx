// frontend/src/pages/Dashboard.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { dcrAPI, documentAPI } from '../api';
import { 
  TrendingUp, FileText, AlertCircle, CheckCircle, Clock, 
  ArrowRight, Activity, Calendar, Layout, Book, Briefcase, File 
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { user } = useAuth();

  const normalizedRole = String(user?.role || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const isActionOwnerRole = ['ADMIN', 'MGR', 'MANAGER', 'QMR', 'DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER', 'PRESIDENT', 'ASSISTANT_MANAGER'].includes(normalizedRole);
  const dcrRoleContext = isActionOwnerRole ? 'manager' : 'requester';

  const normalizeCategory = (value) => {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return '';
    if (text === 'qm' || text.includes('quality manual')) return 'Quality Manual';
    if (text === 'qp' || text.includes('procedure')) return 'Procedure';
    if (text === 'wi' || text.includes('work instruction')) return 'Work Instruction';
    if (text.includes('support')) return 'Support Document';
    if (text.includes('outside')) return 'Outside Document';
    if (text.includes('operation standard')) return 'Operation Standard';
    if (text === 'fm' || text.includes('form')) return 'Form';
    if (text.includes('report')) return 'Report';
    return String(value || '').trim();
  };

  const getLevelIdFromCategory = (category) => {
    switch (category) {
      case 'Quality Manual':
        return 'L1';
      case 'Procedure':
        return 'L2';
      case 'Work Instruction':
      case 'Support Document':
      case 'Outside Document':
      case 'Operation Standard':
        return 'L3';
      case 'Form':
      case 'Report':
        return 'L4';
      default:
        return 'UNKNOWN';
    }
  };
  
  // Data states
  const [documents, setDocuments] = useState([]);
  const [dcrStats, setDcrStats] = useState({ submitted: 0, pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  
  // UI states
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const IATF_LEVELS = [
    { id: 'ALL', label: 'All Documents', icon: Layout },
    { id: 'L1', label: 'Level 1: Quality Manual', icon: Book, color: 'text-purple-600', bg: 'bg-purple-100' },
    { id: 'L2', label: 'Level 2: Procedure', icon: Briefcase, color: 'text-blue-600', bg: 'bg-blue-100' },
    { id: 'L3', label: 'Level 3: WI / Support / Outside / Ops Std.', icon: FileText, color: 'text-cyan-600', bg: 'bg-cyan-100' },
    { id: 'L4', label: 'Level 4: Form / Report', icon: File, color: 'text-slate-600', bg: 'bg-slate-100' },
  ];

  useEffect(() => {
    fetchData();
  }, [user]); // Re-fetch if user changes, though unlikely on dashboard without reload

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch DCRs for stats
      const dcrResponse = await dcrAPI.list(dcrRoleContext);
      const dcrs = dcrResponse.data.change_requests || [];

      const pendingStatuses = isActionOwnerRole
        ? ['Submitted', 'Pending Approval']
        : ['Pre-Approved', 'Returned for Revision'];

      setDcrStats({
        submitted: dcrs.filter(d => d.status === 'Submitted').length,
        pending: dcrs.filter(d => pendingStatuses.includes(d.status)).length,
        approved: dcrs.filter(d => d.status === 'Approved').length,
        rejected: dcrs.filter(d => d.status === 'Rejected').length,
      });

      // Fetch Documents
      // Assuming GET /search returns an array of documents
      const docResponse = await documentAPI.list();
      setDocuments(Array.isArray(docResponse.data) ? docResponse.data : []);
      
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Compute Document Stats
  const normalizedDocuments = useMemo(() => {
    return documents.map((doc) => {
      const category = normalizeCategory(doc.level || doc.document_type || doc.category);
      const levelId = getLevelIdFromCategory(category);
      return {
        ...doc,
        category,
        levelId
      };
    });
  }, [documents]);

  const docStats = useMemo(() => {
    return {
      total: normalizedDocuments.length,
      L1: normalizedDocuments.filter(d => d.levelId === 'L1').length,
      L2: normalizedDocuments.filter(d => d.levelId === 'L2').length,
      L3: normalizedDocuments.filter(d => d.levelId === 'L3').length,
      L4: normalizedDocuments.filter(d => d.levelId === 'L4').length,
    };
  }, [normalizedDocuments]);

  // Filter Documents for Table
  const filteredDocuments = useMemo(() => {
    return normalizedDocuments.filter(doc => {
      const matchesTab = activeTab === 'ALL' || doc.levelId === activeTab;
      const matchesSearch = doc.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            doc.doc_no?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTab && matchesSearch;
    });
  }, [normalizedDocuments, activeTab, searchQuery]);

  const StatWidget = ({ label, value, subtext, icon: Icon, colorClass }) => (
    <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-slate-500 text-sm font-medium mb-1">{label}</p>
          <h3 className="text-3xl font-bold text-slate-800">{value}</h3>
        </div>
        <div className={`p-3 rounded-lg ${colorClass} bg-opacity-10`}>
          <Icon className={`w-6 h-6 ${colorClass.replace('bg-', 'text-')}`} />
        </div>
      </div>
      {subtext && <p className="text-xs text-slate-400 font-medium">{subtext}</p>}
    </div>
  );

  if (loading) return (
    <div className="flex justify-center items-center h-[calc(100vh-100px)]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      
      {/* 1. Document Statistics Overview */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-800">Document Repository Status</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatWidget 
            label="Total Documents" 
            value={docStats.total} 
            icon={Book} 
            colorClass="bg-indigo-600" 
            subtext="Across all levels"
          />
          <StatWidget 
            label="Level 1" 
            value={docStats.L1} 
            icon={Activity} 
            colorClass="bg-purple-600"
            subtext="Quality Manual"
          />
           <StatWidget 
            label="Level 2" 
            value={docStats.L2} 
            icon={Briefcase} 
            colorClass="bg-blue-600"
            subtext="Procedures"
          />
           <StatWidget 
            label="Level 3" 
            value={docStats.L3} 
            icon={FileText} 
            colorClass="bg-cyan-600"
            subtext={<>WI, Support Document,<br />Outside Document, Operation Standard</>}
          />
           <StatWidget 
            label="Level 4" 
            value={docStats.L4} 
            icon={File} 
            colorClass="bg-slate-600"
            subtext="Form / Report"
          />
        </div>
      </section>

      {/* 2. Categorized Document Management */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden min-h-[500px] flex flex-col">
        {/* Helper Header */}
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Controlled Documents</h2>
            <p className="text-sm text-slate-500 mt-1">IATF 16949 Standard Documentation Hierarchy</p>
          </div>

          <div className="relative">
            <input 
              type="text" 
              placeholder="Search by Title or Doc No..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 w-full md:w-64 transition-all"
            />
            <div className="absolute left-3 top-2.5 text-slate-400">
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 overflow-x-auto">
          {IATF_LEVELS.map((level) => {
            const isActive = activeTab === level.id;
            const Icon = level.icon;
            return (
              <button
                key={level.id}
                onClick={() => setActiveTab(level.id)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                  isActive 
                    ? 'border-blue-600 text-blue-700 bg-blue-50/50' 
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon size={16} className={isActive ? 'text-blue-600' : 'text-slate-400'} />
                {level.label}
                <span className={`ml-2 text-xs py-0.5 px-2 rounded-full ${isActive ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                  {level.id === 'ALL' ? docStats.total : docStats[level.id]}
                </span>
              </button>
            );
          })}
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold tracking-wider">
              <tr>
                <th className="px-6 py-4">Doc No.</th>
                <th className="px-6 py-4">Title</th>
                <th className="px-6 py-4">Rev</th>
                <th className="px-6 py-4">Level</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDocuments.length > 0 ? (
                filteredDocuments.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4 font-mono text-sm font-medium text-slate-700">
                      {doc.doc_no}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-800">
                      {doc.title}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      <span className="px-2 py-1 bg-slate-100 rounded text-xs font-bold">R{doc.revision}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${
                        doc.levelId === 'L1' ? 'bg-purple-50 text-purple-700 ring-purple-600/20' :
                        doc.levelId === 'L2' ? 'bg-blue-50 text-blue-700 ring-blue-600/20' :
                        doc.levelId === 'L3' ? 'bg-cyan-50 text-cyan-700 ring-cyan-600/20' :
                        'bg-slate-50 text-slate-700 ring-slate-600/20'
                      }`}>
                        {doc.levelId === 'L1' ? 'Level 1 - Quality Manual' :
                         doc.levelId === 'L2' ? 'Level 2 - Procedure' :
                         doc.levelId === 'L3' ? `Level 3 - ${doc.category || 'Document'}` :
                         doc.levelId === 'L4' ? `Level 4 - ${doc.category || 'Document'}` :
                         (doc.category || doc.level || 'Uncategorized')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        doc.status === 'RELEASED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${doc.status === 'RELEASED' ? 'bg-green-500' : 'bg-amber-500'}`}></span>
                        {doc.status || 'Draft'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <Link 
                         to={`/documents/${doc.id}`}
                         className="text-blue-600 hover:text-blue-800 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                       >
                         View
                       </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="px-6 py-20 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-3">
                      <div className="bg-slate-50 p-4 rounded-full">
                        <FileText size={32} className="text-slate-300" />
                      </div>
                      <p>No documents found in this category.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Quick Actions / Change Request Summary (Optional Footer) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-slate-200">
         <div>
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Pending Actions</h3>
            <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-amber-100 p-2 rounded-lg text-amber-600">
                  <AlertCircle size={20} />
                </div>
                <div>
                  <p className="font-bold text-amber-900">{dcrStats.pending} Change Requests</p>
                  <p className="text-xs text-amber-700">Position-relevant pending actions</p>
                </div>
              </div>
              <Link to={`/dcr?role=${dcrRoleContext}`} className="px-4 py-2 bg-white text-amber-700 text-sm font-bold rounded-lg shadow-sm hover:shadow border border-amber-200 transition-all">
                Review
              </Link>
            </div>
         </div>
      </section>

    </div>
  );
}
