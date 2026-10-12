"use client";
import { useEffect, useState } from "react";
import { useProduct } from "./product-context";
import { api, browserClient } from "@/lib/supabase";
import { Field, Notice } from "./ui";
import { PhoneConsentSetup, PreferencesForm, ProviderSetup } from "./setup";
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
export function SecuritySettings() {
  const { preview } = useProduct();
  const [error, setError] = useState(""),
    [qr, setQr] = useState(""),
    [secret, setSecret] = useState(""),
    [factor, setFactor] = useState(""),
    [code, setCode] = useState(""),
    [verified, setVerified] = useState<
      { id: string; friendly_name?: string }[]
    >([]);
  useEffect(() => {
    if (!preview)
      void browserClient()
        .auth.mfa.listFactors()
        .then(({ data }) =>
          setVerified(data?.totp.filter((f) => f.status === "verified") ?? []),
        )
        .catch(() => {});
  }, [preview]);
  async function enroll() {
    try {
      const { data, error } = await browserClient().auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Nila ${new Date().toISOString().slice(0, 10)}`,
      });
      if (error) throw error;
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactor(data.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function verify() {
    try {
      const { error } = await browserClient().auth.mfa.challengeAndVerify({
        factorId: factor,
        code,
      });
      if (error) throw error;
      setVerified([
        ...verified,
        { id: factor, friendly_name: "Authenticator" },
      ]);
      setQr("");
      setSecret("");
      setFactor("");
      setCode("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function remove(id: string) {
    try {
      const { error } = await browserClient().auth.mfa.unenroll({
        factorId: id,
      });
      if (error) throw error;
      setVerified(verified.filter((f) => f.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="card">
      <h2>Keep your space secure</h2>
      <p>
        Use an authenticator for optional two-step verification. Administrative
        access always requires it.
      </p>
      {verified.map((f) => (
        <div className="list-row" key={f.id}>
          <strong>{f.friendly_name ?? "Authenticator"}</strong>
          <button className="text-button" onClick={() => void remove(f.id)}>
            Remove authenticator
          </button>
        </div>
      ))}
      {!factor ? (
        <button
          disabled={preview}
          className="button secondary"
          onClick={() => void enroll()}
        >
          Set up authenticator
        </button>
      ) : (
        <>
          <p>Scan the code in your authenticator app.</p>
          <img
            src={qr}
            alt="Authenticator enrollment QR code"
            width={180}
            height={180}
          />
          <Field label="Manual setup secret">
            <input readOnly value={secret} />
          </Field>
          <Field label="Six-digit verification code">
            <input
              value={code}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <button className="button" onClick={() => void verify()}>
            Verify authenticator
          </button>
        </>
      )}
      {error && <Notice error>{error}</Notice>}
    </section>
  );
}
export function SettingsView() {
  const { data, mutate, preview } = useProduct();
  const [error, setError] = useState(""),
    [password, setPassword] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  async function exportData() {
    try {
      download(await api("/export"), "nila-private-export.json");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function deleteAccount() {
    try {
      if (!confirmed) throw new Error("Confirm permanent deletion first.");
      const client = browserClient();
      const {
        data: { user },
      } = await client.auth.getUser();
      if (password && user?.email) {
        const { error } = await client.auth.signInWithPassword({
          email: user.email,
          password,
        });
        if (error) throw error;
      }
      await mutate("/account", undefined, "DELETE");
      await client.auth.signOut();
      location.assign("/");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function deleteTranscripts() {
    try {
      await mutate("/transcripts", undefined, "DELETE");
      setError("Retained transcripts deleted. Your journals remain available.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">CONTROL BELONGS TO YOU</span>
          <h1>Your preferences & privacy</h1>
          <p>A space that works for you, with choices you can change.</p>
        </div>
      </div>
      <ProfileSettings />
      <PreferencesForm />
      <ProviderSetup />
      <PhoneConsentSetup />
      <SecuritySettings />
      <section className="card">
        <h2>Your data, your decision</h2>
        <p>
          Download your information or remove retained transcripts. No audio
          recordings are created.
        </p>
        <div className="button-row">
          <button
            className="button secondary"
            disabled={preview}
            onClick={() => void exportData()}
          >
            Export my information
          </button>
          <button
            className="button secondary"
            disabled={preview}
            onClick={() => void deleteTranscripts()}
          >
            Delete retained transcripts
          </button>
        </div>
      </section>
      <section className="card">
        <h2>Delete your account</h2>
        <p>
          This permanently removes your Nila account, private journals,
          schedules and encrypted provider connections. Existing provider
          accounts are separate.
        </p>
        <Field
          label="Confirm your password, if using email sign-in"
          hint="Recent sign-in is required. For Google or MFA accounts, sign out and verify your sign-in again before deleting."
        >
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I understand that this permanently deletes my Nila data.
        </label>
        <button
          className="button danger-button"
          disabled={preview || !confirmed}
          onClick={() => void deleteAccount()}
        >
          Delete my account permanently
        </button>
      </section>
      {error && <Notice>{error}</Notice>}
      {!data?.profile.onboarding_complete && (
        <p>
          Finish setup to enable calls. Your privacy choices remain available
          here.
        </p>
      )}
    </>
  );
}
function ProfileSettings() {
  const { data, mutate, preview } = useProduct();
  const [message, setMessage] = useState("");
  return (
    <section className="card">
      <h2>Make yourself at home</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const values = Object.fromEntries(new FormData(e.currentTarget));
          void mutate("/profile", values, "PUT")
            .then(() => setMessage("Your profile is saved."))
            .catch((e) => setMessage((e as Error).message));
        }}
      >
        <Field label="What should we call you?">
          <input
            required
            name="display_name"
            maxLength={80}
            defaultValue={data?.profile.display_name}
          />
        </Field>
        <Field label="Your time zone">
          <input
            required
            name="timezone"
            defaultValue={data?.profile.timezone}
          />
        </Field>
        <button className="button secondary" disabled={preview}>
          Save my profile
        </button>
        {message && <Notice>{message}</Notice>}
      </form>
    </section>
  );
}
type AdminData = {
  accounts: { user_id: string; display_name: string; suspended: boolean }[];
  delivery: { status: string; count: number }[];
  audit: { id: string; action: string; created_at: string }[];
  platform: { key: string; enabled: boolean }[];
  connections: { provider: string; status: string; label: string }[];
};
export function AdminView() {
  const { preview } = useProduct();
  const [data, setData] = useState<AdminData | null>(null),
    [error, setError] = useState("");
  async function refresh() {
    try {
      setData(await api<AdminData>("/admin"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (!preview) void refresh();
  }, [preview]);
  async function suspend(id: string, suspended: boolean) {
    try {
      await api(`/admin/accounts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ suspended }),
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function enable(enabled: boolean) {
    try {
      await api("/admin/features", {
        method: "PUT",
        body: JSON.stringify({ key: "calling", enabled }),
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">SYSTEM OPERATIONS</span>
          <h1>Administration</h1>
          <p>
            Server-authorized access with mandatory MFA. Private journal content
            is excluded.
          </p>
        </div>
      </div>
      {error && <Notice error>{error}</Notice>}
      {preview ? (
        <Notice>
          Administrative information requires an authorized account.
        </Notice>
      ) : data ? (
        <>
          <section className="card">
            <h2>Call delivery</h2>
            {data.delivery.map((d) => (
              <div className="list-row" key={d.status}>
                <span>{d.status}</span>
                <strong>{d.count}</strong>
              </div>
            ))}
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={
                  data.platform.find((p) => p.key === "calling")?.enabled ??
                  false
                }
                onChange={(e) => void enable(e.target.checked)}
              />
              Enable outbound calling in this environment
            </label>
          </section>
          <section className="card">
            <h2>Account access</h2>
            {data.accounts.map((a) => (
              <div className="list-row" key={a.user_id}>
                <span>{a.display_name || "Member"}</span>
                <button
                  className="button secondary"
                  onClick={() => void suspend(a.user_id, !a.suspended)}
                >
                  {a.suspended ? "Restore access" : "Pause access"}
                </button>
              </div>
            ))}
          </section>
          <section className="card">
            <h2>Masked provider connections</h2>
            {data.connections.map((c, i) => (
              <div className="list-row" key={i}>
                <span>
                  {c.provider} · {c.label}
                </span>
                <span>{c.status}</span>
              </div>
            ))}
          </section>
          <section className="card">
            <h2>Audit events</h2>
            {data.audit.map((a) => (
              <div key={a.id} className="list-row">
                <span>{a.action}</span>
                <time>{new Date(a.created_at).toLocaleString()}</time>
              </div>
            ))}
          </section>
        </>
      ) : (
        <p>Checking administrative access…</p>
      )}
    </>
  );
}
