// frontend/src/pages/TrainingPlan.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { trainingPlanAPI } from '../api';
import {
  BookOpen, Plus, RefreshCw, ChevronDown, X, Check,
  Trash2, Edit2, Upload, Download, Lock, CheckCircle,
  Clock, AlertCircle, Send, Shield, FileText, Unlock,
  ClipboardList, Eye,
} from 'lucide-react';

// --- Types -------------------------------------------------------------------
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface Schedule { month: string; plan: boolean; actual: boolean; }

interface TrainingProgram {
  id: number;
  sort_order: number;
  training_name: string;
  level_1: boolean; level_2: boolean; level_3: boolean; level_4: boolean;
  method_code: string;
  method_name: string;
  duration_hours: number | null;
  budget_plan: number | null;
  budget_actual: number | null;
  trainer_type: string;
  remark: string;
  year: number;
  schedule: Schedule[];
}

interface RawSchedule { program_id: number; month: string; plan: number; actual: number; }

interface ApprovalInfo {
  id?: number;
  year: number;
  status: 'draft' | 'pending_check' | 'pending_approval' | 'approved' | 'edit_unlocked' | 'rejected';
  submitted_by?: number;   submitted_at?: string;
  checked_by?: number;     checked_at?: string;   check_comment?: string;
  approved_by?: number;    approved_at?: string;  approve_comment?: string;
}

interface EditRequest {
  id: number; year: number; requested_by: number; requester_name?: string;
  reason: string; status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: number; reviewer_name?: string; reviewed_at?: string; review_comment?: string;
  created_at: string;
}

interface LogEntry {
  id: number; year: number; action: string; actor_name?: string; detail?: string; created_at: string;
}

const METHOD_OPTIONS = [
  { code: 'T1', name: 'Orientation' },
  { code: 'T2', name: 'Inhouse/Workshop' },
  { code: 'T3', name: 'Public Training' },
  { code: 'T4', name: 'On-the-Job Training (OJT)' },
  { code: 'T5', name: 'Seminar' },
  { code: 'T6', name: 'Education' },
  { code: 'T7', name: 'Self-Learning' },
];

const emptyForm = (): Omit<TrainingProgram,'id'|'sort_order'|'year'> & { schedule: Schedule[] } => ({
  training_name: '',
  level_1: false, level_2: false, level_3: false, level_4: false,
  method_code: 'T2', method_name: 'Inhouse/Workshop',
  duration_hours: null, budget_plan: null, budget_actual: null,
  trainer_type: 'Internal', remark: '',
  schedule: MONTHS.map((m) => ({ month: m, plan: false, actual: false })),
});

// --- Seed data from the CSV --------------------------------------------------
const SEED_PROGRAMS = [
  { training_name:'Working rule',       level_1:true,level_2:true,level_3:true,level_4:true, method_code:'T1',method_name:'Orientation',          duration_hours:4,   budget_plan:null, trainer_type:'Internal', remark:'Internship, New comer', schedule: MONTHS.map((m)=>({month:m,plan:true,actual:false})) },
  { training_name:'Safety rule',        level_1:true,level_2:true,level_3:true,level_4:true, method_code:'T1',method_name:'Orientation',          duration_hours:4,   budget_plan:null, trainer_type:'Internal', remark:'Internship, New comer', schedule: MONTHS.map((m)=>({month:m,plan:true,actual:false})) },
  { training_name:'Investigation',      level_1:true,level_2:true,level_3:true,level_4:true, method_code:'T4',method_name:'On-the-Job Training (OJT)', duration_hours:80, budget_plan:null, trainer_type:'Internal', remark:'Internship, New comer', schedule: MONTHS.map((m)=>({month:m,plan:true,actual:false})) },
  { training_name:'Testing',            level_1:true,level_2:true,level_3:true,level_4:true, method_code:'T4',method_name:'On-the-Job Training (OJT)', duration_hours:80, budget_plan:null, trainer_type:'Internal', remark:'Internship, New comer', schedule: MONTHS.map((m)=>({month:m,plan:true,actual:false})) },
  { training_name:'Bearing Basic',      level_1:true,level_2:true,level_3:true,level_4:true, method_code:'T2',method_name:'Inhouse/Workshop',      duration_hours:20,  budget_plan:null, trainer_type:'Internal', remark:'Internship, New comer', schedule: MONTHS.map((m)=>({month:m,plan:true,actual:false})) },
  { training_name:'Bearing Handling',   level_1:true,level_2:true,level_3:true,level_4:true, method_code:'T2',method_name:'Inhouse/Workshop',      duration_hours:10,  budget_plan:null, trainer_type:'Internal', remark:'Internship, New comer', schedule: MONTHS.map((m)=>({month:m,plan:true,actual:false})) },
  { training_name:'Type of Bearing',    level_1:true,level_2:true,level_3:true,level_4:true, method_code:'T2',method_name:'Inhouse/Workshop',      duration_hours:20,  budget_plan:null, trainer_type:'Internal', remark:'Internship, New comer', schedule: MONTHS.map((m)=>({month:m,plan:true,actual:false})) },
  { training_name:'Diagnosis of Bearing Problem', level_1:true,level_2:true,level_3:true,level_4:true, method_code:'T2',method_name:'Inhouse/Workshop', duration_hours:4, budget_plan:null, trainer_type:'Internal', remark:'New comer', schedule: MONTHS.map((m)=>({month:m,plan:true,actual:false})) },
  { training_name:'Bearing Production Process',   level_1:true,level_2:true,level_3:true,level_4:true, method_code:'T2',method_name:'Inhouse/Workshop', duration_hours:4, budget_plan:null, trainer_type:'NBMT',     remark:'New comer', schedule: MONTHS.map((m)=>({month:m,plan:true,actual:false})) },
  { training_name:'NIT',                level_1:true,level_2:true,level_3:true,level_4:false,method_code:'T2',method_name:'Inhouse/Workshop',      duration_hours:360, budget_plan:null, trainer_type:'Internal', remark:'', schedule: MONTHS.map((m)=>({month:m,plan:true,actual:false})) },
  { training_name:'Bearing Production Process (Application and review)', level_1:true,level_2:true,level_3:true,level_4:true, method_code:'T2',method_name:'Inhouse/Workshop', duration_hours:4, budget_plan:null, trainer_type:'NBMT', remark:'AM and M',
    schedule: MONTHS.map((m)=>({ month:m, plan:['Jan','Apr','Jul','Oct'].includes(m), actual:false })) },
  { training_name:'APTC Quality dojo training', level_1:true,level_2:true,level_3:true,level_4:true, method_code:'T2',method_name:'Inhouse/Workshop', duration_hours:6, budget_plan:null, trainer_type:'Internal', remark:'All members', schedule: MONTHS.map((m)=>({month:m,plan:true,actual:false})) },
  { training_name:'Compliance training', level_1:true,level_2:true,level_3:true,level_4:true, method_code:'T2',method_name:'Inhouse/Workshop',     duration_hours:2,  budget_plan:null, trainer_type:'NBMT',     remark:'All members', schedule: MONTHS.map((m)=>({month:m,plan:true,actual:false})) },
  { training_name:'Vibration Analyst Training (Level II)', level_1:true,level_2:true,level_3:true,level_4:false, method_code:'T3',method_name:'Public Training', duration_hours:40, budget_plan:80000, trainer_type:'External', remark:'All members', schedule: MONTHS.map((m)=>({month:m,plan:true,actual:false})) },
  { training_name:'PLC programming',    level_1:true,level_2:true,level_3:true,level_4:true, method_code:'T3',method_name:'Public Training',        duration_hours:16,  budget_plan:20000, trainer_type:'External', remark:'All members', schedule: MONTHS.map((m)=>({month:m,plan:true,actual:false})) },
];

