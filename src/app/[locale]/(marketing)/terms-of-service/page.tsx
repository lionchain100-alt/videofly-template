import { siteManifest as siteBrand } from "@/config/site-manifest";
import { useTranslations } from "next-intl";
import type { Locale } from "@/config/i18n-config";
import { buildAlternates } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  const alternates = buildAlternates("/terms-of-service", locale);

  return {
    title: "Terms of Service",
    alternates: {
      canonical: alternates.canonical,
      languages: alternates.languages,
    },
  };
}

export default function TermsOfServicePage() {
  const t = useTranslations("Terms");

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Terms of Service</h1>
      <div className="prose dark:prose-invert">
        <p>Last updated: {new Date().getFullYear()}</p>

        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing and using {siteBrand.ui.brand.name}, you accept and agree
          to be bound by the terms and provision of this agreement.
        </p>

        <h2>2. Use License</h2>
        <p>
          Permission is granted to temporarily download one copy of the
          materials (information or software) on {siteBrand.ui.brand.name}'s
          website for personal, non-commercial transitory viewing only.
        </p>

        <h2>3. Disclaimer</h2>
        <p>
          The materials on {siteBrand.ui.brand.name}'s website are provided "as
          is". {siteBrand.ui.brand.name} makes no warranties, expressed or
          implied, and hereby disclaims and negates all other warranties.
        </p>

        <h2>4. Limitations</h2>
        <p>
          In no event shall {siteBrand.ui.brand.name} or its suppliers be liable
          for any damages (including, without limitation, damages for loss of
          data or profit, or due to business interruption) arising out of the
          use or inability to use the materials on {siteBrand.ui.brand.name}'s
          website.
        </p>
      </div>
    </div>
  );
}
