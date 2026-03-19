// frontend/src/pages/InHouseCalibrationPlan.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { inHouseCalibrationAPI } from '../api';
import {
  Gauge, Plus, CheckCircle, AlertTriangle, AlertCircle,
  Search, X, Edit2, Trash2, RefreshCw, FileSpreadsheet,
  ChevronUp, ChevronDown, ChevronsUpDown,
  Calendar, Table2, ChevronLeft, ChevronRight, History,
  UserCheck, UserX,
} from 'lucide-react';
import ExcelImportModal, { FieldDef, ImportResult } from '../components/ExcelImportModal';

interface Equipment {
  id: number;
  equipment_name: string;
  equipment_id: string;
  equipment_type: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  phone: string | null;
  fax: string | null;
  receive_date: string | null;
  location: string | null;
  calibration_method: string | null;
  calibration_interval: string | null;
  calibrated_by: string | null;
  acceptance_criteria: string | null;
  calibration_date: string | null;
  next_due_date: string;
  certificate_number: string | null;
  status: string;
  notes: string | null;
  calibration_status: 'OK' | 'Due Soon' | 'Overdue';
}

interface PicUser {
  id: number;
  name: string;
  employee_code: string;
  role: string;
}

interface PagePic {
  pic_user_id: number | null;
  pic_name: string | null;
  pic_employee_code: string | null;
}

const CALIB_STATUS_STYLE: Record<string, string> = {
  OK:        'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Due Soon':'bg-amber-100 text-amber-700 border-amber-200',
  Overdue:   'bg-rose-100 text-rose-700 border-rose-200',
};


const emptyForm = {
  equipment_name: '',
  equipment_id: '',
  equipment_type: 'Instrument',
  manufacturer: '',
  model: '',
  serial_number: '',
  phone: '',
  fax: '',
  receive_date: '',
  location: '',
  calibration_method: '',
  calibration_interval: '',
  calibrated_by: '',
  acceptance_criteria: '',
  calibration_date: '',
  next_due_date: '',
  certificate_number: '',
  notes: '',
};

