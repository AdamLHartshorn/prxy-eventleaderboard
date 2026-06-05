"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ImageIcon, X } from "lucide-react";
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
    <div className="flex aspect-[4/3] min-h-8 items-center justify-center border border-white/15 bg-[linear-gradient(135deg,#171717,#050505)] text-white/45">
      <ImageIcon aria-hidden="true" className="h-4 w-4" />
    </div>
  );
}

function CompanyLogo({ logoUrl }: { logoUrl: string | null }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt="Company logo"
        className="max-h-24 max-w-56 object-contain"
        src={logoUrl}
      />
    );
  }

  return (
    <div className="border border-[#E53935]/70 px-4 py-2 text-sm font-black uppercase tracking-[0.2em] text-white">
      PRXY Logo
    </div>
  );
}

export default function LeaderboardClient({ slug }: { slug: string }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [currentEvent, setCurrentEvent] = useState<LeaderboardEvent | null>(
    null,
  );
  const [selectedPhoto, setSelectedPhoto] = useState<LeaderboardEntry | null>(
    null,
  );
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBoard = useCallback(async () => {
    if (!supabase) {
      setError(supabaseConfigError);
      setLoading(false);
      return;
    }

    try {
      const [{ data: settingsRow }, { data: eventRow }] = await Promise.all([
        supabase
          .from("app_settings")
          .select("*")
          .eq("id", 1)
          .maybeSingle()
          .throwOnError(),
        supabase
          .from("leaderboard_events")
          .select("*")
          .eq("slug", slug)
          .maybeSingle()
          .throwOnError(),
      ]);

      const settings = settingsRow as AppSettings | null;
      const event = eventRow as LeaderboardEvent | null;
      setCompanyLogoUrl(settings?.company_logo_url ?? null);

      if (!event) {
        setCurrentEvent(null);
        setEntries([]);
        setError(null);
        setLoading(false);
        return;
      }

      const { data: entryRows } = await supabase
        .from("leaderboard_entries")
        .select("*")
        .eq("event_id", event.id)
        .eq("is_active", true)
        .throwOnError();

      setCurrentEvent(event);
      setEntries(sortEntries((entryRows ?? []) as LeaderboardEntry[]));
      setError(null);
      setLoading(false);
    } catch (networkError) {
      setError(getSupabaseErrorMessage(networkError));
      setLoading(false);
    }
  }, [slug]);

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
  }, [loadBoard]);

  const rankedEntries = useMemo(() => sortEntries(entries), [entries]);

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-8 lg:px-10">
        <header className="mb-6 border-b border-white/15 pb-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <CompanyLogo logoUrl={companyLogoUrl} />
          </div>
          <h1 className="text-4xl font-black uppercase leading-none text-white sm:text-6xl lg:text-7xl">
            Rankings
          </h1>
          <p className="mt-4 max-w-3xl text-lg font-semibold leading-7 text-white/80 sm:text-2xl">
            {currentEvent?.event_name ?? "No Active Event Selected"}
            <span className="block text-white/60">
              {currentEvent?.venue_name ||
                currentEvent?.event_subtitle ||
                "Select an event in admin"}
            </span>
          </p>
        </header>

        <div className="grid grid-cols-[30px_minmax(0,1fr)_52px_34px] gap-x-2 border-b border-[#E53935] pb-2 text-[0.62rem] font-black uppercase tracking-[0.12em] text-white/55 sm:grid-cols-[44px_1fr_92px_52px] sm:text-xs">
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
              Event not found.
            </div>
          ) : rankedEntries.length === 0 ? (
            <div className="py-16 text-center text-lg font-bold text-white/55">
              No active players yet.
            </div>
          ) : (
            rankedEntries.map((entry, index) => (
              <article
                className="grid grid-cols-[30px_minmax(0,1fr)_52px_34px] items-center gap-x-2 border-b border-white/10 py-2.5 sm:grid-cols-[44px_1fr_92px_52px] sm:py-3"
                key={entry.id}
              >
                <div className="text-xl font-black text-[#E53935] sm:text-2xl">
                  {index + 1}
                </div>
                <div className="min-w-0 pr-1 sm:pr-3">
                  <h2 className="truncate text-base font-black uppercase leading-tight text-white sm:text-xl">
                    {entry.golfer_name}
                  </h2>
                  <p className="mt-0.5 truncate text-xs font-semibold uppercase tracking-[0.07em] text-white/50 sm:text-sm">
                    {entry.company_name || "Independent Team"}
                  </p>
                </div>
                <div className="text-right text-sm font-black text-white sm:text-xl">
                  {formatDistance(entry.distance)}
                </div>
                <div className="pl-0 sm:pl-2">
                  {entry.thumbnail_url ? (
                    <button
                      aria-label={`Open ${entry.golfer_name} photo`}
                      className="block w-full border border-transparent transition hover:border-[#E53935] focus:border-[#E53935] focus:outline-none"
                      onClick={() => setSelectedPhoto(entry)}
                      type="button"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt={`${entry.golfer_name} shot thumbnail`}
                        className="aspect-[4/3] w-full object-cover"
                        src={entry.thumbnail_url}
                      />
                    </button>
                  ) : (
                    <PlaceholderImage />
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {selectedPhoto?.thumbnail_url ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 px-4 py-6"
          role="dialog"
        >
          <div className="w-full max-w-5xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-2xl font-black uppercase text-white">
                  {selectedPhoto.golfer_name}
                </h3>
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-white/50">
                  {selectedPhoto.company_name || "Independent Team"} |{" "}
                  {formatDistance(selectedPhoto.distance)}
                </p>
              </div>
              <button
                aria-label="Close photo"
                className="grid h-12 w-12 place-items-center border border-white/20 text-white transition hover:border-[#E53935] hover:text-[#E53935]"
                onClick={() => setSelectedPhoto(null)}
                type="button"
              >
                <X aria-hidden="true" className="h-6 w-6" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={`${selectedPhoto.golfer_name} full size result`}
              className="max-h-[82vh] w-full object-contain"
              src={selectedPhoto.thumbnail_url}
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}
