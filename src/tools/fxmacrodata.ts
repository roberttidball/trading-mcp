import { z } from 'zod';

const FXMacroDataCalendarSchema = z.object({
  currency: z.string().default('usd'),
  limit: z.number().default(25),
  min_tier: z.number().optional().default(1),
});

const FXMACRODATA_BASE_URL = 'https://api.fxmacrodata.com/v1';

export async function getFXMacroDataReleaseCalendar(args: unknown) {
  try {
    const { currency, limit, min_tier } = FXMacroDataCalendarSchema.parse(args ?? {});
    const limitCount = Math.max(1, Math.min(limit, 100));
    const params = new URLSearchParams({
      limit: String(limitCount),
    });

    const headers: Record<string, string> = { 'user-agent': 'trading-mcp-fxmacrodata/1.0' };
    const apiKey = process.env.FXMACRODATA_API_KEY?.trim();
    if (apiKey) {
      if (/[\s\u0000-\u001f\u007f]/.test(apiKey)) {
        throw new Error('FXMACRODATA_API_KEY contains whitespace or control characters');
      }
      headers['X-API-Key'] = apiKey;
    }

    const url = `${FXMACRODATA_BASE_URL}/calendar/${currency.toLowerCase()}?${params.toString()}`;
    // Do not follow redirects: fetch would carry the X-API-Key header to the new location.
    const response = await fetch(url, { headers, redirect: 'manual' });

    if (response.status >= 300 && response.status < 400) {
      throw new Error(`FXMacroData returned an unexpected redirect (${response.status})`);
    }
    if (!response.ok) {
      throw new Error(`FXMacroData returned ${response.status} ${response.statusText}`);
    }

    const payload = await response.json() as {
      currency?: string;
      timezone?: string;
      data_quality?: unknown;
      data?: Array<Record<string, unknown>>;
      detail?: unknown;
    } | null;

    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.data)) {
      const detail = payload && typeof payload === 'object' && typeof payload.detail === 'string' ? `: ${payload.detail}` : '';
      throw new Error(`unexpected FXMacroData response${detail}`);
    }

    const events = payload.data.filter((event) => event && typeof event === 'object').filter((event) => {
      if (min_tier === undefined || min_tier === null) return true;
      const tier = Number(event.market_tier ?? 99);
      return tier <= min_tier;
    }).slice(0, limitCount);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            currency: payload.currency ?? currency.toUpperCase(),
            timezone: payload.timezone,
            data_quality: payload.data_quality,
            event_count: events.length,
            events,
            summary: `Retrieved ${events.length} FXMacroData release-calendar events for ${currency.toUpperCase()}`,
          }, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error fetching FXMacroData release calendar: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
      isError: true,
    };
  }
}
