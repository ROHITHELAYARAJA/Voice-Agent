"use client";
import { useEffect, useState, useRef } from "react";
import { Brand, Field, Notice } from "@/components/ui";
import { browserClient } from "@/lib/supabase";
export default function Mfa() {
  const started = useRef(false);
  const [factor, setFactor] = useState(""),
    [code, setCode] = useState(""),
    [qr, setQr] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const client = browserClient();
        const {
          data: { user },
        } = await client.auth.getUser();
        if (!user) {
          location.assign("/auth");
          return;
        }
        const { data, error } = await client.auth.mfa.listFactors();
        if (error) throw error;
        const existing = data.totp.find((f) => f.status === "verified");
        if (existing) setFactor(existing.id);
        else {
          const { data, error } = await client.auth.mfa.enroll({
            factorType: "totp",
            friendlyName: "Nila administrator",
          });
          if (error) throw error;
          setFactor(data.id);
          setQr(data.totp.qr_code);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);
  async function verify() {
    setBusy(true);
    try {
      const { error } = await browserClient().auth.mfa.challengeAndVerify({
        factorId: factor,
        code,
      });
      if (error) throw error;
      location.assign("/dashboard");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main" className="auth-card">
      <Brand />
      <h1>A little extra protection.</h1>
      <p>
        {qr
          ? "Scan this code with your authenticator, then enter its six-digit code."
          : "Enter the code from your authenticator to open your private space."}
      </p>
      {qr && (
        <img
          src={qr}
          width={180}
          height={180}
          alt="Authenticator enrollment QR code"
        />
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void verify();
        }}
      >
        <Field label="Six-digit code">
          <input
            value={code}
            required
            pattern="[0-9]{6}"
            inputMode="numeric"
            autoComplete="one-time-code"
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>
        <button className="button" disabled={busy || !factor}>
          {busy ? "Verifying…" : "Verify and continue"}
        </button>
      </form>
      {error && <Notice error>{error}</Notice>}
    </main>
  );
}
