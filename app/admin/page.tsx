"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Archive,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import {
  getSupabaseErrorMessage,
  type AppSettings,
  type LeaderboardEntry,
  type LeaderboardEvent,
  supabase,
  supabaseConfigError,
} from "@/lib/supabase";

type DraftEntry = {
  golfer_name: string;
  company_name: string;
  distance: string;
  is_active: boolean;
  thumbnail_url: string;
};

type EventDraft = {
  event_name: string;
  slug: string;
  event_subtitle: string;
  venue_name: string;
  donation_amount: string;
};

const emptyDraft: DraftEntry = {
  golfer_name: "",
  company_name: "",
  distance: "",
  is_active: true,
  thumbnail_url: "",
};

const emptyEventDraft: EventDraft = {
  event_name: "",
  slug: "",
  event_subtitle: "Indiana Sports Corp Charity Golf Tournament",
  venue_name: "The Sagamore Club of Noblesville",
  donation_amount: "0",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sortEntries(entries: LeaderboardEntry[]) {
  return [...entries].sort((a, b) => {
    if (a.distance == null && b.distance == null) {
      return a.golfer_name.localeCompare(b.golfer_name);
    }

    if (a.distance == null) return 1;
    if (b.distance == null) return -1;

    return Number(a.distance) - Number(b.distance);
  });
}

function entryToDraft(entry: LeaderboardEntry): DraftEntry {
  return {
    golfer_name: entry.golfer_name,
    company_name: entry.company_name ?? "",
    distance: entry.distance == null ? "" : String(entry.distance),
    is_active: entry.is_active,
    thumbnail_url: entry.thumbnail_url ?? "",
  };
}

function draftToPayload(draft: DraftEntry) {
  return {
    golfer_name: draft.golfer_name.trim(),
    company_name: draft.company_name.trim() || null,
    distance: draft.distance.trim() === "" ? null : Number(draft.distance),
    is_active: draft.is_active,
    thumbnail_url: draft.thumbnail_url.trim() || null,
    updated_at: new Date().toISOString(),
  };
}

function eventDraftToPayload(draft: EventDraft) {
  return {
    event_name: draft.event_name.trim(),
    slug: draft.slug.trim() || slugify(draft.event_name),
    event_subtitle: draft.event_subtitle.trim() || null,
    venue_name: draft.venue_name.trim() || null,
    donation_amount:
      draft.donation_amount.trim() === ""
        ? 0
        : Number(draft.donation_amount),
    updated_at: new Date().toISOString(),
  };
}

async function runSupabaseAction<T>(
  action: () => PromiseLike<T>,
): Promise<{ data: T | null; error: string | null }> {
  try {
    return {
      data: await action(),
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: getSupabaseErrorMessage(error),
    };
  }
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [isAuthed, setIsAuthed] = useState(() => {
    if (typeof window === "undefined") return false;

    return window.localStorage.getItem("prxy-admin-authed") === "true";
  });
  const [events, setEvents] = useState<LeaderboardEvent[]>([]);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [eventDraft, setEventDraft] = useState<EventDraft>(emptyEventDraft);
  const [companyLogoUrl, setCompanyLogoUrl] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftEntry>>({});
  const [newEntry, setNewEntry] = useState<DraftEntry>(emptyDraft);
  const [archiveName, setArchiveName] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingEvent, setSavingEvent] = useState(false);
  const [savingCompanyLogo, setSavingCompanyLogo] = useState(false);
  const [savingQrCode, setSavingQrCode] = useState(false);
  const [uploadingCompanyLogo, setUploadingCompanyLogo] = useState(false);
  const [uploadingQrCode, setUploadingQrCode] = useState(false);
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentEvent = useMemo(
    () => events.find((event) => event.id === currentEventId) ?? null,
    [currentEventId, events],
  );

  const activeCount = useMemo(
    () => entries.filter((entry) => entry.is_active).length,
    [entries],
  );

  async function uploadPlayerPhoto(entry: LeaderboardEntry, file: File | null) {
    if (!file) return;

    if (!supabase || !currentEventId) {
      setError(supabase ? "Select an active event first." : supabaseConfigError);
      return;
    }

    const client = supabase;
    setUploadingPhotoId(entry.id);
    setError(null);
    setMessage(null);

    const extension = file.name.split(".").pop() || "jpg";
    const path = `player-photos/${currentEventId}/${entry.id}/${crypto.randomUUID()}.${extension}`;
    const { data: uploadResponse, error: uploadNetworkError } =
      await runSupabaseAction(() =>
        client.storage.from("shot-videos").upload(path, file, {
          cacheControl: "3600",
          contentType: file.type || undefined,
          upsert: false,
        }),
      );

    const uploadError = uploadNetworkError ?? uploadResponse?.error?.message;

    if (uploadError) {
      setUploadingPhotoId(null);
      setError(uploadError);
      return;
    }

    const { data } = client.storage.from("shot-videos").getPublicUrl(path);
    updateDraft(entry.id, { thumbnail_url: data.publicUrl });

    const { error: updateError } = await runSupabaseAction(() =>
      client
        .from("leaderboard_entries")
        .update({
          thumbnail_url: data.publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", entry.id)
        .throwOnError(),
    );

    setUploadingPhotoId(null);

    if (updateError) {
      setError(updateError);
      return;
    }

    setMessage("Player photo uploaded.");
    await loadAdminState();
  }

  async function uploadCompanyLogo(file: File | null) {
    if (!file) return;

    if (!supabase) {
      setError(supabaseConfigError);
      return;
    }

    const client = supabase;
    setUploadingCompanyLogo(true);
    setError(null);
    setMessage(null);

    const extension = file.name.split(".").pop() || "png";
    const path = `company-logo/${crypto.randomUUID()}.${extension}`;
    const { data: uploadResponse, error: uploadNetworkError } =
      await runSupabaseAction(() =>
        client.storage.from("shot-videos").upload(path, file, {
          cacheControl: "3600",
          contentType: file.type || undefined,
          upsert: false,
        }),
      );

    const uploadError = uploadNetworkError ?? uploadResponse?.error?.message;

    if (uploadError) {
      setUploadingCompanyLogo(false);
      setError(uploadError);
      return;
    }

    const { data } = client.storage.from("shot-videos").getPublicUrl(path);
    setCompanyLogoUrl(data.publicUrl);

    const { error: saveError } = await saveCompanyLogo(data.publicUrl);
    setUploadingCompanyLogo(false);

    if (saveError) {
      setError(saveError);
      return;
    }

    setMessage("Company logo uploaded.");
  }

  async function uploadQrCode(file: File | null) {
    if (!file) return;

    if (!supabase) {
      setError(supabaseConfigError);
      return;
    }

    const client = supabase;
    setUploadingQrCode(true);
    setError(null);
    setMessage(null);

    const extension = file.name.split(".").pop() || "png";
    const path = `qr-codes/${crypto.randomUUID()}.${extension}`;
    const { data: uploadResponse, error: uploadNetworkError } =
      await runSupabaseAction(() =>
        client.storage.from("shot-videos").upload(path, file, {
          cacheControl: "3600",
          contentType: file.type || undefined,
          upsert: false,
        }),
      );

    const uploadError = uploadNetworkError ?? uploadResponse?.error?.message;

    if (uploadError) {
      setUploadingQrCode(false);
      setError(uploadError);
      return;
    }

    const { data } = client.storage.from("shot-videos").getPublicUrl(path);
    setQrCodeUrl(data.publicUrl);

    const { error: saveError } = await saveQrCode(data.publicUrl);
    setUploadingQrCode(false);

    if (saveError) {
      setError(saveError);
      return;
    }

    setMessage("QR code uploaded.");
  }

  async function saveCompanyLogo(nextLogoUrl = companyLogoUrl) {
    if (!supabase) {
      return {
        error: supabaseConfigError,
      };
    }

    setSavingCompanyLogo(true);
    setError(null);
    setMessage(null);

    const client = supabase;
    const { error: saveError } = await runSupabaseAction(() =>
      client
        .from("app_settings")
        .upsert({
          id: 1,
          company_logo_url: nextLogoUrl.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .throwOnError(),
    );

    setSavingCompanyLogo(false);

    if (saveError) {
      return {
        error: saveError,
      };
    }

    setMessage("Company logo saved.");
    await loadAdminState();

    return {
      error: null,
    };
  }

  async function saveQrCode(nextQrCodeUrl = qrCodeUrl) {
    if (!supabase) {
      return {
        error: supabaseConfigError,
      };
    }

    setSavingQrCode(true);
    setError(null);
    setMessage(null);

    const client = supabase;
    const { error: saveError } = await runSupabaseAction(() =>
      client
        .from("app_settings")
        .upsert({
          id: 1,
          qr_code_url: nextQrCodeUrl.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .throwOnError(),
    );

    setSavingQrCode(false);

    if (saveError) {
      return {
        error: saveError,
      };
    }

    setMessage("QR code saved.");
    await loadAdminState();

    return {
      error: null,
    };
  }

  async function loadAdminState() {
    if (!supabase) {
      setError(supabaseConfigError);
      setLoading(false);
      return;
    }

    const client = supabase;
    const { data: eventResponse, error: eventsError } =
      await runSupabaseAction(() =>
        client
          .from("leaderboard_events")
          .select("*")
          .order("created_at", { ascending: false })
          .throwOnError(),
      );

    if (eventsError) {
      setError(eventsError);
      setLoading(false);
      return;
    }

    const eventRows = (eventResponse?.data ?? []) as LeaderboardEvent[];
    setEvents(eventRows);

    const { data: settingsResponse, error: settingsError } =
      await runSupabaseAction(() =>
        client
          .from("app_settings")
          .select("*")
          .eq("id", 1)
          .maybeSingle()
          .throwOnError(),
      );

    if (settingsError) {
      setError(settingsError);
      setLoading(false);
      return;
    }

    const settings = settingsResponse?.data as AppSettings | null;
    setCompanyLogoUrl(settings?.company_logo_url ?? "");
    setQrCodeUrl(settings?.qr_code_url ?? "");
    const selectedId = settings?.current_event_id ?? null;
    setCurrentEventId(selectedId);

    if (!selectedId) {
      setEntries([]);
      setDrafts({});
      setArchiveName("");
      setError(null);
      setLoading(false);
      return;
    }

    const selectedEvent =
      eventRows.find((event) => event.id === selectedId) ?? null;
    setArchiveName(selectedEvent?.event_name ?? "");

    const { data: entryResponse, error: entriesError } =
      await runSupabaseAction(() =>
        client
          .from("leaderboard_entries")
          .select("*")
          .eq("event_id", selectedId)
          .throwOnError(),
      );

    if (entriesError) {
      setError(entriesError);
      setLoading(false);
      return;
    }

    const nextEntries = sortEntries(
      (entryResponse?.data ?? []) as LeaderboardEntry[],
    );
    setEntries(nextEntries);
    setDrafts(
      Object.fromEntries(
        nextEntries.map((entry) => [entry.id, entryToDraft(entry)]),
      ),
    );
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    if (!isAuthed) return;

    const client = supabase;

    if (!client) {
      void Promise.resolve().then(() => {
        setError(supabaseConfigError);
        setLoading(false);
      });
      return;
    }

    void Promise.resolve().then(loadAdminState);

    const channel = client
      .channel("admin-event-control")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leaderboard_entries" },
        () => {
          void loadAdminState();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leaderboard_events" },
        () => {
          void loadAdminState();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings" },
        () => {
          void loadAdminState();
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [isAuthed]);

  function updateDraft(id: string, patch: Partial<DraftEntry>) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...current[id],
        ...patch,
      },
    }));
  }

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password === process.env.NEXT_PUBLIC_ADMIN_PASSWORD) {
      window.localStorage.setItem("prxy-admin-authed", "true");
      setIsAuthed(true);
      setError(null);
      return;
    }

    setError("Incorrect admin password.");
  }

  async function selectCurrentEvent(eventId: string) {
    if (!supabase) {
      setError(supabaseConfigError);
      return;
    }

    setError(null);
    setMessage(null);
    const client = supabase;
    const { error: settingsError } = await runSupabaseAction(() =>
      client
        .from("app_settings")
        .upsert({
          id: 1,
          current_event_id: eventId,
          updated_at: new Date().toISOString(),
        })
        .throwOnError(),
    );

    if (settingsError) {
      setError(settingsError);
      return;
    }

    setCurrentEventId(eventId);
    setMessage("Active event updated.");
    await loadAdminState();
  }

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!supabase) {
      setError(supabaseConfigError);
      return;
    }

    const payload = eventDraftToPayload(eventDraft);

    if (!payload.event_name) {
      setError("Event name is required.");
      return;
    }

    if (!payload.slug) {
      setError("Event slug is required.");
      return;
    }

    setSavingEvent(true);
    const client = supabase;
    const { data: response, error: createError } = await runSupabaseAction(() =>
      client
        .from("leaderboard_events")
        .insert(payload)
        .select("id")
        .single()
        .throwOnError(),
    );

    if (createError || !response?.data?.id) {
      setSavingEvent(false);
      setError(createError ?? "Could not create event.");
      return;
    }

    const newEventId = response.data.id;

    setSavingEvent(false);
    setEventDraft(emptyEventDraft);
    await selectCurrentEvent(newEventId);
    setMessage("Event created and selected.");
  }

  async function updateCurrentEvent() {
    if (!supabase || !currentEvent) {
      setError(supabase ? "Select an event first." : supabaseConfigError);
      return;
    }

    setError(null);
    setMessage(null);

    const normalizedSlug = slugify(currentEvent.slug);

    if (!normalizedSlug) {
      setError("Event slug is required.");
      return;
    }

    setSavingEvent(true);

    const client = supabase;
    const { error: updateError } = await runSupabaseAction(() =>
      client
        .from("leaderboard_events")
        .update({
          event_name: currentEvent.event_name,
          slug: normalizedSlug,
          event_subtitle: currentEvent.event_subtitle,
          venue_name: currentEvent.venue_name,
          donation_amount: currentEvent.donation_amount ?? 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentEvent.id)
        .throwOnError(),
    );

    setSavingEvent(false);

    if (updateError) {
      setError(updateError);
      return;
    }

    setMessage("Event details saved.");
    await loadAdminState();
  }

  function patchCurrentEvent(patch: Partial<LeaderboardEvent>) {
    if (!currentEvent) return;

    setEvents((current) =>
      current.map((event) =>
        event.id === currentEvent.id ? { ...event, ...patch } : event,
      ),
    );
  }

  async function addPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!supabase || !currentEventId) {
      setError(supabase ? "Select an active event first." : supabaseConfigError);
      return;
    }

    const client = supabase;

    if (!newEntry.golfer_name.trim()) {
      setError("Golfer name is required.");
      return;
    }

    const { error: networkError } = await runSupabaseAction(() =>
      client
        .from("leaderboard_entries")
        .insert({
          ...draftToPayload(newEntry),
          event_id: currentEventId,
          rank: null,
          created_at: new Date().toISOString(),
        })
        .throwOnError(),
    );

    if (networkError) {
      setError(networkError);
      return;
    }

    setNewEntry(emptyDraft);
    setMessage("Player added.");
    await loadAdminState();
  }

  async function savePlayer(id: string) {
    const draft = drafts[id];
    if (!draft) return;

    if (!supabase) {
      setError(supabaseConfigError);
      return;
    }

    const client = supabase;

    if (!draft.golfer_name.trim()) {
      setError("Golfer name is required.");
      return;
    }

    setSavingId(id);
    setError(null);
    setMessage(null);

    const { error: networkError } = await runSupabaseAction(() =>
      client
        .from("leaderboard_entries")
        .update(draftToPayload(draft))
        .eq("id", id)
        .throwOnError(),
    );

    setSavingId(null);

    if (networkError) {
      setError(networkError);
      return;
    }

    setMessage("Player saved.");
    await loadAdminState();
  }

  async function toggleActive(entry: LeaderboardEntry) {
    if (!supabase) {
      setError(supabaseConfigError);
      return;
    }

    const client = supabase;
    const draft = drafts[entry.id] ?? entryToDraft(entry);
    updateDraft(entry.id, { is_active: !draft.is_active });

    const { error: networkError } = await runSupabaseAction(() =>
      client
        .from("leaderboard_entries")
        .update({
          is_active: !draft.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", entry.id)
        .throwOnError(),
    );

    if (networkError) {
      setError(networkError);
      updateDraft(entry.id, { is_active: draft.is_active });
      return;
    }

    await loadAdminState();
  }

  async function finalizeEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!supabase || !currentEvent) {
      setError(supabase ? "Select an active event first." : supabaseConfigError);
      return;
    }

    const client = supabase;
    const name = archiveName.trim() || currentEvent.event_name;
    const activeEntries = sortEntries(entries.filter((entry) => entry.is_active));

    if (activeEntries.length === 0) {
      setError("There are no active players to archive.");
      return;
    }

    const confirmed = window.confirm(
      `Finalize "${name}" with ${activeEntries.length} active players?`,
    );

    if (!confirmed) return;

    setArchiving(true);

    const { data: archiveResponse, error: archiveError } =
      await runSupabaseAction(() =>
        client
          .from("event_archives")
          .insert({
            event_id: currentEvent.id,
            event_name: name,
            event_subtitle: currentEvent.event_subtitle,
            venue_name: currentEvent.venue_name,
            finalized_at: new Date().toISOString(),
          })
          .select("id")
          .single()
          .throwOnError(),
      );

    if (archiveError || !archiveResponse?.data?.id) {
      setArchiving(false);
      setError(archiveError ?? "Could not create archive.");
      return;
    }

    const archiveId = archiveResponse.data.id;
    const archivedRows = activeEntries.map((entry, index) => ({
      archive_id: archiveId,
      final_rank: index + 1,
      golfer_name: entry.golfer_name,
      company_name: entry.company_name,
      distance: entry.distance,
      thumbnail_url: entry.thumbnail_url,
    }));

    const { error: entriesError } = await runSupabaseAction(() =>
      client
        .from("archived_leaderboard_entries")
        .insert(archivedRows)
        .throwOnError(),
    );

    setArchiving(false);

    if (entriesError) {
      setError(entriesError);
      return;
    }

    setMessage(`Archived ${activeEntries.length} players for "${name}".`);
  }

  async function deletePlayer(entry: LeaderboardEntry) {
    if (!supabase) {
      setError(supabaseConfigError);
      return;
    }

    const client = supabase;
    const confirmed = window.confirm(
      `Delete ${entry.golfer_name} from this event?`,
    );

    if (!confirmed) return;

    setSavingId(entry.id);
    setError(null);
    setMessage(null);

    const { error: networkError } = await runSupabaseAction(() =>
      client
        .from("leaderboard_entries")
        .delete()
        .eq("id", entry.id)
        .throwOnError(),
    );

    setSavingId(null);

    if (networkError) {
      setError(networkError);
      return;
    }

    setMessage("Player deleted.");
    await loadAdminState();
  }

  if (!isAuthed) {
    return (
      <main className="grid min-h-screen place-items-center bg-black px-4 text-white">
        <form
          className="w-full max-w-sm border border-white/15 bg-[#080808] p-5"
          onSubmit={handleLogin}
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center bg-[#E53935]">
              <Lock aria-hidden="true" className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black uppercase">Admin</h1>
              <p className="text-sm font-semibold text-white/50">
                PRXY Event Leaderboard
              </p>
            </div>
          </div>
          <label className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-white/50">
            Password
          </label>
          <input
            className="mb-4 h-14 w-full border border-white/20 bg-black px-4 text-lg font-bold text-white outline-none focus:border-[#E53935]"
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
          {error ? (
            <p className="mb-4 border border-[#E53935]/60 bg-[#E53935]/10 p-3 text-sm font-bold">
              {error}
            </p>
          ) : null}
          <button
            className="flex h-14 w-full items-center justify-center gap-2 bg-[#E53935] text-base font-black uppercase text-white"
            type="submit"
          >
            Unlock
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 py-5 text-white sm:px-6">
      <section className="mx-auto max-w-5xl">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-white/15 pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#E53935]">
              PRXY Admin
            </p>
            <h1 className="mt-1 text-4xl font-black uppercase leading-none">
              Event Control
            </h1>
          </div>
          <div className="border border-white/15 px-4 py-2 text-sm font-black uppercase text-white/70">
            {activeCount} active
          </div>
        </header>

        {error ? (
          <div className="mb-4 border border-[#E53935]/60 bg-[#E53935]/10 p-4 text-sm font-bold">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="mb-4 border border-white/15 bg-white/10 p-4 text-sm font-bold">
            {message}
          </div>
        ) : null}

        <section className="mb-5 border border-white/15 bg-[#080808] p-4">
          <div className="mb-3 text-sm font-black uppercase tracking-[0.14em] text-white/60">
            Company Logo
          </div>
          <div className="mb-3 flex min-h-28 items-center justify-center border border-white/15 bg-black p-4">
            {companyLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="Company logo preview"
                className="max-h-24 max-w-full object-contain"
                src={companyLogoUrl}
              />
            ) : (
              <span className="text-sm font-black uppercase tracking-[0.14em] text-white/35">
                No company logo uploaded
              </span>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input
              className="h-13 border border-white/20 bg-black px-3 font-bold text-white outline-none focus:border-[#E53935]"
              onChange={(event) => setCompanyLogoUrl(event.target.value)}
              placeholder="Company logo URL"
              value={companyLogoUrl}
            />
            <label className="flex h-13 cursor-pointer items-center justify-center gap-2 border border-white/20 bg-black px-4 font-black uppercase text-white/80">
              {uploadingCompanyLogo ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Upload aria-hidden="true" className="h-4 w-4" />
              )}
              Upload Logo
              <input
                accept="image/*"
                className="sr-only"
                disabled={uploadingCompanyLogo}
                onChange={(event) =>
                  void uploadCompanyLogo(event.target.files?.[0] ?? null)
                }
                type="file"
              />
            </label>
            <button
              className="flex h-13 items-center justify-center gap-2 bg-[#E53935] px-5 font-black uppercase text-white disabled:opacity-50"
              disabled={savingCompanyLogo || uploadingCompanyLogo}
              onClick={() => void saveCompanyLogo()}
              type="button"
            >
              {savingCompanyLogo ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Save aria-hidden="true" className="h-4 w-4" />
              )}
              Save Logo
            </button>
          </div>
        </section>

        <section className="mb-5 border border-white/15 bg-[#080808] p-4">
          <div className="mb-3 text-sm font-black uppercase tracking-[0.14em] text-white/60">
            Public Leaderboard QR Code
          </div>
          <p className="mb-3 text-sm font-semibold leading-6 text-white/50">
            Upload the QR image that should appear in the top-right of the
            public rankings page.
          </p>
          <div className="mb-3 flex min-h-32 items-center justify-center border border-white/15 bg-black p-4">
            {qrCodeUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="QR code preview"
                className="max-h-28 max-w-full object-contain"
                src={qrCodeUrl}
              />
            ) : (
              <span className="text-sm font-black uppercase tracking-[0.14em] text-white/35">
                No QR code uploaded
              </span>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input
              className="h-13 border border-white/20 bg-black px-3 font-bold text-white outline-none focus:border-[#E53935]"
              onChange={(event) => setQrCodeUrl(event.target.value)}
              placeholder="QR code image URL"
              value={qrCodeUrl}
            />
            <label className="flex h-13 cursor-pointer items-center justify-center gap-2 border border-white/20 bg-black px-4 font-black uppercase text-white/80">
              {uploadingQrCode ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Upload aria-hidden="true" className="h-4 w-4" />
              )}
              Upload QR
              <input
                accept="image/*"
                className="sr-only"
                disabled={uploadingQrCode}
                onChange={(event) =>
                  void uploadQrCode(event.target.files?.[0] ?? null)
                }
                type="file"
              />
            </label>
            <button
              className="flex h-13 items-center justify-center gap-2 bg-[#E53935] px-5 font-black uppercase text-white disabled:opacity-50"
              disabled={savingQrCode || uploadingQrCode}
              onClick={() => void saveQrCode()}
              type="button"
            >
              {savingQrCode ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Save aria-hidden="true" className="h-4 w-4" />
              )}
              Save QR
            </button>
          </div>
        </section>

        <section className="mb-5 border border-white/15 bg-[#080808] p-4">
          <div className="mb-3 text-sm font-black uppercase tracking-[0.14em] text-white/60">
            Active Event
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <select
              className="h-13 border border-white/20 bg-black px-3 font-bold text-white outline-none focus:border-[#E53935]"
              onChange={(event) => void selectCurrentEvent(event.target.value)}
              value={currentEventId ?? ""}
            >
              <option value="" disabled>
                Select an event
              </option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.event_name}
                </option>
              ))}
            </select>
            <button
              className="flex h-13 items-center justify-center gap-2 border border-white/20 px-5 font-black uppercase text-white/80"
              onClick={() => void loadAdminState()}
              type="button"
            >
              Refresh
            </button>
          </div>

          {currentEvent ? (
            <div className="mt-4 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  className="h-13 border border-white/20 bg-black px-3 font-bold text-white outline-none focus:border-[#E53935]"
                  onChange={(event) => {
                    const nextName = event.target.value;
                    patchCurrentEvent({
                      event_name: nextName,
                      slug: currentEvent.slug || slugify(nextName),
                    });
                  }}
                  placeholder="Event name"
                  value={currentEvent.event_name}
                />
                <input
                  className="h-13 border border-white/20 bg-black px-3 font-bold text-white outline-none focus:border-[#E53935]"
                  onChange={(event) =>
                    patchCurrentEvent({ event_subtitle: event.target.value })
                  }
                  placeholder="Subtitle"
                  value={currentEvent.event_subtitle ?? ""}
                />
                <input
                  className="h-13 border border-white/20 bg-black px-3 font-bold text-white outline-none focus:border-[#E53935]"
                  onChange={(event) =>
                    patchCurrentEvent({ venue_name: event.target.value })
                  }
                  placeholder="Venue"
                  value={currentEvent.venue_name ?? ""}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
                <label className="block">
                  <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-white/45">
                    Public URL Slug
                  </span>
                  <input
                    className="h-13 w-full border border-white/20 bg-black px-3 font-bold text-white outline-none focus:border-[#E53935]"
                    onChange={(event) =>
                      patchCurrentEvent({ slug: slugify(event.target.value) })
                    }
                    placeholder="indianasportscorp"
                    value={currentEvent.slug ?? ""}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-[#42BD33]/80">
                    Funds Raised
                  </span>
                  <input
                    className="h-13 w-full border border-[#42BD33]/40 bg-black px-3 font-bold text-[#D8FFD3] outline-none focus:border-[#42BD33]"
                    inputMode="decimal"
                    min="0"
                    onChange={(event) =>
                      patchCurrentEvent({
                        donation_amount:
                          event.target.value === ""
                            ? null
                            : Number(event.target.value),
                      })
                    }
                    placeholder="0"
                    step="1"
                    type="number"
                    value={currentEvent.donation_amount ?? ""}
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr]">
                <label className="block">
                  <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-white/45">
                    Public Leaderboard URL
                  </span>
                  <input
                    className="h-13 w-full border border-white/20 bg-black px-3 font-bold text-white/60 outline-none"
                    readOnly
                    value={`/${currentEvent.slug || "event-slug"}`}
                  />
                </label>
              </div>
              <div className="grid gap-3">
                <button
                  className="flex h-13 items-center justify-center gap-2 bg-[#E53935] px-5 font-black uppercase text-white disabled:opacity-50"
                  disabled={savingEvent}
                  onClick={() => void updateCurrentEvent()}
                  type="button"
                >
                  {savingEvent ? (
                    <Loader2
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin"
                    />
                  ) : (
                    <Save aria-hidden="true" className="h-4 w-4" />
                  )}
                  Save Event Updates
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <form
          className="mb-5 border border-white/15 bg-[#080808] p-4"
          onSubmit={createEvent}
        >
          <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-white/60">
            <Plus aria-hidden="true" className="h-4 w-4 text-[#E53935]" />
            New Event
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className="h-13 border border-white/20 bg-black px-3 font-bold text-white outline-none focus:border-[#E53935]"
              onChange={(event) => {
                const nextName = event.target.value;
                setEventDraft((current) => ({
                  ...current,
                  event_name: nextName,
                  slug: current.slug || slugify(nextName),
                }));
              }}
              placeholder="Event name"
              value={eventDraft.event_name}
            />
            <input
              className="h-13 border border-white/20 bg-black px-3 font-bold text-white outline-none focus:border-[#E53935]"
              onChange={(event) =>
                setEventDraft((current) => ({
                  ...current,
                  slug: slugify(event.target.value),
                }))
              }
              placeholder="Public URL slug"
              value={eventDraft.slug}
            />
            <input
              className="h-13 border border-white/20 bg-black px-3 font-bold text-white outline-none focus:border-[#E53935]"
              onChange={(event) =>
                setEventDraft((current) => ({
                  ...current,
                  event_subtitle: event.target.value,
                }))
              }
              placeholder="Subtitle"
              value={eventDraft.event_subtitle}
            />
            <input
              className="h-13 border border-white/20 bg-black px-3 font-bold text-white outline-none focus:border-[#E53935]"
              onChange={(event) =>
                setEventDraft((current) => ({
                  ...current,
                  venue_name: event.target.value,
                }))
              }
              placeholder="Venue"
              value={eventDraft.venue_name}
            />
            <input
              className="h-13 border border-[#42BD33]/40 bg-black px-3 font-bold text-[#D8FFD3] outline-none focus:border-[#42BD33]"
              inputMode="decimal"
              min="0"
              onChange={(event) =>
                setEventDraft((current) => ({
                  ...current,
                  donation_amount: event.target.value,
                }))
              }
              placeholder="Donations earned"
              step="1"
              type="number"
              value={eventDraft.donation_amount}
            />
          </div>
          <button
            className="mt-3 flex h-13 w-full items-center justify-center gap-2 bg-[#E53935] px-5 font-black uppercase text-white disabled:opacity-50"
            disabled={savingEvent}
            type="submit"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            Create And Select Event
          </button>
        </form>

        <form
          className="mb-5 border border-white/15 bg-[#080808] p-4"
          onSubmit={finalizeEvent}
        >
          <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-white/60">
            <Archive aria-hidden="true" className="h-4 w-4 text-[#E53935]" />
            Event Archive
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              className="h-13 border border-white/20 bg-black px-3 font-bold text-white outline-none focus:border-[#E53935]"
              onChange={(event) => setArchiveName(event.target.value)}
              placeholder="Archive name"
              value={archiveName}
            />
            <button
              className="flex h-13 items-center justify-center gap-2 border border-[#E53935] bg-[#E53935] px-5 font-black uppercase text-white disabled:opacity-50"
              disabled={archiving || activeCount === 0 || !currentEvent}
              type="submit"
            >
              {archiving ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Archive aria-hidden="true" className="h-4 w-4" />
              )}
              Finalize Event
            </button>
          </div>
        </form>

        <form
          className="sticky top-0 z-20 mb-5 border border-[#E53935]/50 bg-[#080808] p-4 shadow-2xl shadow-black"
          onSubmit={addPlayer}
        >
          <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-white/60">
            <Plus aria-hidden="true" className="h-4 w-4 text-[#E53935]" />
            Add Player {currentEvent ? `to ${currentEvent.event_name}` : ""}
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_140px_auto]">
            <input
              className="h-13 border border-white/20 bg-black px-3 font-bold text-white outline-none focus:border-[#E53935]"
              onChange={(event) =>
                setNewEntry((current) => ({
                  ...current,
                  golfer_name: event.target.value,
                }))
              }
              placeholder="Golfer name"
              value={newEntry.golfer_name}
            />
            <input
              className="h-13 border border-white/20 bg-black px-3 font-bold text-white outline-none focus:border-[#E53935]"
              onChange={(event) =>
                setNewEntry((current) => ({
                  ...current,
                  company_name: event.target.value,
                }))
              }
              placeholder="Company / team"
              value={newEntry.company_name}
            />
            <input
              className="h-13 border border-white/20 bg-black px-3 font-bold text-white outline-none focus:border-[#E53935]"
              inputMode="decimal"
              onChange={(event) =>
                setNewEntry((current) => ({
                  ...current,
                  distance: event.target.value,
                }))
              }
              placeholder="Feet"
              value={newEntry.distance}
            />
            <button
              className="flex h-13 items-center justify-center gap-2 bg-[#E53935] px-5 font-black uppercase text-white disabled:opacity-50"
              disabled={!currentEvent}
              type="submit"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              Add
            </button>
          </div>
        </form>

        {loading ? (
          <div className="grid min-h-80 place-items-center text-white/55">
            <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin" />
          </div>
        ) : !currentEvent ? (
          <div className="border border-dashed border-white/20 p-8 text-center text-lg font-bold text-white/50">
            Create or select an event to manage players.
          </div>
        ) : entries.length === 0 ? (
          <div className="border border-dashed border-white/20 p-8 text-center text-lg font-bold text-white/50">
            No players yet for this event.
          </div>
        ) : (
          <div className="grid gap-4">
            {entries.map((entry) => {
              const draft = drafts[entry.id] ?? entryToDraft(entry);
              const isBusy =
                savingId === entry.id ||
                uploadingPhotoId === entry.id ||
                archiving;

              return (
                <article
                  className="border border-white/15 bg-[#080808] p-4"
                  key={entry.id}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#E53935]">
                        {draft.distance
                          ? `${Number(draft.distance).toFixed(1)} FT`
                          : "No distance"}
                      </p>
                      <h2 className="text-2xl font-black uppercase">
                        {draft.golfer_name || "Unnamed Player"}
                      </h2>
                    </div>
                    <button
                      aria-label={
                        draft.is_active ? "Set inactive" : "Set active"
                      }
                      className={`grid h-12 w-12 place-items-center border ${
                        draft.is_active
                          ? "border-[#E53935] bg-[#E53935] text-white"
                          : "border-white/20 text-white/50"
                      }`}
                      onClick={() => void toggleActive(entry)}
                      type="button"
                    >
                      {draft.is_active ? (
                        <Eye aria-hidden="true" className="h-5 w-5" />
                      ) : (
                        <EyeOff aria-hidden="true" className="h-5 w-5" />
                      )}
                    </button>
                  </div>

                  <div className="mb-3 flex min-h-36 items-center justify-center border border-white/15 bg-black p-3">
                    {draft.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={`${draft.golfer_name || "Player"} result preview`}
                        className="max-h-40 w-full object-contain"
                        src={draft.thumbnail_url}
                      />
                    ) : (
                      <span className="text-sm font-black uppercase tracking-[0.14em] text-white/35">
                        No player photo uploaded
                      </span>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-white/45">
                        Player
                      </span>
                      <input
                        className="h-13 w-full border border-white/20 bg-black px-3 font-bold text-white outline-none focus:border-[#E53935]"
                        onChange={(event) =>
                          updateDraft(entry.id, {
                            golfer_name: event.target.value,
                          })
                        }
                        value={draft.golfer_name}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-white/45">
                        Company
                      </span>
                      <input
                        className="h-13 w-full border border-white/20 bg-black px-3 font-bold text-white outline-none focus:border-[#E53935]"
                        onChange={(event) =>
                          updateDraft(entry.id, {
                            company_name: event.target.value,
                          })
                        }
                        value={draft.company_name}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-white/45">
                        Distance
                      </span>
                      <input
                        className="h-13 w-full border border-white/20 bg-black px-3 font-bold text-white outline-none focus:border-[#E53935]"
                        inputMode="decimal"
                        onChange={(event) =>
                          updateDraft(entry.id, {
                            distance: event.target.value,
                          })
                        }
                        value={draft.distance}
                      />
                    </label>
                  </div>

                  <label className="mt-3 block">
                    <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-white/45">
                      Photo URL
                    </span>
                    <input
                      className="h-13 w-full border border-white/20 bg-black px-3 font-bold text-white outline-none focus:border-[#E53935]"
                      onChange={(event) =>
                        updateDraft(entry.id, {
                          thumbnail_url: event.target.value,
                        })
                      }
                      placeholder="Public image URL"
                      value={draft.thumbnail_url}
                    />
                  </label>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
                    <label className="flex h-13 cursor-pointer items-center justify-center gap-2 border border-white/20 bg-black px-4 font-black uppercase text-white/80">
                      {uploadingPhotoId === entry.id ? (
                        <Loader2
                          aria-hidden="true"
                          className="h-4 w-4 animate-spin"
                        />
                      ) : (
                        <Upload aria-hidden="true" className="h-4 w-4" />
                      )}
                      Upload Photo
                      <input
                        accept="image/*"
                        className="sr-only"
                        disabled={isBusy}
                        onChange={(event) =>
                          void uploadPlayerPhoto(
                            entry,
                            event.target.files?.[0] ?? null,
                          )
                        }
                        type="file"
                      />
                    </label>
                    <button
                      className="flex h-13 items-center justify-center gap-2 bg-[#E53935] px-5 font-black uppercase text-white disabled:opacity-50"
                      disabled={isBusy}
                      onClick={() => void savePlayer(entry.id)}
                      type="button"
                    >
                      {savingId === entry.id ? (
                        <Loader2
                          aria-hidden="true"
                          className="h-4 w-4 animate-spin"
                        />
                      ) : (
                        <Save aria-hidden="true" className="h-4 w-4" />
                      )}
                      Save
                    </button>
                    <button
                      className="flex h-13 items-center justify-center gap-2 border border-white/20 px-5 font-black uppercase text-white/80 disabled:opacity-50"
                      disabled={isBusy}
                      onClick={() => void deletePlayer(entry)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
