"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IS_DEV_AUTH, signInDev, signUpDev } from "@/lib/dev-auth";
import { SignInButton, useAuth } from "@/lib/auth";

/**
 * Where you land signed out, and the only way in.
 *
 * In dev this is a working credential flow — create an account, sign in, get the
 * password wrong — so the auth path can be exercised without Clerk. In production
 * the same screen hands off to Clerk's modal.
 */
export default function SignInScreen() {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }

    setBusy(true);
    const result = mode === "sign-up" ? await signUpDev(address, password) : await signInDev(address, password);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace("/");
  };

  const swap = () => {
    setMode(mode === "sign-in" ? "sign-up" : "sign-in");
    setError(null);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-[22px] py-10 desk:px-[26px]">
      <div className="w-full max-w-[420px]">
        <div className="flex items-center gap-4">
          <Image src="/gitswole.png" alt="" width={56} height={56} className="rounded-[10px] object-cover" />
          <div>
            <h1 className="num text-[44px] uppercase leading-[0.9]">Git Swole</h1>
            <p className="label mt-1.5 text-[8.5px] font-normal text-dim">Version control for your gains</p>
          </div>
        </div>

        {isSignedIn ? (
          <div className="mt-10 border-t border-line pt-8">
            <button
              onClick={() => router.replace("/")}
              className="label h-[64px] w-full bg-green text-[14px] text-bg"
            >
              Back to training
            </button>
          </div>
        ) : IS_DEV_AUTH ? (
          <form onSubmit={submit} className="mt-10 border-t border-line pt-8">
            <div className="label mb-6 text-[10px] text-ink">
              {mode === "sign-up" ? "Create your account" : "Sign in to your account"}
            </div>

            <label className="label block text-[9px] text-dim" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="mt-2 h-[52px] w-full border border-line px-4 text-[13px] text-ink"
            />

            <label className="label mt-5 block text-[9px] text-dim" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === "sign-up" ? "At least 8 characters" : "••••••••"}
              className="mt-2 h-[52px] w-full border border-line px-4 text-[13px] text-ink"
            />

            {error ? (
              <div role="alert" className="label mt-4 border border-amber-line px-3 py-3 text-[9px] text-amber">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="label mt-6 h-[64px] w-full bg-green text-[14px] text-bg disabled:bg-panel disabled:text-off"
            >
              {busy ? "Working" : mode === "sign-up" ? "Create account" : "Sign in"}
            </button>

            <button
              type="button"
              onClick={swap}
              className="label mt-4 w-full text-center text-[9px] font-normal text-dim hover:text-green"
            >
              {mode === "sign-in"
                ? "No account? Create one"
                : "Already have an account? Sign in"}
            </button>

            <p className="label mt-8 text-[8px] font-normal leading-[1.7] text-off">
              Dev auth · accounts live in this browser. Each one has its own history.
            </p>
          </form>
        ) : (
          <div className="mt-10 border-t border-line pt-8">
            <SignInButton mode="modal">
              <button className="label h-[64px] w-full bg-green text-[14px] text-bg">Sign in</button>
            </SignInButton>
          </div>
        )}
      </div>
    </div>
  );
}
