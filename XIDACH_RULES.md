# Luật chơi GamEO Xì Dách (Official Rules)

Tài liệu này tổng hợp toàn bộ logic vận hành, luật thắng thua và các quy tắc đặc biệt của nền tảng GamEO Xì Dách. Bộ luật được đồng bộ trực tiếp từ logic xử lý trong hệ thống (`src/lib/game/XiDachEngine.ts` và `src/hooks/useXiDachRoom.ts`).

## 1. Giá trị quân bài và Tính điểm
*   **Các lá bài từ 2 -> 10**: Tính điểm bằng giá trị ghi trên lá.
*   **Các lá J, Q, K**: Tính là **10 điểm**.
*   **Lá Át (A)**:
    *   Nếu bài đang có **4 hoặc 5 lá**: Át **bắt buộc tính là 1 điểm**.
    *   Nếu bài có **2 hoặc 3 lá**: Át được tính là **1, 10, hoặc 11 điểm** (hệ thống tự động tối ưu hóa điểm cao nhất nhưng <= 21 để mang lại lợi thế cao nhất cho người chơi).

## 2. Thứ tự ưu tiên bộ bài (Hierarchy) & Hệ số thưởng
Từ cao xuống thấp:
1.  **Xì Bàng (2 lá Át)**: **Thắng x4** tiền cược.
2.  **Xì Dách (1 lá Át + 1 lá 10/J/Q/K)**: **Thắng x3** tiền cược.
3.  **Ngũ Linh (Rút đủ 5 lá mà tổng điểm <= 21)**: **Thắng x2** tiền cược.
4.  **Điểm số thông thường**: Tổng điểm từ 16 đến 21. **Thắng x1** tiền cược.
    *   *Lưu ý: Nếu người chơi và Nhà Cái có cùng tay bài đặc biệt giống nhau (VD: cùng Xì Bàng hoặc cùng Ngũ Linh) hoặc cùng điểm số, kết quả là **Hòa (Draw)** (trả lại tiền cược).*
    *   *Ngay khi chia bài, nếu người chơi có Xì Bàng/Xì Dách, trạng thái tự động chuyển thành `stay` (dằn). Nếu Nhà Cái có Xì Bàng/Xì Dách, ván bài LẬP TỨC kết thúc (`ended`) để xét toàn bàn.*

## 3. Quy tắc Rút bài (Hit) và Dằn (Stand)
### Đối với Người chơi (Player):
*   **Chưa đủ tuổi**: Phải đạt tối thiểu **16 điểm** mới được quyền Dằn (Stand) thủ công. (Ngoại lệ: Đã rút đủ 5 lá hoặc có tay bài đặc biệt).
    *   Nếu người chơi dằn lại khi tổng điểm `< 16`, sẽ bị xử Thua ngay lập tức (trừ khi có tay bài đặc biệt).
*   **Giới hạn lá bài**: Được rút tối đa **5 lá bài**.
*   **Quắc (Bust)**: Khi tổng điểm **> 21**. Người chơi **không bị tự động qua lượt** khi Quắc, vẫn có quyền rút tiếp cho đến khi đủ 5 lá (tuy nhiên nếu Nhà Cái xét sẽ tính thua).
*   **Đền (Penalty)**: Nếu người chơi cố tình rút bài để điểm số **>= 28 điểm**, ngay lập tức trạng thái biến thành `den`. Người chơi bị xử thua và phạt **tổng tất cả tiền cược trên bàn chơi** (đền bài cho Nhà Cái).

### Đối với Nhà Cái (Dealer):
*   **Quyền Xét bài**: Chỉ được quyền "XÉT" bài người chơi khi Nhà Cái có ít nhất **15 điểm** hoặc đã **đủ 5 lá** (hoặc có tay bài đặc biệt Xì Bàng/Xì Dách).

## 4. Cơ chế Anti-Cheat & Xử lý AFK (Self-Healing)
Hệ thống giám sát và tự động xử lý mọi thao tác bị kẹt để đảm bảo ván bài luôn diễn ra suôn sẻ:
*   **Người chơi treo máy (AFK) tới lượt**:
    *   Nếu điểm `< 16` và chưa đủ 5 lá: Hệ thống **Tự động Rút bài (Auto-Hit)**.
    *   Nếu điểm `>= 16` hoặc đủ 5 lá: Hệ thống **Tự động Dằn (Auto-Stand)**.
*   **Người chơi Rage Quit (Thoát mạng ngang)**: Nếu đang trong ván (chưa được xét) mà mất kết nối, hệ thống coi như **Thua cược (Penalty)** và trừ tiền ngay lập tức bù cho Nhà Cái. Người chơi bị kick khỏi bàn.
*   **Nhà Cái treo máy/Rage Quit**:
    *   Nếu đang ở phase đặt cược: **Refund** toàn bộ tiền cho người chơi, giải tán ván.
    *   Nếu đang chơi và tất cả chưa được xét: Hệ thống ép Nhà Cái **Tự động Hit** hoặc **Auto-Check tất cả người chơi** (nếu đã đủ điểm).
*   **Self-Healing Bàn kẹt**: Bất kỳ bàn nào "đứng hình" (ví dụ: last action quá 1 phút) sẽ bị hệ thống phát hiện, trừng phạt người gây kẹt bàn (nếu có lỗi) và tự động Reset trạng thái bàn về `Empty` để tiếp tục hoạt động.

## 5. Tính minh bạch và Bảo mật (Integrity)
*   **Round ID**: Mỗi ván bài có một mã định danh duy nhất (Round Key).
*   **Idempotency Guard**: Mọi giao dịch tiền tệ (thắng/thua/hoàn tiền) đều được kiểm tra mã kiểm trùng để đảm bảo không một ai bị trừ tiền hoặc cộng tiền 2 lần cho cùng một sự kiện, ngay cả khi mạng chập chờn hay có người cố tình gửi request liên tục (Double-charge prevention).
*   **Atomic RPC**: Tiền được cập nhật và Log lịch sử được ghi đồng thời thông qua các hàm Database tập trung.
