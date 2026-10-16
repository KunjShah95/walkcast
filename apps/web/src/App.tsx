import { MotionConfig } from "motion/react";
import { Hero, Nav } from "./sections/Hero.tsx";
import { Bento, Closing, DownloadSection, Faq, Footer, Pricing, Uses } from "./sections/More.tsx";
import { Flow, Outputs, Recorder } from "./sections/Story.tsx";

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <Nav />
      <main>
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
      </main>
      <Footer />
    </MotionConfig>
  );
}
