# GamEO - Project Guide & Manifest

Các chỉ dẫn cốt lõi và trạng thái tiến độ dự án được lưu trữ tập trung tại [MANIFEST.md](file:///d:/01_Dev/_Workspaces/Active/GamEO/MANIFEST.md). Vui lòng xem tệp đó trước khi viết code để hiểu cấu trúc và nhiệm vụ đang làm dở.

## Các lệnh chính:
- Chạy môi trường dev: `npm run dev`
- Build dự án: `npm run build`
- Chạy toàn bộ test suite (Xì Dách): `npm run test:game:all`
- Chạy test Xì Dách thủ công bằng CLI: `npm run test:game:cli`
- Kiểm tra số dư người chơi và bot: `npx tsx scratch/check_balances.ts`
- Xem log giao dịch gần đây: `npx tsx scratch/check_logs.ts`
- Reset trạng thái bàn chơi: `npx tsx scratch/reset_db.ts`
