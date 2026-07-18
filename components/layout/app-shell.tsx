"use client";

import { useEffect, useState, useRef, useMemo, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3, CreditCard, LayoutDashboard, Plus, Search, Settings, Scale,
  Circle, LogOut, ChevronDown, BookOpen, User, Command, ArrowRight, X
} from "lucide-react";
import { Brand } from "./brand";
import { LegalFooter } from "./legal-footer";
import { ProductTour } from "./product-tour";
import { useAuth } from "./auth-provider";
import { createClient } from "@/lib/supabase/client";
import { motion, getStaggerDelay, revealUpClass } from "@/lib/motion";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Validation pipeline and next actions", keywords: "home overview reports" },
  { href: "/research/new", label: "Validate idea", icon: Plus, description: "Start a market-backed validation", keywords: "new research scan" },
  { href: "/compare", label: "Compare ideas", icon: Scale, description: "Compare completed reports side by side", keywords: "matrix score" },
  { href: "/dashboard/scoring", label: "Scoring model", icon: BarChart3, plan: "PRO", description: "Inspect criteria and decision weights", keywords: "weights criteria" },
  { href: "/pricing", label: "Pricing", icon: CreditCard, description: "Plans and validation depth", keywords: "billing plan" },
  { href: "/settings", label: "Settings", icon: Settings, description: "Profile and workspace preferences", keywords: "account profile" },
];

