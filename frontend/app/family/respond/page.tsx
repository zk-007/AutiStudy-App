"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, AlertCircle, Loader2, XCircle } from "lucide-react";
import { ApiError, familyApi } from "@/lib/api/client";
import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";

function RespondInner() {
  const search = useSearchParams();
  const token = (search?.get("token") || "").trim();
  const actionParam = (search?.get("action") || "approve").toLowerCase();
  const action: "approve" | "reject" = actionParam === "reject" ? "reject" : "approve";

  const [phase, setPhase] = useState<"loading" | "ok" | "err">("loading");
  const [detail, setDetail] = useState("");
  const [parentName, setParentName] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setPhase("err");
      setDetail("This approval link is missing a token. Open the link from your email again.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await familyApi.emailRespond(token, action);
        if (cancelled) return;
        setPhase("ok");
        setDetail(res.detail);
        setParentName(res.parent_name ?? res.parent_email ?? null);
      } catch (err) {
        if (cancelled) return;
        setPhase("err");
        setDetail(err instanceof ApiError ? err.detail : "Could not process this link.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, action]);

  return (
    <main className="relative min-h-screen flex flex-col">
      <NavBar />
      <div className="flex-1 flex items-center justify-center px-6 pt-28 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-3xl glass-strong p-8 md:p-10 shadow-deep text-center"
        >
          {phase === "loading" && (
            <>
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-sky-600" />
              <h1 className="mt-4 font-display text-2xl font-extrabold text-deep">
                {action === "approve" ? "Approving…" : "Rejecting…"}
              </h1>
              <p className="mt-2 text-sm text-deep-soft">Please wait a moment.</p>
            </>
          )}

          {phase === "ok" && action === "approve" && (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
              <h1 className="mt-4 font-display text-2xl font-extrabold text-deep">Parent linked</h1>
              <p className="mt-2 text-sm text-deep-soft">
                {parentName
                  ? `${parentName} is now linked to your AutiStudy account.`
                  : detail}
              </p>
            </>
          )}

          {phase === "ok" && action === "reject" && (
            <>
              <XCircle className="mx-auto h-12 w-12 text-rose-500" />
              <h1 className="mt-4 font-display text-2xl font-extrabold text-deep">Request rejected</h1>
              <p className="mt-2 text-sm text-deep-soft">{detail}</p>
            </>
          )}

          {phase === "err" && (
            <>
              <AlertCircle className="mx-auto h-12 w-12 text-amber-500" />
              <h1 className="mt-4 font-display text-2xl font-extrabold text-deep">Could not finish</h1>
              <p className="mt-2 text-sm text-deep-soft">{detail}</p>
              <p className="mt-3 text-xs text-deep-muted">
                You can still open Settings → Family after logging in.
              </p>
            </>
          )}

          <div className="mt-8 flex flex-col gap-2">
            <Link
              href="/dashboard"
              className="rounded-full bg-sky-600 px-5 py-3 text-sm font-bold text-white hover:bg-sky-700"
            >
              Go to Dashboard
            </Link>
            <Link href="/" className="text-sm font-bold text-deep-muted hover:text-deep">
              Home
            </Link>
          </div>
        </motion.div>
      </div>
      <Footer />
    </main>
  );
}

export default function FamilyRespondPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center text-deep-soft">Loading…</main>
      }
    >
      <RespondInner />
    </Suspense>
  );
}