// --- Component ---------------------------------------------------------------
export default function TrainingPlan() {
  const { user } = useAuth();
  const normalizedRole = String((user as any)?.role || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  // Role checks
  const isEditor        = useMemo(() => ['ASSISTANT_MANAGER','MANAGER','PRESIDENT','ADMIN','DOCUMENT_CONTROLLER'].includes(normalizedRole), [normalizedRole]);
  const isChecker       = useMemo(() => ['MANAGER','PRESIDENT','ADMIN'].includes(normalizedRole), [normalizedRole]);
  const isApprover      = useMemo(() => ['PRESIDENT','ADMIN'].includes(normalizedRole), [normalizedRole]);
  const isEditReviewer  = useMemo(() => ['ADMIN','DOCUMENT_CONTROLLER'].includes(normalizedRole), [normalizedRole]);

  const [availYears,   setAvailYears]   = useState<number[]>([new Date().getFullYear()]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [programs,     setPrograms]     = useState<TrainingProgram[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [seeding,      setSeeding]      = useState(false);
  const [showForm,     setShowForm]     = useState(false);
  const [editId,       setEditId]       = useState<number|null>(null);
  const [form,         setForm]         = useState(emptyForm());
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [showAddYear,  setShowAddYear]  = useState(false);
  const [newYearInput, setNewYearInput] = useState('');
  const [editActualId,   setEditActualId]   = useState<number|null>(null);
  const [editActualVal,  setEditActualVal]  = useState('');

  // Approval state
  const [approval,       setApproval]       = useState<ApprovalInfo | null>(null);
  const [editRequests,   setEditRequests]   = useState<EditRequest[]>([]);
  const [approvalLog,    setApprovalLog]    = useState<LogEntry[]>([]);
  const [showApprovalModal,   setShowApprovalModal]   = useState(false);
  const [approvalModalAction, setApprovalModalAction] = useState<string>('');
  const [approvalComment,     setApprovalComment]     = useState('');
  const [showEditReqModal,    setShowEditReqModal]    = useState(false);
  const [editReqReason,       setEditReqReason]       = useState('');
  const [showLogModal,        setShowLogModal]        = useState(false);
  const [showReviewModal,     setShowReviewModal]     = useState(false);
  const [reviewRequestId,     setReviewRequestId]     = useState<number|null>(null);
  const [reviewAction,        setReviewAction]        = useState<'approve'|'reject'>('approve');
  const [reviewComment,       setReviewComment]       = useState('');
  const [submittingApproval,  setSubmittingApproval]  = useState(false);

  // Derived approval state
  const approvalStatus = approval?.status || 'draft';
  const isLocked       = approvalStatus === 'approved';
  const isInReview     = ['pending_check','pending_approval'].includes(approvalStatus);
  const canEditPlan    = isEditor && !isLocked && !isInReview;
  const canEditActual  = isEditor;
  const canSubmit      = isEditor && ['draft','edit_unlocked','rejected'].includes(approvalStatus) && programs.length > 0;
  const canCheck       = isChecker && approvalStatus === 'pending_check';
  const canApprove     = isApprover && approvalStatus === 'pending_approval';
  const canRequestEdit = isEditor && isLocked;
  const pendingEditReqs = editRequests.filter(r => r.status === 'pending');
  const canReviewEdit  = isEditReviewer && pendingEditReqs.length > 0;
  const planVisible    = isEditor || approvalStatus === 'approved';

  const fetchData = useCallback(async (year = selectedYear) => {
    try {
      setLoading(true);
      const [planRes, yrRes] = await Promise.all([
        trainingPlanAPI.list(year),
        trainingPlanAPI.years(),
      ]);
      const rawPrograms: any[]      = planRes.data.programs || [];
      const rawSchedules: RawSchedule[] = planRes.data.schedules || [];
      const merged: TrainingProgram[] = rawPrograms.map((p) => ({
        ...p,
        level_1: !!p.level_1, level_2: !!p.level_2,
        level_3: !!p.level_3, level_4: !!p.level_4,
        schedule: MONTHS.map((m) => {
          const s = rawSchedules.find((r) => r.program_id === p.id && r.month === m);
          return { month: m, plan: s ? !!s.plan : false, actual: s ? !!s.actual : false };
        }),
      }));
      setPrograms(merged);
      const yrs: number[] = yrRes.data.years || [];
      setAvailYears(yrs.length ? yrs : [new Date().getFullYear()]);
      // Load approval status
      if (planRes.data.approval) {
        setApproval(planRes.data.approval);
      } else {
        setApproval({ year, status: 'draft' });
      }
    } catch { setError('Failed to load.'); }
    finally { setLoading(false); }
  }, [selectedYear]);

  const fetchApproval = useCallback(async (year = selectedYear) => {
    try {
      const res = await trainingPlanAPI.getApproval(year);
      setApproval(res.data.approval || { year, status: 'draft' });
      setEditRequests(res.data.editRequests || []);
    } catch { /* silent */ }
  }, [selectedYear]);

  useEffect(() => { fetchData(selectedYear); }, [selectedYear]);
  useEffect(() => { fetchApproval(selectedYear); }, [selectedYear]);

  const handleSeed = async () => {
    if (!confirm(`Seed ${SEED_PROGRAMS.length} default training programs for ${selectedYear}?`)) return;
    try {
      setSeeding(true);
      await trainingPlanAPI.seed(SEED_PROGRAMS.map((p,i) => ({ ...p, sort_order: i })), selectedYear);
      await fetchData(selectedYear);
    } catch { setError('Seed failed.'); }
    finally { setSeeding(false); }
  };

  const handleAddYear = () => {
    const y = parseInt(newYearInput, 10);
    if (!y || y < 2020 || y > 2099) { setError('Enter a valid year (2020â€“2099)'); return; }
    if (!availYears.includes(y)) {
      setAvailYears((prev) => [...prev, y].sort((a, b) => b - a));
    }
    setSelectedYear(y);
    setShowAddYear(false);
    setNewYearInput('');
    fetchData(y);
  };

  const openAdd = () => {
    setForm(emptyForm());
    setEditId(null);
    setError('');
    setShowForm(true);
  };

  const openEdit = (prog: TrainingProgram) => {
    setForm({
      training_name: prog.training_name,
      level_1: prog.level_1, level_2: prog.level_2,
      level_3: prog.level_3, level_4: prog.level_4,
      method_code: prog.method_code,
      method_name: prog.method_name,
      duration_hours: prog.duration_hours,
      budget_plan: prog.budget_plan,
      budget_actual: prog.budget_actual,
      trainer_type: prog.trainer_type,
      remark: prog.remark,
      schedule: MONTHS.map((m) => {
        const s = prog.schedule.find((x) => x.month === m);
        return { month: m, plan: s?.plan ?? false, actual: s?.actual ?? false };
      }),
    });
    setEditId(prog.id);
    setError('');
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.training_name) { setError('Training name required'); return; }
    try {
      setSaving(true); setError('');
      const payload = { ...form, year: selectedYear };
      if (editId) await trainingPlanAPI.update(editId, payload as any);
      else        await trainingPlanAPI.create(payload as any);
      setShowForm(false);
      await fetchData(selectedYear);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Save failed.');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this training item?')) return;
    try { await trainingPlanAPI.remove(id); await fetchData(selectedYear); } catch {}
  };

  const toggleActual = async (prog: TrainingProgram, month: string, current: boolean) => {
    if (!canEditActual) return;
    try {
      await trainingPlanAPI.setActual(prog.id, month, !current);
      setPrograms((prev) => prev.map((p) =>
        p.id !== prog.id ? p : {
          ...p,
          schedule: p.schedule.map((s) => s.month === month ? { ...s, actual: !current } : s),
        }
      ));
    } catch {}
  };

  const saveBudgetActual = async (prog: TrainingProgram) => {
    const val = editActualVal === '' ? null : Number(editActualVal);
    try {
      await trainingPlanAPI.patchBudgetActual(prog.id, val);
      setPrograms((prev) => prev.map((p) => p.id !== prog.id ? p : { ...p, budget_actual: val }));
    } catch { setError('Failed to save actual budget.'); }
    finally { setEditActualId(null); }
  };

  // ── Approval handlers ──────────────────────────────────────────────────────
  const handleApprovalAction = async () => {
    if (!approvalModalAction) return;
    try {
      setSubmittingApproval(true);
      if (approvalModalAction === 'submit') {
        await trainingPlanAPI.submitForCheck(selectedYear, approvalComment || undefined);
      } else if (approvalModalAction === 'check_approve') {
        await trainingPlanAPI.check(selectedYear, 'approve', approvalComment || undefined);
      } else if (approvalModalAction === 'check_reject') {
        await trainingPlanAPI.check(selectedYear, 'reject', approvalComment || undefined);
      } else if (approvalModalAction === 'final_approve') {
        await trainingPlanAPI.finalApprove(selectedYear, 'approve', approvalComment || undefined);
      } else if (approvalModalAction === 'final_reject') {
        await trainingPlanAPI.finalApprove(selectedYear, 'reject', approvalComment || undefined);
      }
      setShowApprovalModal(false);
      setApprovalComment('');
      await fetchApproval(selectedYear);
    } catch (err: any) {
      setShowApprovalModal(false);
      const status = err?.response?.status;
      const msg = err?.response?.data?.error || err?.message || 'Action failed.';
      setError(status ? `[${status}] ${msg}` : msg);
    } finally { setSubmittingApproval(false); }
  };

  const handleEditRequest = async () => {
    if (!editReqReason.trim()) return;
    try {
      setSubmittingApproval(true);
      await trainingPlanAPI.requestEdit(selectedYear, editReqReason.trim());
      setShowEditReqModal(false);
      setEditReqReason('');
      await fetchApproval(selectedYear);
    } catch (err: any) {
      setShowEditReqModal(false);
      const status = err?.response?.status;
      const msg = err?.response?.data?.error || err?.message || 'Request failed.';
      setError(status ? `[${status}] ${msg}` : msg);
    } finally { setSubmittingApproval(false); }
  };

  const handleReviewEditRequest = async () => {
    if (!reviewRequestId) return;
    try {
      setSubmittingApproval(true);
      await trainingPlanAPI.reviewEditRequest(reviewRequestId, reviewAction, reviewComment || undefined);
      setShowReviewModal(false);
      setReviewComment('');
      await fetchApproval(selectedYear);
    } catch (err: any) {
      setShowReviewModal(false);
      const status = err?.response?.status;
      const msg = err?.response?.data?.error || err?.message || 'Review failed.';
      setError(status ? `[${status}] ${msg}` : msg);
    } finally { setSubmittingApproval(false); }
  };

  const openApprovalLog = async () => {
    try {
      const res = await trainingPlanAPI.getLog(selectedYear);
      setApprovalLog(res.data.logs || []);
      setShowLogModal(true);
    } catch { setError('Could not load log.'); }
  };

  // totals per month
  const monthTotals = MONTHS.map((m) => ({
    plan:   programs.filter((p) => p.schedule.find((s) => s.month === m)?.plan).length,
    actual: programs.filter((p) => p.schedule.find((s) => s.month === m)?.actual).length,
  }));
  const totalBudgetPlan = programs.reduce((s, p) => s + (p.budget_plan || 0), 0);

  return (
    <div className="space-y-5">
      {/* -- Header -- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen size={24} className="text-indigo-600" />
            APTC Training Plan
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">IATF 16949 — Clause 7.2 Competence &amp; Awareness</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Year selector */}
          <div className="flex items-center gap-1">
            <div className="relative">
              <select
                value={selectedYear}
                onChange={(e) => { setSelectedYear(Number(e.target.value)); fetchData(Number(e.target.value)); }}
                className="appearance-none pl-3 pr-8 py-2 text-sm font-semibold border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-400 shadow-sm"
              >
                {availYears.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
            {/* Add new year */}
            {canEditPlan && !showAddYear && (
              <button
                onClick={() => { setShowAddYear(true); setNewYearInput(String(selectedYear + 1)); }}
                className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-indigo-600"
                title="Add new year"
              >
                <Plus size={15} />
              </button>
            )}
            {showAddYear && (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={newYearInput}
                  onChange={(e) => setNewYearInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddYear(); if (e.key === 'Escape') setShowAddYear(false); }}
                  className="w-20 px-2 py-2 text-sm font-semibold border border-indigo-400 rounded-lg focus:outline-none"
                  autoFocus
                />
                <button onClick={handleAddYear} className="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700" title="Confirm">
                  <Check size={14} />
                </button>
                <button onClick={() => setShowAddYear(false)} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" title="Cancel">
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
          <button onClick={() => fetchData(selectedYear)} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" title="Refresh">
            <RefreshCw size={15} />
          </button>
          {/* Log button */}
          {isEditor && (
            <button onClick={openApprovalLog} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-indigo-600" title="View audit log">
              <ClipboardList size={15} />
            </button>
          )}
          {/* Approval action buttons */}
          {canSubmit && (
            <button
              onClick={() => { setApprovalModalAction('submit'); setApprovalComment(''); setShowApprovalModal(true); }}
              className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 shadow">
              <Send size={14} />Submit for Review
            </button>
          )}
          {canCheck && (
            <>
              <button
                onClick={() => { setApprovalModalAction('check_approve'); setApprovalComment(''); setShowApprovalModal(true); }}
                className="flex items-center gap-2 bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 shadow">
                <CheckCircle size={14} />Check Approve
              </button>
              <button
                onClick={() => { setApprovalModalAction('check_reject'); setApprovalComment(''); setShowApprovalModal(true); }}
                className="flex items-center gap-2 bg-rose-600 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-rose-700 shadow">
                <X size={14} />Reject
              </button>
            </>
          )}
          {canApprove && (
            <>
              <button
                onClick={() => { setApprovalModalAction('final_approve'); setApprovalComment(''); setShowApprovalModal(true); }}
                className="flex items-center gap-2 bg-emerald-700 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-800 shadow">
                <Shield size={14} />Approve (President)
              </button>
              <button
                onClick={() => { setApprovalModalAction('final_reject'); setApprovalComment(''); setShowApprovalModal(true); }}
                className="flex items-center gap-2 bg-rose-600 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-rose-700 shadow">
                <X size={14} />Reject
              </button>
            </>
          )}
          {canRequestEdit && (
            <button
              onClick={() => { setEditReqReason(''); setShowEditReqModal(true); }}
              className="flex items-center gap-2 border border-amber-400 text-amber-700 bg-amber-50 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-amber-100">
              <Unlock size={14} />Request Edit
            </button>
          )}
          {canReviewEdit && (
            <button
              onClick={() => {
                const req = pendingEditReqs[0];
                setReviewRequestId(req.id);
                setReviewAction('approve');
                setReviewComment('');
                setShowReviewModal(true);
              }}
              className="flex items-center gap-2 border border-orange-400 text-orange-700 bg-orange-50 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-orange-100">
              <Eye size={14} />Review Edit Request ({pendingEditReqs.length})
            </button>
          )}
          {canEditPlan && programs.length === 0 && (
            <button onClick={handleSeed} disabled={seeding}
              className="flex items-center gap-2 border border-amber-300 text-amber-700 bg-amber-50 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-amber-100 disabled:opacity-60">
              <Download size={15} />{seeding ? 'Loading...' : 'Load Default Data'}
            </button>
          )}
          {canEditPlan && (
            <button onClick={openAdd}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 shadow">
              <Plus size={15} />Add Training
            </button>
          )}
        </div>
      </div>

      {/* -- Approval Progress Stepper -- */}
      {(() => {
        const STEPS = [
          { label: 'Draft',              sub: 'Prepared'  },
          { label: 'Manager Check',      sub: 'Review'    },
          { label: 'President Approval', sub: 'Sign-off'  },
          { label: 'Approved',           sub: 'Locked'    },
        ];
        const isRejected       = approvalStatus === 'rejected';
        const isEditUnlocked   = approvalStatus === 'edit_unlocked';
        const isFullyApproved  = approvalStatus === 'approved' || isEditUnlocked;
        const rejectedAtApprove = isRejected && Boolean(approval?.approve_comment);
        const stepMap: Record<string, number> = { draft: 0, pending_check: 1, pending_approval: 2, approved: 3, edit_unlocked: 3 };
        const curStep = isRejected ? (rejectedAtApprove ? 2 : 1) : (stepMap[approvalStatus] ?? 0);
        const statusMsg: Record<string, string> = {
          draft:            'Plan is being prepared — submit for check when ready.',
          pending_check:    'Submitted — waiting for Manager review.',
          pending_approval: 'Manager approved — waiting for President final sign-off.',
          approved:         'Plan approved & locked. Only actual data can be updated.',
          edit_unlocked:    'Temporarily unlocked for editing. Re-submit after changes.',
          rejected:         'Plan was rejected. Review the comment below and re-submit.',
        };
        return (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
            <div className="flex items-start">
              {STEPS.map((step, i) => {
                const done   = isFullyApproved || i < curStep;
                const active = !isFullyApproved && !isRejected && i === curStep;
                const failed = isRejected && i === curStep;
                const isLast = i === STEPS.length - 1;
                const connDone = isFullyApproved || i < curStep;
                const circCls = failed  ? 'bg-rose-500 border-rose-500 text-white'
                  : done    ? 'bg-emerald-500 border-emerald-500 text-white'
                  : active && i >= 2 ? 'bg-amber-400 border-amber-400 text-white ring-4 ring-amber-100'
                  : active  ? 'bg-sky-500 border-sky-500 text-white ring-4 ring-sky-100'
                  :           'bg-white border-slate-300 text-slate-400';
                const lblCls = failed ? 'text-rose-600' : done ? 'text-emerald-700'
                  : active && i >= 2 ? 'text-amber-700' : active ? 'text-sky-700' : 'text-slate-400';
                return (
                  <React.Fragment key={step.label}>
                    <div className="flex flex-col items-center" style={{ minWidth: 76 }}>
                      <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${circCls}`}>
                        {done   && <Check size={14} strokeWidth={3} />}
                        {failed && <X size={14} strokeWidth={3} />}
                        {!done && !failed && <span className="text-[11px] font-bold">{i + 1}</span>}
                      </div>
                      <span className={`mt-1.5 text-[11px] font-semibold text-center leading-tight ${lblCls}`}>{step.label}</span>
                      <span className="text-[10px] text-slate-400 text-center leading-tight mt-0.5">{step.sub}</span>
                    </div>
                    {!isLast && <div className={`flex-1 h-0.5 mt-4 mx-1 transition-all duration-300 ${connDone ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
                  </React.Fragment>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap text-xs">
              <span className={isRejected ? 'text-rose-600 font-medium' : isEditUnlocked ? 'text-orange-600 font-medium' : isFullyApproved ? 'text-emerald-700 font-medium' : 'text-slate-600'}>
                {statusMsg[approvalStatus] || statusMsg.draft}
              </span>
              {isRejected && (approval?.approve_comment || approval?.check_comment) && (
                <span className="text-rose-700 font-semibold">— "{approval.approve_comment || approval.check_comment}"</span>
              )}
              {isFullyApproved && !isEditUnlocked && approval?.approved_at && (
                <span className="ml-auto text-emerald-600 font-medium">Approved {new Date(approval.approved_at).toLocaleDateString()}</span>
              )}
              {isEditUnlocked && (
                <span className="ml-auto text-orange-600 font-semibold flex items-center gap-1"><Unlock size={11} /> Unlocked for editing</span>
              )}
            </div>
          </div>
        );
      })()}

      {error && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm flex items-center justify-between"><span>{error}</span><button onClick={() => setError('')} className="ml-2 text-rose-400 hover:text-rose-600"><X size={14}/></button></div>}

      {/* -- Non-editor lock screen -- */}
      {!planVisible ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-16 flex flex-col items-center justify-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
            <Lock size={28} className="text-slate-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-700">Training Plan is under the approval process</h3>
            <p className="text-slate-400 text-sm mt-1">The plan will be visible once it has been officially approved.</p>
          </div>
        </div>
      ) : (
      <>
      {/* -- Legend -- */}
      <div className="flex items-center gap-5 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-sm bg-indigo-500 inline-block" /> = PLAN</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-sm bg-emerald-500 inline-block" /> = ACTUAL</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-sm border-2 border-dashed border-slate-300 inline-block" /> = not planned</span>
        {isLocked && <span className="flex items-center gap-1 ml-auto text-amber-600 font-semibold"><Lock size={11}/>Plan locked — actual editing only</span>}
      </div>

      {/* -- Main table -- */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-3" />
          <p>Loading...</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="table-wrap" style={{ '--thead-row1-height': '34px' } as React.CSSProperties}>
            <table className="w-full text-xs min-w-[1400px] border-collapse">
              {/* - Head - */}
              <thead>
                {/* Row 1 — group headers */}
                <tr className="bg-slate-800 text-white">
                  <th rowSpan={2} className="border border-slate-600 px-2 py-2 text-center w-8">No.</th>
                  <th rowSpan={2} className="border border-slate-600 px-3 py-2 text-left min-w-[220px]">Training Items</th>
                  <th colSpan={4} className="border border-slate-600 px-2 py-2 text-center">Trainee Level</th>
                  <th rowSpan={2} className="border border-slate-600 px-2 py-2 text-center w-16">Method</th>
                  <th rowSpan={2} className="border border-slate-600 px-2 py-2 text-center w-14">Time (hr)</th>
                  <th rowSpan={2} className="border border-slate-600 px-2 py-2 text-center w-20">Budget</th>
                  <th rowSpan={2} className="border border-slate-600 px-2 py-2 text-center w-20">Actual</th>
                  <th rowSpan={2} className="border border-slate-600 px-2 py-2 text-center w-20">Trainer</th>
                  <th rowSpan={2} className="border border-slate-600 px-2 py-2 text-center w-14">Status</th>
                  {/* Q1 */}
                  <th colSpan={6} className="border border-slate-600 px-2 py-1 text-center bg-blue-700">Q1 &amp; Q2</th>
                  {/* Q3 */}
                  <th colSpan={6} className="border border-slate-600 px-2 py-1 text-center bg-indigo-700">Q3 &amp; Q4</th>
                  <th rowSpan={2} className="border border-slate-600 px-2 py-2 text-center w-24">Remark</th>
                  {canEditPlan && <th rowSpan={2} className="border border-slate-600 px-2 py-2 text-center w-16">Actions</th>}
                </tr>
                <tr className="bg-slate-700 text-white">
                  {[1,2,3,4].map((l) => (
                    <th key={l} className="border border-slate-600 px-1 py-1 text-center w-8">{l}</th>
                  ))}
                  {MONTHS.map((m) => (
                    <th key={m} className="border border-slate-600 px-1 py-1 text-center w-14">
                      <div>{m}</div>
                    </th>
                  ))}
                </tr>
              </thead>

              {/* - Body - */}
              <tbody>
                {programs.length === 0 ? (
                  <tr>
                    <td colSpan={canEditPlan ? 25 : 24} className="px-4 py-12 text-center text-slate-400">
                      <BookOpen size={32} className="mx-auto mb-2 opacity-30" />
                      <p>No training programs for {selectedYear}.</p>
                      {canEditPlan && (
                        <p className="text-sm mt-1">Click <strong>"Load Default Data"</strong> to populate from the standard plan, or <strong>"Add Training"</strong> to add manually.</p>
                      )}
                    </td>
                  </tr>
                ) : (
                  programs.map((prog, idx) => {
                    const planCount   = prog.schedule.filter((s) => s.plan).length;
                    const actualCount = prog.schedule.filter((s) => s.actual).length;
                    return (
                      <tr key={prog.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        {/* No. */}
                        <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500 font-medium">{idx + 1}</td>
                        {/* Training name */}
                        <td className="border border-slate-200 px-3 py-1.5 font-medium text-slate-800">{prog.training_name}</td>
                        {/* Levels */}
                        {[prog.level_1, prog.level_2, prog.level_3, prog.level_4].map((v, i) => (
                          <td key={i} className="border border-slate-200 px-1 py-1.5 text-center">
                            {v ? <span className="text-slate-700 font-bold">x</span> : <span className="text-slate-300">—</span>}
                          </td>
                        ))}
                        {/* Method */}
                        <td className="border border-slate-200 px-1 py-1.5 text-center font-semibold text-indigo-700">{prog.method_code}</td>
                        {/* Time */}
                        <td className="border border-slate-200 px-1 py-1.5 text-center text-slate-600">
                          {prog.duration_hours ?? '—'}
                        </td>
                        {/* Budget plan */}
                        <td className="border border-slate-200 px-1 py-1.5 text-center text-slate-600">
                          {prog.budget_plan ? prog.budget_plan.toLocaleString() : '—'}
                        </td>
                        {/* Budget actual — click to edit (always allowed for editors) */}
                        <td
                          className="border border-slate-200 px-1 py-1.5 text-center text-slate-600 min-w-[70px]"
                          onClick={() => {
                            if (!canEditActual) return;
                            setEditActualId(prog.id);
                            setEditActualVal(prog.budget_actual != null ? String(prog.budget_actual) : '');
                          }}
                        >
                          {editActualId === prog.id ? (
                            <input
                              type="number"
                              value={editActualVal}
                              autoFocus
                              onChange={(e) => setEditActualVal(e.target.value)}
                              onBlur={() => saveBudgetActual(prog)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveBudgetActual(prog);
                                if (e.key === 'Escape') setEditActualId(null);
                              }}
                              className="w-16 text-center text-sm border border-indigo-400 rounded px-1 py-0.5 focus:outline-none"
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span className={canEditActual ? 'cursor-pointer hover:text-indigo-600 hover:underline' : ''}>
                              {prog.budget_actual != null ? prog.budget_actual.toLocaleString() : <span className="text-slate-300">—</span>}
                            </span>
                          )}
                        </td>
                        {/* Trainer */}
                        <td className="border border-slate-200 px-1 py-1.5 text-center">
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                            prog.trainer_type === 'External' ? 'bg-orange-100 text-orange-700' :
                            prog.trainer_type === 'NBMT'     ? 'bg-purple-100 text-purple-700' :
                                                               'bg-slate-100 text-slate-600'
                          }`}>{prog.trainer_type || '—'}</span>
                        </td>
                        {/* Status (plan vs actual count) */}
                        <td className="border border-slate-200 px-1 py-1.5 text-center">
                          <div className="text-xs text-indigo-600 font-semibold">{planCount}</div>
                          <div className="text-xs text-emerald-600 font-semibold">{actualCount}</div>
                        </td>
                        {/* Month cells */}
                        {MONTHS.map((m) => {
                          const s = prog.schedule.find((x) => x.month === m)!;
                          return (
                            <td key={m} className="border border-slate-200 px-0.5 py-0.5 text-center w-14">
                              <div className="flex flex-col gap-0.5">
                                {/* Plan dot */}
                                <div className={`h-3 rounded-sm mx-0.5 transition-colors ${
                                  s.plan ? 'bg-indigo-500' : 'bg-slate-100'
                                }`} title={`${m} Plan`} />
                                {/* Actual dot — clickable for editors always */}
                                <div
                                  onClick={() => toggleActual(prog, m, s.actual)}
                                  className={`h-3 rounded-sm mx-0.5 transition-colors ${
                                    canEditActual ? 'cursor-pointer' : ''
                                  } ${s.actual ? 'bg-emerald-500' : s.plan ? 'bg-slate-200 hover:bg-emerald-200' : 'bg-slate-100'}`}
                                  title={canEditActual ? `Click to toggle Actual for ${m}` : `${m} Actual`}
                                />
                              </div>
                            </td>
                          );
                        })}
                        {/* Remark */}
                        <td className="border border-slate-200 px-2 py-1.5 text-rose-600 font-medium text-xs">{prog.remark || ''}</td>
                        {/* Actions — only when editor and plan not locked */}
                        {canEditPlan && (
                          <td className="border border-slate-200 px-1 py-1.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => openEdit(prog)} className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" title="Edit"><Edit2 size={13} /></button>
                              <button onClick={() => handleDelete(prog.id)} className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50" title="Delete"><Trash2 size={13} /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* - Footer totals - */}
              {programs.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 font-semibold text-slate-700 border-t-2 border-slate-300">
                    {/* No. + Training Items */}
                    <td colSpan={2} className="border border-slate-300 px-3 py-1.5 text-right text-xs">
                      Summary training / month
                    </td>
                    {/* Level 1-4 + Method + Time + Budget → show total budget */}
                    <td colSpan={7} className="border border-slate-300 px-1 py-1.5 text-center text-xs">
                      Budget: {totalBudgetPlan ? totalBudgetPlan.toLocaleString() : '—'}
                    </td>
                    {/* Actual + Trainer + Status — empty */}
                    <td colSpan={3} className="border border-slate-300 px-1 py-1.5 text-xs" />
                    {/* 12 month columns */}
                    {MONTHS.map((m, mi) => (
                      <td key={m} className="border border-slate-300 px-0.5 py-1 text-center w-14">
                        <div className="text-indigo-600 text-xs font-bold">{monthTotals[mi].plan}</div>
                        <div className="text-emerald-600 text-xs font-bold">{monthTotals[mi].actual}</div>
                      </td>
                    ))}
                    {/* Remark + Actions */}
                    <td colSpan={canEditPlan ? 2 : 1} className="border border-slate-300" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* -- Add / Edit Modal -- */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 px-4 py-8 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-900">{editId ? 'Edit' : 'Add'} Training Program</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            {error && <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Training name */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Training Name *</label>
                <input value={form.training_name} onChange={(e) => setForm((f) => ({ ...f, training_name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" required />
              </div>

              {/* Trainee levels + method */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">Trainee Level</label>
                  <div className="flex gap-3">
                    {[1,2,3,4].map((l) => {
                      const key = `level_${l}` as keyof typeof form;
                      return (
                        <label key={l} className="flex items-center gap-1 cursor-pointer">
                          <input type="checkbox" checked={!!form[key]}
                            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                            className="rounded border-slate-300 text-indigo-600" />
                          <span className="text-sm font-semibold text-slate-700">{l}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Training Method</label>
                  <select value={form.method_code}
                    onChange={(e) => {
                      const m = METHOD_OPTIONS.find((x) => x.code === e.target.value);
                      setForm((f) => ({ ...f, method_code: e.target.value, method_name: m?.name || '' }));
                    }}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
                    {METHOD_OPTIONS.map((m) => <option key={m.code} value={m.code}>{m.code} — {m.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Time / Budget / Trainer */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Time (hr)</label>
                  <input type="number" value={form.duration_hours ?? ''} onChange={(e) => setForm((f) => ({ ...f, duration_hours: e.target.value ? Number(e.target.value) : null }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Budget Plan</label>
                  <input type="number" value={form.budget_plan ?? ''} onChange={(e) => setForm((f) => ({ ...f, budget_plan: e.target.value ? Number(e.target.value) : null }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Trainer Type</label>
                  <select value={form.trainer_type} onChange={(e) => setForm((f) => ({ ...f, trainer_type: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
                    {['Internal','External','NBMT'].map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Monthly plan checkboxes */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Monthly Plan (tick months to plan)</label>
                <div className="grid grid-cols-6 gap-1.5">
                  {MONTHS.map((m) => {
                    const s = form.schedule.find((x) => x.month === m)!;
                    return (
                      <label key={m} className={`flex flex-col items-center gap-1 p-2 rounded-lg border cursor-pointer transition-colors ${
                        s.plan ? 'bg-indigo-50 border-indigo-300' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                      }`}>
                        <input type="checkbox" checked={s.plan}
                          onChange={(e) => setForm((f) => ({
                            ...f,
                            schedule: f.schedule.map((x) => x.month === m ? { ...x, plan: e.target.checked } : x),
                          }))}
                          className="sr-only" />
                        <span className="text-xs font-semibold text-slate-700">{m}</span>
                        {s.plan
                          ? <span className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center"><Check size={10} className="text-white" /></span>
                          : <span className="w-4 h-4 rounded-full border-2 border-slate-300" />
                        }
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Remark */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Remark</label>
                <input value={form.remark} onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
                  placeholder="e.g. All members, New comer...¿½"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60">
                  {saving ? 'Saving...' : editId ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </>
      )}

      {/* -- Approval Action Modal -- */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {approvalModalAction === 'submit'       && 'Submit Plan for Review'}
                {approvalModalAction === 'check_approve'&& 'Approve Check'}
                {approvalModalAction === 'check_reject' && 'Reject at Check Stage'}
                {approvalModalAction === 'final_approve'&& 'President Approval'}
                {approvalModalAction === 'final_reject' && 'Reject by President'}
              </h3>
              <button onClick={() => setShowApprovalModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Comment (optional)</label>
              <textarea
                value={approvalComment}
                onChange={(e) => setApprovalComment(e.target.value)}
                rows={3}
                placeholder="Add a comment..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowApprovalModal(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
              <button
                onClick={handleApprovalAction}
                disabled={submittingApproval}
                className={`px-5 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-60 ${
                  approvalModalAction.includes('reject') ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {submittingApproval ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -- Edit Request Modal -- */}
      {showEditReqModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">Request Plan Edit</h3>
              <button onClick={() => setShowEditReqModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              The plan is currently approved and locked. Describe why you need to make changes. Admin or Document Controller will review your request.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Reason for Edit *</label>
              <textarea
                value={editReqReason}
                onChange={(e) => setEditReqReason(e.target.value)}
                rows={4}
                placeholder="Explain what needs to be changed and why..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowEditReqModal(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
              <button
                onClick={handleEditRequest}
                disabled={submittingApproval || !editReqReason.trim()}
                className="px-5 py-2 text-sm font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-60"
              >
                {submittingApproval ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -- Review Edit Request Modal -- */}
      {showReviewModal && reviewRequestId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">Review Edit Request</h3>
              <button onClick={() => setShowReviewModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            {(() => {
              const req = pendingEditReqs.find(r => r.id === reviewRequestId);
              return req ? (
                <div className="mb-4 p-3 bg-slate-50 rounded-lg text-sm">
                  <p><span className="font-semibold text-slate-700">Requested by:</span> {req.requester_name || `User #${req.requested_by}`}</p>
                  <p className="mt-1"><span className="font-semibold text-slate-700">Reason:</span> {req.reason}</p>
                  <p className="mt-1 text-xs text-slate-400">{new Date(req.created_at).toLocaleString()}</p>
                </div>
              ) : null;
            })()}
            <div className="mb-3">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Decision</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="reviewAction" checked={reviewAction==='approve'}
                    onChange={() => setReviewAction('approve')} className="text-indigo-600" />
                  <span className="text-sm text-emerald-700 font-semibold">Approve (unlock plan)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="reviewAction" checked={reviewAction==='reject'}
                    onChange={() => setReviewAction('reject')} className="text-indigo-600" />
                  <span className="text-sm text-rose-700 font-semibold">Reject</span>
                </label>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Comment (optional)</label>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                rows={2}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowReviewModal(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
              <button
                onClick={handleReviewEditRequest}
                disabled={submittingApproval}
                className={`px-5 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-60 ${
                  reviewAction === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {submittingApproval ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -- Audit Log Modal -- */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 px-4 py-8 overflow-y-auto">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ClipboardList size={18} className="text-indigo-600" />
                Approval Log — {selectedYear}
              </h3>
              <button onClick={() => setShowLogModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            {approvalLog.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-6">No log entries yet.</p>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {approvalLog.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg text-xs">
                    <div className="w-2 h-2 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                    <div className="flex-1">
                      <span className="font-semibold text-slate-700">{entry.action.replace(/_/g,' ')}</span>
                      {entry.actor_name && <span className="ml-1 text-slate-500">by {entry.actor_name}</span>}
                      {entry.detail && <p className="text-slate-500 mt-0.5">{entry.detail}</p>}
                    </div>
                    <span className="text-slate-400 flex-shrink-0">{new Date(entry.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


