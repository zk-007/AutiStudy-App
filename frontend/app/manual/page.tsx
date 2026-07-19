"use client";

import { motion } from "framer-motion";
import { Printer } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { useLocale } from "@/lib/i18n/LocaleProvider";

interface ManualSection {
  emoji: string;
  title: string;
  intro?: string;
  steps: string[];
}

const GRADIENTS = [
  "from-violet-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-sky-500 to-cyan-600",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-600",
  "from-indigo-500 to-blue-600",
  "from-teal-500 to-emerald-600",
  "from-fuchsia-500 to-pink-600",
];

const SECTIONS_EN: ManualSection[] = [
  {
    emoji: "🚀",
    title: "1. Getting Started",
    intro: "Create your account and tell us a little about how you like to learn — just once.",
    steps: [
      "Tap Sign Up on the home page and fill in your name, email, password, and grade.",
      "Right after signing up, you'll answer a few quick questions: how you like to learn (pictures, listening, reading, or a mix), your preferred language, audio preference, sensory comfort, and explanation style.",
      "These answers are saved permanently — you will never be asked to repeat them. AutiStudy uses them, plus what actually works for you over time, to personalize every lesson.",
    ],
  },
  {
    emoji: "🏠",
    title: "2. Your Dashboard",
    intro: "Your home base — a calm overview of your learning.",
    steps: [
      "See your stars, day streak, quizzes taken, and accuracy at a glance.",
      "Check time spent learning (today / week / total), lessons covered, and today's gentle schedule.",
      "Start with a mood check-in, then watch your Learner Journey tree grow on consecutive study days.",
      "Use the Chat button to open the tutor before picking a subject — or tap a subject card to jump in.",
      "\"Continue where you left off\" lets you resume your most recent conversation with one tap.",
      "Your avatar and name appear at the top — change your avatar anytime from Settings.",
    ],
  },
  {
    emoji: "💬",
    title: "3. Chatting With Your Tutor",
    intro: "Ask anything about your subject, in your own words.",
    steps: [
      "Type your question in the box at the bottom of the chat and press Send.",
      "Your tutor checks your textbook content first — if the topic isn't in your grade's book, it will tell you clearly and suggest topics that are.",
      "For real textbook questions, your tutor answers using whichever format has worked best for you before.",
    ],
  },
  {
    emoji: "🎨",
    title: "4. Four Ways Your Tutor Can Explain",
    intro: "Every student learns differently, so every explanation can take one of four shapes.",
    steps: [
      "📝 Simple text — a short, plain-language paragraph.",
      "🪜 Step-by-step — a friendly breakdown with a concept flowchart and an example.",
      "🖼️ Picture — a custom illustration made just for your question.",
      "🔊 Voice — the answer is read aloud, with Play / Pause / Stop / Replay controls and a progress bar.",
      "After every explanation, tap 👍 Got it or 👎 Not yet. A 👎 offers you the other formats to try instead — no explanation is ever repeated word-for-word.",
      "If several formats in a row don't help, your tutor offers a short calming breathing break before trying again with a fresh approach.",
    ],
  },
  {
    emoji: "🏆",
    title: "5. Quizzes",
    intro: "Turn what you just learned into a quick, friendly quiz.",
    steps: [
      "Open the Quiz tab from the navigation bar, or generate one directly from a chat conversation.",
      "Answer multiple-choice questions at your own pace — there's no timer pressure.",
      "See your score and a short explanation for each answer right away, and retake a quiz anytime to practice again.",
    ],
  },
  {
    emoji: "📈",
    title: "6. Tracking Your Progress",
    intro: "Watch your learning add up over time.",
    steps: [
      "The Progress page shows accuracy trends, subject breakdowns, and how fast you're answering.",
      "Stars celebrate completed quizzes and lessons; your streak counts consecutive days you've studied.",
      "Nothing here is a race — it's just a gentle way to see how far you've come.",
    ],
  },
  {
    emoji: "⚙️",
    title: "7. Settings — Making It Yours",
    intro: "Open Settings from the gear icon in the navigation bar, anytime.",
    steps: [
      "Appearance — adjust font size and reduce animations for a calmer screen.",
      "Accessibility — high contrast, focus mode (hides decoration), and auto read-aloud.",
      "Voice — choose your tutor's narrator voice (6 options, each with a preview button), and adjust reading speed and volume. These apply everywhere your tutor speaks.",
      "Language — switch between English and Urdu instantly.",
      "Profile — change your avatar, and view your name, grade, and stars.",
      "Account — change your grade/class, change your registered email (password-confirmed), change your password, or permanently delete your account.",
    ],
  },
  {
    emoji: "👨‍👩‍👧",
    title: "8. For Parents",
    intro: "Stay gently informed without hovering over every session.",
    steps: [
      "Your child receives a 6-digit family code after signing up — ask them to share it with you.",
      "Create a Parent account and enter the family code, your child's name, and matching B-Form/CNIC details to link.",
      "View a friendly Parent Dashboard summarizing quizzes, accuracy, favourite subjects, and time spent learning.",
    ],
  },
  {
    emoji: "🔒",
    title: "9. Privacy & Camera",
    intro: "You're always in control.",
    steps: [
      "The camera is completely optional and only used, with consent, to gently read comfort/engagement in real time — no video is ever recorded or saved.",
      "Your data is never sold, and only you and your linked parent can see your progress.",
      "See the full FAQ page for detailed answers about privacy, camera use, and more.",
    ],
  },
  {
    emoji: "📬",
    title: "10. Contact the Team",
    intro: "Need help or want to share feedback? Use the Contact page anytime.",
    steps: [
      "Open Contact from the navigation bar (or footer).",
      "Fill in your name, email, role (student / parent / teacher), subject, and message — then Send.",
      "Your message is saved for the AutiStudy team to review. You can also email the team addresses shown on the page.",
    ],
  },
];