function isActiveNavigation(href: string, pathname: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || (pathname.startsWith("/research/") && pathname !== "/research/new");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

import { Suspense } from "react";

function TourAutoStarter({ onStartTour, tourCompleted }: { onStartTour: () => void; tourCompleted?: boolean }) {
  const searchParams = useSearchParams();
  
  useEffect(() => {
    if (searchParams.get("tour") === "start" && !tourCompleted) {
      onStartTour();
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete("tour");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams, tourCompleted, onStartTour]);

  return null;
}

export function AppShell({ children, title, action }: { children: React.ReactNode; title: string; action?: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [quickNavOpen, setQuickNavOpen] = useState(false);
  const [quickNavQuery, setQuickNavQuery] = useState("");
  const [quickNavIndex, setQuickNavIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const quickNavInputRef = useRef<HTMLInputElement>(null);
  const activeLinkIndex = links.findIndex(({ href }) => isActiveNavigation(href, pathname));
  const filteredLinks = useMemo(() => {
    const query = quickNavQuery.trim().toLowerCase();
    return query ? links.filter(item => `${item.label} ${item.description} ${item.keywords}`.toLowerCase().includes(query)) : links;
  }, [quickNavQuery]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setQuickNavOpen(open => !open);
      }
      if (event.key === "Escape") {
        setQuickNavOpen(false);
        setMenuOpen(false);
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!quickNavOpen) return;
    setQuickNavQuery("");
    setQuickNavIndex(0);
    requestAnimationFrame(() => quickNavInputRef.current?.focus());
  }, [quickNavOpen]);

  useEffect(() => setQuickNavIndex(0), [quickNavQuery]);

  const openQuickNavResult = (href: string) => {
    setQuickNavOpen(false);
    router.push(href);
  };

  const handleQuickNavKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!filteredLinks.length) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setQuickNavIndex(index => (index + 1) % filteredLinks.length); }
    if (event.key === "ArrowUp") { event.preventDefault(); setQuickNavIndex(index => (index - 1 + filteredLinks.length) % filteredLinks.length); }
    if (event.key === "Enter") { event.preventDefault(); openQuickNavResult(filteredLinks[quickNavIndex]?.href ?? filteredLinks[0].href); }
  };

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Could not sign out:", e);
    } finally {
      window.location.href = "/";
    }
  };

  const displayName = profile?.display_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const avatarUrl = user?.user_metadata?.avatar_url;

  return (
    <div className="app-shell">
      <aside id="app-sidebar" className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
        <Brand href="/dashboard" />
        <div className="workspace">
          <span className="workspace-mark" aria-hidden="true"><Image src="/brand/shouldbuild-mark.svg" alt="" width={28} height={28}/></span>
          <div><b>Your ideas</b><small>Validate before you build</small></div>
        </div>
        <p className="sidebar-label">NAVIGATION</p>
        <nav className="instrument-nav" aria-label="Main navigation" style={{ "--active-index": activeLinkIndex } as CSSProperties}>
          {activeLinkIndex >= 0 && <span className="nav-active-indicator" aria-hidden="true" />}
          {links.map(({ href, label, icon: Icon, plan, description }, index) => (
            <Link
              href={href}
              key={href}
              className={`${isActiveNavigation(href, pathname) ? "nav-link active" : "nav-link"} ${motion.transitionBase} ${motion.pressTight} ${revealUpClass}`}
              style={getStaggerDelay(index, 150, 25)}
              onClick={() => setMobileNavOpen(false)}
              data-tour={`nav-${href.split("/").filter(Boolean).join("-")}`}
              data-preview={description}
            >
              <Icon size={16} /><span>{label}</span>{plan && <small className="nav-plan-badge">{plan}</small>}
            </Link>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="side-note">
            <Circle size={10} fill="currentColor" />
            {user
              ? <span><b>Workspace active</b><small>Credits are verified when a report starts</small></span>
              : <span><b>Explore ShouldBuild</b><small>Sign in to start validating</small></span>}
          </div>
          <p className="sidebar-footnote">SHOULDBUILD · VALIDATE FIRST</p>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-header">
          <div className="app-header-left">
            <button
              className={`mobile-menu-toggle ${motion.transitionBase} ${motion.pressTight}`}
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              aria-label="Toggle navigation"
              aria-expanded={mobileNavOpen}
              aria-controls="app-sidebar"
            >
              <span />
              <span />
              <span />
            </button>
            <div>
              <p className="eyebrow">{title}</p>
              <h1>{title}</h1>
            </div>
          </div>
          <div className="header-actions">
            <button className={`quick-nav-trigger ${motion.buttonTight}`} onClick={() => setQuickNavOpen(true)} aria-label="Open quick navigation">
              <Search size={14}/><span>Quick nav</span><kbd>{mounted && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"} K</kbd>
            </button>
            {action}
            {!loading && !user ? (
              <Link className="button button-small ghost" href={`/sign-in?redirectTo=${encodeURIComponent(pathname)}`}>Sign in</Link>
            ) : <div className="user-menu-wrap" ref={menuRef}>
              <button
                type="button"
                className={`user-menu-trigger ${motion.transitionBase} ${motion.pressTight}`}
                onClick={() => setMenuOpen(!menuOpen)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label={`Open profile menu for ${displayName}`}
              >
                {mounted ? (
                  <>
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="user-avatar"
                      />
                    ) : (
                      <span className="user-avatar-fallback">
                        {displayName[0].toUpperCase()}
                      </span>
                    )}
                    <span className="user-menu-name">{displayName}</span>
                  </>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-border animate-pulse mr-2" />
                )}
                <ChevronDown size={14} className={`user-menu-chevron ${menuOpen ? "open" : ""}`} />
              </button>

              {menuOpen && mounted && (
                <div className="user-dropdown" role="menu" aria-label="Profile menu">
                  <div className="user-dropdown-header">
                    <b>{displayName}</b>
                    <small>{user?.email}</small>
                  </div>
                  <hr />
                  <Link href="/settings" role="menuitem" className={`user-dropdown-item ${motion.transitionBase} ${motion.pressTight}`} onClick={() => setMenuOpen(false)}>
                    <User size={14} /> Profile & Settings
                  </Link>
                  <button type="button" role="menuitem" className={`user-dropdown-item ${motion.transitionBase} ${motion.pressTight}`} onClick={() => { setMenuOpen(false); setTourOpen(true); }}>
                    <BookOpen size={14} /> Take Product Tour
                  </button>
                  <hr />
                  <button type="button" role="menuitem" className={`user-dropdown-item danger ${motion.transitionBase} ${motion.pressTight}`} onClick={handleSignOut}>
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              )}
            </div>}
          </div>
        </header>
        <div key={pathname} className="sf-content-enter app-page-canvas" data-tour="page-canvas">{children}</div>
        <LegalFooter compact />
      </main>

      {/* Mobile nav overlay */}
      {mobileNavOpen && (
        <div className="mobile-nav-overlay" onClick={() => setMobileNavOpen(false)} />
      )}

      {quickNavOpen && <div className="quick-nav-backdrop" onMouseDown={() => setQuickNavOpen(false)}>
        <section className="quick-nav-panel sf-content-enter" role="dialog" aria-modal="true" aria-label="Quick navigation" onMouseDown={event => event.stopPropagation()}>
          <header className="quick-nav-search">
            <Search size={17}/>
            <input ref={quickNavInputRef} value={quickNavQuery} onChange={event => setQuickNavQuery(event.target.value)} onKeyDown={handleQuickNavKeyDown} placeholder="Go to a page…" aria-label="Search pages" aria-controls="quick-nav-results"/>
            <button onClick={() => setQuickNavOpen(false)} aria-label="Close quick navigation"><X size={14}/></button>
          </header>
          <div id="quick-nav-results" className="quick-nav-results" role="listbox">
            <p>Navigate</p>
            {filteredLinks.map(({ href, label, icon: Icon, description, plan }, index) => <button key={href} role="option" aria-selected={index === quickNavIndex} className={index === quickNavIndex ? "selected" : ""} onMouseEnter={() => setQuickNavIndex(index)} onClick={() => openQuickNavResult(href)}>
              <span><Icon size={16}/></span><div><b>{label}</b><small>{description}</small></div>{plan && <i>{plan}</i>}<ArrowRight size={14}/>
            </button>)}
            {!filteredLinks.length && <div className="quick-nav-empty"><Command size={18}/><b>No matching page</b><small>Try “report”, “pricing”, or “settings”.</small></div>}
          </div>
          <footer><span><kbd>↑</kbd><kbd>↓</kbd> select</span><span><kbd>↵</kbd> open</span><span><kbd>Esc</kbd> close</span></footer>
        </section>
      </div>}

      {user && <Suspense fallback={null}>
        <TourAutoStarter
          onStartTour={() => setTourOpen(true)}
          tourCompleted={profile?.tour_completed}
        />
      </Suspense>}

      <ProductTour
        isOpen={Boolean(user && tourOpen)}
        onClose={() => setTourOpen(false)}
        onComplete={() => setTourOpen(false)}
      />
    </div>
  );
}
