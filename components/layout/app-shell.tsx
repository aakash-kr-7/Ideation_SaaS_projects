"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CreditCard, LayoutDashboard, Plus, Search, Settings, Scale, Circle } from "lucide-react";
import { Brand } from "./brand";

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
  return <div className="app-shell"><aside className="sidebar"><Brand/><div className="workspace"><span className="workspace-mark">SF</span><div><b>Your ideas</b><small>Validate before you build</small></div></div><p className="sidebar-label">NAVIGATION</p><nav>{links.map(({ href, label, icon: Icon }) => <Link href={href} key={href} className={pathname === href ? "nav-link active" : "nav-link"}><Icon size={16}/>{label}</Link>)}</nav><div className="side-bottom"><div className="side-note"><Circle size={10} fill="currentColor"/><span><b>Free plan</b><small>1 scan remaining this month</small></span></div><p className="sidebar-footnote">SIGNALFIT · VALIDATE FIRST</p></div></aside><main className="app-main"><header className="app-header"><div><p className="eyebrow">{title}</p><h1>{title}</h1></div><div className="header-actions"><button className="icon-button" aria-label="Search"><Search size={17}/></button>{action}</div></header>{children}</main></div>;
}
