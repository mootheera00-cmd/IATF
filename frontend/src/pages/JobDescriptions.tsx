import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Briefcase, Users, GraduationCap, Award, ChevronDown, ChevronUp, Shield, Edit3, Bell, Check, XCircle, ClipboardList } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { genericEditRequestAPI } from '../api';

/* ──────────────────── Data ──────────────────── */

interface JobDescription {
  id: string;
  titleTH: string;
  titleEN: string;
  group: string;
  division: string;
  department: string;
  reportsTo: string;
  subordinates: string;
  effectiveDate: string;
  revision: number;
  jobPurpose: string[];
  responsibilities: { category: string; detail: string }[];
  authority: string[];
  education: string;
  major: string;
  certification: string;
  experience: string;
  knowledge: string[];
  skills: string[];
}

const jobDescriptions: JobDescription[] = [
  {
    id: 'group-manager',
    titleTH: 'ผู้จัดการกลุ่ม',
    titleEN: 'Group Manager',
    group: 'Auto/Chassis Bearing',
    division: '-',
    department: '-',
    reportsTo: 'President',
    subordinates: 'Engineer Class1, 2, Senior Engineer, Asst. Manager',
    effectiveDate: '2018-02-14',
    revision: 0,
    jobPurpose: [
      'Coordinate issue items, requirement items with T-NSK and customers',
      'Make project plan and proceed project based on plan (Including global project)',
      'Improve working environment of APTC',
      'Plan for education to NSK product internal and external',
      'Decide/Plan for group policy of operation',
    ],
    responsibilities: [
      { category: 'Performing task', detail: 'Coordinate issue items, requirement items with T-NSK and customers' },
      { category: 'Progress management', detail: 'Make project plan and proceed project based on the plan (Including global project)' },
      { category: 'Problem-solving', detail: 'Solve all issues in group following APTC policy' },
      { category: 'Improvement working environment', detail: 'Improve working environment of group' },
      { category: 'Education', detail: 'Plan for education to NSK internal and external members' },
      { category: 'Consideration of policy', detail: 'Decide/Plan for group policy of operation' },
      { category: 'Compliance', detail: "Follow to company's policy, rules and orders of work and other company's announcement" },
      { category: 'Compliance', detail: "Cooperate to company's activity such as 5S, CSR, IATF16949 and other company's activity" },
    ],
    authority: [
      "Decide/Plan and control of group staff as company's policy",
      'Check/create Purchasing Order',
      'Check/create of investigation/testing report',
    ],
    education: 'Bachelor degree in engineering, industrial and related science field',
    major: 'Mechanical, Industrial, Material, Automotive, Chemical and related Industrial Technology',
    certification: '-',
    experience: 'Manager more than 3 years',
    knowledge: [
      'Bearing production process',
      'Bearing basic, handling, type of bearing',
      'Bearing application (Hub, Engine, Drivetrain, Motorcycle)',
      'Elementary engineering subjects (Static, Material, Mechanical drawing, Statistic, etc.)',
      'Quality system (IATF16949)',
    ],
    skills: [
      'Microsoft Office',
      'English language and Japanese language',
      'Operation of Measuring devices',
      'Operation of Testing machine',
      'Diagnosis of bearing problems',
      'CAD software such as AutoCAD or CATIA',
      'Presentation skill',
      'Communication skill',
    ],
  },
  {
    id: 'manager',
    titleTH: 'ผู้จัดการ',
    titleEN: 'Manager',
    group: 'Auto/Chassis Bearing',
    division: '-',
    department: '-',
    reportsTo: 'Group Manager',
    subordinates: 'Engineer Class1, 2, Senior Engineer, Asst. Manager',
    effectiveDate: '2018-02-14',
    revision: 0,
    jobPurpose: [
      'Coordinate issue items, requirement items with related department and T-NSK',
      'Make project plan and proceed project based on plan',
      'Propose/plan for improving working environment of group',
      'Propose/plan and carry out education of NSK product internal and external',
      'Plan for group policy of operation',
    ],
    responsibilities: [
      { category: 'Performing task', detail: 'Coordinate issue items, requirement items with related department and T-NSK' },
      { category: 'Progress management', detail: 'Submitting a weekly/monthly report to group manager. Make project plan and proceed project based on the plan' },
      { category: 'Problem-solving', detail: 'Support/assist on engineering issues in group' },
      { category: 'Improvement working environment', detail: 'Propose, plan and improve working environment of group' },
      { category: 'Education', detail: 'Propose, plan and carry out education to NSK internal and external members' },
      { category: 'Consideration of policy', detail: 'Plan for group policy of operation' },
      { category: 'Compliance', detail: "Follow to company's policy, rules and orders of work and other company's announcement" },
      { category: 'Compliance', detail: "Cooperate to company's activity such as 5S, CSR, IATF16949 and other company's activity" },
    ],
    authority: [
      "Plan and control of group staff as company's policy",
      'Check/create Purchasing Order',
    ],
    education: 'Bachelor degree in engineering, industrial and related science field',
    major: 'Mechanical, Industrial, Material, Automotive, Chemical and related Industrial Technology',
    certification: '-',
    experience: 'Assist Manager more than 2 years',
    knowledge: [
      'Bearing production process',
      'Bearing basic, handling, type of bearing',
      'Bearing application (Hub, Engine, Drivetrain, Motorcycle)',
      'Elementary engineering subjects (Static, Material, Mechanical drawing, Statistic, etc.)',
      'Quality system (IATF16949)',
    ],
    skills: [
      'Microsoft Office',
      'English language and Japanese language',
      'Operation of Measuring devices',
      'Operation of Testing machine',
      'Diagnosis of bearing problems',
      'CAD software such as AutoCAD or CATIA',
      'Presentation skill',
      'Communication skill',
    ],
  },
  {
    id: 'assistant-manager',
    titleTH: 'ผู้ช่วยผู้จัดการ',
    titleEN: 'Assistant Manager',
    group: 'Auto/Chassis Bearing',
    division: '-',
    department: '-',
    reportsTo: 'Manager',
    subordinates: 'Engineer Class1, 2, Senior Engineer',
    effectiveDate: '2018-02-14',
    revision: 0,
    jobPurpose: [
      'Investigation and Testing of Auto/Chassis Bearing',
      'Education of NSK product internal and external',
      'Coordinate issue items, requirement items with related department',
    ],
    responsibilities: [
      { category: 'Performing task', detail: 'Coordinate issue items, requirement items with related department' },
      { category: 'Progress management', detail: 'Submitting a weekly/monthly report to group manager. Make project plan and proceed project based on the plan' },
      { category: 'Problem-solving', detail: 'Support/assist on engineering issues in group' },
      { category: 'Improvement working environment', detail: "Support/assist on junior's environment" },
      { category: 'Education', detail: 'Carry out education to NSK internal and external members' },
      { category: 'Compliance', detail: "Follow to company's policy, rules and orders of work and other company's announcement" },
      { category: 'Compliance', detail: "Cooperate to company's activity such as 5S, CSR, IATF16949 and other company's activity" },
    ],
    authority: [
      'Conclude of investigation and testing result',
      "Control of junior staff's work and report to superior",
      'Check/create Purchasing Order',
    ],
    education: 'Bachelor degree in engineering, industrial and related science field',
    major: 'Mechanical, Industrial, Material, Automotive, Chemical and related Industrial Technology',
    certification: '-',
    experience: 'Senior Engineer more than 2 years',
    knowledge: [
      'Bearing production process',
      'Bearing basic, handling, type of bearing',
      'Bearing application (Hub, Engine, Drivetrain, Motorcycle)',
      'Elementary engineering subjects (Static, Material, Mechanical drawing, Statistic, etc.)',
      'Quality system (IATF16949)',
    ],
    skills: [
      'Microsoft Office',
      'English language and Japanese language',
      'Operation of Measuring devices',
      'Operation of Testing machine',
      'Diagnosis of bearing problems',
      'CAD software such as AutoCAD or CATIA',
      'Presentation skill',
      'Communication skill',
    ],
  },
  {
    id: 'senior-engineer',
    titleTH: 'วิศวกรอาวุโส',
    titleEN: 'Senior Engineer',
    group: 'Auto/Chassis Bearing',
    division: '-',
    department: '-',
    reportsTo: 'Assistant Manager',
    subordinates: 'Engineer Class1, 2',
    effectiveDate: '2018-02-14',
    revision: 0,
    jobPurpose: [
      'Investigation and Testing of Auto/Chassis Bearing',
      'Education of NSK product internal and external',
      'Create plan for each task and perform/control task as plan',
    ],
    responsibilities: [
      { category: 'Performing task', detail: "Conduct Investigation and Testing, making report and drawing alone following senior's instruction and under senior's supervision" },
      { category: 'Progress management', detail: "Report own work and junior's work progress to Assistant Manager periodically" },
      { category: 'Compliance', detail: "Follow to company's policy, rules and orders of work and other company's announcement" },
      { category: 'Compliance', detail: "Cooperate to company's activity such as 5S, CSR, IATF16949 and other company's activity" },
      { category: 'Performing task', detail: 'Conduct other works that were assigned by senior' },
      { category: 'Education', detail: 'Instruct junior to solve several issues' },
      { category: 'Education', detail: "Carry out education to NSK internal and external under manager's support" },
    ],
    authority: [
      'Simple decision of investigation and testing work result',
      "Control of junior staff's work and report to superior",
    ],
    education: 'Bachelor degree in engineering, industrial and related science field',
    major: 'Mechanical, Industrial, Material, Automotive, Chemical and related Industrial Technology',
    certification: '-',
    experience: 'Engineer class2 for 3-5 years',
    knowledge: [
      'Bearing production process',
      'Bearing basic, handling, type of bearing',
      'Bearing application (Hub, Engine, Drivetrain, Motorcycle)',
      'Elementary engineering subjects (Static, Material, Mechanical drawing, Statistic, etc.)',
      'Instruct junior to solve several issue',
      'Improve work efficiency and environment',
    ],
    skills: [
      'Microsoft Office',
      'English language',
      'Operation of Measuring devices',
      'Operation of Testing machine',
      'Diagnosis of bearing problems',
      'CAD software such as AutoCAD or CATIA',
      'Presentation skill',
    ],
  },
  {
    id: 'engineer-class2',
    titleTH: 'วิศวกรระดับสอง',
    titleEN: 'Engineer Class 2',
    group: 'Auto/Chassis Bearing',
    division: '-',
    department: '-',
    reportsTo: 'Senior Engineer',
    subordinates: '-',
    effectiveDate: '2018-02-14',
    revision: 0,
    jobPurpose: [
      'Investigation and Testing of Auto/Chassis Bearing',
    ],
    responsibilities: [
      { category: 'Performing task', detail: "Conduct Investigation and Testing, making report and drawing alone following senior's instruction and under senior's supervision" },
      { category: 'Progress management', detail: "Report own work & junior's work progress to senior periodically" },
      { category: 'Compliance', detail: "Follow to company's policy, rules and orders of work and other company's announcement" },
      { category: 'Compliance', detail: "Cooperate to company's activity such as 5S, CSR, IATF16949 and other company's activity" },
      { category: 'Performing task', detail: 'Conduct other works that were assigned by senior' },
      { category: 'Problem-solving', detail: "Try to search for solution by oneself and solve several issue under manager's support" },
    ],
    authority: [
      'Simple decision of investigation and testing work result',
      "Control of junior staff's work and report to superior",
    ],
    education: 'Bachelor degree in engineering, industrial and related science field',
    major: 'Mechanical, Industrial, Material, Automotive, Chemical and related Industrial Technology',
    certification: '-',
    experience: 'Engineer class 1 more than 1 year',
    knowledge: [
      'Bearing production process',
      'Bearing basic, handling, type of bearing',
      'Bearing application (Hub, Engine, Drivetrain, Motorcycle)',
      'Elementary engineering subjects (Static, Material, Mechanical drawing, Statistic, etc.)',
      "Problem solving by manager's support",
      'Improve work efficiency and environment',
    ],
    skills: [
      'Microsoft Office',
      'English language (Expected level TOEIC 600)',
      'Operation of Measuring devices',
      'Operation of Testing machine',
      'Diagnosis of bearing problems',
      'CAD software such as AutoCAD or CATIA',
    ],
  },
  {
    id: 'engineer-class1',
    titleTH: 'วิศวกรระดับหนึ่ง',
    titleEN: 'Engineer Class 1',
    group: 'Auto/Chassis Bearing',
    division: '-',
    department: '-',
    reportsTo: 'Engineer Class 2',
    subordinates: '-',
    effectiveDate: '2018-02-14',
    revision: 0,
    jobPurpose: [
      'Investigation and Testing of Auto/Chassis Bearing',
    ],
    responsibilities: [
      { category: 'Performing task', detail: "Conduct Investigation and Testing, making report and drawing following senior's instruction and under senior's supervision" },
      { category: 'Progress management', detail: 'Report work progress to senior periodically' },
      { category: 'Compliance', detail: "Follow to company's policy, rules and orders of work and other company's announcement" },
      { category: 'Compliance', detail: "Cooperate to company's activity such as 5S, CSR, IATF16949 and other company's activity" },
      { category: 'Performing task', detail: 'Conduct other works that were assigned by senior' },
    ],
    authority: [
      'Simple decision of investigation and testing work result',
    ],
    education: 'Bachelor degree in engineering, industrial and related science field',
    major: 'Mechanical, Industrial, Material, Automotive, Chemical and related Industrial Technology',
    certification: '-',
    experience: '-',
    knowledge: [
      'Bearing production process',
      'Bearing basic, handling, type of bearing',
      'Bearing application (Hub, Engine, Drivetrain, Motorcycle)',
      'Elementary engineering subjects (Static, Material, Mechanical drawing, Statistic, etc.)',
    ],
    skills: [
      'Microsoft Office',
      'English language (Expected level TOEIC 600)',
      'Operation of Measuring devices',
      'Operation of Testing machine',
      'Diagnosis of bearing problems',
      'CAD software such as AutoCAD or CATIA',
    ],
  },
];

