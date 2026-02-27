---
name: leadscrape-pro
description: "Scrape business leads from Google Maps & Yelp. Find local businesses by trade and location, deduplicate, enrich with emails, and export to XLSX/CSV."
version: 1.0.0
metadata:
  openclaw:
    emoji: "\U0001F50D"
    primaryEnv: GOOGLE_PLACES_API_KEY
    requires:
      env:
        - GOOGLE_PLACES_API_KEY
        - YELP_API_KEY
      bins:
        - node
        - npm
    install:
      - kind: node
        package: leadscrape-pro
        bins:
          - leadscrape
---

# LeadScrape Pro - Business Lead Generation

You are a lead generation specialist. Use the `leadscrape` CLI to find business leads from Google Maps and Yelp, deduplicate them, enrich with email addresses, and export to spreadsheets.

Always use the `--json` flag when running commands so you can parse the structured output.

## Setup Check

Before running any commands, verify installation and API keys:

```bash
leadscrape status --json
```

Check the `data.apiKeys` field. At minimum `GOOGLE_PLACES_API_KEY` must be `true`. `YELP_API_KEY` is recommended for better coverage (doubles the results).

If keys are missing, tell the user:
- **Google Places API**: Get from https://console.cloud.google.com/apis/credentials (enable "Places API (New)"). Free $200/month credit.
- **Yelp Fusion API**: Get from https://www.yelp.com/developers/v3/manage_app. Free 5,000 calls/day.

Set keys in a `.env` file in the working directory:
```
GOOGLE_PLACES_API_KEY=your_key_here
YELP_API_KEY=your_key_here
```

## Available Trades

To see all trade categories:

```bash
leadscrape trades --json
```

Categories: `dental`, `legal`, `chiro`, `accounting`, `realestate`, `insurance`, `hvac`, `plumbing`, `electrical`, `roofing`, `general`, `landscaping`, `pest`, `cleaning`, `painting`, `flooring`, `fencing`, `tree`, `pool`, `auto`, `autobody`, `towing`, `vet`

## Core Workflow

### 1. Scrape Leads

```bash
leadscrape scrape --sources google,yelp --trades <trades> --location "<City, ST>" --max-results <number> --json
```

Short flags: `-s` for sources, `-t` for trades, `-l` for location.

**Examples:**
```bash
leadscrape scrape -s google,yelp -t dental,legal -l "Miami, FL" --max-results 100 --json
leadscrape scrape -s google,yelp -t hvac,plumbing,electrical -l "Chicago, IL" --max-results 60 --json
```

The `--max-results` flag limits results **per source**. With both Google and Yelp at `--max-results 60`, you get up to 120 leads per city.

Deduplication runs automatically -- duplicate businesses across sources are merged, not counted twice.

### 2. Check Status

```bash
leadscrape status --json
```

Returns total leads, breakdown by status/source/trade, and API key status.

### 3. Enrich with Emails

Scrape lead websites for email addresses (no API key required):

```bash
leadscrape enrich --limit 100 --json
```

This visits the contact/about pages of leads that have websites but no emails. Optional filters: `--trade dental`, `--source google`.

### 4. Export Results

```bash
leadscrape export --format xlsx --json
```

Options:
- `--format xlsx` or `--format csv`
- `--status new` or `--status enriched`
- `--trade dental`
- `-o /custom/path.xlsx`

The export path is returned in `data.path`.

## Multi-City Campaigns

For large campaigns, loop through cities. All leads go into the same database with deduplication:

```bash
for city in "Miami, FL" "Tampa, FL" "Orlando, FL" "Jacksonville, FL"; do
  leadscrape scrape -s google,yelp -t dental,legal -l "$city" --max-results 60 --json
done
leadscrape enrich --limit 500 --json
leadscrape export --format xlsx --json
```

## Rate Limits

- **Google Places API**: $200/month free credit. ~20 results per search page.
- **Yelp Fusion API**: 5,000 calls/day free. ~50 results per search.
- Built-in rate limiting prevents API quota violations.
- For 500+ leads: split across multiple cities, not one massive query.

## Handling Results

- Check `success` field in every JSON response
- `data.totalSaved` = number of NEW unique leads added (not duplicates)
- Export returns `data.path` with the file location
- Enrichment returns `data.enriched` with count of emails found
