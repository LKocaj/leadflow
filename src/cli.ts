#!/usr/bin/env node
/**
 * LeadScrape Pro CLI
 */

import { Command } from 'commander';
import { config, hasApiKey } from './config/index.js';
import { initDatabase, closeDatabase } from './storage/sqlite.client.js';
import {
  findLeads,
  countLeadsByStatus,
  countLeadsBySource,
  countLeadsByTrade,
  getTotalLeadCount,
} from './storage/lead.repository.js';
import { runScrape, getScrapableSources } from './orchestrator/scrape.orchestrator.js';
import { exportToXlsx, exportToCsv } from './export/xlsx.exporter.js';
import { enrichAllLeads } from './enrichment/enrichment.service.js';
import { persistChanges } from './storage/index.js';
import { Trade, LeadSource, LeadStatus } from './types/index.js';

const program = new Command();

program
  .name('leadscrape')
  .description('Business lead scraper - Google Maps & Yelp with deduplication, enrichment, and export')
  .version('1.0.0')
  .option('--json', 'Output results as JSON (for agent/automation use)', false);

/** Trade key -> enum mapping */
const tradeMap: Record<string, Trade> = {
  hvac: Trade.HVAC,
  plumbing: Trade.PLUMBING,
  electrical: Trade.ELECTRICAL,
  roofing: Trade.ROOFING,
  general: Trade.GENERAL,
  landscaping: Trade.LANDSCAPING,
  pest: Trade.PEST_CONTROL,
  cleaning: Trade.CLEANING,
  painting: Trade.PAINTING,
  flooring: Trade.FLOORING,
  fencing: Trade.FENCING,
  tree: Trade.TREE_SERVICE,
  pool: Trade.POOL,
  auto: Trade.AUTO_REPAIR,
  autobody: Trade.AUTO_BODY,
  towing: Trade.TOWING,
  dental: Trade.DENTAL,
  chiro: Trade.CHIROPRACTIC,
  vet: Trade.VETERINARY,
  legal: Trade.LEGAL,
  accounting: Trade.ACCOUNTING,
  realestate: Trade.REAL_ESTATE,
  insurance: Trade.INSURANCE,
};

/** Source key -> enum mapping */
const sourceMap: Record<string, LeadSource> = {
  google: LeadSource.GOOGLE_MAPS,
  yelp: LeadSource.YELP,
  linkedin: LeadSource.LINKEDIN,
  homeadvisor: LeadSource.HOMEADVISOR,
  angi: LeadSource.ANGI,
  thumbtack: LeadSource.THUMBTACK,
  bbb: LeadSource.BBB,
};

/** Status key -> enum mapping */
const statusMap: Record<string, LeadStatus> = {
  new: LeadStatus.NEW,
  enriched: LeadStatus.ENRICHED,
  verified: LeadStatus.VERIFIED,
  exported: LeadStatus.EXPORTED,
};

function isJsonMode(): boolean {
  return program.opts().json === true;
}

function outputJson(data: Record<string, unknown>): void {
  console.log(JSON.stringify(data, null, 2));
}

function log(message: string): void {
  if (!isJsonMode()) {
    console.log(message);
  }
}

/**
 * Scrape command
 */
