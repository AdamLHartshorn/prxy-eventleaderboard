import { createClient } from "@supabase/supabase-js";

export type LeaderboardEntry = {
  id: string;
  event_id: string | null;
  rank: number | null;
  golfer_name: string;
  company_name: string | null;
  distance: number | null;
  video_url: string | null;
  thumbnail_url: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type LeaderboardEvent = {
  id: string;
  event_name: string;
  slug: string;
  event_subtitle: string | null;
  venue_name: string | null;
  logo_url: string | null;
  donation_amount: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AppSettings = {
  id: number;
  current_event_id: string | null;
  company_logo_url: string | null;
  qr_code_url: string | null;
  updated_at: string | null;
};

export type EventArchive = {
  id: string;
  event_id: string | null;
  event_name: string;
  event_subtitle: string | null;
  venue_name: string | null;
  logo_url: string | null;
  finalized_at: string;
  created_at: string | null;
};

export type ArchivedLeaderboardEntry = {
  id: string;
  archive_id: string;
  final_rank: number;
  golfer_name: string;
  company_name: string | null;
  distance: number | null;
  thumbnail_url: string | null;
  created_at: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigError =
  !supabaseUrl || !supabaseAnonKey
    ? "Missing Supabase environment variables. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    : null;

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export function getSupabaseErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to reach Supabase. Check the project URL, anon key, and network connection.";
}
