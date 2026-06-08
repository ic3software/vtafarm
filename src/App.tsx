import { NavBar } from '@/components/home/NavBar'
import { HeroSection } from '@/components/home/HeroSection'
import { HowItWorks } from '@/components/home/HowItWorks'
import { FeaturesSection } from '@/components/home/FeaturesSection'
import { BenefitsSection } from '@/components/home/BenefitsSection'
import { CtaSection } from '@/components/home/CtaSection'
import { FooterSection } from '@/components/home/FooterSection'
import { MobilePreview } from '@/pages/MobilePreview'

function App() {
  if (window.location.pathname === '/preview') {
    return <MobilePreview />
  }

  return (
    <>
      <NavBar />
      <main>
        <HeroSection />
        <HowItWorks />
        <FeaturesSection />
        <BenefitsSection />
        <CtaSection />
      </main>
      <FooterSection />
    </>
  )
}

export default App
