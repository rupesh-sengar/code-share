import { Router } from "express";
import { runCode } from "@/controllers/code.controller";

const router = Router();
router.post("/run", runCode);

export default router;
