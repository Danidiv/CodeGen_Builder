import type { Metadata } from "next";
import PublishedSite from "@/components/PublishedSite";
import { loadPublicSite } from "@/lib/serverSite";
import { extractSeo } from "@/lib/siteSeo";

/** Always read fresh: an unpublished or blocked site must disappear at once. */
export const dynamic = "force-dynamic";

type Props = { params: { id: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await loadPublicSite(params.id);
  if (!site) return { title: "NEXA AI site", robots: { index: false } };
  const seo = extractSeo(site.name, site.files);
  return {
    title: seo.title,
    description: seo.description || undefined,
    openGraph: {
      title: seo.title,
      description: seo.description || undefined,
      type: "website",
      ...(seo.image ? { images: [{ url: seo.image }] } : {}),
    },
    twitter: { card: seo.image ? "summary_large_image" : "summary", title: seo.title, description: seo.description || undefined },
  };
}

/** Public page of a published site. The server adds title, description and text; the browser runs the site. */
export default async function Page({ params }: Props) {
  const site = await loadPublicSite(params.id);
  const seo = site ? extractSeo(site.name, site.files) : null;
  return <PublishedSite seo={seo} />;
}
