export function Pagination(searchFields: string[] = []) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    descriptor.value = async function (...args: any[]) {
      const [dto, modelName, queryOptions = {}] = args;

      const page = parseInt(dto.page) || 1;
      const limit = parseInt(dto.limit) || 10;
      const skip = (page - 1) * limit;

      queryOptions.skip = skip;
      queryOptions.take = limit;

      const prisma = this.prisma;
      if (!prisma || !prisma[modelName]) {
        throw new Error(`Invalid Prisma model: ${modelName}`);
      }

      const sample = await prisma[modelName].findFirst(); // to infer types
      const orConditions: any[] = [];

      if (dto.search && searchFields.length > 0 && sample) {
        for (const field of searchFields) {
          const value = dto.search;
          const sampleValue = sample[field];

          if (typeof sampleValue === 'string') {
            orConditions.push({
              [field]: {
                contains: value,
                mode: 'insensitive',
              },
            });
          } else if (typeof sampleValue === 'number') {
            if (!isNaN(Number(value))) {
              orConditions.push({ [field]: Number(value) });
            }
          } else if (sampleValue instanceof Date) {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              orConditions.push({ [field]: date });
            }
          }
        }

        if (!queryOptions.where) queryOptions.where = {};
        queryOptions.where.OR = orConditions;
      }

      const [total, data] = await Promise.all([
        prisma[modelName].count({ where: queryOptions.where }),
        prisma[modelName].findMany(queryOptions),
      ]);

      return { total, page, limit, data };
    };

    return descriptor;
  };
}
