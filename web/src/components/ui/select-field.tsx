import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** A plain labelled select, matching the Streamlit st.selectbox controls. */
export function SelectField({
  label, value, onChange, options, className, id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  className?: string;
  id: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-xs text-muted-foreground">{label}</label>
      <div className="relative">
        <select
          id={id} value={value} onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-9 w-full appearance-none rounded-md border border-input bg-background pl-3 pr-8 text-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}
