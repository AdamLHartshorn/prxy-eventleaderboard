import Link from "next/link";

export default function Home() {
  return (
    <main className="grid min-h-screen place-items-center bg-black px-4 text-white">
      <section className="w-full max-w-2xl border border-white/15 bg-[#080808] p-6">
        <div className="mb-5 inline-flex border border-[#E53935]/70 px-4 py-2 text-sm font-black uppercase tracking-[0.2em]">
          PRXY Logo
        </div>
        <p className="mb-2 text-sm font-black uppercase tracking-[0.28em] text-[#E53935]">
          PRXY Event Leaderboard
        </p>
        <h1 className="text-4xl font-black uppercase leading-none sm:text-6xl">
          Event Pages
        </h1>
        <p className="mt-4 text-lg font-semibold leading-7 text-white/65">
          Each public leaderboard has its own QR-ready event URL. Create or edit
          event slugs in admin, then share links like /indianasportscorp.
        </p>
        <Link
          className="mt-6 inline-flex h-13 items-center justify-center bg-[#E53935] px-5 font-black uppercase text-white"
          href="/admin"
        >
          Admin
        </Link>
      </section>
    </main>
  );
}
