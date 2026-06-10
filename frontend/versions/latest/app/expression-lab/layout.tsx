import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Expression Lab | AutiStudy",
  description: "Compare real-time facial expression recognition strategies",
};

export default function ExpressionLabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
