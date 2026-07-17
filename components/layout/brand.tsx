import Link from "next/link";
import Image from "next/image";

export function Brand({ href = "/" }: { href?: string }) {
  return <Link href={href} className="brand" aria-label="ShouldBuild home">
    <span className="brand-mark-shell" aria-hidden="true">
      <Image className="brand-mark" src="/brand/shouldbuild-mark.png" alt="" width={42} height={42} priority />
    </span>
    <span className="brand-copy"><span className="brand-name">Should<span className="text-accent">Build</span></span><i>Market Validation</i></span>
  </Link>;
}
