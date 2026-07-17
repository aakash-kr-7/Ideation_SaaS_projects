import { LucideIcon } from "lucide-react";
import { motion } from "@/lib/motion";
import { AnimatedNumber } from "@/components/ui/animated-number";

export function StatCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: LucideIcon }) {
  const numericValue = Number(value);
  return <article tabIndex={0} className={`stat-card ${motion.cardInteractive}`}>
    <div className="stat-icon"><Icon size={18}/></div>
    <span>{label}</span>
    <b>{Number.isFinite(numericValue) ? <AnimatedNumber value={numericValue} pad={value.length > 1 && value.startsWith("0") ? value.length : 0}/> : value}</b>
    <small>{detail}<span className="stat-hover-detail">Live workspace metric</span></small>
  </article>;
}
