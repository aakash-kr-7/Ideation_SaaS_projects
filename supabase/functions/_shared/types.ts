// Shared, runtime-neutral database and report domain types.
import type { ResearchStatus } from "./research/status.ts";
import type { ReportMode } from "./research/mode-config.ts";
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      adversarial_verdict_gates: {
        Row: {
          created_at: string
          emerging_verdict: string
          evidence_ids: string[]
          id: string
          objection: string
          outcome: string
          payload: Json
          run_id: string
          severity: string
          status: string
          unresolved: boolean
        }
        Insert: {
          created_at?: string
          emerging_verdict: string
          evidence_ids?: string[]
          id?: string
          objection: string
          outcome: string
          payload: Json
          run_id: string
          severity: string
          status: string
          unresolved?: boolean
        }
        Update: {
          created_at?: string
          emerging_verdict?: string
          evidence_ids?: string[]
          id?: string
          objection?: string
          outcome?: string
          payload?: Json
          run_id?: string
          severity?: string
          status?: string
          unresolved?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "adversarial_verdict_gates_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          created_at: string
          event_data: Json
          event_name: string
          id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_data?: Json
          event_name: string
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_data?: Json
          event_name?: string
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      api_usage_logs: {
        Row: {
          cache_status: string
          completion_tokens: number | null
          cost: number | null
          created_at: string
          duration_ms: number
          end_time: string | null
          error_class: string | null
          error_message: string | null
          estimated_cost_usd: number
          external_search: boolean
          fallback_state: string | null
          grounded_search_requested: boolean
          grounded_search_usage: number | null
          grounding_degraded: boolean
          grounding_metadata_present: boolean
          id: string
          interaction_id: string | null
          model: string | null
          operation: string
          page_fetch: boolean
          pipeline_stage: string | null
          pricing_version: string | null
          prompt_tokens: number | null
          provider: string
          quota_limit: number | null
          quota_metric: string | null
          retry_count: number | null
          retry_delay_ms: number | null
          run_id: string
          start_time: string | null
          status: string
          task_type: string | null
        }
        Insert: {
          cache_status?: string
          completion_tokens?: number | null
          cost?: number | null
          created_at?: string
          duration_ms?: number
          end_time?: string | null
          error_class?: string | null
          error_message?: string | null
          estimated_cost_usd?: number
          external_search?: boolean
          fallback_state?: string | null
          grounded_search_requested?: boolean
          grounded_search_usage?: number | null
          grounding_degraded?: boolean
          grounding_metadata_present?: boolean
          id?: string
          interaction_id?: string | null
          model?: string | null
          operation: string
          page_fetch?: boolean
          pipeline_stage?: string | null
          pricing_version?: string | null
          prompt_tokens?: number | null
          provider: string
          quota_limit?: number | null
          quota_metric?: string | null
          retry_count?: number | null
          retry_delay_ms?: number | null
          run_id: string
          start_time?: string | null
          status: string
          task_type?: string | null
        }
        Update: {
          cache_status?: string
          completion_tokens?: number | null
          cost?: number | null
          created_at?: string
          duration_ms?: number
          end_time?: string | null
          error_class?: string | null
          error_message?: string | null
          estimated_cost_usd?: number
          external_search?: boolean
          fallback_state?: string | null
          grounded_search_requested?: boolean
          grounded_search_usage?: number | null
          grounding_degraded?: boolean
          grounding_metadata_present?: boolean
          id?: string
          interaction_id?: string | null
          model?: string | null
          operation?: string
          page_fetch?: boolean
          pipeline_stage?: string | null
          pricing_version?: string | null
          prompt_tokens?: number | null
          provider?: string
          quota_limit?: number | null
          quota_metric?: string | null
          retry_count?: number | null
          retry_delay_ms?: number | null
          run_id?: string
          start_time?: string | null
          status?: string
          task_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          team_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_customers: {
        Row: {
          created_at: string
          id: string
          stripe_customer_id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          stripe_customer_id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          stripe_customer_id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_customers_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_subscriptions: {
        Row: {
          created_at: string
          current_period_end: string
          id: string
          plan_id: string
          status: string
          stripe_subscription_id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end: string
          id?: string
          plan_id: string
          status: string
          stripe_subscription_id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string
          id?: string
          plan_id?: string
          status?: string
          stripe_subscription_id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_subscriptions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      citation_integrity_validations: {
        Row: {
          claims_checked: number
          claims_removed: number
          created_at: string
          id: string
          invalid_claims: Json
          payload: Json
          run_id: string
          valid: boolean
        }
        Insert: {
          claims_checked: number
          claims_removed: number
          created_at?: string
          id?: string
          invalid_claims?: Json
          payload: Json
          run_id: string
          valid: boolean
        }
        Update: {
          claims_checked?: number
          claims_removed?: number
          created_at?: string
          id?: string
          invalid_claims?: Json
          payload?: Json
          run_id?: string
          valid?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "citation_integrity_validations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      competitors: {
        Row: {
          candidate_type: string | null
          canonical_homepage: string | null
          category_id: string | null
          category_rationale: string | null
          classification: string
          comparability: Json
          created_at: string
          evidence_ids: string[]
          gap: string
          id: string
          name: string
          opportunity_id: string
          positioning: string
          pricing: string
          seed_last_reviewed_at: string | null
          strength: string
          target: string
          updated_at: string
          verification_status: string
          verified_at: string | null
        }
        Insert: {
          candidate_type?: string | null
          canonical_homepage?: string | null
          category_id?: string | null
          category_rationale?: string | null
          classification?: string
          comparability?: Json
          created_at?: string
          evidence_ids?: string[]
          gap: string
          id?: string
          name: string
          opportunity_id: string
          positioning: string
          pricing: string
          seed_last_reviewed_at?: string | null
          strength: string
          target: string
          updated_at?: string
          verification_status: string
          verified_at?: string | null
        }
        Update: {
          candidate_type?: string | null
          canonical_homepage?: string | null
          category_id?: string | null
          category_rationale?: string | null
          classification?: string
          comparability?: Json
          created_at?: string
          evidence_ids?: string[]
          gap?: string
          id?: string
          name?: string
          opportunity_id?: string
          positioning?: string
          pricing?: string
          seed_last_reviewed_at?: string | null
          strength?: string
          target?: string
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitors_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          created_at: string
          event_type: string
          external_reference: string | null
          free_credit_delta: number
          id: string
          metadata: Json
          paid_credit_delta: number
          reservation_id: string | null
          run_id: string | null
          team_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          external_reference?: string | null
          free_credit_delta?: number
          id?: string
          metadata?: Json
          paid_credit_delta?: number
          reservation_id?: string | null
          run_id?: string | null
          team_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          external_reference?: string | null
          free_credit_delta?: number
          id?: string
          metadata?: Json
          paid_credit_delta?: number
          reservation_id?: string | null
          run_id?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "credit_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_reservations: {
        Row: {
          created_at: string
          credit_cost: number
          credit_source: string
          finalized_at: string | null
          id: string
          idempotency_key: string
          report_mode: Database["public"]["Enums"]["report_mode"]
          reserved_at: string
          run_id: string
          status: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_cost: number
          credit_source: string
          finalized_at?: string | null
          id?: string
          idempotency_key: string
          report_mode: Database["public"]["Enums"]["report_mode"]
          reserved_at?: string
          run_id: string
          status?: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_cost?: number
          credit_source?: string
          finalized_at?: string | null
          id?: string
          idempotency_key?: string
          report_mode?: Database["public"]["Enums"]["report_mode"]
          reserved_at?: string
          run_id?: string
          status?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_reservations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_reservations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      edge_rate_limit_windows: {
        Row: {
          expires_at: string
          request_count: number
          scope_hash: string
          window_started_at: string
        }
        Insert: {
          expires_at: string
          request_count?: number
          scope_hash: string
          window_started_at: string
        }
        Update: {
          expires_at?: string
          request_count?: number
          scope_hash?: string
          window_started_at?: string
        }
        Relationships: []
      }
      error_logs: {
        Row: {
          context: string
          created_at: string
          error_message: string
          id: string
          run_id: string | null
          stack_trace: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          context: string
          created_at?: string
          error_message: string
          id?: string
          run_id?: string | null
          stack_trace?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          context?: string
          created_at?: string
          error_message?: string
          id?: string
          run_id?: string | null
          stack_trace?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "error_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_clusters: {
        Row: {
          cluster_key: string
          cluster_type: string
          confidence: number
          contradicting_evidence_ids: string[]
          created_at: string
          date_range: Json
          id: string
          independent_domain_count: number
          independent_source_count: number
          representative_claim: string
          run_id: string
          supporting_evidence_ids: string[]
          tier_distribution: Json
          unresolved_disagreement: boolean
        }
        Insert: {
          cluster_key: string
          cluster_type: string
          confidence?: number
          contradicting_evidence_ids?: string[]
          created_at?: string
          date_range?: Json
          id?: string
          independent_domain_count?: number
          independent_source_count?: number
          representative_claim: string
          run_id: string
          supporting_evidence_ids?: string[]
          tier_distribution?: Json
          unresolved_disagreement?: boolean
        }
        Update: {
          cluster_key?: string
          cluster_type?: string
          confidence?: number
          contradicting_evidence_ids?: string[]
          created_at?: string
          date_range?: Json
          id?: string
          independent_domain_count?: number
          independent_source_count?: number
          representative_claim?: string
          run_id?: string
          supporting_evidence_ids?: string[]
          tier_distribution?: Json
          unresolved_disagreement?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "evidence_clusters_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_confidence_results: {
        Row: {
          band: string
          completeness_reasons: Json
          created_at: string
          deductions: Json
          reasons: Json
          report_completeness: number | null
          run_id: string
          score: number
          scoring_confidence: number | null
          updated_at: string
        }
        Insert: {
          band: string
          completeness_reasons?: Json
          created_at?: string
          deductions?: Json
          reasons?: Json
          report_completeness?: number | null
          run_id: string
          score: number
          scoring_confidence?: number | null
          updated_at?: string
        }
        Update: {
          band?: string
          completeness_reasons?: Json
          created_at?: string
          deductions?: Json
          reasons?: Json
          report_completeness?: number | null
          run_id?: string
          score?: number
          scoring_confidence?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_confidence_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_contradictions: {
        Row: {
          challenging_evidence_ids: string[]
          contradiction_status: string | null
          created_at: string
          geography_applicability: string | null
          id: string
          opportunity_id: string
          proposition: string | null
          relationship: string
          resolution_note: string | null
          resolution_status: string
          run_id: string
          segment_applicability: string | null
          supporting_evidence_ids: string[]
          tested_claim: string
          unresolved_implication: string | null
        }
        Insert: {
          challenging_evidence_ids?: string[]
          contradiction_status?: string | null
          created_at?: string
          geography_applicability?: string | null
          id?: string
          opportunity_id: string
          proposition?: string | null
          relationship: string
          resolution_note?: string | null
          resolution_status: string
          run_id: string
          segment_applicability?: string | null
          supporting_evidence_ids?: string[]
          tested_claim: string
          unresolved_implication?: string | null
        }
        Update: {
          challenging_evidence_ids?: string[]
          contradiction_status?: string | null
          created_at?: string
          geography_applicability?: string | null
          id?: string
          opportunity_id?: string
          proposition?: string | null
          relationship?: string
          resolution_note?: string | null
          resolution_status?: string
          run_id?: string
          segment_applicability?: string | null
          supporting_evidence_ids?: string[]
          tested_claim?: string
          unresolved_implication?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_contradictions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_contradictions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_graph_edges: {
        Row: {
          created_at: string
          evidence_ids: string[]
          from_node_id: string
          id: string
          relation: string
          run_id: string
          to_node_id: string
        }
        Insert: {
          created_at?: string
          evidence_ids?: string[]
          from_node_id: string
          id?: string
          relation: string
          run_id: string
          to_node_id: string
        }
        Update: {
          created_at?: string
          evidence_ids?: string[]
          from_node_id?: string
          id?: string
          relation?: string
          run_id?: string
          to_node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_graph_edges_from_node_id_fkey"
            columns: ["from_node_id"]
            isOneToOne: false
            referencedRelation: "evidence_graph_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_graph_edges_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_graph_edges_to_node_id_fkey"
            columns: ["to_node_id"]
            isOneToOne: false
            referencedRelation: "evidence_graph_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_graph_nodes: {
        Row: {
          attributes: Json
          created_at: string
          id: string
          label: string
          node_key: string
          node_type: string
          run_id: string
        }
        Insert: {
          attributes?: Json
          created_at?: string
          id?: string
          label: string
          node_key: string
          node_type: string
          run_id: string
        }
        Update: {
          attributes?: Json
          created_at?: string
          id?: string
          label?: string
          node_key?: string
          node_type?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_graph_nodes_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_items: {
        Row: {
          acceptance_decision: string | null
          associated_claim_ids: string[]
          associated_factor_ids: string[]
          author: string | null
          canonical_domain: string | null
          canonical_source_id: string | null
          canonical_url: string
          claim_fingerprint: string | null
          claim_id: string | null
          cluster_key: string | null
          confidence: number
          contradicting_count: number
          created_at: string
          currency: string | null
          disconfirming: boolean
          evidence_directness: number | null
          evidence_family: string | null
          evidence_role: string | null
          evidence_topic: string | null
          excluded: boolean
          exclusion_reason: string | null
          extraction_confidence: number | null
          extraction_method: string
          gemini_relevance_score: number | null
          geography: string | null
          id: string
          independence_key: string | null
          independent_domain_count: number
          independent_source_count: number
          market_size_figure: string | null
          market_size_metric: string | null
          market_size_source_qualified: boolean
          matched_brief_dimensions: string[]
          mismatch_reasons: string[]
          model_classification_metadata: Json | null
          named_entities: string[]
          numeric_validation_state: string | null
          numeric_value: number | null
          opportunity_id: string | null
          pain_point: string | null
          publisher: string
          relevance_class: string | null
          relevance_score: number | null
          relevant_excerpt: string
          research_pass: number | null
          research_query_id: string | null
          retrieval_date: string
          run_id: string
          segment: string | null
          semantic_relevance: number | null
          signal_type: string
          snippet: string
          source_authority: number | null
          source_class: string
          source_domain: string | null
          source_family: string | null
          source_id: string | null
          source_tier: number | null
          source_title: string
          strength: string
          structured_value: Json | null
          support_classification: string
          supporting_count: number
          syndication_group: string | null
          tier_reason: string | null
          title: string
          updated_at: string
          verified: boolean
        }
        Insert: {
          acceptance_decision?: string | null
          associated_claim_ids?: string[]
          associated_factor_ids?: string[]
          author?: string | null
          canonical_domain?: string | null
          canonical_source_id?: string | null
          canonical_url: string
          claim_fingerprint?: string | null
          claim_id?: string | null
          cluster_key?: string | null
          confidence?: number
          contradicting_count?: number
          created_at?: string
          currency?: string | null
          disconfirming?: boolean
          evidence_directness?: number | null
          evidence_family?: string | null
          evidence_role?: string | null
          evidence_topic?: string | null
          excluded?: boolean
          exclusion_reason?: string | null
          extraction_confidence?: number | null
          extraction_method: string
          gemini_relevance_score?: number | null
          geography?: string | null
          id?: string
          independence_key?: string | null
          independent_domain_count?: number
          independent_source_count?: number
          market_size_figure?: string | null
          market_size_metric?: string | null
          market_size_source_qualified?: boolean
          matched_brief_dimensions?: string[]
          mismatch_reasons?: string[]
          model_classification_metadata?: Json | null
          named_entities?: string[]
          numeric_validation_state?: string | null
          numeric_value?: number | null
          opportunity_id?: string | null
          pain_point?: string | null
          publisher: string
          relevance_class?: string | null
          relevance_score?: number | null
          relevant_excerpt: string
          research_pass?: number | null
          research_query_id?: string | null
          retrieval_date: string
          run_id: string
          segment?: string | null
          semantic_relevance?: number | null
          signal_type: string
          snippet: string
          source_authority?: number | null
          source_class: string
          source_domain?: string | null
          source_family?: string | null
          source_id?: string | null
          source_tier?: number | null
          source_title: string
          strength: string
          structured_value?: Json | null
          support_classification: string
          supporting_count?: number
          syndication_group?: string | null
          tier_reason?: string | null
          title: string
          updated_at?: string
          verified?: boolean
        }
        Update: {
          acceptance_decision?: string | null
          associated_claim_ids?: string[]
          associated_factor_ids?: string[]
          author?: string | null
          canonical_domain?: string | null
          canonical_source_id?: string | null
          canonical_url?: string
          claim_fingerprint?: string | null
          claim_id?: string | null
          cluster_key?: string | null
          confidence?: number
          contradicting_count?: number
          created_at?: string
          currency?: string | null
          disconfirming?: boolean
          evidence_directness?: number | null
          evidence_family?: string | null
          evidence_role?: string | null
          evidence_topic?: string | null
          excluded?: boolean
          exclusion_reason?: string | null
          extraction_confidence?: number | null
          extraction_method?: string
          gemini_relevance_score?: number | null
          geography?: string | null
          id?: string
          independence_key?: string | null
          independent_domain_count?: number
          independent_source_count?: number
          market_size_figure?: string | null
          market_size_metric?: string | null
          market_size_source_qualified?: boolean
          matched_brief_dimensions?: string[]
          mismatch_reasons?: string[]
          model_classification_metadata?: Json | null
          named_entities?: string[]
          numeric_validation_state?: string | null
          numeric_value?: number | null
          opportunity_id?: string | null
          pain_point?: string | null
          publisher?: string
          relevance_class?: string | null
          relevance_score?: number | null
          relevant_excerpt?: string
          research_pass?: number | null
          research_query_id?: string | null
          retrieval_date?: string
          run_id?: string
          segment?: string | null
          semantic_relevance?: number | null
          signal_type?: string
          snippet?: string
          source_authority?: number | null
          source_class?: string
          source_domain?: string | null
          source_family?: string | null
          source_id?: string | null
          source_tier?: number | null
          source_title?: string
          strength?: string
          structured_value?: Json | null
          support_classification?: string
          supporting_count?: number
          syndication_group?: string | null
          tier_reason?: string | null
          title?: string
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "evidence_items_canonical_source_id_fkey"
            columns: ["canonical_source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_items_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_rejection_diagnostics: {
        Row: {
          count: number
          created_at: string
          details: Json
          id: string
          pipeline_stage: string
          reason: string
          run_id: string
          updated_at: string
        }
        Insert: {
          count?: number
          created_at?: string
          details?: Json
          id?: string
          pipeline_stage: string
          reason: string
          run_id: string
          updated_at?: string
        }
        Update: {
          count?: number
          created_at?: string
          details?: Json
          id?: string
          pipeline_stage?: string
          reason?: string
          run_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_rejection_diagnostics_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_limits: {
        Row: {
          created_at: string
          max_projects: number
          max_research_runs: number
          max_team_members: number
          team_id: string
          updated_at: string
          used_projects: number
          used_research_runs: number
        }
        Insert: {
          created_at?: string
          max_projects?: number
          max_research_runs?: number
          max_team_members?: number
          team_id: string
          updated_at?: string
          used_projects?: number
          used_research_runs?: number
        }
        Update: {
          created_at?: string
          max_projects?: number
          max_research_runs?: number
          max_team_members?: number
          team_id?: string
          updated_at?: string
          used_projects?: number
          used_research_runs?: number
        }
        Relationships: [
          {
            foreignKeyName: "feature_limits_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      gemini_cache: {
        Row: {
          created_at: string
          grounding_sources: Json | null
          id: string
          model: string
          prompt_hash: string
          response_text: string | null
          run_id: string
        }
        Insert: {
          created_at?: string
          grounding_sources?: Json | null
          id?: string
          model: string
          prompt_hash: string
          response_text?: string | null
          run_id: string
        }
        Update: {
          created_at?: string
          grounding_sources?: Json | null
          id?: string
          model?: string
          prompt_hash?: string
          response_text?: string | null
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gemini_cache_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      launch_plans: {
        Row: {
          created_at: string
          first_customer_channel: string
          id: string
          opportunity_id: string
          outreach_message: string
          success_metric: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_customer_channel: string
          id?: string
          opportunity_id: string
          outreach_message: string
          success_metric: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_customer_channel?: string
          id?: string
          opportunity_id?: string
          outreach_message?: string
          success_metric?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "launch_plans_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      launch_strategies: {
        Row: {
          created_at: string
          description: string
          id: string
          launch_plan_id: string
          strategy_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          launch_plan_id: string
          strategy_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          launch_plan_id?: string
          strategy_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "launch_strategies_launch_plan_id_fkey"
            columns: ["launch_plan_id"]
            isOneToOne: false
            referencedRelation: "launch_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      mvp_plans: {
        Row: {
          build_complexity: string | null
          build_estimate: string
          created_at: string
          id: string
          opportunity_id: string
          outcome: string
          updated_at: string
        }
        Insert: {
          build_complexity?: string | null
          build_estimate: string
          created_at?: string
          id?: string
          opportunity_id: string
          outcome: string
          updated_at?: string
        }
        Update: {
          build_complexity?: string | null
          build_estimate?: string
          created_at?: string
          id?: string
          opportunity_id?: string
          outcome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mvp_plans_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      mvp_scope_items: {
        Row: {
          created_at: string
          description: string
          id: string
          item_type: string
          mvp_plan_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          item_type: string
          mvp_plan_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          item_type?: string
          mvp_plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mvp_scope_items_mvp_plan_id_fkey"
            columns: ["mvp_plan_id"]
            isOneToOne: false
            referencedRelation: "mvp_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read: boolean
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read?: boolean
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      numeric_claim_validations: {
        Row: {
          claim_type: string
          created_at: string
          evidence_item_id: string | null
          extracted_source_value: string
          id: string
          methodology_status: string
          narrative_value: string
          normalized_value: Json | null
          reason: string | null
          run_id: string
          source_url: string
          status: string
        }
        Insert: {
          claim_type: string
          created_at?: string
          evidence_item_id?: string | null
          extracted_source_value: string
          id?: string
          methodology_status?: string
          narrative_value: string
          normalized_value?: Json | null
          reason?: string | null
          run_id: string
          source_url: string
          status: string
        }
        Update: {
          claim_type?: string
          created_at?: string
          evidence_item_id?: string | null
          extracted_source_value?: string
          id?: string
          methodology_status?: string
          narrative_value?: string
          normalized_value?: Json | null
          reason?: string | null
          run_id?: string
          source_url?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "numeric_claim_validations_evidence_item_id_fkey"
            columns: ["evidence_item_id"]
            isOneToOne: false
            referencedRelation: "evidence_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "numeric_claim_validations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_alerts: {
        Row: {
          alert_type: string
          created_at: string
          details: Json
          fingerprint: string
          id: string
          resolved_at: string | null
          run_id: string | null
          severity: string
          status: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          details?: Json
          fingerprint: string
          id?: string
          resolved_at?: string | null
          run_id?: string | null
          severity: string
          status?: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          details?: Json
          fingerprint?: string
          id?: string
          resolved_at?: string | null
          run_id?: string | null
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_alerts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          core_pain: string
          created_at: string
          id: string
          market: string
          name: string
          one_liner: string
          run_id: string
          target_customer: string
          updated_at: string
        }
        Insert: {
          core_pain: string
          created_at?: string
          id?: string
          market: string
          name: string
          one_liner: string
          run_id: string
          target_customer: string
          updated_at?: string
        }
        Update: {
          core_pain?: string
          created_at?: string
          id?: string
          market?: string
          name?: string
          one_liner?: string
          run_id?: string
          target_customer?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_scores: {
        Row: {
          confidence: number
          created_at: string
          id: string
          opportunity_id: string
          total: number
          updated_at: string
          verdict: string
        }
        Insert: {
          confidence: number
          created_at?: string
          id?: string
          opportunity_id: string
          total: number
          updated_at?: string
          verdict: string
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          opportunity_id?: string
          total?: number
          updated_at?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_scores_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_models: {
        Row: {
          created_at: string
          evidence_ids: string[]
          first_offer: string
          id: string
          model: string
          opportunity_id: string
          price_point: string
          rationale: string
          target_customers: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          evidence_ids?: string[]
          first_offer: string
          id?: string
          model: string
          opportunity_id: string
          price_point: string
          rationale: string
          target_customers?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          evidence_ids?: string[]
          first_offer?: string
          id?: string
          model?: string
          opportunity_id?: string
          price_point?: string
          rationale?: string
          target_customers?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_models_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      public_retrieval_cache: {
        Row: {
          canonical_url: string
          content_hash: string
          content_type: string | null
          etag: string | null
          expires_at: string
          extraction_version: string
          fetch_status: number
          fetched_at: string
          last_modified: string | null
          structured_parser_version: string | null
          text_content: string
        }
        Insert: {
          canonical_url: string
          content_hash: string
          content_type?: string | null
          etag?: string | null
          expires_at: string
          extraction_version?: string
          fetch_status?: number
          fetched_at?: string
          last_modified?: string | null
          structured_parser_version?: string | null
          text_content: string
        }
        Update: {
          canonical_url?: string
          content_hash?: string
          content_type?: string | null
          etag?: string | null
          expires_at?: string
          extraction_version?: string
          fetch_status?: number
          fetched_at?: string
          last_modified?: string | null
          structured_parser_version?: string | null
          text_content?: string
        }
        Relationships: []
      }
      quick_scan_research_pack_statuses: {
        Row: {
          accepted_evidence_count: number
          completed_at: string | null
          created_at: string
          failure_reason: string | null
          id: string
          metadata: Json
          pack_key: string
          run_id: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          accepted_evidence_count?: number
          completed_at?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          metadata?: Json
          pack_key: string
          run_id: string
          started_at?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          accepted_evidence_count?: number
          completed_at?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          metadata?: Json
          pack_key?: string
          run_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_scan_research_pack_statuses_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      reasoning_agent_outputs: {
        Row: {
          agent_name: string
          attempt_count: number
          created_at: string
          id: string
          payload: Json
          run_id: string
          status: string
        }
        Insert: {
          agent_name: string
          attempt_count: number
          created_at?: string
          id?: string
          payload: Json
          run_id: string
          status: string
        }
        Update: {
          agent_name?: string
          attempt_count?: number
          created_at?: string
          id?: string
          payload?: Json
          run_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reasoning_agent_outputs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      report_chart_datasets: {
        Row: {
          chart_config: Json
          chart_key: string
          chart_type: string
          created_at: string
          id: string
          report_version_id: string
          run_id: string
          schema_version: number
          sha256: string
          source_data: Json
          supporting_evidence_ids: string[]
          svg_storage_path: string | null
        }
        Insert: {
          chart_config?: Json
          chart_key: string
          chart_type: string
          created_at?: string
          id?: string
          report_version_id: string
          run_id: string
          schema_version?: number
          sha256: string
          source_data: Json
          supporting_evidence_ids?: string[]
          svg_storage_path?: string | null
        }
        Update: {
          chart_config?: Json
          chart_key?: string
          chart_type?: string
          created_at?: string
          id?: string
          report_version_id?: string
          run_id?: string
          schema_version?: number
          sha256?: string
          source_data?: Json
          supporting_evidence_ids?: string[]
          svg_storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_chart_datasets_report_version_id_fkey"
            columns: ["report_version_id"]
            isOneToOne: false
            referencedRelation: "report_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_chart_datasets_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      report_exports: {
        Row: {
          byte_size: number
          created_at: string
          format: string
          id: string
          report_version_id: string
          sha256: string
          storage_path: string
        }
        Insert: {
          byte_size: number
          created_at?: string
          format: string
          id?: string
          report_version_id: string
          sha256: string
          storage_path: string
        }
        Update: {
          byte_size?: number
          created_at?: string
          format?: string
          id?: string
          report_version_id?: string
          sha256?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_exports_report_version_id_fkey"
            columns: ["report_version_id"]
            isOneToOne: false
            referencedRelation: "report_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      report_versions: {
        Row: {
          adversarial_downgrade: boolean
          adversarial_gate: Json | null
          citation_validation: Json | null
          created_at: string
          decision_integrity: Json | null
          id: string
          market_sizing: Json | null
          payload: Json
          reasoning_flags: Json | null
          report_id: string
          report_mode: Database["public"]["Enums"]["report_mode"]
          updated_at: string
          verdict_score_mismatch: boolean
          version_number: number
        }
        Insert: {
          adversarial_downgrade?: boolean
          adversarial_gate?: Json | null
          citation_validation?: Json | null
          created_at?: string
          decision_integrity?: Json | null
          id?: string
          market_sizing?: Json | null
          payload: Json
          reasoning_flags?: Json | null
          report_id: string
          report_mode: Database["public"]["Enums"]["report_mode"]
          updated_at?: string
          verdict_score_mismatch?: boolean
          version_number: number
        }
        Update: {
          adversarial_downgrade?: boolean
          adversarial_gate?: Json | null
          citation_validation?: Json | null
          created_at?: string
          decision_integrity?: Json | null
          id?: string
          market_sizing?: Json | null
          payload?: Json
          reasoning_flags?: Json | null
          report_id?: string
          report_mode?: Database["public"]["Enums"]["report_mode"]
          updated_at?: string
          verdict_score_mismatch?: boolean
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_versions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          executive_summary: string
          generated_at: string
          id: string
          methodology: string
          opportunity_id: string
          run_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          executive_summary: string
          generated_at?: string
          id?: string
          methodology: string
          opportunity_id: string
          run_id: string
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          executive_summary?: string
          generated_at?: string
          id?: string
          methodology?: string
          opportunity_id?: string
          run_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      research_adapter_metrics: {
        Row: {
          adapter: string
          calls: number
          created_at: string
          evidence_accepted: number
          failure_reason: string | null
          id: string
          independent_evidence_groups_added: number
          pages_fetched: number
          pages_found: number
          query_family: string
          run_id: string
          stopped_early: boolean
          updated_at: string
        }
        Insert: {
          adapter: string
          calls?: number
          created_at?: string
          evidence_accepted?: number
          failure_reason?: string | null
          id?: string
          independent_evidence_groups_added?: number
          pages_fetched?: number
          pages_found?: number
          query_family: string
          run_id: string
          stopped_early?: boolean
          updated_at?: string
        }
        Update: {
          adapter?: string
          calls?: number
          created_at?: string
          evidence_accepted?: number
          failure_reason?: string | null
          id?: string
          independent_evidence_groups_added?: number
          pages_fetched?: number
          pages_found?: number
          query_family?: string
          run_id?: string
          stopped_early?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_adapter_metrics_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      research_briefs: {
        Row: {
          adjacent_out_of_scope_categories: string[]
          brief: Json
          business_model: string
          created_at: string
          dimension_keywords: Json
          direct_competitor_category: string
          end_user: string
          exact_product_proposition: string
          expected_outcome: string
          geography: string
          industry: string
          problem_solved: string
          run_id: string
          target_buyer: string
          terminology: string[]
          updated_at: string
          workflow_changed: string
        }
        Insert: {
          adjacent_out_of_scope_categories?: string[]
          brief: Json
          business_model: string
          created_at?: string
          dimension_keywords: Json
          direct_competitor_category: string
          end_user: string
          exact_product_proposition: string
          expected_outcome: string
          geography: string
          industry: string
          problem_solved: string
          run_id: string
          target_buyer: string
          terminology?: string[]
          updated_at?: string
          workflow_changed: string
        }
        Update: {
          adjacent_out_of_scope_categories?: string[]
          brief?: Json
          business_model?: string
          created_at?: string
          dimension_keywords?: Json
          direct_competitor_category?: string
          end_user?: string
          exact_product_proposition?: string
          expected_outcome?: string
          geography?: string
          industry?: string
          problem_solved?: string
          run_id?: string
          target_buyer?: string
          terminology?: string[]
          updated_at?: string
          workflow_changed?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_briefs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      research_call_metrics: {
        Row: {
          cache_hits: number
          call_purpose: string
          completion_tokens: number
          conditional_call_trigger: string[]
          contradictions_added: number
          created_at: string
          duration_ms: number
          evidence_families_added: string[]
          grounded: boolean
          id: string
          independent_evidence_groups_added: number
          metadata: Json
          model: string | null
          pricing_claims_validated: number
          prompt_tokens: number
          provider: string
          query_family: string
          quota_failure: boolean
          run_id: string
          sources_accepted: number
          sources_discovered: number
          updated_at: string
        }
        Insert: {
          cache_hits?: number
          call_purpose: string
          completion_tokens?: number
          conditional_call_trigger?: string[]
          contradictions_added?: number
          created_at?: string
          duration_ms?: number
          evidence_families_added?: string[]
          grounded?: boolean
          id?: string
          independent_evidence_groups_added?: number
          metadata?: Json
          model?: string | null
          pricing_claims_validated?: number
          prompt_tokens?: number
          provider: string
          query_family: string
          quota_failure?: boolean
          run_id: string
          sources_accepted?: number
          sources_discovered?: number
          updated_at?: string
        }
        Update: {
          cache_hits?: number
          call_purpose?: string
          completion_tokens?: number
          conditional_call_trigger?: string[]
          contradictions_added?: number
          created_at?: string
          duration_ms?: number
          evidence_families_added?: string[]
          grounded?: boolean
          id?: string
          independent_evidence_groups_added?: number
          metadata?: Json
          model?: string | null
          pricing_claims_validated?: number
          prompt_tokens?: number
          provider?: string
          query_family?: string
          quota_failure?: boolean
          run_id?: string
          sources_accepted?: number
          sources_discovered?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_call_metrics_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      research_job_attempts: {
        Row: {
          attempt_number: number
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_class: string | null
          error_message: string | null
          id: string
          job_id: string
          provider_cost_usd: number
          run_id: string
          stage: string
          started_at: string
          status: string
          tokens_used: Json
        }
        Insert: {
          attempt_number: number
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_class?: string | null
          error_message?: string | null
          id?: string
          job_id: string
          provider_cost_usd?: number
          run_id: string
          stage: string
          started_at?: string
          status?: string
          tokens_used?: Json
        }
        Update: {
          attempt_number?: number
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_class?: string | null
          error_message?: string | null
          id?: string
          job_id?: string
          provider_cost_usd?: number
          run_id?: string
          stage?: string
          started_at?: string
          status?: string
          tokens_used?: Json
        }
        Relationships: [
          {
            foreignKeyName: "research_job_attempts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "research_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_job_attempts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      research_jobs: {
        Row: {
          attempt_count: number
          batch_index: number
          batch_size: number
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          created_at: string
          error_class: string | null
          error_message: string | null
          id: string
          input_meta: Json
          job_purpose: string
          logical_key: string
          max_attempts: number
          output_meta: Json
          parent_job_id: string | null
          research_cycle: number
          run_id: string
          shard_key: string | null
          stage: string
          stage_iteration: number
          status: string
          updated_at: string
          visible_after: string
        }
        Insert: {
          attempt_count?: number
          batch_index?: number
          batch_size?: number
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          error_class?: string | null
          error_message?: string | null
          id?: string
          input_meta?: Json
          job_purpose?: string
          logical_key: string
          max_attempts?: number
          output_meta?: Json
          parent_job_id?: string | null
          research_cycle?: number
          run_id: string
          shard_key?: string | null
          stage: string
          stage_iteration?: number
          status?: string
          updated_at?: string
          visible_after?: string
        }
        Update: {
          attempt_count?: number
          batch_index?: number
          batch_size?: number
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          error_class?: string | null
          error_message?: string | null
          id?: string
          input_meta?: Json
          job_purpose?: string
          logical_key?: string
          max_attempts?: number
          output_meta?: Json
          parent_job_id?: string | null
          research_cycle?: number
          run_id?: string
          shard_key?: string | null
          stage?: string
          stage_iteration?: number
          status?: string
          updated_at?: string
          visible_after?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "research_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_jobs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      research_pipeline_cursors: {
        Row: {
          coverage_gaps: string[]
          coverage_requested_cycle: boolean
          created_at: string
          current_stage: string | null
          last_completed_job_id: string | null
          last_progress_at: string
          next_batch_index: number
          research_cycle: number
          run_id: string
          stage_iteration: number
          terminalization_started: boolean
          updated_at: string
        }
        Insert: {
          coverage_gaps?: string[]
          coverage_requested_cycle?: boolean
          created_at?: string
          current_stage?: string | null
          last_completed_job_id?: string | null
          last_progress_at?: string
          next_batch_index?: number
          research_cycle?: number
          run_id: string
          stage_iteration?: number
          terminalization_started?: boolean
          updated_at?: string
        }
        Update: {
          coverage_gaps?: string[]
          coverage_requested_cycle?: boolean
          created_at?: string
          current_stage?: string | null
          last_completed_job_id?: string | null
          last_progress_at?: string
          next_batch_index?: number
          research_cycle?: number
          run_id?: string
          stage_iteration?: number
          terminalization_started?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_pipeline_cursors_last_completed_job_id_fkey"
            columns: ["last_completed_job_id"]
            isOneToOne: false
            referencedRelation: "research_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_pipeline_cursors_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      research_pipeline_metrics: {
        Row: {
          cache_hit_rate: number | null
          cache_hits: number
          cache_misses: number
          candidates_discovered: number
          cost_per_accepted_evidence: number | null
          cost_per_accepted_source: number | null
          cost_per_stage: Json
          created_at: string
          degraded_providers: Json
          evidence_items_extracted: number
          external_search_calls: number
          fallback_calls: number | null
          grounded_calls: number | null
          grounded_calls_attempted: number
          grounded_calls_completed: number
          grounded_calls_quota_blocked: number
          grounding_degraded: boolean
          grounding_mode: string
          id: string
          independent_domains: number
          input_tokens: number
          model_call_counts: Json
          output_tokens: number
          pages_attempted: number
          pages_fetched: number
          pricing_version: string | null
          provider_calls: number | null
          provider_fallback_count: number
          retry_count: number
          run_id: string
          sources_accepted: number
          sources_rejected_by_reason: Json
          stage_timings: Json
          synthesis_calls: number
          terminal_failure_reason: string | null
          total_duration_ms: number
          total_jobs_created: number
          total_provider_cost_usd: number
          updated_at: string
        }
        Insert: {
          cache_hit_rate?: number | null
          cache_hits?: number
          cache_misses?: number
          candidates_discovered?: number
          cost_per_accepted_evidence?: number | null
          cost_per_accepted_source?: number | null
          cost_per_stage?: Json
          created_at?: string
          degraded_providers?: Json
          evidence_items_extracted?: number
          external_search_calls?: number
          fallback_calls?: number | null
          grounded_calls?: number | null
          grounded_calls_attempted?: number
          grounded_calls_completed?: number
          grounded_calls_quota_blocked?: number
          grounding_degraded?: boolean
          grounding_mode?: string
          id?: string
          independent_domains?: number
          input_tokens?: number
          model_call_counts?: Json
          output_tokens?: number
          pages_attempted?: number
          pages_fetched?: number
          pricing_version?: string | null
          provider_calls?: number | null
          provider_fallback_count?: number
          retry_count?: number
          run_id: string
          sources_accepted?: number
          sources_rejected_by_reason?: Json
          stage_timings?: Json
          synthesis_calls?: number
          terminal_failure_reason?: string | null
          total_duration_ms?: number
          total_jobs_created?: number
          total_provider_cost_usd?: number
          updated_at?: string
        }
        Update: {
          cache_hit_rate?: number | null
          cache_hits?: number
          cache_misses?: number
          candidates_discovered?: number
          cost_per_accepted_evidence?: number | null
          cost_per_accepted_source?: number | null
          cost_per_stage?: Json
          created_at?: string
          degraded_providers?: Json
          evidence_items_extracted?: number
          external_search_calls?: number
          fallback_calls?: number | null
          grounded_calls?: number | null
          grounded_calls_attempted?: number
          grounded_calls_completed?: number
          grounded_calls_quota_blocked?: number
          grounding_degraded?: boolean
          grounding_mode?: string
          id?: string
          independent_domains?: number
          input_tokens?: number
          model_call_counts?: Json
          output_tokens?: number
          pages_attempted?: number
          pages_fetched?: number
          pricing_version?: string | null
          provider_calls?: number | null
          provider_fallback_count?: number
          retry_count?: number
          run_id?: string
          sources_accepted?: number
          sources_rejected_by_reason?: Json
          stage_timings?: Json
          synthesis_calls?: number
          terminal_failure_reason?: string | null
          total_duration_ms?: number
          total_jobs_created?: number
          total_provider_cost_usd?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_pipeline_metrics_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      research_runs: {
        Row: {
          assumptions: Json
          cost_budget_exhausted: boolean
          created_at: string
          created_by: string | null
          credit_cost: number
          credit_state: string
          current_stage: string | null
          current_stage_started_at: string | null
          error_message: string | null
          id: string
          idea_description: string
          idea_name: string
          idempotency_key: string | null
          last_progress_at: string | null
          market_type: string
          max_jobs_per_run: number
          max_research_cycles: number
          mode: Database["public"]["Enums"]["report_mode"]
          pipeline_version: string
          progress: number
          progress_detail: string | null
          project_id: string
          request_id: string | null
          research_outcome: string | null
          retrieval_budget_limited: boolean
          retrieval_coverage: Json | null
          retrieval_coverage_gaps: string[]
          retrieval_sufficient: boolean | null
          retry_after: string | null
          status: string
          target_customer: string
          target_region: string
          terminal_at: string | null
          time_budget_exhausted: boolean
          total_provider_cost_usd: number
          total_tokens_used: Json
          updated_at: string
        }
        Insert: {
          assumptions?: Json
          cost_budget_exhausted?: boolean
          created_at?: string
          created_by?: string | null
          credit_cost?: number
          credit_state?: string
          current_stage?: string | null
          current_stage_started_at?: string | null
          error_message?: string | null
          id?: string
          idea_description: string
          idea_name: string
          idempotency_key?: string | null
          last_progress_at?: string | null
          market_type: string
          max_jobs_per_run?: number
          max_research_cycles?: number
          mode: Database["public"]["Enums"]["report_mode"]
          pipeline_version?: string
          progress?: number
          progress_detail?: string | null
          project_id: string
          request_id?: string | null
          research_outcome?: string | null
          retrieval_budget_limited?: boolean
          retrieval_coverage?: Json | null
          retrieval_coverage_gaps?: string[]
          retrieval_sufficient?: boolean | null
          retry_after?: string | null
          status: string
          target_customer: string
          target_region: string
          terminal_at?: string | null
          time_budget_exhausted?: boolean
          total_provider_cost_usd?: number
          total_tokens_used?: Json
          updated_at?: string
        }
        Update: {
          assumptions?: Json
          cost_budget_exhausted?: boolean
          created_at?: string
          created_by?: string | null
          credit_cost?: number
          credit_state?: string
          current_stage?: string | null
          current_stage_started_at?: string | null
          error_message?: string | null
          id?: string
          idea_description?: string
          idea_name?: string
          idempotency_key?: string | null
          last_progress_at?: string | null
          market_type?: string
          max_jobs_per_run?: number
          max_research_cycles?: number
          mode?: Database["public"]["Enums"]["report_mode"]
          pipeline_version?: string
          progress?: number
          progress_detail?: string | null
          project_id?: string
          request_id?: string | null
          research_outcome?: string | null
          retrieval_budget_limited?: boolean
          retrieval_coverage?: Json | null
          retrieval_coverage_gaps?: string[]
          retrieval_sufficient?: boolean | null
          retry_after?: string | null
          status?: string
          target_customer?: string
          target_region?: string
          terminal_at?: string | null
          time_budget_exhausted?: boolean
          total_provider_cost_usd?: number
          total_tokens_used?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      research_stages: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          progress_detail: string | null
          run_id: string
          stage_name: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          progress_detail?: string | null
          run_id: string
          stage_name: string
          started_at?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          progress_detail?: string | null
          run_id?: string
          stage_name?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_stages_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      risks: {
        Row: {
          category: string
          created_at: string
          description: string
          evidence_ids: string[]
          id: string
          mitigation: string
          opportunity_id: string
          severity: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          evidence_ids?: string[]
          id?: string
          mitigation: string
          opportunity_id: string
          severity: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          evidence_ids?: string[]
          id?: string
          mitigation?: string
          opportunity_id?: string
          severity?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "risks_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_comparisons: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          project_id: string
          run_ids: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          project_id: string
          run_ids: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          project_id?: string
          run_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_comparisons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_comparisons_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      score_breakdowns: {
        Row: {
          challenging_evidence_ids: string[]
          confidence_deductions: Json
          created_at: string
          criterion: string
          effective_score: number | null
          evidence_coefficient: number | null
          evidence_state: string | null
          id: string
          notes: string
          raw_score: number | null
          score: number
          score_id: string
          supporting_evidence_ids: string[]
          unresolved_gaps: Json
          updated_at: string
          weight: number
        }
        Insert: {
          challenging_evidence_ids?: string[]
          confidence_deductions?: Json
          created_at?: string
          criterion: string
          effective_score?: number | null
          evidence_coefficient?: number | null
          evidence_state?: string | null
          id?: string
          notes: string
          raw_score?: number | null
          score: number
          score_id: string
          supporting_evidence_ids?: string[]
          unresolved_gaps?: Json
          updated_at?: string
          weight: number
        }
        Update: {
          challenging_evidence_ids?: string[]
          confidence_deductions?: Json
          created_at?: string
          criterion?: string
          effective_score?: number | null
          evidence_coefficient?: number | null
          evidence_state?: string | null
          id?: string
          notes?: string
          raw_score?: number | null
          score?: number
          score_id?: string
          supporting_evidence_ids?: string[]
          unresolved_gaps?: Json
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "score_breakdowns_score_id_fkey"
            columns: ["score_id"]
            isOneToOne: false
            referencedRelation: "opportunity_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      score_evidence_refs: {
        Row: {
          created_at: string
          evidence_id: string
          id: string
          score_breakdown_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          evidence_id: string
          id?: string
          score_breakdown_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          evidence_id?: string
          id?: string
          score_breakdown_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "score_evidence_refs_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_evidence_refs_score_breakdown_id_fkey"
            columns: ["score_breakdown_id"]
            isOneToOne: false
            referencedRelation: "score_breakdowns"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_weights: {
        Row: {
          criterion: string
          description: string
          updated_at: string
          weight: number
        }
        Insert: {
          criterion: string
          description: string
          updated_at?: string
          weight: number
        }
        Update: {
          criterion?: string
          description?: string
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      source_registry: {
        Row: {
          access_method: string
          adapter: string | null
          auth_required: boolean
          average_extraction_cost: number | null
          average_relevance: number | null
          cache_ttl_seconds: number
          commercial_restrictions: string | null
          domain: string
          enabled: boolean
          evidence_families: string[]
          extraction_strategy: string
          geographies: string[]
          historical_success_rate: number | null
          industries: string[]
          quality_tier: number | null
          rate_limit_per_minute: number | null
          robots_restricted: boolean
          source_class: string
          updated_at: string
        }
        Insert: {
          access_method?: string
          adapter?: string | null
          auth_required?: boolean
          average_extraction_cost?: number | null
          average_relevance?: number | null
          cache_ttl_seconds?: number
          commercial_restrictions?: string | null
          domain: string
          enabled?: boolean
          evidence_families?: string[]
          extraction_strategy?: string
          geographies?: string[]
          historical_success_rate?: number | null
          industries?: string[]
          quality_tier?: number | null
          rate_limit_per_minute?: number | null
          robots_restricted?: boolean
          source_class?: string
          updated_at?: string
        }
        Update: {
          access_method?: string
          adapter?: string | null
          auth_required?: boolean
          average_extraction_cost?: number | null
          average_relevance?: number | null
          cache_ttl_seconds?: number
          commercial_restrictions?: string | null
          domain?: string
          enabled?: boolean
          evidence_families?: string[]
          extraction_strategy?: string
          geographies?: string[]
          historical_success_rate?: number | null
          industries?: string[]
          quality_tier?: number | null
          rate_limit_per_minute?: number | null
          robots_restricted?: boolean
          source_class?: string
          updated_at?: string
        }
        Relationships: []
      }
      source_retrieval_audit: {
        Row: {
          acceptance_decision: string | null
          candidate_url: string | null
          canonical_url: string | null
          created_at: string
          deterministic_relevance_score: number | null
          disposition: string
          id: string
          matched_brief_dimensions: string[]
          mismatch_reasons: string[]
          page_type: string | null
          provider: string
          query_family: string
          rejection_reason: string | null
          relevance_class: string | null
          relevance_score: number | null
          run_id: string
          source_domain: string | null
          source_tier: number | null
          source_tier_reason: string | null
        }
        Insert: {
          acceptance_decision?: string | null
          candidate_url?: string | null
          canonical_url?: string | null
          created_at?: string
          deterministic_relevance_score?: number | null
          disposition: string
          id?: string
          matched_brief_dimensions?: string[]
          mismatch_reasons?: string[]
          page_type?: string | null
          provider: string
          query_family: string
          rejection_reason?: string | null
          relevance_class?: string | null
          relevance_score?: number | null
          run_id: string
          source_domain?: string | null
          source_tier?: number | null
          source_tier_reason?: string | null
        }
        Update: {
          acceptance_decision?: string | null
          candidate_url?: string | null
          canonical_url?: string | null
          created_at?: string
          deterministic_relevance_score?: number | null
          disposition?: string
          id?: string
          matched_brief_dimensions?: string[]
          mismatch_reasons?: string[]
          page_type?: string | null
          provider?: string
          query_family?: string
          rejection_reason?: string | null
          relevance_class?: string | null
          relevance_score?: number | null
          run_id?: string
          source_domain?: string | null
          source_tier?: number | null
          source_tier_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "source_retrieval_audit_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          acceptance_decision: string | null
          authority_score: number | null
          canonical_url: string | null
          created_at: string
          directness_score: number | null
          evidence_family: string | null
          excluded: boolean
          extraction_method: string
          id: string
          market_size_qualification_reason: string | null
          market_size_source_qualified: boolean
          matched_brief_dimensions: string[]
          mismatch_reasons: string[]
          page_type: string | null
          promotional_bias: string | null
          published_at: string | null
          publisher: string
          query_family: string | null
          relevance_class: string | null
          relevance_score: number | null
          retrieval_date: string
          run_id: string
          source_class: string
          source_domain: string | null
          source_tier: number | null
          source_tier_reason: string | null
          source_type: string
          text_content: string
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          acceptance_decision?: string | null
          authority_score?: number | null
          canonical_url?: string | null
          created_at?: string
          directness_score?: number | null
          evidence_family?: string | null
          excluded?: boolean
          extraction_method: string
          id?: string
          market_size_qualification_reason?: string | null
          market_size_source_qualified?: boolean
          matched_brief_dimensions?: string[]
          mismatch_reasons?: string[]
          page_type?: string | null
          promotional_bias?: string | null
          published_at?: string | null
          publisher: string
          query_family?: string | null
          relevance_class?: string | null
          relevance_score?: number | null
          retrieval_date: string
          run_id: string
          source_class: string
          source_domain?: string | null
          source_tier?: number | null
          source_tier_reason?: string | null
          source_type: string
          text_content: string
          title: string
          updated_at?: string
          url: string
        }
        Update: {
          acceptance_decision?: string | null
          authority_score?: number | null
          canonical_url?: string | null
          created_at?: string
          directness_score?: number | null
          evidence_family?: string | null
          excluded?: boolean
          extraction_method?: string
          id?: string
          market_size_qualification_reason?: string | null
          market_size_source_qualified?: boolean
          matched_brief_dimensions?: string[]
          mismatch_reasons?: string[]
          page_type?: string | null
          promotional_bias?: string | null
          published_at?: string | null
          publisher?: string
          query_family?: string | null
          relevance_class?: string | null
          relevance_score?: number | null
          retrieval_date?: string
          run_id?: string
          source_class?: string
          source_domain?: string | null
          source_tier?: number | null
          source_tier_reason?: string | null
          source_type?: string
          text_content?: string
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      team_credit_accounts: {
        Row: {
          created_at: string
          free_cycle_started_at: string
          free_quick_scans_remaining: number
          paid_credits: number
          reserved_paid_credits: number
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          free_cycle_started_at?: string
          free_quick_scans_remaining?: number
          paid_credits?: number
          reserved_paid_credits?: number
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          free_cycle_started_at?: string
          free_quick_scans_remaining?: number
          paid_credits?: number
          reserved_paid_credits?: number
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_credit_accounts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          role: string
          team_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
          team_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          team_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          business_model: string | null
          created_at: string
          email_notifications: boolean | null
          experience_level: string | null
          launch_channels: string[] | null
          preferred_market: string | null
          region: string | null
          revenue_goal: string | null
          target_customer_type: string | null
          technical_level: string | null
          theme_preference: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          business_model?: string | null
          created_at?: string
          email_notifications?: boolean | null
          experience_level?: string | null
          launch_channels?: string[] | null
          preferred_market?: string | null
          region?: string | null
          revenue_goal?: string | null
          target_customer_type?: string | null
          technical_level?: string | null
          theme_preference?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          business_model?: string | null
          created_at?: string
          email_notifications?: boolean | null
          experience_level?: string | null
          launch_channels?: string[] | null
          preferred_market?: string | null
          region?: string | null
          revenue_goal?: string | null
          target_customer_type?: string | null
          technical_level?: string | null
          theme_preference?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          onboarding_completed: boolean
          tour_completed: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          onboarding_completed?: boolean
          tour_completed?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          onboarding_completed?: boolean
          tour_completed?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      validated_pricing_observations: {
        Row: {
          created_at: string
          exact_excerpt: string
          id: string
          plan_name: string | null
          price_point: string
          pricing_model: string
          query_family: string
          run_id: string
          source_domain: string
          source_id: string | null
          source_url: string
          validation_state: string
        }
        Insert: {
          created_at?: string
          exact_excerpt: string
          id?: string
          plan_name?: string | null
          price_point: string
          pricing_model: string
          query_family: string
          run_id: string
          source_domain: string
          source_id?: string | null
          source_url: string
          validation_state: string
        }
        Update: {
          created_at?: string
          exact_excerpt?: string
          id?: string
          plan_name?: string | null
          price_point?: string
          pricing_model?: string
          query_family?: string
          run_id?: string
          source_domain?: string
          source_id?: string | null
          source_url?: string
          validation_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "validated_pricing_observations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validated_pricing_observations_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_research_limits: {
        Row: {
          provider_spend_per_day_usd: number
          reports_per_day: number
          reports_per_user_per_hour: number
          team_id: string
          updated_at: string
        }
        Insert: {
          provider_spend_per_day_usd?: number
          reports_per_day?: number
          reports_per_user_per_hour?: number
          team_id: string
          updated_at?: string
        }
        Update: {
          provider_spend_per_day_usd?: number
          reports_per_day?: number
          reports_per_user_per_hour?: number
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_research_limits_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bootstrap_user: {
        Args: { p_email: string; p_metadata?: Json; p_user_id: string }
        Returns: undefined
      }
      cancel_research_run: {
        Args: { p_reason?: string; p_run_id: string }
        Returns: string
      }
      claim_research_job: {
        Args: { p_visibility_timeout_ms?: number; p_worker_id: string }
        Returns: {
          attempt_count: number
          batch_index: number
          batch_size: number
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          created_at: string
          error_class: string | null
          error_message: string | null
          id: string
          input_meta: Json
          job_purpose: string
          logical_key: string
          max_attempts: number
          output_meta: Json
          parent_job_id: string | null
          research_cycle: number
          run_id: string
          shard_key: string | null
          stage: string
          stage_iteration: number
          status: string
          updated_at: string
          visible_after: string
        }[]
        SetofOptions: {
          from: "*"
          to: "research_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_research_job_for_run: {
        Args: {
          p_run_id: string
          p_visibility_timeout_ms: number
          p_worker_id: string
        }
        Returns: {
          attempt_count: number
          batch_index: number
          batch_size: number
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          created_at: string
          error_class: string | null
          error_message: string | null
          id: string
          input_meta: Json
          job_purpose: string
          logical_key: string
          max_attempts: number
          output_meta: Json
          parent_job_id: string | null
          research_cycle: number
          run_id: string
          shard_key: string | null
          stage: string
          stage_iteration: number
          status: string
          updated_at: string
          visible_after: string
        }[]
        SetofOptions: {
          from: "*"
          to: "research_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_isolated_test_team: {
        Args: { p_team_id: string }
        Returns: boolean
      }
      collect_research_operational_alerts: { Args: never; Returns: Json }
      complete_research_job: {
        Args: {
          p_job_id: string
          p_metrics?: Json
          p_next_batch_index?: number
          p_next_batch_size?: number
          p_next_input_meta?: Json
          p_next_job_purpose?: string
          p_next_shard_key?: string
          p_next_stage?: string
          p_next_stage_iteration?: number
          p_output_meta?: Json
        }
        Returns: Json
      }
      consume_edge_rate_limit: {
        Args: {
          p_limit: number
          p_scope_hash: string
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          remaining: number
          retry_after_seconds: number
        }[]
      }
      count_pending_research_jobs_for_run: {
        Args: { p_run_id: string }
        Returns: number
      }
      create_research_run_with_reservation: {
        Args: {
          p_assumptions: Json
          p_idea_description: string
          p_idea_name: string
          p_idempotency_key: string
          p_market_type: string
          p_mode: Database["public"]["Enums"]["report_mode"]
          p_project_id: string
          p_request_id: string
          p_target_customer: string
          p_target_region: string
        }
        Returns: {
          available_paid_credits: number
          credit_cost: number
          credit_source: string
          duplicate: boolean
          free_quick_scans_remaining: number
          report_mode: Database["public"]["Enums"]["report_mode"]
          run_id: string
          run_status: string
        }[]
      }
      enqueue_research_job: {
        Args: {
          p_batch_index?: number
          p_batch_size?: number
          p_input_meta?: Json
          p_job_purpose?: string
          p_logical_key?: string
          p_max_attempts?: number
          p_parent_job_id?: string
          p_research_cycle?: number
          p_run_id: string
          p_shard_key?: string
          p_stage: string
          p_stage_iteration?: number
          p_visible_after?: string
        }
        Returns: string
      }
      ensure_user_bootstrap: { Args: never; Returns: undefined }
      fail_queued_research_dispatch: {
        Args: { p_error_message: string; p_run_id: string }
        Returns: string
      }
      fail_research_job: {
        Args: {
          p_error_class: string
          p_error_message: string
          p_job_id: string
        }
        Returns: Json
      }
      finalize_research_credit: {
        Args: { p_outcome: string; p_run_id: string }
        Returns: string
      }
      finalize_research_run: { Args: { p_run_id: string }; Returns: string }
      get_owned_latest_report: {
        Args: { p_run_id: string; p_user_id: string }
        Returns: Json
      }
      get_research_activity_detail: {
        Args: { p_run_id: string }
        Returns: Json
      }
      get_research_history_snapshot: { Args: never; Returns: Json }
      get_research_progress_snapshot: {
        Args: { p_run_id: string }
        Returns: Json
      }
      get_team_credit_snapshot: {
        Args: never
        Returns: {
          free_cycle_started_at: string
          free_quick_scans_remaining: number
          full_validations_available: number
          paid_credits: number
          quick_scans_available: number
          reserved_paid_credits: number
          team_id: string
        }[]
      }
      grant_paid_credits: {
        Args: {
          p_credits: number
          p_external_reference: string
          p_metadata?: Json
          p_team_id: string
        }
        Returns: number
      }
      is_team_admin: {
        Args: { team_id: string; user_id: string }
        Returns: boolean
      }
      is_team_member: {
        Args: { team_id: string; user_id: string }
        Returns: boolean
      }
      process_pending_research_jobs: { Args: never; Returns: number }
      recover_orphaned_research_runs: {
        Args: { p_stale_after?: string }
        Returns: number
      }
      recover_stale_research_jobs: {
        Args: { p_stale_threshold_ms?: number }
        Returns: number
      }
      recover_stale_research_jobs_for_run: {
        Args: { p_run_id: string; p_stale_threshold_ms: number }
        Returns: number
      }
      refresh_monthly_quick_scan: {
        Args: { p_team_id: string }
        Returns: undefined
      }
      terminate_research_run: {
        Args: {
          p_error_class: string
          p_error_message: string
          p_failed_stage?: string
          p_run_id: string
        }
        Returns: string
      }
    }
    Enums: {
      report_mode: "quick_scan" | "full_validation"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      report_mode: ["quick_scan", "full_validation"],
    },
  },
} as const

// Application domain types

export type ValidationVerdict =
  | "Build now"
  | "Validate first"
  | "Avoid for now";
export type EngineVerdict =
  | "Build Now"
  | "Validate First"
  | "Niche Down"
  | "Weak Signal"
  | "Avoid"
  | "Build"
  | "Reposition"
  | "Do Not Build Yet";
export type ScoringCriterion =
  | "painSeverity"
  | "purchaseUrgency"
  | "willingnessToPay"
  | "buyerReachability"
  | "mvpSpeed"
  | "competitionGap"
  | "retentionPotential"
  | "platformDependencyRisk"
  | "regulatoryRisk"
  | "founderFit"
  | "distributionClarity"
  | "speedToFirstRevenue";
export type ScoringWeights = Record<ScoringCriterion, number>;
export type CriterionScores = Record<ScoringCriterion, number>;
export type CriterionNotes = Record<ScoringCriterion, string>;
export type CriterionEvidence = Partial<Record<ScoringCriterion, string[]>>;
export interface OpportunityScorecard {
  scores: CriterionScores;
  notes: CriterionNotes;
  evidenceRefs: CriterionEvidence;
  weights: ScoringWeights;
  total: number;
  confidence: number;
  verdict: EngineVerdict;
  deterministicVerdict?: EngineVerdict;
  decisionStatus?: "Passed" | "Challenged";
  factorEvidence?: Partial<Record<ScoringCriterion, {
    rawScore: number;
    evidenceCoefficient: number;
    effectiveScore: number;
    evidenceState: "EVIDENCED" | "SUGGESTIVE" | "ASSUMED";
    supportingEvidenceIds: string[];
    challengingEvidenceIds: string[];
    confidenceDeductions: string[];
    unresolvedGaps: string[];
  }>>;
  scoreBand?: {
    minimum: number;
    maximum: number;
    label: "High Evidence Confidence" | "Moderate Evidence Confidence" | "Low Evidence Confidence";
    display: string;
  };
}
export type MarketType =
  | "B2B"
  | "D2C"
  | "Creator"
  | "Developer Tool"
  | "Local Business"
  | "Agency Tool"
  | "Student/Career"
  | "Other";
export type ResearchMode = ReportMode;

export interface EvidenceItem {
  id: string;
  source: string;
  sourceType: string;
  title: string;
  snippet: string;
  url: string;
  signal: "Pain" | "Demand" | "Pricing" | "Risk";
  strength: "High" | "Medium" | "Low";
  date: string;
  evidenceFamily?: "problem" | "solution";
  researchPass?: 1 | 2 | 3;
  researchQueryId?: string | null;
  sourceTier?: 1 | 2 | 3 | 4;
  sourceTierReason?: string | null;
  excluded?: boolean;
  disconfirming?: boolean;
  painPoint?: string;
  independentSourceCount?: number;
  independentDomainCount?: number;
  evidenceTopic?: string;
  acceptanceDecision?: string;
  claimId?: string;
  canonicalSourceId?: string | null;
  canonicalDomain?: string;
  sourceFamily?: string;
  sourceAuthority?: number;
  evidenceDirectness?: number;
  semanticRelevance?: number;
  independenceKey?: string;
  syndicationGroup?: string;
  claimFingerprint?: string;
  evidenceRole?: "supporting" | "challenging";
  associatedFactorIds?: string[];
  extractionConfidence?: number;
  numericValidationState?: "verified" | "flagged" | "rejected" | "not_applicable" | "not_checked";
  modelClassificationMetadata?: Record<string, unknown> | null;
}
export interface Competitor {
  id: string;
  name: string;
  positioning: string;
  pricing: string;
  target: string;
  strength: string;
  gap: string;
  classification?: "direct" | "adjacent" | "substitute" | "workflow_workaround";
  evidenceIds?: string[];
  verificationStatus?: "discovered_candidate" | "live_verified_competitor" | "adjacent_alternative" | "unverified_seed";
  verifiedAt?: string | null;
}
export interface ScoreBreakdown {
  pain: number;
  urgency: number;
  willingnessToPay: number;
  reachability: number;
  competition: number;
  complexity: number;
  platformRisk: number;
  founderFit: number;
  total: number;
}
export interface PricingModel {
  model: string;
  pricePoint: string;
  rationale: string;
  firstOffer: string;
  targetCustomers: number | null;
}
export interface MVPPlan {
  outcome: string;
  scope: string[];
  exclusions: string[];
  buildEstimate: string;
}
export interface LaunchPlan {
  firstCustomerChannel: string;
  weekOne: string[];
  outreachMessage: string;
  successMetric: string;
}
export interface RiskItem {
  id: string;
  category: "Market" | "Execution" | "Platform" | "Regulatory";
  severity: "High" | "Medium" | "Low";
  description: string;
  mitigation: string;
}
export interface Opportunity {
  id: string;
  name: string;
  one_liner: string;
  target_customer: string;
  market: MarketType;
  score: ScoreBreakdown;
  verdict: ValidationVerdict;
  confidence: number;
  evidence: EvidenceItem[];
  competitors: Competitor[];
  pricing: PricingModel;
  mvp: MVPPlan;
  launch: LaunchPlan;
  risks: RiskItem[];
}
export interface ResearchRun {
  id: string;
  ideaName: string;
  ideaDescription: string;
  targetCustomer: string;
  marketType: MarketType;
  targetRegion: string;
  mode: ResearchMode;
  status: ResearchStatus;
  createdAt: string;
  progress: number;
  opportunity?: Opportunity;
}
