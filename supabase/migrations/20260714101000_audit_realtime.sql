-- Add evidence_items and opportunity_scores to supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE evidence_items;
ALTER PUBLICATION supabase_realtime ADD TABLE opportunity_scores;
