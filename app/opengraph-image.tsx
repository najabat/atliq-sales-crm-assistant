import { ImageResponse } from "next/og";

export const alt = "AtliQ Sales & CRM Assistant. Capstone prototype on synthetic data";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#061033" }}>
        <div style={{ width: 14, height: "100%", display: "flex", background: "linear-gradient(180deg, #6711FF 0%, #9963FF 100%)" }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 28, fontWeight: 700, letterSpacing: 2, color: "#B9A6FF" }}>ATLIQ TECHNOLOGIES</div>
            <div style={{ display: "flex", fontSize: 66, fontWeight: 700, color: "#F7F6FB", marginTop: 24 }}>AtliQ Sales &amp; CRM Assistant</div>
            <div style={{ display: "flex", fontSize: 36, color: "#DED9EF", marginTop: 24, lineHeight: 1.35, maxWidth: 900 }}>No customer should wait more than 7 days for a reply, however busy the team gets.</div>
            <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: "#B9A6FF", marginTop: 36 }}>AI extracts. Rules decide. Sellers approve.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", fontSize: 24, color: "#061033", background: "#DED9EF", borderRadius: 22, padding: "8px 20px" }}>Capstone prototype on synthetic data</div>
            <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color: "#F7F6FB" }}>Live demo</div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
