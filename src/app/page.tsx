import { Navigation } from "@/components/Navigation";
import { Hero } from "@/components/Hero";
import { Thesis } from "@/components/Thesis";
import { ProblemComparison } from "@/components/ProblemComparison";
import { Pipeline } from "@/components/Pipeline";
import { ReconciliationDashboard } from "@/components/ReconciliationDashboard";
import { CfoQuestions } from "@/components/CfoQuestions";
import { Capabilities } from "@/components/Capabilities";
import { ArchitectureDiagram } from "@/components/ArchitectureDiagram";
import { UseCases } from "@/components/UseCases";
import { Vision } from "@/components/Vision";
import { Security } from "@/components/Security";
import { DeveloperAPI } from "@/components/DeveloperAPI";
import { Company } from "@/components/Company";
import { FinalCta } from "@/components/FinalCta";
import { Footer } from "@/components/Footer";

export default function HomePage() {
  return (
    <>
      <Navigation />
      <main id="main" className="flex-1">
        <Hero />
        <Thesis />
        <ProblemComparison />
        <Pipeline />
        <ReconciliationDashboard />
        <CfoQuestions />
        <Capabilities />
        <ArchitectureDiagram />
        <UseCases />
        <Vision />
        <Security />
        <DeveloperAPI />
        <Company />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
