# Weather Assistant - Vermont

A Next.js weather application with AI-powered assistant (Maple) for Vermont state government use.

## Getting Started

First, install dependencies:

```bash
npm install
```

Then, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Structure

- `app/` - Next.js app router pages and API routes
- `lib/` - Core services and utilities (AI, weather APIs, road data, etc.)
- `components/` - React components
- `scripts/` - Utility scripts for data import and processing

## Environment Variables

Create a `.env.local` file with required API keys and configuration. See your environment setup for details.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Supabase
- OpenAI (GPT-4o)
- Pinecone (Vector store)
- Tailwind CSS
