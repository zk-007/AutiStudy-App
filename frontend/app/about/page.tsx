"use client";

import { motion } from "framer-motion";
import { Mail } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { useLocale } from "@/lib/i18n/LocaleProvider";

interface TeamMember {
  name: string;
  id: string;
  email: string;
}

interface AboutBlock {
  emoji: string;
  title: string;
  body: string;
  members?: TeamMember[];
}

const MEMBER_GRADIENTS = [
  "from-sky-400 to-blue-500",
  "from-rose-400 to-pink-500",
  "from-emerald-400 to-teal-500",
  "from-amber-400 to-orange-500",
];

function TeamGrid({ members }: { members: TeamMember[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-6 pb-6 md:px-8 md:pb-8">
      {members.map((member, i) => {
        const initial = member.name.trim().charAt(0).toUpperCase();
        return (
          <a
            key={member.id}
            href={`mailto:${member.email}`}
            className="flex items-center gap-3.5 rounded-2xl bg-white/70 border border-glacier-100 p-4 hover:bg-white hover:shadow-soft transition-all"
          >
            <div
              className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${MEMBER_GRADIENTS[i % MEMBER_GRADIENTS.length]} text-white font-display font-extrabold text-lg shadow-soft`}
            >
              {initial}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-deep text-sm truncate">{member.name}</div>
              <div className="text-xs text-deep-muted">{member.id}</div>
              <div className="flex items-center gap-1 text-xs text-violet-600 mt-0.5 truncate">
                <Mail size={11} className="flex-shrink-0" />
                <span className="truncate">{member.email}</span>
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}

const GRADIENTS = [
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-500",
  "from-sky-500 to-cyan-600",
  "from-rose-500 to-pink-600",
  "from-indigo-500 to-blue-600",
];

function Section({ block, gradient, index }: { block: AboutBlock; gradient: string; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.08 }}
      className="rounded-3xl glass-strong overflow-hidden shadow-soft"
    >
      <div className={`flex items-center gap-3 bg-gradient-to-r ${gradient} px-6 py-4 text-white`}>
        <span className="text-2xl">{block.emoji}</span>
        <h2 className="font-display text-lg md:text-xl font-extrabold">{block.title}</h2>
      </div>
      <p
        className={`px-6 pt-5 md:px-8 md:pt-6 text-base md:text-lg leading-relaxed text-deep-soft text-balance ${
          block.members ? "pb-2" : "pb-5 md:pb-6"
        }`}
      >
        {block.body}
      </p>
      {block.members && <TeamGrid members={block.members} />}
    </motion.div>
  );
}

export default function AboutPage() {
  const { t } = useLocale();
  const a = t.pages.about;

  const blocks: AboutBlock[] = [a.intro, a.mission, a.why, a.different, a.vision, a.team];

  return (
    <PageShell title={a.title} subtitle={a.body}>
      <div className="space-y-5">
        {blocks.map((block, i) => (
          <Section key={block.title} block={block} gradient={GRADIENTS[i % GRADIENTS.length]} index={i} />
        ))}
      </div>
    </PageShell>
  );
}
