import { useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/contact')({
  loader: async () => {
    let user = null;
    try {
      const res = await fetch("/api/me");
      if (res.ok) user = await res.json();
    } catch {}
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
      await fetch('/api/submit-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      // Generate assessment recommendation based on input
      const problem = formData.problem.toLowerCase();
      const industry = formData.industry.toLowerCase();

      let recommendation;

      if (problem.includes('existing') || problem.includes('already') || problem.includes('maintain') || problem.includes('current')) {
        recommendation = {
          tier: 'Support',
          title: 'Managed Operations',
          price: 'From $750/mo',
          explanation: `You already have systems in motion. Rather than rebuilding, we can deploy AI agents that monitor and maintain your ${industry} workflows, handling volume spikes and freeing your team to focus on exceptions.`,
          cta: 'Explore Support Plans',
          link: '#pricing'
        };
      } else if (problem.length > 60 && (problem.includes('every') || problem.includes('daily') || problem.includes('each') || problem.includes('repeat') || problem.includes('process') || problem.includes('approve') || problem.includes('review') || problem.includes('enter') || problem.includes('copy'))) {
        recommendation = {
          tier: 'Build',
          title: 'Implementation',
          price: 'From $7,500',
          explanation: `This is exactly the kind of repeatable workflow AI handles best. For a ${industry} company, we'd build a custom agent to automate this process end-to-end — integrating with your existing tools and cutting the time spent to near zero.`,
          cta: 'View Implementation Packages',
          link: '#pricing'
        };
      } else if (problem.length > 30) {
        recommendation = {
          tier: 'Design',
          title: 'Automation Blueprint',
          price: '$2,500',
          explanation: `You've identified a real opportunity in ${industry}. Before we build, we recommend a Deep-Dive Blueprint — a full analysis of your workflow, a technical roadmap, and projected ROI. This fee is credited toward implementation.`,
          cta: 'Get Your Blueprint',
          link: '/audit'
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
    <div className="flex flex-col min-h-screen">
      <header className="px-6 py-4 border-b bg-white">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-black text-indigo-600 tracking-tight">
            Simpler Life 100
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">
              Home
            </Link>
            {user ? (
              <Link to="/portal" className="text-sm font-bold text-indigo-600 border border-indigo-600 px-4 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">Dashboard</Link>
            ) : (
              <Link to="/login" className="text-sm font-bold text-indigo-600 hover:text-indigo-700">Login</Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 bg-slate-50 py-20 px-6">
        <div className="max-w-3xl mx-auto">
          {assessment ? (
            /* Assessment Result */
            <div className="bg-white rounded-[2.5rem] p-12 lg:p-16 shadow-xl border border-slate-100 text-center">
              <div className="inline-block px-4 py-1.5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm uppercase tracking-wider mb-6">
                Recommended: {assessment.tier}
              </div>
              <h2 className="text-4xl lg:text-5xl font-black text-slate-900 mb-6 leading-tight">
                {assessment.title}
              </h2>
              <div className="text-2xl font-black text-indigo-600 mb-8">
                {assessment.price}
              </div>
              <p className="text-xl text-slate-600 leading-relaxed mb-10 max-w-2xl mx-auto">
                {assessment.explanation}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <Link
                  to={assessment.link as any}
                  className="bg-indigo-600 text-white px-10 py-4 rounded-xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                >
                  {assessment.cta}
                </Link>
                <button
                  onClick={() => setAssessment(null)}
                  className="text-slate-500 font-bold hover:text-slate-700 transition-colors"
                >
                  Start Over
                </button>
              </div>
            </div>
          ) : (
            /* Assessment Form */
            <>
              <div className="text-center mb-12">
                <h1 className="text-4xl lg:text-5xl font-black text-slate-900 mb-4 tracking-tight">
                  Free AI Workflow Assessment
                </h1>
                <p className="text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed">
                  Tell us what's slowing your team down. We'll analyze your workflow and recommend the best next step — no commitment, no call required.
                </p>
              </div>

              <div className="bg-white rounded-[2.5rem] p-10 lg:p-14 shadow-xl border border-slate-100">
                <form onSubmit={handleSubmit} className="space-y-8">
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Your Name</label>
                      <input
                        type="text"
                        required
                        placeholder="Jane Smith"
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-lg"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Work Email</label>
                      <input
                        type="email"
                        required
                        placeholder="jane@company.com"
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-lg"
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Company</label>
                    <input
                      type="text"
                      required
                      placeholder="Company name"
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-lg"
                      value={formData.company}
                      onChange={e => setFormData({ ...formData, company: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Industry</label>
                    <select
                      required
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-lg bg-white"
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
                    <label className="block text-sm font-bold text-slate-700 mb-2">What manual work is eating your team's time?</label>
                    <textarea
                      rows={5}
                      required
                      placeholder="Describe the repetitive task or workflow that's slowing your team down. The more detail you share, the better our recommendation."
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-lg resize-none"
                      value={formData.problem}
                      onChange={e => setFormData({ ...formData, problem: e.target.value })}
                    />
                  </div>

                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm font-medium">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-xl hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-100"
                  >
                    {loading ? 'Analyzing...' : 'Get My Recommendation →'}
                  </button>

                  <p className="text-center text-sm text-slate-400 font-medium">
                    No spam. No sales calls. Just a clear recommendation based on your input.
                  </p>
                </form>
              </div>
            </>
          )}
        </div>
      </main>

      <footer className="px-6 py-12 border-t text-center text-sm text-slate-400 bg-white">
        <p>&copy; {new Date().getFullYear()} Simpler Life 100. All rights reserved.</p>
      </footer>
    </div>
  );
}