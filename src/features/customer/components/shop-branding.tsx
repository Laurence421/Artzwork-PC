"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Mail, MapPin, Phone } from "lucide-react";
import { SOCIALS } from "@/features/shared/lib/branding";
import { buttonClasses, focusRingClasses, secondaryButtonClasses } from "@/features/shared/ui/button-styles";
import { useBranding } from "../branding/branding-context";

/** Logo (if set) and shop name, linking home: the left side of the nav bar. */
export function ShopBrand() {
  const b = useBranding();
  return (
    <Link href="/" className={`flex min-w-0 items-center gap-2 text-base font-semibold ${focusRingClasses}`}>
      {/* The shop's own logo, else the Artzwork PC logo that ships with the site. */}
      <Image src={b.logoUrl ?? "/brand/artzworkpc-logo.png"} alt="" width={36} height={36} className="size-9 shrink-0 rounded-xl object-cover" />
      <span className="truncate font-display text-lg font-bold tracking-tight uppercase">{b.name}</span>
    </Link>
  );
}

/** The seller's one-line announcement above the nav bar, if set. */
export function AnnouncementBar() {
  const { announcement } = useBranding();
  if (!announcement) return null;
  return <p className="bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground">{announcement}</p>;
}

/** The seller's instalment note under a product's price, if set (e.g. "Instalment available via Salmon"). */
export function InstalmentNote() {
  const { instalment } = useBranding();
  if (!instalment) return null;
  return <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm whitespace-pre-line">{instalment}</p>;
}

// Pages where a floating button would sit over the buttons that matter most.
const NO_CHAT_BUTTON = ["/cart", "/checkout", "/order/"];

/**
 * "Message us" in the corner of shop pages, when the seller has set a Messenger link.
 * Left off cart, checkout and order pages, where it could cover their buttons.
 */
export function ChatButton() {
  const { socials } = useBranding();
  const pathname = usePathname();
  if (!socials.messenger || NO_CHAT_BUTTON.some((p) => pathname.startsWith(p))) return null;
  return (
    <a
      href={socials.messenger}
      target="_blank"
      rel="noopener noreferrer"
      className={`fixed right-4 bottom-4 z-20 ${buttonClasses("sm")} shadow-lg print:hidden`}
    >
      Message us<span className="sr-only"> on Messenger (opens in a new tab)</span>
    </a>
  );
}

/** Banner, shop name and tagline at the top of the home page. */
export function HomeHero() {
  const b = useBranding();
  // The last word of the shop's name in the brand gradient ("Artzwork PC" -> "PC").
  const words = b.name.trim().split(/\s+/);
  const last = words.length > 1 ? words.pop() : null;

  return (
    <header className={`grid items-center gap-8 py-6 md:py-12 ${b.bannerUrl ? "lg:grid-cols-2" : ""}`}>
      <div className="flex animate-fade-up flex-col items-start gap-5">
        <p className="rounded-full border border-primary/40 bg-surface/60 px-3 py-1 text-xs font-semibold tracking-widest text-primary uppercase">
          {b.tagline || "Computer parts & services"}
        </p>
        <h1 className="text-5xl leading-none font-bold tracking-tight uppercase md:text-7xl">
          {words.join(" ")} {last && <span className="text-gradient">{last}</span>}
        </h1>
        <p className="max-w-xl text-base text-muted md:text-lg">
          PC sets, parts and accessories, checked and ready. Order online, pay by GCash, bank or cash on delivery, and follow your order
          until it arrives.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/products" className={`${buttonClasses("sm")} h-11 px-6`}>
            Shop now <ArrowRight aria-hidden className="size-4" />
          </Link>
          <Link href="/how-to-order" className={`${secondaryButtonClasses("sm")} h-11 px-6`}>
            How to order
          </Link>
        </div>
      </div>
      {b.bannerUrl && (
        <div className="relative aspect-[3/2] animate-fade-up overflow-hidden rounded-2xl border border-border shadow-glow lg:aspect-[4/3]">
          <Image src={b.bannerUrl} alt="" fill priority sizes="(min-width: 1024px) 576px, 100vw" className="object-cover" />
        </div>
      )}
    </header>
  );
}

