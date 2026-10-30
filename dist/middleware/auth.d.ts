import { Request, Response, NextFunction } from 'express';
export interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        role: string;
    };
}
export declare const authenticate: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const authorize: (...roles: string[]) => (req: AuthRequest, res: Response, next: NextFunction) => void;
export declare const generateToken: (user: {
    id: string;
    email: string;
    role: string;
}) => string;
export declare const verifyToken: (token: string) => {
    id: string;
    email: string;
    role: string;
} | null;
//# sourceMappingURL=auth.d.ts.map