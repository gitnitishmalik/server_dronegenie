import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import { PrismaService } from "src/prisma/prisma.service";
import { MailService } from "src/mail/mail.service";
import { UserRole } from "@prisma/client";

type Msg = { role: "user" | "assistant"; content: string };

export type ChatAuth = {
    userId: string;
    roles: UserRole[];
    customerId?: string;
    vendorId?: string;
    displayName?: string;
};

const MODEL = "claude-haiku-4-5";
const INPUT_PER_MTOK = 1.0;
const OUTPUT_PER_MTOK = 5.0;
const RATE_LIMIT_PER_HOUR = 20;
const MAIL_LIMIT_PER_HOUR = 2;
const MAX_TOKENS_PER_REPLY = 400;
const MAX_TOOL_TURNS = 4;
const SITE_BASE = "https://dronegenie.aipower.guru";

const expandUnit = (u?: string | null) => {
    if (!u) return "";
    const k = u.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
    const map: Record<string, string> = {
        sqm: "square metres", sqmt: "square metres", sqmtr: "square metres",
        sqmeter: "square metres", sqmeters: "square metres",
        sqmetre: "square metres", sqmetres: "square metres",
        "m²": "square metres", m2: "square metres",
        sqft: "square feet", sqfeet: "square feet", ft2: "square feet",
        sqkm: "square kilometres", km2: "square kilometres",
        ha: "hectares", hect: "hectares", hectare: "hectares", hectares: "hectares",
        acre: "acres", acres: "acres",
        km: "kilometres", kms: "kilometres", m: "metres", ft: "feet",
    };
    return map[k] || u;
};

// ---- Tool catalog (kept declarative; included into the request based on role) ----

const TOOL_LIST_SERVICES: Anthropic.Messages.Tool = {
    name: "list_services",
    description:
        "List drone services on the DroneGenie marketplace (e.g. Agrichemical Crop Spraying, LiDAR Mapping, Tower Inspection). Available to ALL visitors. Use this when the user asks what services are offered, what they can hire a drone for, or browses the catalogue.",
    input_schema: {
        type: "object",
        properties: {
            limit: { type: "integer", minimum: 1, maximum: 12 },
            search: { type: "string", description: "Optional case-insensitive keyword filter on service name." },
        },
    },
};

const TOOL_LIST_INDUSTRIES: Anthropic.Messages.Tool = {
    name: "list_industries",
    description:
        "List industry verticals served on DroneGenie (Agriculture, Mining, Construction, Power, Telecom, Surveying, etc). Available to ALL visitors. Use when the user asks which industries the platform covers or what their domain is supported.",
    input_schema: {
        type: "object",
        properties: { limit: { type: "integer", minimum: 1, maximum: 12 } },
    },
};

const TOOL_LIST_OPEN_BIDS: Anthropic.Messages.Tool = {
    name: "list_open_bid_requests",
    description:
        "List currently OPEN (PENDING) bid requests vendors can quote on. VENDOR-ONLY tool — only available to authenticated vendors. Returns sanitized public fields (no customer PII).",
    input_schema: {
        type: "object",
        properties: {
            limit: { type: "integer", minimum: 1, maximum: 10 },
            location_contains: { type: "string", description: "Optional substring filter on the bid location." },
        },
    },
};

const TOOL_LIST_MY_BIDS: Anthropic.Messages.Tool = {
    name: "list_my_bid_requests",
    description:
        "List the bid requests posted by the SIGNED-IN customer. CUSTOMER-ONLY tool. Use when the customer asks 'show my bids', 'my open requests', etc.",
    input_schema: {
        type: "object",
        properties: { limit: { type: "integer", minimum: 1, maximum: 10 } },
    },
};

const TOOL_LIST_REPLIES: Anthropic.Messages.Tool = {
    name: "list_replies_to_my_bid",
    description:
        "List vendor replies (proposals) for a specific bid request the customer posted. CUSTOMER-ONLY. Use when the customer asks 'who replied to my request', 'what offers did I get', etc.",
    input_schema: {
        type: "object",
        properties: {
            bid_request_id: { type: "string", description: "The customer's bid request id (from list_my_bid_requests)." },
        },
        required: ["bid_request_id"],
    },
};