/** Contact details and social links, on every shop page. */
export function ShopFooter() {
  const b = useBranding();
  const socials = SOCIALS.filter((s) => b.socials[s.key]);
  const { phone, email, address } = b.contact;
  const link = `text-primary hover:underline ${focusRingClasses}`;

  return (
    // Room under the footer for the "Message us" button, so it never covers the last line.
    <footer className={`relative mt-auto border-t border-border bg-surface/80 ${b.socials.messenger ? "pb-16" : ""}`}>
      {/* A thin neon line along the top. */}
      <div aria-hidden className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-brand-red to-transparent" />
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 text-sm sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-xl font-bold tracking-tight uppercase">{b.name}</h2>
          {b.about && <p className="line-clamp-3 text-muted">{b.about}</p>}
          <nav aria-label="Shop pages" className="flex flex-col gap-2">
            <Link href="/about" className={link}>
              About us
            </Link>
            <Link href="/contact" className={link}>
              Contact
            </Link>
            <Link href="/how-to-order" className={link}>
              How to order
            </Link>
            <Link href="/orders" className={link}>
              My orders
            </Link>
          </nav>
        </div>
        {(phone || email || address) && (
          <div className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">Contact</h2>
            {phone && (
              <a href={`tel:${phone}`} className={`inline-flex items-center gap-2 ${link}`}>
                <Phone aria-hidden className="size-4 shrink-0" />
                {phone}
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className={`inline-flex items-center gap-2 ${link}`}>
                <Mail aria-hidden className="size-4 shrink-0" />
                {email}
              </a>
            )}
            {address && (
              <p className="flex gap-2 whitespace-pre-line text-muted">
                <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
                {address}
              </p>
            )}
          </div>
        )}
        {socials.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">Follow us</h2>
            {socials.map((s) => (
              <a key={s.key} href={b.socials[s.key]} target="_blank" rel="noopener noreferrer" className={link}>
                {s.label}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </footer>
  );
}

/** The About page body: the seller's text plus contact details. */
export function AboutContent() {
  const b = useBranding();
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">About {b.name}</h1>
        {b.tagline && <p className="text-sm text-muted">{b.tagline}</p>}
      </header>
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
        <p className="whitespace-pre-line text-sm">{b.about || "This shop hasn't written about itself yet."}</p>
      </section>
    </>
  );
}

/** The Contact page body: every way to reach the shop that the seller filled in. */
export function ContactContent() {
  const b = useBranding();
  const { phone, email, address } = b.contact;
  const socials = SOCIALS.filter((s) => b.socials[s.key]);
  const nothing = !phone && !email && !address && socials.length === 0;

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Contact {b.name}</h1>
        <p className="text-sm text-muted">Questions about a product or your order? Reach us here.</p>
      </header>
      {nothing ? (
        <section className="rounded-2xl border border-border bg-surface p-6">
          <p className="text-sm text-muted">This shop hasn&apos;t added contact details yet.</p>
        </section>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {(phone || email || address) && (
            <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 text-sm">
              <h2 className="text-base font-semibold">Call, text or email</h2>
              {phone && (
                <a href={`tel:${phone}`} className={`${secondaryButtonClasses("md")} ${focusRingClasses}`}>
                  Call {phone}
                </a>
              )}
              {email && (
                <a href={`mailto:${email}`} className={`${secondaryButtonClasses("md")} ${focusRingClasses}`}>
                  Email {email}
                </a>
              )}
              {address && <p className="whitespace-pre-line text-muted">{address}</p>}
            </section>
          )}
          {socials.length > 0 && (
            <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 text-sm">
              <h2 className="text-base font-semibold">Message us</h2>
              {socials.map((s) => (
                <a key={s.key} href={b.socials[s.key]} target="_blank" rel="noopener noreferrer" className={secondaryButtonClasses("md")}>
                  {s.label}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ))}
            </section>
          )}
        </div>
      )}
    </>
  );
}
