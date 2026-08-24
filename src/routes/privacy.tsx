import { createFileRoute } from "@tanstack/react-router";
import { Header } from "~/components/Header";
import { Footer } from "~/components/Footer";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/privacy")({
  head: () => pageHead("/privacy"),
  component: PrivacyPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-stone-900 py-6">
      <h2 className="text-lg font-black text-white mb-2">{title}</h2>
      <div className="text-stone-400 text-sm leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 selection:bg-emerald-500 selection:text-stone-950">
      <Header businessName="Simpler Life 100" />
      <div className="max-w-3xl mx-auto px-6 pt-14 pb-16">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-900/30 border border-emerald-800/50 text-emerald-400 text-xs font-mono font-bold tracking-wider mb-6">
          PRIVACY POLICY
        </span>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2">Privacy Policy</h1>
        <p className="text-stone-500 text-sm mb-8">Last updated: present day. Questions: <a className="text-emerald-400 underline" href="mailto:electric.vortexz@gmail.com">electric.vortexz@gmail.com</a>.</p>

        <Section title="What this product is">
          <p>Simpler Life 100 builds and manages AI Operations Teams: AI employees that help businesses automate tasks such as quote-to-cash workflows, document processing, notifications, and data entry across the apps you authorize us to connect.</p>
        </Section>

        <Section title="Information we collect">
          <p>We collect information you provide directly: your account email and a password (stored securely as a hashed credential) when you register for or access the portal, and contact or business details you submit through forms or during onboarding.</p>
          <p>When you connect a third-party service (such as Xero, HubSpot, Slack, Google, Microsoft, or DocuSign), we store the connection credentials and tokens needed to operate that integration, and we may process data in those systems (such as invoices, deals, contacts, documents, or messages) to perform the tasks you ask us to automate.</p>
          <p>When you upload documents for processing, we store them so the AI employee can work on them and so you can review the results.</p>
        </Section>

        <Section title="How we use information">
          <p>We use the information we collect to provide, operate, secure, and improve the service: to run your AI employees, to connect to and synchronize your authorized services, to process purchases and billing through our payment provider, to send you operational notifications you requested, and to respond to support requests.</p>
          <p>We do not sell your personal information.</p>
        </Section>

        <Section title="How we share information">
          <p>We share information only as needed to provide the service: with third-party services you have authorized us to connect to, with our payment processor to complete purchases you make, and with service providers that help us operate the platform. We do not share your data for advertising purposes.</p>
        </Section>

        <Section title="Security and retention">
          <p>We take reasonable measures to protect your information, including hashing passwords and storing connection credentials securely. We retain information for as long as needed to provide the service or as required by law.</p>
        </Section>

        <Section title="Your choices">
          <p>You can disconnect integrations, delete uploaded documents, and request access to or deletion of your data at any time by contacting us at <a className="text-emerald-400 underline" href="mailto:electric.vortexz@gmail.com">electric.vortexz@gmail.com</a>.</p>
        </Section>

        <Section title="Contact">
          <p>For any privacy questions or requests, email <a className="text-emerald-400 underline" href="mailto:electric.vortexz@gmail.com">electric.vortexz@gmail.com</a>.</p>
        </Section>
      </div>
      <Footer />
    </div>
  );
}