program
  .command('scrape')
  .description('Scrape business leads from Google Maps and Yelp')
  .option(
    '-s, --sources <sources>',
    'Comma-separated sources (google,yelp)',
    'google,yelp'
  )
  .option(
    '-t, --trades <trades>',
    'Comma-separated trades (dental,legal,hvac,...) or "all"',
    'all'
  )
  .option(
    '-l, --location <location>',
    'Target location (City, ST)',
    'Westchester County, NY'
  )
  .option('--max-results <number>', 'Max results per source', '100')
  .option('--skip-deduplication', 'Skip deduplication step', false)
  .option('--dry-run', 'Preview what would be scraped without executing', false)
  .action(async (options) => {
    await initDatabase();

    // Parse sources
    let sources: LeadSource[];
    if (options.sources === 'all') {
      sources = getScrapableSources();
    } else {
      sources = options.sources
        .split(',')
        .map((s: string) => sourceMap[s.trim().toLowerCase()])
        .filter(Boolean);
    }

    // Parse trades
    const trades =
      options.trades === 'all'
        ? Object.values(tradeMap)
        : options.trades
            .split(',')
            .map((t: string) => tradeMap[t.trim().toLowerCase()])
            .filter(Boolean);

    // Parse location
    const locationParts = options.location.split(',').map((p: string) => p.trim());
    const location: { city?: string; county?: string; state?: string } = {};

    if (locationParts.length >= 2) {
      const lastPart = locationParts[locationParts.length - 1];
      if (lastPart && lastPart.length === 2) {
        location.state = lastPart;
      }
      const firstPart = locationParts[0];
      if (firstPart) {
        if (firstPart.toLowerCase().includes('county')) {
          location.county = firstPart;
        } else {
          location.city = firstPart;
        }
      }
    } else if (locationParts[0]) {
      location.city = locationParts[0];
    }

    if (options.dryRun) {
      const dryRunData = {
        location: options.location,
        trades: trades.map(String),
        sources: sources.map(String),
        maxResultsPerSource: parseInt(options.maxResults, 10),
      };

      if (isJsonMode()) {
        outputJson({ success: true, command: 'scrape', dryRun: true, data: dryRunData });
      } else {
        log('\n DRY RUN - No scraping will occur\n');
        log(`   Location: ${options.location}`);
        log(`   Trades: ${trades.join(', ')}`);
        log(`   Sources: ${sources.join(', ')}`);
        log(`   Max results per source: ${options.maxResults}`);
      }
      await closeDatabase();
      return;
    }

    log('\n LeadScrape Configuration:');
    log(`   Location: ${options.location}`);
    log(`   Trades: ${trades.join(', ')}`);
    log(`   Sources: ${sources.join(', ')}`);
    log(`   Max results per source: ${options.maxResults}`);

    log('\n API Key Status:');
    log(`   Google Places: ${hasApiKey('GOOGLE_PLACES_API_KEY') ? 'OK' : 'NOT SET'}`);
    log(`   Yelp Fusion: ${hasApiKey('YELP_API_KEY') ? 'OK' : 'NOT SET'}`);

    log('\n Starting scrape...\n');

    try {
      const result = await runScrape({
        sources,
        trades,
        location,
        maxResultsPerSource: parseInt(options.maxResults, 10),
        skipDeduplication: options.skipDeduplication,
        onProgress: (progress) => {
          if (isJsonMode()) return;
          if (progress.status === 'starting') {
            log(`  Starting ${progress.source}...`);
          } else if (progress.status === 'scraping') {
            process.stdout.write(
              `\r   Found: ${progress.found} | Saved: ${progress.saved} | Duplicates: ${progress.duplicates}`
            );
          } else if (progress.status === 'complete') {
            log(
              `\n  ${progress.source}: ${progress.found} found, ${progress.saved} saved, ${progress.duplicates} duplicates`
            );
          } else if (progress.status === 'error') {
            log(`\n  ERROR ${progress.source}: ${progress.error}`);
          }
        },
      });

      if (isJsonMode()) {
        outputJson({
          success: true,
          command: 'scrape',
          data: {
            totalFound: result.totalFound,
            totalSaved: result.totalSaved,
            totalDuplicates: result.totalDuplicates,
            bySource: result.bySource,
            errors: result.errors,
          },
        });
      } else {
        log('\n Scrape Summary:');
        log(`   Total found: ${result.totalFound}`);
        log(`   Total saved: ${result.totalSaved}`);
        log(`   Total duplicates: ${result.totalDuplicates}`);

        if (result.errors.length > 0) {
          log('\n  Errors:');
          for (const error of result.errors) {
            log(`   ${error.source}: ${error.error}`);
          }
        }
      }
    } catch (error) {
      if (isJsonMode()) {
        outputJson({
          success: false,
          command: 'scrape',
          error: error instanceof Error ? error.message : String(error),
        });
      } else {
        console.error(`\n Scrape failed: ${error}`);
      }
    }

    await closeDatabase();
  });

/**
 * Enrich command - scrape websites for email addresses
 */
program
  .command('enrich')
  .description('Enrich leads with email addresses by scraping their websites')
  .option('--limit <number>', 'Max leads to enrich', '100')
  .option('--trade <trade>', 'Filter by trade')
  .option('--source <source>', 'Filter by source')
  .action(async (options) => {
    await initDatabase();

    const limit = parseInt(options.limit, 10);

    log(`\n Enriching up to ${limit} leads...\n`);

    try {
      const result = await enrichAllLeads(
        {
          trade: options.trade ? String(tradeMap[options.trade.toLowerCase()]) : undefined,
          source: options.source ? String(sourceMap[options.source.toLowerCase()]) : undefined,
          limit,
        },
        (completed, total) => {
          if (!isJsonMode()) {
            process.stdout.write(`\r   Progress: ${completed}/${total}`);
          }
        }
      );

      await persistChanges();

      if (isJsonMode()) {
        outputJson({
          success: true,
          command: 'enrich',
          data: {
            total: result.stats.total,
            enriched: result.stats.enriched,
            failed: result.stats.failed,
            skipped: result.stats.skipped,
            alreadyHadEmail: result.stats.alreadyHadEmail,
            noWebsite: result.stats.noWebsite,
          },
        });
      } else {
        log(`\n\n Enrichment Complete:`);
        log(`   Total processed: ${result.stats.total}`);
        log(`   Emails found: ${result.stats.enriched}`);
        log(`   Failed: ${result.stats.failed}`);
        log(`   Skipped (no website): ${result.stats.noWebsite}`);
        log(`   Already had email: ${result.stats.alreadyHadEmail}`);
      }
    } catch (error) {
      if (isJsonMode()) {
        outputJson({
          success: false,
          command: 'enrich',
          error: error instanceof Error ? error.message : String(error),
        });
      } else {
        console.error(`\n Enrichment failed: ${error}`);
      }
    }

    await closeDatabase();
  });

/**
 * Export command
 */
