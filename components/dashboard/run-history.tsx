"use client";

import Link from "next/link";
import { CheckCircle2, CircleDashed, XCircle, Search, Target, ChevronRight } from "lucide-react";
import { ScoreBadge } from "@/components/scoring/score-badge";

type RunSummary = {
  id: string;
  name: string;
  mode: string;
  status: string;
  createdAt: string;
  score?: number;
  verdict?: string;
};

export function RunHistory({ runs }: { runs: RunSummary[] }) {
  if (runs.length === 0) {
    return (
      <div className="dashboard-empty-state">
        <p>No research runs found.</p>
        <Link href="/research/new" className="button">Start a new validation</Link>
      </div>
    );
  }

  return (
    <div className="run-history-list">
      {runs.map((run) => (
        <Link 
          key={run.id} 
          href={run.status === "Completed" ? `/research/${run.id}/results` : `/research/${run.id}/progress`}
          className="run-history-card premium-report"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.5rem', marginBottom: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {run.mode === "quick_scan" ? <Search size={14} color="var(--text-tertiary)" /> : <Target size={14} color="var(--text-tertiary)" />}
              <span className="eyebrow" style={{ margin: 0 }}>{run.mode === "quick_scan" ? "Quick Scan" : "Full Validation"}</span>
              <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>• {new Date(run.createdAt).toLocaleDateString()}</span>
            </div>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{run.name}</h3>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
              {run.status === "Completed" ? <CheckCircle2 size={12} color="var(--success)" /> : 
               (run.status === "Failed" || run.status === "Cancelled") ? <XCircle size={12} color="var(--warning)" /> : 
               <CircleDashed size={12} color="var(--primary)" />}
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{run.status}</span>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            {run.status === "Completed" && run.score !== undefined && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'right' }}>
                <div>
                  <b style={{ display: 'block', fontSize: '1.2rem' }}>{run.score}/100</b>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{run.verdict}</span>
                </div>
                <ScoreBadge score={run.score} size="md" />
              </div>
            )}
            <ChevronRight size={18} color="var(--text-tertiary)" />
          </div>
        </Link>
      ))}
    </div>
  );
}
