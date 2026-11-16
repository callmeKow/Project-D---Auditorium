---
name: stop
description: >-
  Dừng hoàn toàn ứng dụng Virtual Music World (API + Web) đang chạy nền trên máy Local khi người dùng gõ /stop.
---

# `/stop` — Dừng Virtual Music World trên Local

Thực hiện đúng các bước sau để tắt sạch `@vmw/api` và `@vmw/web`:

1. **Dừng task nền Antigravity:**
   - Gọi `manage_task(Action='list')` và `manage_task(Action='kill', TaskId=...)` đối với task `npm.cmd run dev` / `Start Virtual Music World dev servers` nếu đang chạy.

2. **Dọn tiến trình Node/Vite/TSX còn sót (nếu có):**
   - Chạy `run_command`:
     ```powershell
     Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*Project D - Auditorium*" -or $_.CommandLine -like "*tools\scripts\dev.mjs*" -or $_.CommandLine -like "*tsx watch src/server.ts*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
     ```

3. **Xác nhận:**
   - Báo cho người dùng ứng dụng Virtual Music World đã dừng hoàn toàn.
