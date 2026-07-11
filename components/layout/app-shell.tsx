"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CreditCard, LayoutDashboard, Plus, Search, Settings, Scale, Sparkles, Circle } from "lucide-react";
import { Brand } from "./brand";

const links = [
  { href: "/dashboard", label: "Research index", icon: LayoutDashboard },
  { href: "/research/new", label: "Start a brief", icon: Plus },
  { href: "/compare", label: "Compare bets", icon: Scale },
  { href: "/dashboard/scoring", label: "Decision model", icon: BarChart3 },
  { href: "/pricing", label: "Membership", icon: CreditCard },
  { href: "/settings", label: "Desk settings", icon: Settings },
];

export function AppShell({ children, title, action }: { children: React.ReactNode; title: string; action?: React.ReactNode }) {
  const pathname = usePathname();
  return <div className="app-shell"><aside className="sidebar"><Brand/><div className="workspace"><span className="workspace-mark">01</span><div><b>Private desk</b><small>Founder workspace</small></div></div><p className="sidebar-label">WORKING FILES</p><nav>{links.map(({ href, label, icon: Icon }) => <Link href={href} key={href} className={pathname === href ? "nav-link active" : "nav-link"}><Icon size={16}/>{label}</Link>)}</nav><div className="side-bottom"><div className="side-note"><Circle size={10} fill="currentColor"/><span><b>Research capacity</b><small>4 briefs available this month</small></span></div><p className="sidebar-footnote">SIGNALFIT / EST. 2026</p></div></aside><main className="app-main"><header className="app-header"><div><p className="eyebrow">Founder intelligence desk / {title}</p><h1>{title}</h1></div><div className="header-actions"><button className="icon-button" aria-label="Search"><Search size={17}/></button>{action}</div></header>{children}</main></div>;
}
