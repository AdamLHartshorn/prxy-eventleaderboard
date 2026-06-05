"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ImageIcon, Loader2 } from "lucide-react";
import {
  type ArchivedLeaderboardEntry,
  type EventArchive,
  getSupabaseErrorMessage,
  supabase,
  supabaseConfigError,
} from "@/lib/supabase";

type ArchiveWithEntries = EventArchive & {
  entries: ArchivedLeaderboardEntry[];
};

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

export default function ArchivePage() {
  const [archives, setArchives] = useState<ArchiveWithEntries[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadArchives() {
    if (!supabase) {
      setError(supabaseConfigError);
      setLoading(false);
      return;
    }

    try {
      const { data: archiveRows } = await supabase
        .from("event_archives")
        .select("*")
        .order("finalized_at", { ascending: false })
        .throwOnError();

      const archiveIds = ((archiveRows ?? []) as EventArchive[]).map(
        (archive) => archive.id,
      );

      if (archiveIds.length === 0) {
        setArchives([]);
        setError(null);
        setLoading(false);
        return;
      }

      const { data: entryRows } = await supabase
        .from("archived_leaderboard_entries")
        .select("*")
        .in("archive_id", archiveIds)
        .order("final_rank", { ascending: true })
        .throwOnError();

      const entries = (entryRows ?? []) as ArchivedLeaderboardEntry[];
      const archivesWithEntries = ((archiveRows ?? []) as EventArchive[]).map(
        (archive) => ({
          ...archive,
          entries: entries.filter((entry) => entry.archive_id === archive.id),
        }),
      );

      setArchives(archivesWithEntries);
      setError(null);
      setLoading(false);
    } catch (networkError) {
      setError(getSupabaseErrorMessage(networkError));
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(loadArchives);
  }, []);

  const latestArchive = useMemo(() => archives[0], [archives]);

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white sm:px-8">
      <section className="mx-auto max-w-5xl">
        <header className="mb-6 border-b border-white/15 pb-5">
          <Link
            className="mb-5 inline-flex min-h-10 items-center gap-2 border border-white/20 px-3 text-xs font-black uppercase tracking-[0.14em] text-white/65 transition hover:border-[#E53935] hover:text-white"
            href="/"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Live Board
          </Link>
          <p className="mb-2 text-sm font-black uppercase tracking-[0.32em] text-[#E53935]">
            PRXY Event Archive
          </p>
          <h1 className="text-5xl font-black uppercase leading-none text-white sm:text-7xl">
            Historical Results
          </h1>
          <p className="mt-4 max-w-3xl text-lg font-semibold leading-7 text-white/70">
            Finalized event snapshots for completed PRXY leaderboard outings.
          </p>
        </header>

        {loading ? (
          <div className="grid min-h-80 place-items-center text-white/55">
            <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin" />
          </div>
        ) : error ? (
          <div className="border border-[#E53935]/60 bg-[#E53935]/10 p-5 text-sm font-semibold">
            {error}
          </div>
        ) : !latestArchive ? (
          <div className="border border-dashed border-white/20 p-8 text-center text-lg font-bold text-white/50">
            No finalized events yet.
          </div>
        ) : (
          <div className="grid gap-8">
            {archives.map((archive) => (
              <section key={archive.id}>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[#E53935] pb-3">
                  <div>
                    {archive.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={`${archive.event_name} logo`}
                        className="mb-3 max-h-16 max-w-40 object-contain"
                        src={archive.logo_url}
                      />
                    ) : null}
                    <h2 className="text-3xl font-black uppercase leading-tight">
                      {archive.event_name}
                    </h2>
                    {archive.event_subtitle ? (
                      <p className="mt-1 text-sm font-semibold text-white/55">
                        {archive.event_subtitle}
                      </p>
                    ) : null}
                    {archive.venue_name ? (
                      <p className="mt-1 text-sm font-semibold text-white/40">
                        {archive.venue_name}
                      </p>
                    ) : null}
                  </div>
                  <time className="text-xs font-black uppercase tracking-[0.14em] text-white/45">
                    {new Date(archive.finalized_at).toLocaleDateString()}
                  </time>
                </div>

                <div className="grid grid-cols-[70px_1fr_104px_92px] border-b border-white/10 pb-3 text-xs font-black uppercase tracking-[0.14em] text-white/55 sm:grid-cols-[90px_1fr_140px_130px]">
                  <span>Rank</span>
                  <span>Golfer / Team</span>
                  <span className="text-right">Distance</span>
                  <span className="text-right">Image</span>
                </div>

                {archive.entries.map((entry) => (
                  <article
                    className="grid grid-cols-[70px_1fr_104px_92px] items-center border-b border-white/10 py-4 sm:grid-cols-[90px_1fr_140px_130px] sm:py-5"
                    key={entry.id}
                  >
                    <div className="text-4xl font-black text-[#E53935] sm:text-5xl">
                      {entry.final_rank}
                    </div>
                    <div className="min-w-0 pr-3">
                      <h3 className="truncate text-xl font-black uppercase leading-tight sm:text-3xl">
                        {entry.golfer_name}
                      </h3>
                      <p className="mt-1 truncate text-sm font-semibold uppercase tracking-[0.08em] text-white/50 sm:text-base">
                        {entry.company_name || "Independent Team"}
                      </p>
                    </div>
                    <div className="text-right text-2xl font-black sm:text-4xl">
                      {formatDistance(entry.distance)}
                    </div>
                    <div className="pl-3">
                      {entry.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          alt={`${entry.golfer_name} archived shot`}
                          className="aspect-[4/3] w-full object-cover"
                          src={entry.thumbnail_url}
                        />
                      ) : (
                        <PlaceholderImage />
                      )}
                    </div>
                  </article>
                ))}
              </section>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
