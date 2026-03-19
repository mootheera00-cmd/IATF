// pages/MaintenancePlan.tsx
// Yearly maintenance plan — tabs: Overview (Excel grid) + Plan Records (flat CRUD table)
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  History, Wrench, RefreshCw, Search, ExternalLink,
  Plus, Edit2, Trash2, X, ChevronDown, LayoutGrid, Table2, Settings,
  Paperclip, Calendar, AlertCircle, ListChecks, Map as MapIcon, Lock,
} from 'lucide-react';
import { maintenanceAPI } from '../api';
import MaintenanceFloorMap from '../components/MaintenanceFloorMap';
import { useAuth } from '../contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Equipment {
  id: number;
  equipment_no: number;
  equipment_name: string;
  year: number;
}

interface ActionCode {
  code: string;
  description: string | null;
  frequency: string | null;
}

interface PlanEvent {
  id: number;
  equipment_id: number;
  year: number;
  month: number;
  action_code: string | null;
  notes: string | null;
}

interface HistoryEntry {
  id: number;
  equipment_id: number;
  year: number;
  month: number;
  day: number | string | null;
  action_code: string | null;
  result: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Group by equipment_id → array
function groupById<T extends { equipment_id: number }>(rows: T[]): Map<number, T[]> {
  const m = new Map<number, T[]>();
  for (const r of rows) {
    if (!m.has(r.equipment_id)) m.set(r.equipment_id, []);
    m.get(r.equipment_id)!.push(r);
  }
  return m;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function MaintenancePlan() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Leader and above can plan; others can only input actual
  const canPlan = useMemo(() => {
    const role = String(user?.role || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    return ['ADMIN', 'LEADER', 'MANAGER', 'SUPERVISOR', 'DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER'].includes(role);
  }, [user]);

  const [availYears, setAvailYears]     = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [equipment, setEquipment]       = useState<Equipment[]>([]);
  const [actionCodes, setActionCodes]   = useState<ActionCode[]>([]);
  const [allPlan, setAllPlan]           = useState<PlanEvent[]>([]);
  const [allHistory, setAllHistory]     = useState<HistoryEntry[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');

  // ── Tab state ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'overview' | 'records' | 'floormap'>('floormap');

  // ── Plan Records tab state ────────────────────────────────────────────────
  const [recSearch,      setRecSearch]      = useState('');
  const [recStatusFilter,setRecStatusFilter]= useState<'all' | 'upcoming' | 'done' | 'postponed' | 'breakdown' | 'missed'>('all');
  const [recAcFilter,    setRecAcFilter]    = useState('');
  const [showPlanForm,   setShowPlanForm]   = useState(false);
  const [editingPlan,    setEditingPlan]    = useState<PlanEvent | null>(null);
  const [planForm,       setPlanForm]       = useState({ equipment_id: 0, month: 1, action_code: '', notes: '' });
  const [planSaving,     setPlanSaving]     = useState(false);
  const [planError,      setPlanError]      = useState('');

  // ── Action Code editor state (legend panel) ───────────────────────────────
  const [editingAc,  setEditingAc]  = useState<ActionCode | null>(null);  // null = new
  const [showAcForm, setShowAcForm] = useState(false);
  const [acForm,     setAcForm]     = useState({ code: '', description: '', frequency: '' });
  const [acSaving,   setAcSaving]   = useState(false);
  const [acError,    setAcError]    = useState('');

  // ── Overview grid: click-to-edit modal ────────────────────────────────────
  // cellCtx = the equipment+month the user clicked on, plus whether it was Plan or Actual row
  const [cellCtx, setCellCtx] = useState<{ eq: Equipment; month: number; mode: 'plan' | 'actual' } | null>(null);
  // histForm is used when mode='actual'
  const [histForm, setHistForm] = useState({ day: '', result: 'Done', remark: '' });
  const [histFile, setHistFile]         = useState<File | null>(null);
  const histFileRef                     = useRef<HTMLInputElement>(null);
  const [planAcForCell, setPlanAcForCell] = useState(''); // selected action code for actual
  const [planAcsForCell, setPlanAcsForCell] = useState<string[]>([]); // all planned codes for the cell
  const [editingHist, setEditingHist] = useState<HistoryEntry | null>(null);
  const [histByCode,  setHistByCode]  = useState<Map<string, HistoryEntry>>(new Map());
  const [histSaving,  setHistSaving]  = useState(false);
  const [histError,   setHistError]   = useState('');
  // Plan cell: "add code" picker state
  const [addCodeValue, setAddCodeValue] = useState('');
  const [addCodeSaving, setAddCodeSaving] = useState(false);

  // ── Add Year ──────────────────────────────────────────────────────────────
  const [showAddYear, setShowAddYear] = useState(false);
  const [newYearVal,  setNewYearVal]  = useState('');
  const [addingYear,  setAddingYear]  = useState(false);

  // ── Equipment management (add/remove per year) ────────────────────────────
  const [showEqManager,  setShowEqManager]  = useState(false);
  const [showAddEqForm,  setShowAddEqForm]  = useState(false);
  const [addEqForm,      setAddEqForm]      = useState({ equipment_no: '', equipment_name: '', location: '', notes: '' });
  const [addEqSaving,    setAddEqSaving]    = useState(false);
  const [addEqError,     setAddEqError]     = useState('');
  const fetchMeta = useCallback(async () => {
    try {
      const [yearsRes, acRes] = await Promise.all([
        maintenanceAPI.getYears(),
        maintenanceAPI.getActionCodes(),
      ]);
      const years: number[] = yearsRes.data.years || [];
      setAvailYears(years.length ? years : [new Date().getFullYear()]);
      setActionCodes(acRes.data.actionCodes || []);
    } catch {}
  }, []);

  // ── Load equipment + plan overview for year ───────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [eqRes, ovRes] = await Promise.all([
        maintenanceAPI.getEquipment(selectedYear),
        maintenanceAPI.getPlanOverview(selectedYear),
      ]);
      setEquipment(eqRes.data.equipment || []);
      setAllPlan(ovRes.data.plan || []);
      setAllHistory(ovRes.data.history || []);
    } catch {
      setEquipment([]); setAllPlan([]); setAllHistory([]);
    } finally { setLoading(false); }
  }, [selectedYear]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Lookup maps ───────────────────────────────────────────────────────────
  const planByEq  = useMemo(() => groupById(allPlan),    [allPlan]);
  const histByEq  = useMemo(() => groupById(allHistory), [allHistory]);
  const acMap     = useMemo(() => {
    const m = new Map<string, ActionCode>();
    actionCodes.forEach(ac => m.set(ac.code, ac));
    return m;
  }, [actionCodes]);

  // ── Filtered equipment list ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q
      ? equipment.filter(e => e.equipment_name.toLowerCase().includes(q) || String(e.equipment_no).includes(q))
      : equipment;
  }, [equipment, search]);

  // ── Group consecutive same-no equipment (e.g. 2024 eq#5 has 2 names) ─────
  // Build display rows: each item is either a single equipment or a "grouped" pair
  interface DisplayGroup {
    no: number;
    items: Equipment[];
  }
  const displayGroups = useMemo((): DisplayGroup[] => {
    const groups: DisplayGroup[] = [];
    for (const eq of filtered) {
      const last = groups[groups.length - 1];
      if (last && last.no === eq.equipment_no) {
        last.items.push(eq);
      } else {
        groups.push({ no: eq.equipment_no, items: [eq] });
      }
    }
    return groups;
  }, [filtered]);

  // today
  const todayYear  = new Date().getFullYear();
  const todayMonth = new Date().getMonth() + 1;

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let planned = allPlan.length;
    let done = 0, postponed = 0, breakdown = 0;
    allHistory.forEach(h => {
      if (h.result === 'Done')           done++;
      else if (h.result === 'Postponed') postponed++;
      else if (h.result === 'Breakdown') breakdown++;
    });
    return { planned, done, postponed, breakdown };
  }, [allPlan, allHistory]);

  // ── Action codes that have descriptions (for legend) ─────────────────────
  const legendCodes = useMemo(() => actionCodes.filter(ac => ac.description), [actionCodes]);

  // ── Plan Records: status per plan event ──────────────────────────────────
  type PlanStatus = 'done' | 'postponed' | 'breakdown' | 'upcoming' | 'missed';
  function getPlanStatus(pe: PlanEvent): PlanStatus {
    const hist = allHistory.find(h =>
      h.equipment_id === pe.equipment_id &&
      h.year  === pe.year &&
      h.month === pe.month
    );
    if (hist) {
      const r = hist.result?.toLowerCase();
      if (r === 'done')      return 'done';
      if (r === 'postponed') return 'postponed';
      if (r === 'breakdown') return 'breakdown';
      return 'done';
    }
    const isPast = pe.year < todayYear || (pe.year === todayYear && pe.month < todayMonth);
    return isPast ? 'missed' : 'upcoming';
  }

  // ── Plan Records: filtered rows ───────────────────────────────────────────
  const eqNameMap = useMemo(() => {
    const m = new Map<number, Equipment>();
    equipment.forEach(e => m.set(e.id, e));
    return m;
  }, [equipment]);

  const filteredRecords = useMemo(() => {
    const q = recSearch.toLowerCase();
    return allPlan.filter(pe => {
      const eq = eqNameMap.get(pe.equipment_id);
      if (!eq) return false;
      const matchSearch = !q
        || eq.equipment_name.toLowerCase().includes(q)
        || (pe.action_code || '').toLowerCase().includes(q)
        || MONTHS[pe.month - 1].toLowerCase().includes(q);
      const matchAc  = !recAcFilter || pe.action_code === recAcFilter;
      const status   = getPlanStatus(pe);
      const matchSt  = recStatusFilter === 'all' || status === recStatusFilter;
      return matchSearch && matchAc && matchSt;
    });
  }, [allPlan, recSearch, recAcFilter, recStatusFilter, eqNameMap, allHistory, selectedYear]);

  // ── Plan Records CRUD ─────────────────────────────────────────────────────
  function openAddPlan() {
    setEditingPlan(null);
    setPlanForm({ equipment_id: equipment[0]?.id || 0, month: 1, action_code: '', notes: '' });
    setPlanError('');
    setShowPlanForm(true);
  }
  function openEditPlan(pe: PlanEvent) {
    setEditingPlan(pe);
    setPlanForm({
      equipment_id: pe.equipment_id,
      month:        pe.month,
      action_code:  pe.action_code || '',
      notes:        pe.notes || '',
    });
    setPlanError('');
    setShowPlanForm(true);
  }
  async function savePlan() {
    if (!planForm.equipment_id || !planForm.month) {
      setPlanError('Equipment and month are required.');
      return;
    }
    try {
      setPlanSaving(true);
      const payload = {
        equipment_id: planForm.equipment_id,
        year:         selectedYear,
        month:        planForm.month,
        action_code:  planForm.action_code || null,
        notes:        planForm.notes || null,
      };
      if (editingPlan) {
        await maintenanceAPI.updatePlanEvent(editingPlan.id, payload);
      } else {
        await maintenanceAPI.addPlanEvent(payload);
      }
      setShowPlanForm(false);
      setCellCtx(null);
      fetchData();
    } catch (e: any) {
      setPlanError(e?.response?.data?.error || 'Save failed');
    } finally {
      setPlanSaving(false);
    }
  }
  async function deletePlan(pe: PlanEvent) {
    const eq = eqNameMap.get(pe.equipment_id);
    if (!confirm(`Delete plan event: ${eq?.equipment_name || pe.equipment_id} — ${MONTHS[pe.month - 1]} (${pe.action_code || '–'})?`)) return;
    try {
      await maintenanceAPI.deletePlanEvent(pe.id);
      setShowPlanForm(false);
      setCellCtx(null);
      fetchData();
    } catch {}
  }

  // ── Cell plan: add a single code to a month ──────────────────────────────
  async function addCodeToCell(eq: Equipment, month: number, code: string) {
    if (!code) return;
    // Avoid duplicate
    const existing = (planByEq.get(eq.id) || []).filter(p => p.month === month);
    if (existing.some(p => p.action_code === code)) {
      setPlanError(`Code "${code}" already planned for this month.`);
      return;
    }
    try {
      setAddCodeSaving(true);
      setPlanError('');
      await maintenanceAPI.addPlanEvent({
        equipment_id: eq.id,
        year: selectedYear,
        month,
        action_code: code,
        notes: null,
      });
      setAddCodeValue('');
      fetchData();
    } catch (e: any) {
      setPlanError(e?.response?.data?.error || 'Failed to add code.');
    } finally { setAddCodeSaving(false); }
  }

  async function removeCodeFromCell(pe: PlanEvent) {
    try {
      await maintenanceAPI.deletePlanEvent(pe.id);
      fetchData();
    } catch {}
  }

  // ── Action Code CRUD ──────────────────────────────────────────────────────
  function openAddAc() {
    setEditingAc(null);
    setAcForm({ code: '', description: '', frequency: '' });
    setAcError('');
    setShowAcForm(true);
  }
  function openEditAc(ac: ActionCode) {
    setEditingAc(ac);
    setAcForm({ code: ac.code, description: ac.description || '', frequency: ac.frequency || '' });
    setAcError('');
    setShowAcForm(true);
  }
  async function saveAc() {
    if (!acForm.code.trim()) { setAcError('Code is required.'); return; }
    try {
      setAcSaving(true);
      if (editingAc) {
        await maintenanceAPI.updateActionCode(editingAc.code, { description: acForm.description, frequency: acForm.frequency });
      } else {
        await maintenanceAPI.addActionCode({ code: acForm.code.trim().toUpperCase(), description: acForm.description, frequency: acForm.frequency });
      }
      setShowAcForm(false);
      fetchMeta();
    } catch (e: any) {
      setAcError(e?.response?.data?.error || 'Save failed');
    } finally { setAcSaving(false); }
  }
  async function deleteAc(ac: ActionCode) {
    if (!confirm(`Delete action code "${ac.code}"? This will not remove existing plan events.`)) return;
    try { await maintenanceAPI.deleteActionCode(ac.code); fetchMeta(); } catch {}
  }

  // ── Add Year ──────────────────────────────────────────────────────────────
  async function confirmAddYear() {
    const y = parseInt(newYearVal);
    if (!y || y < 2000 || y > 2099) return;
    if (availYears.includes(y)) {
      setSelectedYear(y);
      setShowAddYear(false);
      return;
    }
    try {
      setAddingYear(true);
      // Find the most recent year below the new one to carryover from
      const sourceYear = [...availYears].filter(yr => yr < y).sort((a, b) => b - a)[0]
        ?? availYears[availYears.length - 1];  // fallback: latest available
      if (sourceYear) {
        await maintenanceAPI.carryoverEquipment(sourceYear, y);
      }
      // Refresh years list + switch to new year
      const yearsRes = await maintenanceAPI.getYears();
      const years: number[] = yearsRes.data.years || [];
      setAvailYears(years.length ? years : [y]);
      setSelectedYear(y);
      setShowAddYear(false);
      setNewYearVal('');
    } catch {
      // Even if carryover fails, still register the year locally
      setAvailYears(prev => [...prev, y].sort((a, b) => a - b));
      setSelectedYear(y);
      setShowAddYear(false);
      setNewYearVal('');
    } finally {
      setAddingYear(false);
    }
  }

  // ── Equipment CRUD for selected year ──────────────────────────────────────
  async function addEquipmentToYear() {
    const no = parseInt(addEqForm.equipment_no);
    if (!no || !addEqForm.equipment_name.trim()) {
      setAddEqError('Equipment No. and Name are required.');
      return;
    }
    try {
      setAddEqSaving(true);
      await maintenanceAPI.addEquipment({
        equipment_no:   no,
        equipment_name: addEqForm.equipment_name.trim(),
        year:           selectedYear,
        location:       addEqForm.location || undefined,
        notes:          addEqForm.notes    || undefined,
      });
      setShowAddEqForm(false);
      setAddEqForm({ equipment_no: '', equipment_name: '', location: '', notes: '' });
      setAddEqError('');
      fetchData();
    } catch (e: any) {
      setAddEqError(e?.response?.data?.error || 'Failed to add equipment.');
    } finally {
      setAddEqSaving(false);
    }
  }
  async function removeEquipmentFromYear(eq: Equipment) {
    if (!confirm(
      `Remove "${eq.equipment_name}" (No. ${eq.equipment_no}) from ${selectedYear}?\n\n` +
      `This only removes it from ${selectedYear}. Past years and all history records are NOT affected.`
    )) return;
    try {
      await maintenanceAPI.removeEquipment(eq.id);
      fetchData();
    } catch {}
  }

  // ── Upcoming tasks (nearest unfinished plan event per equipment) ──────────
  interface UpcomingRow {
    eq:        Equipment;
    planEvent: PlanEvent;
    acInfo:    ActionCode | undefined;
    status:    PlanStatus;
    isPast:    boolean;
  }
  const upcomingRows = useMemo((): UpcomingRow[] => {
    const rows: UpcomingRow[] = [];
    for (const eq of equipment) {
      const events = (planByEq.get(eq.id) || []).slice().sort((a, b) => a.month - b.month);
      if (!events.length) continue;
      // Find the next upcoming event that has no history → prefer future months first
      const currentMonthForYear = selectedYear === todayYear ? todayMonth : (selectedYear < todayYear ? 13 : 0);
      const upcoming = events.find(pe => {
        const hasHist = allHistory.some(h => h.equipment_id === pe.equipment_id && h.year === pe.year && h.month === pe.month);
        return !hasHist && pe.month >= currentMonthForYear;
      });
      const target = upcoming || events[events.length - 1]; // fallback: last event
      const hasHist = allHistory.some(h => h.equipment_id === target.equipment_id && h.year === target.year && h.month === target.month);
      const isPast = target.year < todayYear || (target.year === todayYear && target.month < todayMonth);
      let status: PlanStatus = 'upcoming';
      if (hasHist) {
        const h = allHistory.find(hh => hh.equipment_id === target.equipment_id && hh.year === target.year && hh.month === target.month);
        const r = h?.result?.toLowerCase();
        if (r === 'done')      status = 'done';
        else if (r === 'postponed') status = 'postponed';
        else if (r === 'breakdown') status = 'breakdown';
        else status = 'done';
      } else if (isPast) {
        status = 'missed';
      }
      rows.push({ eq, planEvent: target, acInfo: target.action_code ? acMap.get(target.action_code) : undefined, status, isPast });
    }
    return rows;
  }, [equipment, planByEq, allHistory, acMap, selectedYear, todayYear, todayMonth]);
  function openCellPlan(eq: Equipment, month: number) {
    // Load all existing plan events for this cell
    const existing = (planByEq.get(eq.id) || []).filter(p => p.month === month);
    setEditingPlan(existing[0] || null);
    setPlanForm({
      equipment_id: eq.id,
      month,
      action_code: '',
      notes: existing[0]?.notes || '',
    });
    setAddCodeValue('');
    setPlanError('');
    setCellCtx({ eq, month, mode: 'plan' });
  }
  function openCellActual(eq: Equipment, month: number) {
    // Get ALL planned action codes for this month
    const planEvents = (planByEq.get(eq.id) || []).filter(p => p.month === month);
    const planCodes = planEvents.map(p => p.action_code).filter((c): c is string => !!c);
    setPlanAcsForCell(planCodes);

    // Build per-code history map so each code keeps its own record
    const existing = (histByEq.get(eq.id) || []).filter(h => h.month === month && h.year === selectedYear);
    const byCode = new Map<string, HistoryEntry>();
    existing.forEach(h => { if (h.action_code) byCode.set(h.action_code, h); });
    setHistByCode(byCode);

    // Default to first planned code (or first existing entry if no plan)
    const firstCode = planCodes[0] || '';
    setPlanAcForCell(firstCode);
    const firstHist = firstCode ? (byCode.get(firstCode) || null) : (existing[0] || null);
    setEditingHist(firstHist);
    setHistFile(null);
    setHistForm({
      day:    firstHist?.day != null ? String(firstHist.day) : '',
      result: firstHist?.result || 'Done',
      remark: '',
    });
    setHistError('');
    setCellCtx({ eq, month, mode: 'actual' });
  }
  async function saveCellActual() {
    const ctx = cellCtx;
    if (!ctx) return;
    try {
      setHistSaving(true);
      const fd = new FormData();
      fd.append('year',         String(selectedYear));
      fd.append('month',        String(ctx.month));
      if (histForm.day)          fd.append('day',         histForm.day);
      if (planAcForCell)         fd.append('action_code', planAcForCell);
      fd.append('result',       histForm.result);
      if (histForm.remark)       fd.append('remark',      histForm.remark);
      if (histFile)              fd.append('file',        histFile);
      if (editingHist) {
        await maintenanceAPI.updateHistory(editingHist.id, fd);
      } else {
        await maintenanceAPI.addHistory(ctx.eq.id, fd);
      }
      setCellCtx(null);
      setHistFile(null);
      fetchData();
    } catch (e: any) {
      setHistError(e?.response?.data?.error || 'Save failed');
    } finally { setHistSaving(false); }
  }
  async function deleteCellActual() {
    if (!editingHist) return;
    if (!confirm('Delete this actual record?')) return;
    try { await maintenanceAPI.deleteHistory(editingHist.id); setCellCtx(null); fetchData(); } catch {}
  }

  // ─── Render helpers ────────────────────────────────────────────────────────

  // Plan cell for a month: show all planned action codes — clickable only for planners
  function PlanCell({ eq, month }: { eq: Equipment; month: number }) {
    const eqId = eq.id;
    const events = (planByEq.get(eqId) || []).filter(p => p.month === month);
    return (
      <td
        className={`border border-slate-300 px-1 py-1 text-center bg-sky-50 transition-colors group ${canPlan ? 'cursor-pointer hover:bg-sky-100' : 'cursor-default'}`}
        onClick={() => canPlan && openCellPlan(eq, month)}
        title={canPlan ? 'Click to edit plan' : 'View only — Leader+ can edit plan'}
      >
        {events.length ? (
          <div className="flex flex-wrap gap-0.5 justify-center">
            {events.map((e, i) => (
              <span key={i} className="text-[11px] font-bold text-sky-800">{e.action_code}</span>
            ))}
          </div>
        ) : (
          <span className={`text-xs ${canPlan ? 'text-slate-200 group-hover:text-sky-400' : 'text-slate-200'}`}>+</span>
        )}
      </td>
    );
  }

  // Actual cell for a month — clickable
  function ActualCell({ eq, month }: { eq: Equipment; month: number }) {
    const eqId = eq.id;
    const hist = (histByEq.get(eqId) || []).filter(h => h.month === month);
    const plan = (planByEq.get(eqId) || []).filter(p => p.month === month);
    const isPastMonth = selectedYear < todayYear || (selectedYear === todayYear && month < todayMonth);

    // Sort hist entries to match the plan's action code order (H before I, etc.)
    const planCodeOrder = plan.map(p => p.action_code);
    const sortedHist = [...hist].sort((a, b) => {
      const ai = planCodeOrder.indexOf(a.action_code || '');
      const bi = planCodeOrder.indexOf(b.action_code || '');
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    });

    const bgClass = hist.length
      ? hist.every(h => h.result === 'Done') ? 'bg-emerald-100 hover:bg-emerald-200'
        : hist.some(h => h.result === 'Breakdown') ? 'bg-rose-100 hover:bg-rose-200'
        : hist.some(h => h.result === 'Postponed') ? 'bg-amber-100 hover:bg-amber-200'
        : 'bg-emerald-50 hover:bg-emerald-100'
      : (plan.length > 0 && isPastMonth)
        ? 'bg-amber-50 hover:bg-amber-100'
        : 'hover:bg-emerald-50/50';

    return (
      <td
        className={`border border-slate-300 px-0.5 py-1 text-center cursor-pointer transition-colors group ${bgClass}`}
        onClick={() => openCellActual(eq, month)}
        title="Click to edit actual"
      >
        {hist.length === 0 ? (
          plan.length > 0 && isPastMonth
            ? <span className="text-[10px] text-amber-600 font-semibold">—</span>
            : <span className="text-slate-200 text-xs group-hover:text-emerald-400">+</span>
        ) : (
          <div className="flex flex-wrap gap-0.5 justify-center items-center">
            {sortedHist.map((h, i) => {
              if (h.day == null && h.action_code) {
                return (
                  <span key={i} className={`text-[11px] font-bold ${h.result === 'Postponed' ? 'text-amber-700' : h.result === 'Breakdown' ? 'text-rose-700' : 'text-emerald-700'}`}
                    title={`${h.action_code} – ${h.result}`}>
                    {h.action_code}
                  </span>
                );
              }
              return (
                <span key={i} className={`text-[11px] font-semibold ${h.result === 'Done' ? 'text-emerald-800' : h.result === 'Breakdown' ? 'text-rose-700' : 'text-amber-700'}`}
                  title={h.action_code ? `${h.action_code} – ${h.result}` : h.result}>
                  {h.day}
                </span>
              );
            })}
          </div>
        )}
      </td>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4 bg-slate-50 min-h-screen">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Wrench size={20} className="text-orange-500" />
            Test equipment maintenance plan {selectedYear}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Plan vs Actual · {filtered.length} equipment</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/plan/maintenance/history')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-200 hover:bg-orange-100 transition-colors">
            <History size={13} /> History
          </button>
          {canPlan && (
          <button onClick={() => { setShowEqManager(true); setShowAddEqForm(false); setAddEqError(''); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 hover:bg-sky-100 transition-colors">
            <ListChecks size={13} /> Equipment
          </button>
          )}
          <button onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Year + Search + Stats ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {/* Year dropdown */}
          <div className="relative">
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="appearance-none pl-3 pr-8 py-1.5 text-xs font-bold border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:border-orange-400 hover:border-orange-300 transition-colors cursor-pointer"
            >
              {availYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {/* ── Add Year ── */}
          {showAddYear ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                type="number"
                value={newYearVal}
                onChange={e => setNewYearVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmAddYear(); if (e.key === 'Escape') setShowAddYear(false); }}
                placeholder="e.g. 2027"
                className="w-24 px-2 py-1.5 text-xs border border-orange-300 rounded-lg focus:outline-none focus:border-orange-500"
              />
              <button onClick={confirmAddYear} disabled={addingYear}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors">
                Add
              </button>
              <button onClick={() => setShowAddYear(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
                <X size={11} />
              </button>
            </div>
          ) : canPlan ? (
            <button
              onClick={() => { setShowAddYear(true); setNewYearVal(''); }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-dashed border-slate-300 text-slate-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
              title="Add a new year"
            >
              <Plus size={11} /> Add Year
            </button>
          ) : null}
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Filter equipment…"
            className="pl-7 pr-3 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300 bg-white w-48" />
        </div>
        <div className="flex items-center gap-2 ml-auto text-xs flex-wrap">
          <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">{stats.planned} planned</span>
          <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">{stats.done} done</span>
          <span className="px-2 py-1 rounded bg-amber-50 text-amber-700 font-semibold border border-amber-200">{stats.postponed} postponed</span>
          <span className="px-2 py-1 rounded bg-rose-50 text-rose-700 font-semibold border border-rose-200">{stats.breakdown} breakdown</span>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <LayoutGrid size={13} /> Overview
        </button>
        <button
          onClick={() => setActiveTab('records')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'records'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <Table2 size={13} /> Plan Records
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold">{allPlan.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('floormap')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'floormap'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <MapIcon size={13} /> Floor Map
        </button>
      </div>

      {/* ══════════════════ TAB: OVERVIEW ════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-4">

          {/* ── Upcoming tasks dashboard (compact) ─────────────────────────── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-700">
              <p className="text-xs font-bold text-white flex items-center gap-1.5">
                <Calendar size={12} className="opacity-80" />
                Upcoming / Next Action — {selectedYear} · {equipment.length} machine{equipment.length !== 1 ? 's' : ''}
              </p>
              <span className="text-[10px] text-slate-400">Nearest unfinished task per equipment</span>
            </div>
            {loading ? (
              <div className="p-8 text-center text-slate-400 text-xs">Loading…</div>
            ) : upcomingRows.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">No plan events found for {selectedYear}</div>
            ) : (
              <div className="table-wrap">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-600">
                      <th className="px-3 py-2 text-center font-bold w-8">No.</th>
                      <th className="px-3 py-2 text-left font-bold">Equipment Name</th>
                      <th className="px-3 py-2 text-center font-bold w-12">Code</th>
                      <th className="px-3 py-2 text-left font-bold">Checking Item</th>
                      <th className="px-3 py-2 text-center font-bold w-14">Freq.</th>
                      <th className="px-3 py-2 text-center font-bold w-16">Month</th>
                      <th className="px-3 py-2 text-center font-bold w-28">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {upcomingRows.map((row, idx) => {
                      const statusBadge: Record<PlanStatus, string> = {
                        upcoming:  'bg-indigo-50 text-indigo-700 border border-indigo-200',
                        done:      'bg-emerald-50 text-emerald-700 border border-emerald-200',
                        postponed: 'bg-amber-50 text-amber-700 border border-amber-200',
                        breakdown: 'bg-rose-50 text-rose-700 border border-rose-200',
                        missed:    'bg-slate-100 text-slate-500 border border-slate-200',
                      };
                      const statusLabel: Record<PlanStatus, string> = {
                        upcoming:  '⏳ Upcoming',
                        done:      '✅ Done',
                        postponed: '⚠️ Postponed',
                        breakdown: '🔴 Breakdown',
                        missed:    '– Missed',
                      };
                      const isUrgent = row.status === 'missed' || row.status === 'breakdown';
                      return (
                        <tr key={row.eq.id}
                          className={`transition-colors ${isUrgent ? 'bg-rose-50/40 hover:bg-rose-50' : 'hover:bg-orange-50/30'}`}>
                          <td className="px-3 py-2 text-center text-slate-400 font-medium">{idx + 1}</td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => navigate('/plan/maintenance/history', { state: { selectedId: row.eq.id, year: selectedYear } })}
                              className="text-left group">
                              <span className="font-semibold text-slate-800 group-hover:text-orange-600 transition-colors flex items-center gap-1">
                                {row.eq.equipment_name}
                                <ExternalLink size={9} className="opacity-0 group-hover:opacity-50 flex-shrink-0" />
                              </span>
                            </button>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {row.planEvent.action_code
                              ? <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-black text-[11px]">{row.planEvent.action_code}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-slate-500">{row.acInfo?.description ?? <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-center text-slate-400 text-[10px]">{row.acInfo?.frequency ?? '—'}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`font-semibold ${row.status === 'upcoming' ? 'text-indigo-600' : row.status === 'missed' ? 'text-rose-500' : 'text-slate-600'}`}>
                              {MONTHS[row.planEvent.month - 1]}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusBadge[row.status]}`}>
                              {statusLabel[row.status]}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Full 12-month grid + Legend side-by-side ───────────────────── */}
          <div className="flex gap-4 items-start">

          {/* ── Main grid ──────────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-16 text-center">
                <div className="inline-block animate-spin rounded-full h-7 w-7 border-b-2 border-orange-500 mb-2" />
                <p className="text-sm text-slate-400">Loading {selectedYear}…</p>
              </div>
            ) : displayGroups.length === 0 ? (
              <div className="p-16 text-center text-slate-400">
                <Wrench size={36} className="mx-auto mb-3 opacity-20" />
                <p>No equipment for {selectedYear}</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="w-full text-xs border-collapse" style={{ minWidth: 900 }}>
                  <thead>
                    <tr className="bg-slate-700 text-white">
                      <th className="border border-slate-500 px-2 py-2 text-center font-bold w-8">No.</th>
                      <th className="border border-slate-500 px-2 py-2 text-left font-bold min-w-[160px]">Test equipment name</th>
                      <th className="border border-slate-500 px-2 py-2 text-center font-bold w-14">Action</th>
                      {MONTHS.map((m, i) => {
                        const isNow = selectedYear === todayYear && (i + 1) === todayMonth;
                        return (
                          <th key={i} className={`border border-slate-500 px-1 py-2 text-center font-bold w-12 ${isNow ? 'bg-orange-600' : ''}`}>
                            {m}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {displayGroups.map((group) => (
                      <React.Fragment key={`grp-${group.no}`}>
                        {group.items.map((eq, idx) => (
                          <React.Fragment key={eq.id}>
                            <tr className="hover:bg-blue-50/30">
                              {idx === 0 && (
                                <td rowSpan={group.items.length * 2}
                                  className="border border-slate-300 text-center font-bold text-slate-700 align-middle bg-slate-50">
                                  {group.no}
                                </td>
                              )}
                              <td rowSpan={2} className="border border-slate-300 px-2 py-1 align-middle bg-white">
                                <button
                                  onClick={() => navigate('/plan/maintenance/history', { state: { selectedId: eq.id, year: selectedYear } })}
                                  className="text-left group w-full">
                                  <span className="font-semibold text-slate-800 leading-tight group-hover:text-orange-600 transition-colors flex items-center gap-1">
                                    {eq.equipment_name}
                                    <ExternalLink size={9} className="opacity-0 group-hover:opacity-50 flex-shrink-0" />
                                  </span>
                                </button>
                              </td>
                              <td className="border border-slate-300 px-1 py-1 text-center bg-sky-50 text-sky-700 font-bold text-[10px]">Plan</td>
                              {Array.from({ length: 12 }, (_, i) => <PlanCell key={i} eq={eq} month={i + 1} />)}
                            </tr>
                            <tr className="hover:bg-emerald-50/20">
                              <td className="border border-slate-300 px-1 py-1 text-center bg-emerald-50 text-emerald-700 font-bold text-[10px]">Actual</td>
                              {Array.from({ length: 12 }, (_, i) => <ActualCell key={i} eq={eq} month={i + 1} />)}
                            </tr>
                          </React.Fragment>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 flex flex-wrap gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-3 rounded bg-sky-100 border border-sky-300" /> Plan</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-3 rounded bg-emerald-100 border border-emerald-300" /> Actual – Done</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-3 rounded bg-amber-100 border border-amber-300" /> Actual – Postponed</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-3 rounded bg-rose-100 border border-rose-300" /> Actual – Breakdown</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-3 rounded bg-amber-50 border border-amber-200 border-dashed" /> Past – No actual recorded</span>
            </div>
          </div>

          {/* ── Legend ─────────────────────────────────────────────────────── */}
          <div className="w-64 flex-shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-700 text-white px-3 py-2 flex items-center justify-between">
              <p className="text-[11px] font-bold">Checking item list</p>
              {canPlan && (
              <button onClick={openAddAc}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-orange-500 hover:bg-orange-400 text-white font-semibold transition-colors"
                title="Add new action code">
                <Plus size={9} /> New
              </button>
              )}
            </div>
            <div className="table-wrap">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200">
                  <th className="border border-slate-200 px-2 py-1.5 text-center font-bold text-slate-600 w-8">Code</th>
                  <th className="border border-slate-200 px-2 py-1.5 text-left font-bold text-slate-600">Checking Item</th>
                  <th className="border border-slate-200 px-2 py-1.5 text-center font-bold text-slate-600 w-16">Freq.</th>
                  <th className="border border-slate-200 px-1 py-1.5 text-center font-bold text-slate-600 w-12">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {actionCodes.map((ac) => (
                  <tr key={ac.code} className={`hover:bg-slate-50 ${ac.description ? '' : 'opacity-40'}`}>
                    <td className="border border-slate-200 px-2 py-1.5 text-center font-black text-slate-700">{ac.code}</td>
                    <td className="border border-slate-200 px-2 py-1.5 text-slate-600 leading-tight">{ac.description || ''}</td>
                    <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500 leading-tight text-[9px]">{ac.frequency || ''}</td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        {canPlan ? (
                          <>
                            <button onClick={() => openEditAc(ac)} className="p-0.5 rounded text-sky-500 hover:bg-sky-50" title="Edit"><Edit2 size={10} /></button>
                            <button onClick={() => deleteAc(ac)} className="p-0.5 rounded text-rose-400 hover:bg-rose-50" title="Delete"><Trash2 size={10} /></button>
                          </>
                        ) : (
                          <Lock size={10} className="text-slate-300" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* ══════════════════ TAB: PLAN RECORDS ════════════════════════════════ */}
      {activeTab === 'records' && (
        <div className="space-y-3">

          {/* ── Toolbar ──────────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={recSearch} onChange={e => setRecSearch(e.target.value)}
                placeholder="Search equipment, action…"
                className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300 bg-white w-52"
              />
            </div>
            {/* Action code filter */}
            <div className="relative">
              <select
                value={recAcFilter} onChange={e => setRecAcFilter(e.target.value)}
                className="appearance-none pl-3 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-300"
              >
                <option value="">All action codes</option>
                {actionCodes.filter(ac => ac.description).map(ac => (
                  <option key={ac.code} value={ac.code}>{ac.code} – {ac.description}</option>
                ))}
              </select>
              <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
            {/* Status filter */}
            <div className="flex items-center gap-1">
              {(['all','upcoming','done','postponed','breakdown','missed'] as const).map(s => {
                const labels: Record<string, string> = {
                  all: 'All', upcoming: 'Upcoming', done: 'Done',
                  postponed: 'Postponed', breakdown: 'Breakdown', missed: 'Missed',
                };
                const colors: Record<string, string> = {
                  all:       recStatusFilter === 'all'       ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400',
                  upcoming:  recStatusFilter === 'upcoming'  ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-indigo-600 border-indigo-200 hover:border-indigo-400',
                  done:      recStatusFilter === 'done'      ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-emerald-600 border-emerald-200 hover:border-emerald-400',
                  postponed: recStatusFilter === 'postponed' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-amber-600 border-amber-200 hover:border-amber-400',
                  breakdown: recStatusFilter === 'breakdown' ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-rose-600 border-rose-200 hover:border-rose-400',
                  missed:    recStatusFilter === 'missed'    ? 'bg-slate-500 text-white border-slate-500' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400',
                };
                return (
                  <button key={s} onClick={() => setRecStatusFilter(s)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${colors[s]}`}>
                    {labels[s]}
                  </button>
                );
              })}
            </div>
            {/* Add button */}
            {canPlan && (
            <button onClick={openAddPlan}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-500 text-white hover:bg-orange-600 transition-colors">
              <Plus size={13} /> Add Plan Event
            </button>
            )}
            {!canPlan && <div className="ml-auto" />}
          </div>

          {/* ── Table ────────────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-16 text-center">
                <div className="inline-block animate-spin rounded-full h-7 w-7 border-b-2 border-orange-500 mb-2" />
                <p className="text-sm text-slate-400">Loading…</p>
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="p-16 text-center text-slate-400">
                <Table2 size={36} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm">No plan records found</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-700 text-white text-left">
                      <th className="px-3 py-2.5 font-semibold w-10">#</th>
                      <th className="px-3 py-2.5 font-semibold">Equipment Name</th>
                      <th className="px-3 py-2.5 font-semibold w-16 text-center">No.</th>
                      <th className="px-3 py-2.5 font-semibold w-16 text-center">Month</th>
                      <th className="px-3 py-2.5 font-semibold w-24 text-center">Action Code</th>
                      <th className="px-3 py-2.5 font-semibold">Description</th>
                      <th className="px-3 py-2.5 font-semibold w-24 text-center">Frequency</th>
                      <th className="px-3 py-2.5 font-semibold w-28 text-center">Status</th>
                      <th className="px-3 py-2.5 font-semibold w-24 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRecords.map((pe, idx) => {
                      const eq  = eqNameMap.get(pe.equipment_id);
                      const ac  = pe.action_code ? acMap.get(pe.action_code) : undefined;
                      const st  = getPlanStatus(pe);
                      const statusBadge: Record<PlanStatus, string> = {
                        upcoming:  'bg-indigo-50 text-indigo-700 border border-indigo-200',
                        done:      'bg-emerald-50 text-emerald-700 border border-emerald-200',
                        postponed: 'bg-amber-50 text-amber-700 border border-amber-200',
                        breakdown: 'bg-rose-50 text-rose-700 border border-rose-200',
                        missed:    'bg-slate-100 text-slate-500 border border-slate-200',
                      };
                      const statusLabel: Record<PlanStatus, string> = {
                        upcoming:  '⏳ Upcoming',
                        done:      '✅ Done',
                        postponed: '⚠️ Postponed',
                        breakdown: '🔴 Breakdown',
                        missed:    '– Missed',
                      };
                      return (
                        <tr key={pe.id} className="hover:bg-orange-50/30 transition-colors">
                          <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                          <td className="px-3 py-2 font-medium text-slate-800">
                            {eq?.equipment_name ?? <span className="text-slate-400 italic">Unknown</span>}
                          </td>
                          <td className="px-3 py-2 text-center text-slate-500">{eq?.equipment_no ?? '–'}</td>
                          <td className="px-3 py-2 text-center font-semibold text-slate-700">{MONTHS[pe.month - 1]}</td>
                          <td className="px-3 py-2 text-center">
                            {pe.action_code
                              ? <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-bold">{pe.action_code}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-slate-500">{ac?.description ?? '—'}</td>
                          <td className="px-3 py-2 text-center text-slate-400 text-[11px]">{ac?.frequency ?? '—'}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusBadge[st]}`}>
                              {statusLabel[st]}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {canPlan ? (
                                <>
                                  <button onClick={() => openEditPlan(pe)}
                                    className="p-1 rounded text-sky-600 hover:bg-sky-50 transition-colors" title="Edit">
                                    <Edit2 size={12} />
                                  </button>
                                  <button onClick={() => deletePlan(pe)}
                                    className="p-1 rounded text-rose-500 hover:bg-rose-50 transition-colors" title="Delete">
                                    <Trash2 size={12} />
                                  </button>
                                </>
                              ) : (
                                <Lock size={12} className="text-slate-300" />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-400">
              Showing {filteredRecords.length} of {allPlan.length} plan events for {selectedYear}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ TAB: FLOOR MAP ═══════════════════════════════════ */}
      {activeTab === 'floormap' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-4">
            <MapIcon size={16} className="text-orange-500" />
            <div>
              <p className="font-bold text-slate-800 text-sm">Equipment Floor Map — {selectedYear}</p>
              <p className="text-xs text-slate-400 mt-0.5">Click any machine to open its maintenance history · unlock to drag & rearrange</p>
            </div>
          </div>
          <MaintenanceFloorMap
            equipment={equipment}
            allHistory={allHistory}
            allPlan={allPlan}
            selectedYear={selectedYear}
          />
        </div>
      )}

      {/* ══════════════════ PLAN FORM MODAL ══════════════════════════════════ */}
      {showPlanForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Wrench size={15} className="text-orange-500" />
                {editingPlan ? 'Edit Plan Event' : 'Add Plan Event'}
              </h3>
              <button onClick={() => setShowPlanForm(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {planError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg px-3 py-2">{planError}</div>
              )}
              {/* Equipment */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Equipment <span className="text-rose-500">*</span></label>
                <div className="relative">
                  <select
                    value={planForm.equipment_id}
                    onChange={e => setPlanForm(f => ({ ...f, equipment_id: parseInt(e.target.value) }))}
                    className="w-full appearance-none pl-3 pr-7 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-400"
                  >
                    <option value={0} disabled>Select equipment…</option>
                    {equipment.map(eq => (
                      <option key={eq.id} value={eq.id}>#{eq.equipment_no} – {eq.equipment_name}</option>
                    ))}
                  </select>
                  <ChevronDown size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
              {/* Month */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Month <span className="text-rose-500">*</span></label>
                <div className="relative">
                  <select
                    value={planForm.month}
                    onChange={e => setPlanForm(f => ({ ...f, month: parseInt(e.target.value) }))}
                    className="w-full appearance-none pl-3 pr-7 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-400"
                  >
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                  <ChevronDown size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
              {/* Action Code */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Action Code</label>
                <div className="relative">
                  <select
                    value={planForm.action_code}
                    onChange={e => setPlanForm(f => ({ ...f, action_code: e.target.value }))}
                    className="w-full appearance-none pl-3 pr-7 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-400"
                  >
                    <option value="">— None —</option>
                    {actionCodes.filter(ac => ac.description).map(ac => (
                      <option key={ac.code} value={ac.code}>{ac.code} – {ac.description}</option>
                    ))}
                  </select>
                  <ChevronDown size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
                <textarea
                  value={planForm.notes}
                  onChange={e => setPlanForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg resize-none focus:outline-none focus:border-orange-400"
                  placeholder="Optional notes…"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setShowPlanForm(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                Cancel
              </button>
              <button onClick={savePlan} disabled={planSaving}
                className="px-4 py-2 text-xs font-semibold bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors">
                {planSaving ? 'Saving…' : editingPlan ? 'Save Changes' : 'Add Event'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ CELL CLICK MODAL (Overview Plan/Actual) ══════════ */}
      {cellCtx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                {cellCtx.mode === 'plan'
                  ? <><span className="px-2 py-0.5 rounded bg-sky-100 text-sky-700 font-bold text-xs">Plan</span></>
                  : <><span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-xs">Actual</span></>}
                <span className="text-slate-500 text-xs font-normal">{cellCtx.eq.equipment_name} · {MONTHS[cellCtx.month - 1]}</span>
              </h3>
              <button onClick={() => setCellCtx(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>

            {cellCtx.mode === 'plan' ? (
              /* ── Plan mode: multi-code manager ────────────────────────── */
              <div className="p-5 space-y-3">
                {!canPlan && (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                    <Lock size={12} />
                    <span>View only. Only Leader and above can edit the plan.</span>
                  </div>
                )}
                {planError && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg px-3 py-2">{planError}</div>}

                {/* Existing codes for this month */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">
                    Planned Action Codes
                    <span className="ml-1 text-slate-400 font-normal">(can add more than one)</span>
                  </label>
                  {(() => {
                    const existing = (planByEq.get(cellCtx.eq.id) || []).filter(p => p.month === cellCtx.month);
                    return existing.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No codes planned yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {existing.map(pe => (
                          <span key={pe.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-800 font-bold text-xs">
                            {pe.action_code || '—'}
                            {acMap.get(pe.action_code || '')?.description && (
                              <span className="font-normal text-sky-500 text-[10px]">· {acMap.get(pe.action_code || '')?.description}</span>
                            )}
                            {canPlan && (
                            <button type="button" onClick={() => removeCodeFromCell(pe)}
                              className="ml-0.5 text-slate-400 hover:text-rose-500 transition-colors" title="Remove">
                              <X size={11} />
                            </button>
                            )}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Add a new code */}
                {canPlan && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Add Code</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <select
                        value={addCodeValue}
                        onChange={e => { setAddCodeValue(e.target.value); setPlanError(''); }}
                        className="w-full appearance-none pl-3 pr-7 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-sky-400"
                      >
                        <option value="">— Select code —</option>
                        {actionCodes.map(ac => (
                          <option key={ac.code} value={ac.code}>{ac.code}{ac.description ? ` – ${ac.description}` : ''}</option>
                        ))}
                      </select>
                      <ChevronDown size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                    <button
                      disabled={!addCodeValue || addCodeSaving}
                      onClick={() => addCodeToCell(cellCtx.eq, cellCtx.month, addCodeValue)}
                      className="flex items-center gap-1 px-3 py-2 text-xs font-semibold bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-40 transition-colors">
                      <Plus size={12} /> Add
                    </button>
                  </div>
                </div>
                )}

                <div className="flex justify-end pt-1">
                  <button onClick={() => setCellCtx(null)}
                    className="px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">Done</button>
                </div>
              </div>
            ) : (
              /* ── Actual mode ────────────────────────────────────────────── */
              <div className="p-5 space-y-3">
                {histError && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg px-3 py-2">{histError}</div>}
                {/* ── Action code selector (from planned codes) ── */}
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">Period</span>
                      <span className="text-xs font-bold text-slate-700">
                        {MONTHS[cellCtx.month - 1]} {selectedYear}
                      </span>
                    </div>
                    {planAcsForCell.length > 0 ? (
                      <div>
                        <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide block mb-1">Action Code</span>
                        <div className="flex flex-wrap gap-1.5">
                          {planAcsForCell.map(code => {
                            const already = histByCode.has(code);
                            const selected = planAcForCell === code;
                            return (
                              <button key={code} type="button"
                                onClick={() => {
                                  setPlanAcForCell(code);
                                  const h = histByCode.get(code) || null;
                                  setEditingHist(h);
                                  setHistForm({
                                    day:    h?.day != null ? String(h.day) : '',
                                    result: h?.result || 'Done',
                                    remark: '',
                                  });
                                  setHistFile(null);
                                }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                                  selected
                                    ? 'bg-sky-600 text-white border-sky-600'
                                    : already
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                    : 'bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100'
                                }`}>
                                {already && !selected && <span className="mr-1 text-emerald-500">✓</span>}
                                {code}
                                {acMap.get(code)?.description && (
                                  <span className={`ml-1 font-normal text-[10px] ${selected ? 'text-sky-100' : already ? 'text-emerald-600' : 'text-sky-500'}`}>
                                    {acMap.get(code)?.description}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-[11px] text-amber-600">
                        <AlertCircle size={11} /> No action code planned for this month
                      </div>
                    )}
                  </div>

                  {/* ── Perform date + result ── */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Perform Day <span className="text-slate-400 font-normal">(of {MONTHS[cellCtx.month - 1]})</span></label>
                      <input type="text"
                        value={histForm.day} onChange={e => setHistForm(f => ({ ...f, day: e.target.value }))}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-400"
                        placeholder="e.g. 15 or 5-12" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Result</label>
                      <div className="relative">
                        <select value={histForm.result} onChange={e => setHistForm(f => ({ ...f, result: e.target.value }))}
                          className="w-full appearance-none pl-3 pr-7 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-400">
                          <option value="Done">✅ Done</option>
                          <option value="Postponed">⚠️ Postponed</option>
                          <option value="Breakdown">🔴 Breakdown</option>
                        </select>
                        <ChevronDown size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  {/* ── Remark ── */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Remark</label>
                    <input value={histForm.remark} onChange={e => setHistForm(f => ({ ...f, remark: e.target.value }))}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-400"
                      placeholder="Optional…" />
                  </div>

                  {/* ── File attachment ── */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                      <Paperclip size={11} /> Attach File
                      <span className="text-slate-400 font-normal">(PDF / image / Word / Excel)</span>
                    </label>
                    <div
                      className="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors cursor-pointer"
                      onClick={() => histFileRef.current?.click()}
                    >
                      <Paperclip size={12} className="text-slate-400 flex-shrink-0" />
                      <span className="text-xs text-slate-500 truncate flex-1">
                        {histFile ? histFile.name : 'Click to choose file…'}
                      </span>
                      {histFile && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setHistFile(null); if (histFileRef.current) histFileRef.current.value = ''; }}
                          className="text-slate-400 hover:text-rose-500 flex-shrink-0"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                    <input
                      ref={histFileRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx"
                      className="hidden"
                      onChange={e => setHistFile(e.target.files?.[0] || null)}
                    />
                  </div>

                  {/* ── Footer buttons ── */}
                  <div className="flex justify-between gap-2 pt-1">
                  {editingHist && (
                    <button onClick={deleteCellActual}
                      className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-rose-600 bg-rose-50 rounded-lg hover:bg-rose-100 transition-colors">
                      <Trash2 size={12} /> Delete
                    </button>
                  )}
                  <div className="flex gap-2 ml-auto">
                    <button onClick={() => setCellCtx(null)}
                      className="px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">Cancel</button>
                    <button onClick={saveCellActual} disabled={histSaving}
                      className="px-3 py-2 text-xs font-semibold bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors">
                      {histSaving ? 'Saving…' : 'Save Actual'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════ EQUIPMENT MANAGER MODAL ══════════════════════════ */}
      {showEqManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <ListChecks size={15} className="text-sky-500" />
                Equipment — {selectedYear}
                <span className="text-xs font-normal text-slate-400 ml-1">({equipment.length} items)</span>
              </h3>
              <button onClick={() => setShowEqManager(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            {/* Info banner */}
            <div className="px-5 py-2.5 bg-sky-50 border-b border-sky-100 text-[11px] text-sky-700 flex items-start gap-1.5 flex-shrink-0">
              <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
              <span>
                Changes here only affect <strong>{selectedYear}</strong>.
                Adding a new year automatically carries over this list. Removing equipment does <strong>not</strong> affect past years or existing history.
              </span>
            </div>

            {/* Equipment list */}
            <div className="overflow-y-auto flex-1 px-5 py-3">
              {equipment.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-8">No equipment for {selectedYear}</p>
              ) : (
                <div className="table-wrap">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600">
                      <th className="px-2 py-2 text-center font-bold border border-slate-200 w-10">No.</th>
                      <th className="px-2 py-2 text-left font-bold border border-slate-200">Name</th>
                      <th className="px-2 py-2 text-center font-bold border border-slate-200 w-16">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {equipment.map(eq => (
                      <tr key={eq.id} className="hover:bg-rose-50/20">
                        <td className="px-2 py-2 text-center text-slate-500 border border-slate-200 font-semibold">{eq.equipment_no}</td>
                        <td className="px-2 py-2 text-slate-800 border border-slate-200 font-medium">{eq.equipment_name}</td>
                        <td className="px-2 py-2 text-center border border-slate-200">
                          <button
                            onClick={() => removeEquipmentFromYear(eq)}
                            className="p-1 rounded text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                            title={`Remove from ${selectedYear}`}
                          >
                            <Trash2 size={11} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>

            {/* Add equipment form (toggled) */}
            <div className="border-t border-slate-100 px-5 py-4 flex-shrink-0 space-y-3">
              {!showAddEqForm ? (
                <button
                  onClick={() => { setShowAddEqForm(true); setAddEqError(''); setAddEqForm({ equipment_no: '', equipment_name: '', location: '', notes: '' }); }}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-dashed border-sky-300 text-sky-600 hover:bg-sky-50 transition-colors"
                >
                  <Plus size={13} /> Add Equipment to {selectedYear}
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-700">Add Equipment to {selectedYear}</p>
                  {addEqError && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg px-3 py-2">{addEqError}</div>
                  )}
                  <div className="grid grid-cols-4 gap-2">
                    <div className="col-span-1">
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">No. <span className="text-rose-400">*</span></label>
                      <input
                        type="number"
                        value={addEqForm.equipment_no}
                        onChange={e => setAddEqForm(f => ({ ...f, equipment_no: e.target.value }))}
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-sky-400"
                        placeholder="1"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">Equipment Name <span className="text-rose-400">*</span></label>
                      <input
                        value={addEqForm.equipment_name}
                        onChange={e => setAddEqForm(f => ({ ...f, equipment_name: e.target.value }))}
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-sky-400"
                        placeholder="e.g. Water Pump bearing No.1"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">Location</label>
                      <input
                        value={addEqForm.location}
                        onChange={e => setAddEqForm(f => ({ ...f, location: e.target.value }))}
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-sky-400"
                        placeholder="Optional"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">Notes</label>
                      <input
                        value={addEqForm.notes}
                        onChange={e => setAddEqForm(f => ({ ...f, notes: e.target.value }))}
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-sky-400"
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => setShowAddEqForm(false)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                      Cancel
                    </button>
                    <button onClick={addEquipmentToYear} disabled={addEqSaving}
                      className="px-3 py-1.5 text-xs font-semibold bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50 transition-colors">
                      {addEqSaving ? 'Adding…' : 'Add Equipment'}
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ══════════════════ ACTION CODE FORM MODAL ═══════════════════════════ */}
      {showAcForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Settings size={15} className="text-orange-500" />
                {editingAc ? `Edit Code "${editingAc.code}"` : 'New Action Code'}
              </h3>
              <button onClick={() => setShowAcForm(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              {acError && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg px-3 py-2">{acError}</div>}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Code <span className="text-rose-500">*</span></label>
                <input
                  value={acForm.code}
                  onChange={e => setAcForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  disabled={!!editingAc}
                  maxLength={4}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-orange-400 disabled:bg-slate-50 disabled:text-slate-400 font-bold uppercase"
                  placeholder="e.g. A, B, T…"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Checking Item / Description</label>
                <input
                  value={acForm.description}
                  onChange={e => setAcForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-orange-400"
                  placeholder="e.g. Thermo scan"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Frequency</label>
                <input
                  value={acForm.frequency}
                  onChange={e => setAcForm(f => ({ ...f, frequency: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-orange-400"
                  placeholder="e.g. 4×/yr, Every 2 years"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setShowAcForm(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">Cancel</button>
              <button onClick={saveAc} disabled={acSaving}
                className="px-4 py-2 text-xs font-semibold bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors">
                {acSaving ? 'Saving…' : editingAc ? 'Save Changes' : 'Add Code'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