const SECTIONS_UR: ManualSection[] = [
  {
    emoji: "🚀",
    title: "1. شروعات",
    intro: "اپنا اکاؤنٹ بنائیں اور صرف ایک بار بتائیں کہ آپ کیسے سیکھنا پسند کرتے ہیں۔",
    steps: [
      "ہوم پیج پر Sign Up دبائیں اور اپنا نام، ای میل، پاس ورڈ، اور گریڈ درج کریں۔",
      "سائن اپ کے فوراً بعد چند سوالات پوچھے جائیں گے: آپ کیسے سیکھنا پسند کرتے ہیں (تصاویر، سننا، پڑھنا، یا مکس)، زبان، آواز کی ترجیح، حسی آرام، اور explanation style۔",
      "یہ جوابات مستقل طور پر محفوظ ہو جاتے ہیں — آپ سے دوبارہ کبھی نہیں پوچھا جائے گا۔ آٹی اسٹڈی ان کے ساتھ، وقت کے ساتھ جو واقعی کام کرے، اسے استعمال کر کے ہر سبق ذاتی بناتا ہے۔",
    ],
  },
  {
    emoji: "🏠",
    title: "2. آپ کا ڈیش بورڈ",
    intro: "آپ کا ہوم بیس — سیکھنے کا پرسکون جائزہ۔",
    steps: [
      "ایک نظر میں اپنے ستارے، دن کا سلسلہ، حل کیے گئے کوئز، اور درستگی دیکھیں۔",
      "سیکھنے کا وقت (آج / ہفتہ / کل)، مکمل اسباق، اور آج کا نرم شیڈول چیک کریں۔",
      "Mood check-in سے شروع کریں، پھر مسلسل دن پڑھائی پر Learner Journey درخت بڑھتا دیکھیں۔",
      "Chat بٹن سے مضمون چنے بغیر ٹیوٹر کھولیں — یا مضمون کارڈ سے سیدھا شروع کریں۔",
      "\"وہیں سے جاری رکھیں\" سے ایک ٹیپ میں اپنی حالیہ گفتگو دوبارہ شروع کریں۔",
      "آپ کا avatar اور نام اوپر دکھائی دیتا ہے — Settings سے کبھی بھی avatar بدل سکتے ہیں۔",
    ],
  },
  {
    emoji: "💬",
    title: "3. اپنے ٹیوٹر سے بات چیت",
    intro: "اپنے مضمون کے بارے میں کچھ بھی، اپنے الفاظ میں پوچھیں۔",
    steps: [
      "چیٹ کے نیچے موجود باکس میں اپنا سوال لکھیں اور Send دبائیں۔",
      "آپ کا ٹیوٹر پہلے آپ کی کتاب کا مواد چیک کرتا ہے — اگر موضوع آپ کے گریڈ کی کتاب میں نہیں، تو یہ واضح بتا دیا جائے گا اور موجود موضوعات تجویز کیے جائیں گے۔",
      "کتاب سے متعلق سوالات کے لیے، ٹیوٹر وہی format استعمال کرتا ہے جو پہلے آپ کے لیے سب سے کامیاب رہا ہو۔",
    ],
  },
  {
    emoji: "🎨",
    title: "4. ٹیوٹر کے سمجھانے کے چار طریقے",
    intro: "ہر طالب علم مختلف انداز میں سیکھتا ہے، اس لیے ہر وضاحت چار میں سے کوئی ایک شکل لے سکتی ہے۔",
    steps: [
      "📝 سادہ متن — ایک مختصر، آسان زبان میں پیراگراف۔",
      "🪜 قدم بہ قدم — concept flowchart اور مثال کے ساتھ دوستانہ وضاحت۔",
      "🖼️ تصویر — آپ کے سوال کے لیے خاص طور پر بنائی گئی illustration۔",
      "🔊 آواز — جواب بلند آواز میں پڑھا جاتا ہے، Play/Pause/Stop/Replay اور progress bar کے ساتھ۔",
      "ہر وضاحت کے بعد 👍 Got it یا 👎 Not yet دبائیں۔ 👎 پر باقی formats آزمانے کا موقع ملتا ہے — کوئی وضاحت لفظ بہ لفظ دہرائی نہیں جاتی۔",
      "اگر کئی formats سے مدد نہ ملے، تو ٹیوٹر ایک مختصر breathing break پیش کرتا ہے اور پھر نئے انداز سے دوبارہ کوشش کرتا ہے۔",
    ],
  },
  {
    emoji: "🏆",
    title: "5. کوئز",
    intro: "جو کچھ ابھی سیکھا اسے ایک مختصر، دوستانہ کوئز میں بدلیں۔",
    steps: [
      "نیویگیشن بار سے Quiz ٹیب کھولیں، یا کسی چیٹ گفتگو سے براہ راست کوئز بنائیں۔",
      "اپنی رفتار سے multiple-choice سوالات کے جواب دیں — کوئی timer کا دباؤ نہیں۔",
      "فوراً اپنا اسکور اور ہر جواب کی مختصر وضاحت دیکھیں، اور کبھی بھی دوبارہ پریکٹس کے لیے کوئز لیں۔",
    ],
  },
  {
    emoji: "📈",
    title: "6. اپنی پیش رفت دیکھنا",
    intro: "وقت کے ساتھ اپنی سیکھنے کی پیش رفت دیکھیں۔",
    steps: [
      "Progress صفحہ درستگی کے رجحانات، مضامین کی تفصیل، اور رفتار دکھاتا ہے۔",
      "ستارے مکمل کیے گئے کوئز اور اسباق مناتے ہیں؛ سلسلہ لگاتار پڑھائی کے دن شمار کرتا ہے۔",
      "یہاں کوئی مقابلہ نہیں — یہ صرف یہ دیکھنے کا نرم طریقہ ہے کہ آپ کتنا آگے بڑھے۔",
    ],
  },
  {
    emoji: "⚙️",
    title: "7. Settings — اپنی مرضی کے مطابق",
    intro: "نیویگیشن بار کے gear آئیکن سے کبھی بھی Settings کھولیں۔",
    steps: [
      "Appearance — حروف کا سائز اور حرکات کم کریں پرسکون اسکرین کے لیے۔",
      "Accessibility — زیادہ کانٹراسٹ، Focus Mode، اور خودکار پڑھنا۔",
      "Voice — اپنے ٹیوٹر کی narrator آواز چنیں (6 options، ہر ایک preview button کے ساتھ)، اور پڑھنے کی رفتار اور والیوم adjust کریں۔ یہ ہر جگہ لاگو ہوتا ہے جہاں ٹیوٹر بولتا ہے۔",
      "Language — فوری طور پر انگریزی اور اردو کے درمیان بدلیں۔",
      "Profile — اپنا avatar بدلیں، اور نام، گریڈ، ستارے دیکھیں۔",
      "Account — اپنا گریڈ/کلاس بدلیں، اپنا رجسٹرڈ ای میل بدلیں (پاس ورڈ کی تصدیق کے ساتھ)، پاس ورڈ تبدیل کریں، یا اکاؤنٹ مستقل طور پر حذف کریں۔",
    ],
  },
  {
    emoji: "👨‍👩‍👧",
    title: "8. والدین کے لیے",
    intro: "ہر سیشن پر نظر رکھے بغیر، نرمی سے باخبر رہیں۔",
    steps: [
      "سائن اپ کے بعد آپ کے بچے کو 6 ہندسوں کا family code ملتا ہے — ان سے یہ کوڈ لیں۔",
      "Parent اکاؤنٹ بنائیں اور family code، بچے کا نام، اور B-Form/CNIC تفصیلات درج کر کے لنک کریں۔",
      "کوئز، درستگی، پسندیدہ مضامین، اور پڑھائی کے وقت کا خلاصہ دکھانے والا Parent Dashboard دیکھیں۔",
    ],
  },
  {
    emoji: "🔒",
    title: "9. رازداری اور کیمرا",
    intro: "کنٹرول ہمیشہ آپ کے ہاتھ میں ہے۔",
    steps: [
      "کیمرا مکمل طور پر اختیاری ہے اور صرف رضامندی سے، حقیقی وقت میں آرام/دلچسپی پڑھنے کے لیے استعمال ہوتا ہے — کوئی ویڈیو کبھی محفوظ نہیں ہوتی۔",
      "آپ کا ڈیٹا کبھی فروخت نہیں ہوتا، اور صرف آپ اور آپ کے منسلک والدین آپ کی پیش رفت دیکھ سکتے ہیں۔",
      "رازداری، کیمرے کے استعمال، اور مزید کی تفصیلی معلومات کے لیے مکمل FAQ صفحہ دیکھیں۔",
    ],
  },
  {
    emoji: "📬",
    title: "10. ٹیم سے رابطہ",
    intro: "مدد چاہیے یا رائے دینا ہے؟ Contact صفحہ کبھی بھی استعمال کریں۔",
    steps: [
      "نیویگیشن بار (یا فوٹر) سے Contact کھولیں۔",
      "نام، ای میل، کردار (طالب علم / والدین / استاد)، موضوع، اور پیغام بھریں — پھر Send دبائیں۔",
      "آپ کا پیغام AutiStudy ٹیم کے لیے محفوظ ہو جاتا ہے۔ صفحے پر دی گئی ٹیم ای میلز پر بھی لکھ سکتے ہیں۔",
    ],
  },
];

