import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export function Brand({
  href = "/",
  wordmark,
}: {
  href?: string;
  wordmark?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-sb-3 rounded-sb-sm text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus"
      aria-label="ShouldBuild home"
    >
      <span className="grid size-8 shrink-0 place-items-center" aria-hidden="true">
        <Image src="/brand/shouldbuild-mark.svg" alt="" width={32} height={32} priority/>
      </span>
      <span className="flex min-w-0 items-baseline gap-sb-3">
        <span className="font-sb-display text-lg font-[480] tracking-[-0.015em]">
          {wordmark ?? "ShouldBuild"}
        </span>
        <span className="hidden border-l border-sb-border-hairline pl-sb-3 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary xl:inline">Market validation</span>
      </span>
    </Link>
  );
}
