import { Request, Response, NextFunction } from "express";
import { runCodeService } from "@/services/code.service";

export async function runCode(req: Request, res: Response, next: NextFunction) {
  try {
    const { code } = req.body;
    const result = await runCodeService(code);
    res.status(200).json({ result });
  } catch (error) {
    next(error);
  }
}
