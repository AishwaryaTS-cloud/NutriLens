import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import DesignSystem from './pages/DesignSystem.jsx';
import Landing from './pages/Landing.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        {import.meta.env.DEV && <Route path="design-system" element={<DesignSystem />} />}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
