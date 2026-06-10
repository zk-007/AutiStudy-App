"use client";

import { motion } from "framer-motion";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { Bot, Layers, Target, Sparkles } from "lucide-react";

const ICONS = [Bot, Layers, Target, Sparkles];

// Each pillar gets its own personality color so the row reads as a varied
// palette rather than four identical chips. Colors stay within the calm
// glacier/mint/amber/rose family established by the rest of the site.
const ICON_GRADIENTS = [
  "from-glacier-200 to-glacier-400 text-deep",     // AI Tutor — glacier blue
  "from-mint-200 to-mint-400 text-deep",           // Multimodal — mint
  "from-rose-200 to-rose-300 text-rose-900",       // Personalised — soft rose
  "from-amber-200 to-amber-300 text-amber-900",    // Progress — warm amber
];

export function Features() {
  const { t } = useLocale();
  return (
    <section id="features" className="relative px-6 md:px-10 py-24">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="text-center max-w-2xl mx-auto"
        >
          <h2 className="font-display text-3xl md:text-5xl font-extrabold tracking-tight text-deep">
            {t.features.heading}
          </h2>
          <p className="mt-4 text-lg text-deep-soft">{t.features.sub}</p>
        </motion.div>

        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {t.features.items.map((item, i) => {
            const Icon = ICONS[i];
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.6, delay: i * 0.1, ease: "easeOut" }}
                whileHover={{ y: -6, transition: { duration: 0.25 } }}
                className="group relative rounded-3xl glass-strong p-7 shadow-soft hover:shadow-deep transition-shadow"
              >
                <div className={`mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${ICON_GRADIENTS[i]} group-hover:scale-110 group-hover:rotate-[-4deg] transition-transform duration-300`}>
                  <Icon size={26} strokeWidth={2.2} />
                </div>
                <h3 className="font-display text-xl font-extrabold text-deep">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-deep-soft">
                  {item.desc}
                </p>
                {/* Soft shine on hover */}
                <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br from-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
