import { cn } from "@/lib/utils";

export function Vinyl({ spinning = false }: { spinning?: boolean }) {
  return (
    <div
      className={cn(
        "relative size-16 shrink-0 rounded-full border border-border bg-secondary",
        spinning && "animate-[spin_8s_linear_infinite]",
      )}
      aria-hidden="true"
    >
      <div className="absolute inset-[18%] rounded-full border border-border/80" />
      <div className="absolute inset-[32%] rounded-full border border-border/60" />
      <div className="absolute inset-[44%] rounded-full bg-primary/90" />
    </div>
  );
}
