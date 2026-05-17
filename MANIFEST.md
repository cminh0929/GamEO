# GamEO - Project Manifest & Progress Roadmap

Tài liệu này đóng vai trò là "Bản khai thông tin" cốt lõi của GamEO, giúp hệ thống và các phiên làm việc của AI hiểu rõ cấu trúc dự án, cách vận hành, tiến trình hiện tại và các nhiệm vụ kế tiếp.

## 1. Tổng Quan Dự Án (Project Metadata)
- **Tên dự án**: GamEO (Sòng bài trực tuyến đa nền tảng đẳng cấp)
- **Phiên bản**: 0.1.0 (Bản nâng cấp sòng bài đa game)
- **Môi trường cục bộ**: `http://localhost:3000`
- **Môi trường cơ sở dữ liệu**: Supabase (Realtime Enabled, RLS Bypassed cho CLI testing bằng Service Key)

## 2. Ngăn Xếp Công Nghệ (Tech Stack & Dependencies)
- **Frontend/Backend Framework**: Next.js 16.2.6 (App Router), React 19.2.4
- **Database**: PostgreSQL (Supabase JS SDK ^2.105.4)
- **Testing**: Vitest ^4.1.6 (Unit Tests), Playwright ^1.60.0 (E2E Tests)
- **Runtime**: Node.js với TypeScript (tsx)

## 3. Các Lệnh Vận Hành Cốt Lõi (Core Commands)
- Chạy môi trường Dev: `npm run dev`
- Build dự án: `npm run build`
- Chạy toàn bộ test suite (Xì Dách): `npm run test:game:all`
- Chạy test Xì Dách thủ công bằng CLI: `npm run test:game:cli`
- Kiểm tra số dư người chơi và bot: `npx tsx scratch/check_balances.ts`
- Xem log giao dịch gần đây: `npx tsx scratch/check_logs.ts`
- Reset trạng thái bàn chơi: `npx tsx scratch/reset_db.ts`

## 4. Kiến Trúc & Các Điểm Đầu Vào (Entry Points & Architecture)
- **Giao diện sảnh chính (Lobby)**: [page.tsx](file:///d:/01_Dev/_Workspaces/Active/GamEO/src/app/page.tsx)
- **Game Xì Dách chính**: [page.tsx](file:///d:/01_Dev/_Workspaces/Active/GamEO/src/app/games/xi-dach/page.tsx)
- **Core Game Engine (Xì Dách)**: [XiDachEngine.ts](file:///d:/01_Dev/_Workspaces/Active/GamEO/src/lib/game/XiDachEngine.ts)
- **Dịch vụ Tài chính**: [FinanceService.ts](file:///d:/01_Dev/_Workspaces/Active/GamEO/src/lib/services/FinanceService.ts)
- **Dịch vụ Quản lý Phòng**: [GameRoomService.ts](file:///d:/01_Dev/_Workspaces/Active/GamEO/src/lib/services/GameRoomService.ts)
- **CLI Game Tester**: [cli.ts](file:///d:/01_Dev/_Workspaces/Active/GamEO/tests/game/cli.ts)

## 5. Trạng Thái Tiến Độ Dự Án (Milestone & Feature Tracker)

### 🟢 Đã hoàn thành (Completed)
- [x] Tái cấu trúc GamEO từ game đơn lẻ sang **Nền tảng Sòng bài đa game** (Lobby `/`, game con tại `/games/[slug]`).
- [x] Tách cấu trúc OOP chuyên biệt: `Deck.ts`, `Hand.ts` cho game bài.
- [x] Cơ chế **Anti-Cheat & Tự động AFK (Self-Healing)** để tránh kẹt bàn chơi.
- [x] Khắc phục triệt để Race Condition giao dịch bằng **Postgres SQL RPC (`update_balance`)**.
- [x] Cơ chế chặn treo multi-browser/multi-tab cùng user bằng **BroadcastChannel API (`useTabGuard`)**.
- [x] Route Protection bằng `AuthGuard` bảo vệ các sảnh chơi game.
- [x] Trường nhập lại mật khẩu (Confirm Password) khi Đăng ký thành viên.
- [x] Quy tắc **Dưới 16 trừ Nhà Cái** (Nhà Cái chỉ cần 15đ để xét/dằn).
- [x] Luật **>= 28 điểm đền bàn** (Đền tổng cược bàn cho Nhà Cái, tự động tước lượt và chặn rút thêm bài hoàn toàn).
- [x] Cơ chế **Tự động Dằn bài (Auto-Stand) vô điều kiện** khi hết 30 giây lượt chơi cho người chơi thật.

### 🟡 Đang phát triển (In-Progress)
- [ ] **Admin Dashboard**: Giao diện quản lý dòng tiền, điều chỉnh số dư và phát hiện giao dịch bất thường (Anomaly Detection), kích hoạt bằng phím tắt `ctrl + /` cho tài khoản `admin`.
- [ ] **Auto-Test Hardening**: Cấu hình tự động kiểm thử toàn bộ 14 Adversarial Cases (Double Penalty, Dealer AFK, Draw Score) trong CI/CD.

### 🔴 Dự kiến tiếp theo (Next Up)
- [ ] Tích hợp cơ sở dữ liệu hoàn thiện cho nhiều phòng chơi khác nhau.
- [ ] Xây dựng game bài thứ hai: **Tài Xỉu (Dice Game)** hoặc **Mậu Binh**.

## 6. Handoff State (Phiên làm việc hiện tại)
- **Tập tin đang mở**: [useXiDachRoom.ts](file:///d:/01_Dev/_Workspaces/Active/GamEO/src/hooks/useXiDachRoom.ts#L440)
- **Mục tiêu phiên kế tiếp**: Triển khai thiết kế giao diện và logic cho Admin Panel (`AdminPanel.tsx` và `PlatformShell.tsx` listener).
