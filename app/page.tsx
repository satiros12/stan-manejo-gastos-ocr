"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { SessionProvider } from "next-auth/react";

function HomeRedirect() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (session) {
      router.replace("/app/dashboard");
    } else {
      router.replace("/login");
    }
  }, [status, session, router]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--color-bg)" }}>
      <div className="spinner w-8 h-8 border-2 border-[var(--color-accent)] border-t-transparent rounded-full" />
    </div>
  );
}

export default function HomePage() {
  return (
    <SessionProvider>
      <HomeRedirect />
    </SessionProvider>
  );
}
