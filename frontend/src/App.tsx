import { Route, Routes } from "react-router-dom";
import { Layout } from "./core/components/Layout";
import { MODULES } from "./modules";
import PortfolioPage from "./pages/PortfolioPage";
import VaultPage from "./pages/VaultPage";
import ActivityPage from "./pages/ActivityPage";
import HelpPage from "./pages/HelpPage";
import ExplorerPage from "./pages/ExplorerPage";
import { ChatWidget } from "./chat/ChatWidget";

export default function App() {
  return (
    <>
      <Layout>
        <Routes>
          <Route path="/" element={<PortfolioPage />} />
          <Route path="/vault" element={<VaultPage />} />
          {MODULES.map(({ id, path, page: Page }) => (
            <Route key={id} path={path} element={<Page />} />
          ))}
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/explorer" element={<ExplorerPage />} />
          <Route path="*" element={<PortfolioPage />} />
        </Routes>
      </Layout>
      {/* Outside the layout so it's available before a wallet is connected, too. */}
      <ChatWidget />
    </>
  );
}