export default function ManualPage() {
  const { locale, isRTL } = useLocale();
  const sections = locale === "ur" ? SECTIONS_UR : SECTIONS_EN;
  const isUr = locale === "ur";

  return (
    <PageShell
      title={isUr ? "آٹی اسٹڈی صارف رہنما" : "AutiStudy User Manual"}
      subtitle={
        isUr
          ? "ایپ کا مکمل، خوبصورت رہنما — نیچے پڑھیں یا PDF کے طور پر محفوظ کریں۔"
          : "Everything AutiStudy can do, in one calm, illustrated guide. Read it here, or save it as a PDF."
      }
    >
      <div className="no-print flex justify-center mb-10">
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-3 text-sm font-bold text-white shadow-soft hover:shadow-md transition-all hover:-translate-y-0.5"
        >
          <Printer size={16} />
          {isUr ? "پرنٹ کریں / PDF کے طور پر محفوظ کریں" : "Print / Save as PDF"}
        </button>
      </div>

      <div className="space-y-5">
        {sections.map((section, i) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
            className="manual-section rounded-3xl glass-strong overflow-hidden shadow-soft"
          >
            <div
              className={`flex items-center gap-3 bg-gradient-to-r ${GRADIENTS[i % GRADIENTS.length]} px-6 py-4 text-white`}
            >
              <span className="text-2xl">{section.emoji}</span>
              <h2 className="font-display text-lg md:text-xl font-extrabold">{section.title}</h2>
            </div>
            <div className="px-6 py-5 md:px-8 md:py-6">
              {section.intro && (
                <p className="text-sm md:text-base text-deep-soft mb-4 italic">{section.intro}</p>
              )}
              <ul className="space-y-2.5">
                {section.steps.map((step, si) => (
                  <li key={si} className="flex items-start gap-2.5 text-sm md:text-base text-deep leading-relaxed">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-glacier-400 flex-shrink-0" />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        ))}
      </div>

      <p className="no-print mt-10 text-center text-xs text-deep-muted">
        {isUr ? "آٹی اسٹڈی v2.0 · 2026 · محبت سے بنایا گیا۔" : "AutiStudy v2.0 · 2026 · Built with care."}
      </p>

      <style jsx global>{`
        @media print {
          nav,
          footer,
          .no-print {
            display: none !important;
          }
          body {
            background: white !important;
          }
          .manual-section {
            box-shadow: none !important;
            border: 1px solid #e5e7eb !important;
            break-inside: avoid;
            page-break-inside: avoid;
            margin-bottom: 14px !important;
          }
        }
      `}</style>
    </PageShell>
  );
}
