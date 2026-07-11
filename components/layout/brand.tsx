import Link from "next/link";
import { RadioTower } from "lucide-react";
export function Brand() { return <Link href="/" className="brand"><span><RadioTower size={17} /></span><b>Signal</b><i>Fit</i></Link>; }
