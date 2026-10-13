import { NotPorted } from "@/components/not-ported";

export default function Page() {
  return (
    <NotPorted
      breadcrumb={["Portfolio", "Bucket Tracker"]}
      title="Bucket Tracker"
      summary="Named baskets of funds with weights, tracked from a chosen start date to today."
      doesToday={[
        "Creates, switches and deletes named fund buckets.",
        "Sets the date the investment started; the tracker then runs to today automatically.",
        "Adds and removes funds and sets each one's weight within the bucket.",
      ]}
    />
  );
}
