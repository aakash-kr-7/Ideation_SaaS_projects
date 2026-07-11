import { LucideIcon } from "lucide-react";
export function StatCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: LucideIcon }) { return <article className="stat-card"><div className="stat-icon"><Icon size={18}/></div><span>{label}</span><b>{value}</b><small>{detail}</small></article>; }
