import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAccount } from "wagmi";
import { Activity, Blocks, HelpCircle, LayoutGrid, Menu, Vault, X, type LucideIcon } from "lucide-react";
import { MODULES } from "../../modules";
import { ConnectButton } from "./ConnectButton";
import { ChainStatusBanner, NetworkBadge, WrongNetworkBanner } from "./NetworkBadge";
import { Welcome } from "./Welcome";
import { cx } from "./ui";

type NavItem = { path: string; label: string; icon: LucideIcon; color?: string };

const MODULE_COLOR: Record<string, string> = {
  perps: "var(--color-perps)",
  lending: "var(--color-lending)",
  "market-maker": "var(--color-marketmaker)",
};

const CORE_TOP: NavItem[] = [
  { path: "/", label: "Portfolio", icon: LayoutGrid },
  { path: "/vault", label: "Shared Vault", icon: Vault },
];
const CORE_BOTTOM: NavItem[] = [
  { path: "/activity", label: "Activity", icon: Activity },
  { path: "/explorer", label: "Explorer", icon: Blocks },
  { path: "/help", label: "Help & Setup", icon: HelpCircle },
];

function NavGroup({ title, items, numbered }: { title?: string; items: NavItem[]; numbered?: boolean }) {
  return (
    <div>
      {title && <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-subtle uppercase">{title}</p>}
      <ul className="space-y-0.5">
        {items.map(({ path, label, icon: Icon, color }, i) => (
          <li key={path}>
            <NavLink
              to={path}
              end={path === "/"}
              className={({ isActive }) =>
                cx(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-200",
                  isActive ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface/70 hover:text-ink",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden
                    className={cx(
                      "absolute top-3 bottom-3 left-0 w-[3px] rounded-r-full transition-transform duration-300 ease-[var(--ease-out)]",
                      isActive ? "scale-y-100" : "scale-y-0",
                    )}
                    style={{ background: color ?? "var(--color-ink)" }}
                  />
                  <Icon
                    size={18}
                    strokeWidth={1.8}
                    className="transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-x-0.5"
                    style={isActive && color ? { color } : undefined}
                  />
                  <span className="flex-1">{label}</span>
                  {numbered && <span className="font-mono text-[10px] text-subtle">{String(i + 1).padStart(2, "0")}</span>}
                </>
              )}
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
        <img src="/logo.svg" alt="" className="h-8 w-8 transition-transform duration-500 ease-[var(--ease-out)] hover:rotate-[-8deg]" />
        <div className="leading-tight">
          <p className="display text-[19px] leading-none font-medium">Modular DeFi</p>
          <p className="mt-1 text-[11px] text-subtle">One Core. Multiple Products.</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-6" aria-label="Main">
        <NavGroup items={CORE_TOP} />
        <NavGroup title="Modules" numbered items={MODULES.map((m) => ({ path: m.path, label: m.name, icon: m.icon, color: MODULE_COLOR[m.id] }))} />
        <NavGroup items={CORE_BOTTOM} />
      </nav>
      <div className="rounded-xl border border-dashed border-line-strong bg-surface/40 px-3 py-2.5 text-[11px] leading-relaxed text-muted">
        <span className="mb-1 inline-block rounded border border-warning/30 px-1.5 font-mono text-[9px] tracking-widest text-warning uppercase">Prototype</span>
        <br />
        Test tokens on a local chain. Not audited.
      </div>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { isConnected } = useAccount();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => setMobileOpen(false), [location.pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Stagger the entrance of cards on a new page, top to bottom in reading order.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0 });
    mainRef.current?.querySelectorAll<HTMLElement>(".anim-rise").forEach((el, i) => {
      el.style.setProperty("--delay", `${Math.min(i * 45, 450)}ms`);
    });
  }, [location.pathname, isConnected]);

  // Help and Explorer are useful without a wallet; everything else needs one.
  const needsWallet = !["/help", "/explorer"].includes(location.pathname);
  const module = MODULES.find((m) => location.pathname.startsWith(m.path));

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-frame bg-canvas/80 backdrop-blur lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade bg-ink/30 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 animate-[drawer_0.3s_var(--ease-out)_both] bg-canvas shadow-[var(--shadow-float)]">
            <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="absolute top-5 right-4 rounded-lg p-1 text-muted transition-colors hover:bg-sunken hover:text-ink">
              <X size={20} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      <header
        className={cx(
          "sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b bg-canvas/85 px-4 backdrop-blur transition-[box-shadow,border-color] duration-300 sm:px-8",
          scrolled ? "border-frame shadow-[0_8px_24px_-16px_rgb(14_23_38/0.25)]" : "border-frame",
        )}
      >
        <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="rounded-lg p-1.5 text-muted transition-colors hover:bg-sunken hover:text-ink lg:hidden">
          <Menu size={22} />
        </button>
        <div className="flex-1" />
        <NetworkBadge />
        <ConnectButton />
      </header>

      <main ref={mainRef} data-module={module?.id} className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
        <ChainStatusBanner />
        <WrongNetworkBanner />
        <div key={location.pathname} className="animate-fade">
          {needsWallet && !isConnected ? <Welcome /> : children}
        </div>
      </main>
    </div>
  );
}
