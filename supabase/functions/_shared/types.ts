// Shared, runtime-neutral database and report domain types.
import type { ResearchStatus } from "./research/status.ts"
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
          completion_tokens: number | null
          cost: number | null
          created_at: string
          error_message: string | null
          id: string
          operation: string
          prompt_tokens: number | null
          provider: string
          run_id: string
          status: string
        }
        Insert: {
          completion_tokens?: number | null
          cost?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          operation: string
          prompt_tokens?: number | null
          provider: string
          run_id: string
          status: string
        }
        Update: {
          completion_tokens?: number | null
          cost?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          operation?: string
          prompt_tokens?: number | null
          provider?: string
          run_id?: string
          status?: string
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
      background_jobs: {
        Row: {
          created_at: string
          error_details: string | null
          id: string
          job_type: string
          run_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_details?: string | null
          id?: string
          job_type: string
          run_id?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_details?: string | null
          id?: string
          job_type?: string
          run_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "background_jobs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
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
      cached_research: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          query_hash: string
          result: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          query_hash: string
          result: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          query_hash?: string
          result?: Json
          updated_at?: string
        }
        Relationships: []
      }
      competitors: {
        Row: {
          created_at: string
          gap: string
          id: string
          name: string
          opportunity_id: string
          positioning: string
          pricing: string
          strength: string
          target: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          gap: string
          id?: string
          name: string
          opportunity_id: string
          positioning: string
          pricing: string
          strength: string
          target: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          gap?: string
          id?: string
          name?: string
          opportunity_id?: string
          positioning?: string
          pricing?: string
          strength?: string
          target?: string
          updated_at?: string
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
      error_logs: {
        Row: {
          context: string
          created_at: string
          error_message: string
          id: string
          stack_trace: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          context: string
          created_at?: string
          error_message: string
          id?: string
          stack_trace?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          context?: string
          created_at?: string
          error_message?: string
          id?: string
          stack_trace?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_items: {
        Row: {
          created_at: string
          id: string
          opportunity_id: string | null
          run_id: string
          signal_type: string
          snippet: string
          source_id: string | null
          strength: string
          title: string
          updated_at: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          opportunity_id?: string | null
          run_id: string
          signal_type: string
          snippet: string
          source_id?: string | null
          strength: string
          title: string
          updated_at?: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          opportunity_id?: string | null
          run_id?: string
          signal_type?: string
          snippet?: string
          source_id?: string | null
          strength?: string
          title?: string
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
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
          build_complexity: string
          build_estimate: string
          created_at: string
          id: string
          opportunity_id: string
          outcome: string
          updated_at: string
        }
        Insert: {
          build_complexity: string
          build_estimate: string
          created_at?: string
          id?: string
          opportunity_id: string
          outcome: string
          updated_at?: string
        }
        Update: {
          build_complexity?: string
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
          first_offer: string
          id: string
          model: string
          opportunity_id: string
          price_point: string
          rationale: string
          target_customers: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_offer: string
          id?: string
          model: string
          opportunity_id: string
          price_point: string
          rationale: string
          target_customers: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_offer?: string
          id?: string
          model?: string
          opportunity_id?: string
          price_point?: string
          rationale?: string
          target_customers?: number
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
      report_versions: {
        Row: {
          created_at: string
          id: string
          payload: Json
          report_id: string
          updated_at: string
          version_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          payload: Json
          report_id: string
          updated_at?: string
          version_number: number
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          report_id?: string
          updated_at?: string
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
      research_runs: {
        Row: {
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          idea_description: string
          idea_name: string
          market_type: string
          mode: string
          progress: number
          project_id: string
          status: ResearchStatus
          target_customer: string
          target_region: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          idea_description: string
          idea_name: string
          market_type: string
          mode: string
          progress?: number
          project_id: string
          status: ResearchStatus
          target_customer: string
          target_region: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          idea_description?: string
          idea_name?: string
          market_type?: string
          mode?: string
          progress?: number
          project_id?: string
          status?: ResearchStatus
          target_customer?: string
          target_region?: string
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
          run_id: string
          stage_name: ResearchStatus
          started_at: string | null
          status: ResearchStatus
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          run_id: string
          stage_name: ResearchStatus
          started_at?: string | null
          status: ResearchStatus
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          run_id?: string
          stage_name?: ResearchStatus
          started_at?: string | null
          status?: ResearchStatus
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
          created_at: string
          criterion: string
          id: string
          notes: string
          score: number
          score_id: string
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          criterion: string
          id?: string
          notes: string
          score: number
          score_id: string
          updated_at?: string
          weight: number
        }
        Update: {
          created_at?: string
          criterion?: string
          id?: string
          notes?: string
          score?: number
          score_id?: string
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
      search_cache: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          query_string: string
          results: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          query_string: string
          results: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          query_string?: string
          results?: Json
          updated_at?: string
        }
        Relationships: []
      }
      sources: {
        Row: {
          created_at: string
          id: string
          published_at: string | null
          run_id: string
          source_type: string
          text_content: string
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          published_at?: string | null
          run_id: string
          source_type: string
          text_content: string
          title: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          published_at?: string | null
          run_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_team_admin: {
        Args: { team_id: string; user_id: string }
        Returns: boolean
      }
      is_team_member: {
        Args: { team_id: string; user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const



// Helper Types

// --- Legacy UI / Frontend Helper Types ---

export type ValidationVerdict = "Build now" | "Validate first" | "Avoid for now";
export type EngineVerdict = "Build Now" | "Validate First" | "Niche Down" | "Weak Signal" | "Avoid";
export type ScoringCriterion = "painSeverity" | "purchaseUrgency" | "willingnessToPay" | "buyerReachability" | "mvpSpeed" | "competitionGap" | "retentionPotential" | "platformDependencyRisk" | "regulatoryRisk" | "founderFit" | "distributionClarity" | "speedToFirstRevenue";
export type ScoringWeights = Record<ScoringCriterion, number>;
export type CriterionScores = Record<ScoringCriterion, number>;
export type CriterionNotes = Record<ScoringCriterion, string>;
export type CriterionEvidence = Partial<Record<ScoringCriterion, string[]>>;
export interface OpportunityScorecard { scores: CriterionScores; notes: CriterionNotes; evidenceRefs: CriterionEvidence; weights: ScoringWeights; total: number; confidence: number; verdict: EngineVerdict; }
export type MarketType = "B2B" | "D2C" | "Creator" | "Developer Tool" | "Local Business" | "Agency Tool" | "Student/Career" | "Other";
export type ResearchMode = "Fast Scan" | "Deep Validation" | "Compare Ideas" | "Find Opportunities in Market";

export interface EvidenceItem { id: string; source: string; sourceType: string; title: string; snippet: string; url: string; signal: "Pain" | "Demand" | "Pricing" | "Risk"; strength: "High" | "Medium" | "Low"; date: string; }
export interface Competitor { id: string; name: string; positioning: string; pricing: string; target: string; strength: string; gap: string; }
export interface ScoreBreakdown { pain: number; urgency: number; willingnessToPay: number; reachability: number; competition: number; complexity: number; platformRisk: number; founderFit: number; total: number; }
export interface PricingModel { model: string; pricePoint: string; rationale: string; firstOffer: string; targetCustomers: number; }
export interface MVPPlan { outcome: string; scope: string[]; exclusions: string[]; buildEstimate: string; }
export interface LaunchPlan { firstCustomerChannel: string; weekOne: string[]; outreachMessage: string; successMetric: string; }
export interface RiskItem { id: string; category: "Market" | "Execution" | "Platform" | "Regulatory"; severity: "High" | "Medium" | "Low"; description: string; mitigation: string; }
export interface Opportunity { id: string; name: string; one_liner: string; target_customer: string; market: MarketType; score: ScoreBreakdown; verdict: ValidationVerdict; confidence: number; evidence: EvidenceItem[]; competitors: Competitor[]; pricing: PricingModel; mvp: MVPPlan; launch: LaunchPlan; risks: RiskItem[]; }
export interface ResearchRun { id: string; ideaName: string; ideaDescription: string; targetCustomer: string; marketType: MarketType; targetRegion: string; mode: ResearchMode; status: ResearchStatus; createdAt: string; progress: number; opportunity?: Opportunity; }