program
  .command('export')
  .description('Export leads to XLSX or CSV')
  .option('-o, --output <path>', 'Output file path')
  .option('--status <status>', 'Filter by status (new,enriched,verified,all)', 'all')
  .option('--trade <trade>', 'Filter by trade')
  .option('--format <format>', 'Export format (xlsx,csv)', 'xlsx')
  .action(async (options) => {
    await initDatabase();

    const filters: Parameters<typeof findLeads>[0] = {};

    if (options.status !== 'all') {
      filters.status = statusMap[options.status.toLowerCase()];
    }

    if (options.trade) {
      filters.trade = tradeMap[options.trade.toLowerCase()];
    }

    log('\n Exporting leads...');

    try {
      let result: { path: string; count: number };

      if (options.format === 'csv') {
        result = await exportToCsv(options.output, filters);
      } else {
        result = await exportToXlsx(options.output, filters);
      }

      if (isJsonMode()) {
        outputJson({
          success: true,
          command: 'export',
          data: {
            format: options.format,
            path: result.path,
            count: result.count,
          },
        });
      } else {
        if (result.count === 0) {
          log('   No leads to export');
        } else {
          log(`   Exported ${result.count} leads to ${result.path}`);
        }
      }
    } catch (error) {
      if (isJsonMode()) {
        outputJson({
          success: false,
          command: 'export',
          error: error instanceof Error ? error.message : String(error),
        });
      } else {
        console.error(`   Export failed: ${error}`);
      }
    }

    await closeDatabase();
  });

/**
 * Status command
 */
program
  .command('status')
  .description('Show database statistics and API key status')
  .action(async () => {
    await initDatabase();

    const total = getTotalLeadCount();
    const byStatus = countLeadsByStatus();
    const bySource = countLeadsBySource();
    const byTrade = countLeadsByTrade();
    const scrapers = getScrapableSources();

    const apiKeys: Record<string, boolean> = {
      GOOGLE_PLACES_API_KEY: hasApiKey('GOOGLE_PLACES_API_KEY'),
      YELP_API_KEY: hasApiKey('YELP_API_KEY'),
      HUNTER_API_KEY: hasApiKey('HUNTER_API_KEY'),
      PROXYCURL_API_KEY: hasApiKey('PROXYCURL_API_KEY'),
    };

    if (isJsonMode()) {
      outputJson({
        success: true,
        command: 'status',
        data: {
          totalLeads: total,
          byStatus,
          bySource,
          byTrade,
          availableScrapers: scrapers.map(String),
          apiKeys,
          databasePath: config.DATABASE_PATH,
          exportPath: config.EXPORT_PATH,
        },
      });
    } else {
      log('\n LeadScrape Pro Statistics\n');
      log(`Total leads: ${total}\n`);

      if (Object.keys(byStatus).length > 0) {
        log('By Status:');
        for (const [status, count] of Object.entries(byStatus)) {
          log(`   ${status}: ${count}`);
        }
      }

      if (Object.keys(bySource).length > 0) {
        log('\nBy Source:');
        for (const [source, count] of Object.entries(bySource)) {
          log(`   ${source}: ${count}`);
        }
      }

      if (Object.keys(byTrade).length > 0) {
        log('\nBy Trade:');
        for (const [trade, count] of Object.entries(byTrade)) {
          log(`   ${trade}: ${count}`);
        }
      }

      log('\n API Keys:');
      for (const [key, configured] of Object.entries(apiKeys)) {
        log(`   ${key}: ${configured ? 'OK' : 'NOT SET'}`);
      }

      log(`\n Available Scrapers: ${scrapers.join(', ')}`);
      log(`\n Database: ${config.DATABASE_PATH}`);
      log(` Exports: ${config.EXPORT_PATH}`);
    }

    await closeDatabase();
  });

/**
 * Trades command - list all available trade categories
 */
program
  .command('trades')
  .description('List all available trade categories')
  .action(() => {
    const trades = Object.entries(tradeMap).map(([key, value]) => ({
      key,
      name: String(value),
    }));

    if (isJsonMode()) {
      outputJson({
        success: true,
        command: 'trades',
        data: { trades },
      });
    } else {
      log('\n Available Trades:\n');
      log('   Home Services:');
      log('     hvac, plumbing, electrical, roofing, general, landscaping,');
      log('     pest, cleaning, painting, flooring, fencing, tree, pool');
      log('\n   Auto:');
      log('     auto, autobody, towing');
      log('\n   Healthcare:');
      log('     dental, chiro, vet');
      log('\n   Professional:');
      log('     legal, accounting, realestate, insurance');
    }
  });

// Handle errors
program.exitOverride();

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof Error) {
    const errorCode = (error as { code?: string }).code;
    const isHelpOrVersionExit =
      errorCode === 'commander.help' ||
      errorCode === 'commander.helpDisplayed' ||
      errorCode === 'commander.version';
    if (!isHelpOrVersionExit) {
      if (isJsonMode()) {
        outputJson({ success: false, error: error.message });
      } else {
        console.error(error.message);
      }
      process.exit(1);
    }
  }
}
