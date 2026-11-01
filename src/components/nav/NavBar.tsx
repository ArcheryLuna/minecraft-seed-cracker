"use client";

// The bar at the top of every page, with links between the tools.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PAGES = [
  { href: "/", label: "Cracker" },
  { href: "/generate", label: "Generator" },
];

export function NavBar() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b bg-card">
      <nav aria-label="Main" className="mx-auto flex h-12 w-full max-w-2xl items-center justify-between gap-4 px-4">
        <Link href="/" className="pixel-shadow whitespace-nowrap font-heading text-base font-bold">
          Seed Cracker
        </Link>
        <ul className="flex items-center gap-1">
          {PAGES.map((p) => {
            const active = p.href === "/" ? pathname === "/" : pathname.startsWith(p.href);
            return (
              <li key={p.href}>
                <Link
                  href={p.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "sm" }),
                    "transition-none",
                    active ? "bg-muted text-foreground shadow-[inset_0_-2px_0_var(--primary)]" : "text-muted-foreground",
                  )}
                >
                  {p.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
