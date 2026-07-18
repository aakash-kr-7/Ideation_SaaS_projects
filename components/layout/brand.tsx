import Link from "next/link";
import Image from "next/image";

export function Brand({ href = "/" }: { href?: string }) {
  return <Link href={href} className="brand" aria-label="ShouldBuild home">
    <span className="brand-mark-shell" aria-hidden="true">
      <Image className="brand-mark" src="/brand/shouldbuild-mark.svg" alt="" width={48} height={48} priority />
    </span>
    <span className="brand-copy"><span className="brand-name">Should<span className="text-accent">Build</span></span><i>Market Validation</i></span>
  </Link>;
}
