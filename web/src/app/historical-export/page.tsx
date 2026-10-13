import { NotPorted } from "@/components/not-ported";

export default function Page() {
  return (
    <NotPorted
      breadcrumb={["Research", "Historical Export"]}
      title="Historical Export"
      summary="Pivoted NAV and AUM reports across a list of ISINs, written as a styled Excel workbook."
      doesToday={[
        "Takes a list of ISINs and a date range, one row per scheme and one column per date.",
        "Optionally carries NAV forward across weekends and holidays, and can skip Saturdays or Sundays.",
        "Pulls AMFI's published daily AUM and derives net flows alongside the NAV.",
        "Exports a formatted .xlsx with the corporate styling the reports use.",
      ]}
    />
  );
}
