---
name: vmw-app-control
description: >-
  Điều khiển vòng đời ứng dụng Virtual Music World (API + Web) trên máy Local trong workspace này. Dùng khi người dùng gõ /start, /stop hoặc yêu cầu khởi động / dừng chạy app Virtual Music World (ưu tiên hơn bot-control khi đang ở project này).
---

# Điều khiển ứng dụng Virtual Music World trên máy Local

Skill này cung cấp quy trình khởi động (`/start`) và dừng (`/stop`) cho **Virtual Music World** (`@vmw/api` + `@vmw/web`) trên máy Local.

## 1. Khởi động ứng dụng Local (`/start`)

Khi người dùng gõ `/start` hoặc yêu cầu chạy app:

1. **Kiểm tra task nền đang chạy:**
   - Gọi `manage_task(Action='list')` để kiểm tra xem `npm run dev` / `tools/scripts/dev.mjs` đã đang chạy chưa.
   - Nếu đang chạy, báo cho người dùng biết app đang chạy kèm URL (`http://localhost:5173` cho Web và `http://localhost:4000` cho API), không tạo trùng lặp.

2. **Đảm bảo Node.js & dependencies:**
   - Trong PowerShell, thêm `C:\Program Files\nodejs` vào `PATH` nếu chưa có và dùng `npm.cmd` (tránh lỗi ExecutionPolicy của `npm.ps1` trên Windows):
     `$env:PATH = "C:\Program Files\nodejs;$env:PATH"`
   - Kiểm tra nếu chưa có `node_modules` thì chạy `npm.cmd ci` trước (`WaitMsBeforeAsync: 10000`).

3. **Khởi chạy `npm.cmd run dev` ở chế độ Daemon:**
   - Gọi `run_command`:
     - `CommandLine`: `$env:PATH = "C:\Program Files\nodejs;$env:PATH"; npm.cmd run dev`
     - `IsDaemon`: `true`
     - `WaitMsBeforeAsync`: `8000`
     - `toolSummary`: `Start Virtual Music World dev servers`

4. **Xác nhận trạng thái:**
   - Kiểm tra log đầu ra: xác nhận thấy `[VMW API] Modular Monolith + Realtime Gateway listening on http://localhost:4000` và Vite dev server (`http://localhost:5173`).
   - Báo rõ URL truy cập cho người dùng (có thể gợi ý mở trình duyệt hoặc dùng `/browser` để xem).

---

## 2. Dừng ứng dụng Local (`/stop`)

Khi người dùng gõ `/stop` hoặc yêu cầu dừng app:

1. **Dừng task nền Antigravity:**
   - Gọi `manage_task(Action='list')` và kill task đang chạy `npm run dev`.
2. **Dọn tiến trình Node/Vite còn sót (nếu có):**
   ```powershell
   Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*Project D - Auditorium*" -or $_.CommandLine -like "*tools\scripts\dev.mjs*" -or $_.CommandLine -like "*tsx watch src/server.ts*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
   ```
3. **Xác nhận:** Thông báo ứng dụng Virtual Music World đã dừng hoàn toàn.
