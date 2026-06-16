import type { Session } from '../session.js';

declare global {
  namespace Express {
    interface Request {
      session?: Session;
    }
  }
}
