import { createFileRoute } from "@tanstack/react-router";
import { Header } from "~/components/Header";
import { Footer } from "~/components/Footer";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/terms")({
  head: () => pageHead("/terms"),
  component: TermsPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-stone-900 py-6">
      <h2 className="text-lg font-black text-white mb-2">{title}</h2>
      <div className="text-stone-400 text-sm leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

function TermsPage() {
  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 selection:bg-emerald-500 selection:text-stone-950">
      <Header businessName="Simpler Life 100" />
      <div className="max-w-3xl mx-auto px-6 pt-14 pb-16">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-900/30 border border-emerald-800/50 text-emerald-400 text-xs font-mono font-bold tracking-wider mb-6">
          TERMS OF SERVICE
        </span>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2">Terms of Service</h1>
        <p className="text-stone-500 text-sm mb-8">Last updated: present day. Questions: <a className="text-emerald-400 underline" href="mailto:electric.vortexz@gmail.com">electric.vortexz@gmail.com</a>.</p>

        <Section title="The service">
          <p>Simpler Life 100 provides AI Operations Teams: AI employees configured to automate tasks within your business, deployed as part of a setup/build package and ongoing monthly service. Use of the service is subject to these terms.</p>
        </Section>

        <Section title="Your account and responsibilities">
          <p>You are responsible for maintaining the confidentiality of your account credentials and for activities that occur under your account. You agree to provide accurate information and to authorize the integrations your AI employees use.</p>
        </Section>

        <Section title="Fees and payment">
          <p>Purchases are one-time setup or build fees and recurring monthly fees per AI employee, as described at the time of purchase and processed through our payment provider. By purchasing, you agree to pay the amounts shown for the services you select. Recurring fees continue until cancelled in accordance with the applicable plan.</p>
        </Section>

        <Section title="Integrations and connection health">
          <p>Our service connects to third-party applications you authorize (such as Xero, HubSpot, Slack, Google, Microsoft, and DocuSign). We work to keep connections reliable and self-healing, and we notify you if a connection fails or needs your attention. We are not responsible for the availability, policies, or actions of third-party services you connect.</p>
        </Section>

        <Section title="Acceptable use">
          <p>You agree not to misuse the service, including attempting unauthorized access, using the service for unlawful activity, or interfering with its operation.</p>
        </Section>

        <Section title="No warranty and limitation of liability">
          <p>The service is provided on an "as is" and "as available" basis without warranties of any kind. To the fullest extent permitted by law, Simpler Life 100 is not liable for indirect, incidental, or consequential damages arising from your use of the service.</p>
        </Section>

        <Section title="Termination">
          <p>You may stop using the service at any time. We may suspend or terminate access for breach of these terms or for misuse. Sections that by their nature should survive termination will survive.</p>
        </Section>

        <Section title="Contact">
          <p>For any questions about these terms, email <a className="text-emerald-400 underline" href="mailto:electric.vortexz@gmail.com">electric.vortexz@gmail.com</a>.</p>
        </Section>
      </div>
      <Footer />
    </div>
  );
}
