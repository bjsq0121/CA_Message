import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { v4 as uuid } from "uuid";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

const UPLOAD_DIR = path.resolve("uploads");

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// 파일 업로드
router.post("/upload", upload.single("file"), (req: AuthRequest, res) => {
  if (!req.file) {
    res.status(400).json({ error: "파일이 없습니다" });
    return;
  }

  const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(req.file.originalname);

  res.json({
    fileId: req.file.filename,
    fileName: req.file.originalname,
    fileUrl: `/files/${req.file.filename}`,
    fileSize: req.file.size,
    msgType: isImage ? "IMAGE" : "FILE",
  });
});

// 파일 다운로드/표시
router.get("/:fileId", (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.fileId);
  res.sendFile(filePath, (err) => {
    if (err) res.status(404).json({ error: "파일을 찾을 수 없습니다" });
  });
});

export { router as fileRoutes };
