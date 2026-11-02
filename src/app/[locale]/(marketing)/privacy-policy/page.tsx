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
  const alternates = buildAlternates("/privacy-policy", locale);

  return {
    title: "Privacy Policy",
    alternates: {
      canonical: alternates.canonical,
      languages: alternates.languages,
    },
  };
}

export default function PrivacyPolicyPage() {
  const t = useTranslations("Privacy");

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
      <div className="prose dark:prose-invert">
        <p>Last updated: {new Date().getFullYear()}</p>

        <h2>1. Introduction</h2>
        <p>
          Welcome to {siteBrand.ui.brand.name}. We respect your privacy and are
          committed to protecting your personal data.
        </p>

        <h2>2. Data We Collect</h2>
        <p>
          We collect information you provide directly to us when you create an
          account, generate videos, or contact support.
        </p>

        <h2>3. How We Use Your Data</h2>
        <p>
          We use your data to provide and improve our services, including
          generating AI videos and maintaining your transaction history.
        </p>

        <h2>4. Data Security</h2>
        <p>
          We implement appropriate security measures to protect your personal
          information.
        </p>

        <h2>5. Contact Us</h2>
        <p>
          If you have questions about this policy, please contact us at{" "}
          {siteBrand.contact.supportEmail}.
        </p>
      </div>
    </div>
  );
}
