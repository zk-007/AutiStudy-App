"use client";

export function Aurora() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 overflow-hidden bg-aurora"
    >
      {/* Floating soft orbs that drift slowly for depth */}
      <div
        className="bg-orb animate-float-slow"
        style={{
          width: "520px",
          height: "520px",
          background: "radial-gradient(circle, #BEE3F8 0%, transparent 70%)",
          top: "-10%",
          left: "-8%",
        }}
      />
      <div
        className="bg-orb animate-float-slow"
        style={{
          width: "640px",
          height: "640px",
          background: "radial-gradient(circle, #C8E6E0 0%, transparent 70%)",
          bottom: "-15%",
          right: "-10%",
          animationDelay: "2s",
        }}
      />
      <div
        className="bg-orb animate-float-slow"
        style={{
          width: "420px",
          height: "420px",
          background: "radial-gradient(circle, #DCEEF5 0%, transparent 70%)",
          top: "40%",
          left: "60%",
          animationDelay: "4s",
        }}
      />
    </div>
  );
}
