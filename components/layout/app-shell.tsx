"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CreditCard, LayoutDashboard, Plus, Search, Settings, Scale, Sparkles } from "lucide-react";
import { Brand } from "./brand";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/scoring", label: "Scoring engine", icon: BarChart3 },
  { href: "/research/new", label: "New research", icon: Plus },
  { href: "/compare", label: "Compare", icon: Scale },
  { href: "/pricing", label: "Pricing", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children, title, action }: { children: React.ReactNode; title: string; action?: React.ReactNode }) {
  const pathname = usePathname();
  return <div className="app-shell"><aside className="sidebar"><Brand/><div className="workspace"><span className="workspace-mark">SF</span><div><b>Builder workspace</b><small>Personal plan</small></div></div><nav>{links.map(({ href, label, icon: Icon }) => <Link href={href} key={href} className={pathname === href ? "nav-link active" : "nav-link"}><Icon size={17}/>{label}</Link>)}</nav><div className="side-bottom"><div className="side-note"><Sparkles size={15}/><span><b>Research credits</b><small>4 of 5 available</small></span></div><Link className={pathname === "/settings" ? "nav-link active" : "nav-link"} href="/settings"><Settings size={17}/>Workspace settings</Link></div></aside><main className="app-main"><header className="app-header"><div><p className="eyebrow">SignalFit / {title}</p><h1>{title}</h1></div><div className="header-actions"><button className="icon-button" aria-label="Search"><Search size={17}/></button>{action}</div></header>{children}</main></div>;
}
