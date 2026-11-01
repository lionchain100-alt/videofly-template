import { localePath } from "@/config/site-manifest";
import { siteManifest as siteBrand } from "@/config/site-manifest";
import type { Locale } from "@/config/i18n-config";
import { buildAlternates } from "@/lib/seo";

interface ModelPageProps {
  params: Promise<{
    locale: Locale;
  }>;
}

const pathSegment = "wan-2-6";

export async function generateMetadata({ params }: ModelPageProps) {
  const { locale } = await params;
  const alternates = buildAlternates(`/${pathSegment}`, locale);

  return {
    title: `Wan 2.6 - ${siteBrand.ui.brand.name}`,
    description: "Advanced video generation model",
    alternates: {
      canonical: alternates.canonical,
      languages: alternates.languages,
    },
  };
}

export default async function ModelPage({ params }: ModelPageProps) {
  const { locale } = await params;

  return (
    <div className="container mx-auto px-4 py-20">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-6">Wan 2.6</h1>
        <p className="text-xl text-muted-foreground mb-8">Coming soon...</p>
        <div className="flex justify-center gap-4">
          <a
            href={localePath(locale, `/image-to-video`)}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Try Image to Video
          </a>
          <a
            href={localePath(locale, `/text-to-video`)}
            className="px-6 py-3 border border-border rounded-lg hover:bg-accent transition-colors"
          >
            Try Text to Video
          </a>
        </div>
      </div>
    </div>
  );
}
