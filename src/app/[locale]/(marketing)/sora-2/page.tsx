import { localePath } from "@/config/site-manifest";
import { siteManifest as siteBrand } from "@/config/site-manifest";
import type { Locale } from "@/config/i18n-config";
import { buildAlternates } from "@/lib/seo";

interface ModelPageProps {
  params: Promise<{
    locale: Locale;
  }>;
}

const modelInfo: Record<
  string,
  { name: string; provider: string; description: string }
> = {
  "sora-2": {
    name: "Sora 2",
    provider: "OpenAI",
    description: "Create stunning videos from text prompts with Sora 2",
  },
  "veo-3-1": {
    name: "Veo 3.1",
    provider: "Google",
    description: "High-quality video generation by Google DeepMind",
  },
  "seedance-1-5": {
    name: "Seedance 1.5",
    provider: "ByteDance",
    description: "Professional AI video generation",
  },
  "wan-2-6": {
    name: "Wan 2.6",
    provider: "Alibaba",
    description: "Advanced video generation model",
  },
};
const pathSegment = "sora-2";

export async function generateMetadata({ params }: ModelPageProps) {
  const { locale } = await params;
  const alternates = buildAlternates(`/${pathSegment}`, locale);
  const info = modelInfo[pathSegment];

  return {
    title: `${info?.name || "Model"} - ${siteBrand.ui.brand.name}`,
    description: info?.description || "AI Video Generation Platform",
    alternates: {
      canonical: alternates.canonical,
      languages: alternates.languages,
    },
  };
}

export default async function ModelPage({ params }: ModelPageProps) {
  const { locale } = await params;

  // Get the model name from the file path (we'll use a simpler approach)
  const modelName = modelInfo[pathSegment]?.name || "Model";

  return (
    <div className="container mx-auto px-4 py-20">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-6">{modelName}</h1>
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
