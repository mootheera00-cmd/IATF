import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { setCurrentUser } from './hooks/useNewBadge';
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
// Flowchart hub removed – /flowchart now renders WorkflowFlowchart directly
import Plan from './pages/Plan';
import TrainingPlan from './pages/TrainingPlan';
import CalibrationPlan from './pages/CalibrationPlan';
import InHouseCalibrationPlan from './pages/InHouseCalibrationPlan';
import CalibrationHistory from './pages/CalibrationHistory';
import MaintenancePlan from './pages/MaintenancePlan';
import MaintenanceHistory from './pages/MaintenanceHistory';
import Report from './pages/Report';
import ReportSearch from './pages/ReportSearch';
import Logs from './pages/Logs';
import WorkflowFlowchart from './pages/WorkflowFlowchart';
import KPIFlowchart from './pages/KPIFlowchart';
import ProcedureFlowchart from './pages/ProcedureFlowchart';
import Quality from './pages/Quality';
import MSA from './pages/MSA';
import RiskAssessment from './pages/RiskAssessment';
import PowertrainPlan from './pages/PowerTransmissionPlan';
import DocumentRepository from './pages/DocumentRepository';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  // Keep the per-user seen-items storage key in sync whenever the user changes
  useEffect(() => {
    setCurrentUser(user?.id ?? user?.employee_code);
  }, [user]);

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
        element={<Navigate to="/" replace />}
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
        path="/documents"
        element={
          <ProtectedRoute>
            <Layout>
              <DocumentRepository />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/flowchart"
        element={
          <ProtectedRoute>
            <Layout>
              <WorkflowFlowchart />
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
        path="/plan/training"
        element={
          <ProtectedRoute>
            <Layout>
              <TrainingPlan />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/plan/power-transmission"
        element={
          <ProtectedRoute>
            <Layout>
              <PowertrainPlan />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/plan/calibration"
        element={
          <ProtectedRoute>
            <Layout>
              <CalibrationPlan />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/plan/inhouse-calibration"
        element={
          <ProtectedRoute>
            <Layout>
              <InHouseCalibrationPlan />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/plan/calibration/history"
        element={
          <ProtectedRoute>
            <Layout>
              <CalibrationHistory />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/plan/inhouse-calibration/history"
        element={
          <ProtectedRoute>
            <Layout>
              <CalibrationHistory />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/plan/maintenance"
        element={
          <ProtectedRoute>
            <Layout>
              <MaintenancePlan />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/plan/maintenance/history"
        element={
          <ProtectedRoute>
            <Layout>
              <MaintenanceHistory />
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
        path="/report/apxt"
        element={
          <ProtectedRoute>
            <ReportSearch />
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
            <Layout>
              <Migration />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/logs"
        element={
          <ProtectedRoute>
            <Layout>
              <Logs />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/quality"
        element={
          <ProtectedRoute>
            <Layout>
              <Quality />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/quality/msa"
        element={
          <ProtectedRoute>
            <Layout>
              <MSA />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/safety"
        element={
          <ProtectedRoute>
            <Layout>
              <RiskAssessment />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/safety/risk-assessment"
        element={<Navigate to="/safety" replace />}
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