const TOOL_LIST_MY_REPLIES: Anthropic.Messages.Tool = {
    name: "list_my_bid_replies",
    description:
        "List the bid replies the SIGNED-IN vendor has placed (with status PENDING / AWARDED / REJECTED). VENDOR-ONLY.",
    input_schema: {
        type: "object",
        properties: { limit: { type: "integer", minimum: 1, maximum: 10 } },
    },
};

const TOOL_PREPARE_BID: Anthropic.Messages.Tool = {
    name: "prepare_bid_action",
    description:
        "Generate a deep link, drafted text, and step-by-step instructions for the user to place a bid (vendor) or accept a bid reply (customer). The actual transaction must be completed in the platform UI for security.",
    input_schema: {
        type: "object",
        properties: {
            action: { type: "string", enum: ["place", "accept"] },
            bid_request_id: { type: "string" },
            bid_reply_id: { type: "string" },
            draft_message: { type: "string" },
            proposed_amount_inr: { type: "number" },
        },
        required: ["action", "draft_message"],
    },
};

const TOOL_INQUIRY_EMAIL: Anthropic.Messages.Tool = {
    name: "send_inquiry_email",
    description:
        "Send a contact enquiry email to the DroneGenie team on behalf of the user. Use only when the user explicitly asks to be contacted. Always confirm details first. Rate limited to 2 per hour per visitor.",
    input_schema: {
        type: "object",
        properties: {
            from_name: { type: "string" },
            from_email: { type: "string" },
            from_phone: { type: "string" },
            subject: { type: "string" },
            message: { type: "string" },
            inquiry_type: {
                type: "string",
                enum: ["bid_help", "vendor_signup", "customer_signup", "service_question", "general"],
            },
        },
        required: ["from_name", "from_email", "subject", "message"],
    },
};

const PUBLIC_TOOL_NAMES = new Set([
    "list_services",
    "list_industries",
    "send_inquiry_email",
]);
const CUSTOMER_TOOL_NAMES = new Set([
    "list_my_bid_requests",
    "list_replies_to_my_bid",
    "prepare_bid_action",
]);
const VENDOR_TOOL_NAMES = new Set([
    "list_open_bid_requests",
    "list_my_bid_replies",
    "prepare_bid_action",
]);

// ---- System prompt ----

const SYSTEM_BASE = `You are DroneGenie's helper assistant — a warm, knowledgeable Indian-context guide and marketplace concierge for drones and UAVs.

You are embedded on dronegenie.aipower.guru, a drone-as-a-service marketplace connecting customers who need drone services with vetted operators (vendors) across India. The platform supports service bookings, bid requests, vendor onboarding, escrow payments, and route optimization.

Greeting: When greeting a user use "Namaste" — never "Salaam" or other greetings.

Domain expertise (background — keep answers brief):

DGCA regulations (India): Digital Sky platform, UIN, RPC for Small+ class, drone weight categories (Nano up to 250 grams, Micro up to 2 kilograms, Small up to 25 kilograms, Medium up to 150 kilograms, Large above 150 kilograms), airspace zones (Green / Yellow / Red), Drone Rules 2021 and amendments.

Indian ecosystem: PLI scheme, Namo Drone Didi, Kisan Drone, foreign-drone import ban (Feb 2022). Indian manufacturers: Garuda Aerospace, ideaForge, Asteria Aerospace, Paras Aerospace, DroneAcharya, Throttle Aerospace, Aarav Unmanned Systems, RattanIndia.

Use cases: agriculture (crop spraying, NDVI, yield, insurance), mapping/surveying (cadastral, mining, stockpile), infrastructure inspection (lines, towers, pipelines, dams), delivery (medical, BVLOS), defence/ISR, public safety, media/cinematography, environment monitoring.

Tech basics: multirotor / fixed-wing / VTOL; payloads (RGB, multispectral, thermal, LiDAR, hyperspectral, spray, cargo); photogrammetry vs LiDAR; LiPo endurance 20 to 40 minutes; comms 2.4 / 5.8 gigahertz, 4G / 5G for BVLOS.

Style:
- Replies are read aloud by a voice assistant. Be BRIEF — default to 1-2 short sentences. Go longer only when the user asks ("explain more", "in detail").
- Plain prose, no markdown (no **, _, #, backticks, bullets, dashes as list markers). When listing, join inline as "X, Y, and Z".
- Plain language; explain jargon only when needed.
- No filler ("Great question!", "Let me explain..."). Just answer.
- For off-topic questions, redirect politely back to drones / UAVs / the Indian drone market / the platform.
- Don't fabricate prices, regulations, or vendor capabilities — say "check the current DGCA circular" or "I'd verify with the vendor" when uncertain.

Spoken-output rules (replies are read aloud):
- Always SPELL OUT units in full words. Never abbreviate. So "square metres" (not sqm, sq m, sq.m., m²), "kilometres" (not km), "metres" (not m alone), "hectares", "acres", "kilograms" (not kg), "minutes", "kilometres per hour" (not km/h or kmph), "megahertz", "gigahertz".
- For currency, write "rupees" after the number — never "Rs", "INR", or the ₹ symbol.
- Spell out acronyms in their first appearance: "Beyond Visual Line of Sight" instead of BVLOS, "vertical takeoff and landing" for VTOL, "Remote Pilot Certificate" for RPC, "ground sample distance" for GSD. Common organisation names like DGCA, QCI, ISRO stay as-is.
- Dates from tool results come as ISO YYYY-MM-DD; convert to natural speech, e.g. "May 6 to 7, 2026".
- When listing bid items, area is pre-formatted with the unit already spelled out — quote it verbatim.

Safety: never help plan unlawful operations (red-zone flights without clearance, smuggling, surveillance against individuals, weaponization). Decline politely and point to DGCA rules.`;

