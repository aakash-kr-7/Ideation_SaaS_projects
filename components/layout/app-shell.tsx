"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3, CreditCard, LayoutDashboard, Plus, Search, Settings, Scale,
  Circle, LogOut, ChevronDown, BookOpen, User
} from "lucide-react";
import { Brand } from "./brand";
import { ProductTour } from "./product-tour";
import { useAuth } from "./auth-provider";
import { createClient } from "@/lib/supabase/client";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/research/new", label: "Validate idea", icon: Plus },
  { href: "/compare", label: "Compare ideas", icon: Scale },
  { href: "/dashboard/scoring", label: "Scoring model", icon: BarChart3 },
  { href: "/pricing", label: "Pricing", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

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
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Could not sign out:", error.message);
      return;
    }
    window.location.assign("/");
  };

  const displayName = profile?.display_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const avatarUrl = user?.user_metadata?.avatar_url;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
        <Brand />
        <div className="workspace">
          <span className="workspace-mark">SF</span>
          <div><b>Your ideas</b><small>Validate before you build</small></div>
        </div>
        <p className="sidebar-label">NAVIGATION</p>
        <nav>
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              href={href}
              key={href}
              className={pathname === href ? "nav-link active" : "nav-link"}
              onClick={() => setMobileNavOpen(false)}
            >
              <Icon size={16} />{label}
            </Link>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="side-note">
            <Circle size={10} fill="currentColor" />
            <span><b>Free plan</b><small>1 scan remaining this month</small></span>
          </div>
          <p className="sidebar-footnote">SIGNALFIT · VALIDATE FIRST</p>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-header">
          <div className="app-header-left">
            <button
              className="mobile-menu-toggle"
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              aria-label="Toggle navigation"
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
            {action}
            <div className="user-menu-wrap" ref={menuRef}>
              <button
                className="user-menu-trigger"
                onClick={() => setMenuOpen(!menuOpen)}
                aria-expanded={menuOpen}
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
                <div className="user-dropdown">
                  <div className="user-dropdown-header">
                    <b>{displayName}</b>
                    <small>{user?.email}</small>
                  </div>
                  <hr />
                  <Link href="/settings" className="user-dropdown-item" onClick={() => setMenuOpen(false)}>
                    <User size={14} /> Profile & Settings
                  </Link>
                  <button className="user-dropdown-item" onClick={() => { setMenuOpen(false); setTourOpen(true); }}>
                    <BookOpen size={14} /> Take Product Tour
                  </button>
                  <hr />
                  <button className="user-dropdown-item danger" onClick={handleSignOut}>
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        {children}
      </main>

      {/* Mobile nav overlay */}
      {mobileNavOpen && (
        <div className="mobile-nav-overlay" onClick={() => setMobileNavOpen(false)} />
      )}

      <Suspense fallback={null}>
        <TourAutoStarter
          onStartTour={() => setTourOpen(true)}
          tourCompleted={profile?.tour_completed}
        />
      </Suspense>

      <ProductTour
        isOpen={tourOpen}
        onClose={() => setTourOpen(false)}
        onComplete={() => setTourOpen(false)}
      />
    </div>
  );
}
