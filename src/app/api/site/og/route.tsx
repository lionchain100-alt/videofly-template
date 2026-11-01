import { ImageResponse } from "next/og";
import { readSiteManifest } from "@/config/site-server";
export const dynamic = "force-dynamic";
export async function GET() {
  const { ui } = await readSiteManifest();
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#f8fafc",
        color: "#101828",
        padding: 80,
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 64,
          fontWeight: 700,
          color: ui.theme.accent,
        }}
      >
        {ui.brand.name}
      </div>
      <div style={{ display: "flex", fontSize: 36, marginTop: 30 }}>
        {ui.content.title.en}
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
