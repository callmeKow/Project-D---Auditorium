---
name: start
description: >-
  Khởi động ngay ứng dụng Virtual Music World (API port 4000 + Web port 5173) trên máy Local khi người dùng gõ /start hoặc yêu cầu chạy project này.
---

# `/start` — Khởi động Virtual Music World trên Local

Thực hiện đúng các bước sau để bật nhanh cả `@vmw/api` (`http://localhost:4000`) và `@vmw/web` (`http://localhost:5173`):

1. **Kiểm tra task nền đang chạy:**
   - Gọi `manage_task(Action='list')`.
   - Nếu đã có task `Start Virtual Music World dev servers` (`npm run dev`) đang chạy, báo ngay cho người dùng kèm URL `http://localhost:5173/` và `http://localhost:4000`, không chạy trùng lặp.

2. **Chạy server phát triển ở chế độ Daemon:**
   - Dùng `run_command` với:
     - `CommandLine`: `$env:PATH = "C:\Program Files\nodejs;$env:PATH"; if (-not (Test-Path "node_modules")) { npm.cmd ci }; npm.cmd run dev`
     - `IsDaemon`: `true`
     - `WaitMsBeforeAsync`: `8000`
     - `toolSummary`: `Start Virtual Music World dev servers`

3. **Xác nhận và báo người dùng:**
   - Kiểm tra log đầu ra có `[VMW API] Modular Monolith + Realtime Gateway listening on http://localhost:4000` và Vite `http://localhost:5173/`.
   - Trả lời ngắn gọn kèm link `http://localhost:5173/` và `http://localhost:4000`.
