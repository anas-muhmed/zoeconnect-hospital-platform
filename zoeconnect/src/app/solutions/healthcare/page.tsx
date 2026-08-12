import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { solutionPages } from "@/data/solution-pages";
import { SolutionPageTemplate } from "@/components/templates/solution-page-template";

const content = solutionPages.find((p) => p.slug === "healthcare");

export const metadata: Metadata = {
  title: `${content?.name ?? "Solution"} Solutions`,
  description: content?.description,
};

export default function Page() {
  if (!content) return notFound();
  return <SolutionPageTemplate content={content} />;
}
