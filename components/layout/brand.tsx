import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return <Link href={href} className="brand" aria-label="SignalFit home"><span>SF</span><b>SignalFit</b><i>Market Validation</i></Link>;
}
