"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { UserButton, useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { useNowMs } from "@/lib/use-now";
import { useWorkoutApp } from "@/context/workout-app-context";

/**
 * App chrome. Two form factors of one component, split at 900px (`desk:`):
 *   below — mobile: full-width column with a bottom tab bar
 *   above — desktop: 82px left rail, single content column with a 58px header
 * The session screen supplies its own header and takes over the phone entirely,
 * so the shell steps back for it. There is no back button anywhere by design.
 */

const NAV = [
  { href: "/", label: "Today" },
  { href: "/workout", label: "Session" },
  { href: "/history", label: "Log" },
  { href: "/progress", label: "Progress" },
  { href: "/program", label: "Program" },
  { href: "/settings", label: "Settings" },
];

// The phone tab bar drops Session: it is a takeover, not a tab.
const MOBILE_TABS = NAV.filter((item) => item.href !== "/workout");

function useClock() {
  const nowMs = useNowMs();
  if (!nowMs) {
    return null;
  }
  const now = new Date(nowMs);
  const day = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} · ${time}`.toUpperCase();
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();
  const { syncStatus, nextWorkoutName } = useWorkoutApp();
  const clock = useClock();
  const inSession = pathname === "/workout";
  // The sign-in screen stands alone — no rail, no tabs, no app header.
  const standalone = pathname === "/sign-in";

  /*
   * The app is gated: without a session there is nothing to show, because all
   * data belongs to an account. Signed-out visits bounce to the sign-in screen.
   */
  const locked = isLoaded && !isSignedIn && !standalone;
  useEffect(() => {
    if (locked) {
      router.replace("/sign-in");
    }
  }, [locked, router]);

  // /import is reachable from Settings rather than the nav, so it needs its own label.
  const breadcrumb =
    NAV.find((item) => item.href === pathname)?.label ?? (pathname === "/import" ? "Import" : "Today");

  if (standalone) {
    return <div className="min-h-screen bg-bg text-ink">{children}</div>;
  }

  // Render nothing while the redirect runs, rather than flashing another user's app.
  if (!isSignedIn) {
    return <div className="min-h-screen bg-bg" />;
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* Desktop rail */}
      <aside className="fixed left-0 top-0 z-20 hidden h-screen w-[82px] flex-col border-r border-line bg-raised desk:flex">
        <Link href="/" className="flex h-[58px] items-center justify-center border-b border-line">
          <Image src="/gitswole.png" alt="Git Swole" width={44} height={44} className="rounded-[8px] object-cover" />
        </Link>
        <nav className="flex flex-1 flex-col py-2">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`label border-l-2 px-1 py-[15px] text-center text-[9px] transition-colors ${
                  active
                    ? "border-green bg-subtle text-ink"
                    : "border-transparent text-dim hover:bg-hover hover:text-ink-2"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="label border-t border-line px-1 py-3 text-center text-[8.5px] text-dim">
          {inSession ? <span className="text-green">In session</span> : "Ready"}
        </div>
      </aside>

      {/* Content column */}
      <div className="desk:pl-[82px]">
        {!inSession ? (
          <header className="sticky top-0 z-10 flex h-[58px] items-center justify-between gap-3 border-b border-line bg-raised px-[22px] desk:px-[26px]">
            <div className="flex items-center gap-2">
              <Image
                src="/gitswole.png"
                alt=""
                width={30}
                height={30}
                className="rounded-[7px] object-cover desk:hidden"
              />
              <span className="label text-[9.5px] text-dim">{breadcrumb}</span>
            </div>
            <div className="flex items-center gap-4">
              {clock ? (
                <span className="hidden text-[10px] tracking-[0.14em] text-dim tabular-nums desk:inline">{clock}</span>
              ) : null}
              <span
                className={`label text-[8.5px] ${syncStatus === "error" ? "text-amber" : "text-dim"}`}
                title={isSignedIn ? `Sync: ${syncStatus}` : "Not signed in"}
              >
                {isSignedIn ? (syncStatus === "error" ? "Sync error" : "Local only") : "Local"}
              </span>
              <UserButton />
              {pathname === "/" ? (
                <Link
                  href="/workout"
                  className="label hidden bg-green px-4 py-[10px] text-[11px] text-bg desk:inline-block"
                >
                  Start {nextWorkoutName}
                </Link>
              ) : null}
            </div>
          </header>
        ) : null}

        <main className={inSession ? "pb-[env(safe-area-inset-bottom)]" : "pb-[calc(76px+env(safe-area-inset-bottom))] desk:pb-0"}>{children}</main>
      </div>

      {/* Mobile tab bar */}
      {!inSession ? (
        <nav className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-line bg-raised pb-[env(safe-area-inset-bottom)] desk:hidden">
          {MOBILE_TABS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`label flex-1 py-4 text-center text-[8.5px] ${active ? "text-green" : "text-dim"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
