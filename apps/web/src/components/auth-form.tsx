"use client";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  GoogleLogoIcon,
  GithubLogoIcon,
  ArrowRightIcon,
} from "@phosphor-icons/react";
import { browserClient } from "@/lib/supabase";
import { Brand, Button, Field, Notice, ThemeToggle } from "./ui";
export function AuthForm() {
  const params = useSearchParams();
  const [mode, setMode] = useState(
    params.get("mode") === "signup"
      ? "signup"
      : params.get("mode") === "update"
        ? "update"
        : "login",
  );
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [adult, setAdult] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(
      params.get("error") === "callback"
        ? "Sign-in could not finish. Please try again."
        : "",
    );
  const [factor, setFactor] = useState<string | null>(null),
    [code, setCode] = useState("");
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in did not finish.");
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    const client = browserClient();
    const factors = await client.auth.mfa.listFactors();
    const verified = factors.data?.totp.find((f) => f.status === "verified");
    if (verified) {
      setFactor(verified.id);
      return;
    }
    window.location.assign("/dashboard");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const client = browserClient();
      if (factor) {
        const result = await client.auth.mfa.challengeAndVerify({
          factorId: factor,
          code,
        });
        if (result.error) throw result.error;
        window.location.assign("/dashboard");
        return;
      }
      if (mode === "signup") {
        if (!adult) throw new Error("Nila is for adults aged 18 and over.");
        const result = await client.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
          },
        });
        if (result.error) throw result.error;
        setMessage(
          "Check your email to verify your account. Your private space will be ready after confirmation.",
        );
      } else if (mode === "reset") {
        const result = await client.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/auth?mode=update`,
        });
        if (result.error) throw result.error;
        setMessage(
          "If an account exists, you'll receive a password reset link.",
        );
      } else if (mode === "update") {
        const result = await client.auth.updateUser({ password });
        if (result.error) throw result.error;
        setMessage("Password updated. You can continue to your dashboard.");
      } else {
        const result = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (result.error) throw result.error;
        await finish();
      }
    });
  }
  async function oauth(provider: "google" | "github") {
    await run(async () => {
      if (mode === "signup" && !adult)
        throw new Error(
          "Please confirm that you are 18 or older before continuing.",
        );
      const result = await browserClient().auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        },
      });
      if (result.error) throw result.error;
    });
  }
  return (
    <main id="main" className="auth-layout">
      <aside className="auth-art">
        <h2>A little space to be yourself.</h2>
        <p className="muted" style={{ marginTop: 20, maxWidth: 340 }}>
          Your day doesn't need to be perfect to be worth reflecting on.
        </p>
        <Image
          src="/nila-art.png"
          width={750}
          height={500}
          alt="Soft lavender loop and sage leaves"
        />
      </aside>
      <div className="auth-form">
        <div className="row between">
          <Brand />
          <ThemeToggle />
        </div>
        <h1>
          {factor
            ? "One more gentle step"
            : mode === "signup"
              ? "Make room for you."
              : mode === "reset"
                ? "Reset your password."
                : mode === "update"
                  ? "Choose a new password."
                  : "Welcome back."}
        </h1>
        <p className="muted">
          {factor
            ? "Enter the code from your authenticator to protect your private space."
            : "A quiet place for your feelings, your words, and your pace."}
        </p>
        {error && <Notice error>{error}</Notice>}
        {message && <Notice>{message}</Notice>}
        {!factor && ["login", "signup"].includes(mode) && (
          <>
            <Button
              className="secondary"
              style={{ marginTop: 30 }}
              disabled={busy}
              onClick={() => void oauth("google")}
            >
              <GoogleLogoIcon weight="bold" size={20} />
              Continue with Google
            </Button>
            <Button
              className="secondary"
              style={{ marginTop: 12 }}
              disabled={busy}
              onClick={() => void oauth("github")}
            >
              <GithubLogoIcon weight="bold" size={20} />
              Continue with GitHub
            </Button>
            <div className="auth-divider">or with your email</div>
          </>
        )}
        <form onSubmit={submit}>
          {factor ? (
            <Field label="Authenticator code">
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
          ) : (
            <>
              {mode !== "update" && (
                <Field label="Email address">
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </Field>
              )}
              {mode !== "reset" && (
                <Field
                  label="Password"
                  hint={
                    mode === "signup"
                      ? "Use at least 12 characters for your private account."
                      : undefined
                  }
                >
                  <input
                    type="password"
                    minLength={mode === "login" ? 1 : 12}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
              )}
              {mode === "signup" && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={adult}
                    onChange={(e) => setAdult(e.target.checked)}
                    required
                  />
                  <span>
                    I am 18 or older and have read the{" "}
                    <Link className="text-link" href="/privacy">
                      privacy approach
                    </Link>
                    .
                  </span>
                </label>
              )}
            </>
          )}
          <Button disabled={busy} type="submit" style={{ marginTop: 12 }}>
            {busy
              ? "Just a moment…"
              : factor
                ? "Verify"
                : mode === "signup"
                  ? "Create account"
                  : mode === "reset"
                    ? "Send reset link"
                    : mode === "update"
                      ? "Save password"
                      : "Sign in"}
            <ArrowRightIcon size={17} />
          </Button>
        </form>
        {!factor && (
          <div
            className="page-stack"
            style={{ gap: 12, marginTop: 22, textAlign: "center" }}
          >
            <button
              className="text-link"
              style={{ background: "none", border: 0 }}
              onClick={() => {
                setMode(mode === "signup" ? "login" : "signup");
                setMessage("");
                setError("");
              }}
            >
              {mode === "signup"
                ? "Already have a space? Sign in"
                : "New here? Create your account"}
            </button>
            {mode === "login" && (
              <button
                className="muted"
                style={{ background: "none", border: 0, fontSize: 12 }}
                onClick={() => setMode("reset")}
              >
                Forgot your password?
              </button>
            )}
            {mode === "update" && (
              <Link href="/dashboard" className="text-link">
                Continue to your dashboard
              </Link>
            )}
            <Link href="/" className="muted small">
              Back to Nila
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
