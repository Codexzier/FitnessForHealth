import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import UserSelect from './pages/UserSelect';
import EspLogin from './pages/EspLogin';
import { ESP32 } from './target';
import Layout from './components/Layout';
import Overview from './pages/Overview';
import History from './pages/History';
import ExercisesPage from './pages/ExercisesPage';
import StretchExercisesPage from './pages/StretchExercisesPage';
import WorkoutEditor from './pages/WorkoutEditor';
import StretchingEditor from './pages/StretchingEditor';
import RunPage from './pages/RunPage';
import ImportPlans from './pages/ImportPlans';
import ImportProgress from './pages/ImportProgress';
import SettingsPage from './pages/SettingsPage';
import PlansPage from './pages/PlansPage';
import PlanEditor from './pages/PlanEditor';
import PlanView from './pages/PlanView';

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page muted">Lade …</div>;
  if (!user) return <Navigate to="/" replace />;
  return children;
}

function Start() {
  const { user, loading } = useAuth();
  if (loading) return <div className="page muted">Lade …</div>;
  if (user) return <Navigate to="/app" replace />;
  return ESP32 ? <EspLogin /> : <UserSelect />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Start />} />
        <Route
          path="/app/run/:kind/:id"
          element={
            <Protected>
              <RunPage />
            </Protected>
          }
        />
        <Route
          path="/app"
          element={
            <Protected>
              <Layout />
            </Protected>
          }
        >
          <Route index element={<Overview />} />
          <Route path="verlauf" element={<History />} />
          <Route path="uebungen" element={<ExercisesPage />} />
          <Route path="stretching-uebungen" element={<StretchExercisesPage />} />
          <Route path="workout/:id" element={<WorkoutEditor />} />
          <Route path="stretching/:id" element={<StretchingEditor />} />
          <Route path="import/plaene" element={<ImportPlans />} />
          <Route path="import/fortschritt" element={<ImportProgress />} />
          <Route path="einstellungen" element={<SettingsPage />} />
          <Route path="plaene" element={<PlansPage />} />
          <Route path="plan/:id" element={<PlanEditor />} />
          <Route path="plan/:id/ansicht" element={<PlanView />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
