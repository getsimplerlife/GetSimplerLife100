import { useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { getUser, submitLead } from '~/db/queries';
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute('/contact')({
  head: () => pageHead("/contact"),
  loader: async () => {
    const user = await getUser();
    return { user };
  },
  component: Contact,
});

const industries = [
  "Energy", "Manufacturing", "Automotive", "Financial Services", "Logistics",
  "Healthcare", "Legal", "Accounting", "Insurance", "Retail",
  "Ecommerce", "Construction", "Real Estate", "Hospitality", "Education",
  "Nonprofits", "Government", "Technology", "Telecom", "Marketing",
  "HR", "Agriculture", "Other"
];

function Contact() {
  const { user } = Route.useLoaderData();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    industry: '',
    problem: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<{
    tier: string;
    title: string;
    price: string;
    explanation: string;
    cta: string;
    link: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await submitLead({ data: formData });

      // Generate assessment recommendation based on input
      const problem = formData.problem.toLowerCase();
      const industry = formData.industry.toLowerCase();

      let recommendation;

      if (problem.includes('existing') || problem.includes('already') || problem.includes('maintain') || problem.includes('current')) {
        recommendation = {
          tier: 'Support',
          title: 'Growth Package',
          price: 'From $15,000',
          explanation: `You already have systems in motion. Rather than rebuilding, we can deploy AI operations that monitor and maintain your ${industry} workflows, handling volume spikes and freeing your team to focus on exceptions.`,
          cta: 'View Builder Packages',
          link: '/pricing'
        };
      } else if (problem.length > 60 && (problem.includes('every') || problem.includes('daily') || problem.includes('each') || problem.includes('repeat') || problem.includes('process') || problem.includes('approve') || problem.includes('review') || problem.includes('enter') || problem.includes('copy'))) {
        recommendation = {
          tier: 'Build',
          title: 'Starter Package',
          price: 'From $7,500',
          explanation: `This is exactly the kind of repeatable workflow AI handles best. For a ${industry} company, we'd build an AI employee to automate this process end-to-end — a one-time build package plus a monthly fee per AI employee — integrating with your existing tools.`,
          cta: 'View Builder Packages',
          link: '/pricing'
        };
      } else if (problem.length > 30) {
        recommendation = {
          tier: 'Design',
          title: 'Growth Package',
          price: 'From $15,000',
          explanation: `You've identified a real opportunity in ${industry}. Let's map how an AI employee fits your workflow — a one-time build package plus a monthly fee per AI employee, with live integrations for Xero, Slack, Google, Microsoft, HubSpot, and DocuSign today.`,
          cta: 'View Builder Packages',
          link: '/pricing'
        };
      } else {
        recommendation = {
          tier: 'Discover',
          title: 'Free 30-Minute Assessment',
          price: 'Free',
          explanation: `Based on what you've shared, the best first step is a quick conversation. In 30 minutes we can pinpoint where AI would save you the most time in your ${industry} operations and map out the next steps.`,
          cta: 'Start Your Free Assessment',
          link: '#contact'
        };
      }

      setAssessment(recommendation);
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-stone-950 text-stone-100">
      <header className="px-6 py-4 border-b border-stone-800 bg-stone-950">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-black text-emerald-400 tracking-tight">
            Simpler Life 100
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/" className="text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors">
              Home
            </Link>
            {user ? (
              <Link to="/portal" className="text-sm font-bold text-emerald-400 border border-emerald-600 px-4 py-1.5 rounded-lg hover:bg-emerald-500/10 transition-colors">Dashboard</Link>
            ) : (
              <Link to="/login" className="text-sm font-bold text-emerald-400 hover:text-emerald-300">Login</Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 bg-stone-950 py-20 px-6">
        <div className="max-w-3xl mx-auto">
          {assessment ? (
            /* Assessment Result */
            <div className="bg-stone-900 rounded-[2.5rem] p-12 lg:p-16 shadow-xl border border-stone-800 text-center">
              <div className="inline-block px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold text-sm uppercase tracking-wider mb-6 border border-emerald-500/20">
                Recommended: {assessment.tier}
              </div>
              <h2 className="text-4xl lg:text-5xl font-black text-white mb-6 leading-tight">
                {assessment.title}
              </h2>
              <div className="text-2xl font-black text-emerald-400 mb-8">
                {assessment.price}
              </div>
              <p className="text-xl text-stone-400 leading-relaxed mb-10 max-w-2xl mx-auto">
                {assessment.explanation}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <Link
                  to={assessment.link as any}
                  className="bg-emerald-600 text-white px-10 py-4 rounded-xl font-bold text-lg hover:bg-emerald-500 transition-all shadow-lg"
                >
                  {assessment.cta}
                </Link>
                <button
                  onClick={() => setAssessment(null)}
                  className="text-stone-400 font-bold hover:text-stone-300 transition-colors"
                >
                  Start Over
                </button>
              </div>
            </div>
          ) : (
            /* Assessment Form */
            <>
              <div className="text-center mb-12">
                <h1 className="text-4xl lg:text-5xl font-black text-white mb-4 tracking-tight">
                  Free AI Workflow Assessment
                </h1>
                <p className="text-xl text-stone-400 max-w-2xl mx-auto leading-relaxed">
                  Tell us what's slowing your team down. We'll analyze your workflow and recommend the best next step — no commitment, no call required. Prefer email? Reach us at <a href="mailto:electric.vortexz@gmail.com" className="text-emerald-400 hover:text-emerald-300 underline">electric.vortexz@gmail.com</a>.
                </p>
              </div>

              <div className="bg-stone-900 rounded-[2.5rem] p-10 lg:p-14 shadow-xl border border-stone-800">
                <form onSubmit={handleSubmit} className="space-y-8">
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-bold text-stone-300 mb-2">Your Name</label>
                      <input
                        type="text"
                        required
                        placeholder="Jane Smith"
                        className="w-full rounded-xl border border-stone-800 bg-stone-950 px-4 py-3 placeholder-stone-500 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition text-lg"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-stone-300 mb-2">Work Email</label>
                      <input
                        type="email"
                        required
                        placeholder="jane@company.com"
                        className="w-full rounded-xl border border-stone-800 bg-stone-950 px-4 py-3 placeholder-stone-500 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition text-lg"
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-stone-300 mb-2">Company</label>
                    <input
                      type="text"
                      required
                      placeholder="Company name"
                      className="w-full rounded-xl border border-stone-800 bg-stone-950 px-4 py-3 placeholder-stone-500 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition text-lg"
                      value={formData.company}
                      onChange={e => setFormData({ ...formData, company: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-stone-300 mb-2">Industry</label>
                    <select
                      required
                      className="w-full rounded-xl border border-stone-800 bg-stone-950 px-4 py-3 placeholder-stone-500 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition text-lg"
                      value={formData.industry}
                      onChange={e => setFormData({ ...formData, industry: e.target.value })}
                    >
                      <option value="" disabled>Select your industry</option>
                      {industries.map(ind => (
                        <option key={ind} value={ind}>{ind}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-stone-300 mb-2">What manual work is eating your team's time?</label>
                    <textarea
                      rows={5}
                      required
                      placeholder="Describe the repetitive task or workflow that's slowing your team down. The more detail you share, the better our recommendation."
                      className="w-full rounded-xl border border-stone-800 bg-stone-950 px-4 py-3 placeholder-stone-500 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition text-lg resize-none"
                      value={formData.problem}
                      onChange={e => setFormData({ ...formData, problem: e.target.value })}
                    />
                  </div>

                  {error && (
                    <div className="bg-red-950/40 border border-red-800 text-red-300 px-4 py-3 rounded-xl text-sm font-medium">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold text-xl hover:bg-emerald-700 transition-all disabled:opacity-50 shadow-lg"
                  >
                    {loading ? 'Analyzing...' : 'Get My Recommendation →'}
                  </button>

                  <p className="text-center text-sm text-stone-400 font-medium">
                    No spam. No sales calls. Just a clear recommendation based on your input.
                  </p>
                </form>
              </div>
            </>
          )}
        </div>
      </main>

      <footer className="px-6 py-12 border-t border-stone-800 text-center text-sm text-stone-400 bg-stone-950">
        <p>&copy; {new Date().getFullYear()} Simpler Life 100. All rights reserved.</p>
      </footer>
    </div>
  );
}