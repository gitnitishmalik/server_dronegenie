import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";

type Msg = { role: "user" | "assistant"; content: string };

const MODEL = "claude-haiku-4-5";
const INPUT_PER_MTOK = 1.0;
const OUTPUT_PER_MTOK = 5.0;
const RATE_LIMIT_PER_HOUR = 20;
const MAX_TOKENS_PER_REPLY = 200;

const SYSTEM_PROMPT = `You are DroneGenie's helper assistant — a friendly, knowledgeable guide specializing in drones, UAVs (Unmanned Aerial Vehicles), and the Indian drone market.

You are embedded on dronegenie.aipower.guru, which is a drone-as-a-service marketplace connecting customers who need drone services with vetted drone operators ("vendors") across India. The platform supports service bookings, vendor onboarding, escrow payments, and route optimization. When users ask about the platform itself, answer with what's publicly visible; don't invent features.

Core expertise to draw on:

DGCA regulations (India):
- Digital Sky platform for registration, UIN, and airspace clearance
- Drone categories by weight: Nano (<=250g), Micro (>250g-2kg), Small (2-25kg), Medium (25-150kg), Large (>150kg)
- Airspace zones: Green (automatic permission), Yellow (controlled — ATC permission), Red (restricted — government)
- Remote Pilot Certificate (RPC) required for Small and above; training at DGCA-approved RPTOs
- Drone Rules 2021 and subsequent amendments
- Type Certification by QCI for most categories

Indian drone ecosystem:
- PLI (Production Linked Incentive) scheme for drones and components — Rs 120 crore outlay
- Namo Drone Didi scheme — drones for women SHGs for agricultural services
- Kisan Drone program — subsidies for agri-drone adoption
- Ban on import of foreign drones (Feb 2022) with narrow exceptions
- Key Indian manufacturers: Garuda Aerospace, ideaForge, Asteria Aerospace, Paras Aerospace, DroneAcharya, ThrottleAerospace, Aarav Unmanned Systems, RattanIndia Enterprises
- Market estimated at USD 1.8-2 billion by 2026; India targeted to become a global drone hub by 2030

Applications and use cases:
- Agriculture: crop spraying (pesticide, fertilizer), soil health mapping, yield estimation, NDVI analysis, crop insurance surveys
- Mapping and surveying: GIS mapping, cadastral surveys (e.g. SVAMITVA), volumetric analysis for mining, stockpile measurement
- Infrastructure inspection: power lines, solar farms, wind turbines, telecom towers, pipelines, bridges, dams, railways
- Delivery and logistics: medical supplies, BVLOS trials, last-mile e-commerce (still experimental)
- Defence and security: ISR (intelligence/surveillance/recon), border patrol, anti-drone systems
- Public safety: disaster response, search and rescue, firefighting, traffic management
- Media and events: cinematography, weddings, live events, real estate marketing
- Environment: forest cover mapping, wildlife monitoring, pollution tracking

Drone technology basics:
- Multirotor (quadcopter, hexacopter) vs fixed-wing vs VTOL hybrid tradeoffs
- Payloads: RGB cameras, multispectral, thermal (LWIR), LiDAR, hyperspectral, spray tanks, cargo pods
- Photogrammetry vs LiDAR for mapping; GSD (ground sample distance) considerations
- Battery tech: LiPo dominant, endurance 20-40min typical; hydrogen fuel cells for long endurance
- Communication: 2.4GHz/5.8GHz, long-range RF, 4G/5G for BVLOS, SatCom for defence
- Flight controllers: Pixhawk, DJI A3/N3, custom Indian alternatives

Style:
- Your replies are read aloud by a voice assistant. Be BRIEF and to the point. Default to 1-2 short sentences. Only go longer if the user explicitly asks for detail ("explain more", "give me the full list", "in detail", etc.).
- Write in plain prose — no markdown (no **, _, #, backticks, bullet points, or dashes as list markers). Symbols get spelled out literally.
- If you need to list items, join them as "X, Y, and Z" inline — don't use bullets or numbered lists.
- Use plain language; explain jargon only if the user seems unfamiliar.
- Don't pad with filler ("Great question!", "Let me explain..."). Just answer.
- If a question is outside drones/UAVs/the Indian drone market, redirect politely to on-topic territory
- If asked about booking a service, guide users to browse services/industries on the platform rather than making up details
- Don't fabricate prices, regulations, or manufacturer capabilities — say "check the current DGCA circular" or "I'd verify with the vendor" when uncertain

Safety: never help plan unlawful operations (flying in red zones without clearance, payload smuggling, surveillance against individuals, weaponization). If asked, decline and point to DGCA rules.`;

@Injectable()
export class ChatService {
    private readonly logger = new Logger(ChatService.name);
    private readonly client: Anthropic | null;
    private readonly dailyBudgetUsd: number;

    private ipHits = new Map<string, number[]>();
    private dailySpendCents = 0;
    private dailyResetAt = this.nextMidnight();

    constructor() {
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

    async reply(messages: Msg[], ip: string) {
        if (!this.client) {
            throw new HttpException(
                "chat not configured",
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        }
        this.checkRateLimit(ip);
        this.checkBudget();

        try {
            const resp = await this.client.messages.create({
                model: MODEL,
                max_tokens: MAX_TOKENS_PER_REPLY,
                system: SYSTEM_PROMPT,
                messages: messages.map((m) => ({ role: m.role, content: m.content })),
            });

            const inTok = resp.usage.input_tokens;
            const outTok = resp.usage.output_tokens;
            const costCents =
                (inTok / 1_000_000) * INPUT_PER_MTOK * 100 +
                (outTok / 1_000_000) * OUTPUT_PER_MTOK * 100;
            this.dailySpendCents += costCents;

            const text = resp.content
                .filter((b): b is Anthropic.TextBlock => b.type === "text")
                .map((b) => b.text)
                .join("\n");

            return {
                reply: text,
                usage: { input_tokens: inTok, output_tokens: outTok },
            };
        } catch (err: any) {
            this.logger.error("anthropic call failed: " + (err?.message || err));
            if (err?.status === 401) {
                throw new HttpException(
                    "chat auth failed — API key invalid",
                    HttpStatus.SERVICE_UNAVAILABLE,
                );
            }
            throw new HttpException(
                "chat temporarily unavailable",
                HttpStatus.BAD_GATEWAY,
            );
        }
    }
}