const ROLE_GUIDE_ANON = `Audience: ANONYMOUS visitor (not signed in).
Available tools: list_services, list_industries, send_inquiry_email.
Scope:
- You CAN answer general questions on DGCA regulations, drone tech, use cases, and Indian drone market context.
- You CAN list services and industries via the tools above.
- You CAN send a contact enquiry to the DroneGenie team if the user asks to be contacted (collect name, email, subject, message first; confirm; then call send_inquiry_email).
- You CANNOT show open bid opportunities, place bids, accept bids, or reveal any customer/vendor details. If the user asks for any of those, explain politely that they need to sign in (customers see their own bids; vendors see open opportunities) and offer the relevant signup or login link: ${SITE_BASE}/login (login), ${SITE_BASE}/register (customer signup), ${SITE_BASE}/vendor-register (vendor signup).
- Greet new visitors warmly with "Namaste" and a 1-line summary of what you can help with: regulations, services, industries, or contacting the team.`;

const ROLE_GUIDE_CUSTOMER = (name?: string) => `Audience: SIGNED-IN CUSTOMER${name ? ` (${name})` : ""}.
Available tools: list_services, list_industries, send_inquiry_email, list_my_bid_requests, list_replies_to_my_bid, prepare_bid_action (action="accept" only — customers don't place bids).
Scope:
- All anonymous-tier capabilities above (regulations, services, industries, contact email).
- PLUS: read the customer's own bid requests via list_my_bid_requests; read vendor replies on a specific bid via list_replies_to_my_bid; help draft/accept a vendor's reply via prepare_bid_action(action="accept", bid_reply_id=...).
- You CANNOT see open bids posted by other customers (those are vendor-only), and you CANNOT place bids (customers post bid requests, they don't bid on them).
- Greet by name if provided. When the user asks about "my bids" use list_my_bid_requests.`;

const ROLE_GUIDE_VENDOR = (name?: string) => `Audience: SIGNED-IN VENDOR${name ? ` (${name})` : ""}.
Available tools: list_services, list_industries, send_inquiry_email, list_open_bid_requests, list_my_bid_replies, prepare_bid_action (action="place").
Scope:
- All anonymous-tier capabilities above.
- PLUS: see all OPEN bid opportunities to quote on via list_open_bid_requests; see your own previously placed replies via list_my_bid_replies; help the vendor draft and submit a bid via prepare_bid_action(action="place", bid_request_id=..., proposed_amount_inr=..., draft_message=...).
- You CANNOT see other vendors' bids or any customer's private contact info.
- Greet by name if provided. When the vendor asks about "open bids", "what's available", or "what can I quote on" use list_open_bid_requests.`;

