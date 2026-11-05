import { Inject, Injectable } from '@nestjs/common';
import type { AiDraft, AiSlotsSuggestion, AiStreamEvent } from '@mawid/shared';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { AvailabilityService } from '../bookings/availability.service';
import { ENV, Env } from '../config/env.module';
import { PrismaService } from '../prisma/prisma.service';
import { DRAFT_TTL_MS, signDraft } from './ai-draft';
import type { ToolDefinition } from './llm.client';

// The model's tool arguments are untrusted input: each one is validated here, and the business always
// comes from the server (never from the model).
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const empty = <T extends z.ZodTypeAny>(s: T) =>
  z.preprocess((v) => (v === '' || v === 'null' ? undefined : v), s.nullish());

const listServicesArgs = z.object({}).passthrough();
const findSlotsArgs = z.object({
  service_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time_from: empty(hhmm),
  time_to: empty(hhmm),
  staff_id: empty(z.string().uuid()),
});
const prepareArgs = z.object({
  service_id: z.string().uuid(),
  staff_id: empty(z.string().uuid()),
  start: z.string().min(16).max(40),
});

export const AI_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_services',
      description: 'List the services of this business with id, duration (minutes) and price.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_slots',
      description:
        'Find free appointment slots for one service on one day. Times are in the business time zone.',
      parameters: {
        type: 'object',
        properties: {
          service_id: { type: 'string', description: 'Service id (uuid) from list_services' },
          date: { type: 'string', description: 'Day, format YYYY-MM-DD' },
          time_from: { type: 'string', description: 'Earliest start, HH:mm (optional)' },
          time_to: { type: 'string', description: 'Latest start, HH:mm (optional)' },
          staff_id: { type: 'string', description: 'Employee id (optional, omit for anyone)' },
        },
        required: ['service_id', 'date'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_booking',
      description:
        'Prepare a DRAFT booking for a free slot. It does NOT book anything: the customer must press Confirm.',
      parameters: {
        type: 'object',
        properties: {
          service_id: { type: 'string', description: 'Service id (uuid)' },
          staff_id: { type: 'string', description: 'Employee id (optional, omit for anyone)' },
          start: {
            type: 'string',
            description: 'Start of the slot: ISO date-time, or YYYY-MM-DDTHH:mm in business time',
          },
        },
        required: ['service_id', 'start'],
        additionalProperties: false,
      },
    },
  },
];

export interface ToolOutcome {
  /** JSON given back to the model. */
  result: unknown;
  /** Events for the customer's screen (slot cards, draft). */
  events: AiStreamEvent[];
}

const fail = (error: string): ToolOutcome => ({ result: { error }, events: [] });
const MAX_SLOTS_FOR_MODEL = 12;
const CARDS = 3;

/** The three tools the assistant may call. They use the real booking engine of phase 3. */
@Injectable()
export class AiToolbox {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async run(businessId: string, name: string, rawArgs: string): Promise<ToolOutcome> {
    let args: unknown;
    try {
      args = rawArgs.trim() ? JSON.parse(rawArgs) : {};
    } catch {
      return fail('invalid_arguments: not valid JSON');
    }
    try {
      switch (name) {
        case 'list_services':
          listServicesArgs.parse(args);
          return await this.listServices(businessId);
        case 'find_slots': {
          const a = findSlotsArgs.safeParse(args);
          if (!a.success) return fail(`invalid_arguments: ${a.error.issues[0]?.path.join('.')}`);
          return await this.findSlots(businessId, a.data);
        }
        case 'prepare_booking': {
          const a = prepareArgs.safeParse(args);
          if (!a.success) return fail(`invalid_arguments: ${a.error.issues[0]?.path.join('.')}`);
          return await this.prepareBooking(businessId, a.data);
        }
        default:
          return fail('unknown_tool');
      }
    } catch (e) {
      // Not found, no slot, bad date...: the model gets a short reason, never an internal error.
      return fail(reason(e));
    }
  }

