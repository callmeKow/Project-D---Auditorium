# Deployment Plan & Production Context — Virtual Music World

## 0. Trạng thái Deploy thực tế (Production Context cho AI & Dev)

> **Tóm tắt nhanh cho AI khi mở repo ở máy mới:** Hệ thống hiện đang chạy Production theo mô hình **tách Frontend (Cloudflare Pages) + Backend (Render Singapore)**, kết nối tự động từ nhánh **`main`** của GitHub `callmeKow/Project-D---Auditorium`.

| Thành phần | Nền tảng | Region | URL / Endpoint | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| **Source Repo** | GitHub | — | `https://github.com/callmeKow/Project-D---Auditorium` | Nhánh production: **`main`** |
| **Frontend (`@vmw/web`)** | **Cloudflare Pages** | Global Edge (VN & SG) | `https://project-d---auditorium.pages.dev` | Auto-deploy khi push `main` |
| **Backend (`@vmw/api`)** | **Render** (Free Web Service) | **Singapore** | `https://kowie-auditorium.onrender.com` | Auto-deploy khi push `main` (`On Commit`) |
| **WebSocket Realtime** | **Render** (`ws`) | **Singapore** | `wss://kowie-auditorium.onrender.com/ws` | Chung process với `@vmw/api` |
| **Health Check** | **Render** | **Singapore** | `https://kowie-auditorium.onrender.com/health` | Dùng để ping giữ server thức |

### Cấu hình Build & Environment Variables đang dùng

1. **Render (`Kowie Auditorium` — Service ID: `srv-dc003ne7bikc7391ou00`):**
   - **Branch:** `main`
   - **Build Command:** `npm ci --include=dev && npm --workspace=@vmw/api run build`
   - **Start Command:** `node services/api/dist/server.js`
   - **Health Check Path:** `/health` *(có thêm trường `databaseConnected: true/false` để kiểm tra Neon PostgreSQL)*
   - **Env Vars:**
     - `DATABASE_URL` = `<Connection String từ Neon PostgreSQL (Singapore)>` *(lưu bền vững `users`, `sessions`, `rooms`, `setlist`)*
     - `GOOGLE_CLIENT_ID` = `<Google OAuth 2.0 Web Client ID>` *(xác thực token đăng nhập Google thật)*
     - `CORS_ORIGIN` *(tùy chọn, mặc định cho phép tất cả nếu không đặt; đặt `https://project-d---auditorium.pages.dev` nếu muốn khóa CORS)*.
   - **Lưu ý vận hành:** Gói Render Free tự ngủ sau 15 phút không có request (cold start ~30–50s); có thể dùng `cron-job.org` ping `/health` mỗi 10 phút.

2. **Cloudflare Pages (`project-d---auditorium` / `kowie-auditorium`):**
   - **Branch:** `main`
   - **Build Command:** `npm ci --include=dev && npm --workspace=@vmw/web run build`
   - **Build Output Directory:** `apps/web/dist`
   - **Env Vars:**
     - `VITE_API_URL` = `https://kowie-auditorium.onrender.com`
     - `VITE_WS_URL` = `wss://kowie-auditorium.onrender.com/ws`
     - `VITE_GOOGLE_CLIENT_ID` = `<Google OAuth 2.0 Web Client ID>` *(bật nút Đăng nhập Google thật trên `/auth`)*
     - *(Tùy chọn cho WebRTC Mic qua nhiều mạng NAT khác nhau)*: `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`.

---

## Kiến trúc đề xuất (Nếu nâng cấp lên Oracle Cloud Always Free)

```text
Người dùng (Trình duyệt HTTPS/WSS)
   │
   ├──► [Frontend] Cloudflare Pages (Free, Edge CDN tại VN & Singapore)
   │       └── Phục vụ React + Vite + các file 3D (.glb, .fbx) tốc độ cao
   │
   └──► [Backend] Oracle Cloud Always Free VM (Singapore • ARM 4 OCPU / 24GB RAM)
           ├── Caddy / Nginx (Reverse Proxy + Auto SSL HTTPS/WSS)
           └── @vmw/api (Node.js + Express + WebSocket ws :4000, quản lý bởi PM2)
```

