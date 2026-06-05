import LeaderboardClient from "@/app/_components/LeaderboardClient";

type EventPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function EventPage({ params }: EventPageProps) {
  const { slug } = await params;

  return <LeaderboardClient slug={slug} />;
}
