import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { APP_NAME, VENMO_HANDLE, VENMO_URL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { DiscMark } from "@/components/mark";

export function AppHeader({
  kicker,
  booth,
  code,
}: {
  kicker?: string;
  booth?: boolean;
  code?: string;
}) {
  const brand = (
    <>
      <DiscMark className="size-7 text-foreground" />
      <span className="min-w-0">
        <span className="font-display block text-xl leading-none font-semibold tracking-tight">
          {APP_NAME}
        </span>
        {kicker ? (
          <span className="mt-0.5 block truncate text-xs tracking-wide text-muted-foreground uppercase">
            {kicker}
          </span>
        ) : null}
      </span>
    </>
  );
  const brandClass =
    "group flex min-w-0 items-center gap-2.5 text-foreground";

  return (
    <header className="flex items-center justify-between gap-3">
      {code ? (
        <Link
          to={booth ? "/booth/$code" : "/r/$code"}
          params={{ code }}
          className={brandClass}
        >
          {brand}
        </Link>
      ) : (
        <Link to="/" className={brandClass}>
          {brand}
        </Link>
      )}
      <Button asChild variant="outline" size="sm" className="shrink-0">
        <a href={VENMO_URL} target="_blank" rel="noopener noreferrer">
          Just the Tip.
          <span className="hidden sm:inline">{VENMO_HANDLE}</span>
          <ExternalLink className="size-3.5 opacity-70" />
        </a>
      </Button>
    </header>
  );
}