*(Ghi chú: Hiện tại đang dùng **Render (Singapore)** thay cho Oracle Cloud để không cần thẻ Visa/Mastercard; sau này nếu muốn không bị sleep khi rảnh và chịu tải lớn 100–500 CCU thì chuyển `@vmw/api` sang Oracle Cloud theo hướng dẫn bên dưới.)*

---

## Phần 1: Các Task AI thực hiện trong Codebase (Code & Config)

- [x] **Task 1 — Cấu hình biến môi trường Frontend (`VITE_API_URL`, `VITE_WS_URL`)**
  - Đã cập nhật `apps/web/src/api/client.ts` đọc `import.meta.env.VITE_API_URL` (fallback `/api` ở local dev).
  - Đã cập nhật `apps/web/src/realtime/realtimeStore.ts` đọc `import.meta.env.VITE_WS_URL` (fallback `${proto}//${window.location.host}/ws` ở local dev).
  - Đã thêm `apps/web/src/vite-env.d.ts` để TypeScript nhận type `ImportMeta.env`.
- [x] **Task 2 — Cấu hình CORS & Healthcheck cho Backend (`services/api`)**
  - Đã cập nhật `services/api/src/server.ts` đọc `process.env.CORS_ORIGIN` và sẵn có endpoint `GET /health`.
- [x] **Task 3 — Hỗ trợ TURN Server qua Env cho WebRTC Mic (`apps/web/src/audio/webrtcAudio.ts`)**
  - Đã bổ sung đọc `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` bên cạnh STUN servers.
- [ ] **Task 4 — Tạo cấu hình Production Server cho Oracle VM (`PM2` & `Caddyfile`)** *(chỉ cần làm khi chuyển từ Render sang Oracle Cloud VM)*
  - Tạo `infrastructure/prod/ecosystem.config.cjs` cho **PM2** và `infrastructure/prod/Caddyfile`.

---

## Phần 2: Các Task BẠN cần tự thực hiện (Hướng dẫn từng bước)

