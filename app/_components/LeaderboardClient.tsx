"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ImageIcon } from "lucide-react";
import {
  getSupabaseErrorMessage,
  type AppSettings,
  type LeaderboardEntry,
  type LeaderboardEvent,
  supabase,
  supabaseConfigError,
} from "@/lib/supabase";

function sortEntries(entries: LeaderboardEntry[]) {
  return [...entries].sort((a, b) => {
    if (a.distance == null && b.distance == null) {
      return (a.rank ?? 9999) - (b.rank ?? 9999);
    }

    if (a.distance == null) return 1;
    if (b.distance == null) return -1;

    return Number(a.distance) - Number(b.distance);
  });
}

function formatDistance(distance: number | null) {
  if (distance == null) return "--";

  return `${Number(distance).toFixed(1)} FT`;
}

function PlaceholderImage() {
  return (
    <div className="flex aspect-[4/3] min-h-20 items-center justify-center border border-white/15 bg-[linear-gradient(135deg,#171717,#050505)] text-white/45">
      <ImageIcon aria-hidden="true" className="h-8 w-8" />
    </div>
  );
}

function EventLogo({ event }: { event: LeaderboardEvent | null }) {
  if (event?.logo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={`${event.event_name} logo`}
        className="max-h-20 max-w-44 object-contain"
        src={event.logo_url}
      />
    );
  }

  return (
    <div className="border border-white/30 px-4 py-2 text-right text-xs font-bold uppercase tracking-[0.16em] text-white/85">
      Event Logo
    </div>
  );
}

export default function LeaderboardClient() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [currentEvent, setCurrentEvent] = useState<LeaderboardEvent | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadBoard() {
    if (!supabase) {
      setError(supabaseConfigError);
      setLoading(false);
      return;
    }

    try {
      const { data: settingsRow } = await supabase
        .from("app_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle()
        .throwOnError();

      const settings = settingsRow as AppSettings | null;

      if (!settings?.current_event_id) {
        setCurrentEvent(null);
        setEntries([]);
        setError(null);
        setLoading(false);
        return;
      }

      const [{ data: eventRow }, { data: entryRows }] = await Promise.all([
        supabase
          .from("leaderboard_events")
          .select("*")
          .eq("id", settings.current_event_id)
          .single()
          .throwOnError(),
        supabase
          .from("leaderboard_entries")
          .select("*")
          .eq("event_id", settings.current_event_id)
          .eq("is_active", true)
          .throwOnError(),
      ]);

      setCurrentEvent(eventRow as LeaderboardEvent);
      setEntries(sortEntries((entryRows ?? []) as LeaderboardEntry[]));
      setError(null);
      setLoading(false);
    } catch (networkError) {
      setError(getSupabaseErrorMessage(networkError));
      setLoading(false);
    }
  }

  useEffect(() => {
    const client = supabase;

    if (!client) {
      void Promise.resolve().then(() => {
        setError(supabaseConfigError);
        setLoading(false);
      });
      return;
    }

    void Promise.resolve().then(loadBoard);

    const channel = client
      .channel("public-leaderboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leaderboard_entries" },
        () => {
          void loadBoard();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leaderboard_events" },
        () => {
          void loadBoard();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings" },
        () => {
          void loadBoard();
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, []);

  const rankedEntries = useMemo(() => sortEntries(entries), [entries]);

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-8 lg:px-10">
        <header className="mb-6 border-b border-white/15 pb-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="border border-[#E53935]/70 px-4 py-2 text-sm font-black uppercase tracking-[0.2em] text-white">
              PRXY Logo
            </div>
            <EventLogo event={currentEvent} />
          </div>
          <p className="mb-2 text-sm font-black uppercase tracking-[0.32em] text-[#E53935]">
            PRXY Event Leaderboard
          </p>
          <h1 className="text-5xl font-black uppercase leading-none text-white sm:text-7xl lg:text-8xl">
            Live Leaderboard
          </h1>
          <p className="mt-4 max-w-3xl text-lg font-semibold leading-7 text-white/80 sm:text-2xl">
            {currentEvent?.event_name ?? "No Active Event Selected"}
            <span className="block text-white/60">
              {currentEvent?.venue_name ||
                currentEvent?.event_subtitle ||
                "Select an event in admin"}
            </span>
          </p>
          <Link
            className="mt-5 inline-flex min-h-10 items-center border border-white/20 px-3 text-xs font-black uppercase tracking-[0.14em] text-white/65 transition hover:border-[#E53935] hover:text-white"
            href="/archive"
          >
            Event Archive
          </Link>
        </header>

        <div className="grid grid-cols-[70px_1fr_104px_92px] border-b border-[#E53935] pb-3 text-xs font-black uppercase tracking-[0.14em] text-white/55 sm:grid-cols-[90px_1fr_140px_130px]">
          <span>Rank</span>
          <span>Golfer / Team</span>
          <span className="text-right">Distance</span>
          <span className="text-right">Image</span>
        </div>

        <div className="flex-1">
          {loading ? (
            <div className="py-16 text-center text-lg font-bold text-white/55">
              Loading leaderboard...
            </div>
          ) : error ? (
            <div className="my-8 border border-[#E53935]/60 bg-[#E53935]/10 p-5 text-sm font-semibold text-white">
              {error}
            </div>
          ) : !currentEvent ? (
            <div className="py-16 text-center text-lg font-bold text-white/55">
              No active event selected.
            </div>
          ) : rankedEntries.length === 0 ? (
            <div className="py-16 text-center text-lg font-bold text-white/55">
              No active players yet.
            </div>
          ) : (
            rankedEntries.map((entry, index) => (
              <article
                className="grid grid-cols-[70px_1fr_104px_92px] items-center gap-0 border-b border-white/10 py-4 sm:grid-cols-[90px_1fr_140px_130px] sm:py-5"
                key={entry.id}
              >
                <div className="text-4xl font-black text-[#E53935] sm:text-5xl">
                  {index + 1}
                </div>
                <div className="min-w-0 pr-3">
                  <h2 className="truncate text-xl font-black uppercase leading-tight text-white sm:text-3xl">
                    {entry.golfer_name}
                  </h2>
                  <p className="mt-1 truncate text-sm font-semibold uppercase tracking-[0.08em] text-white/50 sm:text-base">
                    {entry.company_name || "Independent Team"}
                  </p>
                </div>
                <div className="text-right text-2xl font-black text-white sm:text-4xl">
                  {formatDistance(entry.distance)}
                </div>
                <div className="pl-3">
                  {entry.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt={`${entry.golfer_name} shot thumbnail`}
                      className="aspect-[4/3] w-full object-cover"
                      src={entry.thumbnail_url}
                    />
                  ) : (
                    <PlaceholderImage />
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
