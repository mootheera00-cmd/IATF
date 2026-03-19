// frontend/src/api.js
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';
export const API_BASE_URL = API_URL;

// Create axios instance with default config
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle errors
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

// Auth endpoints
export const authAPI = {
  login: (employee_code, password) =>
    api.post('/auth/login', { employee_code, password }),
};

// Change Request endpoints
export const dcrAPI = {
  create: (data) => api.post('/change-requests', data),
  listApprovers: () => api.get('/change-requests/approvers'),
  listCheckers: () => api.get('/change-requests/checkers'),
  submit: (id) => api.post(`/change-requests/${id}/submit`),
  makeDecision: (id, decision, comment) =>
    api.post(`/change-requests/${id}/decision`, { decision, comment }),
  uploadRevision: (id, formData) =>
    api.post(`/change-requests/${id}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
  makeReview: (id, decision, comment) =>
    api.post(`/change-requests/${id}/review`, { decision, comment }),
  list: (role) => api.get('/change-requests', { params: { role } }),
  getDetail: (id) => api.get(`/change-requests/${id}`),
  getHistory: (id) => api.get(`/change-requests/${id}/history`),
  downloadFile: (token) => api.get(`/change-requests/download/${token}`),
};

// Notifications
export const notificationAPI = {
  getNotifications: (unreadOnly = false) =>
    api.get('/notifications', { params: { unread_only: unreadOnly } }),
  markAsRead: (id) => api.post(`/notifications/${id}/read`),
  markAllAsRead: () => api.post('/notifications/mark-all-read'),
};

// Admin endpoints
export const adminAPI = {
  getAuditTrail: (type, id) => api.get(`/admin/audit/${type}/${id}`),
  getUserAudit: (userId, startDate, endDate) =>
    api.get(`/admin/audit/user/${userId}`, {
      params: { start_date: startDate, end_date: endDate }
    }),
  getComplianceReport: (startDate, endDate) =>
    api.get('/admin/compliance-report', {
      params: { start_date: startDate, end_date: endDate }
    }),
  getCRApprovals: (crId) => api.get(`/admin/change-request/${crId}/approvals`),
  getDocumentRevisions: (docId) => api.get(`/admin/document/${docId}/revisions`),
  createRole: (name) => api.post('/admin/roles', { name }),
  assignUserRole: (userId, roleId) =>
    api.put(`/admin/users/${userId}/role`, { role_id: roleId }),
  migrateDocument: (formData) => api.post('/admin/migrate', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
  }),
  listUsers: () => api.get('/users'),
  listUserRoles: () => api.get('/users/roles'),
  createUser: (payload) => api.post('/users', payload),
  updateUser: (id, payload) => api.put(`/users/${id}`, payload),
  deleteUser: (id) => api.delete(`/users/${id}`),
};

// Document endpoints
export const documentAPI = {
  list: (params) => api.get('/search', { params }),
  listProcedure: () => api.get('/search/procedure'),
  getLatestKpi: () => api.get('/search/kpi/latest'),
  get: (id) => api.get(`/documents/${id}`), 
  view: (id) => api.get(`/documents/${id}/view`, { responseType: 'blob' }),
  close: (id, payload) => api.post(`/documents/${id}/close`, payload || {}),
  original: (id) => api.get(`/documents/${id}/original`, { responseType: 'blob' }),
};

export default api;
