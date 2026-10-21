import { Route, Routes } from "react-router-dom";
import { Layout } from "./core/components/Layout";
import { MODULES } from "./modules";
import PortfolioPage from "./pages/PortfolioPage";
import VaultPage from "./pages/VaultPage";
import ActivityPage from "./pages/ActivityPage";
import HelpPage from "./pages/HelpPage";
import DemoPage from "./pages/DemoPage";
import ExplorerPage from "./pages/ExplorerPage";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<PortfolioPage />} />
        <Route path="/vault" element={<VaultPage />} />
        {MODULES.map(({ id, path, page: Page }) => (
          <Route key={id} path={path} element={<Page />} />
        ))}
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/explorer" element={<ExplorerPage />} />
        <Route path="*" element={<PortfolioPage />} />
      </Routes>
    </Layout>
  );
}
