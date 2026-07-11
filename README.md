# Signalstack

Signalstack is a revenue-first idea validation tool for solo founders.

Bring a small SaaS, service, B2B, or B2C idea into one focused workspace. Define the buyer and problem, score the opportunity against the criteria you care about, then use the built-in revenue math and seven-day plan to validate it with real people.

The product is optimized around two practical milestones:

- **₹30,000/month** — first proof that customers will pay.
- **₹1,00,000/month** — a repeatable small-business revenue target.

## What it helps you do

- Frame an idea around a narrow customer, painful workflow, and simple promise.
- Score seven core signals: pain intensity, purchase urgency, willingness to pay, reachability, MVP speed, retention, and founder edge.
- Change both scores and **weights** to match your own decision-making criteria.
- See a live opportunity score and the strongest signal or assumption to test first.
- Calculate exactly how many customers are needed to reach ₹30k or ₹1L per month at your chosen price.
- Generate and copy a concise seven-day validation plan.
- Save the current workspace locally in the browser.
- Explore three optional starting patterns from finance, operations, and construction/property—without filling the product with distracting example ideas.

## Tech stack

- React 18 + TypeScript
- Vite
- CSS with Tailwind available for utilities
- Lucide React icons

## Run locally

### Prerequisites

Install [Node.js](https://nodejs.org/) 18 or newer.

### Install dependencies

From the project directory:

```bash
npm install
```

### Start the development server

```bash
npm run dev
```

Vite will print a local URL—normally [http://localhost:5173](http://localhost:5173). Open it in your browser. Changes to the source update automatically.

> On Windows systems where PowerShell blocks `npm.ps1`, use `npm.cmd run dev` instead.

### Build for production

```bash
npm run build
```

This type-checks the app and writes the production-ready static site to `dist/`.

### Preview the production build

```bash
npm run preview
```

## Project structure

```text
src/
  App.tsx      # Product UI, scoring, revenue math, and local workspace state
  index.css    # Responsive visual system and layout
  main.tsx     # React entry point
```