@Injectable()
export class ChatService {
    private readonly logger = new Logger(ChatService.name);
    private readonly client: Anthropic | null;
    private readonly dailyBudgetUsd: number;

    private ipHits = new Map<string, number[]>();
    private ipMailHits = new Map<string, number[]>();
    private dailySpendCents = 0;
    private dailyResetAt = this.nextMidnight();

    constructor(
        private readonly prisma: PrismaService,
        private readonly mail: MailService,
    ) {
        const key = process.env.ANTHROPIC_API_KEY;
        this.client = key ? new Anthropic({ apiKey: key }) : null;
        this.dailyBudgetUsd = parseFloat(process.env.DAILY_CLAUDE_BUDGET_USD || "5");
        if (!this.client) {
            this.logger.warn("ANTHROPIC_API_KEY not set — chat endpoint will return 503");
        }
    }

    private nextMidnight() {
        const d = new Date();
        d.setUTCHours(24, 0, 0, 0);
        return d.getTime();
    }

    private checkRateLimit(ip: string) {
        const now = Date.now();
        const hourAgo = now - 3600_000;
        const hits = (this.ipHits.get(ip) || []).filter((t) => t > hourAgo);
        if (hits.length >= RATE_LIMIT_PER_HOUR) {
            throw new HttpException(
                "rate limit: max " + RATE_LIMIT_PER_HOUR + " messages/hour",
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
        hits.push(now);
        this.ipHits.set(ip, hits);
    }

    private checkMailLimit(ip: string): boolean {
        const now = Date.now();
        const hourAgo = now - 3600_000;
        const hits = (this.ipMailHits.get(ip) || []).filter((t) => t > hourAgo);
        if (hits.length >= MAIL_LIMIT_PER_HOUR) return false;
        hits.push(now);
        this.ipMailHits.set(ip, hits);
        return true;
    }

    private checkBudget() {
        if (Date.now() >= this.dailyResetAt) {
            this.dailySpendCents = 0;
            this.dailyResetAt = this.nextMidnight();
        }
        if (this.dailySpendCents >= this.dailyBudgetUsd * 100) {
            throw new HttpException(
                "daily chat budget exhausted — try again tomorrow",
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        }
    }

    private toolsForAuth(auth?: ChatAuth): Anthropic.Messages.Tool[] {
        const tools: Anthropic.Messages.Tool[] = [TOOL_LIST_SERVICES, TOOL_LIST_INDUSTRIES, TOOL_INQUIRY_EMAIL];
        if (auth?.customerId) {
            tools.push(TOOL_LIST_MY_BIDS, TOOL_LIST_REPLIES, TOOL_PREPARE_BID);
        }
        if (auth?.vendorId) {
            tools.push(TOOL_LIST_OPEN_BIDS, TOOL_LIST_MY_REPLIES);
            if (!auth.customerId) tools.push(TOOL_PREPARE_BID);
        }
        return tools;
    }

    private systemPromptForAuth(auth?: ChatAuth): string {
        if (auth?.customerId && auth?.vendorId) {
            return `${SYSTEM_BASE}\n\n${ROLE_GUIDE_CUSTOMER(auth.displayName)}\n\nNote: This user is also a VENDOR — they can see open bid opportunities AND their own bids. Combine the customer + vendor capabilities.\n${ROLE_GUIDE_VENDOR(auth.displayName)}`;
        }
        if (auth?.customerId) return `${SYSTEM_BASE}\n\n${ROLE_GUIDE_CUSTOMER(auth.displayName)}`;
        if (auth?.vendorId) return `${SYSTEM_BASE}\n\n${ROLE_GUIDE_VENDOR(auth.displayName)}`;
        return `${SYSTEM_BASE}\n\n${ROLE_GUIDE_ANON}`;
    }

    private isAllowed(toolName: string, auth?: ChatAuth): boolean {
        if (PUBLIC_TOOL_NAMES.has(toolName)) return true;
        if (CUSTOMER_TOOL_NAMES.has(toolName) && auth?.customerId) return true;
        if (VENDOR_TOOL_NAMES.has(toolName) && auth?.vendorId) return true;
        return false;
    }

    private async runTool(name: string, input: any, ip: string, auth?: ChatAuth): Promise<string> {
        if (!this.isAllowed(name, auth)) {
            return JSON.stringify({
                error: `${name} requires sign-in.`,
                hint: "Direct the user to sign in or register (customer or vendor) to use this feature.",
            });
        }
        try {
            if (name === "list_services") {
                const limit = Math.min(Math.max(Number(input?.limit) || 8, 1), 12);
                const where: any = {};
                if (input?.search) where.service_name = { contains: String(input.search), mode: "insensitive" };
                const rows = await this.prisma.droneService.findMany({
                    where, take: limit, orderBy: { priorty: "asc" },
                    select: { id: true, service_name: true, uav_type: true, unit: true, description: true, service_seo_name: true },
                });
                return JSON.stringify({
                    count: rows.length,
                    services: rows.map((r) => ({
                        name: r.service_name,
                        uav_type: r.uav_type,
                        unit: r.unit ? expandUnit(r.unit) : null,
                        summary: (r.description || "").slice(0, 200),
                        url: `${SITE_BASE}/services/${r.service_seo_name}`,
                    })),
                });
            }

            if (name === "list_industries") {
                const limit = Math.min(Math.max(Number(input?.limit) || 8, 1), 12);
                const rows = await this.prisma.industry.findMany({
                    take: limit, orderBy: { priorty: "asc" },
                    select: { id: true, industry_name: true, industry_seo_name: true, description: true },
                });
                return JSON.stringify({
                    count: rows.length,
                    industries: rows.map((r) => ({
                        name: r.industry_name,
                        summary: (r.description || "").slice(0, 180),
                        url: `${SITE_BASE}/industries/${r.industry_seo_name}`,
                    })),
                });
            }

            if (name === "list_open_bid_requests") {
                const limit = Math.min(Math.max(Number(input?.limit) || 5, 1), 10);
                const where: any = { status: "PENDING" };
                if (input?.location_contains) {
                    where.location = { contains: String(input.location_contains), mode: "insensitive" };
                }
                const rows = await this.prisma.bidRequest.findMany({
                    where, take: limit, orderBy: { createdAt: "desc" },
                    select: {
                        id: true, description: true, location: true, area: true, unit: true,
                        startDate: true, endDate: true, createdAt: true,
                        service: { select: { service_name: true } },
                    },
                });
                return JSON.stringify({
                    count: rows.length,
                    bid_requests: rows.map((r) => ({
                        id: r.id,
                        service: r.service?.service_name || "Drone service",
                        description: (r.description || "").slice(0, 240),
                        location: r.location || "Not specified",
                        area: r.area && r.unit ? `${r.area} ${expandUnit(r.unit)}` : null,
                        starts: r.startDate?.toISOString().slice(0, 10),
                        ends: r.endDate?.toISOString().slice(0, 10),
                        posted: r.createdAt?.toISOString().slice(0, 10),
                        url: `${SITE_BASE}/vendor/bid-requests/${r.id}`,
                    })),
                });
            }

            if (name === "list_my_bid_requests") {
                if (!auth?.customerId) return JSON.stringify({ error: "customer sign-in required" });
                const limit = Math.min(Math.max(Number(input?.limit) || 5, 1), 10);
                const rows = await this.prisma.bidRequest.findMany({
                    where: { customerId: auth.customerId },
                    take: limit, orderBy: { createdAt: "desc" },
                    select: {
                        id: true, status: true, description: true, location: true, area: true, unit: true,
                        startDate: true, endDate: true, createdAt: true,
                        service: { select: { service_name: true } },
                        bidReply: { select: { id: true } },
                    },
                });
                return JSON.stringify({
                    count: rows.length,
                    my_bid_requests: rows.map((r) => ({
                        id: r.id,
                        status: r.status,
                        service: r.service?.service_name || "Drone service",
                        description: (r.description || "").slice(0, 240),
                        location: r.location || "Not specified",
                        area: r.area && r.unit ? `${r.area} ${expandUnit(r.unit)}` : null,
                        starts: r.startDate?.toISOString().slice(0, 10),
                        ends: r.endDate?.toISOString().slice(0, 10),
                        posted: r.createdAt?.toISOString().slice(0, 10),
                        replies_count: r.bidReply.length,
                        url: `${SITE_BASE}/customer/bid-requests/${r.id}`,
                    })),
                });
            }

            if (name === "list_replies_to_my_bid") {
                if (!auth?.customerId) return JSON.stringify({ error: "customer sign-in required" });
                const id = String(input?.bid_request_id || "").trim();
                if (!id) return JSON.stringify({ error: "bid_request_id required" });
                const owns = await this.prisma.bidRequest.findFirst({
                    where: { id, customerId: auth.customerId }, select: { id: true },
                });
                if (!owns) return JSON.stringify({ error: "bid request not found or not yours" });
                const rows = await this.prisma.bidReply.findMany({
                    where: { bidReqId: id },
                    take: 10, orderBy: { createdAt: "desc" },
                    select: {
                        id: true, status: true, description: true, price: true, cstmrPrice: true,
                        startDate: true, endDate: true, createdAt: true,
                        vendor: { select: { comp_name: true, representative: true } },
                    },
                });
                return JSON.stringify({
                    count: rows.length,
                    replies: rows.map((r) => ({
                        id: r.id,
                        status: r.status,
                        vendor_name: r.vendor?.comp_name || r.vendor?.representative || "Vendor",
                        proposal: (r.description || "").slice(0, 200),
                        amount_inr: r.cstmrPrice ?? r.price ?? null,
                        starts: r.startDate?.toISOString().slice(0, 10),
                        ends: r.endDate?.toISOString().slice(0, 10),
                        replied: r.createdAt?.toISOString().slice(0, 10),
                    })),
                });
            }

            if (name === "list_my_bid_replies") {
                if (!auth?.vendorId) return JSON.stringify({ error: "vendor sign-in required" });
                const limit = Math.min(Math.max(Number(input?.limit) || 5, 1), 10);
                const rows = await this.prisma.bidReply.findMany({
                    where: { vendorId: auth.vendorId },
                    take: limit, orderBy: { createdAt: "desc" },
                    select: {
                        id: true, status: true, description: true, price: true, cstmrPrice: true,
                        startDate: true, endDate: true, createdAt: true,
                        bidRequests: {
                            select: {
                                id: true, location: true, area: true, unit: true,
                                service: { select: { service_name: true } },
                            },
                        },
                    },
                });
                return JSON.stringify({
                    count: rows.length,
                    my_bid_replies: rows.map((r) => ({
                        id: r.id,
                        status: r.status,
                        bid_request_id: r.bidRequests?.id,
                        service: r.bidRequests?.service?.service_name || "Drone service",
                        location: r.bidRequests?.location || "Not specified",
                        area: r.bidRequests?.area && r.bidRequests?.unit
                            ? `${r.bidRequests.area} ${expandUnit(r.bidRequests.unit)}`
                            : null,
                        proposal: (r.description || "").slice(0, 200),
                        amount_inr: r.cstmrPrice ?? r.price ?? null,
                        starts: r.startDate?.toISOString().slice(0, 10),
                        ends: r.endDate?.toISOString().slice(0, 10),
                        replied: r.createdAt?.toISOString().slice(0, 10),
                    })),
                });
            }

            if (name === "prepare_bid_action") {
                const action = input?.action === "accept" ? "accept" : "place";
                if (action === "place" && !auth?.vendorId) {
                    return JSON.stringify({ error: "Only vendors can place bids — please sign in as a vendor." });
                }
                if (action === "accept" && !auth?.customerId) {
                    return JSON.stringify({ error: "Only customers can accept bid replies — please sign in as a customer." });
                }
                const reqId = String(input?.bid_request_id || "").trim();
                const replyId = String(input?.bid_reply_id || "").trim();
                const url = action === "place"
                    ? (reqId ? `${SITE_BASE}/vendor/bid-requests/${reqId}` : `${SITE_BASE}/vendor/bid-requests`)
                    : (reqId ? `${SITE_BASE}/customer/bid-requests/${reqId}` : `${SITE_BASE}/customer/bid-requests`);
                const next_steps = action === "place"
                    ? [
                        "Open the bid request page using the deep link below.",
                        "Paste the drafted message, set your amount, attach any documents, and click Submit Bid.",
                    ]
                    : [
                        "Open your bid request page using the deep link below.",
                        "Review the vendor replies; locate the one you want to award.",
                        "Click Award/Accept on that reply to confirm.",
                    ];
                return JSON.stringify({
                    action,
                    bid_request_id: reqId || null,
                    bid_reply_id: replyId || null,
                    proposed_amount_inr: input?.proposed_amount_inr || null,
                    draft_message: input?.draft_message || "",
                    deep_link: url,
                    next_steps,
                });
            }

            if (name === "send_inquiry_email") {
                if (!this.checkMailLimit(ip)) {
                    return JSON.stringify({ ok: false, error: "Hourly email limit reached." });
                }
                const fromName = String(input?.from_name || "").trim().slice(0, 100);
                const fromEmail = String(input?.from_email || "").trim().slice(0, 200);
                const subject = String(input?.subject || "").trim().slice(0, 200);
                const message = String(input?.message || "").trim().slice(0, 4000);
                const fromPhone = String(input?.from_phone || "").trim().slice(0, 30) || undefined;
                const inquiryType = String(input?.inquiry_type || "general");
                if (!fromName || !fromEmail || !subject || !message) {
                    return JSON.stringify({ ok: false, error: "Missing required fields." });
                }
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
                    return JSON.stringify({ ok: false, error: "Invalid email address." });
                }
                const result = await this.mail.sendChatInquiry({
                    fromName, fromEmail, fromPhone, subject, message, inquiryType,
                });
                return JSON.stringify(result.success
                    ? { ok: true, sent_to_team: true }
                    : { ok: false, error: result.error || "Send failed." });
            }

            return JSON.stringify({ error: `unknown tool: ${name}` });
        } catch (err: any) {
            this.logger.error(`tool ${name} failed: ${err?.message || err}`);
            return JSON.stringify({ error: "tool execution failed" });
        }
    }

    async reply(messages: Msg[], ip: string, auth?: ChatAuth) {
        if (!this.client) {
            throw new HttpException("chat not configured", HttpStatus.SERVICE_UNAVAILABLE);
        }
        this.checkRateLimit(ip);
        this.checkBudget();

        const conversation: Anthropic.Messages.MessageParam[] = messages.map((m) => ({
            role: m.role,
            content: m.content,
        }));

        const tools = this.toolsForAuth(auth);
        const system = this.systemPromptForAuth(auth);

        try {
            for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
                const resp = await this.client.messages.create({
                    model: MODEL,
                    max_tokens: MAX_TOKENS_PER_REPLY,
                    system,
                    tools,
                    messages: conversation,
                });

                this.dailySpendCents +=
                    (resp.usage.input_tokens / 1_000_000) * INPUT_PER_MTOK * 100 +
                    (resp.usage.output_tokens / 1_000_000) * OUTPUT_PER_MTOK * 100;

                if (resp.stop_reason === "tool_use") {
                    const toolUses = resp.content.filter(
                        (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
                    );
                    conversation.push({ role: "assistant", content: resp.content });
                    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
                    for (const tu of toolUses) {
                        const out = await this.runTool(tu.name, tu.input, ip, auth);
                        toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: out });
                    }
                    conversation.push({ role: "user", content: toolResults });
                    continue;
                }

                const text = resp.content
                    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
                    .map((b) => b.text).join("\n").trim();

                return {
                    reply: text || "I'm here — could you rephrase that?",
                    usage: { input_tokens: resp.usage.input_tokens, output_tokens: resp.usage.output_tokens },
                };
            }
            return {
                reply: "I had trouble completing that. Could you try rephrasing?",
                usage: { input_tokens: 0, output_tokens: 0 },
            };
        } catch (err: any) {
            this.logger.error("anthropic call failed: " + (err?.message || err));
            if (err?.status === 401) {
                throw new HttpException("chat auth failed — API key invalid", HttpStatus.SERVICE_UNAVAILABLE);
            }
            throw new HttpException("chat temporarily unavailable", HttpStatus.BAD_GATEWAY);
        }
    }
}
