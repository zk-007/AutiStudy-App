import { Suspense } from "react";
import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { HeroIntro } from "@/components/landing/HeroIntro";
import { Features } from "@/components/landing/Features";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { CTABanner } from "@/components/landing/CTABanner";

export default function HomePage() {
  return (
    <main className="relative">
      <NavBar />
      <Suspense fallback={<div className="min-h-screen" />}>
        <HeroIntro />
      </Suspense>
      <Features />
      <HowItWorks />
      <CTABanner />
      <Footer />
    </main>
  );
}