export default function InHouseCalibrationPlan() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const normalizedRole = String((user as any)?.role || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const isAdmin = normalizedRole === 'ADMIN';
  const isDC = ['DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER'].includes(normalizedRole);
  const isPrivileged = isAdmin || isDC;
  const canImport = isPrivileged || normalizedRole === 'QMR';

  // page-level canEdit: privileged roles OR the assigned PIC
  const canEdit = (pagePic: PagePic | null) =>
    isPrivileged || (pagePic?.pic_user_id != null && pagePic.pic_user_id === Number((user as any)?.id));

  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [stats, setStats] = useState({ total: 0, overdue: 0, due_soon: 0, ok: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [detailItem, setDetailItem] = useState<Equipment | null>(null);
  const [sortKey, setSortKey] = useState<keyof Equipment>('next_due_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // ── view mode ──────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');
  const [calYear, setCalYear]   = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null); // 0-11

  // ── PIC modal state ────────────────────────────────────────────────────────
  const [showPicModal, setShowPicModal] = useState(false);
  const [pagePic, setPagePic] = useState<PagePic | null>(null);
  const [picUsers, setPicUsers] = useState<PicUser[]>([]);
  const [picSearch, setPicSearch] = useState('');
  const [picSaving, setPicSaving] = useState(false);

  // ── Excel import field definitions ─────────────────────────────────────────
  const IMPORT_FIELDS: FieldDef[] = [
    {
      key: 'equipment_name', label: 'Equipment Name', required: true,
      aliases: ['ชื่อครื่องมือ','ชื่อเครื่องมือ','instrument name','tool name','device name','name','equipment'],
    },
    {
      key: 'equipment_id', label: 'Instrument / Equipment ID', required: true,
      aliases: ['instrument no','instrument no.','instrument number','instrumentno','equipment id','equipment no','tag no','tag number','asset id','asset no','id'],
    },
    {
      key: 'equipment_type', label: 'Work Type / Category',
      aliases: ['ประเภทงานที่ใช้','ประเภท','work type','category','type','instrument type','tool type'],
    },
    {
      key: 'manufacturer', label: 'Manufacturer',
      aliases: ['บริษัทผู้ผลิต','ผู้ผลิต','manufacturer','make','brand','maker'],
    },
    {
      key: 'model', label: 'Model / Type',
      aliases: ['รุ่น / แบบเครื่องมือ','รุ่น','แบบ','model','model no','model number','part no','type model'],
    },
    {
      key: 'serial_number', label: 'Serial No.',
      aliases: ['serial no','serial no.','serial number','serialno','s/n','sn','serial'],
    },
    {
      key: 'phone', label: 'Phone (โทรศัพท์)',
      aliases: ['โทรศัพท์','โทร','phone','telephone','tel','tel no'],
    },
    {
      key: 'fax', label: 'Fax (แฟกซ์)',
      aliases: ['แฟกซ์','fax','fax no','facsimile'],
    },
    {
      key: 'receive_date', label: 'Receive Date (วันที่รับเข้า)', type: 'date',
      aliases: ['วันที่รับเข้า','วันรับ','receive date','received date','date received','intake date'],
    },
    {
      key: 'location', label: 'Storage Location (สถานที่จัดเก็บ)',
      aliases: ['สถานที่จัดเก็บ','สถานที่','location','storage location','area','dept','department','place','room'],
    },
    {
      key: 'calibration_method', label: 'Calibration Method (วิธีการสอบเทียบ)',
      aliases: ['วิธีการสอบเทียบ','วิธีการ','calibration method','method','calib method'],
    },
    {
      key: 'calibration_interval', label: 'Calibration Interval (ระยะเวลาในการทวนสอบ)',
      aliases: ['ระยะเวลาในการทวนสอบ','ระยะเวลา','calibration interval','interval','frequency','period','periodicity'],
    },
    {
      key: 'calibrated_by', label: 'Calibration Lab (ห้องปฏิบัติการสอบเทียบ)',
      aliases: ['ห้องปฏิบัติการสอบเทียบ','ห้องปฏิบัติการ','calibration lab','lab','laboratory','calibrated by','done by','performed by'],
    },
    {
      key: 'acceptance_criteria', label: 'Acceptance Criteria (เกณฑ์ในการตัดสินใจ)',
      aliases: ['เกณฑ์ในการตัดสินใจ','เกณฑ์','acceptance criteria','criteria','tolerance','accuracy'],
    },
    {
      key: 'certificate_number', label: 'Sheet / Reference No.',
      aliases: ['sheet name','sheet no','sheet number','sheetname','reference','ref no','cert no','certificate no','certificate number'],
    },
    {
      key: 'calibration_date', label: 'Last Calibration Date', type: 'date',
      aliases: ['date and cal.date','date and caldate','dateandcaldate','cal date','calib date','calibration date','calibrated date','last calibration','last cal date'],
    },
    {
      key: 'next_due_date', label: 'Next Calibration Due Date', required: true, type: 'date',
      aliases: ['date and cal.next cal','date and calnext cal','dateandcalnextcal','next cal','next calib','next calibration','next due date','next due','due date','expiry date','expiry'],
    },
  ];

  const SAMPLE_HEADERS = [
    'ชื่อครื่องมือ → Equipment Name',
    'INSTRUMENT NO → Equipment ID ★',
    'รุ่น / แบบเครื่องมือ → Model',
    'SERIAL NO',
    'ประเภทงานที่ใช้ → Work Type',
    'บริษัทผู้ผลิต → Manufacturer',
    'โทรศัพท์ → Phone',
    'แฟกซ์ → Fax',
    'วันที่รับเข้า → Receive Date',
    'สถานที่จัดเก็บ → Location',
    'วิธีการสอบเทียบ → Cal. Method',
    'ระยะเวลาในการทวนสอบ → Interval',
    'ห้องปฏิบัติการสอบเทียบ → Cal. Lab',
    'เกณฑ์ในการตัดสินใจ → Criteria',
    'Sheet name → Reference No.',
    'DATE AND CAL.DATE → Last Cal. Date',
    'DATE AND CAL.NEXT CAL → Next Due ★',
  ];

  const handleExcelImport = async (rows: Record<string,string>[]): Promise<ImportResult> => {
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.equipment_name || !row.equipment_id || !row.next_due_date) {
        errors.push(`Row ${i + 1}: Missing equipment name, ID or next due date — skipped.`);
        skipped++;
        continue;
      }

      try {
        await inHouseCalibrationAPI.create({
          equipment_name:       row.equipment_name,
          equipment_id:         row.equipment_id,
          equipment_type:       row.equipment_type       || 'Instrument',
          manufacturer:         row.manufacturer         || null,
          model:                row.model                || null,
          serial_number:        row.serial_number        || null,
          phone:                row.phone                || null,
          fax:                  row.fax                  || null,
          receive_date:         row.receive_date         || null,
          location:             row.location             || null,
          calibration_method:   row.calibration_method   || null,
          calibration_interval: row.calibration_interval || null,
          calibrated_by:        row.calibrated_by        || null,
          acceptance_criteria:  row.acceptance_criteria  || null,
          calibration_date:     row.calibration_date     || null,
          next_due_date:        row.next_due_date,
          certificate_number:   row.certificate_number   || null,
          notes:                row.notes                || null,
        } as any);
        imported++;
      } catch (e: any) {
        const msg = e?.response?.data?.error || e.message || '';
        if (msg.includes('UNIQUE') || msg.includes('already exists')) {
          errors.push(`Row ${i + 1}: Equipment ID "${row.equipment_id}" already exists — skipped.`);
        } else {
          errors.push(`Row ${i + 1}: ${msg}`);
        }
        skipped++;
      }
    }

    await fetchData();
    return { imported, skipped, errors };
  };

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [listRes, statsRes, picRes] = await Promise.all([
        inHouseCalibrationAPI.list(),
        inHouseCalibrationAPI.stats(),
        inHouseCalibrationAPI.getPic(),
      ]);
      setEquipment(listRes.data.equipment || []);
      setStats(statsRes.data.stats || { total: 0, overdue: 0, due_soon: 0, ok: 0 });
      setPagePic(picRes.data.pic || null);
    } catch {
      setError('Failed to load in-house calibration data.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.equipment_name || !form.equipment_id || !form.next_due_date) {
      setError('Equipment Name, Equipment ID and Next Due Date are required.');
      return;
    }
    try {
      setSaving(true);
      setError('');
      if (editId) {
        await inHouseCalibrationAPI.update(editId, form as any);
      } else {
        await inHouseCalibrationAPI.create(form as any);
      }
      setShowForm(false);
      setForm({ ...emptyForm });
      setEditId(null);
      await fetchData();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (eq: Equipment) => {
    setForm({
      equipment_name:       eq.equipment_name,
      equipment_id:         eq.equipment_id,
      equipment_type:       eq.equipment_type,
      manufacturer:         eq.manufacturer        || '',
      model:                eq.model               || '',
      serial_number:        eq.serial_number       || '',
      phone:                eq.phone               || '',
      fax:                  eq.fax                 || '',
      receive_date:         eq.receive_date        || '',
      location:             eq.location            || '',
      calibration_method:   eq.calibration_method  || '',
      calibration_interval: eq.calibration_interval|| '',
      calibrated_by:        eq.calibrated_by       || '',
      acceptance_criteria:  eq.acceptance_criteria || '',
      calibration_date:     eq.calibration_date    || '',
      next_due_date:        eq.next_due_date,
      certificate_number:   eq.certificate_number  || '',
      notes:                eq.notes               || '',
    });
    setEditId(eq.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this equipment record?')) return;
    try {
      await inHouseCalibrationAPI.remove(id);
      await fetchData();
    } catch {}
  };

  // ── PIC handlers ──────────────────────────────────────────────────────────
  const openPicModal = async () => {
    setPicSearch('');
    try {
      const res = await inHouseCalibrationAPI.getPicUsers();
      setPicUsers(res.data.users || []);
    } catch {
      setPicUsers([]);
    }
    setShowPicModal(true);
  };

  const handleAssignPic = async (userId: number | null) => {
    try {
      setPicSaving(true);
      await inHouseCalibrationAPI.assignPic(userId);
      setShowPicModal(false);
      await fetchData();
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to assign Person In Charge.');
    } finally {
      setPicSaving(false);
    }
  };

  const filtered = equipment.filter((eq) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      eq.equipment_name.toLowerCase().includes(q) ||
      eq.equipment_id.toLowerCase().includes(q) ||
      eq.location?.toLowerCase().includes(q) ||
      eq.manufacturer?.toLowerCase().includes(q);
    const matchStatus = filterStatus === 'ALL' || eq.calibration_status === filterStatus;
    return matchSearch && matchStatus;
  });

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] ?? '';
    const bv = b[sortKey] ?? '';
    const an = Number(av); const bn = Number(bv);
    const cmp = (!isNaN(an) && !isNaN(bn))
      ? an - bn
      : String(av).localeCompare(String(bv), undefined, { numeric: true });
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const daysUntilDue = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  // ── calendar data: group equipment by (year, month) of next_due_date ──────
  const calendarData = useMemo(() => {
    const map: Record<number, { items: Equipment[]; hasOverdue: boolean; hasDueSoon: boolean; hasOK: boolean }> = {};
    for (let m = 0; m < 12; m++) map[m] = { items: [], hasOverdue: false, hasDueSoon: false, hasOK: false };

    for (const eq of equipment) {
      if (!eq.next_due_date) continue;
      const d = new Date(eq.next_due_date);
      if (d.getFullYear() !== calYear) continue;
      const m = d.getMonth();
      map[m].items.push(eq);
      if (eq.calibration_status === 'Overdue')  map[m].hasOverdue  = true;
      if (eq.calibration_status === 'Due Soon') map[m].hasDueSoon  = true;
      if (eq.calibration_status === 'OK')       map[m].hasOK       = true;
    }
    return map;
  }, [equipment, calYear]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Gauge size={24} className="text-teal-600" />
            In-House Calibration Planning
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">IATF 16949 — Clause 7.1.5 · Internal calibration performed on-site</p>
        </div>
        <div className="flex gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden shadow-sm">
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${viewMode === 'table' ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              title="Table view"
            >
              <Table2 size={15} /> Table
            </button>
            <button
              onClick={() => { setViewMode('calendar'); setSelectedMonth(null); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${viewMode === 'calendar' ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              title="Yearly calendar view"
            >
              <Calendar size={15} /> Calendar
            </button>
          </div>

          <button
            onClick={fetchData}
            className="flex items-center gap-1 px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          {canImport && (
            <>
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-2 border border-emerald-300 text-emerald-700 bg-emerald-50 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-100 transition-colors"
              >
                <FileSpreadsheet size={16} />
                Import Excel
              </button>
            </>
          )}
          {isPrivileged && (
            <button
              onClick={() => openPicModal()}
              className="flex items-center gap-2 border border-violet-300 text-violet-700 bg-violet-50 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-violet-100 transition-colors"
              title="Assign Person In Charge for this page"
            >
              <UserCheck size={16} />
              {pagePic?.pic_name ? pagePic.pic_name : 'Person In Charge'}
            </button>
          )}
          <button
            onClick={() => { setForm({ ...emptyForm }); setEditId(null); setError(''); setShowForm(true); }}
            className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors shadow"
          >
            <Plus size={16} />
            Add Equipment
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {([
          { label: 'Total Equipment', value: stats.total,   icon: Gauge,         color: 'text-teal-600 bg-teal-50', filter: null },
          { label: 'OK',             value: stats.ok,       icon: CheckCircle,   color: 'text-emerald-600 bg-emerald-50', filter: null },
          { label: 'Due Soon (30d)', value: stats.due_soon, icon: AlertTriangle,  color: 'text-amber-600 bg-amber-50',   filter: 'Due Soon' },
          { label: 'Overdue',        value: stats.overdue,  icon: AlertCircle,   color: 'text-rose-600 bg-rose-50',     filter: 'Overdue' },
        ] as { label: string; value: number; icon: React.ElementType; color: string; filter: string | null }[]).map((s) => {
          const isClickable = s.filter !== null && s.value > 0;
          return (
            <div
              key={s.label}
              onClick={() => {
                if (!isClickable) return;
                setFilterStatus((prev) => prev === s.filter ? 'ALL' : s.filter!);
                setSearch('');
              }}
              className={[
                'bg-white rounded-xl border p-4 shadow-sm flex items-center gap-3 transition-all',
                isClickable
                  ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:scale-95'
                  : '',
                filterStatus === s.filter
                  ? 'ring-2 ring-offset-1 ' + (s.filter === 'Overdue' ? 'ring-rose-400 border-rose-300' : 'ring-amber-400 border-amber-300')
                  : 'border-slate-200',
              ].join(' ')}
            >
              <div className={`p-2 rounded-lg ${s.color}`}><s.icon size={20} /></div>
              <div className="flex-1 min-w-0">
                <p className="text-2xl font-bold text-slate-900">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
              {isClickable && (
                <span className="text-[10px] font-semibold text-slate-400 self-start mt-1">
                  {filterStatus === s.filter ? '✕ clear' : 'View →'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search equipment, ID, location…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-teal-400"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-400"
        >
          <option value="ALL">All Status</option>
          <option value="OK">OK</option>
          <option value="Due Soon">Due Soon</option>
          <option value="Overdue">Overdue</option>
        </select>
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} item(s)</span>
      </div>

      {/* ════════════════ CALENDAR VIEW ════════════════ */}
      {viewMode === 'calendar' && (
        <div className="space-y-4">
          {/* Year navigator */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-3 flex items-center justify-between">
            <button
              onClick={() => { setCalYear((y) => y - 1); setSelectedMonth(null); }}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="text-center">
              <p className="text-lg font-bold text-slate-900">{calYear}</p>
              <p className="text-xs text-slate-400">
                {equipment.filter((e) => {
                  const d = new Date(e.next_due_date);
                  return d.getFullYear() === calYear;
                }).length} equipment due this year
              </p>
            </div>
            <button
              onClick={() => { setCalYear((y) => y + 1); setSelectedMonth(null); }}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* 12 month boxes */}
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
            {Array.from({ length: 12 }, (_, m) => {
              const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
              const data = calendarData[m];
              const count = data.items.length;
              const isCurrentMonth = new Date().getFullYear() === calYear && new Date().getMonth() === m;
              const isSelected = selectedMonth === m;

              const bgColor =
                count === 0         ? 'bg-slate-50 border-slate-200'
                : data.hasOverdue   ? 'bg-rose-50 border-rose-300'
                : data.hasDueSoon   ? 'bg-amber-50 border-amber-300'
                : 'bg-emerald-50 border-emerald-300';

              const titleColor =
                count === 0         ? 'text-slate-400'
                : data.hasOverdue   ? 'text-rose-700'
                : data.hasDueSoon   ? 'text-amber-700'
                : 'text-emerald-700';

              return (
                <button
                  key={m}
                  onClick={() => setSelectedMonth(isSelected ? null : m)}
                  className={[
                    'relative rounded-xl border-2 p-4 text-left transition-all duration-150',
                    bgColor,
                    count > 0 ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:scale-95' : 'cursor-default',
                    isSelected ? 'ring-2 ring-teal-500 ring-offset-1 shadow-md' : '',
                    isCurrentMonth ? 'ring-2 ring-teal-300 ring-offset-1' : '',
                  ].join(' ')}
                >
                  <p className={`text-sm font-bold ${titleColor}`}>{MONTH_NAMES[m]}</p>

                  {count > 0 ? (
                    <p className={`text-2xl font-black mt-1 ${titleColor}`}>{count}</p>
                  ) : (
                    <p className="text-2xl font-black mt-1 text-slate-200">—</p>
                  )}
                  <p className="text-xs mt-0.5 text-slate-400">{count > 0 ? `tool${count !== 1 ? 's' : ''}` : 'no plans'}</p>

                  {count > 0 && (
                    <div className="flex gap-1 mt-2">
                      {data.hasOverdue  && <span className="w-2 h-2 rounded-full bg-rose-500"   title="Overdue" />}
                      {data.hasDueSoon  && <span className="w-2 h-2 rounded-full bg-amber-400"  title="Due Soon" />}
                      {data.hasOK       && <span className="w-2 h-2 rounded-full bg-emerald-500" title="OK" />}
                    </div>
                  )}

                  {isCurrentMonth && (
                    <span className="absolute top-2 right-2 text-[9px] font-bold bg-teal-500 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                      Now
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Month detail panel */}
          {selectedMonth !== null && (() => {
            const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            const data = calendarData[selectedMonth];
            const monthItems = [...data.items].sort((a, b) =>
              new Date(a.next_due_date).getTime() - new Date(b.next_due_date).getTime()
            );
            return (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {MONTH_NAMES[selectedMonth]} {calYear}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">{monthItems.length} equipment due this month</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {data.hasOverdue  && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">{monthItems.filter(e => e.calibration_status === 'Overdue').length} Overdue</span>}
                    {data.hasDueSoon  && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">{monthItems.filter(e => e.calibration_status === 'Due Soon').length} Due Soon</span>}
                    {data.hasOK       && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">{monthItems.filter(e => e.calibration_status === 'OK').length} OK</span>}
                    <button onClick={() => setSelectedMonth(null)} className="ml-2 p-1 text-slate-400 hover:text-slate-600 rounded">
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {monthItems.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-sm">No equipment due this month</div>
                ) : (
                  <div className="table-wrap">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 bg-slate-50">Equipment</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 bg-slate-50">ID</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 bg-slate-50">Location</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 bg-slate-50">Due Date</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 bg-slate-50">Lab</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 bg-slate-50">Status</th>
                          <th className="px-4 py-2.5 bg-slate-50" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {monthItems.map((eq) => {
                          const days = daysUntilDue(eq.next_due_date);
                          return (
                            <tr
                              key={eq.id}
                              className="hover:bg-teal-50/40 transition-colors cursor-pointer"
                              onDoubleClick={() => setDetailItem(eq)}
                              title="Double-click for full details"
                            >
                              <td className="px-4 py-3">
                                <p className="font-semibold text-slate-800">{eq.equipment_name}</p>
                                {eq.manufacturer && <p className="text-xs text-slate-400">{eq.manufacturer}{eq.model ? ` · ${eq.model}` : ''}</p>}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-600">{eq.equipment_id}</td>
                              <td className="px-4 py-3 text-slate-500 text-xs">{eq.location || '—'}</td>
                              <td className="px-4 py-3">
                                <p className={`font-medium text-xs ${days < 0 ? 'text-rose-600' : days <= 30 ? 'text-amber-600' : 'text-slate-700'}`}>
                                  {eq.next_due_date}
                                </p>
                                <p className="text-xs text-slate-400">{days < 0 ? `${Math.abs(days)}d overdue` : `in ${days}d`}</p>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-500">{eq.calibrated_by || '—'}</td>
                              <td className="px-4 py-3">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${CALIB_STATUS_STYLE[eq.calibration_status]}`}>
                                  {eq.calibration_status}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex gap-1 justify-end">
                                  {canEdit(pagePic) ? (
                                    <>
                                      <button onClick={(e) => { e.stopPropagation(); handleEdit(eq); }} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Edit"><Edit2 size={13} /></button>
                                      <button onClick={(e) => { e.stopPropagation(); handleDelete(eq.id); }} className="p-1.5 rounded hover:bg-rose-50 text-rose-500" title="Delete"><Trash2 size={13} /></button>
                                    </>
                                  ) : (
                                    <span className="text-[10px] text-slate-300" title="Only Admin, DC, or the Person In Charge can edit">🔒</span>
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
              </div>
            );
          })()}

          {/* Legend */}
          <div className="flex flex-wrap gap-4 items-center text-xs text-slate-500 px-1">
            <span className="font-semibold text-slate-600">Legend:</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-200 border border-rose-400 inline-block" /> Overdue</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-200 border border-amber-400 inline-block" /> Due Soon (≤30d)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-200 border border-emerald-400 inline-block" /> OK</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-100 border border-slate-300 inline-block" /> No plans</span>
            <span className="flex items-center gap-1.5 ml-auto text-teal-500 font-medium">Click a month box to see details</span>
          </div>
        </div>
      )}

      {/* ════════════════ TABLE VIEW ════════════════ */}
      {viewMode === 'table' && (
        <>
      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mb-3" />
            <p>Loading equipment…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Gauge size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No equipment records found</p>
            <p className="text-sm mt-1">Click "Add Equipment" to register in-house calibration instruments</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {([
                    { key: 'equipment_name', label: 'Equipment' },
                    { key: 'equipment_id',   label: 'ID / Type' },
                    { key: 'location',       label: 'Location' },
                    { key: 'calibration_date', label: 'Last Calibrated' },
                    { key: 'next_due_date',  label: 'Next Due' },
                    { key: 'certificate_number', label: 'Reference' },
                    { key: 'calibration_status', label: 'Status' },
                  ] as { key: keyof Equipment; label: string }[]).map((col) => (
                    <th
                      key={col.key}
                      onClick={() => {
                        if (sortKey === col.key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
                        else { setSortKey(col.key); setSortDir('asc'); }
                      }}
                      className="text-left px-4 py-3 font-semibold text-slate-600 cursor-pointer select-none hover:bg-slate-100 transition-colors"
                    >
                      <span className="flex items-center gap-1">
                        {col.label}
                        {sortKey === col.key
                          ? sortDir === 'asc' ? <ChevronUp size={13} className="text-teal-500" /> : <ChevronDown size={13} className="text-teal-500" />
                          : <ChevronsUpDown size={13} className="text-slate-300" />}
                      </span>
                    </th>
                  ))}
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sorted.map((eq) => {
                  const days = daysUntilDue(eq.next_due_date);
                  return (
                    <tr
                      key={eq.id}
                      onDoubleClick={() => setDetailItem(eq)}
                      className="hover:bg-teal-50/40 transition-colors cursor-pointer"
                      title="Double-click to view full details"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{eq.equipment_name}</p>
                        {eq.manufacturer && <p className="text-xs text-slate-400">{eq.manufacturer}{eq.model ? ` · ${eq.model}` : ''}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-slate-700 font-mono text-xs">{eq.equipment_id}</p>
                        <p className="text-xs text-slate-400">{eq.equipment_type}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{eq.location || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">
                        <p>{eq.calibration_date || '—'}</p>
                        {eq.calibrated_by && <p className="text-xs text-slate-400">{eq.calibrated_by}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <p className={`font-medium ${days < 0 ? 'text-rose-600' : days <= 30 ? 'text-amber-600' : 'text-slate-700'}`}>
                          {eq.next_due_date}
                        </p>
                        <p className="text-xs text-slate-400">
                          {days < 0 ? `${Math.abs(days)}d overdue` : `in ${days}d`}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{eq.certificate_number || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${CALIB_STATUS_STYLE[eq.calibration_status]}`}>
                          {eq.calibration_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/plan/inhouse-calibration/history`, {
                                state: { selectedId: eq.id },
                              });
                            }}
                            className="p-1.5 rounded-lg text-teal-500 hover:bg-teal-50"
                            title="View History"
                          >
                            <History size={14} />
                          </button>
                          {canEdit(pagePic) ? (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleEdit(eq); }}
                                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                                title="Edit"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(eq.id); }}
                                className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50"
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          ) : (
                            <span className="text-[10px] text-slate-300 px-1" title="Only Admin, DC, or the Person In Charge can edit">🔒</span>
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
      </div>
        </>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 overflow-y-auto py-8">
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-900">
                {editId ? 'Edit Equipment' : 'Add Equipment'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            {error && <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-5">

              {/* ── Section 1: Identity ── */}
              <div>
                <p className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-2">Equipment Identity</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Equipment Name <span className="text-rose-500">*</span></label>
                    <input value={form.equipment_name} onChange={(e) => setForm((f) => ({ ...f, equipment_name: e.target.value }))}
                      placeholder="e.g. Vernier Caliper" required
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Instrument / Equipment ID <span className="text-rose-500">*</span></label>
                    <input value={form.equipment_id} onChange={(e) => setForm((f) => ({ ...f, equipment_id: e.target.value }))}
                      placeholder="e.g. INV-BA-02" required
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Work Type / Category</label>
                    <input value={form.equipment_type} onChange={(e) => setForm((f) => ({ ...f, equipment_type: e.target.value }))}
                      placeholder="e.g. Dimension, Weight, Noise inspection"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Storage Location</label>
                    <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                      placeholder="e.g. Meas. Room, Laboratory 2"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                </div>
              </div>

              {/* ── Section 2: Manufacturer / Model ── */}
              <div>
                <p className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-2">Manufacturer Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Manufacturer (บริษัทผู้ผลิต)</label>
                    <input value={form.manufacturer} onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))}
                      placeholder="e.g. Mitutoyo, Shimadzu"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Model / Type (รุ่น / แบบ)</label>
                    <input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                      placeholder="e.g. UX-4200H"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Serial No. (SERIAL NO)</label>
                    <input value={form.serial_number} onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))}
                      placeholder="e.g. D446700624"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Receive Date (วันที่รับเข้า)</label>
                    <input type="date" value={form.receive_date} onChange={(e) => setForm((f) => ({ ...f, receive_date: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Phone (โทรศัพท์)</label>
                    <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="e.g. 038-429-728-9"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Fax (แฟกซ์)</label>
                    <input value={form.fax} onChange={(e) => setForm((f) => ({ ...f, fax: e.target.value }))}
                      placeholder="e.g. 038-716-941"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                </div>
              </div>

              {/* ── Section 3: Calibration Info ── */}
              <div>
                <p className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-2">Calibration Information</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Last Calibration Date <span className="text-slate-400">(DATE AND CAL.DATE)</span></label>
                    <input type="date" value={form.calibration_date} onChange={(e) => setForm((f) => ({ ...f, calibration_date: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Next Due Date <span className="text-rose-500">*</span> <span className="text-slate-400">(DATE AND CAL.NEXT CAL)</span></label>
                    <input type="date" value={form.next_due_date} onChange={(e) => setForm((f) => ({ ...f, next_due_date: e.target.value }))}
                      required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Calibration Method (วิธีการสอบเทียบ)</label>
                    <input value={form.calibration_method} onChange={(e) => setForm((f) => ({ ...f, calibration_method: e.target.value }))}
                      placeholder="e.g. IN-HOUSE CALIBRATION"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Calibration Interval (ระยะเวลาในการทวนสอบ)</label>
                    <input value={form.calibration_interval} onChange={(e) => setForm((f) => ({ ...f, calibration_interval: e.target.value }))}
                      placeholder="e.g. Yearly, 2 yearly"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Performed By (ห้องปฏิบัติการสอบเทียบ)</label>
                    <input value={form.calibrated_by} onChange={(e) => setForm((f) => ({ ...f, calibrated_by: e.target.value }))}
                      placeholder="e.g. QC Department, In-house team"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Acceptance Criteria (เกณฑ์ในการตัดสินใจ)</label>
                    <input value={form.acceptance_criteria} onChange={(e) => setForm((f) => ({ ...f, acceptance_criteria: e.target.value }))}
                      placeholder="e.g. ±0.03 g, ± 4 µm"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Sheet / Reference No. <span className="text-slate-400">(Sheet name)</span></label>
                    <input value={form.certificate_number} onChange={(e) => setForm((f) => ({ ...f, certificate_number: e.target.value }))}
                      placeholder="e.g. (2) INV-BA-02"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Notes / Remarks</label>
                    <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      placeholder="Additional notes"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2 text-sm font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-60">
                  {saving ? 'Saving…' : editId ? 'Update' : 'Add Equipment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Detail Modal (double-click) ── */}
      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between p-6 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${CALIB_STATUS_STYLE[detailItem.calibration_status]}`}>
                    {detailItem.calibration_status}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">{detailItem.equipment_id}</span>
                </div>
                <h3 className="text-xl font-bold text-slate-900">{detailItem.equipment_name}</h3>
                {detailItem.manufacturer && (
                  <p className="text-sm text-slate-500 mt-0.5">{detailItem.manufacturer}{detailItem.model ? ` · ${detailItem.model}` : ''}</p>
                )}
              </div>
              <button onClick={() => setDetailItem(null)} className="text-slate-400 hover:text-slate-600 mt-1"><X size={20} /></button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              {/* Page Person In Charge banner */}
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${pagePic?.pic_name ? 'bg-violet-50 border-violet-200' : 'bg-slate-50 border-slate-200'}`}>
                <UserCheck size={16} className={pagePic?.pic_name ? 'text-violet-600' : 'text-slate-400'} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Person In Charge (Page)</p>
                  {pagePic?.pic_name ? (
                    <p className="text-sm font-semibold text-violet-800 mt-0.5">{pagePic.pic_name}
                      {pagePic.pic_employee_code && <span className="text-xs text-violet-500 ml-1">({pagePic.pic_employee_code})</span>}
                    </p>
                  ) : (
                    <p className="text-sm text-slate-400 mt-0.5">Not assigned</p>
                  )}
                </div>
                {isPrivileged && (
                  <button
                    onClick={() => { setDetailItem(null); openPicModal(); }}
                    className="text-xs text-violet-600 hover:text-violet-800 font-semibold border border-violet-300 px-2 py-1 rounded-lg hover:bg-violet-100"
                  >
                    {pagePic?.pic_name ? 'Change' : 'Assign'}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Work Type / Category',    value: detailItem.equipment_type },
                  { label: 'Storage Location',         value: detailItem.location },
                  { label: 'Serial No.',               value: detailItem.serial_number },
                  { label: 'Receive Date',             value: detailItem.receive_date },
                  { label: 'Phone',                    value: detailItem.phone },
                  { label: 'Fax',                      value: detailItem.fax },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
                    <p className="text-sm text-slate-800 mt-0.5">{value || '—'}</p>
                  </div>
                ))}
              </div>

              <hr className="border-slate-100" />

              {/* Calibration details */}
              <div>
                <p className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-3">Calibration Details</p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Last Calibration Date',  value: detailItem.calibration_date },
                    { label: 'Next Due Date',           value: detailItem.next_due_date },
                    { label: 'Calibration Method',      value: detailItem.calibration_method },
                    { label: 'Calibration Interval',    value: detailItem.calibration_interval },
                    { label: 'Performed By',            value: detailItem.calibrated_by },
                    { label: 'Acceptance Criteria',     value: detailItem.acceptance_criteria },
                    { label: 'Sheet / Reference No.',   value: detailItem.certificate_number },
                    { label: 'Notes',                   value: detailItem.notes },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
                      <p className="text-sm text-slate-800 mt-0.5">{value || '—'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-6 pb-6">
              <button
                onClick={() => {
                  const eq = detailItem;
                  setDetailItem(null);
                  navigate(`/plan/inhouse-calibration/history`, {
                    state: { selectedId: eq.id },
                  });
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
              >
                <History size={14} /> History
              </button>
              {canEdit(pagePic) && (
                <button
                  onClick={() => { setDetailItem(null); handleEdit(detailItem); }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-50"
                >
                  <Edit2 size={14} /> Edit
                </button>
              )}
              <button
                onClick={() => setDetailItem(null)}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PIC Assignment Modal ── */}
      {showPicModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-violet-50">
              <div>
                <h3 className="text-base font-bold text-violet-900 flex items-center gap-2">
                  <UserCheck size={16} /> Person In Charge — In-House Calibration
                </h3>
                <p className="text-xs text-violet-600 mt-0.5">Assign a person responsible for this entire page</p>
              </div>
              <button onClick={() => setShowPicModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {/* Current PIC */}
            {pagePic?.pic_name && (
              <div className="px-5 pt-4 pb-2 flex items-center gap-2">
                <span className="text-xs text-slate-500">Current:</span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">
                  <UserCheck size={10} /> {pagePic.pic_name}
                </span>
                <button
                  onClick={() => handleAssignPic(null)}
                  disabled={picSaving}
                  className="ml-auto text-xs text-rose-500 hover:text-rose-700 flex items-center gap-1 disabled:opacity-50"
                  title="Remove Person In Charge"
                >
                  <UserX size={12} /> Remove
                </button>
              </div>
            )}

            {/* Search */}
            <div className="px-5 pt-3 pb-2">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={picSearch}
                  onChange={(e) => setPicSearch(e.target.value)}
                  placeholder="Search by name or employee code…"
                  className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-violet-400"
                  autoFocus
                />
              </div>
            </div>

            {/* User list */}
            <div className="px-5 pb-3 max-h-64 overflow-y-auto space-y-1">
              {picUsers
                .filter((u) => {
                  const q = picSearch.toLowerCase();
                  return !q || u.name?.toLowerCase().includes(q) || u.employee_code?.toLowerCase().includes(q);
                })
                .map((u) => {
                  const isSelected = pagePic?.pic_user_id === u.id;
                  return (
                    <button
                      key={u.id}
                      onClick={() => handleAssignPic(u.id)}
                      disabled={picSaving}
                      className={[
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors disabled:opacity-50',
                        isSelected
                          ? 'bg-violet-100 border border-violet-300'
                          : 'hover:bg-slate-50 border border-transparent',
                      ].join(' ')}
                    >
                      <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-bold text-sm flex-shrink-0">
                        {u.name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{u.name}</p>
                        <p className="text-xs text-slate-400">{u.employee_code} · {u.role}</p>
                      </div>
                      {isSelected && <span className="text-teal-600 text-xs font-semibold">✓ Current</span>}
                    </button>
                  );
                })}
              {picUsers.length === 0 && (
                <p className="text-center text-slate-400 text-sm py-6">No users found</p>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowPicModal(false)}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel Import Modal */}
      {showImport && (
        <ExcelImportModal
          title="In-House Calibration Planning"
          fields={IMPORT_FIELDS}
          sampleHeaders={SAMPLE_HEADERS}
          onImport={handleExcelImport}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
