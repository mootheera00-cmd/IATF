import axios, { AxiosResponse } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';
export const API_BASE_URL = API_URL;

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const roleMode = localStorage.getItem('role_mode_active');
  if (roleMode) {
    config.headers['X-Role-Mode'] = roleMode;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export interface LoginResponse {
  user: Record<string, unknown>;
  token?: string;
}

export const authAPI = {
  login: (employee_code: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { employee_code, password }),
};

export const dcrAPI = {
  create: (data: Record<string, unknown>) => api.post('/change-requests', data),
  createNewDocument: (data: { category: string; subCategory: string; reason: string; documentName: string }) =>
    api.post('/change-requests/new-document', data),
  previewNewDocument: (data: { category: string; subCategory: string }) =>
    api.post('/change-requests/new-document/preview', data),
  listApprovers: (level?: string) =>
    api.get('/change-requests/approvers', { params: level ? { level } : undefined }),
  listCheckers: () => api.get('/change-requests/checkers'),
  getReuploadOptions: (documentId: number | string) =>
    api.get('/change-requests/reupload/options', { params: { document_id: documentId } }),
  createReupload: (payload: {
    document_id: number | string;
    target_revision_id?: number | string | null;
    assignee_id?: number | string | null;
    reason: string;
  }) => api.post('/change-requests/reupload', payload),
  submit: (id: number | string) => api.post(`/change-requests/${id}/submit`),
  makeDecision: (
    id: number | string,
    decision: string,
    comment?: string,
    files?: { signedPdf?: File | null; markedPdf?: File | null; source?: File | null }
  ) => {
    if (files?.signedPdf || files?.markedPdf || files?.source) {
      const formData = new FormData();
      formData.append('decision', decision);
      if (comment) formData.append('comment', comment);
      if (files?.signedPdf) formData.append('signed_pdf', files.signedPdf);
      if (files?.markedPdf) formData.append('marked_pdf', files.markedPdf);
      if (files?.source) formData.append('source', files.source);
      return api.post(`/change-requests/${id}/decision`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    }
    return api.post(`/change-requests/${id}/decision`, { decision, comment });
  },
  uploadRevision: (id: number | string, formData: FormData) =>
    api.post(`/change-requests/${id}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
  uploadNonSignedPdf: (id: number | string, formData: FormData) =>
    api.post(`/change-requests/${id}/non-signed-pdf`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
  makeReview: (id: number | string, decision: string, comment?: string) =>
    api.post(`/change-requests/${id}/review`, { decision, comment }),
  list: (role?: string) => api.get('/change-requests', { params: { role } }),
  getDetail: (id: number | string) => api.get(`/change-requests/${id}`),
  getHistory: (id: number | string) => api.get(`/change-requests/${id}/history`),
  getSourceDownloadLink: (id: number | string) => api.get(`/change-requests/${id}/source-link`),
  getRevisionDownloadLinks: (id: number | string) => api.get(`/change-requests/${id}/revision-links`),
  closeTicket: (id: number | string, reason?: string) => api.post(`/change-requests/${id}/close`, { reason }),
  requestDelete: (id: number | string, reason?: string) => api.post(`/change-requests/${id}/delete-request`, { reason }),
  approveDelete: (id: number | string, reason?: string) => api.post(`/change-requests/${id}/delete-approve`, { reason }),
  downloadFile: (token: string) => api.get(`/change-requests/download/${token}`),
};

export const notificationAPI = {
  getNotifications: (unreadOnly = false) =>
    api.get('/notifications', { params: { unread_only: unreadOnly } }),
  markAsRead: (id: number | string) => api.post(`/notifications/${id}/read`),
  markAllAsRead: () => api.post('/notifications/mark-all-read'),
};

export const adminAPI = {
  getAuditTrail: (type: string, id: number | string) => api.get(`/admin/audit/${type}/${id}`),
  getUserAudit: (userId: number | string, startDate?: string, endDate?: string) =>
    api.get(`/admin/audit/user/${userId}`, {
      params: { start_date: startDate, end_date: endDate }
    }),
  getComplianceReport: (startDate?: string, endDate?: string) =>
    api.get('/admin/compliance-report', {
      params: { start_date: startDate, end_date: endDate }
    }),
  getCRApprovals: (crId: number | string) => api.get(`/admin/change-request/${crId}/approvals`),
  getDocumentRevisions: (docId: number | string) => api.get(`/admin/document/${docId}/revisions`),
  createRole: (name: string) => api.post('/admin/roles', { name }),
  assignUserRole: (userId: number | string, roleId: number | string) =>
    api.put(`/admin/users/${userId}/role`, { role_id: roleId }),
  migrateDocument: (formData: FormData) => api.post('/admin/migrate', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  listUsers: () => api.get('/users'),
  listUserRoles: () => api.get('/users/roles'),
  createUser: (payload: Record<string, unknown>) => api.post('/users', payload),
  updateUser: (id: number | string, payload: Record<string, unknown>) => api.put(`/users/${id}`, payload),
  deleteUser: (id: number | string) => api.delete(`/users/${id}`),
  getLogs: (params?: { sort?: string; order?: string; limit?: number }) =>
    api.get('/logs', { params }),
};

export const documentAPI = {
  list: (params?: Record<string, unknown>) => api.get('/search', { params }),
  listProcedure: () => api.get('/search/procedure'),
  getMasterList: () => api.get('/search/master-list'),
  getLatestKpi: () => api.get('/search/kpi/latest'),
  get: (id: number | string) => api.get(`/documents/${id}`),
  view: (id: number | string) => api.get(`/documents/${id}/view`, { responseType: 'blob' }),
  viewRevision: (id: number | string, revisionId: number | string) =>
    api.get(`/documents/${id}/revisions/${revisionId}/view`, { responseType: 'blob' }),
  print: (id: number | string) => api.get(`/documents/${id}/print`, { responseType: 'blob' }),
  printRevision: (id: number | string, revisionId: number | string) =>
    api.get(`/documents/${id}/revisions/${revisionId}/print`, { responseType: 'blob' }),
  save: (id: number | string) => api.get(`/documents/${id}/save`, { responseType: 'blob' }),
  saveRevision: (id: number | string, revisionId: number | string) =>
    api.get(`/documents/${id}/revisions/${revisionId}/save`, { responseType: 'blob' }),
  close: (id: number | string, payload?: Record<string, unknown>) => api.post(`/documents/${id}/close`, payload || {}),
  original: (id: number | string) => api.get(`/documents/${id}/original`, { responseType: 'blob' }),
};

export const reportAPI = {
  search: (keyword: string) => api.get('/report/search', { params: { keyword } }),
  file: (filePath: string, disposition: 'inline' | 'attachment' = 'inline') =>
    api.get('/report/file', {
      params: { path: filePath, disposition },
      responseType: 'blob'
    }),
  openFolder: (filePath: string) => api.post('/report/open-folder', { path: filePath })
};

export const trainingAPI = {
  years:   () => api.get('/training/years'),
  list:    (year?: number) => api.get('/training', { params: year ? { year } : {} }),
  summary: (year?: number) => api.get('/training/summary', { params: year ? { year } : {} }),
  monthly: (year?: number) => api.get('/training/monthly', { params: year ? { year } : {} }),
  create: (data: Record<string, unknown>) => api.post('/training', data),
  update: (id: number | string, data: Record<string, unknown>) => api.put(`/training/${id}`, data),
  remove: (id: number | string) => api.delete(`/training/${id}`),
};

export const trainingPlanAPI = {
  years:            ()                                              => api.get('/training/plan/years'),
  list:             (year: number)                                  => api.get('/training/plan', { params: { year } }),
  create:           (data: Record<string, unknown>)                 => api.post('/training/plan', data),
  update:           (id: number|string, data: Record<string, unknown>) => api.put(`/training/plan/${id}`, data),
  remove:           (id: number|string)                             => api.delete(`/training/plan/${id}`),
  setActual:        (id: number|string, month: string, actual: boolean) =>
                      api.patch(`/training/plan/${id}/actual`, { month, actual }),
  patchBudgetActual:(id: number|string, budget_actual: number|null) =>
                      api.patch(`/training/plan/${id}/budget-actual`, { budget_actual }),
  seed:             (programs: unknown[], year: number)             => api.post('/training/plan/seed', { programs, year }),
  // Approval flow
  getApproval:      (year: number)                                  => api.get(`/training/plan/approval/${year}`),
  submitForCheck:   (year: number, comment?: string)                => api.post(`/training/plan/approval/${year}/submit`, { comment }),
  check:            (year: number, action: 'approve'|'reject', comment?: string) =>
                      api.post(`/training/plan/approval/${year}/check`, { action, comment }),
  finalApprove:     (year: number, action: 'approve'|'reject', comment?: string) =>
                      api.post(`/training/plan/approval/${year}/approve`, { action, comment }),
  requestEdit:      (year: number, reason: string)                  => api.post('/training/plan/edit-request', { year, reason }),
  reviewEditRequest:(id: number, action: 'approve'|'reject', comment?: string) =>
                      api.post(`/training/plan/edit-request/${id}/review`, { action, comment }),
  getLog:           (year: number)                                  => api.get(`/training/plan/approval-log/${year}`),
};

export const calibrationAPI = {
  list: () => api.get('/calibration'),
  stats: () => api.get('/calibration/stats'),
  create: (data: Record<string, unknown>) => api.post('/calibration', data),
  update: (id: number | string, data: Record<string, unknown>) => api.put(`/calibration/${id}`, data),
  remove: (id: number | string) => api.delete(`/calibration/${id}`),
  // Page-level Person In Charge
  getPic: () => api.get('/calibration/pic'),
  getPicUsers: () => api.get('/calibration/pic-users'),
  assignPic: (pic_user_id: number | null) => api.put('/calibration/pic', { pic_user_id }),
  // History
  getAllEquipmentWithHistory: () =>
    api.get(`/calibration-history/all-equipment/external`),
  getHistory: (equipmentRowId: number | string) =>
    api.get(`/calibration-history/external/${equipmentRowId}`),
  addHistory: (equipmentRowId: number | string, formData: FormData) =>
    api.post(`/calibration-history/external/${equipmentRowId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  updateHistory: (historyId: number | string, formData: FormData) =>
    api.put(`/calibration-history/entry/${historyId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  deleteHistory: (historyId: number | string) =>
    api.delete(`/calibration-history/entry/${historyId}`),
  downloadHistoryFile: (historyId: number | string) =>
    api.get(`/calibration-history/file/${historyId}`, { responseType: 'blob' }),
};

export const inHouseCalibrationAPI = {
  list: () => api.get('/inhouse-calibration'),
  stats: () => api.get('/inhouse-calibration/stats'),
  create: (data: Record<string, unknown>) => api.post('/inhouse-calibration', data),
  update: (id: number | string, data: Record<string, unknown>) => api.put(`/inhouse-calibration/${id}`, data),
  remove: (id: number | string) => api.delete(`/inhouse-calibration/${id}`),
  // Page-level Person In Charge
  getPic: () => api.get('/inhouse-calibration/pic'),
  getPicUsers: () => api.get('/inhouse-calibration/pic-users'),
  assignPic: (pic_user_id: number | null) => api.put('/inhouse-calibration/pic', { pic_user_id }),
  // History
  getAllEquipmentWithHistory: () =>
    api.get(`/calibration-history/all-equipment/inhouse`),
  getHistory: (equipmentRowId: number | string) =>
    api.get(`/calibration-history/inhouse/${equipmentRowId}`),
  addHistory: (equipmentRowId: number | string, formData: FormData) =>
    api.post(`/calibration-history/inhouse/${equipmentRowId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  updateHistory: (historyId: number | string, formData: FormData) =>
    api.put(`/calibration-history/entry/${historyId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  deleteHistory: (historyId: number | string) =>
    api.delete(`/calibration-history/entry/${historyId}`),
  downloadHistoryFile: (historyId: number | string) =>
    api.get(`/calibration-history/file/${historyId}`, { responseType: 'blob' }),
};

export const maintenanceAPI = {
  getEquipment:    (year?: number) => api.get('/maintenance/equipment', { params: year ? { year } : {} }),
  getYears:        () => api.get('/maintenance/equipment/years'),
  getActionCodes:  () => api.get('/maintenance/action-codes'),
  getPlanOverview: (year: number) => api.get(`/maintenance/plan-overview/${year}`),
  getPlan:         (equipmentId: number | string, year?: number) =>
    api.get(`/maintenance/plan/${equipmentId}`, { params: year ? { year } : {} }),
  getHistory:      (equipmentId: number | string) =>
    api.get(`/maintenance/history/${equipmentId}`),
  addHistory:      (equipmentId: number | string, formData: FormData) =>
    api.post(`/maintenance/history/${equipmentId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  updateHistory:   (historyId: number | string, formData: FormData) =>
    api.put(`/maintenance/history/entry/${historyId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  deleteHistory:   (historyId: number | string) =>
    api.delete(`/maintenance/history/entry/${historyId}`),
  downloadFile:    (historyId: number | string) =>
    api.get(`/maintenance/history/file/${historyId}`, { responseType: 'blob' }),
  // Equipment CRUD
  addEquipment:      (data: { equipment_no: number; equipment_name: string; year: number; location?: string; notes?: string }) =>
    api.post('/maintenance/equipment', data),
  removeEquipment:   (id: number | string) =>
    api.delete(`/maintenance/equipment/${id}`),
  carryoverEquipment:(source_year: number, target_year: number) =>
    api.post('/maintenance/equipment/carryover', { source_year, target_year }),
  // Plan event CRUD
  addPlanEvent:    (data: Record<string, unknown>) =>
    api.post('/maintenance/plan-event', data),
  updatePlanEvent: (id: number | string, data: Record<string, unknown>) =>
    api.put(`/maintenance/plan-event/${id}`, data),
  deletePlanEvent: (id: number | string) =>
    api.delete(`/maintenance/plan-event/${id}`),
  // Action code CRUD
  addActionCode:    (data: { code: string; description: string; frequency: string }) =>
    api.post('/maintenance/action-code', data),
  updateActionCode: (code: string, data: { description: string; frequency: string }) =>
    api.put(`/maintenance/action-code/${encodeURIComponent(code)}`, data),
  deleteActionCode: (code: string) =>
    api.delete(`/maintenance/action-code/${encodeURIComponent(code)}`),
  // Calibration result CRUD (for action code I entries)
  getCalibrationResults: (historyId: number | string) =>
    api.get(`/maintenance/calibration-result/${historyId}`),
  addCalibrationResult: (historyId: number | string, formData: FormData) =>
    api.post(`/maintenance/calibration-result/${historyId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  updateCalibrationResult: (id: number | string, formData: FormData) =>
    api.put(`/maintenance/calibration-result/entry/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  deleteCalibrationResult: (id: number | string) =>
    api.delete(`/maintenance/calibration-result/entry/${id}`),
  downloadCalibrationFile: (id: number | string) =>
    api.get(`/maintenance/calibration-result/file/${id}`, { responseType: 'blob' }),
};

export const incidentAPI = {
  list:             (params?: Record<string, string>) =>
    api.get('/incidents', { params }),
  get:              (id: number | string) =>
    api.get(`/incidents/${id}`),
  create:           (data: Record<string, unknown>) =>
    api.post('/incidents', data),
  update:           (id: number | string, data: Record<string, unknown>) =>
    api.put(`/incidents/${id}`, data),
  approve:          (id: number | string) =>
    api.post(`/incidents/${id}/approve`),
  reject:           (id: number | string, reason: string) =>
    api.post(`/incidents/${id}/reject`, { reason }),
  getMachineOptions: () =>
    api.get('/incidents/machine-options'),
  addMachineOption:  (name: string) =>
    api.post('/incidents/machine-options', { name }),
  getManagers:       () =>
    api.get('/incidents/managers'),
  uploadAttachments: (id: number | string, formData: FormData) =>
    api.post(`/incidents/${id}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
  getAttachments:    (id: number | string) =>
    api.get(`/incidents/${id}/attachments`),
  downloadAttachment: (id: number | string, attachmentId: number | string) =>
    api.get(`/incidents/${id}/attachments/${attachmentId}/download`, { responseType: 'blob' }),
  deleteAttachment:  (id: number | string, attachmentId: number | string) =>
    api.delete(`/incidents/${id}/attachments/${attachmentId}`),
  deleteRecord:      (id: number | string) =>
    api.delete(`/incidents/${id}`),
  getEditHistory:    (id: number | string) =>
    api.get(`/incidents/${id}/edit-history`),
};

export const riskAssessmentAPI = {
  // Categories
  getCategories:      () => api.get('/risk-assessment/categories'),
  createCategory:     (data: Record<string, unknown>) => api.post('/risk-assessment/categories', data),
  updateCategory:     (id: number | string, data: Record<string, unknown>) => api.put(`/risk-assessment/categories/${id}`, data),
  deleteCategory:     (id: number | string) => api.delete(`/risk-assessment/categories/${id}`),
  // Items
  getItems:           (params?: Record<string, string>) => api.get('/risk-assessment/items', { params }),
  getItem:            (id: number | string) => api.get(`/risk-assessment/items/${id}`),
  createItem:         (data: Record<string, unknown>) => api.post('/risk-assessment/items', data),
  updateItem:         (id: number | string, data: Record<string, unknown>) => api.put(`/risk-assessment/items/${id}`, data),
  deleteItem:         (id: number | string) => api.delete(`/risk-assessment/items/${id}`),
  // Edit Requests (approval flow)
  getManagers:        () => api.get('/risk-assessment/managers'),
  getEditRequests:    (params?: Record<string, string>) => api.get('/risk-assessment/edit-requests', { params }),
  createEditRequest:  (data: Record<string, unknown>) => api.post('/risk-assessment/edit-requests', data),
  approveEditRequest: (id: number | string) => api.post(`/risk-assessment/edit-requests/${id}/approve`),
  rejectEditRequest:  (id: number | string, reason: string) => api.post(`/risk-assessment/edit-requests/${id}/reject`, { reason }),
  // Revisions
  getRevisions:       () => api.get('/risk-assessment/revisions'),
  createRevision:     (data: Record<string, unknown>) => api.post('/risk-assessment/revisions', data),
  // Seed & Stats
  seed:               () => api.post('/risk-assessment/seed'),
  getStats:           () => api.get('/risk-assessment/stats'),
};

export const msaAPI = {
  list:      (type?: string) => api.get('/msa', { params: type ? { type } : {} }),
  get:       (id: number | string) => api.get(`/msa/${id}`),
  create:    (data: Record<string, unknown>) => api.post('/msa', data),
  update:    (id: number | string, data: Record<string, unknown>) => api.put(`/msa/${id}`, data),
  remove:    (id: number | string) => api.delete(`/msa/${id}`),
  stats:     () => api.get('/msa/stats/summary'),
};

export const genericEditRequestAPI = {
  getManagers:    () => api.get('/generic/managers'),
  getRequests:    (module: string, params?: Record<string, string>) =>
    api.get('/generic/edit-requests', { params: { module, ...params } }),
  create:         (data: Record<string, unknown>) => api.post('/generic/edit-requests', data),
  approve:        (id: number | string) => api.post(`/generic/edit-requests/${id}/approve`),
  reject:         (id: number | string, reason: string) =>
    api.post(`/generic/edit-requests/${id}/reject`, { reason }),
};

export default api;
