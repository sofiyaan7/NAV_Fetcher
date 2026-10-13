import { NotPorted } from "@/components/not-ported";

export default function Page() {
  return (
    <NotPorted
      breadcrumb={["Portfolio", "MIS Generator"]}
      title="MIS Generator"
      summary="Portfolio against Nifty and against each scheme's own benchmark — for the day, the period, and since 1 April."
      doesToday={[
        "Takes the current portfolio by hand, by Excel upload, or from the saved workspace.",
        "Reads the previous portfolio from the model-portfolio rebalance history file.",
        "Resolves each scheme's benchmark to a passive index fund on the same AMFI feed, and shows N/A where it cannot.",
        "Writes the MIS workbook and a PDF, and keeps every generated report in a local history.",
      ]}
    />
  );
}
