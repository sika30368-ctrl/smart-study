import * as cheerio from 'cheerio';
import { generateContentWithResilience } from './aiService.ts';
import { MOE_PORTALS } from '../src/db/seed-data.ts';

export interface DiscoveredMoeResource {
  title: string;
  url: string;
  type: 'pdf' | 'assessment' | 'curriculum_portal' | 'page';
  gradeHint?: string;
  discoveredVia: 'direct_http' | 'gemini_search_grounding' | 'verified_directory';
}

export function isVerifiedMoeUrl(urlStr: string): { verified: boolean; domain: string } {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    const verified = host === 'moe.gov.eg' || host.endsWith('.moe.gov.eg');
    return { verified, domain: host };
  } catch {
    return { verified: false, domain: 'invalid-url' };
  }
}

async function checkRobotsTxt(baseOrigin: string): Promise<{ allowed: boolean; note: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${baseOrigin}/robots.txt`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'SmartStudy-EduMonitor/1.0 (Educational Compliance Checker)' },
    });
    clearTimeout(timeout);
    if (!res.ok) {
      return { allowed: true, note: `robots.txt returned HTTP ${res.status}; proceeding politely.` };
    }
    const text = await res.text();
    const disallowAll = /User-agent:\s*\*[\s\S]*?Disallow:\s*\/\s*($|\n)/i.test(text);
    if (disallowAll) {
      return { allowed: false, note: 'robots.txt specifies Disallow: / for wildcard agents.' };
    }
    return { allowed: true, note: 'robots.txt permits public portal inspection.' };
  } catch {
    return { allowed: true, note: 'robots.txt unreachable or timed out.' };
  }
}

export async function runMoePortalDiscovery(targetUrl: string = MOE_PORTALS.assessments): Promise<{
  status: 'success' | 'blocked_robots' | 'unreachable' | 'changes_detected';
  discovered: DiscoveredMoeResource[];
  notes: string;
}> {
  const { verified } = isVerifiedMoeUrl(targetUrl);
  if (!verified) {
    throw new Error('Only official *.moe.gov.eg URLs are allowed for Ministry monitoring.');
  }

  const origin = new URL(targetUrl).origin;
  const robots = await checkRobotsTxt(origin);
  if (!robots.allowed) {
    return {
      status: 'blocked_robots',
      discovered: [],
      notes: `Skipped direct crawl to respect ${origin}/robots.txt (${robots.note}). Use admin upload for official PDFs.`,
    };
  }

  const discovered: DiscoveredMoeResource[] = [];
  let directNote = '';

  // 1. Polite direct HTTP inspection of publicly accessible Ministry HTML page
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SmartStudy-EduMonitor/1.0 (Public Egyptian Curriculum Discovery)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);
      const seen = new Set<string>();

      $('a[href]').each((_idx, el) => {
        const href = $(el).attr('href');
        const label = $(el).text().trim().replace(/\s+/g, ' ');
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
        try {
          const absUrl = new URL(href, targetUrl).toString();
          const check = isVerifiedMoeUrl(absUrl);
          if (!check.verified || seen.has(absUrl)) return;
          const isPdf = absUrl.toLowerCase().includes('.pdf');
          const isEduLink =
            isPdf ||
            absUrl.toLowerCase().includes('assessment') ||
            absUrl.toLowerCase().includes('book') ||
            label.includes('تقييم') ||
            label.includes('كتاب') ||
            label.includes('الإعداد') ||
            label.includes('الثانوي');

          if (isEduLink) {
            seen.add(absUrl);
            discovered.push({
              title: label || absUrl.split('/').pop() || 'Official MOE Resource',
              url: absUrl,
              type: isPdf ? 'pdf' : absUrl.includes('Assessment') ? 'assessment' : 'curriculum_portal',
              discoveredVia: 'direct_http',
            });
          }
        } catch {
          // ignore malformed relative links
        }
      });

      directNote = `Direct HTTP inspection of ${targetUrl} succeeded (${res.status}), found ${discovered.length} official links.`;
    } else {
      directNote = `Direct HTTP check returned status ${res.status} on ${targetUrl}.`;
    }
  } catch (err: any) {
    directNote = `Direct HTTP fetch to ${targetUrl} could not connect (${err?.message ?? 'network restriction'}).`;
  }

  // 2. Supplement with Gemini Google Search Grounding strictly filtered to *.moe.gov.eg
  let groundingNote = '';
  try {
    const searchRes = await generateContentWithResilience({
      contents:
        'Find the current official Egyptian Ministry of Education (site:moe.gov.eg OR site:studentbooks.moe.gov.eg) web pages for Preparatory (الإعدادية) and Secondary (الثانوية العامة) student textbooks and weekly performance assessments (الأداءات والتقييمات) for 2025-2026 and 2026-2027.',
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const groundingChunks = searchRes.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const seenUrls = new Set(discovered.map((d) => d.url));
    for (const chunk of groundingChunks) {
      const uri = chunk.web?.uri;
      const title = chunk.web?.title ?? 'Official MOE Portal Result';
      if (uri && !seenUrls.has(uri)) {
        // Keep official moe.gov.eg mentions from grounding metadata
        if (title.toLowerCase().includes('moe.gov.eg') || uri.toLowerCase().includes('moe.gov.eg')) {
          seenUrls.add(uri);
          discovered.push({
            title,
            url: isVerifiedMoeUrl(uri).verified ? uri : MOE_PORTALS.assessments,
            type: 'curriculum_portal',
            discoveredVia: 'gemini_search_grounding',
          });
        }
      }
    }
    groundingNote = `Gemini Search Grounding completed (${groundingChunks.length} citations reviewed).`;
  } catch (err: any) {
    groundingNote = `Search grounding skipped (${err?.message ?? 'unavailable'}).`;
  }

  // Always include verified core Ministry portals if none were returned from live crawl
  if (discovered.length === 0) {
    discovered.push(
      {
        title: 'المكتبة الإلكترونية للكتب الدراسية — وزارة التربية والتعليم',
        url: MOE_PORTALS.studentBooks,
        type: 'curriculum_portal',
        discoveredVia: 'verified_directory',
      },
      {
        title: 'بوابة الأداءات والتقييمات الأسبوعية والشهرية — وزارة التربية والتعليم',
        url: MOE_PORTALS.assessments,
        type: 'assessment',
        discoveredVia: 'verified_directory',
      }
    );
  }

  return {
    status: discovered.some((d) => d.discoveredVia === 'direct_http') ? 'changes_detected' : 'success',
    discovered: discovered.slice(0, 25),
    notes: `${directNote} ${groundingNote} (${robots.note})`.trim(),
  };
}
