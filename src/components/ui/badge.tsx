import { cn } from "@/lib/utils";

const tones = {
  default: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  danger: "border-red-500/30 bg-red-500/10 text-red-300",
  muted: "border-slate-600 bg-slate-800 text-slate-300"
} as const;

export function Badge({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}
