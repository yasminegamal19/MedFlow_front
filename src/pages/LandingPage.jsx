import Navbar from "../components/navbar/Navbar";
import Hero from "../components/hero/Hero";
import Trust from "../components/trust/Trust";
import Problem from "../components/problem/Problem";
import HowItWorks from "../components/howItWorks/HowItWorks";
import AiWorkFlow from "../components/AiWorkFlow/AiWorkFlow";
import Features from "../components/features/Features";
import Security from "../components/security/Security";
import Pricing from "../components/pricing/Pricing";
import Faq from "../components/faq/Faq";
import CTA from "../components/cta/CTA";
import Footer from "../components/footer/Footer";

export default function LandingPage() {
  return (
    <div className="app">
    

      <Navbar />

      <main id="main">
        <Hero />
        <Trust />
        <Problem />
        <HowItWorks />
        <AiWorkFlow />
        <Features />
        <Security />
        <Pricing />
        <Faq />
        <CTA />
      </main>

      <Footer />
    </div>
  );
}
