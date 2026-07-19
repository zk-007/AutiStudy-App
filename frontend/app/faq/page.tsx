"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Search, X } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const CATEGORY_META: Record<string, { emoji: string; gradient: string }> = {
  General: { emoji: "✨", gradient: "from-violet-500 to-purple-600" },
  Privacy: { emoji: "🔒", gradient: "from-rose-500 to-pink-600" },
  "Camera Usage": { emoji: "📷", gradient: "from-sky-500 to-cyan-600" },
  "Subjects Covered": { emoji: "📚", gradient: "from-emerald-500 to-teal-600" },
  "Learning Style Customization": { emoji: "🎨", gradient: "from-amber-500 to-orange-500" },
  "Progress Tracking": { emoji: "📈", gradient: "from-indigo-500 to-blue-600" },
  "عمومی": { emoji: "✨", gradient: "from-violet-500 to-purple-600" },
  "رازداری": { emoji: "🔒", gradient: "from-rose-500 to-pink-600" },
  "کیمرے کا استعمال": { emoji: "📷", gradient: "from-sky-500 to-cyan-600" },
  "مضامین": { emoji: "📚", gradient: "from-emerald-500 to-teal-600" },
  "سیکھنے کا انداز": { emoji: "🎨", gradient: "from-amber-500 to-orange-500" },
  "پیش رفت": { emoji: "📈", gradient: "from-indigo-500 to-blue-600" },
};

function metaFor(category: string) {
  return CATEGORY_META[category] ?? { emoji: "❓", gradient: "from-glacier-500 to-deep" };
}

export default function FAQPage() {
  const { t, isRTL } = useLocale();
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const allCategories = useMemo(() => {
    const seen: string[] = [];
    for (const item of t.pages.faq.items) {
      const cat = item.category ?? "General";
      if (!seen.includes(cat)) seen.push(cat);
    }
    return seen;
  }, [t.pages.faq.items]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, { q: string; a: string }[]>();
    for (const item of t.pages.faq.items) {
      const cat = item.category ?? "General";
      if (activeCategory && cat !== activeCategory) continue;
      if (q && !item.q.toLowerCase().includes(q) && !item.a.toLowerCase().includes(q)) continue;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push({ q: item.q, a: item.a });
    }
    return Array.from(map.entries());
  }, [t.pages.faq.items, query, activeCategory]);

  const noResults = query.trim().length > 0 && groups.length === 0;

  return (
    <PageShell title={t.pages.faq.title}>
      {/* Search */}
      <div className="relative mb-6 max-w-xl mx-auto">
        <Search
          size={18}
          className={`absolute top-1/2 -translate-y-1/2 text-deep-muted ${isRTL ? "right-4" : "left-4"}`}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={isRTL ? "سوال تلاش کریں…" : "Search a question…"}
          className={`w-full rounded-full glass-strong shadow-soft py-3.5 text-sm md:text-base text-deep placeholder:text-deep-muted focus:outline-none focus:ring-2 focus:ring-violet-400 ${
            isRTL ? "pr-11 pl-11" : "pl-11 pr-11"
          }`}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className={`absolute top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-glacier-100 text-deep-soft hover:bg-glacier-200 ${
              isRTL ? "left-4" : "right-4"
            }`}
            aria-label="Clear search"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Category quick-jump chips */}
      <div className="flex flex-wrap justify-center gap-2 mb-9">
        <button
          onClick={() => setActiveCategory(null)}
          className={`rounded-full px-4 py-2 text-xs md:text-sm font-bold transition-all ${
            activeCategory === null
              ? "bg-deep text-white shadow-soft"
              : "bg-white/70 text-deep-soft border border-glacier-100 hover:bg-white"
          }`}
        >
          {isRTL ? "سب" : "All"}
        </button>
        {allCategories.map((cat) => {
          const meta = metaFor(cat);
          const active = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(active ? null : cat)}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs md:text-sm font-bold transition-all ${
                active
                  ? `bg-gradient-to-r ${meta.gradient} text-white shadow-soft`
                  : "bg-white/70 text-deep-soft border border-glacier-100 hover:bg-white"
              }`}
            >
              <span>{meta.emoji}</span>
              {cat}
            </button>
          );
        })}
      </div>

      {noResults ? (
        <div className="text-center py-14 text-deep-muted">
          <div className="text-4xl mb-3">🔍</div>
          <p>{isRTL ? "کوئی نتیجہ نہیں ملا۔" : "No matching questions found."}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(([category, items], groupIdx) => {
            const meta = metaFor(category);
            return (
              <motion.div
                key={category}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: groupIdx * 0.06 }}
                className="rounded-3xl glass-strong overflow-hidden shadow-soft"
              >
                <div
                  className={`flex items-center gap-3 bg-gradient-to-r ${meta.gradient} px-6 py-4 text-white`}
                >
                  <span className="text-2xl">{meta.emoji}</span>
                  <h2 className="font-display text-lg md:text-xl font-extrabold">{category}</h2>
                  <span className="ms-auto text-xs font-bold bg-white/20 rounded-full px-2.5 py-1">
                    {items.length}
                  </span>
                </div>
                <div className="divide-y divide-glacier-50">
                  {items.map((item, i) => {
                    const key = `${category}-${i}`;
                    const isOpen = open === key;
                    return (
                      <div key={key}>
                        <button
                          onClick={() => setOpen(isOpen ? null : key)}
                          className="flex w-full items-center justify-between gap-4 px-6 py-5 md:px-8 md:py-5 text-left hover:bg-glacier-50/60 transition-colors"
                        >
                          <span className="font-display text-sm md:text-base font-bold text-deep">
                            {item.q}
                          </span>
                          <motion.div
                            animate={{ rotate: isOpen ? 180 : 0 }}
                            transition={{ duration: 0.3 }}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-glacier-100 text-deep-soft flex-shrink-0"
                          >
                            <ChevronDown size={16} />
                          </motion.div>
                        </button>
                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: "easeInOut" }}
                            >
                              <p className="px-6 md:px-8 pb-5 text-sm md:text-base text-deep-soft leading-relaxed">
                                {item.a}
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
