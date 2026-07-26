-- Evidence graph and aggregation internals are exposed only through sanitized,
-- tenant-scoped report and progress snapshots.
revoke all on
  public.evidence_graph_nodes,
  public.evidence_graph_edges,
  public.evidence_clusters,
  public.evidence_confidence_results
from anon, authenticated;

grant select, insert, update, delete on
  public.evidence_graph_nodes,
  public.evidence_graph_edges,
  public.evidence_clusters,
  public.evidence_confidence_results
to service_role;

notify pgrst, 'reload schema';
