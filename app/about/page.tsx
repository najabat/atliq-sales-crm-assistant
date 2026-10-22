import type { Metadata } from "next";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "About this build. AtliQ Sales & CRM Assistant",
};

// The product manager's story of this build. Fixed text, so it must be kept accurate when the numbers change. See D32.
export default function About() {
  return (
    <>
      <h1>About this build</h1>
      <p>I&apos;m Najabat Ali Khan, an AI Product Manager. I built this product as my capstone for the Codebasics AI PM Cohort 2, with AtliQ Technologies as the case study client. It was one of the top 5 capstones from a cohort of 80+ AI PMs and was presented to the evaluation panel at Demo Day on 18 October 2026.</p>

      <section aria-labelledby="problem">
        <h2 id="problem" className="band-sub">The problem</h2>
        <p>On 10 July, 11 AtliQ customers had waited more than 7 days for a reply. They held $303k of a $503k open pipeline. Not one of the 40 CRM records had a follow-up date. In office hours AtliQ&apos;s CEO put it simply. &quot;We find out what&apos;s urgent by accident.&quot;</p>
      </section>

      <section aria-labelledby="obvious">
        <h2 id="obvious" className="band-sub">Why the obvious fix fails</h2>
        <p>The team had already agreed twice to update the CRM the same day. It didn&apos;t stick. Sellers work on the move, and the founders sell while running the company. So the product couldn&apos;t be one more chore. It had to read what already exists.</p>
      </section>

      <section aria-labelledby="north-star">
        <h2 id="north-star" className="band-sub">The North Star</h2>
        <p>Customers waiting more than 7 days, from 11 to zero. The CEO named it as his first priority. It counts customers, not clicks, and it moves within days.</p>
      </section>

      <section aria-labelledby="how">
        <h2 id="how" className="band-sub">How it works</h2>
        <p>AI extracts, rules decide, sellers approve. The model only reads free text and pulls out promises, asks and dates. Code checks every quote word for word against its source and drops anything it can&apos;t find. Rules set the dates, counts and order. A seller approves every change. The product sends nothing and changes nothing by itself.</p>
      </section>

      <section aria-labelledby="proof">
        <h2 id="proof" className="band-sub">How I proved it</h2>
        <p>I signed off an answer key of 41 must-find items before writing the first prompt, so the test couldn&apos;t bend to the results.</p>
        <ul className="flags">
          <li>All 5 safety gates pass. No invented quotes, owners or dates. No records merged. None of 5 hidden instructions in test emails was followed.</li>
          <li>It finds 78 to 88% of what AtliQ owes, and 56 to 64% of what it shows is right.</li>
          <li>The verdict is safe to trust with a person approving, and not ready to run alone.</li>
        </ul>
      </section>

      <section aria-labelledby="hardest">
        <h2 id="hardest" className="band-sub">The hardest call</h2>
        <p>A stronger model, Claude Sonnet, won the benchmark I set in advance. But it counted 13 waiting customers instead of 11. I kept Claude Haiku for the pilot. It gets the headline number exactly right at about a twentieth of the cost per correct item. The lesson became a rule. An exact North Star is now a gate for any model.</p>
      </section>

      <section aria-labelledby="numbers">
        <h2 id="numbers" className="band-sub">By the numbers</h2>
        <p>$1.73 for every model call in the whole build. 32 decisions logged, each with its reason and its cost. Lighthouse mobile accessibility score 100.</p>
      </section>

      <section aria-labelledby="role">
        <h2 id="role" className="band-sub">My role</h2>
        <p>I was the product manager. I ran discovery, framed the problem, chose the North Star, wrote the requirements, designed the evals and the answer key, and made every trade-off. Claude Code wrote the code under my direction. Every decision is in the public decisions log.</p>
      </section>

      <section aria-labelledby="next">
        <h2 id="next" className="band-sub">What&apos;s next</h2>
        <p>A read-only, supervised pilot with the four sellers, then three experiments.</p>
        <ul className="flags">
          <li>Read each document three times and keep only items found at least twice.</li>
          <li>Send only the unsure items to a stronger model.</li>
          <li>Turn on Quick capture.</li>
        </ul>
      </section>

      <section aria-labelledby="links">
        <h2 id="links" className="band-sub">Links</h2>
        <ul className="flags">
          <li><a className="tap" href="https://lnkd.in/p/dr4JCAKP">Watch the demo</a></li>
          <li><a className="tap" href="https://github.com/najabat/atliq-sales-crm-assistant">Code on GitHub</a></li>
          <li><a className="tap" href="https://github.com/najabat/atliq-sales-crm-assistant/blob/main/docs/DECISIONS.md">Decisions log</a></li>
          <li><a className="tap" href="https://www.linkedin.com/in/najabatalikhan">Connect on LinkedIn</a></li>
        </ul>
      </section>
    </>
  );
}
