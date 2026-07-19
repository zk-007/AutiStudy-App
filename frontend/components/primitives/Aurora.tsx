"use client";

export function Aurora() {
  return (
    <div
      aria-hidden
      data-decorative
      className="aurora-bg fixed inset-0 -z-10 overflow-hidden bg-aurora"
    >
      <div
        className="bg-orb aurora-orb-a animate-float-slow"
        style={{
          width: "520px",
          height: "520px",
          top: "-10%",
          left: "-8%",
        }}
      />
      <div
        className="bg-orb aurora-orb-b animate-float-slow"
        style={{
          width: "640px",
          height: "640px",
          bottom: "-15%",
          right: "-10%",
          animationDelay: "2s",
        }}
      />
      <div
        className="bg-orb aurora-orb-c animate-float-slow"
        style={{
          width: "420px",
          height: "420px",
          top: "40%",
          left: "60%",
          animationDelay: "4s",
        }}
      />
    </div>
  );
}
