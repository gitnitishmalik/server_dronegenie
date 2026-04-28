export const jwtConstants = {
  atSecret: process.env.AT_SECRET || 'at-secret',
  rtSecret: process.env.RT_SECRET || 'rt-secret',
  atExpiresIn: '15m',
  rtExpiresIn: '7d',
};
