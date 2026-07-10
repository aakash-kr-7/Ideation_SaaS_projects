import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, Filter, LayoutGrid, List, Kanban, ArrowUpDown, Plus, 
  Trash2, CheckCircle, RefreshCw, Layers, ShieldCheck, DollarSign, 
  Zap, AlertTriangle, Play, HelpCircle, FileText, Download, Star, 
  Share2, Clipboard, TrendingUp, Settings, BarChart3, Users, 
  Clock, Sliders, ChevronRight, X, Edit3, MessageSquare, ArrowRight,
  Sparkles, Check, Info, FileUp
} from 'lucide-react';

export interface PricingTier {
  name: string;
  price: number;
  usd: number;
  capacity: string;
}

export interface OpportunityMetrics {
  painSeverity: number;
  purchaseUrgency: number;
  willingnessToPay: number;
  reachability: number;
  mvpSpeed: number;
  workflowComplexity: number;
  differentiation: number;
  retention: number;
  defensibility: number;
  financialProbability: number;
}

export interface Opportunity {
  id: string;
  name: string;
  industry: string;
  targetCustomer: string;
  painPoint: string;
  workaround: string;
  competitors: string;
  wedge: string;
  pricing: {
    starter: PricingTier;
    pro: PricingTier;
    enterprise: PricingTier;
  };
  metrics: OpportunityMetrics;
  buildTime: string;
  salesDifficulty: string;
  techStack: string;
  risks: string;
  validationExperiment: string;
  isFavorite: boolean;
  status: string;
  notes: string;
  tags: string[];
}

export interface ScoredOpportunity extends Opportunity {
  calculatedScore: number;
}

export interface MetricWeights {
  painSeverity: number;
  purchaseUrgency: number;
  willingnessToPay: number;
  reachability: number;
  mvpSpeed: number;
  workflowComplexity: number;
  differentiation: number;
  retention: number;
  defensibility: number;
  financialProbability: number;
}