  private async listServices(businessId: string): Promise<ToolOutcome> {
    const rows = await this.prisma.forTenant(businessId).service.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
    return {
      result: rows.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        duration_min: s.durationMin,
        price: Number(s.price),
      })),
      events: [],
    };
  }

  private async findSlots(
    businessId: string,
    a: z.infer<typeof findSlotsArgs>,
  ): Promise<ToolOutcome> {
    const av = await this.availability.load(businessId, {
      serviceId: a.service_id,
      staffId: a.staff_id ?? null,
      date: a.date,
    });
    const tz = av.business.timezone;
    const local = (d: Date) => DateTime.fromJSDate(d, { zone: tz }).toFormat('HH:mm');
    const names = new Map(av.staff.map((s) => [s.id, s.displayName]));
    const inRange = av.slots.filter((s) => {
      const t = local(s.start);
      return (!a.time_from || t >= a.time_from) && (!a.time_to || t <= a.time_to);
    });
    const slots = inRange.slice(0, MAX_SLOTS_FOR_MODEL).map((s) => ({
      start: s.start.toISOString(),
      local_time: local(s.start),
      employees: s.staffIds.map((id) => names.get(id) ?? '').filter(Boolean),
    }));
    // Three cards spread over the range (first, middle, last) give the customer real choice.
    const pick =
      inRange.length <= CARDS
        ? inRange
        : [inRange[0], inRange[Math.floor((inRange.length - 1) / 2)], inRange[inRange.length - 1]];
    const events: AiStreamEvent[] = pick.length
      ? [
          {
            type: 'slots',
            data: {
              serviceId: av.service.id,
              staffId: a.staff_id ?? null,
              serviceName: av.service.name,
              timezone: tz,
              slots: pick.map((s) => ({
                start: s.start.toISOString(),
                end: s.end.toISOString(),
                staffName: s.staffIds.length === 1 ? (names.get(s.staffIds[0]) ?? null) : null,
              })),
            } satisfies AiSlotsSuggestion,
          },
        ]
      : [];
    return {
      result: {
        date: a.date,
        timezone: tz,
        service: av.service.name,
        slots,
        note: slots.length ? 'Cards with these times are shown to the customer.' : 'No free slot.',
      },
      events,
    };
  }

  private async prepareBooking(
    businessId: string,
    a: z.infer<typeof prepareArgs>,
  ): Promise<ToolOutcome> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    if (!business) return fail('business_not_found');
    const when = DateTime.fromISO(a.start, { zone: business.timezone });
    if (!when.isValid) return fail('invalid_arguments: start');
    const draft = await this.makeDraft(businessId, {
      serviceId: a.service_id,
      staffId: a.staff_id ?? null,
      startsAt: when.toUTC().toJSDate(),
    });
    return {
      result: {
        status: 'draft_ready',
        booked: false,
        note: 'This is only a draft. Tell the customer to press Confirm and give their name and phone.',
        service: draft.service.name,
        start: draft.startsAt,
        timezone: draft.timezone,
      },
      events: [{ type: 'draft', data: draft }],
    };
  }

  /**
   * Checks again, on the server, that the slot is really free (hours, breaks, days off, notice, other
   * bookings), then signs a draft. Used by the prepare_booking tool and by the slot cards.
   */
  async makeDraft(
    businessId: string,
    p: { serviceId: string; staffId: string | null; startsAt: Date },
  ): Promise<AiDraft> {
    const probe = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    const date = DateTime.fromJSDate(p.startsAt, { zone: probe?.timezone ?? 'UTC' }).toISODate();
    if (!date) throw new Error('invalid_date');
    const av = await this.availability.load(businessId, {
      serviceId: p.serviceId,
      staffId: p.staffId,
      date,
    });
    const slot = av.slots.find((s) => s.start.getTime() === p.startsAt.getTime());
    if (!slot) throw new Error('slot_not_free');
    const expiresAt = Date.now() + DRAFT_TTL_MS;
    const staffName = p.staffId
      ? (av.staff.find((s) => s.id === p.staffId)?.displayName ?? null)
      : null;
    return {
      draftToken: signDraft(
        {
          businessId,
          serviceId: av.service.id,
          staffId: p.staffId,
          startsAt: slot.start.toISOString(),
          expiresAt,
        },
        this.env.JWT_SECRET,
      ),
      expiresAt: new Date(expiresAt).toISOString(),
      service: {
        id: av.service.id,
        name: av.service.name,
        durationMin: av.service.durationMin,
        price: Number(av.service.price),
      },
      staff: { id: p.staffId, displayName: staffName },
      startsAt: slot.start.toISOString(),
      endsAt: slot.end.toISOString(),
      timezone: av.business.timezone,
    };
  }
}

function reason(e: unknown): string {
  if (e instanceof Error) {
    const body = (e as { getResponse?: () => unknown }).getResponse?.();
    const code = (body as { code?: string } | undefined)?.code;
    if (code) return code.toLowerCase();
    if (e.message === 'slot_not_free' || e.message === 'invalid_date') return e.message;
  }
  return 'tool_failed';
}
