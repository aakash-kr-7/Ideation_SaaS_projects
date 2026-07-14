# SignalFit Backend Architecture

## Overview
SignalFit uses Next.js (App Router) backed by Supabase (PostgreSQL). The backend logic is organized into standard layers to ensure maintainability and separation of concerns.

## Service Layer (`lib/services/`)
This is the entry point for all business logic.
- Route Handlers (`app/api/...`) and Server Actions must only call Services.
- **Never** write direct database queries or raw SQL in UI components or route handlers.

## Repository Layer (`lib/repositories/`)
Repositories act as the single source of truth for database interactions.
- All repositories import the typed Supabase server client (`lib/supabase/server.ts`).
- Returns typed rows mapping directly to the Supabase Database types.
- Centralizes error handling for data access.

## Background Jobs & Queues
Long-running processes (e.g. LLM research extraction, generation) are offloaded to Supabase Edge Functions.
1. The Next.js app inserts a row into `research_runs` (status: `Queued`).
2. A Database Webhook on Supabase fires on `INSERT` to the `research_runs` table.
3. The Edge Function (`supabase/functions/research-worker`) receives the webhook, changes the status to `Searching` / `Processing`, performs the async work, and writes the results back to the database.
4. Supabase Realtime notifies the client-side Next.js app of progress updates.
