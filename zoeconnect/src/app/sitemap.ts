import type { MetadataRoute } from "next";
import { productPages } from "@/data/product-pages";
import { solutionPages } from "@/data/solution-pages";

const base = "https://www.zoeconnect.ai";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = [
    "",
    "/sign-in",
    "/company/about",
    "/company/careers",
    "/company/blog",
    "/company/contact",
    "/resources/documentation",
    "/resources/api",
    "/resources/downloads",
    "/resources/help-center",
  ];

  const productRoutes = productPages.map((p) => `/products/${p.slug}`);
  const solutionRoutes = solutionPages.map((p) => `/solutions/${p.slug}`);

  return [...staticRoutes, ...productRoutes, ...solutionRoutes].map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: path === "" ? 1 : 0.7,
  }));
}
