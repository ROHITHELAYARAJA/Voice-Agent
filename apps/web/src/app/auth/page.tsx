import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
export default function Auth() {
  return (
    <Suspense
      fallback={
        <main id="main" className="auth-form">
          <div className="skeleton" />
        </main>
      }
    >
      <AuthForm />
    </Suspense>
  );
}
