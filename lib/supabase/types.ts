export type SyncStatus = "running" | "completed" | "failed";

export interface Angles {
  framing: string;
  possibilities: string[];
}

// Row types
export interface BoardRow {
  id: string;
  canny_id: string;
  slug: string;
  name: string;
  display_order: number;
  created_at: string;
}

export interface IdeaRow {
  id: string;
  canny_id: string;
  board_id: string;
  title: string;
  description: string | null;
  vote_count: number;
  canny_url: string | null;
  created_at: string;
  removed_at: string | null;
  selected_this_week: boolean;
  selection_reason: string | null;
  selection_status: string | null;
  selection_week: string | null;
  selection_priority_rank: number | null;
  jira_story: string | null;
  marked_done: boolean;
  marked_done_at: string | null;
  synced_at: string;
  updated_at: string;
}

export interface TagRow {
  id: string;
  name: string;
  created_at: string;
}

export interface IdeaTagRow {
  idea_id: string;
  tag_id: string;
}

export interface PatternRow {
  id: string;
  week_of: string;
  title: string;
  summary: string;
  board_count: number | null;
  item_count: number | null;
  roadmap_alignment: string | null;
  angles: Angles;
  created_at: string;
}

export interface PatternItemRow {
  pattern_id: string;
  idea_id: string;
}

export interface SyncRunRow {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: SyncStatus;
  items_processed: number;
  items_added: number;
  items_updated: number;
  items_removed: number;
  week_of: string | null;
  error: string | null;
}

export interface PromptRunRow {
  id: string;
  sync_run_id: string | null;
  prompt_version: string;
  model: string;
  duration_ms: number | null;
  input_item_count: number;
  output: unknown | null;
  error: string | null;
  strategy_commit_sha: string | null;
  created_at: string;
}

// Database type that satisfies @supabase/supabase-js generic constraints
export interface Database {
  public: {
    Tables: {
      boards: {
        Row: BoardRow;
        Insert: Omit<BoardRow, "id" | "created_at">;
        Update: Partial<Omit<BoardRow, "id" | "created_at">>;
        Relationships: [];
      };
      ideas: {
        Row: IdeaRow;
        Insert: Omit<IdeaRow, "id" | "synced_at" | "updated_at">;
        Update: Partial<Omit<IdeaRow, "id" | "synced_at" | "updated_at">>;
        Relationships: [];
      };
      tags: {
        Row: TagRow;
        Insert: { name: string };
        Update: { name?: string };
        Relationships: [];
      };
      idea_tags: {
        Row: IdeaTagRow;
        Insert: IdeaTagRow;
        Update: Partial<IdeaTagRow>;
        Relationships: [];
      };
      patterns: {
        Row: PatternRow;
        Insert: Omit<PatternRow, "id" | "created_at">;
        Update: Partial<Omit<PatternRow, "id" | "created_at">>;
        Relationships: [];
      };
      pattern_items: {
        Row: PatternItemRow;
        Insert: PatternItemRow;
        Update: Partial<PatternItemRow>;
        Relationships: [];
      };
      sync_runs: {
        Row: SyncRunRow;
        Insert: Omit<SyncRunRow, "id">;
        Update: Partial<Omit<SyncRunRow, "id">>;
        Relationships: [];
      };
      prompt_runs: {
        Row: PromptRunRow;
        Insert: Omit<PromptRunRow, "id" | "created_at">;
        Update: Partial<Omit<PromptRunRow, "id" | "created_at">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