const INITIAL_OPPORTUNITIES: Opportunity[] = [
  {
    id: "1",
    name: "Interactive PBC Client Document Portal",
    industry: "Accounting & Tax",
    targetCustomer: "Boutique CPAs & Accounting Firms (2-10 staff)",
    painPoint: "Managing messy, unstructured document request (Provided By Client/PBC) tracking via emails and sheets.",
    workaround: "Tracking progress on custom offline Excel files, manually renaming client PDFs, and writing constant follow-up emails.",
    competitors: "Suralink (expensive, enterprise contract setup needed), FileInvite (starts at high flat fees like $829/mo, pricing out boutique firms).",
    wedge: "A lightweight, no-login tokenized secure client portal. CPAs send a unique auto-expiring URL; clients drag and drop files without passwords.",
    pricing: {
      starter: { name: "Starter", price: 2900, usd: 35, capacity: "15 active requests, basic alerts" },
      pro: { name: "Professional", price: 6500, usd: 79, capacity: "50 active requests, custom branding, automated SMS alerts" },
      enterprise: { name: "Enterprise", price: 12000, usd: 145, capacity: "Unlimited requests, automatic cloud drive sync (Drive/OneDrive)" }
    },
    metrics: {
      painSeverity: 9,
      purchaseUrgency: 9,
      willingnessToPay: 9,
      reachability: 9,
      mvpSpeed: 8,
      workflowComplexity: 8,
      differentiation: 8,
      retention: 9,
      defensibility: 7,
      financialProbability: 9
    },
    buildTime: "3 weeks",
    salesDifficulty: "Low-to-Moderate",
    techStack: "Next.js, Tailwind CSS, Supabase, Twilio API, AWS S3/S3-compatible storage with client-side direct uploads.",
    risks: "Security and compliance requirements regarding PII and sensitive accounting data; server load spikes during high peak tax seasons.",
    validationExperiment: "Build a Carrd landing page with waitlist and call-to-action showcasing the secure token-upload interface. Message 30 regional CPAs on LinkedIn, offering free single-project trials.",
    isFavorite: false,
    status: "Validation",
    notes: "Perfect match for local CPAs. Highly seasonal demand but extremely sticky if adopted.",
    tags: ["Secure Uploads", "SaaS", "Compliance", "No-Code Upload Client"]
  },
  {
    id: "2",
    name: "Automated Bank Statement to Excel Engine",
    industry: "Finance & Bookkeeping",
    targetCustomer: "Independent Bookkeepers, Fractional CFOs, Forensic Accountants",
    painPoint: "Extracting transaction lines manually from scanned, vector-locked, or poorly rotated physical/PDF bank statements.",
    workaround: "Manually typing transaction dates, descriptions, and values line-by-line into Excel worksheets, risking typing errors.",
    competitors: "DocuClipper (starts at restrictive page limits like 60 pages/$29), DataSnipper (requires multi-seat enterprise contracts costing $3,800+/yr).",
    wedge: "AI-driven extraction parser specialized in accounting ledgers that automatically applies client-side balance cross-checks to ensure zero matching errors.",
    pricing: {
      starter: { name: "Basic", price: 1600, usd: 20, capacity: "250 pages processed, spreadsheet export" },
      pro: { name: "Professional", price: 4900, usd: 60, capacity: "1,000 pages processed, balance validations" },
      enterprise: { name: "Enterprise", price: 9800, usd: 120, capacity: "2,500 pages, API access, directly syncs to QuickBooks Online" }
    },
    metrics: {
      painSeverity: 9,
      purchaseUrgency: 8,
      willingnessToPay: 9,
      reachability: 8,
      mvpSpeed: 8,
      workflowComplexity: 7,
      differentiation: 8,
      retention: 9,
      defensibility: 7,
      financialProbability: 9
    },
    buildTime: "2-3 weeks",
    salesDifficulty: "Low-to-Moderate",
    techStack: "Next.js, Python FastAPI backend, Azure Document Intelligence API or AWS Textract, dynamic balance verification algorithm.",
    risks: "Occasional optical OCR anomalies on faded statement scans; client hesitation to share core bank documentation.",
    validationExperiment: "Create a simple, free online processing page where visitors upload single-page statements to get instantaneous CSV tables. Share it on Facebook/Reddit Bookkeeper forums.",
    isFavorite: false,
    status: "MVP",
    notes: "High conversion potential. Balance checking logic is the core differentiator to avoid competitors' extraction gaps.",
    tags: ["AI OCR", "Parsing Engine", "Excel Tools"]
  },
  {
    id: "3",
    name: "Skilled Trades License & Expiry Watchdog",
    industry: "HR & Field Operations",
    targetCustomer: "Regional Service Operations (HVAC, Plumbing, Trucking, Electrical)",
    painPoint: "Failing tracking logs of technical licenses, safety clearances, and driver permits leading to massive regulatory fines.",
    workaround: "Maintaining manual columns in a fragile spreadsheet with zero automated warning alerts, running the risk of technician operations lapse.",
    competitors: "Enterprise systems (Workday - too costly for local operations), Certemy (highly complex, built for individual licensures).",
    wedge: "A mobile-first, zero-friction experience where workers snap pictures of licenses via SMS/WhatsApp to update the HR system automatically using lightweight OCR.",
    pricing: {
      starter: { name: "Starter", price: 3200, usd: 39, capacity: "Track up to 30 employees, automated email reminders" },
      pro: { name: "Growth", price: 8200, usd: 99, capacity: "Track up to 100 employees, custom SMS/WhatsApp notifications" },
      enterprise: { name: "Pro", price: 16000, usd: 199, capacity: "Track up to 250 employees, compliance reporting, API access" }
    },
    metrics: {
      painSeverity: 9,
      purchaseUrgency: 8,
      willingnessToPay: 8,
      reachability: 9,
      mvpSpeed: 8,
      workflowComplexity: 8,
      differentiation: 8,
      retention: 9,
      defensibility: 7,
      financialProbability: 8
    },
    buildTime: "3 weeks",
    salesDifficulty: "Low-to-Moderate",
    techStack: "React Native or PWA Web App, Node.js (Express), PostgreSQL database, Twilio WhatsApp API, simple metadata parsing scripts.",
    risks: "Reluctance of non-technical on-field crews to upload licenses on schedule; regional rules variation across state territories.",
    validationExperiment: "Outreach 30 regional trade operators on LinkedIn. Offer to handle their compliance spreadsheet for free for a month to understand operational pain.",
    isFavorite: false,
    status: "Research",
    notes: "Operations managers hate compliance issues. SMS triggers are critical to ensure technician adoption.",
    tags: ["Compliance", "SMS Integration", "Operations", "Trades"]
  },
  {
    id: "4",
    name: "Subcontractor COI Compliance Tracker",
    industry: "Construction & Compliance",
    targetCustomer: "Residential Builders, General Contractors, Property Managers",
    painPoint: "Manual, high-stress tracking of subcontractor Certificates of Insurance (COI) to verify liability thresholds and keep projects compliant.",
    workaround: "Administrative assistants manual collection of paper certificates, matching coverage values in Excel, chasing expirations with phone calls.",
    competitors: "Billy, MyCOI, TrustLayer (powerful enterprise tools with high implementation periods and premium price tiers).",
    wedge: "Lightweight upload links without account logins. Automatic parsing of standardized ACORD-25 certificates, flagging discrepancies automatically.",
    pricing: {
      starter: { name: "Starter", price: 4000, usd: 49, capacity: "Up to 50 active subcontractors, email reminders" },
      pro: { name: "Scale", price: 12000, usd: 149, capacity: "Up to 150 active subcontractors, broker follow-up integration" },
      enterprise: { name: "Enterprise", price: 24000, usd: 299, capacity: "Unlimited active trackers, customized threshold layouts" }
    },
    metrics: {
      painSeverity: 8,
      purchaseUrgency: 8,
      willingnessToPay: 8,
      reachability: 8,
      mvpSpeed: 8,
      workflowComplexity: 7,
      differentiation: 8,
      retention: 9,
      defensibility: 8,
      financialProbability: 8
    },
    buildTime: "4 weeks",
    salesDifficulty: "Moderate",
    techStack: "Next.js, Python FastAPI parser with LLM metadata schema mapping, Supabase Auth, PostgreSQL, React-PDF.",
    risks: "Highly variable customized liability riders on insurance documents that baseline AI models can struggle to identify with high confidence.",
    validationExperiment: "Distribute a free online ACORD PDF checklist guide inside general contractor communities. Pitch automation services to those who access the document.",
    isFavorite: false,
    status: "Idea",
    notes: "Risk reduction pitch is incredibly solid for general contractors with high insurance liabilities.",
    tags: ["Insurance", "Construction", "ACORD Parsing", "Risk Control"]
  },
  {
    id: "5",
    name: "Multi-Entity Close Spreadsheet Pipeline",
    industry: "Accounting & Finance",
    targetCustomer: "Fractional CFOs, Bookkeeping Agencies, Multi-Unit Business Owners",
    painPoint: "Hours spent copy-pasting balances from distinct QuickBooks logins to align custom trial balances and run adjustments during month-end close.",
    workaround: "Exporting multiple trial balances to CSV and using fragile Excel lookup links to perform manual entity aggregations.",
    competitors: "Datarails, Sage Intacct (heavy financial planning tools with premium implementation timelines and five-figure costs).",
    wedge: "A lightweight visual portal where users import raw balance extracts from QuickBooks Online, map charts of accounts once, and export a consolidated Excel sheet.",
    pricing: {
      starter: { name: "Standard", price: 6500, usd: 79, capacity: "Consolidate up to 3 entities, custom format template mapping" },
      pro: { name: "Agency", price: 16000, usd: 199, capacity: "Consolidate up to 10 entities, direct QuickBooks Online API sync" },
      enterprise: { name: "Enterprise", price: 32000, usd: 399, capacity: "Unlimited entity profiles, automated journal entry creation" }
    },
    metrics: {
      painSeverity: 8,
      purchaseUrgency: 7,
      willingnessToPay: 9,
      reachability: 7,
      mvpSpeed: 8,
      workflowComplexity: 7,
      differentiation: 8,
      retention: 9,
      defensibility: 7,
      financialProbability: 9
    },
    buildTime: "3 weeks",
    salesDifficulty: "Moderate",
    techStack: "Svelte or React, Node.js backend, ExcelJS library, QuickBooks/Xero developer API OAuth access.",
    risks: "Handling diverse foreign currency translations and complex parent-subsidiary ownership layers for larger clients.",
    validationExperiment: "Post a walkthrough video on LinkedIn showing 'How to clean up intercompany entries in PowerQuery'. Pitch the automated portal to users who comment.",
    isFavorite: false,
    status: "Research",
    notes: "Fractional CFOs have high budget capacity and readily pay for tools that increase their capacity to take on more clients.",
    tags: ["Financial Consolidation", "QuickBooks", "Fractional CFO Tools"]
  },
  {
    id: "6",
    name: "Real Estate & Insurance Commission Split Manager",
    industry: "Real Estate & Insurance",
    targetCustomer: "Boutique Real Estate Agencies & Independent Insurance Brokers",
    painPoint: "High-stress administrative computation of tiered and sliding-scale agent commission splits and partner overrides on closed contracts.",
    workaround: "Calculating splits on dry-erase boards or complex offline Excel sheets, leading to commission payment disputes and delayed broker closings.",
    competitors: "CaptivateIQ (enterprise sales process, no self-serve setup), Core Commissions (complex interface requiring long database setups).",
    wedge: "A dead-simple, interactive web portal designed for offices of 5-25 agents. Quickly choose pre-configured commission rules and push reports directly to bookkeeping.",
    pricing: {
      starter: { name: "Starter", price: 4000, usd: 49, capacity: "Up to 10 agents, standard commission calculation flows" },
      pro: { name: "Professional", price: 10500, usd: 129, capacity: "Up to 25 agents, progressive split configurations, partner overrides" },
      enterprise: { name: "Enterprise", price: 24000, usd: 299, capacity: "Unlimited agents, analytical charts dashboard, automated reports" }
    },
    metrics: {
      painSeverity: 8,
      purchaseUrgency: 7,
      willingnessToPay: 8,
      reachability: 8,
      mvpSpeed: 8,
      workflowComplexity: 7,
      differentiation: 8,
      retention: 9,
      defensibility: 7,
      financialProbability: 8
    },
    buildTime: "3 weeks",
    salesDifficulty: "Low-to-Moderate",
    techStack: "Next.js, Tailwind CSS, Supabase database storage, dynamic compensation logic builder classes, chart.js visualizations.",
    risks: "Brokers requesting bespoke, highly unstructured exception clauses that do not conform to generalized algorithm templates.",
    validationExperiment: "Message 25 independent local real estate brokers on social profiles. Pitch a custom-built, lightweight sheet model to learn split structures.",
    isFavorite: false,
    status: "Idea",
    notes: "High retention. If an agency processes payroll using your commission tracker, the lifetime value of that account is incredibly high.",
    tags: ["Real Estate", "Payroll", "Commission Engine"]
  },
  {
    id: "7",
    name: "Subcontractor Lien Waiver Coordinator",
    industry: "Construction & Legal",
    targetCustomer: "Residential Builders, General Contractors, Construction Escrow Officers",
    painPoint: "Chasing and managing state-compliant lien waiver documents from subs before unlocking monthly draw funds from bank monitors.",
    workaround: "Drafting MS Word waiver templates, mailing files, chasing signatures, and manually checking invoice values on paper files.",
    competitors: "Procore, Built Technologies (expensive enterprise software with full modules built for multi-million construction firms).",
    wedge: "A single-page transactional system that integrates document collection with the digital signature flow in a simple, one-click interface for subs.",
    pricing: {
      starter: { name: "Growth", price: 4000, usd: 49, capacity: "Up to 3 active construction projects, email alerts" },
      pro: { name: "Scale", price: 12000, usd: 149, capacity: "Up to 10 active projects, automated digital signatures" },
      enterprise: { name: "Enterprise", price: 24000, usd: 299, capacity: "Unlimited active projects, webhook triggers, escrow workflows" }
    },
    metrics: {
      painSeverity: 8,
      purchaseUrgency: 8,
      willingnessToPay: 8,
      reachability: 7,
      mvpSpeed: 8,
      workflowComplexity: 7,
      differentiation: 8,
      retention: 8,
      defensibility: 7,
      financialProbability: 8
    },
    buildTime: "4 weeks",
    salesDifficulty: "Moderate",
    techStack: "Next.js, Node.js, PostgreSQL, SignNow or self-hosted secure cryptographic digital signature verification layers, PDF generation.",
    risks: "Severe geographical variance in state-specific statutory language requirements for conditional and unconditional lien waivers.",
    validationExperiment: "Put up a single-page interactive site that generates state-compliant legal PDF lien waivers for free. Collect visitor emails.",
    isFavorite: false,
    status: "Idea",
    notes: "Directly connected to project financing draws, which makes it a high priority and urgent for developers and contractors.",
    tags: ["Lien Waiver", "Construction Tech", "Digital Signatures"]
  },
  {
    id: "8",
    name: "Freight Broker Rate Confirmation Parser",
    industry: "Logistics & Transport",
    targetCustomer: "Independent Freight Brokerages (50-500 weekly runs)",
    painPoint: "Manual, high-volume transcription of pricing and location specs from PDF Rate Confirmation forms into Transportation Management Systems (TMS).",
    workaround: "Logistics dispatchers copy-pasting information from inbound emails into custom fields in obsolete desktop databases.",
    competitors: "Nexla, HubSync (high-cost document middleware systems that require specialized IT configurations and setup).",
    wedge: "An email parser utility. Forward carrier emails to `ingest@parser.com` and automatically generate a structured, TMS-compliant CSV file in seconds.",
    pricing: {
      starter: { name: "Starter", price: 4000, usd: 49, capacity: "Up to 250 parsed files per month, standard CSV output" },
      pro: { name: "Professional", price: 12000, usd: 149, capacity: "Up to 1,000 parsed files, custom target email ingestion workflows" },
      enterprise: { name: "Enterprise", price: 24000, usd: 299, capacity: "Unlimited documents, customized API callbacks directly to TMS" }
    },
    metrics: {
      painSeverity: 8,
      purchaseUrgency: 7,
      willingnessToPay: 8,
      reachability: 7,
      mvpSpeed: 7,
      workflowComplexity: 7,
      differentiation: 8,
      retention: 9,
      defensibility: 7,
      financialProbability: 8
    },
    buildTime: "3-4 weeks",
    salesDifficulty: "Moderate",
    techStack: "Python FastAPI server, AWS S3 buckets, OpenAI Structured Output API with custom parsing patterns, Postmark inbound email parser.",
    risks: "Highly inconsistent document formats and layouts from non-standard brokers that cause parsing discrepancies.",
    validationExperiment: "Share a simple drag-and-drop tool on logistics networks. Ask freight coordinators if they would pay to automate their weekly PDF backlog.",
    isFavorite: false,
    status: "Research",
    notes: "High recurring volume makes it incredibly easy to sell once accuracy is demonstrated on sample PDFs.",
    tags: ["Logistics", "Email Parser", "Structured AI Data"]
  },
  {
    id: "9",
    name: "Vertical Litigation Case Timeline Builder",
    industry: "Legal Operations",
    targetCustomer: "Opportunity Intelligence Dashboardo Practice Attorneys, Independent Legal Counsel, Small Law Firms",
    painPoint: "Spent hours organizing chronologies and index lists of text logs, medical reports, and client claims in complex lawsuit cases.",
    workaround: "Writing notes manually on paper legal pads, typing tables in MS Word, and rebuilding chronology outlines by hand.",
    competitors: "CaseFleet, Clio (feature-heavy, premium all-in-one law firm management platforms with long onboarding times).",
    wedge: "An AI-powered parser designed for court chronologies. Upload unstructured documents; the tool automatically maps key events into a visual timeline.",
    pricing: {
      starter: { name: "Starter", price: 3200, usd: 39, capacity: "Up to 10 active case profiles, automated chronology outlines" },
      pro: { name: "Professional", price: 8200, usd: 99, capacity: "Up to 30 active cases, court-ready document exports, secure hosting" },
      enterprise: { name: "Enterprise", price: 16000, usd: 199, capacity: "Unlimited cases, advanced document OCR, team directories" }
    },
    metrics: {
      painSeverity: 8,
      purchaseUrgency: 7,
      willingnessToPay: 8,
      reachability: 7,
      mvpSpeed: 7,
      workflowComplexity: 7,
      differentiation: 8,
      retention: 8,
      defensibility: 7,
      financialProbability: 8
    },
    buildTime: "3 weeks",
    salesDifficulty: "Moderate-to-High",
    techStack: "Next.js frontend, Python FastAPI backend, LLM parsing layer with high-reliability date-sorting mechanisms, secure S3 cloud storage.",
    risks: "Strict security standards like HIPAA and local attorney-client privilege protocols; attorneys are often conservative software adopters.",
    validationExperiment: "Offer to manually compile chronological timelines for three cases for family law attorneys to validate and refine the data model.",
    isFavorite: false,
    status: "Idea",
    notes: "Very high willingness to pay. A single lawsuit success easily justifies the software budget for the entire year.",
    tags: ["Legal Tech", "AI Timeline", "Security First"]
  },
  {
    id: "10",
    name: "Local Business Review Automation Widget",
    industry: "Marketing & Growth",
    targetCustomer: "Local Service Contractors (Plumbers, Residential Electricians, Landscapers)",
    painPoint: "Forgetting to request reviews on search directories upon finishing service jobs, losing visibility on localized searches.",
    workaround: "Manual text reminders, export contact logs from QuickBooks, or emailing links that clients overlook.",
    competitors: "Podium, BirdEye (feature-rich growth platforms charging upwards of $250/mo, locked behind annual enterprise plans).",
    wedge: "A mobile-first on-site trigger interface. Technicians input a phone number post-service; the system triggers scheduled SMS/WhatsApp follow-ups.",
    pricing: {
      starter: { name: "Starter", price: 1600, usd: 20, capacity: "Up to 50 feedback review requests, standard automation flows" },
      pro: { name: "Pro", price: 4000, usd: 49, capacity: "Up to 200 review requests, scheduled follow-up drip templates" },
      enterprise: { name: "Growth", price: 8000, usd: 99, capacity: "Unlimited review request dispatches, QuickBooks/Xero automation integrations" }
    },
    metrics: {
      painSeverity: 7,
      purchaseUrgency: 6,
      willingnessToPay: 6,
      reachability: 9,
      mvpSpeed: 9,
      workflowComplexity: 8,
      differentiation: 7,
      retention: 7,
      defensibility: 6,
      financialProbability: 6
    },
    buildTime: "2 weeks",
    salesDifficulty: "Low-to-Moderate",
    techStack: "Next.js, Tailwind CSS, PostgreSQL, Twilio SMS/WhatsApp integration, Google My Business API webhooks.",
    risks: "Regulatory restrictions and compliance rules surrounding cold commercial SMS outreach messages; low customer software utilization on sites.",
    validationExperiment: "Manually handle feedback outreach for 10 past clients of a friendly local contractor. Show him positive results and pitch the tool.",
    isFavorite: false,
    status: "Idea",
    notes: "Low barrier to entry. Selling is straightforward once local businesses see that reviews generate immediate customer leads.",
    tags: ["SMS Marketing", "Local SEO", "Automation Widget"]
  }
];

