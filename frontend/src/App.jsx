import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DCRList from './pages/DCRList';
import CreateDCR from './pages/CreateDCR';
import DCRDetail from './pages/DCRDetail';
import UploadRevision from './pages/UploadRevision';
import Admin from './pages/Admin';
import Migration from './pages/Migration';
import DocumentView from './pages/DocumentView';
import Flowchart from './pages/Flowchart';
import Plan from './pages/Plan';
import Report from './pages/Report';
import WorkflowFlowchart from './pages/WorkflowFlowchart';
import KPIFlowchart from './pages/KPIFlowchart';
import ProcedureFlowchart from './pages/ProcedureFlowchart';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/dcr"
        element={
          <ProtectedRoute>
            <Layout>
              <DCRList />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/dcr/create"
        element={
          <ProtectedRoute>
            <Layout>
              <CreateDCR />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/dcr/:id"
        element={
          <ProtectedRoute>
            <Layout>
              <DCRDetail />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/dcr/:id/upload"
        element={
          <ProtectedRoute>
            <Layout>
              <UploadRevision />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Viewing a specific document - Note: DocumentView handles its own layout/fullscreen */}
      <Route
        path="/documents/:id"
        element={
          <ProtectedRoute>
            <DocumentView />
          </ProtectedRoute>
        }
      />

      <Route
        path="/flowchart"
        element={
          <ProtectedRoute>
            <Layout>
              <Flowchart />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/plan"
        element={
          <ProtectedRoute>
            <Layout>
              <Plan />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/report"
        element={
          <ProtectedRoute>
            <Layout>
              <Report />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/flowchart/workflow"
        element={
          <ProtectedRoute>
            <Layout>
              <WorkflowFlowchart />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/flowchart/kpi"
        element={
          <ProtectedRoute>
            <Layout>
              <KPIFlowchart />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/flowchart/procedure"
        element={
          <ProtectedRoute>
            <Layout>
              <ProcedureFlowchart />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <Layout>
              <Admin />
            </Layout>
          </ProtectedRoute>
        }
      />

       <Route
        path="/admin/migrate"
        element={
          <ProtectedRoute>
            {/* The Migration component itself will handle ADMIN role check, or we wraps here */}
            <Layout>
              <Migration />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}