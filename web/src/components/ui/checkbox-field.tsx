import { cn } from "@/lib/utils";

/** A labelled checkbox, matching the Streamlit st.checkbox controls one for one. */
export function CheckboxField({
  label, hint, checked, onChange, className,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <label className={cn("flex items-start gap-2 text-sm", className)}>
      <input
        type="checkbox" checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <span>
        {label}
        {hint && <span className="ml-1 text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}
