import { MotionConfig } from "motion/react";
import { DOC_PAGES } from "./pages/Docs.tsx";
import { Hero, Nav } from "./sections/Hero.tsx";
import { Bento, Closing, Faq, Footer, Uses } from "./sections/More.tsx";
import { Agents, Plain } from "./sections/Plain.tsx";
import { Recorder } from "./sections/Story.tsx";
import { Proof, Stack } from "./sections/Proof.tsx";
import { Savings, Versus } from "./sections/Switch.tsx";
import { Voices } from "./sections/Voices.tsx";
import { DownloadToast } from "./ui.tsx";

/** One app for every prerendered page; `path` picks the landing page or a document. */
export function App({ path = "/" }: { path?: string }) {
  const Doc = DOC_PAGES[path];
  return (
    <MotionConfig reducedMotion="user">
      <Nav />
      <main>
        {Doc ? (
          <Doc />
        ) : (
          <>
            <Hero />
            <Stack />
            <Plain />
            <Proof />
            <Versus />
            <Recorder />
            <Bento />
            <Uses />
            <Voices />
            <Savings />
            <Agents />
            <Faq />
            <Closing />
          </>
        )}
      </main>
      <Footer />
      <DownloadToast />
    </MotionConfig>
  );
}
