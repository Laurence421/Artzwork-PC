import Image from "next/image";
import Link from "next/link";
import logo from "../../../../public/brand/artzworkpc-logo.png";

/** The Artzwork PC logo above the seller site's login, sign-up and setup cards. */
export function SellerLogo() {
  return (
    <Link href="/" className="self-center">
      <Image src={logo} alt="Artzwork PC" width={112} height={112} priority className="rounded-2xl" />
    </Link>
  );
}

/** Small logo for the seller sidebar and phone header. */
export function SellerLogoMark() {
  return <Image src={logo} alt="" width={32} height={32} className="shrink-0 rounded-lg" />;
}
