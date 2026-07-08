import { z } from 'zod';

const FXMacroDataCalendarSchema = z.object({
  currency: z.string().default('usd'),
  limit: z.number().default(25),
  min_tier: z.number().optional().default(1),
});

const FXMACRODATA_BASE_URL = 'https://fxmacrodata.com/api/v1';

export async function getFXMacroDataReleaseCalendar(args: unknown) {
  try {
    const { currency, limit, min_tier } = FXMacroDataCalendarSchema.parse(args ?? {});
    const limitCount = Math.max(1, Math.min(limit, 100));
    const params = new URLSearchParams({
      limit: String(limitCount),
    });

    if (process.env.FXMACRODATA_API_KEY) {
      params.set('api_key', process.env.FXMACRODATA_API_KEY);
    }

    const url = `${FXMACRODATA_BASE_URL}/calendar/${currency.toLowerCase()}?${params.toString()}`;
    const response = await fetch(url, {
      headers: { 'user-agent': 'trading-mcp-fxmacrodata/1.0' },
    });

    if (!response.ok) {
      throw new Error(`FXMacroData returned ${response.status} ${response.statusText}`);
    }

    const payload = await response.json() as {
      currency?: string;
      timezone?: string;
      data_quality?: unknown;
      data?: Array<Record<string, unknown>>;
    };

    const events = (payload.data ?? []).filter((event) => {
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
