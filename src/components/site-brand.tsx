import { siteManifest } from "@/config/site-manifest";
/** Shared brand symbol for public pages, authentication and administration. */
export function SiteBrand({ size = 32 }: { size?: number }) {
  const brand = siteManifest.ui.brand;
  return brand.logoPath ? (
    <img src={brand.logoPath} alt={brand.name} width={size} height={size} />
  ) : (
    <span
      aria-label={brand.name}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: 8,
        background: siteManifest.ui.theme.accent,
        color: "white",
        fontWeight: 700,
      }}
    >
      {brand.mark}
    </span>
  );
}
