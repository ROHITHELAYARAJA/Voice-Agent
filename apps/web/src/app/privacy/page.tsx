import Link from "next/link";
import { Brand } from "@/components/ui";
export default function Privacy() {
  return (
    <main id="main" className="legal">
      <Brand />
      <h1>Your space, your say.</h1>
      <p>
        Nila is designed for adult self-care and reflection. It does not offer
        therapy, diagnosis, treatment or emergency response.
      </p>
      <h2>Calls begin with your permission</h2>
      <p>
        You choose your schedule and verified phone number. Recurring calls and
        transcription require explicit consent, and each conversation asks if it
        is a good time. Pause calls or withdraw consent whenever you need.
      </p>
      <h2>Recording stays off</h2>
      <p>
        This release does not enable recordings. Transcripts are used
        temporarily to validate the journal. Saving a transcript for longer
        requires a separate preference. Your journal remains until you edit or
        delete it.
      </p>
      <h2>Provider processing</h2>
      <p>
        Your connected Twilio, Deepgram and ElevenLabs accounts process
        telephone audio and conversation data. Their terms and retention
        policies also apply. Nila stores your provider credentials encrypted on
        the backend and never returns them to the dashboard.
      </p>
      <h2>Private by design</h2>
      <p>
        Account-specific authorization protects journals and mood records.
        Administrative tools show account and system status, not personal
        journal content. You can export your data and delete entries. Account
        deletion requires identity verification.
      </p>
      <h2>Before public launch</h2>
      <p>
        The owner must publish the final data controller contact, hosting
        regions, subprocessors, retention and support details. This page
        describes the implementation and is not a completed legal privacy
        notice. The service has not yet been approved for public production use.
      </p>
      <p style={{ marginTop: 30 }}>
        <Link className="button-link secondary" href="/">
          Back to Nila
        </Link>
      </p>
    </main>
  );
}
