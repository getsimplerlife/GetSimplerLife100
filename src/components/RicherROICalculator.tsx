import { useState, useEffect } from "react";

export interface RicherROICalculatorProps {
  embed?: boolean;
}

export function RicherROICalculator({ embed = false }: RicherROICalculatorProps) {
  // Input states
  const [employees, setEmployees] = useState(50);
  const [hourlyCost, setHourlyCost] = useState(35);
  const [tasksPerDay, setTasksPerDay] = useState(5);
  const [timePerTask, setTimePerTask] = useState(20); // in minutes
  const [errorRate, setErrorRate] = useState(5); // in %
  const [annualSalary, setAnnualSalary] = useState(70000);
  const [implementationCost, setImplementationCost] = useState(15000); // one-time AI setup cost

  // Calculated values
  const [annualHoursSaved, setAnnualHoursSaved] = useState(0);
  const [totalAnnualSavings, setTotalAnnualSavings] = useState(0);
  const [paybackMonths, setPaybackMonths] = useState(0);
  const [threeYearNetImpact, setThreeYearNetImpact] = useState(0);

  useEffect(() => {
    // 250 working days per year
    const workingDays = 250;
    
    // Total manual hours spent on tasks per day across all employees
    const dailyHours = (employees * tasksPerDay * timePerTask) / 60;
    const annualHours = dailyHours * workingDays;
    
    // AI automates 85% of these manual tasks
    const hoursSaved = annualHours * 0.85;
    
    // Labor cost savings
    const laborSavings = hoursSaved * hourlyCost;
    
    // Error correction cost: manual error takes 3x the standard task duration to locate and remediate
    const totalTasksPerYear = employees * tasksPerDay * workingDays;
    const errorsPerYear = totalTasksPerYear * (errorRate / 100);
    const hoursSpentOnErrors = errorsPerYear * (timePerTask / 60) * 3;
    const errorSavings = hoursSpentOnErrors * hourlyCost;
    
    // Combined annual operational savings
    const annualSavings = laborSavings + errorSavings;
    
    // Payback period in months
    const payback = annualSavings > 0 ? (implementationCost / annualSavings) * 12 : 0;
    
    // 3 Year Net Impact (3 years of savings minus initial setup cost)
    const netImpact = (annualSavings * 3) - implementationCost;

    setAnnualHoursSaved(hoursSaved);
    setTotalAnnualSavings(annualSavings);
    setPaybackMonths(payback);
    setThreeYearNetImpact(netImpact);
  }, [employees, hourlyCost, tasksPerDay, timePerTask, errorRate, annualSalary, implementationCost]);

  // Months list for the timeline
  const timelineMonths = [1, 3, 6, 12, 24];

  return (
    <div className={`w-full ${embed ? "" : "max-w-6xl mx-auto"} text-stone-100 font-sans`}>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: Inputs & Sliders (7 Cols) */}
        <div className="lg:col-span-7 bg-stone-900/60 dark:bg-stone-900/40 rounded-3xl p-6 lg:p-8 border border-stone-800/80 backdrop-blur-md space-y-6">
          <div className="border-b border-stone-800 pb-4">
            <h3 className="text-xl font-black text-white flex items-center gap-2">
              <span>🎛️</span> Operations Parameters
            </h3>
            <p className="text-xs text-stone-400 mt-1">
              Adjust the sliders below to match your organization's specific operational footprint.
            </p>
          </div>

          <div className="space-y-6">
            {/* Number of Employees */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-stone-300">Total Employees Impacted</span>
                <span className="text-emerald-400 font-black text-base">{employees} employees</span>
              </div>
              <input
                type="range"
                min="5"
                max="300"
                step="5"
                value={employees}
                onChange={(e) => setEmployees(parseInt(e.target.value))}
                className="w-full h-2 bg-stone-850 rounded-full appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-all"
              />
              <div className="flex justify-between text-[10px] text-stone-500">
                <span>5 employees</span>
                <span>300 employees</span>
              </div>
            </div>

            {/* Average Hourly Employee Cost */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-stone-300">Average Hourly Rate (incl. overhead)</span>
                <span className="text-emerald-400 font-black text-base">${hourlyCost}/hr</span>
              </div>
              <input
                type="range"
                min="15"
                max="120"
                step="1"
                value={hourlyCost}
                onChange={(e) => setHourlyCost(parseInt(e.target.value))}
                className="w-full h-2 bg-stone-850 rounded-full appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-all"
              />
              <div className="flex justify-between text-[10px] text-stone-500">
                <span>$15/hr</span>
                <span>$120/hr</span>
              </div>
            </div>

            {/* Manual Tasks per Employee per Day */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-stone-300">Manual Tasks / Employee / Day</span>
                <span className="text-emerald-400 font-black text-base">{tasksPerDay} tasks</span>
              </div>
              <input
                type="range"
                min="1"
                max="15"
                step="1"
                value={tasksPerDay}
                onChange={(e) => setTasksPerDay(parseInt(e.target.value))}
                className="w-full h-2 bg-stone-850 rounded-full appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-all"
              />
              <div className="flex justify-between text-[10px] text-stone-500">
                <span>1 task</span>
                <span>15 tasks</span>
              </div>
            </div>

            {/* Average Time per Task in Minutes */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-stone-300">Average Time / Manual Task</span>
                <span className="text-emerald-400 font-black text-base">{timePerTask} minutes</span>
              </div>
              <input
                type="range"
                min="5"
                max="90"
                step="5"
                value={timePerTask}
                onChange={(e) => setTimePerTask(parseInt(e.target.value))}
                className="w-full h-2 bg-stone-850 rounded-full appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-all"
              />
              <div className="flex justify-between text-[10px] text-stone-500">
                <span>5 mins</span>
                <span>90 mins</span>
              </div>
            </div>

            {/* Error Rate Percentage */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-stone-300">Manual Process Error Rate</span>
                <span className="text-emerald-400 font-black text-base">{errorRate}%</span>
              </div>
              <input
                type="range"
                min="1"
                max="15"
                step="1"
                value={errorRate}
                onChange={(e) => setErrorRate(parseInt(e.target.value))}
                className="w-full h-2 bg-stone-850 rounded-full appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-all"
              />
              <div className="flex justify-between text-[10px] text-stone-500">
                <span>1% error rate</span>
                <span>15% error rate</span>
              </div>
            </div>

            {/* Average Annual Base Salary */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-stone-300">Average Employee Annual Salary</span>
                <span className="text-emerald-400 font-black text-base">${annualSalary.toLocaleString()}</span>
              </div>
              <input
                type="range"
                min="35000"
                max="150000"
                step="5000"
                value={annualSalary}
                onChange={(e) => setAnnualSalary(parseInt(e.target.value))}
                className="w-full h-2 bg-stone-850 rounded-full appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-all"
              />
              <div className="flex justify-between text-[10px] text-stone-500">
                <span>$35,000</span>
                <span>$150,000</span>
              </div>
            </div>

            {/* AI Setup & License Fee (one-time/annual model setup) */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-stone-300">Estimated AI Operations Implementation</span>
                <span className="text-emerald-400 font-black text-base">${implementationCost.toLocaleString()}</span>
              </div>
              <input
                type="range"
                min="5000"
                max="50000"
                step="2500"
                value={implementationCost}
                onChange={(e) => setImplementationCost(parseInt(e.target.value))}
                className="w-full h-2 bg-stone-850 rounded-full appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-all"
              />
              <div className="flex justify-between text-[10px] text-stone-500">
                <span>$5,000 setup</span>
                <span>$50,000 setup</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Real-time Stats & Visual Payback Timeline (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Main Visual Saving Card */}
          <div className="bg-stone-900 border border-emerald-500/30 rounded-3xl p-6 lg:p-8 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
            
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest mb-4">
              <span>⚡</span> Operational Savings Identified
            </div>
            
            <div className="space-y-1">
              <span className="text-stone-400 text-xs font-bold uppercase tracking-wider block">Estimated Annual Savings</span>
              <div className="text-4xl lg:text-5xl font-black text-white tracking-tight">
                ${Math.round(totalAnnualSavings).toLocaleString()}
                <span className="text-stone-400 text-sm font-normal"> / year</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-stone-800">
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Hours Reclaimed</span>
                <div className="text-lg font-black text-emerald-400">
                  {Math.round(annualHoursSaved).toLocaleString()}
                  <span className="text-[10px] font-normal text-stone-400"> hrs/yr</span>
                </div>
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Payback Window</span>
                <div className="text-lg font-black text-emerald-400">
                  {paybackMonths < 0.1 ? "Immediate" : `${paybackMonths.toFixed(1)} months`}
                </div>
              </div>
            </div>
          </div>

          {/* Payback period indicator gauge */}
          <div className="bg-stone-900/60 dark:bg-stone-900/40 rounded-3xl p-6 border border-stone-850">
            <h4 className="text-xs font-black text-white uppercase tracking-widest mb-3 flex items-center gap-2">
              <span>⏱️</span> Payback Period Timeline
            </h4>
            
            <div className="relative mt-4">
              {/* Progress bar representing payback speed */}
              <div className="h-3 w-full bg-stone-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(10, (12 - paybackMonths) * 8.33))}%` }}
                />
              </div>
              {/* Milestone badges */}
              <div className="flex justify-between text-[10px] text-stone-500 mt-2 font-mono">
                <span>0 months</span>
                <span className="text-emerald-400 font-bold">Break-Even ({paybackMonths.toFixed(1)}M)</span>
                <span>12 months</span>
              </div>
            </div>
            <p className="text-[11px] text-stone-400 mt-4 leading-relaxed font-medium">
              Your setup is expected to reach complete break-even within <span className="text-white font-bold">{paybackMonths.toFixed(1)} months</span> of deployment, resulting in immediate compounded profits thereafter.
            </p>
          </div>

          {/* ROI Timeline Metrics - Savings trajectory */}
          <div className="bg-stone-900/60 dark:bg-stone-900/40 rounded-3xl p-6 border border-stone-850 space-y-4">
            <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
              <span>📈</span> 24-Month ROI Trajectory
            </h4>

            <div className="space-y-3">
              {timelineMonths.map((m) => {
                const savingsAtMonth = (totalAnnualSavings / 12) * m;
                const netValueAtMonth = savingsAtMonth - implementationCost;
                const isProfitable = netValueAtMonth > 0;
                
                return (
                  <div key={m} className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-stone-950/40 hover:bg-stone-950/60 transition-all border border-stone-850/50">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isProfitable ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                      <span className="font-bold text-stone-300">Month {m} {m === 12 ? "(Year 1)" : m === 24 ? "(Year 2)" : ""}</span>
                    </div>
                    <div className="text-right">
                      <div className={`font-black ${isProfitable ? "text-emerald-400" : "text-stone-400"}`}>
                        {isProfitable ? "+" : ""}${Math.round(netValueAtMonth).toLocaleString()}
                      </div>
                      <span className="text-[9px] text-stone-500">Cumulative Net Return</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Impact indicator */}
            <div className="pt-4 border-t border-stone-850 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase block">Estimated 3-Year Net Return</span>
                <span className="text-xl font-black text-white">${Math.round(threeYearNetImpact).toLocaleString()}</span>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-full">
                {(threeYearNetImpact / implementationCost).toFixed(1)}x Total ROI
              </span>
            </div>
          </div>

          {/* CTA Box */}
          <div className="p-6 bg-gradient-to-br from-emerald-900 to-stone-900 rounded-3xl border border-emerald-500/10 text-center">
            <h4 className="text-base font-black text-white mb-1">Verify Your Savings Risk-Free</h4>
            <p className="text-xs text-emerald-200/70 mb-4 max-w-sm mx-auto">Get a verified deep-dive efficiency audit tailored directly to your specific databases and platforms.</p>
            <a 
              href="/#contact"
              className="inline-block w-full bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black py-3 rounded-2xl text-sm transition-all shadow-lg hover:shadow-emerald-500/20"
            >
              Book My Free Efficiency Audit
            </a>
          </div>

        </div>

      </div>
    </div>
  );
}
