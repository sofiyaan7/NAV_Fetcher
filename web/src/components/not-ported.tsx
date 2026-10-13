import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";

/**
 * An honest placeholder. These pages exist in the Streamlit app and have not
 * been ported yet; saying so beats a 404 or a convincing-looking empty screen.
 */
export function NotPorted({
  breadcrumb, title, summary, doesToday,
}: {
  breadcrumb: string[];
  title: string;
  summary: string;
  doesToday: string[];
}) {
  return (
    <>
      <SiteHeader breadcrumb={breadcrumb} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-5 p-5">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
          </div>
          <Card className="border-dashed">
            <CardContent className="px-5 py-6">
              <p className="text-sm font-medium">Not ported yet</p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                This still runs in the Streamlit app. It is being moved across after
                Fund Performance. What it does today:
              </p>
              <ul className="mt-3 space-y-1.5">
                {doesToday.map((d) => (
                  <li key={d} className="flex gap-2 text-sm text-muted-foreground">
                    <span aria-hidden="true">—</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