const DEFAULT_WEIGHTS: MetricWeights = {
  painSeverity: 0.15,
  purchaseUrgency: 0.15,
  willingnessToPay: 0.15,
  reachability: 0.10,
  mvpSpeed: 0.10,
  workflowComplexity: 0.05,
  differentiation: 0.10,
  retention: 0.10,
  defensibility: 0.05,
  financialProbability: 0.05
};

const STAGES = ["Idea", "Research", "Validation", "MVP", "Launch"];

const parseBuildTimeToDays = (buildTimeStr: string): number => {
  const clean = buildTimeStr.toLowerCase();
  if (clean.includes("2-3")) return 17.5;
  if (clean.includes("3-4")) return 24.5;
  if (clean.includes("2")) return 14;
  if (clean.includes("3")) return 21;
  if (clean.includes("4")) return 28;
  return 21;
};

const TOUR_STEPS = [
  {
    title: "Welcome to the Opportunity Intelligence Platform!",
    content: "This tool is a quantitative framework designed for solo technical founders to systematically evaluate, grade, and rank micro-SaaS opportunities. Let's take a quick interactive tour to show you how this works.",
    selector: null
  },
  {
    title: "View Modes Selection Menu",
    content: "This menu switches your active screen mode to analyze the opportunity index from multiple strategic perspectives.",
    selector: "#view-modes-menu"
  },
  {
    title: "1. Executive Dashboard Tab",
    content: "This tab displays your top-level KPI metrics alongside the interactive build difficulty scatter plot matrix.",
    selector: "#tab-dashboard"
  },
  {
    title: "2. Opportunity Grid Tab",
    content: "Click here to inspect fully-formed cards for each idea, displaying target audiences, pricing models, and bookmarks.",
    selector: "#tab-grid"
  },
  {
    title: "3. Ranked Leaderboard Tab",
    content: "This tab displays a strictly sorted prioritized ledger of all opportunities from highest-scoring to lowest-scoring.",
    selector: "#tab-leaderboard"
  },
  {
    title: "4. Kanban Pipeline Tab",
    content: "Track validation progress by dragging opportunities across stages: Idea, Research, Validation, MVP build, and active Launch.",
    selector: "#tab-kanban"
  },
  {
    title: "5. Side-by-Side Compare Matrix",
    content: "Enables comparing up to 3 selected target opportunities side-by-side to assist in final model selection.",
    selector: "#tab-compare"
  },
  {
    title: "6. About Platform Tab",
    content: "An educational guide mapping out all rating metrics, scoring math, and criteria used to validate items.",
    selector: "#tab-about"
  },
  {
    title: "Custom Framework Weights",
    content: "Customize weights to adjust priorities (e.g. increase WTP or pain severity). All scores and grids update instantly.",
    selector: "#weights-sliders-card"
  },
  {
    title: "Strategy Blueprints Deep-Dive",
    content: "Below the active view, explore calculated monthly cashflow growth calculators, marketing scripts, and tech stacks.",
    selector: "#deep-dive-section"
  },
  {
    title: "Dynamic Ingest Engine",
    content: "Paste raw research briefs, micro-SaaS notes, or feedback transcripts to instantly auto-parse and import new opportunities.",
    selector: "#ingest-report-button"
  }
];

