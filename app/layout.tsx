import type { Metadata } from "next";
import { loadScreenData } from "@/lib/screen_data";
import { formatDate } from "@/lib/format";
import NamePicker from "./_components/NamePicker";
import NavMenu from "./_components/NavMenu";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://atliq-sales-crm-assistant-five.vercel.app"),
  title: "AtliQ Sales & CRM Assistant",
  description: "No customer should wait more than 7 days for a reply. AI extracts promises from email and call notes, rules set dates and order, sellers approve every change. Capstone prototype on synthetic data.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "AtliQ Sales & CRM Assistant",
    description: "No customer should wait more than 7 days for a reply. AI extracts, rules decide, sellers approve. Capstone prototype on synthetic data.",
    url: "/",
    siteName: "AtliQ Sales & CRM Assistant",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

// Accounts joins the menu in its own slice, if time is left.
const MENU = [
  { href: "/", label: "Daily brief" },
  { href: "/owed", label: "Owed list" },
  { href: "/crm", label: "CRM changes" },
  { href: "/capture", label: "Quick capture" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/about", label: "About" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const d = loadScreenData();
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">Skip to the content</a>
        <header className="band">
          <div className="band-top">
            <div className="brand-row">
              <span className="logo-plate">
                <img src="/atliq_logo.svg" alt="AtliQ Technologies logo" width={96} height={30} />
              </span>
              <span className="product">AtliQ Sales &amp; CRM Assistant</span>
            </div>
            <div className="meta-row">
              <span className="label">Capstone Prototype</span>
              <span className="chip date-chip">Dataset date {formatDate(d.referenceDate)}</span>
            </div>
            <NamePicker sellers={d.sellers} />
          </div>
          <NavMenu items={MENU} />
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
          <p>Capstone prototype for the Codebasics AI PM cohort, built for AtliQ Technologies as the case study client. Not an official AtliQ product. Synthetic data.</p>
          <p>Product managed by <a href="https://www.linkedin.com/in/najabatalikhan">Najabat Ali Khan</a>, AI Product Manager. <a href="/about">About this build</a>.</p>
        </footer>
      </body>
    </html>
  );
}
