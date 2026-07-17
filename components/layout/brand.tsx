import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return <Link href={href} className="brand" aria-label="ShouldBuild home"><span>SB</span><b>ShouldBuild</b><i>Market Validation</i></Link>;
}
