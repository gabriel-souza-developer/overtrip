import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
export declare const authController: {
    login(req: Request, res: Response): Promise<void>;
    me(req: AuthRequest, res: Response): Promise<void>;
    changePassword(req: AuthRequest, res: Response): Promise<void>;
};
//# sourceMappingURL=authController.d.ts.map