# Opportunity Intelligence Platform (V2.0) - Centered on AI Ingestion

The **Opportunity Intelligence Platform** is a quantitative validation environment and decision-matrix tool designed specifically for solo technical founders. The platform is built around the **AI Ingestion Hub**—a workspace powered by Google Gemini 1.5 Flash that takes unstructured text (competitor pages, raw notes, or pitch briefs) and automatically extracts key indicators, models pricing tiers, suggests tech stacks, and scores the business across 10 prioritization metrics.

---

## 📖 The Core Philosophy: AI-First Ingestion

As a solo developer, your most scarce resource is **time**. Most ideas fail because of lack of validation. This platform bridges that gap by letting you paste *anything*—from raw scribbles to detailed market reports—and instantly get structured, mathematically ranked evaluations. 

By feeding unstructured notes through the **AI Ingestion Hub**, you immediately grade every business concept across **10 objective metrics** with manual override sliders, calculating a normalized score out of 10 for each idea. 

---

## 🧮 Mathematical Scoring Model

Each opportunity's rating is computed as a weighted linear combination of its metric scores ($S_i$) multiplied by your custom priority weights ($W_i$):

$$\text{Weighted Score} = \sum_{i=1}^{10} (S_i \times W_i)$$

The sum of all weights always equals 100%. Adjusting weights in the sidebar immediately recalculates scores and updates rankings across the entire platform.

---

## 📐 The 10 Priority Metrics

The platform grades ideas on a scale from `1` (worst) to `10` (best) across the following key dimensions:

1. **Pain Severity**: How critical is the problem? 
   - *10 = Operational failure, legal liability, or severe financial penalty.*
   - *1 = Aesthetic preference or minor convenience.*
2. **Purchase Urgency**: How fast will the customer make a buying decision?
   - *10 = Immediate purchase required to keep operations running.*
   - *1 = Long B2B procurement processes or annual discretionary budget approvals.*
3. **Willingness to Pay (WTP)**: The budget capacity of the target profile.
   - *10 = High-margin B2B operators (e.g. general contractors, real estate brokerages) willing to pay ₹5,000 - ₹25,000/month.*
   - *1 = Budget-conscious consumers or pre-revenue startups.*
4. **Buyer Reachability**: Distribution speed.
   - *10 = You can find and scrape 100 high-accuracy prospect email addresses in 30 minutes.*
   - *1 = Opaque, highly regulated fields (e.g. enterprise procurement directors).*
5. **MVP Build Speed**: Technical velocity.
   - *10 = 2-3 weeks of development using standard templates (simple CRUD, auth, billing).*
   - *1 = Complex multi-month builds (e.g. specialized ML models, custom hardware integrations).*
6. **Workflow Complexity**: Operational maintenance.
   - *10 = Self-serve, automated onboarding with no manual setup.*
   - *1 = High-touch implementation, custom customer training, or manual data entry.*
7. **Differentiation Wedge**: Competitive advantage.
   - *10 = Niche, specialized feature bypasses generic competition (e.g. ACORD PDF parsing).*
   - *1 = Highly crowded red-ocean markets (e.g. general CRM, basic project boards).*
8. **Operational Retention**: Customer stickiness.
   - *10 = Embedded deep in daily workflows, high switching costs.*
   - *1 = Discretionary utilities easily turned off.*
9. **Defensibility**: Ease of duplication.
   - *10 = Proprietary data loops, network effects, or complex integrations.*
   - *1 = Simple wrappers easily replicated by another developer in a weekend.*
10. **Financial Probability**: Likelihood of reaching cashflow positive status quickly.
    - *10 = High conversion rate with clear ROI.*
    - *1 = Opaque monetization strategies.*

---

## ⚡ Key Features & Views