/* ──────────────────── Hierarchy level colors ──────────────────── */

const levelColors: Record<string, { bg: string; border: string; badge: string; ring: string }> = {
  'group-manager':     { bg: 'bg-amber-50',   border: 'border-amber-300',   badge: 'bg-amber-100 text-amber-800',     ring: 'ring-amber-400' },
  'manager':           { bg: 'bg-blue-50',     border: 'border-blue-300',    badge: 'bg-blue-100 text-blue-800',       ring: 'ring-blue-400' },
  'assistant-manager': { bg: 'bg-violet-50',   border: 'border-violet-300',  badge: 'bg-violet-100 text-violet-800',   ring: 'ring-violet-400' },
  'senior-engineer':   { bg: 'bg-emerald-50',  border: 'border-emerald-300', badge: 'bg-emerald-100 text-emerald-800', ring: 'ring-emerald-400' },
  'engineer-class2':   { bg: 'bg-cyan-50',     border: 'border-cyan-300',    badge: 'bg-cyan-100 text-cyan-800',       ring: 'ring-cyan-400' },
  'engineer-class1':   { bg: 'bg-slate-50',    border: 'border-slate-300',   badge: 'bg-slate-100 text-slate-700',     ring: 'ring-slate-400' },
};

/* ──────────────────── Component ──────────────────── */

