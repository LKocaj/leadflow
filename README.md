# LeadFlow

Turn any city into a qualified lead list in 60 seconds.

Scrapes Google Maps & Yelp across 50+ industries, enriches emails through a 4-provider waterfall, verifies contacts, scores lead quality 0-100, and exports straight to your CRM.

## Install

```bash
npm install -g leadflow
```

## Quick Start

```bash
# Set API keys
export GOOGLE_PLACES_API_KEY=your_key
export YELP_API_KEY=your_key

# Scrape dental and legal leads in Miami within 25 miles
leadflow scrape -t dental,legal -l "Miami, FL" --radius 25 --max-results 100

# Enrich with emails (4-provider waterfall)
leadflow enrich --limit 100

# Score leads 0-100
leadflow score

# Export to your CRM
leadflow export --format hubspot
```

## What It Does

| Step | Command | What Happens |
|------|---------|-------------|
| Find | `scrape` | Pulls businesses from Google Maps & Yelp with deduplication |
| Enrich | `enrich` | Waterfall: website scrape > Hunter.io > Apollo.io > Dropcontact |
| Verify | `verify` | Email validation (ZeroBounce) + phone lookup (Twilio) |
| Score | `score` | Composite 0-100 quality score based on 10 signals |
| Export | `export` | XLSX, CSV, HubSpot, Salesforce, Pipedrive, Airtable, Instantly |
| Push | `webhook` | POST leads as JSON to Zapier, n8n, Make, or any URL |

## 50+ Supported Industries

Dental, legal, accounting, real estate, insurance, HVAC, plumbing, electrical, roofing, restaurants, salons, fitness, IT services, marketing agencies, consulting, retail, auto repair, veterinary, photography, and many more.

```bash
leadflow trades   # see the full list
```

## API Keys

| Key | Required | Free Tier |
|-----|----------|-----------|
| `GOOGLE_PLACES_API_KEY` | Yes | $200/month free credit |
| `YELP_API_KEY` | Recommended | 5,000 calls/day |
| `HUNTER_API_KEY` | Optional | 25 searches/month |
| `APOLLO_API_KEY` | Optional | 50 credits/month |
| `DROPCONTACT_API_KEY` | Optional | Trial available |
| `ZEROBOUNCE_API_KEY` | Optional | 100 verifications free |
| `TWILIO_ACCOUNT_SID` | Optional | Pay-as-you-go ($0.005/lookup) |

## Agent / Automation

Add `--json` to any command for structured output your agent can parse:

```bash
leadflow scrape -t dental -l "Boston, MA" --max-results 50 --json
# Returns: { "success": true, "command": "scrape", "data": { ... } }
```

## Premium: Done-For-You Lead Systems

LeadFlow is built by **OnCall Automation**. Need more than a CLI tool?

- Custom lead pipelines built for your exact market
- CRM integration and automated outreach sequences
- White-label lead gen for agencies
- Managed scraping and enrichment at scale

**Book a free call:** [calendly.com/oncallautomation](https://calendly.com/oncallautomation)
**Email:** info@oncallautomation.ai
**Web:** [oncallautomation.ai](https://oncallautomation.ai)

## License

MIT
