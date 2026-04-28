import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { QueryFilterDto } from "./dtos/admin.dto";

@Injectable({})
export class AdminService {
    constructor(private readonly prisma: PrismaService) { }

    async summary(dto: QueryFilterDto) {
        try {
            const currentDate = new Date();

            const selectedMonth = dto?.month ? parseInt(dto?.month) : currentDate.getMonth() + 1;
            const selectedYear = dto?.year ? parseInt(dto?.year) : currentDate.getFullYear();

            const startDate = new Date(selectedYear, selectedMonth - 1, 1);
            const endDate = new Date(selectedYear, selectedMonth, 1)

            const totalVendor = await this.prisma.vendor.count({
                where: {
                    createdAt: {
                        gte: startDate,
                        lt: endDate
                    },
                }
            })

            const totalCustomer = await this.prisma.customer.count({
                where: {
                    createdAt: {
                        gte: startDate,
                        lt: endDate
                    },
                }
            })

            const totalOrder = await this.prisma.order.count({
                where: {
                    createdAt: {
                        gte: startDate,
                        lt: endDate
                    },
                }
            })

            const totalPendingBidRequest = await this.prisma.bidRequest.count({
                where: {
                    status: 'PENDING',
                    createdAt: {
                        gte: startDate,
                        lt: endDate
                    },
                }
            })

            const totalAwardedBidRequest = await this.prisma.bidRequest.count({
                where: {
                    status: 'AWARDED',
                    createdAt: {
                        gte: startDate,
                        lt: endDate
                    },
                }
            })

            const totalBiling = await this.prisma.order.aggregate({
                where: {
                    createdAt: {
                        gte: startDate,
                        lt: endDate
                    },
                },
                _sum: {
                    customer_total: true,
                },
            })

            const totalVendorPaid = await this.prisma.order.aggregate({
                where: {
                    createdAt: {
                        gte: startDate,
                        lt: endDate
                    },
                },
                _sum: {
                    vendor_total: true,
                },
            })

            const totalDGMargin = await this.prisma.order.aggregate({
                where: {
                    createdAt: {
                        gte: startDate,
                        lt: endDate
                    },
                },
                _sum: {
                    dg_margin: true,
                },
            })

            const totalMargin = totalDGMargin._sum.dg_margin ?? 0;
            const totalRevenue = totalBiling._sum.customer_total ?? 0;

            const profitRatio = Number((totalRevenue === 0 ? 0 : (totalMargin / totalRevenue) * 100).toFixed(2));

            return {
                vendors: totalVendor,
                customers: totalCustomer,
                orders: totalOrder,
                openBidRequest: totalPendingBidRequest,
                closedBidRequest: totalAwardedBidRequest,
                totalBilling: Number(totalBiling._sum.customer_total?.toFixed(2)),
                totalVandorPrice: Number(totalVendorPaid._sum.vendor_total?.toFixed),
                dgMargin: Number(totalDGMargin._sum.dg_margin?.toFixed(2)),
                profitRatio: profitRatio
            }
        } catch (error) {
            throw new InternalServerErrorException("Something Went Wrong")
        }
    }



    async getMonthlyOrders(dto: QueryFilterDto) {
        try {
            const month = Number(dto.month); // 1–12
            const year = Number(dto.year);

            if (month < 1 || month > 12) {
                throw new BadRequestException('Invalid month');
            }

            // 1️⃣ Build date range for month
            const startDate = new Date(year, month - 1, 1, 0, 0, 0);
            const endDate = new Date(year, month, 0, 23, 59, 59); // last day of month

            // 2️⃣ Fetch orders in this month (ONLY required fields)
            const orders = await this.prisma.order.findMany({
                where: {
                    status: 'COMPLETED',
                    createdAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                select: {
                    createdAt: true,
                },
            });

            // 3️⃣ Initialize weekly buckets (max 5 weeks)
            const weeklyOrders = [
                { week: 1, orders: 0 },
                { week: 2, orders: 0 },
                { week: 3, orders: 0 },
                { week: 4, orders: 0 },
                { week: 5, orders: 0 },
            ];

            // 4️⃣ Count orders per week
            for (const order of orders) {
                const dayOfMonth = order.createdAt.getDate();

                let week = 1;
                if (dayOfMonth >= 1 && dayOfMonth <= 7) week = 1;
                else if (dayOfMonth <= 14) week = 2;
                else if (dayOfMonth <= 21) week = 3;
                else if (dayOfMonth <= 28) week = 4;
                else week = 5;

                weeklyOrders[week - 1].orders += 1;
            }

            // 5️⃣ Remove empty week 5 if month has only 4 weeks
            const result = weeklyOrders.filter(
                w => !(w.week === 5 && w.orders === 0)
            );

            return result;
        } catch (error) {
            throw error;
        }
    }



    async getMonthlyRevenue(dto: QueryFilterDto) {
        try {
            const month = Number(dto.month); // 1–12
            const year = Number(dto.year);

            if (month < 1 || month > 12) {
                throw new BadRequestException('Invalid month');
            }

            // 1️⃣ Build date range for the month
            const startDate = new Date(year, month - 1, 1, 0, 0, 0);
            const endDate = new Date(year, month, 0, 23, 59, 59);

            // 2️⃣ Fetch orders (only required fields)
            const orders = await this.prisma.order.findMany({
                where: {
                    createdAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                    status: 'COMPLETED', // 🔥 recommended for revenue
                },
                select: {
                    createdAt: true,
                    customer_total: true,
                },
            });

            // 3️⃣ Initialize weekly buckets
            const weeklyRevenue = [
                { week: 1, revenue: 0 },
                { week: 2, revenue: 0 },
                { week: 3, revenue: 0 },
                { week: 4, revenue: 0 },
                { week: 5, revenue: 0 },
            ];

            // 4️⃣ Aggregate revenue per week
            for (const order of orders) {
                const dayOfMonth = order.createdAt.getDate();
                const amount = Number(order.customer_total ?? 0);

                let week = 1;
                if (dayOfMonth >= 1 && dayOfMonth <= 7) week = 1;
                else if (dayOfMonth <= 14) week = 2;
                else if (dayOfMonth <= 21) week = 3;
                else if (dayOfMonth <= 28) week = 4;
                else week = 5;

                weeklyRevenue[week - 1].revenue += amount;
            }

            // 5️⃣ Round & remove empty week 5 if not needed
            const result = weeklyRevenue
                .map(w => ({
                    week: w.week,
                    revenue: Math.round((w.revenue + Number.EPSILON) * 100) / 100,
                }))
                .filter(w => !(w.week === 5 && w.revenue === 0));

            return result;
        } catch (error) {
            throw error;
        }
    }


}