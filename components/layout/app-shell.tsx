"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, CreditCard, LayoutDashboard, Plus, Search, Settings, Scale, Circle, LogOut } from "lucide-react";
import { Brand } from "./brand";
import { createClient } from "@/lib/supabase/client";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/research/new", label: "Validate idea", icon: Plus },
  { href: "/compare", label: "Compare ideas", icon: Scale },
  { href: "/dashboard/scoring", label: "Scoring model", icon: BarChart3 },
  { href: "/pricing", label: "Pricing", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children, title, action }: { children: React.ReactNode; title: string; action?: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  return <div className="app-shell"><aside className="sidebar"><Brand/><div className="workspace"><span className="workspace-mark">SF</span><div><b>Your ideas</b><small>Validate before you build</small></div></div><p className="sidebar-label">NAVIGATION</p><nav>{links.map(({ href, label, icon: Icon }) => <Link href={href} key={href} className={pathname === href ? "nav-link active" : "nav-link"}><Icon size={16}/>{label}</Link>)}</nav><div className="side-bottom">
    {loading ? (
      <div style={{ padding: "10px", fontSize: "11px", color: "var(--text-tertiary)" }}>
        Loading profile...
      </div>
    ) : user ? (
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "12px 10px",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        background: "var(--bg-elevated)",
        marginBottom: "14px"
      }}>
        {user.user_metadata?.avatar_url ? (
          <img 
            src={user.user_metadata.avatar_url} 
            alt="User Avatar" 
            referrerPolicy="no-referrer"
            style={{ width: "30px", height: "30px", borderRadius: "50%", border: "1px solid var(--border-strong)" }}
          />
        ) : (
          <div style={{
            width: "30px",
            height: "30px",
            borderRadius: "50%",
            background: "var(--accent)",
            color: "#fff",
            display: "grid",
            placeItems: "center",
            fontWeight: "bold",
            fontSize: "12px"
          }}>
            {(user.email?.[0] || "U").toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ display: "block", fontSize: "12px", color: "var(--text-primary)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
            {user.user_metadata?.full_name || user.email?.split("@")[0] || "User"}
          </b>
          <small style={{ display: "block", fontSize: "10px", color: "var(--text-tertiary)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
            {user.email}
          </small>
        </div>
        <button 
          onClick={handleSignOut} 
          aria-label="Sign out"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-tertiary)",
            cursor: "pointer",
            padding: "4px",
            display: "flex",
            alignItems: "center",
            transition: "color 0.15s"
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = "var(--verdict-avoid)"}
          onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-tertiary)"}
        >
          <LogOut size={15} />
        </button>
      </div>
    ) : null}
    <div className="side-note"><Circle size={10} fill="currentColor"/><span><b>Free plan</b><small>1 scan remaining this month</small></span></div><p className="sidebar-footnote">SIGNALFIT · VALIDATE FIRST</p></div></aside><main className="app-main"><header className="app-header"><div><p className="eyebrow">{title}</p><h1>{title}</h1></div><div className="header-actions"><button className="icon-button" aria-label="Search"><Search size={17}/></button>{action}</div></header>{children}</main></div>;
}