export default function App() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>(INITIAL_OPPORTUNITIES);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const hasSeen = localStorage.getItem("hasSeenTour");
    if (!hasSeen) {
      setTourStep(0);
    }
  }, []);

  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string>("1");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedIndustry, setSelectedIndustry] = useState<string>("All");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("All");
  const [minScore, setMinScore] = useState<number>(0);
  const [viewMode, setViewMode] = useState<string>("dashboard"); // "dashboard", "grid", "leaderboard", "kanban", "compare"
  const [weights, setWeights] = useState<MetricWeights>(DEFAULT_WEIGHTS);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [customInputReport, setCustomInputReport] = useState<string>("");
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [calcStarterCount, setCalcStarterCount] = useState<number>(15);
  const [calcProCount, setCalcProCount] = useState<number>(10);
  const [calcEnterpriseCount, setCalcEnterpriseCount] = useState<number>(5);

  const scoredOpportunities = useMemo<ScoredOpportunity[]>(() => {
    return opportunities.map(opp => {
      const weightedSum = (
        (opp.metrics.painSeverity * weights.painSeverity) +
        (opp.metrics.purchaseUrgency * weights.purchaseUrgency) +
        (opp.metrics.willingnessToPay * weights.willingnessToPay) +
        (opp.metrics.reachability * weights.reachability) +
        (opp.metrics.mvpSpeed * weights.mvpSpeed) +
        (opp.metrics.workflowComplexity * weights.workflowComplexity) +
        (opp.metrics.differentiation * weights.differentiation) +
        (opp.metrics.retention * weights.retention) +
        (opp.metrics.defensibility * weights.defensibility) +
        (opp.metrics.financialProbability * weights.financialProbability)
      );
      // Ensure score is formatted to 2 decimal places
      const finalScore = parseFloat((weightedSum).toFixed(2));
      return { ...opp, calculatedScore: finalScore };
    });
  }, [opportunities, weights]);

  const activeOpportunity = useMemo(() => {
    return scoredOpportunities.find(opp => opp.id === selectedOpportunityId) || scoredOpportunities[0];
  }, [scoredOpportunities, selectedOpportunityId]);

  const sortedOpportunities = useMemo(() => {
    return [...scoredOpportunities].sort((a, b) => b.calculatedScore - a.calculatedScore);
  }, [scoredOpportunities]);

  const industriesList = useMemo(() => {
    const list = new Set(opportunities.map(opp => opp.industry));
    return ["All", ...Array.from(list)];
  }, [opportunities]);

  const filteredOpportunities = useMemo(() => {
    return sortedOpportunities.filter(opp => {
      const matchesSearch = opp.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            opp.industry.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            opp.targetCustomer.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesIndustry = selectedIndustry === "All" || opp.industry === selectedIndustry;
      const matchesDifficulty = selectedDifficulty === "All" || 
                                (selectedDifficulty === "Low" && opp.buildTime === "2 weeks") ||
                                (selectedDifficulty === "Medium" && (opp.buildTime === "3 weeks" || opp.buildTime === "2-3 weeks")) ||
                                (selectedDifficulty === "High" && opp.buildTime === "4 weeks");
      const matchesScore = opp.calculatedScore >= minScore;
      return matchesSearch && matchesIndustry && matchesDifficulty && matchesScore;
    });
  }, [sortedOpportunities, searchQuery, selectedIndustry, selectedDifficulty, minScore]);

  const scoreBounds = useMemo(() => {
    const scores = filteredOpportunities.map(o => o.calculatedScore);
    const minVal = scores.length > 0 ? Math.min(...scores) : 6.0;
    const maxVal = scores.length > 0 ? Math.max(...scores) : 10.0;
    const min = Math.min(6.5, minVal);
    const max = Math.max(9.5, maxVal);
    const range = max - min || 1;
    return { min, max, range };
  }, [filteredOpportunities]);

  const daysBounds = { min: 12, max: 30, range: 18 };

  const triggerToast = (msg: string | null) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    if (tourStep === null || tourStep === 0) {
      setTargetRect(null);
      return;
    }
    const selector = TOUR_STEPS[tourStep].selector;
    if (selector) {
      const timer = setTimeout(() => {
        const el = document.querySelector(selector);
        if (el) {
          setTargetRect(el.getBoundingClientRect());
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          setTargetRect(null);
        }
      }, 150);
      return () => clearTimeout(timer);
    } else {
      setTargetRect(null);
    }
  }, [tourStep, viewMode]);

  useEffect(() => {
    const handleResize = () => {
      if (tourStep !== null && tourStep > 0) {
        const selector = TOUR_STEPS[tourStep].selector;
        if (selector) {
          const el = document.querySelector(selector);
          if (el) {
            setTargetRect(el.getBoundingClientRect());
          }
        }
      }
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [tourStep]);

  const placement = useMemo<'above' | 'below' | 'center'>(() => {
    if (!targetRect) return 'center';
    const { top, height } = targetRect;
    const windowHeight = window.innerHeight;
    const spaceBelow = windowHeight - (top + height);
    const spaceAbove = top;
    return (spaceBelow < 220 && spaceAbove > spaceBelow) ? 'above' : 'below';
  }, [targetRect]);

  const tooltipStyle = useMemo<React.CSSProperties>(() => {
    if (!targetRect) {
      return {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 50,
      };
    }

    const { left, top, width, height } = targetRect;
    const windowWidth = window.innerWidth;
    
    let tooltipTop = top + height + 16;
    let tooltipLeft = left + width / 2;
    let transform = 'translate(-50%, 0)';
    
    if (placement === 'above') {
      tooltipTop = top - 16;
      transform = 'translate(-50%, -100%)';
    }
    
    if (tooltipLeft < 170) {
      tooltipLeft = 16;
      transform = transform.replace('-50%', '0%');
    } else if (tooltipLeft > windowWidth - 170) {
      tooltipLeft = windowWidth - 16;
      transform = transform.replace('-50%', '-100%');
    }

    return {
      position: 'fixed',
      left: `${tooltipLeft}px`,
      top: `${tooltipTop}px`,
      transform: transform,
      zIndex: 50,
    };
  }, [targetRect, placement]);

  const toggleFavorite = (id: string) => {
    setOpportunities(prev => prev.map(opp => {
      if (opp.id === id) {
        const nextFav = !opp.isFavorite;
        triggerToast(nextFav ? `Added ${opp.name} to favorites` : `Removed ${opp.name} from favorites`);
        return { ...opp, isFavorite: nextFav };
      }
      return opp;
    }));
  };

  const updateStatus = (id: string, newStatus: string) => {
    setOpportunities(prev => prev.map(opp => {
      if (opp.id === id) {
        triggerToast(`Updated stage for ${opp.name} to ${newStatus}`);
        return { ...opp, status: newStatus };
      }
      return opp;
    }));
  };

  const updateNotes = (id: string, text: string) => {
    setOpportunities(prev => prev.map(opp => {
      if (opp.id === id) {
        return { ...opp, notes: text };
      }
      return opp;
    }));
    triggerToast("Notes updated and saved locally");
  };

  const resetWeights = () => {
    setWeights(DEFAULT_WEIGHTS);
    triggerToast("Scoring weights restored to system defaults");
  };

  const handleIngestReport = () => {
    if (!customInputReport.trim()) {
      triggerToast("Please paste some text in the report field first");
      return;
    }
    
    // Simulate real parsing by looking for titles, pricing, or extracting segments
    const lines = customInputReport.split('\n');
    let extractedName = "Uploaded Custom Opportunity";
    let extractedIndustry = "SaaS Automation";
    let extractedTarget = "B2B SMBs";
    let extractedPain = "Time-intensive administrative workflows.";
    let pricingStarter = 2500;
    let pricingPro = 5000;
    let pricingEnt = 10000;

    // Smart-ish heuristics parsing
    for (let line of lines) {
      if (line.toLowerCase().startsWith("title:") || line.toLowerCase().startsWith("name:")) {
        extractedName = line.replace(/^(title|name):/i, "").trim();
      } else if (line.toLowerCase().startsWith("industry:")) {
        extractedIndustry = line.replace(/^industry:/i, "").trim();
      } else if (line.toLowerCase().startsWith("customer:") || line.toLowerCase().startsWith("target:")) {
        extractedTarget = line.replace(/^(customer|target):/i, "").trim();
      } else if (line.toLowerCase().startsWith("pain:")) {
        extractedPain = line.replace(/^pain:/i, "").trim();
      } else if (line.toLowerCase().includes("pricing") || line.toLowerCase().includes("cost")) {
        const foundNumbers = line.match(/\d+/g);
        if (foundNumbers && foundNumbers.length >= 1) {
          pricingStarter = parseInt(foundNumbers[0]) || 2500;
          pricingPro = (foundNumbers[1] ? parseInt(foundNumbers[1]) : pricingStarter * 2.5);
          pricingEnt = (foundNumbers[2] ? parseInt(foundNumbers[2]) : pricingPro * 2);
        }
      }
    }

    const newOpp = {
      id: String(opportunities.length + 1),
      name: extractedName,
      industry: extractedIndustry,
      targetCustomer: extractedTarget,
      painPoint: extractedPain,
      workaround: "Offline files, complex email trails, manual processing.",
      competitors: "Manual processing, obsolete fragmented software tools.",
      wedge: "Custom localized solution designed for rapid installation and self-serve utility.",
      pricing: {
        starter: { name: "Starter", price: pricingStarter, usd: Math.round(pricingStarter / 82), capacity: "Basic tier capabilities" },
        pro: { name: "Pro", price: pricingPro, usd: Math.round(pricingPro / 82), capacity: "Advanced tier limits" },
        enterprise: { name: "Enterprise", price: pricingEnt, usd: Math.round(pricingEnt / 82), capacity: "Full access sync operations" }
      },
      metrics: {
        painSeverity: 8,
        purchaseUrgency: 7,
        willingnessToPay: 8,
        reachability: 8,
        mvpSpeed: 8,
        workflowComplexity: 7,
        differentiation: 7,
        retention: 8,
        defensibility: 6,
        financialProbability: 8
      },
      buildTime: "3 weeks",
      salesDifficulty: "Moderate",
      techStack: "Next.js, Supabase, Tailwind CSS UI.",
      risks: "Adoption barriers and localized messaging requirements.",
      validationExperiment: "Develop localized interactive single-page mockup tool. Cold email 20 localized target profiles.",
      isFavorite: false,
      status: "Idea",
      notes: "Custom loaded from uploaded document report text.",
      tags: ["Uploaded", "Custom Engine"]
    };

    setOpportunities(prev => [newOpp, ...prev]);
    setSelectedOpportunityId(newOpp.id);
    setCustomInputReport("");
    setShowUploadModal(false);
    triggerToast(`Successfully ingested "${extractedName}"!`);
  };

  const toggleCompare = (id: string) => {
    setCompareIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      }
      if (prev.length >= 3) {
        triggerToast("You can compare up to 3 opportunities side-by-side");
        return prev;
      }
      return [...prev, id];
    });
  };

  const exportToMarkdown = (opp: ScoredOpportunity) => {
    const content = `# Startup Opportunity Deep Dive: ${opp.name}
Generated via Opportunity Intelligence Platform

## Overview
- **Industry:** ${opp.industry}
- **Target Customer:** ${opp.targetCustomer}
- **Calculated Rating Score:** ${opp.calculatedScore}/10 (Weighted)
- **Current Development Stage:** ${opp.status}

## Structural Dynamics
- **Core Pain Point:** ${opp.painPoint}
- **Current Workaround:** ${opp.workaround}
- **Competitor Landscape:** ${opp.competitors}
- **Unique Entry Wedge:** ${opp.wedge}

## Blueprint and Roadmap
- **MVP Build Speed:** ${opp.buildTime}
- **Technical Stack Recommended:** ${opp.techStack}
- **Risks/Mitigations:** ${opp.risks}
- **Fast Validation Experiment:** ${opp.validationExperiment}

## Pricing & Economic Model
- **Starter Tier:** ₹${opp.pricing.starter.price.toLocaleString()} ($${opp.pricing.starter.usd}) / mo - ${opp.pricing.starter.capacity}
- **Pro Tier:** ₹${opp.pricing.pro.price.toLocaleString()} ($${opp.pricing.pro.usd}) / mo - ${opp.pricing.pro.capacity}
- **Enterprise Tier:** ₹${opp.pricing.enterprise.price.toLocaleString()} ($${opp.pricing.enterprise.usd}) / mo - ${opp.pricing.enterprise.capacity}

## My Tactical Developer Notes
"${opp.notes || 'No added notes yet.'}"
`;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${opp.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_deepdive.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerToast("Exported deep-dive markdown to downloads");
  };

  const calculatedMRR = useMemo(() => {
    const starterPrice = activeOpportunity.pricing.starter.price;
    const proPrice = activeOpportunity.pricing.pro.price;
    const entPrice = activeOpportunity.pricing.enterprise.price;
    return (calcStarterCount * starterPrice) + (calcProCount * proPrice) + (calcEnterpriseCount * entPrice);
  }, [activeOpportunity, calcStarterCount, calcProCount, calcEnterpriseCount]);

  const dashboardStats = useMemo(() => {
    const totalCount = opportunities.length;
    const avgScore = totalCount > 0 
      ? (scoredOpportunities.reduce((acc, curr) => acc + curr.calculatedScore, 0) / totalCount).toFixed(2)
      : "0.00";
    const favoriteCount = opportunities.filter(o => o.isFavorite).length;
    const topPick = sortedOpportunities[0];
    return { totalCount, avgScore, favoriteCount, topPick };
  }, [opportunities, sortedOpportunities, scoredOpportunities]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-emerald-500/35 selection:text-white antialiased">
      
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-slate-800 text-slate-100 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {}
      {/* Top Navigation */}
      <header className="border-b border-slate-900 bg-black/60 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/10 border border-white/10">
            <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <line x1="10" y1="9" x2="8" y2="9" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
              Opportunity Intelligence Platform
              <span className="bg-emerald-950 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full font-mono border border-emerald-900/50">V2.0</span>
            </h1>
            <p className="text-xs text-slate-300">Systematic evaluation pipeline for solo technical founders</p>
          </div>
        </div>

        {/* Global Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search opportunity data..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-900/60 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors w-48 md:w-64"
            />
          </div>

          <button 
            onClick={() => setTourStep(0)}
            className="bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg px-3 py-2 text-xs font-medium text-slate-200 flex items-center gap-2 transition-all active:scale-95 animate-pulse"
            title="Restart Guided Tour"
          >
            <HelpCircle className="h-4 w-4 text-purple-400" />
            <span>Restart Tour</span>
          </button>

          <button 
            id="ingest-report-button"
            onClick={() => setShowUploadModal(true)}
            className="bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg px-3 py-2 text-xs font-medium text-slate-200 flex items-center gap-2 transition-all active:scale-95"
          >
            <FileUp className="h-4 w-4 text-emerald-400" />
            <span>Ingest Report</span>
          </button>

          <button
            onClick={() => {
              const csvData = scoredOpportunities.map(o => `"${o.name}","${o.industry}","${o.calculatedScore}"`).join('\n');
              const blob = new Blob([`Name,Industry,Weighted Score\n${csvData}`], { type: 'text/csv' });
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.setAttribute('href', url);
              a.setAttribute('download', 'opportunities_export.csv');
              a.click();
              triggerToast("Exported all parsed items to CSV");
            }}
            className="bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg p-2 text-slate-300 hover:text-slate-200 transition-colors"
            title="Download CSV Summary"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main Framework Layout Container */}
      <div className="flex flex-1 flex-col lg:flex-row overflow-hidden">
        
        {/* Left Side Control Panel & Filter Bar */}
        <aside className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-slate-900 bg-slate-950/40 p-6 flex flex-col gap-6 overflow-y-auto">
          
          {/* Main Workspace Navigation Options */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">View Modes</h3>
            <div className="grid grid-cols-1 gap-1">
              {[
                { id: "dashboard", label: "Executive Dashboard", icon: BarChart3 },
                { id: "grid", label: "Opportunity Grid", icon: LayoutGrid },
                { id: "leaderboard", label: "Ranked Leaderboard", icon: List },
                { id: "kanban", label: "Kanban Pipeline", icon: Kanban },
                { id: "compare", label: `Side-by-Side (${compareIds.length})`, icon: Layers },
                { id: "about", label: "About Platform", icon: Info },
              ].map(tab => {
                const IconComp = tab.icon;
                const isSelected = viewMode === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`tab-${tab.id}`}
                    onClick={() => setViewMode(tab.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between text-xs font-medium transition-all ${
                      isSelected 
                        ? "bg-emerald-600/10 border border-emerald-500/20 text-emerald-400" 
                        : "text-slate-300 hover:text-slate-200 hover:bg-slate-900/50 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <IconComp className={`h-4 w-4 ${isSelected ? "text-emerald-400" : "text-slate-400"}`} />
                      <span>{tab.label}</span>
                    </div>
                    {tab.id === "compare" && compareIds.length > 0 && (
                      <span className="bg-emerald-500 text-white text-[10px] font-mono h-4 w-4 flex items-center justify-center rounded-full animate-pulse">
                        {compareIds.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <hr className="border-slate-900" />

          {}
          <div id="weights-sliders-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Framework Weights</h3>
              <button 
                onClick={resetWeights}
                className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-mono transition-colors"
              >
                <RefreshCw className="h-2.5 w-2.5" />
                Reset
              </button>
            </div>
            
            <p className="text-[11px] text-slate-300 mb-4 leading-relaxed">
              Dynamically modify weights to update calculated values across dashboards instantly.
            </p>

            <div className="space-y-4">
              {([
                { key: "painSeverity", label: "Pain Severity (15%)" },
                { key: "purchaseUrgency", label: "Purchase Urgency (15%)" },
                { key: "willingnessToPay", label: "Willingness to Pay (15%)" },
                { key: "reachability", label: "Buyer Reachability (10%)" },
                { key: "mvpSpeed", label: "MVP Build Speed (10%)" },
                { key: "differentiation", label: "Differentiation Wedge (10%)" },
                { key: "retention", label: "Operational Retention (10%)" }
              ] as const).map(slider => (
                <div key={slider.key} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-300">{slider.label}</span>
                    <span className="text-emerald-400 font-semibold">{(weights[slider.key] * 100).toFixed(0)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="0.4" 
                    step="0.01"
                    value={weights[slider.key]}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setWeights(prev => ({ ...prev, [slider.key]: val }));
                    }}
                    className="w-full accent-emerald-500 bg-slate-800 h-1 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              ))}
            </div>
          </div>

          <hr className="border-slate-900" />

          {/* Filters Area */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Filters</h3>
            
            {/* Industry Filter dropdown */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-slate-300">Industry Sector</label>
              <select
                value={selectedIndustry}
                onChange={(e) => setSelectedIndustry(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
              >
                {industriesList.map(ind => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
            </div>

            {/* Build Time Difficulty */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-slate-300">Build Time Category</label>
              <select
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
              >
                <option value="All">All Build Times</option>
                <option value="Low">Fast (2 Weeks)</option>
                <option value="Medium">Moderate (3 Weeks)</option>
                <option value="High">In-Depth (4 Weeks)</option>
              </select>
            </div>

            {/* Score Minimum Threshold */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                <span>Min Rating Score</span>
                <span className="text-emerald-400 font-semibold">{minScore.toFixed(1)}</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="10" 
                step="0.5"
                value={minScore}
                onChange={(e) => setMinScore(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 bg-slate-800 h-1 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </aside>

        {/* Dynamic Screen View Controller */}
        <main className="flex-1 bg-slate-950 p-6 md:p-8 overflow-y-auto flex flex-col gap-8">
          
          {/* Active Filtering Warning banner */}
          {(searchQuery || selectedIndustry !== "All" || selectedDifficulty !== "All" || minScore > 0) && (
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-xs text-slate-300">
                <Filter className="h-4 w-4 text-emerald-400" />
                <span>
                  Filtering active: showing <strong>{filteredOpportunities.length}</strong> of {opportunities.length} total parsed opportunities.
                </span>
              </div>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSelectedIndustry("All");
                  setSelectedDifficulty("All");
                  setMinScore(0);
                }}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
              >
                Clear all filters
              </button>
            </div>
          )}

          {/* Render VIEW MODES */}
          {viewMode === "about" && (
            <div className="space-y-8 max-w-4xl animate-in fade-in duration-200">
              <div className="bg-gradient-to-r from-emerald-950/20 via-purple-950/10 to-slate-950/10 border border-slate-900 p-8 rounded-2xl space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/10 border border-white/10">
                    <Info className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">About Opportunity Intelligence</h2>
                    <p className="text-xs text-slate-300">Quantitative prioritization framework for indie builders</p>
                  </div>
                </div>
                <hr className="border-slate-900" />
                <p className="text-sm text-slate-200 leading-relaxed font-light">
                  Evaluating startup ideas is one of the most high-leverage tasks a technical founder can perform.
                  Too often, developers commit weeks or months to building products without validating market demand, target buyer purchasing power, or lead reachability.
                </p>
                <p className="text-sm text-slate-200 leading-relaxed font-light">
                  This framework forces you to evaluate opportunities across ten objective score metrics, calculating a normalized rating out of 10 based on customizable priority weights.
                </p>
              </div>

              {/* Core Evaluation Metrics Section */}
              <div className="bg-slate-900/30 border border-slate-900 p-8 rounded-2xl space-y-6">
                <div>
                  <h3 className="text-base font-semibold text-white">Platform Evaluation Metrics</h3>
                  <p className="text-xs text-slate-300">Understanding the 10 dimensions used to score opportunities.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                      <span className="font-mono text-xs bg-emerald-950 border border-emerald-900/50 px-1.5 py-0.5 rounded text-emerald-300">1</span>
                      Pain Severity
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed font-light">
                      Measures how urgent the user's issue is. A score of 10 denotes a hair-on-fire B2B operation lapse (e.g., legal liability, severe tax penalty); 1 indicates a minor aesthetic inconvenience.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                      <span className="font-mono text-xs bg-emerald-950 border border-emerald-900/50 px-1.5 py-0.5 rounded text-emerald-300">2</span>
                      Purchase Urgency
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed font-light">
                      Measures user intent timeline. How fast will they pay? A score of 10 means they need a solution today; 1 represents discretionary tools purchased only during annual budgets.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                      <span className="font-mono text-xs bg-emerald-950 border border-emerald-900/50 px-1.5 py-0.5 rounded text-emerald-300">3</span>
                      Willingness to Pay (WTP)
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed font-light">
                      Buyer budget capacity. 10 maps to B2B professionals, fractional CFOs, and general contractors who readily pay premium rates (₹5k - ₹25k/mo) to save hours of labor; 1 maps to budget-conscious consumers.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                      <span className="font-mono text-xs bg-emerald-950 border border-emerald-900/50 px-1.5 py-0.5 rounded text-emerald-300">4</span>
                      Buyer Reachability
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed font-light">
                      Distribution speed. Can you find 30 prospect emails in 30 minutes? 10 indicates easily targetable lists (e.g. boutique accounting firms, trade operators on regional directories); 1 indicates opaque buyer markets.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                      <span className="font-mono text-xs bg-emerald-950 border border-emerald-900/50 px-1.5 py-0.5 rounded text-emerald-300">5</span>
                      MVP Build Speed
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed font-light">
                      Technical velocity. How fast can you launch a functional prototype? 10 indicates simple integrations (e.g. Twilio triggers, secure portals built in 2-3 weeks); 1 indicates complex multi-month machine learning modules.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                      <span className="font-mono text-xs bg-emerald-950 border border-emerald-900/50 px-1.5 py-0.5 rounded text-emerald-300">6</span>
                      Workflow Complexity
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed font-light">
                      Amount of operational support needed. Lower complexity (higher scores) means the software is self-contained and self-serve. Higher complexity means manual onboarding or custom integrations are required.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                      <span className="font-mono text-xs bg-emerald-950 border border-emerald-900/50 px-1.5 py-0.5 rounded text-emerald-300">7</span>
                      Differentiation Wedge
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed font-light">
                      Competitive edge. How easily can you bypass existing software players? For example, using specialized ACORD PDF parsing algorithms or tokenized login-free client portals.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                      <span className="font-mono text-xs bg-emerald-950 border border-emerald-900/50 px-1.5 py-0.5 rounded text-emerald-300">8</span>
                      Operational Retention
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed font-light">
                      Stickiness. Does your product become core infrastructure? If you process real estate commissions, subcontractor documents, or financial ledgers, the replacement barriers are extremely high.
                    </p>
                  </div>
                </div>
              </div>

              {/* Formula & logic section */}
              <div className="bg-slate-900/30 border border-slate-900 p-8 rounded-2xl space-y-4">
                <h3 className="text-base font-semibold text-white">Mathematical Scoring Model</h3>
                <p className="text-xs text-slate-300 leading-relaxed font-light">
                  Each opportunity's final score is a weighted linear combination of its metric ratings (0 to 10) multiplied by your configured priority weights:
                </p>
                <div className="bg-black/40 border border-slate-800 p-4 rounded-xl font-mono text-xs text-slate-200 overflow-x-auto">
                  Weighted Score = Σ (Metric_i * Weight_i)
                </div>
                <p className="text-xs text-slate-300 leading-relaxed font-light">
                  Weights default to standard industry distributions (e.g. Pain Severity, Purchase Urgency, and Willingness to Pay dominate at 15% each, while workflow complexity holds 5%). You can adjust weights in the left panel to prioritize specific parameters, instantly recalculating and re-ranking the entire dashboard.
                </p>
              </div>
            </div>
          )}

          {viewMode === "dashboard" && (
            <div className="space-y-8">
              
              {/* Executive Quick KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-900/30 border border-slate-900 p-5 rounded-xl flex flex-col gap-2">
                  <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Total Evaluated</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-white">{dashboardStats.totalCount}</span>
                    <span className="text-xs text-emerald-400 font-medium">Opportunities</span>
                  </div>
                </div>

                <div className="bg-slate-900/30 border border-slate-900 p-5 rounded-xl flex flex-col gap-2">
                  <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Avg Weighted Score</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-white">{dashboardStats.avgScore}</span>
                    <span className="text-xs text-emerald-400 font-medium">/ 10</span>
                  </div>
                </div>

                <div className="bg-slate-900/30 border border-slate-900 p-5 rounded-xl flex flex-col gap-2">
                  <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Tracked Pipeline Status</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-white">
                      {opportunities.filter(o => o.status === "Validation" || o.status === "MVP").length}
                    </span>
                    <span className="text-xs text-emerald-400 font-medium">In validation/MVP</span>
                  </div>
                </div>

                <div className="bg-slate-900/30 border border-slate-900 p-5 rounded-xl flex flex-col gap-2">
                  <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Flagged Favorites</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-emerald-400">{dashboardStats.favoriteCount}</span>
                    <span className="text-xs text-slate-300 font-medium">Bookmarked</span>
                  </div>
                </div>
              </div>

              {/* Dynamic Difficulty vs Score Reward Matrix Chart */}
              <div id="interactive-plot-card" className="bg-slate-900/30 border border-slate-900 p-6 rounded-2xl">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Interactive Difficulty vs Reward Plot</h3>
                    <p className="text-xs text-slate-300">Proportional mapping of build speed vs rating scores. Highlight elements in the top-right quadrant for optimal targets.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Fast (2 weeks)
                    </span>
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Medium (3 weeks)
                    </span>
                    <span className="flex items-center gap-1.5 text-rose-400">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-400" /> Slow (4 weeks)
                    </span>
                  </div>
                </div>

                {/* Plot Area */}
                <div className="relative w-full h-[400px] border border-slate-800/80 rounded-xl bg-black/40 overflow-hidden select-none">
                  
                  {/* Grid Lines & Axis Markers */}
                  <div className="absolute inset-0 p-8 flex flex-col justify-between pointer-events-none">
                    {/* Horizontal grid guide lines */}
                    <div className="w-full border-t border-dashed border-slate-800/20 relative">
                      <span className="absolute -top-2.5 -left-6 text-[9px] font-mono text-slate-400 bg-slate-950 px-1">Fast (2w)</span>
                    </div>
                    <div className="w-full border-t border-dashed border-slate-800/20 relative">
                      <span className="absolute -top-2.5 -left-6 text-[9px] font-mono text-slate-400 bg-slate-950 px-1">Medium (3w)</span>
                    </div>
                    <div className="w-full border-t border-dashed border-slate-800/20 relative">
                      <span className="absolute -top-2.5 -left-6 text-[9px] font-mono text-slate-400 bg-slate-950 px-1">Slow (4w)</span>
                    </div>
                  </div>

                  {/* Vertical Score Guide ticks */}
                  <div className="absolute inset-0 p-8 flex justify-between pointer-events-none">
                    <div className="h-full border-l border-dashed border-slate-800/20 relative" />
                    <div className="h-full border-l border-dashed border-slate-800/20 relative">
                      <span className="absolute bottom-2 -left-3 text-[9px] font-mono text-slate-400 bg-slate-950 px-1">Score 7.5</span>
                    </div>
                    <div className="h-full border-l border-dashed border-slate-800/20 relative">
                      <span className="absolute bottom-2 -left-3 text-[9px] font-mono text-slate-400 bg-slate-950 px-1">Score 8.5</span>
                    </div>
                    <div className="h-full border-l border-dashed border-slate-800/20 relative">
                      <span className="absolute bottom-2 -left-3 text-[9px] font-mono text-slate-400 bg-slate-950 px-1">Score 9.5</span>
                    </div>
                  </div>

                  {/* HTML Absolute Dots Layout */}
                  <div className="absolute inset-0 p-12">
                    {filteredOpportunities.map((opp) => {
                      // Calculate X percentage (Score)
                      const xPercent = ((opp.calculatedScore - scoreBounds.min) / scoreBounds.range) * 100;
                      // Calculate Y percentage (Build days: fewer days = higher up)
                      const days = parseBuildTimeToDays(opp.buildTime);
                      const yPercent = ((days - daysBounds.min) / daysBounds.range) * 100;
                      
                      // Safety bounds clipping (prevent dots from rendering outside [0, 100])
                      const x = Math.min(Math.max(xPercent, 0), 100);
                      const y = Math.min(Math.max(yPercent, 0), 100);

                      let colorClass = "from-emerald-500 to-purple-600 shadow-emerald-500/20";
                      let borderClass = "border-emerald-400/80";
                      if (opp.buildTime.includes("2")) {
                        colorClass = "from-emerald-400 to-teal-500 shadow-emerald-500/20";
                        borderClass = "border-emerald-300/80";
                      } else if (opp.buildTime.includes("4")) {
                        colorClass = "from-rose-400 to-pink-500 shadow-rose-500/20";
                        borderClass = "border-rose-300/80";
                      }

                      const isSelected = selectedOpportunityId === opp.id;

                      return (
                        <div
                          key={opp.id}
                          style={{
                            left: `${x}%`,
                            top: `${y}%`,
                            transform: 'translate(-50%, -50%)',
                          }}
                          className="absolute group z-10"
                        >
                          {/* Pulsing selection circle */}
                          {isSelected && (
                            <div className="absolute inset-0 -m-3 animate-ping rounded-full bg-white/10" />
                          )}
                          
                          {/* Dot item trigger */}
                          <button
                            onClick={() => setSelectedOpportunityId(opp.id)}
                            className={`h-5 w-5 rounded-full bg-gradient-to-br ${colorClass} border-2 ${
                              isSelected ? 'border-white scale-125 ring-4 ring-emerald-500/30' : 'border-slate-950 hover:border-white'
                            } shadow-lg transition-all duration-200 cursor-pointer flex items-center justify-center`}
                            title={opp.name}
                          >
                            {isSelected && (
                              <div className="h-1.5 w-1.5 rounded-full bg-white" />
                            )}
                          </button>

                          {/* Hover tooltip card details */}
                          <div className="absolute left-1/2 bottom-8 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-300 z-50 translate-y-2 group-hover:translate-y-0 w-64">
                            <div className="bg-slate-950/95 border border-slate-800 rounded-xl p-3.5 shadow-2xl backdrop-blur-md">
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <span className={`text-[9px] font-mono border ${borderClass} px-1.5 py-0.5 rounded-md uppercase font-bold text-slate-200`}>
                                  {opp.industry}
                                </span>
                                <span className="text-[10px] font-mono font-bold text-white bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                                  {opp.calculatedScore} / 10
                                </span>
                              </div>
                              <h4 className="text-xs font-semibold text-white mb-1">{opp.name}</h4>
                              <p className="text-[10px] text-slate-300 font-light line-clamp-2 leading-relaxed mb-2">
                                {opp.painPoint}
                              </p>
                              <div className="flex items-center justify-between border-t border-slate-900 pt-2 text-[10px] font-mono">
                                <span className="text-slate-400 uppercase">Build Time:</span>
                                <span className="text-emerald-400 font-medium">{opp.buildTime}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Axis Labeling Icons and Tags */}
                  <div className="absolute bottom-2.5 right-4 text-[10px] font-mono text-slate-400 flex items-center gap-1.5 pointer-events-none">
                    <span>Calculated Score Axis (Low → High)</span>
                    <ArrowRight className="h-3 w-3 text-slate-500" />
                  </div>
                  <div className="absolute top-3 left-4 text-[10px] font-mono text-slate-400 flex flex-col pointer-events-none">
                    <span className="font-semibold text-slate-300">↑ Fast Build Speed (2 Weeks)</span>
                    <span className="text-slate-500">↓ Slow Build Speed (4 Weeks)</span>
                  </div>
                </div>
              </div>

              {/* Dynamic Score Components Analysis Block */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Score Breakdown Analysis */}
                <div className="bg-slate-900/30 border border-slate-900 p-6 rounded-2xl flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-2">High Potential Opportunities Ranking</h3>
                    <p className="text-xs text-slate-300 mb-4">Top models prioritized by score metrics using selected weights.</p>
                  </div>
                  
                  <div className="space-y-3">
                    {filteredOpportunities.slice(0, 5).map((opp, index) => (
                      <div 
                        key={opp.id}
                        onClick={() => setSelectedOpportunityId(opp.id)}
                        className="bg-black/30 border border-slate-900 hover:border-slate-800 p-3.5 rounded-xl flex items-center justify-between cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-emerald-400 font-bold bg-emerald-950/40 border border-emerald-900/40 h-6 w-6 rounded-full flex items-center justify-center">
                            #{index + 1}
                          </span>
                          <div>
                            <h4 className="text-xs font-semibold text-white">{opp.name}</h4>
                            <p className="text-[10px] text-slate-300">{opp.industry} • Built in {opp.buildTime}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-white bg-slate-800 px-2 py-1 rounded">
                            {opp.calculatedScore}
                          </span>
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Interactive Launch Readiness Radar chart placeholder simulation */}
                <div className="bg-slate-900/30 border border-slate-900 p-6 rounded-2xl flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-white">Dynamic Visual Assessment: {activeOpportunity.name}</h3>
                      <span className="bg-emerald-500/10 text-emerald-400 text-xs px-2.5 py-1 rounded font-mono font-medium">
                        Score: {activeOpportunity.calculatedScore}/10
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">Score metrics breakdown for the currently selected opportunity.</p>
                  </div>

                  {/* Interactive Mini Visual Parameter Bars */}
                  <div className="space-y-3.5 my-4">
                    {[
                      { label: "Pain Severity", val: activeOpportunity.metrics.painSeverity },
                      { label: "Purchase Urgency", val: activeOpportunity.metrics.purchaseUrgency },
                      { label: "Willingness to Pay", val: activeOpportunity.metrics.willingnessToPay },
                      { label: "Reachability", val: activeOpportunity.metrics.reachability },
                      { label: "MVP Speed", val: activeOpportunity.metrics.mvpSpeed },
                    ].map(bar => (
                      <div key={bar.label} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className="text-slate-300">{bar.label}</span>
                          <span className="text-white font-semibold">{bar.val}/10</span>
                        </div>
                        <div className="w-full bg-slate-800/80 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-gradient-to-r from-emerald-500 to-violet-500 h-full rounded-full transition-all duration-300" 
                            style={{ width: `${bar.val * 10}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => setViewMode("grid")}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all"
                  >
                    <span>Analyze Blueprint Card Grid</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

            </div>
          )}

          {}
          {viewMode === "grid" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredOpportunities.map(opp => {
                const isSelected = selectedOpportunityId === opp.id;
                const isCompared = compareIds.includes(opp.id);
                return (
                  <div 
                    key={opp.id}
                    className={`bg-slate-900/30 border rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 relative overflow-hidden group hover:shadow-xl hover:shadow-emerald-500/[0.02] ${
                      isSelected ? "border-emerald-500 bg-slate-900/50" : "border-slate-900 hover:border-slate-800"
                    }`}
                  >
                    
                    {/* Highlight glowing elements on active selection */}
                    {isSelected && (
                      <div className="absolute top-0 right-0 h-20 w-20 bg-emerald-500/10 blur-xl pointer-events-none rounded-full" />
                    )}

                    {/* Card Top Information */}
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <span className="bg-slate-800 text-slate-200 text-[10px] px-2 py-0.5 rounded-full font-mono tracking-wide">
                          {opp.industry}
                        </span>
                        
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleCompare(opp.id)}
                            className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${
                              isCompared 
                                ? "bg-emerald-950 text-emerald-400 border-emerald-900" 
                                : "bg-transparent text-slate-400 hover:text-slate-200 border-slate-800"
                            }`}
                          >
                            {isCompared ? "Compare Active" : "+ Compare"}
                          </button>
                          
                          <button 
                            onClick={() => toggleFavorite(opp.id)}
                            className="text-slate-400 hover:text-amber-400 transition-colors"
                          >
                            <Star className={`h-4.5 w-4.5 ${opp.isFavorite ? "fill-amber-400 text-amber-400" : "text-slate-500"}`} />
                          </button>
                        </div>
                      </div>

                      <h3 
                        onClick={() => setSelectedOpportunityId(opp.id)}
                        className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors cursor-pointer flex items-center gap-2"
                      >
                        {opp.name}
                      </h3>
                      
                      <p className="text-xs text-slate-300 line-clamp-2 mt-2 font-light">
                        {opp.painPoint}
                      </p>

                      {/* Display visual metadata tags */}
                      <div className="flex flex-wrap gap-1.5 my-3.5">
                        {opp.tags.map(tag => (
                          <span key={tag} className="text-[9px] font-mono bg-slate-900/60 text-slate-300 border border-slate-800/80 px-1.5 py-0.5 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Card Footer Actions */}
                    <div className="border-t border-slate-900/80 pt-4 mt-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <span className="text-[9px] text-slate-400 uppercase tracking-wider font-mono">Weighted Score</span>
                          <span className="text-xs font-semibold text-white font-mono">{opp.calculatedScore}/10</span>
                        </div>
                        <div className="h-6 w-px bg-slate-800" />
                        <div className="flex flex-col">
                          <span className="text-[9px] text-slate-400 uppercase tracking-wider font-mono">Build Speed</span>
                          <span className="text-xs text-emerald-400 font-mono font-medium">{opp.buildTime}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setSelectedOpportunityId(opp.id);
                          setViewMode("dashboard"); // Swaps display target down to interactive detail modal on view
                        }}
                        className="text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                      >
                        <span>Deep-Dive</span>
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>
          )}

          {}
          {viewMode === "leaderboard" && (
            <div className="bg-slate-900/30 border border-slate-900 rounded-2xl overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">Ranked Assessment Leaderboard</h3>
                  <p className="text-xs text-slate-300">Deterministic models ranked according to current target metrics weights.</p>
                </div>
              </div>

              {/* Table Container */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-900 text-[10px] font-mono uppercase tracking-wider text-slate-400 bg-black/20">
                      <th className="px-6 py-4">Rank</th>
                      <th className="px-6 py-4">Opportunity Model</th>
                      <th className="px-6 py-4">Industry Sector</th>
                      <th className="px-6 py-4">Build Window</th>
                      <th className="px-6 py-4 text-center">Pain Severity</th>
                      <th className="px-6 py-4 text-center">Willingness to Pay</th>
                      <th className="px-6 py-4 text-center">MVP Speed</th>
                      <th className="px-6 py-4 text-right">Weighted Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/40 text-xs">
                    {filteredOpportunities.map((opp, idx) => (
                      <tr 
                        key={opp.id}
                        onClick={() => setSelectedOpportunityId(opp.id)}
                        className={`hover:bg-slate-900/20 cursor-pointer transition-colors ${
                          selectedOpportunityId === opp.id ? "bg-emerald-600/5 text-slate-200" : "text-slate-300"
                        }`}
                      >
                        <td className="px-6 py-4 font-mono font-bold text-emerald-400">#{idx + 1}</td>
                        <td className="px-6 py-4 font-semibold text-white">{opp.name}</td>
                        <td className="px-6 py-4">{opp.industry}</td>
                        <td className="px-6 py-4 font-mono">{opp.buildTime}</td>
                        <td className="px-6 py-4 text-center font-mono">{opp.metrics.painSeverity}/10</td>
                        <td className="px-6 py-4 text-center font-mono">{opp.metrics.willingnessToPay}/10</td>
                        <td className="px-6 py-4 text-center font-mono">{opp.metrics.mvpSpeed}/10</td>
                        <td className="px-6 py-4 text-right text-white font-mono font-bold">{opp.calculatedScore}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {}
          {viewMode === "kanban" && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {STAGES.map(stage => {
                const stageOpps = filteredOpportunities.filter(o => o.status === stage);
                return (
                  <div key={stage} className="bg-slate-900/10 border border-slate-900 rounded-2xl p-4 flex flex-col gap-4 min-h-[400px]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span className="text-xs font-semibold text-white">{stage}</span>
                      </div>
                      <span className="bg-slate-900 text-slate-300 font-mono text-[10px] px-2 py-0.5 rounded-full">
                        {stageOpps.length}
                      </span>
                    </div>

                    <div className="space-y-3 flex-1 overflow-y-auto">
                      {stageOpps.map(opp => (
                        <div
                          key={opp.id}
                          className="bg-slate-900/40 border border-slate-800 hover:border-slate-700 p-4 rounded-xl flex flex-col gap-2 transition-all cursor-grab active:cursor-grabbing group"
                        >
                          <h4 
                            onClick={() => setSelectedOpportunityId(opp.id)}
                            className="text-xs font-semibold text-white group-hover:text-emerald-400 transition-colors cursor-pointer"
                          >
                            {opp.name}
                          </h4>
                          <p className="text-[10px] text-slate-300 line-clamp-2 leading-relaxed">
                            {opp.painPoint}
                          </p>
                          <div className="flex items-center justify-between pt-2 border-t border-slate-900 mt-2">
                            <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider">{opp.industry}</span>
                            <div className="flex items-center gap-2">
                              {/* Option Select to shift pipelines without drag support in mobile */}
                              <select
                                value={opp.status}
                                onChange={(e) => updateStatus(opp.id, e.target.value)}
                                className="bg-slate-950 border border-slate-800 text-[9px] rounded px-1.5 py-0.5 text-slate-200 font-mono"
                              >
                                {STAGES.map(s => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {}
          {viewMode === "compare" && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">Side-by-Side Validation Comparison Matrix</h3>
                  <p className="text-xs text-slate-300">Select up to 3 models from the Opportunity Grid list to analyze parameters side by side.</p>
                </div>
                {compareIds.length > 0 && (
                  <button 
                    onClick={() => setCompareIds([])}
                    className="text-xs text-rose-400 hover:text-rose-300 font-medium transition-colors"
                  >
                    Clear Comparison Selection
                  </button>
                )}
              </div>

              {compareIds.length === 0 ? (
                <div className="border border-dashed border-slate-800 rounded-2xl p-12 text-center flex flex-col items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-slate-900 flex items-center justify-center text-slate-300">
                    <Layers className="h-5 w-5" />
                  </div>
                  <h4 className="text-sm font-medium text-white">No items chosen for comparison matrix</h4>
                  <p className="text-xs text-slate-300 max-w-xs">
                    Navigate to the **Opportunity Grid** and click **"+ Compare"** on target opportunities to display a side-by-side assessment here.
                  </p>
                  <button 
                    onClick={() => setViewMode("grid")}
                    className="mt-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
                  >
                    Open Opportunity Grid
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {compareIds.map(id => {
                    const opp = scoredOpportunities.find(o => o.id === id);
                    if (!opp) return null;
                    return (
                      <div key={opp.id} className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between gap-6">
                        <div className="space-y-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-[9px] font-mono uppercase bg-slate-800 text-slate-200 px-2 py-0.5 rounded-full">
                                {opp.industry}
                              </span>
                              <h4 className="text-sm font-semibold text-white mt-1.5">{opp.name}</h4>
                            </div>
                            <span className="text-xs font-mono font-bold bg-emerald-950 text-emerald-400 px-2 py-1 rounded">
                              {opp.calculatedScore}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 block">Target Customer Persona</span>
                            <p className="text-xs text-slate-200 leading-relaxed font-light">{opp.targetCustomer}</p>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 block">Core Problem Pain</span>
                            <p className="text-xs text-slate-200 leading-relaxed font-light">{opp.painPoint}</p>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 block">Unique Wedge Differentiator</span>
                            <p className="text-xs text-emerald-400 leading-relaxed font-light">{opp.wedge}</p>
                          </div>

                          <div className="space-y-1.5">
                            <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 block">Pricing Models</span>
                            <div className="bg-black/30 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-200 space-y-1">
                              <div>Starter: ₹{opp.pricing.starter.price.toLocaleString()} (${opp.pricing.starter.usd})</div>
                              <div>Growth: ₹{opp.pricing.pro.price.toLocaleString()} (${opp.pricing.pro.usd})</div>
                              <div>Enterprise: ₹{opp.pricing.enterprise.price.toLocaleString()} (${opp.pricing.enterprise.usd})</div>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setSelectedOpportunityId(opp.id);
                            setViewMode("dashboard");
                          }}
                          className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium py-2.5 rounded-xl transition-colors"
                        >
                          Deep-Dive Validation Strategy
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {}
          {/* Detailed Strategy Sheet Layout below screens */}
          <section id="deep-dive-section" className="mt-8 border-t border-slate-900 pt-8 flex flex-col gap-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
                <h2 className="text-base font-semibold text-white">Active Opportunity Blueprint Deep-Dive: {activeOpportunity.name}</h2>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => exportToMarkdown(activeOpportunity)}
                  className="bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs px-3.5 py-2 rounded-lg border border-slate-800 flex items-center gap-2 transition-colors"
                >
                  <FileText className="h-4 w-4" />
                  <span>Export Markdown Deep Dive</span>
                </button>
                <button 
                  onClick={() => toggleFavorite(activeOpportunity.id)}
                  className="bg-slate-900 hover:bg-slate-800 p-2 rounded-lg border border-slate-800 transition-colors"
                >
                  <Star className={`h-4 w-4 ${activeOpportunity.isFavorite ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
                </button>
              </div>
            </div>

            {/* Strategy Sheet Tabs Navigation */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Card 1: GTM Validation Plan & Outbound Templates */}
              <div className="bg-slate-900/30 border border-slate-900 p-6 rounded-2xl flex flex-col justify-between gap-6">
                <div>
                  <h3 className="text-xs font-mono uppercase tracking-wider text-emerald-400 mb-3">Go-to-Market & Validation Action Plan</h3>
                  <h4 className="text-sm font-semibold text-white mb-2">Tactical Lead Generation Method</h4>
                  <p className="text-xs text-slate-300 leading-relaxed mb-4 font-light">
                    How to reach your first 10 paying customers without spending a single rupee on ads or operations setup.
                  </p>

                  <div className="bg-black/40 border border-slate-800 p-4 rounded-xl space-y-3">
                    <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider block">Recommended Cold Pitch Script</span>
                    <p className="text-[11px] text-slate-200 italic leading-relaxed">
                      "Hi [First Name], noticed your team handles substantial PDF statement backlogs manually. Created a tokenized engine where accounts drop statements with zero password setups, auto-calculating reconciliation balances. Open to test importing one of your PDFs as a validation check?"
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-[11px] font-mono text-slate-300 uppercase tracking-wider">Fast-Validation Task Checklist</div>
                  {[
                    "Identify 35 localized prospective niche accounts.",
                    "Draft customized copy pitch outlines.",
                    "Launch personal message campaigns on LinkedIn.",
                    "Process first mock document tests manually for feedback."
                  ].map((task, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs text-slate-200">
                      <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                      <span className="font-light">{task}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Card 2: Interactive Revenue Projection Architect */}
              <div className="bg-slate-900/30 border border-slate-900 p-6 rounded-2xl flex flex-col justify-between gap-6">
                <div>
                  <h3 className="text-xs font-mono uppercase tracking-wider text-emerald-400 mb-3">Financial Projections Calculator</h3>
                  <h4 className="text-sm font-semibold text-white mb-2">Configure Customer Account Targets</h4>
                  <p className="text-xs text-slate-300 leading-relaxed mb-4 font-light">
                    Adjust target account counts across tiers to calculate expected MRR paths and hit growth targets.
                  </p>

                  {/* Multi-tier Account Sliders */}
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-slate-300">Starter Tier (₹{activeOpportunity.pricing.starter.price.toLocaleString()})</span>
                        <span className="text-white font-bold">{calcStarterCount} users</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={calcStarterCount}
                        onChange={(e) => setCalcStarterCount(parseInt(e.target.value))}
                        className="w-full accent-emerald-500 bg-slate-800 h-1 rounded-lg"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-slate-300">Pro Tier (₹{activeOpportunity.pricing.pro.price.toLocaleString()})</span>
                        <span className="text-white font-bold">{calcProCount} users</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="50" 
                        value={calcProCount}
                        onChange={(e) => setCalcProCount(parseInt(e.target.value))}
                        className="w-full accent-emerald-500 bg-slate-800 h-1 rounded-lg"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-slate-300">Enterprise Tier (₹{activeOpportunity.pricing.enterprise.price.toLocaleString()})</span>
                        <span className="text-white font-bold">{calcEnterpriseCount} users</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="20" 
                        value={calcEnterpriseCount}
                        onChange={(e) => setCalcEnterpriseCount(parseInt(e.target.value))}
                        className="w-full accent-emerald-500 bg-slate-800 h-1 rounded-lg"
                      />
                    </div>
                  </div>
                </div>

                {/* Calculated MRR Projection Widget */}
                <div className="bg-black/30 p-4 rounded-xl border border-slate-800/80 flex flex-col gap-1">
                  <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider">Estimated Project Recurrent Revenue</span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xl font-bold text-white font-mono">₹{calculatedMRR.toLocaleString()}/mo</span>
                    <span className="text-xs text-slate-300">~ ${(calculatedMRR / 82).toFixed(0)} USD</span>
                  </div>
                  
                  {/* Status Indicator Alerts to Revenue Target milestones */}
                  <div className="mt-3 pt-3 border-t border-slate-900/80 flex items-center justify-between text-[10px]">
                    <span className="text-slate-400 uppercase font-mono">Milestone Hit:</span>
                    {calculatedMRR >= 300000 ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5" /> Tier 3 (₹3L+ MRR reached!)
                      </span>
                    ) : calculatedMRR >= 100000 ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5" /> Tier 2 (₹1L MRR reached!)
                      </span>
                    ) : calculatedMRR >= 30000 ? (
                      <span className="text-amber-400 font-bold flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5" /> Tier 1 (₹30k MRR reached!)
                      </span>
                    ) : (
                      <span className="text-slate-300 font-medium italic">Targeting Tier 1 (₹30k MRR)</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Card 3: AI-Assisted Tech Stack & Build Blueprint */}
              <div className="bg-slate-900/30 border border-slate-900 p-6 rounded-2xl flex flex-col justify-between gap-6">
                <div>
                  <h3 className="text-xs font-mono uppercase tracking-wider text-emerald-400 mb-3">AI Stack & Build Blueprint</h3>
                  <h4 className="text-sm font-semibold text-white mb-2">Recommended Tech Pipeline</h4>
                  <p className="text-xs text-slate-200 leading-relaxed mb-4 font-light">
                    Recommended software stack setup for a solo founder to deploy this solution in 2-4 weeks.
                  </p>

                  <div className="space-y-3 font-mono text-xs">
                    <div className="bg-black/40 border border-slate-800 p-3 rounded-lg flex items-center justify-between">
                      <span className="text-slate-300">Core Framework</span>
                      <span className="text-white text-[11px]">Next.js (App Router)</span>
                    </div>
                    <div className="bg-black/40 border border-slate-800 p-3 rounded-lg flex items-center justify-between">
                      <span className="text-slate-300">Database & Auth</span>
                      <span className="text-white text-[11px]">Supabase PostgreSQL</span>
                    </div>
                    <div className="bg-black/40 border border-slate-800 p-3 rounded-lg flex items-center justify-between">
                      <span className="text-slate-300">Async Workers / APIs</span>
                      <span className="text-white text-[11px]">Inbound Webhooks, Resend</span>
                    </div>
                  </div>
                </div>

                <div className="bg-emerald-950/20 border border-emerald-900/40 p-4 rounded-xl flex items-start gap-3">
                  <Zap className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <span className="font-semibold text-white block mb-0.5">Prompt Blueprint Wedge</span>
                    <p className="text-slate-300 font-light leading-relaxed">
                      "Write an optimized React state management workflow that parses raw PDF text elements and validates computed totals against user uploaded totals."
                    </p>
                  </div>
                </div>
              </div>

            </div>

            {/* Dynamic Local Text Notes Integration */}
            <div className="bg-slate-900/30 border border-slate-900 p-6 rounded-2xl">
              <div className="flex items-center gap-2.5 mb-4">
                <MessageSquare className="h-5 w-5 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Founder Notes & Validation Journal</h3>
              </div>
              <textarea
                value={activeOpportunity.notes || ""}
                onChange={(e) => updateNotes(activeOpportunity.id, e.target.value)}
                placeholder="Write customized validation strategies, target user names, feedback received on LinkedIn outreach, and custom dev steps..."
                className="w-full bg-black/40 border border-slate-800 rounded-xl p-4 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono leading-relaxed"
                rows={4}
              />
              <p className="text-[10px] text-slate-400 mt-2 font-mono">
                * Note changes are instantly updated in the active memory structure.
              </p>
            </div>
          </section>

        </main>

      </div>

      {}
      {/* Onboarding Tour Modal Overlay */}
      {tourStep !== null && (
        <div className="fixed inset-0 z-50 bg-black/25 pointer-events-none">
          {/* Target Element Spotlight SVG Cutout Mask */}
          {targetRect && (
            <svg className="fixed inset-0 pointer-events-none" style={{ zIndex: 48, width: '100vw', height: '100vh' }}>
              <defs>
                <mask id="spotlight-mask">
                  <rect width="100%" height="100%" fill="white" />
                  <rect 
                    x={targetRect.left - 8} 
                    y={targetRect.top - 8} 
                    width={targetRect.width + 16} 
                    height={targetRect.height + 16} 
                    rx="12" 
                    fill="black" 
                  />
                </mask>
              </defs>
              <rect 
                width="100%" 
                height="100%" 
                fill="rgba(0, 0, 0, 0.72)" 
                mask="url(#spotlight-mask)" 
              />
              <rect 
                x={targetRect.left - 8} 
                y={targetRect.top - 8} 
                width={targetRect.width + 16} 
                height={targetRect.height + 16} 
                rx="12" 
                fill="transparent" 
                stroke="#34d399" 
                strokeWidth="2" 
                className="animate-pulse" 
                style={{ filter: 'drop-shadow(0 0 8px rgba(52, 211, 153, 0.5))' }}
              />
            </svg>
          )}

          {/* Floating Onboarding Tour Card */}
          <div 
            style={tooltipStyle}
            className="bg-slate-950 border border-slate-900 rounded-2xl w-full max-w-sm overflow-visible shadow-2xl pointer-events-auto"
          >
            {placement === 'below' && (
              <div 
                className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full w-0 h-0 border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-slate-950"
                style={{ borderBottomColor: '#090d16' }}
              />
            )}
            {placement === 'above' && (
              <div 
                className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-slate-950"
                style={{ borderTopColor: '#090d16' }}
              />
            )}

            <div className="px-5 py-4 border-b border-slate-900 bg-black/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4.5 w-4.5 text-emerald-400 animate-pulse" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                  Tour • Step {tourStep + 1} of {TOUR_STEPS.length}
                </span>
              </div>
              <button 
                onClick={() => {
                  setTourStep(null);
                  localStorage.setItem("hasSeenTour", "true");
                }}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <h3 className="text-sm font-bold text-white">
                {TOUR_STEPS[tourStep].title}
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed font-light">
                {TOUR_STEPS[tourStep].content}
              </p>
            </div>

            <div className="px-5 py-3 border-t border-slate-900/60 bg-black/35 flex items-center justify-between text-xs">
              <button
                onClick={() => {
                  setTourStep(null);
                  localStorage.setItem("hasSeenTour", "true");
                }}
                className="text-slate-400 hover:text-slate-200 font-semibold transition-colors"
              >
                Skip Tour
              </button>

              <div className="flex items-center gap-2.5">
                {tourStep > 0 && (
                  <button
                    onClick={() => {
                      const prevStep = tourStep - 1;
                      const prevSelector = TOUR_STEPS[prevStep].selector;
                      
                      // Auto-toggle viewModes to align with spotlight target on Back action
                      if (prevSelector === "#interactive-plot-card") setViewMode("dashboard");
                      else if (prevSelector === "#tab-grid") setViewMode("grid");
                      else if (prevSelector === "#tab-leaderboard") setViewMode("leaderboard");
                      else if (prevSelector === "#tab-kanban") setViewMode("kanban");
                      else if (prevSelector === "#tab-compare") setViewMode("compare");
                      else if (prevSelector === "#tab-about") setViewMode("about");
                      else if (prevSelector === "#deep-dive-section") setViewMode("dashboard");
                      
                      setTourStep(prevStep);
                    }}
                    className="bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold px-3.5 py-1.5 rounded-lg border border-slate-800 transition-colors"
                  >
                    Back
                  </button>
                )}
                
                <button
                  onClick={() => {
                    if (tourStep < TOUR_STEPS.length - 1) {
                      const nextStep = tourStep + 1;
                      const nextSelector = TOUR_STEPS[nextStep].selector;
                      
                      // Auto-toggle viewModes to align with spotlight target on Next action
                      if (nextSelector === "#interactive-plot-card") setViewMode("dashboard");
                      else if (nextSelector === "#tab-grid") setViewMode("grid");
                      else if (nextSelector === "#tab-leaderboard") setViewMode("leaderboard");
                      else if (nextSelector === "#tab-kanban") setViewMode("kanban");
                      else if (nextSelector === "#tab-compare") setViewMode("compare");
                      else if (nextSelector === "#tab-about") setViewMode("about");
                      else if (nextSelector === "#deep-dive-section") setViewMode("dashboard");
                      
                      setTourStep(nextStep);
                    } else {
                      setTourStep(null);
                      localStorage.setItem("hasSeenTour", "true");
                      triggerToast("Welcome! You are ready to evaluate opportunities.");
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3.5 py-1.5 rounded-lg transition-all active:scale-95"
                >
                  {tourStep === TOUR_STEPS.length - 1 ? "Finish" : "Next"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-900 rounded-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileUp className="h-5 w-5 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Dynamic Report Ingestion Engine</h3>
              </div>
              <button 
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed font-light">
                Paste raw startup research text fragments, micro-SaaS analyses, or standard notes. The ingestion layout automatically processes indicators (Title, Industry, Pricing limits) to seed the active grid layout immediately.
              </p>

              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Raw Text Ingestion Form</label>
                <textarea
                  value={customInputReport}
                  onChange={(e) => setCustomInputReport(e.target.value)}
                  placeholder={`Example Input Structure:\nName: Automated Document Auditer\nIndustry: Compliance\nTarget: Real estate agency monitors\nPain: Verifying background check certificates manually\nPricing: 2900 / 6900 / 14900`}
                  className="w-full bg-black/40 border border-slate-800 rounded-xl p-4 text-xs text-slate-200 placeholder-zinc-750 focus:outline-none focus:border-emerald-500 font-mono"
                  rows={8}
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-900/60 bg-black/30 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowUploadModal(false)}
                className="bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-slate-200 text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleIngestReport}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2 transition-all active:scale-95"
              >
                <Sparkles className="h-4 w-4" />
                <span>Parse & Ingest Model</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}