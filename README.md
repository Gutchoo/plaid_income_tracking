# Plaid Income Tracking

A simple app for tracking income from different payment methods in your bank statements. Built to help identify and categorize payments from Zelle, Venmo, ACH deposits, and other sources.

## How It Works

Upload a CSV export from your bank, and the app helps you track and categorize incoming payments. You can assign transactions to tenants/payers and keep tabs on who's paid what.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the app.

## Current State

This is a local-first app - data is stored in JSON files and hardcoded locally (yes, really). It works great for personal use but isn't production-ready.

**What's included:**
- CSV upload and parsing for bank statements
- Transaction categorization and assignment
- Basic Plaid integration scaffolding

## Future Improvements

A few ideas if you want to take this further:

- **Database** - Swap out the JSON files for a real database
- **Plaid Production** - Apply for production credentials to pull transactions directly from your bank
- **Auto-tagging** - ML models to automatically categorize and assign transactions based on patterns

## Plaid Setup (Optional)

If you want to use Plaid's bank connection features:

1. Sign up at [plaid.com](https://plaid.com)
2. Create a `.env.local` file with your credentials:
   ```
   PLAID_CLIENT_ID=your_client_id
   PLAID_SECRET=your_secret
   PLAID_ENV=sandbox
   ```
3. Note: Sandbox only provides test data. Production access requires Plaid approval.
