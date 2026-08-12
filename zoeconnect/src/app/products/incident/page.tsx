import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { productPages } from "@/data/product-pages";
import { ProductPageTemplate } from "@/components/templates/product-page-template";

const content = productPages.find((p) => p.slug === "incident");

export const metadata: Metadata = {
  title: content?.name ?? "Product",
  description: content?.description,
};

export default function Page() {
  if (!content) return notFound();
  return <ProductPageTemplate content={content} />;
}
