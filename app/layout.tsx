import type { Metadata } from "next";
import { loadScreenData } from "@/lib/screen_data";
import { formatDate } from "@/lib/format";
import NamePicker from "./_components/NamePicker";
import NavMenu from "./_components/NavMenu";
import "./globals.css";

export const metadata: Metadata = {
  title: "AtliQ Sales & CRM Assistant",
  description: "Capstone Prototype",
  robots: { index: false, follow: false },
};

// Accounts joins the menu in its own slice, if time is left.
const MENU = [
  { href: "/", label: "Daily brief" },
  { href: "/owed", label: "Owed list" },
  { href: "/crm", label: "CRM changes" },
  { href: "/capture", label: "Quick capture" },
  { href: "/how-it-works", label: "How it works" },
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
        </footer>
      </body>
    </html>
  );
}
