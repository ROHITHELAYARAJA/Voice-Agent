"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircleIcon, KeyIcon, PhoneIcon } from "@phosphor-icons/react";
import { useProduct } from "./product-context";
import { Field, Notice } from "./ui";
import { viewLink } from "./dashboard";
export function ProviderSetup() {
  const { data, mutate, preview } = useProduct();
  const [provider, setProvider] = useState("twilio"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState("");
  async function submit(form: HTMLFormElement) {
    if (preview) {
      setError(
        "Connect providers after signing in. The preview never collects API keys.",
      );
      return;
    }
    const values = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError("");
    try {
      await mutate("/providers", { provider, ...values });
      form.reset();
      setSuccess(
        "Connection verified. Your key is encrypted and won't be shown again.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function disconnect(name: string) {
    if (!window.confirm(`Disconnect ${name} and pause scheduled calls?`))
      return;
    try {
      await mutate(`/providers/${name}`, undefined, "DELETE");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="card">
      <div className="card-heading">
        <div>
          <span className="eyebrow">YOUR PROVIDERS, YOUR CONTROL</span>
          <h2>Connect your voice companion</h2>
        </div>
        <KeyIcon size={26} />
      </div>
      <p>
        Nila uses your provider accounts. Their usage charges and limits still
        apply.
      </p>
      <div className="provider-status">
        {["twilio", "deepgram", "elevenlabs"].map((name) => {
          const connection = data?.connections.find((c) => c.provider === name);
          return (
            <div className="list-row" key={name}>
              <div>
                <strong>
                  {name === "elevenlabs"
                    ? "ElevenLabs"
                    : name === "deepgram"
                      ? "Deepgram"
                      : "Twilio"}
                </strong>
                <p className="caption">
                  {connection?.label ?? "Not connected"}
                </p>
              </div>
              <span className="badge">
                {connection?.status ?? "Setup needed"}
              </span>
              {connection?.status === "connected" && !preview && (
                <button
                  className="text-button"
                  onClick={() => void disconnect(name)}
                >
                  Disconnect
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="segmented" role="group" aria-label="Provider to connect">
        {["twilio", "deepgram", "elevenlabs"].map((name) => (
          <button
            aria-pressed={provider === name}
            key={name}
            onClick={() => {
              setProvider(name);
              setSuccess("");
              setError("");
            }}
          >
            {name === "elevenlabs"
              ? "ElevenLabs"
              : name === "deepgram"
                ? "Deepgram"
                : "Twilio"}
          </button>
        ))}
      </div>
      <form
        key={provider}
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(e.currentTarget);
        }}
      >
        {provider === "twilio" ? (
          <>
            <Field label="Account SID">
              <input
                disabled={preview}
                name="account_sid"
                required
                pattern="AC[a-fA-F0-9]{32}"
                placeholder="AC…"
              />
            </Field>
            <Field label="Auth token">
              <input
                disabled={preview}
                name="auth_token"
                type="password"
                required
                autoComplete="new-password"
              />
            </Field>
            <Field
              label="Authorized caller number"
              hint="Use an owned Twilio voice number in international format. Trial accounts cannot use the production streaming path."
            >
              <input
                disabled={preview}
                name="caller_number"
                type="tel"
                required
                placeholder="+1…"
              />
            </Field>
          </>
        ) : (
          <Field
            label={`${provider === "deepgram" ? "Deepgram" : "ElevenLabs"} API key`}
            hint={
              provider === "deepgram"
                ? "A supported managed model uses this key. No separate OpenAI key is needed."
                : "Available voices load from your own account after verification."
            }
          >
            <input
              disabled={preview}
              name="api_key"
              type="password"
              required
              autoComplete="new-password"
            />
          </Field>
        )}
        {error && <Notice error>{error}</Notice>}
        {success && <Notice>{success}</Notice>}
        <button className="button" disabled={busy || preview}>
          {busy ? "Verifying…" : "Verify and connect"}
        </button>
      </form>
    </section>
  );
}
export function PhoneConsentSetup() {
  const { data, mutate, preview } = useProduct();
  const [number, setNumber] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [adult, setAdult] = useState(false),
    [calls, setCalls] = useState(false),
    [transcription, setTranscription] = useState(false),
    [saved, setSaved] = useState(false);
  async function verify(start: boolean) {
    setBusy(true);
    setError("");
    try {
      const result = await mutate<{ validation_code?: string }>(
        start ? "/phone/start" : "/phone/confirm",
        { phone_number: number },
      );
      if (result.validation_code) setCode(result.validation_code);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function consent() {
    setBusy(true);
    try {
      await mutate("/consent", {
        adult,
        recurring_calls: calls,
        transcription,
        recording: false,
      });
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <div className="card-heading">
        <h2>Your phone and permission</h2>
        <PhoneIcon size={26} />
      </div>
      <p>
        Calls are optional. We process your spoken answers to create a private
        journal. Audio is not recorded.
      </p>
      {data?.phones.map((phone) => (
        <p className="saved-note" key={phone.id}>
          <CheckCircleIcon />
          Verified {phone.masked_number}
        </p>
      ))}
      <Field
        label="Your destination phone number"
        hint="Only verify a number you own or are authorized to use."
      >
        <input
          type="tel"
          value={number}
          placeholder="+91…"
          disabled={preview}
          onChange={(e) => setNumber(e.target.value)}
        />
      </Field>
      <div className="button-row">
        <button
          disabled={preview || busy || !number}
          className="button secondary"
          onClick={() => void verify(true)}
        >
          Call me to verify
        </button>
        <button
          disabled={preview || busy || !number}
          className="text-button"
          onClick={() => void verify(false)}
        >
          I've verified it in Twilio
        </button>
      </div>
      <p className="caption">
        The verification button places a Twilio verification call. It is
        separate from a Nila check-in.
      </p>
      {code && (
        <Notice>
          Enter this code when Twilio asks: <strong>{code}</strong>. Then choose
          “I've verified it in Twilio”.
        </Notice>
      )}
      <div className="form-divider" />
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={adult}
          onChange={(e) => setAdult(e.target.checked)}
        />
        I am 18 or older.
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={calls}
          onChange={(e) => setCalls(e.target.checked)}
        />
        I consent to optional AI check-in calls at times I choose. I can pause
        or revoke them.
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={transcription}
          onChange={(e) => setTranscription(e.target.checked)}
        />
        I consent to speech processing by my connected providers and private
        journal creation. Transcript retention is off unless I enable it.
      </label>
      <p className="caption">
        Nila is self-care support, not therapy or an emergency service.{" "}
        <Link href="/privacy">Read the privacy approach.</Link>
      </p>
      <button
        className="button"
        disabled={preview || busy || !adult}
        onClick={() => void consent()}
      >
        Save my choices
      </button>
      {saved && (
        <Notice>
          Permission saved. Declining calls or speech processing pauses
          scheduled calls.
        </Notice>
      )}
      {error && <Notice error>{error}</Notice>}
    </section>
  );
}
export function PreferencesForm() {
  const { data, mutate, preview } = useProduct();
  const [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false);
  if (!data) return null;
  const voices = (data.connections.find((c) => c.provider === "elevenlabs")
    ?.capabilities.voices ?? []) as { id: string; name: string }[];
  async function submit(form: HTMLFormElement) {
    const values = new FormData(form);
    setBusy(true);
    try {
      await mutate(
        "/preferences",
        {
          language: values.get("language"),
          voice_id: values.get("voice_id"),
          retain_transcript: values.get("retain_transcript") === "on",
          retention_days: Number(values.get("retention_days")),
        },
        "PUT",
      );
      setSaved(true);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h2>A voice that feels familiar</h2>
      <form
        key={data.preferences?.voice_id ?? "new"}
        onSubmit={(e) => {
          e.preventDefault();
          void submit(e.currentTarget);
        }}
      >
        <Field
          label="Conversation language"
          hint="Automatic mode supports English, Hindi, Spanish, French and German. Select Tamil explicitly; automatic Tamil detection is not supported in this path."
        >
          <select
            name="language"
            defaultValue={data.preferences?.language ?? "en"}
          >
            {[
              ["auto", "Automatic, supported languages"],
              ["en", "English"],
              ["hi", "Hindi"],
              ["es", "Spanish"],
              ["fr", "French"],
              ["de", "German"],
              ["ta", "Tamil"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ElevenLabs voice">
          <select
            name="voice_id"
            defaultValue={data.preferences?.voice_id || ""}
            required
          >
            <option value="">Connect ElevenLabs, then choose a voice</option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
        <label className="checkbox-row">
          <input
            name="retain_transcript"
            type="checkbox"
            defaultChecked={data.preferences?.retain_transcript ?? false}
          />
          Retain my transcript for review and export
        </label>
        <Field
          label="Transcript retention, in days"
          hint="Transcript retention is independent of your journal. Audio recording is disabled."
        >
          <input
            name="retention_days"
            type="number"
            min={1}
            max={90}
            defaultValue={data.preferences?.retention_days ?? 30}
          />
        </Field>
        <button className="button" disabled={busy || preview || !voices.length}>
          {busy ? "Saving…" : "Save preferences"}
        </button>
        {saved && <Notice>Your preferences are saved.</Notice>}
        {error && <Notice error>{error}</Notice>}
      </form>
    </section>
  );
}
export function ScheduleForm() {
  const { data, mutate, preview } = useProduct();
  const [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false);
  if (!data) return null;
  const schedule = data.schedules[0];
  async function submit(form: HTMLFormElement) {
    const values = new FormData(form);
    setBusy(true);
    try {
      await mutate(
        "/schedule",
        {
          local_time: values.get("local_time"),
          timezone: values.get("timezone"),
          weekdays: values.getAll("weekdays").map(Number),
          enabled: values.get("enabled") === "on",
          phone_id: values.get("phone_id"),
        },
        "PUT",
      );
      setSaved(true);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <span className="eyebrow">A TIME THAT FITS YOUR LIFE</span>
      <h2>Your check-in schedule</h2>
      <p>
        One optional check-in on the days you choose. Pause whenever you need.
      </p>
      <form
        key={schedule?.id ?? "new"}
        onSubmit={(e) => {
          e.preventDefault();
          void submit(e.currentTarget);
        }}
      >
        <div className="form-grid">
          <Field label="Local calling time">
            <input
              type="time"
              required
              name="local_time"
              defaultValue={schedule?.local_time?.slice(0, 5) ?? "20:00"}
            />
          </Field>
          <Field
            label="Time zone"
            hint="Schedules follow local time and daylight-saving changes. Nonexistent spring-forward times are skipped."
          >
            <input
              name="timezone"
              required
              list="timezones"
              defaultValue={schedule?.timezone ?? data.profile.timezone}
            />
            <datalist id="timezones">
              {[
                "Asia/Kolkata",
                "Europe/London",
                "America/New_York",
                "America/Los_Angeles",
                "Asia/Singapore",
                "Australia/Sydney",
              ].map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
        </div>
        <Field label="Verified destination">
          <select
            name="phone_id"
            required
            defaultValue={data.phones[0]?.id ?? ""}
          >
            <option value="">Verify your phone during setup</option>
            {data.phones.map((p) => (
              <option key={p.id} value={p.id}>
                {p.masked_number}
              </option>
            ))}
          </select>
        </Field>
        <fieldset className="weekday-picker">
          <legend>Calling days</legend>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => (
            <label key={day}>
              <input
                name="weekdays"
                type="checkbox"
                value={i + 1}
                defaultChecked={schedule?.weekdays.includes(i + 1) ?? true}
              />
              <span>{day}</span>
            </label>
          ))}
        </fieldset>
        <label className="checkbox-row">
          <input
            name="enabled"
            type="checkbox"
            defaultChecked={schedule?.enabled ?? false}
          />
          Enable scheduled calls
        </label>
        <button
          className="button"
          disabled={preview || busy || !data.phones.length}
        >
          {busy ? "Saving…" : "Save schedule"}
        </button>
        {saved && (
          <Notice>
            Schedule saved. Your next call appears automatically when enabled.
          </Notice>
        )}
        {error && <Notice error>{error}</Notice>}
      </form>
    </section>
  );
}
export function OnboardingView() {
  const { data } = useProduct();
  const [step, setStep] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const { mutate } = useProduct();
  const router = useRouter();
  const steps = [
    "Connect providers",
    "Phone & consent",
    "Voice preferences",
    "Choose your time",
  ];
  async function finish() {
    setBusy(true);
    try {
      await mutate("/onboarding/complete");
      router.push("/dashboard");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">WELCOME TO YOUR LITTLE SPACE</span>
          <h1>Let's make this yours.</h1>
          <p>Four thoughtful steps. You stay in control throughout.</p>
        </div>
      </div>
      <ol className="setup-steps">
        {steps.map((name, i) => (
          <li key={name}>
            <button
              aria-current={step === i ? "step" : undefined}
              onClick={() => setStep(i)}
            >
              <span>{i + 1}</span>
              {name}
            </button>
          </li>
        ))}
      </ol>
      {step === 0 ? (
        <ProviderSetup />
      ) : step === 1 ? (
        <PhoneConsentSetup />
      ) : step === 2 ? (
        <PreferencesForm />
      ) : (
        <ScheduleForm />
      )}
      {error && <Notice error>{error}</Notice>}
      <div className="button-row setup-navigation">
        {step > 0 && (
          <button
            className="button secondary"
            onClick={() => setStep(step - 1)}
          >
            Back
          </button>
        )}
        {step < 3 ? (
          <button className="button" onClick={() => setStep(step + 1)}>
            Continue
          </button>
        ) : (
          <button
            className="button"
            disabled={busy || !data?.consent}
            onClick={() => void finish()}
          >
            {busy ? "Checking setup…" : "Open my private space"}
          </button>
        )}
      </div>
    </>
  );
}
