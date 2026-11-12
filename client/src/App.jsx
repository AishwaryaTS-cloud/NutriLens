import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { GuestRoute, ProtectedRoute } from './components/RouteGuards.jsx';
import Compare from './pages/Compare.jsx';
import Dashboard from './pages/Dashboard.jsx';
import DesignSystem from './pages/DesignSystem.jsx';
import History from './pages/History.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import Preferences from './pages/Preferences.jsx';
import Register from './pages/Register.jsx';
import Scan from './pages/Scan.jsx';
import ScanDetail from './pages/ScanDetail.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route element={<GuestRoute />}>
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="preferences" element={<Preferences />} />
          <Route path="scan" element={<Scan />} />
          <Route path="history" element={<History />} />
          <Route path="history/:id" element={<ScanDetail />} />
          <Route path="compare" element={<Compare />} />
        </Route>
        {import.meta.env.DEV && <Route path="design-system" element={<DesignSystem />} />}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
