"use client";

/**
 * Single seam for auth. Import auth from here, never from `@clerk/nextjs` directly,
 * so the dev bypass (`NEXT_PUBLIC_DEV_AUTH=1`) can swap the whole surface at once.
 *
 * The dev bypass models a real session with a real identity: sign in with an email,
 * get a stable user id, sign out and the app locks. `useAuth().userId` is what all
 * local data is keyed on, in both modes, so two accounts never share history.
 *
 * `useUser()` still reports `user: null` in dev. Every Supabase call is gated on
 * `user?.id`, so that keeps the network layer off while the rest of auth is real.
 * New Supabase calls should keep that gate.
 */

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  ClerkProvider,
  SignInButton as ClerkSignInButton,
  UserButton as ClerkUserButton,
  useAuth as useClerkAuth,
  useUser as useClerkUser,
} from "@clerk/nextjs";
import {
  DevSession,
  IS_DEV_AUTH,
  getDevSession,
  signOutDev,
  subscribeDevAuth,
} from "@/lib/dev-auth";

type ChildrenProps = { children?: React.ReactNode };

type DevAuthValue = {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  sessionId: string | null;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
};

const SIGNED_OUT: DevAuthValue = Object.freeze({
  isLoaded: true,
  isSignedIn: false,
  userId: null,
  sessionId: null,
  getToken: async () => null,
  signOut: async () => signOutDev(),
});

/*
 * Hydration renders before the client store can be read. Reporting "signed out"
 * in that window made the gate fire on every full page load and bounce a signed-in
 * user to /sign-in, so the unknown window reports isLoaded: false instead.
 */
const NOT_LOADED: DevAuthValue = Object.freeze({
  isLoaded: false,
  isSignedIn: false,
  userId: null,
  sessionId: null,
  getToken: async () => null,
  signOut: async () => {},
});

/*
 * Derived once per session object, not per render. The context feeds `getToken`
 * into a useCallback dependency list, so a fresh object each render invalidates it
 * and spins the effects into an infinite update loop.
 */
const authCache = new WeakMap<DevSession, DevAuthValue>();

function authValueFor(session: DevSession | null): DevAuthValue {
  if (!session) return SIGNED_OUT;
  const cached = authCache.get(session);
  if (cached) return cached;
  const value: DevAuthValue = Object.freeze({
    isLoaded: true,
    isSignedIn: true,
    userId: session.userId,
    sessionId: `sess_${session.userId}`,
    getToken: async () => null,
    signOut: async () => signOutDev(),
  });
  authCache.set(session, value);
  return value;
}

/**
 * `undefined` is the server/hydration snapshot: the session is not knowable yet.
 * React swaps to the real client snapshot right after hydration.
 */
export function useDevSession(): DevSession | null | undefined {
  return useSyncExternalStore(subscribeDevAuth, getDevSession, () => undefined);
}

function useDevAuth(): DevAuthValue {
  const session = useDevSession();
  if (session === undefined) {
    return NOT_LOADED;
  }
  return authValueFor(session);
}

const DEV_USER_VALUE = Object.freeze({ isLoaded: true, isSignedIn: false, user: null });

function useDevUser() {
  return DEV_USER_VALUE;
}

export const useAuth = (
  IS_DEV_AUTH ? (useDevAuth as unknown as typeof useClerkAuth) : useClerkAuth
) as typeof useClerkAuth;

export const useUser = (
  IS_DEV_AUTH ? (useDevUser as unknown as typeof useClerkUser) : useClerkUser
) as typeof useClerkUser;

export function AuthProvider({ children }: ChildrenProps) {
  if (IS_DEV_AUTH) {
    return <>{children}</>;
  }
  // Clerk v7 takes the post-sign-out destination here, not on UserButton.
  return <ClerkProvider afterSignOutUrl="/sign-in">{children}</ClerkProvider>;
}

type SignInButtonProps = React.ComponentProps<typeof ClerkSignInButton>;

/** In dev there is a real sign-in form, so this just sends you to it. */
function DevSignInButton({ children }: ChildrenProps) {
  const router = useRouter();
  return (
    <span className="contents" onClick={() => router.push("/sign-in")}>
      {children}
    </span>
  );
}

export function SignInButton({ children, ...props }: SignInButtonProps) {
  if (IS_DEV_AUTH) {
    return <DevSignInButton>{children}</DevSignInButton>;
  }
  return <ClerkSignInButton {...props}>{children}</ClerkSignInButton>;
}

function DevUserButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const session = useDevSession();
  const initials = useMemo(() => session?.initials ?? "?", [session]);

  if (!session) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((previous) => !previous)}
        title={`Signed in as ${session.email}`}
        aria-label="Account"
        className="flex h-7 w-7 items-center justify-center rounded-full bg-green text-xs font-bold text-bg"
      >
        {initials}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-40 w-[220px] border border-line bg-panel">
            <div className="border-b border-line px-3 py-3">
              <div className="label text-[9px] text-ink">{session.name}</div>
              <div className="label mt-1 text-[8px] font-normal text-dim">{session.email}</div>
            </div>
            <button
              onClick={() => {
                setOpen(false);
                signOutDev();
                router.replace("/sign-in");
              }}
              className="label w-full px-3 py-3 text-left text-[9px] text-ink-2 hover:bg-hover hover:text-amber"
            >
              Sign out
            </button>
            <div className="label border-t border-line px-3 py-2 text-[7.5px] font-normal text-off">
              Dev auth · no Clerk
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function UserButton() {
  if (IS_DEV_AUTH) {
    return <DevUserButton />;
  }
  return <ClerkUserButton />;
}
