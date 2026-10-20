import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAccount } from "wagmi";
import { Activity, HelpCircle, LayoutGrid, Menu, Vault, X, type LucideIcon } from "lucide-react";
import { MODULES } from "../../modules";
import { ConnectButton } from "./ConnectButton";
import { NetworkBadge, WrongNetworkBanner } from "./NetworkBadge";
import { Welcome } from "./Welcome";
import { cx } from "./ui";

type NavItem = { path: string; label: string; icon: LucideIcon };

const CORE_TOP: NavItem[] = [
  { path: "/", label: "Portfolio", icon: LayoutGrid },
  { path: "/vault", label: "Shared Vault", icon: Vault },
];
const CORE_BOTTOM: NavItem[] = [
  { path: "/activity", label: "Activity", icon: Activity },
  { path: "/help", label: "Help & Setup", icon: HelpCircle },
];

function NavGroup({ title, items }: { title?: string; items: NavItem[] }) {
  return (
    <div>
      {title && <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-subtle uppercase">{title}</p>}
      <ul className="space-y-0.5">
        {items.map(({ path, label, icon: Icon }) => (
          <li key={path}>
            <NavLink
              to={path}
              end={path === "/"}
              className={({ isActive }) =>
                cx(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive ? "bg-surface text-ink shadow-[var(--shadow-card)] ring-1 ring-line" : "text-muted hover:bg-surface/60 hover:text-ink",
                )
              }
            >
              <Icon size={18} strokeWidth={1.8} />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SidebarContent() {
  return (
    <div className="flex h-full flex-col px-4 py-5">
      <div className="mb-8 flex items-center gap-2.5 px-2">
        <img src="/logo.svg" alt="" className="h-8 w-8" />
        <div className="leading-tight">
          <p className="text-[15px] font-semibold">Modular DeFi</p>
          <p className="text-[11px] text-subtle">One Core. Multiple Products.</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-6" aria-label="Main">
        <NavGroup items={CORE_TOP} />
        <NavGroup title="Modules" items={MODULES.map((m) => ({ path: m.path, label: m.name, icon: m.icon }))} />
        <NavGroup items={CORE_BOTTOM} />
      </nav>
      <div className="rounded-xl border border-dashed border-line-strong px-3 py-2.5 text-[11px] leading-relaxed text-muted">
        <b className="font-semibold text-ink">Prototype</b> · test tokens on a local chain. Not audited.
      </div>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { isConnected } = useAccount();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMobileOpen(false), [location.pathname]);

  const needsWallet = location.pathname !== "/help";

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-canvas lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-canvas shadow-xl">
            <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="absolute top-5 right-4 text-muted">
              <X size={20} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur sm:px-8">
        <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="rounded-lg p-1.5 text-muted hover:bg-sunken lg:hidden">
          <Menu size={22} />
        </button>
        <div className="flex-1" />
        <NetworkBadge />
        <ConnectButton />
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
        <WrongNetworkBanner />
        {needsWallet && !isConnected ? <Welcome /> : children}
      </main>
    </div>
  );
}
