import { NotPorted } from "@/components/not-ported";

export default function Page() {
  return (
    <NotPorted
      breadcrumb={["System", "AUM Cache"]}
      title="AUM Cache"
      summary="The on-disk store of AMFI fund-performance answers that the backfill job fills."
      doesToday={[
        "Shows how many days of AUM have been collected and how large the cache is.",
        "Syncs the cache to and from a Hugging Face dataset so a redeploy does not lose it.",
        "Backfills slowly against AMFI's rate limits, resuming where it left off.",
      ]}
    />
  );
}