### 1. View Modes
Switch between 6 distinct perspectives in the sidebar navigation:
- **Executive Dashboard**: Summarizes core platform statistics (evaluated count, averages, bookmarks) and contains the **Difficulty vs Reward Plot**.
- **Opportunity Grid**: Displays detailed cards for each opportunity. It allows toggle comparison, bookmarking, and displays metric ratings, problems, workarounds, and tags.
- **Ranked Leaderboard**: A sorted ledger showing opportunities ordered strictly by their weighted scores, making it clear which ideas are mathematically superior.
- **Kanban Pipeline**: Drag-and-drop opportunity cards across validation phases: `Idea` ➔ `Research` ➔ `Validation` ➔ `MVP` ➔ `Launch`.
- **Side-by-Side Comparison**: Pick up to 3 opportunities from the grid to compare their target buyers, pain points, wedges, and pricing details.
- **About Platform**: A comprehensive reference guide mapping metrics, scoring logic, and platform philosophies.

### 2. Interactive Difficulty vs Reward Plot
An overlay scatter plot mapping **Build Duration (Y-axis)** against the **Calculated Score (X-axis)**:
- Hover over dots to view a glassmorphic details tooltip showing the opportunity's name, sector, exact score, and build difficulty.
- Spots high-priority targets immediately: focus on items in the **top-right quadrant** (High rating score, fast build speed).

### 3. Framework Weights Control Panel
- Sliders in the left sidebar allow you to customize weight distributions.
- Clicking the **Reset** button restores standard B2B weights (15% Pain Severity, 15% Purchase Urgency, 15% WTP, 10% Reachability, 10% MVP Speed, etc.).

### 4. Strategic Validation Blueprints
When you select an opportunity, the bottom panel populates with concrete, actionable execution plans:
- **GTM Outbound Plan**: Provides a tailored cold email outreach script, complete with a subject line, problem-hook body, and call-to-action.
- **Financial MRR Projection Calculator**: Slide custom starter, pro, and enterprise customer counts to dynamically calculate estimated monthly recurring revenue (MRR) using the opportunity's target pricing model.
- **Tech Stack & Validation Experiments**: Displays recommended libraries, setup steps, key risks, and validation tests.
- **Founder Notes Notepad**: A local text area to record logs, ideas, or research details directly within the active opportunity.

### 5. Dynamic Report Ingestion Engine
- Click the **"Ingest Report"** button in the header.
- Paste unstructured startup ideas, research transcripts, or raw notes.
- The built-in parser automatically extracts parameters (Name, Industry, Target, Pain, and Pricing starter/pro limits) to bootstrap a new opportunity card instantly.

### 6. Interactive Spotlight Guided Tour
- Clicking the **"Restart Tour"** button launches a step-by-step interactive onboarding sequence.
- The interface darkens using a custom full-screen SVG cutout mask, spotlighting the exact component being described (e.g. individual tabs, weight panels, charts).
- Connecting directional arrows link the floating cards to the highlighted targets, and the view mode auto-switches to ensure target elements are always visible.

---

## 🛠️ Architecture & Tech Stack

This project is structured as a modern, single-page application built on a lightweight static stack:

- **Framework**: Vite + React 18
- **Language**: TypeScript (strict type interfaces defined for metric keys, pricing, and opportunity models)
- **Styling**: Tailwind CSS v3 (custom Slate/Teal color scheme applied for high readability)
- **Icons**: Lucide React

---

## 🚀 Running the Project Locally

### 1. Install Dependencies
Make sure you have Node.js installed (v18+ recommended). Run the following command at the root of the project directory:
```bash
npm install
```

### 2. Launch the Development Server
Start the local hot-reloading Vite dev server:
```bash
npm run dev
```
Navigate to **[http://localhost:5173](http://localhost:5173)** in your browser to view and interact with the platform.

### 3. Build for Production
To bundle the application for production hosting:
```bash
npm run build
```
This generates optimized, minified HTML, CSS, and JS assets inside the `dist/` directory, which can be deployed to any static host (such as GitHub Pages, Netlify, Vercel, or AWS S3).
