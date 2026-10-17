import { MotionConfig } from "motion/react";
import { DOC_PAGES } from "./pages/Docs.tsx";
import { Hero, Nav } from "./sections/Hero.tsx";
import { Bento, Closing, DownloadSection, Faq, Footer, Pricing, Uses } from "./sections/More.tsx";
import { Flow, Outputs, Recorder } from "./sections/Story.tsx";

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
            <Outputs />
            <Recorder />
            <Flow />
            <Bento />
            <Uses />
            <Pricing />
            <DownloadSection />
            <Faq />
            <Closing />
          </>
        )}
      </main>
      <Footer />
    </MotionConfig>
  );
}
