"use client";
import Link from "next/link";
import { useProduct } from "./product-context";
import { Notice, Skeleton } from "./ui";
export function ViewBoundary({ children }: { children: React.ReactNode }) {
  const { loading, data, error, refresh } = useProduct();
  return data ? (
    children
  ) : loading ? (
    <Skeleton />
  ) : (
    <section className="card page-stack" aria-labelledby="connection-title">
      <span className="eyebrow">YOUR PRIVATE SPACE</span>
      <h1 id="connection-title">Let's reconnect your space</h1>
      <Notice error>
        {error || "Your information could not load. Please try again."}
      </Notice>
      <p>
        Your approved check-ins will appear once the private data service is
        available.
      </p>
      <div className="row">
        <button className="button" onClick={() => void refresh()}>
          Try again
        </button>
        <Link className="button secondary" href="/preview">
          Explore the design preview
        </Link>
      </div>
    </section>
  );
}