### Bước 1: Tạo tài khoản & Máy ảo Oracle Cloud Always Free (Singapore)
1. Truy cập [cloud.oracle.com](https://www.oracle.com/cloud/free/) → chọn **Start for free**.
2. **Quan trọng:** Tại mục **Home Region**, bắt buộc chọn **`Singapore` (`ap-singapore-1`)** *(không đổi được Home Region sau khi tạo tài khoản)*.
3. Nhập thẻ Visa/Mastercard để xác minh danh tính *(Oracle chỉ giữ tạm ~$1 rồi hoàn lại, không thu phí nếu chỉ dùng tài nguyên có nhãn **Always Free Eligible**)*.
4. Vào menu **Compute → Instances → Create Instance**:
   - **Name:** `vmw-prod-sg`
   - **Image:** `Ubuntu 22.04` hoặc `Ubuntu 24.04` (Minimal/Standard).
   - **Shape:** Chọn **Ampere (ARM)** → `VM.Standard.A1.Flex` *(Always Free Eligible)*:
     - Kéo lên **2 OCPU** và **12 GB RAM** (hoặc tối đa **4 OCPU / 24 GB RAM** — miễn phí hoàn toàn).
     - *(Nếu hết slot ARM ở Singapore lúc tạo, có thể tạo trước `VM.Standard.E2.1.Micro` 1GB RAM để test, rồi tạo ARM sau).*
   - **SSH Keys:** Chọn **Generate a key pair for me** → bấm **Save Private Key** (lưu file `.key` cẩn thận để SSH vào server).
   - Bấm **Create** và đợi trạng thái chuyển sang **Running**, ghi lại **Public IPv4 Address**.

---

### Bước 2: Mở Port Firewall trên Oracle Cloud Console
1. Trong trang chi tiết Instance vừa tạo, bấm vào **Subnet** (mục *Primary VNIC*).
2. Bấm vào **Default Security List**.
3. Bấm **Add Ingress Rules** và thêm các rule sau (Source CIDR: `0.0.0.0/0`):
   - **Port `80`** (TCP) — HTTP / SSL verification
   - **Port `443`** (TCP) — HTTPS & WebSocket Secure (`wss://`)

---

### Bước 3: SSH vào VM & Cài đặt môi trường
Mở **PowerShell** trên máy Windows của bạn:

```powershell
# Cấp quyền đọc cho private key (thay đường dẫn file .key bạn đã tải)
icacls "C:\Users\Admin\Downloads\ssh-key.key" /inheritance:r
icacls "C:\Users\Admin\Downloads\ssh-key.key" /grant:r "$($env:USERNAME):(R)"

# SSH vào server (thay <PUBLIC_IP> bằng IP của Oracle VM)
ssh -i "C:\Users\Admin\Downloads\ssh-key.key" ubuntu@<PUBLIC_IP>
```

Sau khi vào được terminal của Ubuntu, chạy lần lượt các lệnh sau:

```bash
# 1. Mở firewall bên trong Ubuntu (Oracle Ubuntu mặc định chặn port 80/443 bằng iptables)
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# 2. Cài Node.js 22 LTS + Git + PM2
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
sudo npm install -g pm2

# 3. Cài Caddy (Web Server tự động cấp HTTPS/WSS miễn phí)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

---

### Bước 4: Chuẩn bị Domain + SSL (`https://` & `wss://`)
Trình duyệt **bắt buộc** trang web và WebSocket chạy qua `https://` và `wss://` mới cho phép bật Micro. Bạn chọn 1 trong 2 cách:

* **Cách A (Khuyên dùng — Có tên miền riêng, ví dụ trên Cloudflare):**
  1. Trỏ DNS record `api.tenmien.com` (type `A`, tắt Proxy đám mây màu cam lúc đầu hoặc để **Full (Strict)** khi bật) về `<PUBLIC_IP>` của Oracle VM.
  2. Cấu hình Caddy với domain `api.tenmien.com` → Caddy tự động cấp SSL và forward về `localhost:4000`.
* **Cách B (Chưa có tên miền — 100% Free bằng DuckDNS hoặc Cloudflare Quick/Named Tunnel):**
  - Tạo subdomain miễn phí trên [duckdns.org](https://www.duckdns.org/) (ví dụ `vmw-api.duckdns.org`) trỏ về `<PUBLIC_IP>`, sau đó cấu hình Caddy dùng `vmw-api.duckdns.org` → có ngay `https://vmw-api.duckdns.org` và `wss://vmw-api.duckdns.org/ws`.

---

### Bước 5: Tạo TURN Server miễn phí (cho WebRTC Microphone ổn định)
1. Đăng ký tài khoản miễn phí tại [metered.ca/tools/openrelay](https://www.metered.ca/tools/openrelay/) (gói Free tặng **50 GB/tháng** băng thông TURN).
2. Lấy thông tin:
   - `TURN URL` (ví dụ `turn:a.relay.metered.ca:80`)
   - `Username` & `Credential`
3. Lưu lại để điền vào biến môi trường Frontend ở Bước 7.

---

### Bước 6: Clone code & Chạy Backend trên Oracle VM
Trên terminal Ubuntu của Oracle VM:

```bash
git clone <URL_REPO_GITHUB_CUA_BAN> ~/vmw
cd ~/vmw
npm ci
npm --workspace=@vmw/api run build

# Khởi động API bằng PM2 (chạy nền 24/7)
PORT=4000 CORS_ORIGIN="https://<DOMAIN_FRONTEND_CUA_BAN>" pm2 start services/api/dist/server.js --name vmw-api
pm2 save
pm2 startup
```
*(Chạy thêm lệnh `sudo env PATH=...` mà `pm2 startup` in ra màn hình để server tự bật lại nếu Oracle VM reboot).*

---

### Lựa chọn thay thế (100% Không cần thẻ Visa/Mastercard): Deploy Backend lên Koyeb (Region Singapore)

> Nếu bạn **không muốn nhập thẻ Visa/Mastercard** cho Oracle Cloud, hãy bỏ qua **Bước 1 → Bước 4** và **Bước 6**, làm theo các bước dưới đây để chạy Backend trên **Koyeb Free Tier (Singapore)**, sau đó tiếp tục **Bước 5 (TURN Server)** và **Bước 7 (Cloudflare Pages)**:

1. **Đăng ký tài khoản Koyeb (miễn phí, không cần thẻ):**
   - Truy cập [app.koyeb.com](https://app.koyeb.com/) → chọn **Sign up with GitHub**.
   - Xác thực tài khoản GitHub (không yêu cầu nhập thẻ tín dụng).
2. **Tạo Web Service mới:**
   - Bấm **Create Service** → chọn **Web Service** → chọn **GitHub** làm nguồn deploy.
   - Chọn repository `Virtual Music World` của bạn (nhánh `main`).
3. **Chọn Region & Gói Free:**
   - **Instance:** Chọn **Free (`0.1 vCPU / 512MB RAM` — $0/month)**.
   - **Region:** Bắt buộc chọn **`Singapore` (`sin`)** để ping từ Việt Nam thấp nhất (~35–50ms).
4. **Cấu hình Build & Run (Builder: Buildpack):**
   - **Build command:**
     ```bash
     npm ci && npm --workspace=@vmw/api run build
     ```
   - **Run command:**
     ```bash
     node services/api/dist/server.js
     ```
   - **Port:** `4000` (HTTP + WebSocket `/ws`).
   - **Health check:** HTTP `GET /health` trên port `4000`.
5. **Thêm biến môi trường (Environment Variables):**
   - `PORT` = `4000`
   - `CORS_ORIGIN` = `https://<TEN_APP_CUA_BAN>.pages.dev` *(có thể quay lại điền chính xác sau khi deploy xong Bước 7)*.
6. **Deploy & Lấy URL Backend:**
   - Bấm **Deploy** và đợi ~1–2 phút đến khi trạng thái chuyển sang **Healthy**.
   - Koyeb sẽ cấp sẵn domain có **HTTPS & WSS miễn phí**, dạng:
     `https://<ten-service>-<org>.koyeb.app`
   - Dùng chính domain này để điền vào **Bước 7 (Cloudflare Pages)**:
     - `VITE_API_URL` = `https://<ten-service>-<org>.koyeb.app`
     - `VITE_WS_URL` = `wss://<ten-service>-<org>.koyeb.app/ws`

*(Mẹo: Gói Free của Koyeb có thể sleep nếu không có truy cập trong thời gian dài. Bạn có thể tạo tài khoản miễn phí trên [cron-job.org](https://cron-job.org/) hoặc [uptimerobot.com](https://uptimerobot.com/) để ping `https://<ten-service>-<org>.koyeb.app/health` mỗi 5–10 phút giúp giữ server luôn thức.)*

---

### Bước 7: Deploy Frontend lên Cloudflare Pages (Free)
1. Đẩy code (sau khi AI hoàn thành Phần 1) lên **GitHub**.
2. Vào [dash.cloudflare.com](https://dash.cloudflare.com/) → **Workers & Pages → Create → Pages → Connect to Git**.
3. Chọn repository của bạn và điền cấu hình Build:
   - **Build command:** `npm ci && npm --workspace=@vmw/web run build`
   - **Build output directory:** `apps/web/dist`
4. Vào **Settings → Environment variables** thêm các biến:
   - `VITE_API_URL` = `https://<DOMAIN_API_CUA_BAN>`
   - `VITE_WS_URL` = `wss://<DOMAIN_API_CUA_BAN>/ws`
   - `VITE_TURN_URL` = `<TURN_URL_TU_BUOC_5>`
   - `VITE_TURN_USERNAME` = `<USERNAME>`
   - `VITE_TURN_CREDENTIAL` = `<CREDENTIAL>`
5. Bấm **Save and Deploy** → Sau ~1 phút bạn sẽ có link `https://<ten-app>.pages.dev` (có thể chia sẻ cho mọi người vào chung phòng ngay!).

---

## Checklist xác nhận sau khi Deploy
- [ ] Mở link Frontend `https://...pages.dev` → tải được các nhân vật Chibi 3D & 5 điệu nhảy trên trang chủ.
- [ ] Tạo phòng / Vào phòng từ 2 máy/điện thoại khác mạng (Wi-Fi + 4G) → thấy avatar của nhau di chuyển, nhảy, chat realtime.
- [ ] Bật Micro ở máy A → máy B nghe được tiếng rõ ràng.
- [ ] Kiểm tra `pm2 status` trên Oracle VM báo `online`, không crash.
