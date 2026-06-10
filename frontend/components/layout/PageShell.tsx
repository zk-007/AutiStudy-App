"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";
import { NavBar } from "./NavBar";
import { Footer } from "./Footer";

export function PageShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="relative min-h-screen">
      <NavBar />
      <div className="px-6 md:px-10 pt-32 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mx-auto max-w-5xl text-center"
        >
          <h1 className="font-display text-4xl md:text-6xl font-extrabold tracking-tight text-deep text-balance">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-5 mx-auto max-w-2xl text-lg text-deep-soft">
              {subtitle}
            </p>
          )}
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
          className="mx-auto max-w-5xl mt-12"
        >
          {children}
        </motion.div>
      </div>
      <Footer />
    </main>
  );
}
