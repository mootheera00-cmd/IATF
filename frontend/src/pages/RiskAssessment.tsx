// pages/RiskAssessment.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Plus, Search, X, Check, XCircle, Eye, Filter, RotateCcw,
         Edit3, History, Bell, ChevronDown, ChevronRight, Trash2, ArrowDown,
         Layers, BarChart3, AlertTriangle, ClipboardList, Database, Globe, GitBranch } from 'lucide-react';
import { riskAssessmentAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';

/* ─── Types ─────────────────────────────────────────────────────── */
interface Category { id: number; name: string; sort_order: number; }

interface RiskItem {
  id: number; category_id: number; category_name: string; item_no: number;
  risk_opportunity: string; impact: string; existing_control: string;
  type_risk: number; type_opportunity: number;
  severity: number; occurrence: number; risk_score: number;
  measure_accept: number; measure_procedure: number;
  measure_kpi: number; measure_preventive: number;
  detail: string; responsibility: string; status: string;
  created_at: string; updated_at: string;
}

interface EditRequest {
  id: number; item_id: number | null; request_type: string;
  category_id: number | null; field_changes: string | null;
  reason: string; requester_id: number; requester_name: string;
  approver_id: number; approver_name: string;
  status: string; reject_reason: string | null;
  risk_opportunity?: string; category_name?: string;
  created_at: string; decided_at: string | null;
}

interface EditHistoryEntry {
  id: number; item_id: number; request_id: number;
  editor_name: string; approver_name: string;
  changes: string; edited_at: string;
}

interface Revision {
  id: number; rev_no: string; effective_date: string;
  detail: string; remark: string;
}

interface Manager { id: number; display_name: string; employee_code: string; }

/* ─── Helpers ───────────────────────────────────────────────────── */
const riskColor = (score: number) => {
  if (score >= 20) return 'bg-red-100 text-red-800 border-red-200';
  if (score >= 9) return 'bg-orange-100 text-orange-800 border-orange-200';
  if (score >= 4) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  return 'bg-green-100 text-green-800 border-green-200';
};

const statusBadge = (s: string) => {
  switch (s) {
    case 'APPROVED': return 'bg-emerald-100 text-emerald-700';
    case 'REJECTED': return 'bg-red-100 text-red-700';
    default: return 'bg-amber-100 text-amber-700';
  }
};

/* ─── Translations ──────────────────────────────────────────────── */
type Lang = 'en' | 'th';
const T: Record<string, Record<Lang, string>> = {
  // Header
  riskAssessment:     { en: 'Risk Assessment', th: 'การประเมินความเสี่ยง' },
  subtitle:           { en: 'F-01-DOC-002 Risk Assessment FORM_APTC — IATF 16949:2016', th: 'F-01-DOC-002 แบบประเมินความเสี่ยง FORM_APTC — IATF 16949:2016' },
  // Tabs
  riskRegister:       { en: 'Risk Register', th: 'ทะเบียนความเสี่ยง' },
  editRequests:       { en: 'Edit Requests', th: 'คำขอแก้ไข' },
  revisionHistory:    { en: 'Revision History', th: 'ประวัติการแก้ไข' },
  // Buttons
  pendingReview:      { en: 'Pending Review', th: 'รอการตรวจสอบ' },
  seedFromExcel:      { en: 'Seed from Excel', th: 'นำเข้าจาก Excel' },
  addRiskItem:        { en: 'Add Risk Item', th: 'เพิ่มรายการความเสี่ยง' },
  requestAddItem:     { en: 'Request Add Item', th: 'ขอเพิ่มรายการ' },
  addRow:             { en: 'Add Row', th: 'เพิ่มแถว' },
  requestAdd:         { en: 'Request Add', th: 'ขอเพิ่ม' },
  addCategory:        { en: 'Add Category', th: 'เพิ่มหมวดหมู่' },
  addRevision:        { en: 'Add Revision', th: 'เพิ่มการแก้ไข' },
  cancel:             { en: 'Cancel', th: 'ยกเลิก' },
  addItem:            { en: 'Add Item', th: 'เพิ่มรายการ' },
  saving:             { en: 'Saving...', th: 'กำลังบันทึก...' },
  submitForApproval:  { en: 'Submit for Approval', th: 'ส่งเพื่อขออนุมัติ' },
  submitting:         { en: 'Submitting...', th: 'กำลังส่ง...' },
  adding:             { en: 'Adding...', th: 'กำลังเพิ่ม...' },
  rejectRequest:      { en: 'Reject Request', th: 'ปฏิเสธคำขอ' },
  requestChange:      { en: 'Request Change', th: 'ขอเปลี่ยนแปลง' },
  requestEdit:        { en: 'Request Edit', th: 'ขอแก้ไข' },
  clear:              { en: 'Clear', th: 'ล้าง' },
  viewAll:            { en: 'View all', th: 'ดูทั้งหมด' },
  ok:                 { en: 'OK', th: 'ตกลง' },
  // Filter
  allCategories:      { en: 'All Categories', th: 'ทุกหมวดหมู่' },
  searchRisks:        { en: 'Search risks...', th: 'ค้นหาความเสี่ยง...' },
  category:           { en: 'Category', th: 'หมวดหมู่' },
  showing:            { en: 'Showing', th: 'แสดง' },
  of:                 { en: 'of', th: 'จาก' },
  riskItems:          { en: 'risk items', th: 'รายการความเสี่ยง' },
  // Summary
  totalItems:         { en: 'Total Items', th: 'รายการทั้งหมด' },
  categories:         { en: 'Categories', th: 'หมวดหมู่' },
  highRisk:           { en: 'High Risk (≥10)', th: 'ความเสี่ยงสูง (≥10)' },
  pendingRequests:    { en: 'Pending Requests', th: 'คำขอที่รอดำเนินการ' },
  // Table headers
  no:                 { en: 'No.', th: 'ลำดับ' },
  riskOpportunity:    { en: 'Risk & Opportunity', th: 'ความเสี่ยงและโอกาส' },
  impact:             { en: 'Impact', th: 'ผลกระทบ' },
  existingControl:    { en: 'Existing Control', th: 'การควบคุมที่มีอยู่' },
  riskType:           { en: 'Risk Type', th: 'ประเภทความเสี่ยง' },
  opportunityType:    { en: 'Opportunity Type', th: 'ประเภทโอกาส' },
  severity:           { en: 'Severity', th: 'ความรุนแรง' },
  occurrence:         { en: 'Occurrence', th: 'โอกาสเกิด' },
  score:              { en: 'Score', th: 'คะแนน' },
  measures:           { en: 'Measures', th: 'มาตรการ' },
  detail:             { en: 'Detail', th: 'รายละเอียด' },
  responsibility:     { en: 'Responsibility', th: 'ผู้รับผิดชอบ' },
  actions:            { en: 'Actions', th: 'การดำเนินการ' },
  // Measures
  acceptRisk:         { en: 'Accept (1-3)', th: 'ยอมรับ (1-3)' },
  procedure:          { en: 'Procedure (4-8)', th: 'ขั้นตอน (4-8)' },
  kpi:                { en: 'KPI (9-16)', th: 'KPI (9-16)' },
  preventive:         { en: 'Preventive (20-25)', th: 'ป้องกัน (20-25)' },
  acceptRiskFull:     { en: 'Accept Risk (1-3)', th: 'ยอมรับความเสี่ยง (1-3)' },
  procedureFull:      { en: 'Procedure/WI (4-8)', th: 'ขั้นตอน/WI (4-8)' },
  kpiFull:            { en: "KPI's (9-16)", th: "KPI's (9-16)" },
  preventiveFull:     { en: 'Preventive Action (20-25)', th: 'การดำเนินการป้องกัน (20-25)' },
  procedureViewFull:  { en: 'Procedure/WI/Contingency (4-8)', th: 'ขั้นตอน/WI/แผนฉุกเฉิน (4-8)' },
  noneSpecified:      { en: 'None specified', th: 'ไม่ได้ระบุ' },
  // Empty state
  noRiskItems:        { en: 'No Risk Items Yet', th: 'ยังไม่มีรายการความเสี่ยง' },
  seedPrompt:         { en: 'Click "Seed from Excel" to import initial data from F-01-DOC-002, or add items manually.', th: 'คลิก "นำเข้าจาก Excel" เพื่อนำเข้าข้อมูลจาก F-01-DOC-002 หรือเพิ่มรายการด้วยตนเอง' },
  noItemsMsg:         { en: 'Risk items will appear once they are added by a manager.', th: 'รายการความเสี่ยงจะปรากฏเมื่อผู้จัดการเพิ่มเข้ามา' },
  noItemsInCat:       { en: 'No items in this category', th: 'ไม่มีรายการในหมวดหมู่นี้' },
  loading:            { en: 'Loading risk assessment data...', th: 'กำลังโหลดข้อมูลการประเมินความเสี่ยง...' },
  // Request changes
  requestChanges:     { en: 'Request Changes', th: 'ขอเปลี่ยนแปลง' },
  requestChangesDesc: { en: 'Submit a change request for review and approval by a manager', th: 'ส่งคำขอเปลี่ยนแปลงเพื่อให้ผู้จัดการตรวจสอบและอนุมัติ' },
  pendingAwaiting:    { en: 'pending request(s) awaiting approval', th: 'คำขอที่รอการอนุมัติ' },
  // Edit request form
  requestType:        { en: 'Request Type', th: 'ประเภทคำขอ' },
  editExistingItem:   { en: 'Edit Existing Item', th: 'แก้ไขรายการที่มีอยู่' },
  addNewItem:         { en: 'Add New Item', th: 'เพิ่มรายการใหม่' },
  deleteItem:         { en: 'Delete Item', th: 'ลบรายการ' },
  addNewCategory:     { en: 'Add New Category', th: 'เพิ่มหมวดหมู่ใหม่' },
  categoryName:       { en: 'Category Name', th: 'ชื่อหมวดหมู่' },
  approvalRequired:   { en: 'Approval Required', th: 'ต้องได้รับการอนุมัติ' },
  reasonForChange:    { en: 'Reason for change', th: 'เหตุผลในการเปลี่ยนแปลง' },
  reasonPlaceholder:  { en: 'Explain why this change is needed...', th: 'อธิบายเหตุผลที่ต้องเปลี่ยนแปลง...' },
  approverManager:    { en: 'Approver (Manager)', th: 'ผู้อนุมัติ (ผู้จัดการ)' },
  selectApprover:     { en: 'Select approver...', th: 'เลือกผู้อนุมัติ...' },
  selectCategory:     { en: 'Select category...', th: 'เลือกหมวดหมู่...' },
  risk:               { en: 'Risk', th: 'ความเสี่ยง' },
  opportunity:        { en: 'Opportunity', th: 'โอกาส' },
  existingProcessCtrl:{ en: 'Existing Process Control', th: 'การควบคุมกระบวนการที่มีอยู่' },
  additionalMeasures: { en: 'Additional Measures', th: 'มาตรการเพิ่มเติม' },
  detailDocRef:       { en: 'Detail / Document Reference', th: 'รายละเอียด / เอกสารอ้างอิง' },
  // Edit requests table
  type:               { en: 'Type', th: 'ประเภท' },
  itemCategory:       { en: 'Item/Category', th: 'รายการ/หมวดหมู่' },
  reason:             { en: 'Reason', th: 'เหตุผล' },
  requester:          { en: 'Requester', th: 'ผู้ร้องขอ' },
  approver:           { en: 'Approver', th: 'ผู้อนุมัติ' },
  status:             { en: 'Status', th: 'สถานะ' },
  date:               { en: 'Date', th: 'วันที่' },
  noEditRequests:     { en: 'No edit requests yet', th: 'ยังไม่มีคำขอแก้ไข' },
  // Revision history
  reviseNo:           { en: 'Revise No.', th: 'เลขที่แก้ไข' },
  effectiveDate:      { en: 'Effective Date', th: 'วันที่มีผลบังคับ' },
  remark:             { en: 'Remark', th: 'หมายเหตุ' },
  noRevisionHistory:  { en: 'No revision history', th: 'ไม่มีประวัติการแก้ไข' },
  // Modals
  insertRiskItem:     { en: 'Insert Risk Item', th: 'แทรกรายการความเสี่ยง' },
  after:              { en: 'after', th: 'หลัง' },
  addRiskItemTitle:   { en: 'Add Risk Item', th: 'เพิ่มรายการความเสี่ยง' },
  requestEditTitle:   { en: 'Request Edit', th: 'ขอแก้ไข' },
  requestAddItemTitle:{ en: 'Request Add Item', th: 'ขอเพิ่มรายการ' },
  requestDeletion:    { en: 'Request Deletion', th: 'ขอลบ' },
  requestNewCategory: { en: 'Request New Category', th: 'ขอเพิ่มหมวดหมู่ใหม่' },
  addRevisionHistory: { en: 'Add Revision History', th: 'เพิ่มประวัติการแก้ไข' },
  rejectEditRequest:  { en: 'Reject Edit Request', th: 'ปฏิเสธคำขอแก้ไข' },
  rejectionReason:    { en: 'Rejection Reason', th: 'เหตุผลในการปฏิเสธ' },
  rejectionPlaceholder:{ en: 'Explain why this request is being rejected...', th: 'อธิบายเหตุผลที่ปฏิเสธคำขอนี้...' },
  confirmDelete:      { en: 'Confirm Delete', th: 'ยืนยันการลบ' },
  // View item detail
  editHistory:        { en: 'Edit History', th: 'ประวัติการแก้ไข' },
  editedBy:           { en: 'Edited by', th: 'แก้ไขโดย' },
  approvedBy:         { en: 'Approved by', th: 'อนุมัติโดย' },
  fieldsChanged:      { en: 'Fields changed', th: 'ฟิลด์ที่เปลี่ยน' },
  egExternalFactors:  { en: 'e.g., External Factors', th: 'เช่น ปัจจัยภายนอก' },
  egRev:              { en: 'e.g., Rev.10', th: 'เช่น Rev.10' },
  riskOpportunityLabel: { en: 'Risk / Opportunity', th: 'ความเสี่ยง / โอกาส' },
  // Status badges
  statusApproved:     { en: 'APPROVED', th: 'อนุมัติแล้ว' },
  statusRejected:     { en: 'REJECTED', th: 'ปฏิเสธ' },
  statusPending:      { en: 'PENDING', th: 'รอดำเนินการ' },
  // Request types
  typeEdit:           { en: 'EDIT', th: 'แก้ไข' },
  typeAdd:            { en: 'ADD', th: 'เพิ่ม' },
  typeDelete:         { en: 'DELETE', th: 'ลบ' },
  typeAddCategory:    { en: 'ADD_CATEGORY', th: 'เพิ่มหมวดหมู่' },
  // Table action tooltips
  tooltipView:        { en: 'View', th: 'ดู' },
  tooltipRequestEdit: { en: 'Request Edit', th: 'ขอแก้ไข' },
  tooltipInsertBelow: { en: 'Insert row below', th: 'แทรกแถวด้านล่าง' },
  tooltipDelete:      { en: 'Delete', th: 'ลบ' },
  tooltipApprove:     { en: 'Approve', th: 'อนุมัติ' },
  tooltipReject:      { en: 'Reject', th: 'ปฏิเสธ' },
  tooltipAddRow:      { en: 'Add row to this category', th: 'เพิ่มแถวในหมวดหมู่นี้' },
  tooltipRequestAddRow: { en: 'Request to add a row', th: 'ขอเพิ่มแถว' },
  // Other
  reasonPrefix:       { en: 'Reason', th: 'เหตุผล' },
  removeRiskItem:     { en: 'Remove this risk item?', th: 'ลบรายการความเสี่ยงนี้?' },
  confirmSeed:        { en: 'Seed initial risk assessment data from Excel form? This only works if no items exist yet.', th: 'นำเข้าข้อมูลการประเมินความเสี่ยงจาก Excel หรือไม่? ใช้ได้เฉพาะเมื่อยังไม่มีรายการ' },
  confirmApprove:     { en: 'Approve this edit request?', th: 'อนุมัติคำขอแก้ไขนี้?' },
  // Column abbreviations
  sevAbbr:            { en: 'Sev', th: 'รนร.' },
  occAbbr:            { en: 'Occ', th: 'อกส.' },
  // Toast messages
  toastSeeded:        { en: 'Data seeded successfully', th: 'นำเข้าข้อมูลสำเร็จ' },
  toastItemAdded:     { en: 'Risk item added', th: 'เพิ่มรายการความเสี่ยงแล้ว' },
  toastRequestSent:   { en: 'Edit request submitted for approval', th: 'ส่งคำขอแก้ไขเพื่อขออนุมัติแล้ว' },
  toastApproved:      { en: 'Request approved', th: 'อนุมัติคำขอแล้ว' },
  toastRejected:      { en: 'Request rejected', th: 'ปฏิเสธคำขอแล้ว' },
  toastItemRemoved:   { en: 'Item removed', th: 'ลบรายการแล้ว' },
  toastCategoryAdded: { en: 'Category added', th: 'เพิ่มหมวดหมู่แล้ว' },
  toastRevisionAdded: { en: 'Revision added', th: 'เพิ่มรายการแก้ไขแล้ว' },
  // Error fallbacks
  errSeed:            { en: 'Failed to seed data', th: 'นำเข้าข้อมูลล้มเหลว' },
  errAddItem:         { en: 'Failed to add item', th: 'เพิ่มรายการล้มเหลว' },
  errSubmitRequest:   { en: 'Failed to submit request', th: 'ส่งคำขอล้มเหลว' },
  errApprove:         { en: 'Failed to approve', th: 'อนุมัติล้มเหลว' },
  errReject:          { en: 'Failed to reject', th: 'ปฏิเสธล้มเหลว' },
  errDelete:          { en: 'Failed to delete', th: 'ลบล้มเหลว' },
  errAddCategory:     { en: 'Failed to add category', th: 'เพิ่มหมวดหมู่ล้มเหลว' },
  errGeneric:         { en: 'Failed', th: 'ล้มเหลว' },
  // Validation
  valCategoryRequired:{ en: 'Category and Risk/Opportunity description are required', th: 'กรุณาระบุหมวดหมู่และคำอธิบายความเสี่ยง/โอกาส' },
  valReasonRequired:  { en: 'Reason and approver are required', th: 'กรุณาระบุเหตุผลและผู้อนุมัติ' },
  valRevisionRequired:{ en: 'Revision number, date, and detail are required', th: 'กรุณาระบุเลขที่แก้ไข วันที่ และรายละเอียด' },
};

/* ─── Main Component ────────────────────────────────────────────── */
export default function RiskAssessment() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isManager = ['MANAGER', 'QMR', 'ADMIN'].includes(String(user?.role).toUpperCase());
  const isAdmin = String(user?.role).toUpperCase() === 'ADMIN';

  // Language
  const [lang, setLang] = useState<Lang>('en');
  const t = (key: string) => T[key]?.[lang] || T[key]?.en || key;

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Data
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<RiskItem[]>([]);
  const [editRequests, setEditRequests] = useState<EditRequest[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [activeTab, setActiveTab] = useState<'register' | 'requests' | 'revisions'>('register');
  const [expandedCats, setExpandedCats] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Modals
  const [showAddItem, setShowAddItem] = useState(false);
  const [showEditRequest, setShowEditRequest] = useState(false);
  const [showViewItem, setShowViewItem] = useState<RiskItem | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddRevision, setShowAddRevision] = useState(false);
  const [rejectRequestId, setRejectRequestId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Delete confirmation modal
  const [deleteConfirm, setDeleteConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  // Form for adding item
  const emptyItemForm = {
    category_id: '', risk_opportunity: '', impact: '', existing_control: '',
    type_risk: true, type_opportunity: false,
    severity: '1', occurrence: '1',
    measure_accept: false, measure_procedure: false, measure_kpi: false, measure_preventive: false,
    detail: '', responsibility: '', insert_after: null as number | null,
  };
  const [itemForm, setItemForm] = useState(emptyItemForm);

  // Form for edit request
  const emptyEditForm = {
    item_id: null as number | null,
    request_type: 'EDIT' as string,
    category_id: null as number | null,
    reason: '', approver_id: '', approver_name: '',
    // Field changes
    risk_opportunity: '', impact: '', existing_control: '',
    type_risk: true, type_opportunity: false,
    severity: '1', occurrence: '1',
    measure_accept: false, measure_procedure: false, measure_kpi: false, measure_preventive: false,
    detail: '', responsibility: '',
    // For ADD_CATEGORY
    new_category_name: '',
  };
  const [editForm, setEditForm] = useState(emptyEditForm);

  // Category form
  const [catName, setCatName] = useState('');

  // Revision form
  const emptyRevForm = { rev_no: '', effective_date: '', detail: '', remark: '' };
  const [revForm, setRevForm] = useState(emptyRevForm);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // View item detail
  const [viewEditHistory, setViewEditHistory] = useState<EditHistoryEntry[]>([]);

  /* ─── Data fetching ───────────────────────────────────────────── */
  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [catRes, itemRes, reqRes, revRes, mgrRes] = await Promise.allSettled([
        riskAssessmentAPI.getCategories(),
        riskAssessmentAPI.getItems(),
        riskAssessmentAPI.getEditRequests(),
        riskAssessmentAPI.getRevisions(),
        riskAssessmentAPI.getManagers(),
      ]);
      const cats = catRes.status === 'fulfilled' ? catRes.value.data.categories || [] : [];
      const itms = itemRes.status === 'fulfilled' ? itemRes.value.data.items || [] : [];
      const reqs = reqRes.status === 'fulfilled' ? reqRes.value.data.requests || [] : [];
      const revs = revRes.status === 'fulfilled' ? revRes.value.data.revisions || [] : [];
      const mgrs = mgrRes.status === 'fulfilled' ? mgrRes.value.data.managers || [] : [];
      setCategories(cats);
      setItems(itms);
      setEditRequests(reqs);
      setRevisions(revs);
      setManagers(mgrs);
      // Expand all categories initially
      const allIds = new Set<number>(cats.map((c: Category) => c.id));
      setExpandedCats(allIds);
      // Log any failures for debugging
      [catRes, itemRes, reqRes, revRes, mgrRes].forEach((r, i) => {
        if (r.status === 'rejected') console.error(`[RiskAssessment] API call ${i} failed:`, r.reason);
      });
    } catch (e) { console.error('[RiskAssessment] fetchAll error:', e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ─── Derived data ────────────────────────────────────────────── */
  const filteredItems = useMemo(() => {
    return items.filter(i => {
      if (filterCategory && i.category_id !== Number(filterCategory)) return false;
      if (search) {
        const q = search.toLowerCase();
        const fields = [i.risk_opportunity, i.impact, i.existing_control, i.detail, i.responsibility, i.category_name];
        if (!fields.some(f => (f || '').toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [items, filterCategory, search]);

  const itemsByCategory = useMemo(() => {
    const map = new Map<number, RiskItem[]>();
    for (const c of categories) map.set(c.id, []);
    for (const i of filteredItems) {
      const arr = map.get(i.category_id);
      if (arr) arr.push(i);
      else map.set(i.category_id, [i]);
    }
    return map;
  }, [categories, filteredItems]);

  const pendingForMe = useMemo(() =>
    editRequests.filter(r => r.status === 'PENDING' && r.approver_id === (user as any)?.id),
  [editRequests, user]);

  const hasActiveFilters = search || filterCategory;

  /* ─── Handlers ────────────────────────────────────────────────── */
  const toggleCat = (id: number) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Seed data
  const handleSeed = async () => {
    if (!confirm(t('confirmSeed'))) return;
    try {
      const { data } = await riskAssessmentAPI.seed();
      showToast(data.message || t('toastSeeded'));
      fetchAll();
    } catch (e: any) {
      showToast(e?.response?.data?.error || t('errSeed'), 'error');
    }
  };

  // Add item directly (admin/manager)
  const handleAddItem = async () => {
    setFormError('');
    if (!itemForm.category_id || !itemForm.risk_opportunity.trim()) {
      setFormError(t('valCategoryRequired')); return;
    }
    try {
      setSaving(true);
      await riskAssessmentAPI.createItem({
        category_id: Number(itemForm.category_id),
        risk_opportunity: itemForm.risk_opportunity,
        impact: itemForm.impact,
        existing_control: itemForm.existing_control,
        type_risk: itemForm.type_risk,
        type_opportunity: itemForm.type_opportunity,
        severity: Number(itemForm.severity),
        occurrence: Number(itemForm.occurrence),
        measure_accept: itemForm.measure_accept,
        measure_procedure: itemForm.measure_procedure,
        measure_kpi: itemForm.measure_kpi,
        measure_preventive: itemForm.measure_preventive,
        detail: itemForm.detail,
        responsibility: itemForm.responsibility,
        insert_after: itemForm.insert_after,
      });
      setShowAddItem(false);
      setItemForm(emptyItemForm);
      showToast(t('toastItemAdded'));
      fetchAll();
    } catch (e: any) {
      setFormError(e?.response?.data?.error || t('errAddItem'));
    } finally { setSaving(false); }
  };

  // Submit edit request
  const handleSubmitEditRequest = async () => {
    setFormError('');
    if (!editForm.reason.trim() || !editForm.approver_id) {
      setFormError(t('valReasonRequired')); return;
    }
    const field_changes: Record<string, any> = {};
    if (editForm.request_type === 'EDIT' || editForm.request_type === 'ADD') {
      field_changes.risk_opportunity = editForm.risk_opportunity;
      field_changes.impact = editForm.impact;
      field_changes.existing_control = editForm.existing_control;
      field_changes.type_risk = editForm.type_risk ? 1 : 0;
      field_changes.type_opportunity = editForm.type_opportunity ? 1 : 0;
      field_changes.severity = Number(editForm.severity);
      field_changes.occurrence = Number(editForm.occurrence);
      field_changes.measure_accept = editForm.measure_accept ? 1 : 0;
      field_changes.measure_procedure = editForm.measure_procedure ? 1 : 0;
      field_changes.measure_kpi = editForm.measure_kpi ? 1 : 0;
      field_changes.measure_preventive = editForm.measure_preventive ? 1 : 0;
      field_changes.detail = editForm.detail;
      field_changes.responsibility = editForm.responsibility;
      if (editForm.request_type === 'ADD') field_changes.category_id = editForm.category_id;
    } else if (editForm.request_type === 'ADD_CATEGORY') {
      field_changes.name = editForm.new_category_name;
    }

    try {
      setSaving(true);
      await riskAssessmentAPI.createEditRequest({
        item_id: editForm.item_id,
        request_type: editForm.request_type,
        category_id: editForm.category_id,
        field_changes,
        reason: editForm.reason,
        approver_id: Number(editForm.approver_id),
        approver_name: editForm.approver_name,
      });
      setShowEditRequest(false);
      setEditForm(emptyEditForm);
      showToast(t('toastRequestSent'));
      fetchAll();
    } catch (e: any) {
      setFormError(e?.response?.data?.error || t('errSubmitRequest'));
    } finally { setSaving(false); }
  };

  // Approve edit request
  const handleApproveRequest = async (id: number) => {
    if (!confirm(t('confirmApprove'))) return;
    try {
      const { data } = await riskAssessmentAPI.approveEditRequest(id);
      showToast(data.message || t('toastApproved'));
      fetchAll();
    } catch (e: any) {
      showToast(e?.response?.data?.error || t('errApprove'), 'error');
    }
  };

  // Reject edit request
  const handleRejectRequest = async () => {
    if (!rejectRequestId || !rejectReason.trim()) return;
    try {
      const { data } = await riskAssessmentAPI.rejectEditRequest(rejectRequestId, rejectReason.trim());
      showToast(data.message || t('toastRejected'), 'info');
      setRejectRequestId(null);
      setRejectReason('');
      fetchAll();
    } catch (e: any) {
      showToast(e?.response?.data?.error || t('errReject'), 'error');
    }
  };

  // Delete item (admin)
  const handleDeleteItem = (id: number) => {
    setDeleteConfirm({
      message: t('removeRiskItem'),
      onConfirm: async () => {
        setDeleteConfirm(null);
        try {
          await riskAssessmentAPI.deleteItem(id);
          showToast(t('toastItemRemoved'));
          fetchAll();
        } catch (e: any) {
          showToast(e?.response?.data?.error || t('errDelete'), 'error');
        }
      },
    });
  };

  // Add category
  const handleAddCategory = async () => {
    if (!catName.trim()) return;
    try {
      setSaving(true);
      await riskAssessmentAPI.createCategory({ name: catName.trim() });
      setCatName('');
      setShowAddCategory(false);
      showToast(t('toastCategoryAdded'));
      fetchAll();
    } catch (e: any) {
      showToast(e?.response?.data?.error || t('errAddCategory'), 'error');
    } finally { setSaving(false); }
  };

  // Add revision
  const handleAddRevision = async () => {
    setFormError('');
    if (!revForm.rev_no.trim() || !revForm.effective_date || !revForm.detail.trim()) {
      setFormError(t('valRevisionRequired')); return;
    }
    try {
      setSaving(true);
      await riskAssessmentAPI.createRevision(revForm);
      setRevForm(emptyRevForm);
      setShowAddRevision(false);
      showToast(t('toastRevisionAdded'));
      fetchAll();
    } catch (e: any) {
      setFormError(e?.response?.data?.error || t('errGeneric'));
    } finally { setSaving(false); }
  };

  // Open view detail
  const openItemDetail = async (item: RiskItem) => {
    setShowViewItem(item);
    setViewEditHistory([]);
    try {
      const { data } = await riskAssessmentAPI.getItem(item.id);
      if (data.item) setShowViewItem(data.item);
      setViewEditHistory(data.editHistory || []);
    } catch { /* */ }
  };

  // Open edit request for an item
  const openEditRequestForItem = (item: RiskItem) => {
    setEditForm({
      ...emptyEditForm,
      item_id: item.id,
      request_type: 'EDIT',
      category_id: item.category_id,
      risk_opportunity: item.risk_opportunity,
      impact: item.impact,
      existing_control: item.existing_control,
      type_risk: !!item.type_risk,
      type_opportunity: !!item.type_opportunity,
      severity: String(item.severity),
      occurrence: String(item.occurrence),
      measure_accept: !!item.measure_accept,
      measure_procedure: !!item.measure_procedure,
      measure_kpi: !!item.measure_kpi,
      measure_preventive: !!item.measure_preventive,
      detail: item.detail,
      responsibility: item.responsibility,
    });
    setFormError('');
    setShowEditRequest(true);
    setShowViewItem(null);
  };

  // Open add request (for non-managers who want to add an item via approval)
  const openAddRequest = (catId?: number) => {
    setEditForm({
      ...emptyEditForm,
      request_type: 'ADD',
      category_id: catId || null,
    });
    setFormError('');
    setShowEditRequest(true);
  };

  // Insert row after
  const openInsertAfter = (item: RiskItem) => {
    setItemForm({
      ...emptyItemForm,
      category_id: String(item.category_id),
      insert_after: item.item_no,
    });
    setFormError('');
    setShowAddItem(true);
  };

  /* ─── Render ──────────────────────────────────────────────────── */
  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' :
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
        }`}>
          {toast.type === 'success' ? <Check size={16} /> : toast.type === 'error' ? <XCircle size={16} /> : <Bell size={16} />}
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <ShieldAlert size={20} className="text-indigo-500" />
            {t('riskAssessment')}
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {pendingForMe.length > 0 && (
            <button onClick={() => setActiveTab('requests')}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition shadow-sm">
              <Bell size={14} /> {pendingForMe.length} {t('pendingReview')}
            </button>
          )}
          {isAdmin && items.length === 0 && (
            <button onClick={handleSeed}
              className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition shadow-sm">
              <Database size={14} /> {t('seedFromExcel')}
            </button>
          )}
          {isManager ? (
            <button onClick={() => { setItemForm(emptyItemForm); setFormError(''); setShowAddItem(true); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition shadow-sm">
              <Plus size={16} /> {t('addRiskItem')}
            </button>
          ) : (
            <button onClick={() => openAddRequest()}
              className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition shadow-sm">
              <Edit3 size={16} /> {t('requestAddItem')}
            </button>
          )}
          {/* Turtle Diagram Button */}
          <button
            onClick={() => navigate('/safety/turtle-diagram')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-teal-500 to-cyan-600 text-white text-sm font-semibold shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-200"
          >
            <GitBranch size={14} />
            Turtle Diagram
          </button>
          {/* Language toggle */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setLang('en')}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition ${
                lang === 'en' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <Globe size={12} /> EN
            </button>
            <button onClick={() => setLang('th')}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition ${
                lang === 'th' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              ไทย
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {[
          { key: 'register' as const, label: t('riskRegister'), icon: <Layers size={14} /> },
          { key: 'requests' as const, label: `${t('editRequests')}${pendingForMe.length ? ` (${pendingForMe.length})` : ''}`, icon: <ClipboardList size={14} /> },
          { key: 'revisions' as const, label: t('revisionHistory'), icon: <History size={14} /> },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === tab.key
                ? 'text-blue-600 border-blue-600'
                : 'text-slate-500 border-transparent hover:text-slate-700 hover:border-slate-300'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB: Risk Register ═══ */}
      {activeTab === 'register' && (
        <>
          {/* Filter bar */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter size={16} className="text-slate-400 shrink-0" />
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white min-w-[180px]">
                <option value="">{t('allCategories')}</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="relative ml-auto">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder={t('searchRisks')} className="pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 w-52" />
              </div>
              {isManager && (
                <button onClick={() => setShowAddCategory(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition border border-indigo-200">
                  <Plus size={12} /> {t('category')}
                </button>
              )}
              {hasActiveFilters && (
                <button onClick={() => { setSearch(''); setFilterCategory(''); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                  <RotateCcw size={14} /> {t('clear')}
                </button>
              )}
            </div>
            {hasActiveFilters && (
              <div className="text-xs text-slate-400 mt-2">
                {t('showing')} {filteredItems.length} {t('of')} {items.length} {t('riskItems')}
              </div>
            )}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
              <div className="text-xs text-slate-500 mb-0.5">{t('totalItems')}</div>
              <div className="text-xl font-bold text-slate-800">{items.length}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
              <div className="text-xs text-slate-500 mb-0.5">{t('categories')}</div>
              <div className="text-xl font-bold text-slate-800">{categories.length}</div>
            </div>
            <div className="bg-white rounded-xl border border-red-200 shadow-sm p-3">
              <div className="text-xs text-red-500 mb-0.5">{t('highRisk')}</div>
              <div className="text-xl font-bold text-red-700">
                {items.filter(i => i.severity * i.occurrence >= 10).length}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-3">
              <div className="text-xs text-amber-500 mb-0.5">{t('pendingRequests')}</div>
              <div className="text-xl font-bold text-amber-700">
                {editRequests.filter(r => r.status === 'PENDING').length}
              </div>
            </div>
          </div>

          {/* Risk tables by category */}
          {loading ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-16 text-center text-slate-400">
              {t('loading')}
            </div>
          ) : items.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 flex flex-col items-center justify-center text-center gap-3">
              <ShieldAlert size={36} className="text-slate-300" />
              <h2 className="text-lg font-bold text-slate-600">{t('noRiskItems')}</h2>
              <p className="text-slate-400 text-sm max-w-md">
                {isAdmin
                  ? t('seedPrompt')
                  : t('noItemsMsg')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {categories.map(cat => {
                const catItems = itemsByCategory.get(cat.id) || [];
                if (filterCategory && Number(filterCategory) !== cat.id) return null;
                if (catItems.length === 0 && !filterCategory) return null;
                const expanded = expandedCats.has(cat.id);
                return (
                  <div key={cat.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Category header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50/80 border-b border-slate-200 cursor-pointer select-none"
                         onClick={() => toggleCat(cat.id)}>
                      <div className="flex items-center gap-2">
                        {expanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                        <span className="font-semibold text-sm text-slate-700">{cat.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">{catItems.length}</span>
                      </div>
                      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        {isManager && (
                          <button onClick={() => { setItemForm({ ...emptyItemForm, category_id: String(cat.id) }); setFormError(''); setShowAddItem(true); }}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title={t('tooltipAddRow')}>
                            <Plus size={12} /> {t('addRow')}
                          </button>
                        )}
                        {!isManager && (
                          <button onClick={() => openAddRequest(cat.id)}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50 rounded-lg transition"
                            title={t('tooltipRequestAddRow')}>
                            <Edit3 size={12} /> {t('requestAdd')}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Table */}
                    {expanded && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/60">
                              <th className="px-2 py-2 text-left font-semibold text-slate-600 w-[4%]">{t('no')}</th>
                              <th className="px-2 py-2 text-left font-semibold text-slate-600 w-[16%]">{t('riskOpportunity')}</th>
                              <th className="px-2 py-2 text-left font-semibold text-slate-600 w-[12%]">{t('impact')}</th>
                              <th className="px-2 py-2 text-left font-semibold text-slate-600 w-[12%]">{t('existingControl')}</th>
                              <th className="px-2 py-2 text-center font-semibold text-slate-600 w-[4%]" title={t('riskType')}>R</th>
                              <th className="px-2 py-2 text-center font-semibold text-slate-600 w-[4%]" title={t('opportunityType')}>O</th>
                              <th className="px-2 py-2 text-center font-semibold text-slate-600 w-[4%]" title={t('severity')}>{t('sevAbbr')}</th>
                              <th className="px-2 py-2 text-center font-semibold text-slate-600 w-[4%]" title={t('occurrence')}>{t('occAbbr')}</th>
                              <th className="px-2 py-2 text-center font-semibold text-slate-600 w-[5%]" title={`${t('score')} = ${t('severity')} × ${t('occurrence')}`}>{t('score')}</th>
                              <th className="px-2 py-2 text-center font-semibold text-slate-600 w-[15%]">{t('measures')}</th>
                              <th className="px-2 py-2 text-left font-semibold text-slate-600 w-[12%]">{t('detail')}</th>
                              <th className="px-2 py-2 text-left font-semibold text-slate-600 w-[8%]">{t('responsibility')}</th>
                              <th className="px-2 py-2 text-center font-semibold text-slate-600 w-[6%]">{t('actions')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {catItems.length === 0 ? (
                              <tr><td colSpan={13} className="text-center py-6 text-slate-400">{t('noItemsInCat')}</td></tr>
                            ) : catItems.map(item => {
                              const score = item.severity * item.occurrence;
                              return (
                              <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition">
                                <td className="px-2 py-2 font-mono text-center">{item.item_no}</td>
                                <td className="px-2 py-2">{item.risk_opportunity}</td>
                                <td className="px-2 py-2 text-slate-600">{item.impact}</td>
                                <td className="px-2 py-2 text-slate-600">{item.existing_control}</td>
                                <td className="px-2 py-2 text-center">{item.type_risk ? <span className="text-red-500 font-bold">✕</span> : '—'}</td>
                                <td className="px-2 py-2 text-center">{item.type_opportunity ? <span className="text-emerald-500 font-bold">✕</span> : '—'}</td>
                                <td className="px-2 py-2 text-center font-medium">{item.severity}</td>
                                <td className="px-2 py-2 text-center font-medium">{item.occurrence}</td>
                                <td className="px-2 py-2 text-center">
                                  <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold border ${riskColor(score)}`}>
                                    {score}
                                  </span>
                                </td>
                                <td className="px-2 py-2">
                                  <div className="flex flex-wrap gap-1">
                                    {item.measure_accept ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">{t('acceptRisk')}</span> : null}
                                    {item.measure_procedure ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">{t('procedure')}</span> : null}
                                    {item.measure_kpi ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">{t('kpi')}</span> : null}
                                    {item.measure_preventive ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">{t('preventive')}</span> : null}
                                  </div>
                                </td>
                                <td className="px-2 py-2 text-slate-600 whitespace-pre-line text-[11px]">{item.detail}</td>
                                <td className="px-2 py-2 text-slate-600">{item.responsibility}</td>
                                <td className="px-2 py-2 text-center">
                                  <div className="flex items-center justify-center gap-0.5">
                                    <button onClick={() => openItemDetail(item)} className="p-1 rounded hover:bg-slate-200" title={t('tooltipView')}>
                                      <Eye size={13} className="text-slate-500" />
                                    </button>
                                    <button onClick={() => openEditRequestForItem(item)} className="p-1 rounded hover:bg-slate-200" title={t('tooltipRequestEdit')}>
                                      <Edit3 size={13} className="text-orange-500" />
                                    </button>
                                    {isManager && (
                                      <button onClick={() => openInsertAfter(item)} className="p-1 rounded hover:bg-slate-200" title={t('tooltipInsertBelow')}>
                                        <ArrowDown size={13} className="text-blue-500" />
                                      </button>
                                    )}
                                    {isAdmin && (
                                      <button onClick={() => handleDeleteItem(item.id)} className="p-1 rounded hover:bg-amber-100" title={t('tooltipDelete')}>
                                        <Trash2 size={13} className="text-amber-700" />
                                      </button>
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
              })}
            </div>
          )}

          {/* Request Change section */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Edit3 size={16} className="text-orange-500" />
                  {t('requestChanges')}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {t('requestChangesDesc')}
                </p>
              </div>
              <button
                onClick={() => { setEditForm({ ...emptyEditForm, request_type: 'EDIT' }); setFormError(''); setShowEditRequest(true); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition shadow-sm"
              >
                <Edit3 size={16} /> {t('requestChange')}
              </button>
            </div>
            {/* Recent pending requests summary */}
            {editRequests.filter(r => r.status === 'PENDING').length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2 text-xs text-amber-600">
                  <Bell size={14} />
                  <span className="font-medium">
                    {editRequests.filter(r => r.status === 'PENDING').length} {t('pendingAwaiting')}
                  </span>
                  <button onClick={() => setActiveTab('requests')} className="ml-auto text-blue-600 hover:underline font-medium">
                    {t('viewAll')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══ TAB: Edit Requests ═══ */}
      {activeTab === 'requests' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 w-[5%]">#</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 w-[10%]">{t('type')}</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 w-[15%]">{t('itemCategory')}</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 w-[20%]">{t('reason')}</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 w-[10%]">{t('requester')}</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 w-[10%]">{t('approver')}</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 w-[10%]">{t('status')}</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 w-[10%]">{t('date')}</th>
                <th className="px-3 py-2.5 text-center font-semibold text-slate-600 w-[10%]">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {editRequests.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-16 text-slate-400">
                  <ClipboardList size={32} className="mx-auto mb-2 opacity-40" />
                  {t('noEditRequests')}
                </td></tr>
              ) : editRequests.map((r, idx) => {
                const isMyApproval = r.status === 'PENDING' && r.approver_id === (user as any)?.id;
                return (
                  <tr key={r.id} className={`border-b border-slate-50 hover:bg-slate-50/60 ${isMyApproval ? 'bg-amber-50/60' : ''}`}>
                    <td className="px-3 py-2">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        r.request_type === 'EDIT' ? 'bg-blue-100 text-blue-700' :
                        r.request_type === 'ADD' ? 'bg-emerald-100 text-emerald-700' :
                        r.request_type === 'DELETE' ? 'bg-red-100 text-red-700' :
                        'bg-purple-100 text-purple-700'
                      }`}>{r.request_type}</span>
                    </td>
                    <td className="px-3 py-2 truncate" title={r.risk_opportunity || r.category_name || ''}>
                      {r.risk_opportunity || r.category_name || '—'}
                    </td>
                    <td className="px-3 py-2">{r.reason}</td>
                    <td className="px-3 py-2">{r.requester_name}</td>
                    <td className="px-3 py-2">{r.approver_name}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusBadge(r.status)}`}>
                        {r.status === 'APPROVED' ? t('statusApproved') : r.status === 'REJECTED' ? t('statusRejected') : t('statusPending')}
                      </span>
                      {r.reject_reason && (
                        <div className="text-[10px] text-red-500 mt-0.5" title={r.reject_reason}>
                          {t('reasonPrefix')}: {r.reject_reason.substring(0, 40)}...
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-center">
                      {isMyApproval && (
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleApproveRequest(r.id)}
                            className="p-1 rounded bg-emerald-100 hover:bg-emerald-200" title={t('tooltipApprove')}>
                            <Check size={13} className="text-emerald-700" />
                          </button>
                          <button onClick={() => { setRejectRequestId(r.id); setRejectReason(''); }}
                            className="p-1 rounded bg-red-100 hover:bg-red-200" title={t('tooltipReject')}>
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
      )}

      {/* ═══ TAB: Revision History ═══ */}
      {activeTab === 'revisions' && (
        <div className="space-y-3">
          {isManager && (
            <div className="flex justify-end">
              <button onClick={() => { setRevForm(emptyRevForm); setFormError(''); setShowAddRevision(true); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition shadow-sm">
                <Plus size={16} /> {t('addRevision')}
              </button>
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600 w-[8%]">{t('no')}</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600 w-[15%]">{t('reviseNo')}</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600 w-[15%]">{t('effectiveDate')}</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600 w-[42%]">{t('detail')}</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600 w-[20%]">{t('remark')}</th>
                </tr>
              </thead>
              <tbody>
                {revisions.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-slate-400">{t('noRevisionHistory')}</td></tr>
                ) : [...revisions].reverse().map((r, idx) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">{idx + 1}</td>
                    <td className="px-4 py-2.5 font-medium">{r.rev_no}</td>
                    <td className="px-4 py-2.5">{r.effective_date}</td>
                    <td className="px-4 py-2.5">{r.detail}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.remark || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Add Item ═══ */}
      {showAddItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">
                {itemForm.insert_after != null ? `${t('insertRiskItem')} (${t('after')} #${itemForm.insert_after})` : t('addRiskItemTitle')}
              </h2>
              <button onClick={() => setShowAddItem(false)} className="p-1 rounded-lg hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2">{formError}</div>}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('category')} <span className="text-red-500">*</span></label>
                <select value={itemForm.category_id} onChange={e => setItemForm(f => ({ ...f, category_id: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                  <option value="">{t('selectCategory')}</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('riskOpportunityLabel')} <span className="text-red-500">*</span></label>
                <textarea rows={2} value={itemForm.risk_opportunity}
                  onChange={e => setItemForm(f => ({ ...f, risk_opportunity: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('impact')}</label>
                  <textarea rows={2} value={itemForm.impact}
                    onChange={e => setItemForm(f => ({ ...f, impact: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('existingProcessCtrl')}</label>
                  <textarea rows={2} value={itemForm.existing_control}
                    onChange={e => setItemForm(f => ({ ...f, existing_control: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={itemForm.type_risk}
                      onChange={e => setItemForm(f => ({ ...f, type_risk: e.target.checked }))}
                      className="rounded border-slate-300" />
                    {t('risk')}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={itemForm.type_opportunity}
                      onChange={e => setItemForm(f => ({ ...f, type_opportunity: e.target.checked }))}
                      className="rounded border-slate-300" />
                    {t('opportunity')}
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('severity')} (1-5)</label>
                  <input type="number" min={1} max={5} value={itemForm.severity}
                    onChange={e => setItemForm(f => ({ ...f, severity: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('occurrence')} (1-5)</label>
                  <input type="number" min={1} max={5} value={itemForm.occurrence}
                    onChange={e => setItemForm(f => ({ ...f, occurrence: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('additionalMeasures')}</label>
                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={itemForm.measure_accept}
                      onChange={e => setItemForm(f => ({ ...f, measure_accept: e.target.checked }))}
                      className="rounded border-slate-300" />
                    {t('acceptRiskFull')}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={itemForm.measure_procedure}
                      onChange={e => setItemForm(f => ({ ...f, measure_procedure: e.target.checked }))}
                      className="rounded border-slate-300" />
                    {t('procedureFull')}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={itemForm.measure_kpi}
                      onChange={e => setItemForm(f => ({ ...f, measure_kpi: e.target.checked }))}
                      className="rounded border-slate-300" />
                    {t('kpiFull')}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={itemForm.measure_preventive}
                      onChange={e => setItemForm(f => ({ ...f, measure_preventive: e.target.checked }))}
                      className="rounded border-slate-300" />
                    {t('preventiveFull')}
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('detailDocRef')}</label>
                  <textarea rows={2} value={itemForm.detail}
                    onChange={e => setItemForm(f => ({ ...f, detail: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('responsibility')}</label>
                  <input value={itemForm.responsibility}
                    onChange={e => setItemForm(f => ({ ...f, responsibility: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button onClick={() => setShowAddItem(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">{t('cancel')}</button>
                <button onClick={handleAddItem} disabled={saving}
                  className="px-6 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition">
                  {saving ? t('saving') : t('addItem')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Edit Request ═══ */}
      {showEditRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">
                {editForm.request_type === 'EDIT' ? t('requestEditTitle') :
                 editForm.request_type === 'ADD' ? t('requestAddItemTitle') :
                 editForm.request_type === 'DELETE' ? t('requestDeletion') :
                 t('requestNewCategory')}
              </h2>
              <button onClick={() => setShowEditRequest(false)} className="p-1 rounded-lg hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2">{formError}</div>}

              {/* Request type selector */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('requestType')}</label>
                <select value={editForm.request_type}
                  onChange={e => setEditForm(f => ({ ...f, request_type: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                  <option value="EDIT">{t('editExistingItem')}</option>
                  <option value="ADD">{t('addNewItem')}</option>
                  <option value="DELETE">{t('deleteItem')}</option>
                  <option value="ADD_CATEGORY">{t('addNewCategory')}</option>
                </select>
              </div>

              {editForm.request_type === 'ADD_CATEGORY' ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('categoryName')} <span className="text-red-500">*</span></label>
                  <input value={editForm.new_category_name}
                    onChange={e => setEditForm(f => ({ ...f, new_category_name: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              ) : (
                <>
                  {editForm.request_type === 'ADD' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">{t('category')} <span className="text-red-500">*</span></label>
                      <select value={editForm.category_id || ''}
                        onChange={e => setEditForm(f => ({ ...f, category_id: Number(e.target.value) || null }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                        <option value="">{t('selectCategory')}</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  )}

                  {(editForm.request_type === 'EDIT' || editForm.request_type === 'ADD') && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{t('riskOpportunityLabel')}</label>
                        <textarea rows={2} value={editForm.risk_opportunity}
                          onChange={e => setEditForm(f => ({ ...f, risk_opportunity: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">{t('impact')}</label>
                          <textarea rows={2} value={editForm.impact}
                            onChange={e => setEditForm(f => ({ ...f, impact: e.target.value }))}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">{t('existingControl')}</label>
                          <textarea rows={2} value={editForm.existing_control}
                            onChange={e => setEditForm(f => ({ ...f, existing_control: e.target.value }))}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-4">
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={editForm.type_risk}
                              onChange={e => setEditForm(f => ({ ...f, type_risk: e.target.checked }))} className="rounded border-slate-300" />
                            {t('risk')}
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={editForm.type_opportunity}
                              onChange={e => setEditForm(f => ({ ...f, type_opportunity: e.target.checked }))} className="rounded border-slate-300" />
                            {t('opportunity')}
                          </label>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">{t('severity')}</label>
                          <input type="number" min={1} max={5} value={editForm.severity}
                            onChange={e => setEditForm(f => ({ ...f, severity: e.target.value }))}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">{t('occurrence')}</label>
                          <input type="number" min={1} max={5} value={editForm.occurrence}
                            onChange={e => setEditForm(f => ({ ...f, occurrence: e.target.value }))}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                        </div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3">
                        <label className="block text-sm font-medium text-slate-700 mb-2">{t('additionalMeasures')}</label>
                        <div className="flex flex-wrap gap-3">
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={editForm.measure_accept}
                              onChange={e => setEditForm(f => ({ ...f, measure_accept: e.target.checked }))} className="rounded border-slate-300" />
                            {t('acceptRiskFull')}
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={editForm.measure_procedure}
                              onChange={e => setEditForm(f => ({ ...f, measure_procedure: e.target.checked }))} className="rounded border-slate-300" />
                            {t('procedureFull')}
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={editForm.measure_kpi}
                              onChange={e => setEditForm(f => ({ ...f, measure_kpi: e.target.checked }))} className="rounded border-slate-300" />
                            {t('kpiFull')}
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={editForm.measure_preventive}
                              onChange={e => setEditForm(f => ({ ...f, measure_preventive: e.target.checked }))} className="rounded border-slate-300" />
                            {t('preventiveFull')}
                          </label>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">{t('detail')}</label>
                          <textarea rows={2} value={editForm.detail}
                            onChange={e => setEditForm(f => ({ ...f, detail: e.target.value }))}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">{t('responsibility')}</label>
                          <input value={editForm.responsibility}
                            onChange={e => setEditForm(f => ({ ...f, responsibility: e.target.value }))}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Reason & approver */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-amber-800">{t('approvalRequired')}</p>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('reasonForChange')} <span className="text-red-500">*</span></label>
                  <textarea rows={2} value={editForm.reason}
                    onChange={e => setEditForm(f => ({ ...f, reason: e.target.value }))}
                    placeholder={t('reasonPlaceholder')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('approverManager')} <span className="text-red-500">*</span></label>
                  <select value={editForm.approver_id}
                    onChange={e => {
                      const mgr = managers.find(m => m.id === Number(e.target.value));
                      setEditForm(f => ({ ...f, approver_id: e.target.value, approver_name: mgr?.display_name || '' }));
                    }}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300">
                    <option value="">{t('selectApprover')}</option>
                    {managers.map(m => (
                      <option key={m.id} value={m.id}>{m.display_name} ({m.employee_code})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button onClick={() => setShowEditRequest(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">{t('cancel')}</button>
                <button onClick={handleSubmitEditRequest} disabled={saving}
                  className="px-6 py-2 text-sm rounded-lg bg-orange-500 text-white font-medium hover:bg-orange-600 disabled:opacity-50 transition">
                  {saving ? t('submitting') : t('submitForApproval')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: View Item Detail ═══ */}
      {showViewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">{showViewItem.category_name} — #{showViewItem.item_no}</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => openEditRequestForItem(showViewItem)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-50 transition">
                  <Edit3 size={14} /> {t('requestEdit')}
                </button>
                <button onClick={() => setShowViewItem(null)} className="p-1 rounded-lg hover:bg-slate-100"><X size={20} /></button>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4 text-sm">
              <div>
                <span className="text-slate-500 block mb-1">{t('riskOpportunityLabel')}</span>
                <p className="bg-slate-50 rounded-lg p-3 font-medium">{showViewItem.risk_opportunity}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-500 block mb-1">{t('impact')}</span>
                  <p className="bg-slate-50 rounded-lg p-3">{showViewItem.impact || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">{t('existingControl')}</span>
                  <p className="bg-slate-50 rounded-lg p-3">{showViewItem.existing_control || '—'}</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <span className="text-slate-500 block">{t('type')}</span>
                  <span className="font-medium">
                    {showViewItem.type_risk ? t('risk') : ''}{showViewItem.type_risk && showViewItem.type_opportunity ? ' / ' : ''}{showViewItem.type_opportunity ? t('opportunity') : ''}
                    {!showViewItem.type_risk && !showViewItem.type_opportunity ? '—' : ''}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">{t('severity')}</span>
                  <span className="font-medium">{showViewItem.severity}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">{t('occurrence')}</span>
                  <span className="font-medium">{showViewItem.occurrence}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">{t('score')}</span>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold border ${riskColor(showViewItem.severity * showViewItem.occurrence)}`}>
                    {showViewItem.severity * showViewItem.occurrence}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-slate-500 block mb-1">{t('additionalMeasures')}</span>
                <div className="flex flex-wrap gap-2">
                  {showViewItem.measure_accept ? <span className="px-2 py-1 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200">{t('acceptRiskFull')}</span> : null}
                  {showViewItem.measure_procedure ? <span className="px-2 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">{t('procedureViewFull')}</span> : null}
                  {showViewItem.measure_kpi ? <span className="px-2 py-1 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">{t('kpiFull')}</span> : null}
                  {showViewItem.measure_preventive ? <span className="px-2 py-1 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200">{t('preventiveFull')}</span> : null}
                  {!showViewItem.measure_accept && !showViewItem.measure_procedure && !showViewItem.measure_kpi && !showViewItem.measure_preventive && <span className="text-slate-400">{t('noneSpecified')}</span>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-500 block mb-1">{t('detailDocRef')}</span>
                  <p className="bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">{showViewItem.detail || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">{t('responsibility')}</span>
                  <p className="bg-slate-50 rounded-lg p-3">{showViewItem.responsibility || '—'}</p>
                </div>
              </div>

              {/* Edit History */}
              {viewEditHistory.length > 0 && (
                <div className="border-t border-slate-100 pt-4">
                  <span className="text-slate-600 font-semibold flex items-center gap-1.5 mb-2"><History size={14} /> {t('editHistory')} ({viewEditHistory.length})</span>
                  <div className="space-y-2">
                    {viewEditHistory.map(h => (
                      <div key={h.id} className="bg-slate-50 rounded-lg px-3 py-2 text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-slate-700">{t('editedBy')}: {h.editor_name}</span>
                          <span className="text-slate-400">{new Date(h.edited_at).toLocaleString()}</span>
                        </div>
                        <div className="text-slate-500">{t('approvedBy')}: {h.approver_name}</div>
                        {h.changes && <div className="text-slate-500 mt-1">{t('fieldsChanged')}: {h.changes}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Add Category ═══ */}
      {showAddCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">{t('addCategory')}</h2>
              <button onClick={() => setShowAddCategory(false)} className="p-1 rounded-lg hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('categoryName')} <span className="text-red-500">*</span></label>
                <input value={catName} onChange={e => setCatName(e.target.value)}
                  placeholder={t('egExternalFactors')}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowAddCategory(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">{t('cancel')}</button>
                <button onClick={handleAddCategory} disabled={saving}
                  className="px-6 py-2 text-sm rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 transition">
                  {saving ? t('adding') : t('addCategory')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Add Revision ═══ */}
      {showAddRevision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">{t('addRevisionHistory')}</h2>
              <button onClick={() => setShowAddRevision(false)} className="p-1 rounded-lg hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2">{formError}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('reviseNo')} <span className="text-red-500">*</span></label>
                  <input value={revForm.rev_no} onChange={e => setRevForm(f => ({ ...f, rev_no: e.target.value }))}
                    placeholder={t('egRev')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('effectiveDate')} <span className="text-red-500">*</span></label>
                  <input type="date" value={revForm.effective_date} onChange={e => setRevForm(f => ({ ...f, effective_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('detail')} <span className="text-red-500">*</span></label>
                <textarea rows={2} value={revForm.detail} onChange={e => setRevForm(f => ({ ...f, detail: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('remark')}</label>
                <input value={revForm.remark} onChange={e => setRevForm(f => ({ ...f, remark: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowAddRevision(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">{t('cancel')}</button>
                <button onClick={handleAddRevision} disabled={saving}
                  className="px-6 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition">
                  {saving ? t('adding') : t('addRevision')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Reject Request ═══ */}
      {rejectRequestId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">{t('rejectEditRequest')}</h2>
              <button onClick={() => setRejectRequestId(null)} className="p-1 rounded-lg hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('rejectionReason')} <span className="text-red-500">*</span></label>
                <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                  placeholder={t('rejectionPlaceholder')}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setRejectRequestId(null)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">{t('cancel')}</button>
                <button onClick={handleRejectRequest} disabled={!rejectReason.trim()}
                  className="px-6 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 transition">
                  {t('rejectRequest')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-6 pt-6 pb-2 flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-800">{t('confirmDelete')}</h3>
                <p className="text-sm text-slate-600 mt-1">{deleteConfirm.message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4">
              <button onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition">
                {t('cancel')}
              </button>
              <button onClick={deleteConfirm.onConfirm}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition">
                {t('ok')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