export default function JobDescriptions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ─── Request Changes state ─────────────────────────────────────────────
  const [editRequests, setEditRequests] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ section: '', item_label: '', reason: '', approver_id: '', approver_name: '', request_type: 'EDIT' as string, details: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [rejectRequestId, setRejectRequestId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRequests, setShowRequests] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchRequests = async () => {
    try {
      const { data } = await genericEditRequestAPI.getRequests('JobDescription');
      setEditRequests(data.requests || []);
    } catch { /* */ }
  };

  const fetchManagers = async () => {
    try {
      const { data } = await genericEditRequestAPI.getManagers();
      setManagers(data.managers || []);
    } catch { /* */ }
  };

  useEffect(() => { fetchRequests(); fetchManagers(); }, []);

  const handleSubmitEditRequest = async () => {
    setFormError('');
    if (!editForm.reason.trim() || !editForm.approver_id) {
      setFormError('Reason and approver are required.'); return;
    }
    try {
      setSaving(true);
      await genericEditRequestAPI.create({
        module: 'JobDescription',
        section: editForm.section,
        item_label: editForm.item_label,
        request_type: editForm.request_type,
        field_changes: { details: editForm.details },
        reason: editForm.reason,
        approver_id: Number(editForm.approver_id),
        approver_name: editForm.approver_name,
      });
      showToast('Change request submitted');
      setEditingSection(null);
      setEditForm({ section: '', item_label: '', reason: '', approver_id: '', approver_name: '', request_type: 'EDIT', details: '' });
      fetchRequests();
    } catch (e: any) {
      setFormError(e?.response?.data?.error || 'Failed to submit request');
    } finally { setSaving(false); }
  };

  const handleApproveRequest = async (id: number) => {
    if (!confirm('Approve this change request?')) return;
    try {
      const { data } = await genericEditRequestAPI.approve(id);
      showToast(data.message || 'Request approved');
      fetchRequests();
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Failed to approve', 'error');
    }
  };

  const handleRejectRequest = async () => {
    if (!rejectRequestId || !rejectReason.trim()) return;
    try {
      const { data } = await genericEditRequestAPI.reject(rejectRequestId, rejectReason.trim());
      showToast(data.message || 'Request rejected', 'info');
      setRejectRequestId(null);
      setRejectReason('');
      fetchRequests();
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Failed to reject', 'error');
    }
  };

  const pendingCount = editRequests.filter(r => r.status === 'PENDING').length;
  const JD_POSITIONS = jobDescriptions.map(j => j.titleEN);
  const JD_SECTIONS = ['Job Purpose', 'Responsibilities', 'Authority', 'Qualifications', 'Key Competencies'];

  const startEditing = (positionTitle: string, sectionName: string) => {
    const key = `${positionTitle}|${sectionName}`;
    setEditingSection(key);
    setEditForm({ section: positionTitle, item_label: sectionName, reason: '', approver_id: '', approver_name: '', request_type: 'EDIT', details: '' });
    setFormError('');
  };

  const renderInlineForm = (positionTitle: string, sectionName: string) => {
    const key = `${positionTitle}|${sectionName}`;
    if (editingSection !== key) return null;
    return (
      <div className="mt-3 border border-orange-200 bg-orange-50/60 rounded-lg p-4 space-y-3">
        {formError && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{formError}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Request Type</label>
            <select value={editForm.request_type} onChange={e => setEditForm({ ...editForm, request_type: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="EDIT">Edit existing item</option>
              <option value="ADD">Add new item</option>
              <option value="DELETE">Remove item</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Approver (Manager) *</label>
            <select value={editForm.approver_id}
              onChange={e => {
                const m = managers.find((mg: any) => String(mg.id) === e.target.value);
                setEditForm({ ...editForm, approver_id: e.target.value, approver_name: m?.display_name || '' });
              }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">— Select approver —</option>
              {managers.map((m: any) => (
                <option key={m.id} value={m.id}>{m.display_name} ({m.employee_code}) — {m.role_name}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Proposed Changes / Details</label>
          <textarea rows={2} value={editForm.details} onChange={e => setEditForm({ ...editForm, details: e.target.value })}
            placeholder="Describe what should be changed..."
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Reason for Change *</label>
          <textarea rows={2} value={editForm.reason} onChange={e => setEditForm({ ...editForm, reason: e.target.value })}
            placeholder="Why is this change needed?"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={() => setEditingSection(null)}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={handleSubmitEditRequest} disabled={saving}
            className="px-4 py-1.5 text-sm rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50">
            {saving ? 'Submitting...' : 'Submit for Approval'}
          </button>
        </div>
      </div>
    );
  };

  const toggle = (id: string) => setExpandedId(prev => prev === id ? null : id);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/other')}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Job Description</h1>
          <p className="text-sm text-slate-500 mt-0.5">ใบกำหนดหน้าที่งาน — 3F-6201-009 Rev.04</p>
        </div>
      </div>

      {/* Org Hierarchy Mini-map */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <Bi en="Organization Hierarchy" th="โครงสร้างองค์กร" className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3" />
        <div className="flex flex-wrap gap-2">
          {jobDescriptions.map((jd) => {
            const c = levelColors[jd.id];
            const isActive = expandedId === jd.id;
            return (
              <button key={jd.id} onClick={() => toggle(jd.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border
                  ${isActive ? `${c.badge} ${c.border} ring-2 ${c.ring}` : `${c.badge} ${c.border} hover:ring-2 ${c.ring}`}`}>
                {jd.titleEN}
              </button>
            );
          })}
        </div>
      </div>

      {/* JD Cards */}
      <div className="space-y-3">
        {jobDescriptions.map((jd) => {
          const isOpen = expandedId === jd.id;
          const c = levelColors[jd.id];

          return (
            <div key={jd.id}
              className={`rounded-xl border transition-all duration-200 ${isOpen ? `${c.border} shadow-md` : 'border-slate-200 hover:border-slate-300'}`}>

              {/* ── Card Header ── */}
              <button onClick={() => toggle(jd.id)}
                className={`w-full flex items-center justify-between gap-3 px-5 py-4 text-left rounded-xl transition-colors
                  ${isOpen ? c.bg : 'bg-white hover:bg-slate-50'}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${c.badge}`}>
                    <Briefcase size={18} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-800 text-base truncate">{jd.titleEN}</h3>
                    <p className="text-sm text-slate-500 truncate">
                      {jd.titleTH} &middot; <span className="text-slate-400">Reports to (ผู้บังคับบัญชา):</span> {jd.reportsTo}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-slate-400">
                  {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </button>

              {/* ── Expanded Detail ── */}
              {isOpen && (
                <div className="px-5 pb-5 space-y-5">

                  {/* Basic Info */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    {([
                      ['Position (ตำแหน่ง)', `${jd.titleEN} / ${jd.titleTH}`],
                      ['Group (กลุ่ม)', jd.group],
                      ['Division (ส่วน)', jd.division],
                      ['Department (ฝ่าย)', jd.department],
                      ['Reports To (ผู้บังคับบัญชาชั้นต้น)', jd.reportsTo],
                      ['Subordinates (ผู้ใต้บังคับบัญชา)', jd.subordinates],
                      ['Effective Date (วันที่เริ่มใช้)', jd.effectiveDate],
                    ] as [string, string][]).map(([label, value]) => (
                      <div key={label} className="bg-white rounded-lg border border-slate-100 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">{label}</p>
                        <p className="text-slate-700 font-medium mt-0.5">{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Job Purpose */}
                  <Section icon={<Briefcase size={15} />} en="Job Purpose" th="วัตถุประสงค์ของตำแหน่งงาน"
                    isEditMode={isEditMode} onEditClick={() => startEditing(jd.titleEN, 'Job Purpose')}>
                    <ul className="space-y-1.5">
                      {jd.jobPurpose.map((p, i) => (
                        <li key={i} className="flex gap-2 text-sm text-slate-700">
                          <span className="text-slate-400 shrink-0">•</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </Section>
                  {renderInlineForm(jd.titleEN, 'Job Purpose')}

                  {/* Responsibilities */}
                  <Section icon={<Users size={15} />} en="Responsibilities" th="ขอบเขตหน้าที่ของงานที่รับผิดชอบ"
                    isEditMode={isEditMode} onEditClick={() => startEditing(jd.titleEN, 'Responsibilities')}>
                    <div className="space-y-2">
                      {groupByCategory(jd.responsibilities).map(([cat, items], ci) => (
                        <div key={ci}>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{cat}</p>
                          {items.map((item, ii) => (
                            <p key={ii} className="text-sm text-slate-700 pl-3 border-l-2 border-slate-200 mb-1">{item}</p>
                          ))}
                        </div>
                      ))}
                    </div>
                  </Section>
                  {renderInlineForm(jd.titleEN, 'Responsibilities')}

                  {/* Authority */}
                  <Section icon={<Shield size={15} />} en="Authority" th="อำนาจอนุมัติตามความรับผิดชอบ"
                    isEditMode={isEditMode} onEditClick={() => startEditing(jd.titleEN, 'Authority')}>
                    <ul className="space-y-1.5">
                      {jd.authority.map((a, i) => (
                        <li key={i} className="flex gap-2 text-sm text-slate-700">
                          <span className="text-slate-400 shrink-0">•</span>
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </Section>
                  {renderInlineForm(jd.titleEN, 'Authority')}

                  {/* Qualifications */}
                  <Section icon={<GraduationCap size={15} />} en="Qualifications" th="คุณสมบัติ"
                    isEditMode={isEditMode} onEditClick={() => startEditing(jd.titleEN, 'Qualifications')}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      {([
                        ['Education (วุฒิการศึกษา)', jd.education],
                        ['Major (สาขา / วิชาเอก)', jd.major],
                        ['Certification (ประกาศนียบัตร / ใบรับรอง)', jd.certification],
                        ['Experience (ประสบการณ์การทำงาน)', jd.experience],
                      ] as [string, string][]).map(([label, val]) => (
                        <div key={label}>
                          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">{label}</p>
                          <p className="text-slate-700 mt-0.5">{val}</p>
                        </div>
                      ))}
                    </div>
                  </Section>
                  {renderInlineForm(jd.titleEN, 'Qualifications')}

                  {/* Competencies */}
                  <Section icon={<Award size={15} />} en="Key Competencies" th="ความสามารถประจำตำแหน่ง"
                    isEditMode={isEditMode} onEditClick={() => startEditing(jd.titleEN, 'Key Competencies')}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Knowledge (ความรู้ / ความสามารถ)</p>
                        <ul className="space-y-1">
                          {jd.knowledge.map((k, i) => (
                            <li key={i} className="flex gap-2 text-sm text-slate-700">
                              <span className="text-slate-400 shrink-0">•</span>
                              <span>{k}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Skills (ทักษะ)</p>
                        <ul className="space-y-1">
                          {jd.skills.map((s, i) => (
                            <li key={i} className="flex gap-2 text-sm text-slate-700">
                              <span className="text-slate-400 shrink-0">•</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </Section>
                  {renderInlineForm(jd.titleEN, 'Key Competencies')}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ─── Request Changes Section ─── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Edit3 size={16} className="text-orange-500" />
              Request Changes
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEditMode ? 'Click the pen icon on any section to request a change' : 'Submit a change request for approval by a manager'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {editRequests.length > 0 && (
              <button onClick={() => setShowRequests(!showRequests)}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition">
                <ClipboardList size={15} /> View Requests ({editRequests.length})
              </button>
            )}
            <button
              onClick={() => { setIsEditMode(!isEditMode); setEditingSection(null); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition shadow-sm ${isEditMode ? 'bg-slate-600 text-white hover:bg-slate-700' : 'bg-orange-500 text-white hover:bg-orange-600'}`}
            >
              <Edit3 size={16} /> {isEditMode ? 'Exit Edit Mode' : 'Request Change'}
            </button>
          </div>
        </div>
        {pendingCount > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-2 text-xs text-amber-600">
              <Bell size={14} />
              <span className="font-medium">{pendingCount} pending request(s) awaiting approval</span>
              <button onClick={() => setShowRequests(true)} className="ml-auto text-blue-600 hover:underline font-medium">View All</button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Requests Table ─── */}
      {showRequests && editRequests.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Change Requests</h3>
            <button onClick={() => setShowRequests(false)} className="text-slate-400 hover:text-slate-600">
              <XCircle size={18} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Position / Section</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                  <th className="px-3 py-2 text-left">Requester</th>
                  <th className="px-3 py-2 text-left">Approver</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {editRequests.map((r, idx) => {
                  const isMyApproval = r.status === 'PENDING' && r.approver_id === (user as any)?.id;
                  return (
                    <tr key={r.id} className={`border-b border-slate-50 hover:bg-slate-50/60 ${isMyApproval ? 'bg-amber-50/60' : ''}`}>
                      <td className="px-3 py-2">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.request_type === 'ADD' ? 'bg-green-100 text-green-700' : r.request_type === 'DELETE' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                          {r.request_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{r.section || '-'}{r.item_label ? ` — ${r.item_label}` : ''}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate">{r.reason}</td>
                      <td className="px-3 py-2 text-slate-600">{r.requester_name}</td>
                      <td className="px-3 py-2 text-slate-600">{r.approver_name}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : r.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {isMyApproval && (
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => handleApproveRequest(r.id)}
                              className="p-1 rounded bg-emerald-100 hover:bg-emerald-200" title="Approve">
                              <Check size={13} className="text-emerald-700" />
                            </button>
                            <button onClick={() => { setRejectRequestId(r.id); setRejectReason(''); }}
                              className="p-1 rounded bg-red-100 hover:bg-red-200" title="Reject">
                              <XCircle size={13} className="text-red-700" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Reject Modal ─── */}
      {rejectRequestId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-800">Reject Change Request</h2>
            <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setRejectRequestId(null); setRejectReason(''); }}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={handleRejectRequest} disabled={!rejectReason.trim()}
                className="px-6 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                Reject Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Toast ─── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'error' ? 'bg-red-600 text-white' : toast.type === 'info' ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/** Bilingual label: English primary, Thai secondary */
function Bi({ en, th, className }: { en: string; th: string; className?: string }) {
  return (
    <div className={className}>
      <span>{en}</span>
      <span className="text-slate-400 font-normal ml-1 text-[10px]">({th})</span>
    </div>
  );
}

function Section({ icon, en, th, children, isEditMode, onEditClick }: { icon: React.ReactNode; en: string; th: string; children: React.ReactNode; isEditMode?: boolean; onEditClick?: () => void }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-slate-400">{icon}</span>
        <h4 className="text-sm font-semibold text-slate-700">
          {en} <span className="text-slate-400 font-normal text-xs">({th})</span>
        </h4>
        {isEditMode && (
          <button onClick={onEditClick} className="ml-auto p-1 rounded hover:bg-orange-100 transition" title={`Request change for ${en}`}>
            <Edit3 size={14} className="text-orange-500" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function groupByCategory(items: { category: string; detail: string }[]): [string, string[]][] {
  const map = new Map<string, string[]>();
  for (const item of items) {
    const arr = map.get(item.category) || [];
    arr.push(item.detail);
    map.set(item.category, arr);
  }
  return Array.from(map.entries());
}
