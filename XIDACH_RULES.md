# Luật chơi GamEO Xì Dách (Official Rules)

Tài liệu này tổng hợp toàn bộ logic vận hành, luật thắng thua và các quy tắc đặc biệt của nền tảng GamEO Xì Dách.

## 1. Giá trị quân bài
- **2 - 10**: Tính theo điểm số trên lá bài.
- **J, Q, K**: Tính là 10 điểm.
- **Quân Át (Ace)**: Tính linh hoạt là **1, 10, hoặc 11** điểm để có lợi nhất cho người chơi (miễn là tổng không vượt quá 21).

## 2. Thứ tự ưu tiên bộ bài (Hierarchy)
Từ cao xuống thấp:
1.  **Xì Bàng**: 2 lá Át (AA).
2.  **Xì Dách**: 1 lá Át + 1 lá 10/J/Q/K.
3.  **Ngũ Linh**: 5 lá bài có tổng điểm <= 21.
4.  **Điểm số**: Tổng điểm từ 16 đến 21.
    -   *Lưu ý: Nếu cả hai cùng bộ bài đặc biệt giống nhau thì tính là **Hòa**.*

## 3. Quy tắc Rút bài (Hit) và Dừng (Stand)
### Đối với Người chơi:
-   **Đủ tuổi**: Phải đạt tối thiểu **16 điểm** mới được quyền Dừng (Stand) thủ công.
-   **Auto-Action (Hết giờ)**: Nếu hết 30 giây người chơi không thao tác:
    -   **Trường hợp Online**: Hệ thống tự động thực hiện hành động (Rút bài nếu < 16đ, Dừng bài nếu >= 16đ).
    -   **Trường hợp Offline (Mất kết nối)**: Người chơi bị xử phạt **Rage Quit** (Xử thua ngay, trừ tiền cược) và bị Kick khỏi ghế ngay lập tức.
-   **Quắc (Bust)**: Tổng điểm từ **22 đến 27**. Người chơi **không bị tự động Dừng** khi Quắc, có thể rút tiếp cho đến khi đủ 5 lá hoặc bị Đền.
-   **Đền (Penalty)**: Tổng điểm **>= 28**. Người chơi bị xử thua ngay lập tức và trạng thái chuyển sang `den`.
-   **Giới hạn**: Tối đa 5 lá bài.

### Đối với Nhà cái:
-   **Quyền Xét bài**: Nhà cái phải đạt tối thiểu **15 điểm** hoặc đã rút đủ **5 lá bài** mới được quyền Xét (Check) người chơi.
-   **Tự động Reset (Dealer AFK)**: Nếu Nhà cái vắng mặt hoặc không thao tác quá **60 giây**:
    -   **Trong ván bài**: Hệ thống ép Nhà cái thực hiện hành động tự động (Rút bài hoặc Xét bài tất cả) để bảo vệ quyền lợi người chơi.
    -   **Ngoài ván bài**: Hệ thống tự động hoàn tiền cược (nếu có) và xóa vị trí Nhà cái để người khác có thể lên thay thế.
-   **Thắng bộ đặc biệt**: Nếu Nhà cái thắng bằng bộ đặc biệt, người chơi phải trả tiền theo hệ số tương ứng (**x4 cho Xì Bàng, x3 cho Xì Dách, x2 cho Ngũ Linh**).

## 4. Quy tắc Thanh toán (Settlement)
-   **Thắng/Thua thông thường**: Thưởng/Trừ đúng số tiền người chơi đã đặt cược.
-   **Thắng bộ đặc biệt**: Thưởng theo hệ số tương ứng (x4, x3, x2).
-   **Phạt Thoát ván (Rage Quit)**: Người chơi tự ý rời bàn hoặc mất kết nối quá thời gian khi đang trong ván bài sẽ bị xử thua và mất trắng số tiền đã cược cho Nhà cái.
-   **Phạt Đền (Penalty >= 28đ)**: Người chơi bị phạt **tổng tiền cược của tất cả các cửa trên bàn**.
-   **Trường hợp Hòa**: Không trừ tiền, ghi log giao dịch 0đ để minh bạch.

## 5. Tính minh bạch và Bảo mật (Integrity)
-   **Round ID**: Mỗi ván bài có một mã định danh duy nhất.
-   **Idempotency**: Mọi giao dịch tiền tệ đều được kiểm tra mã kiểm trùng (Mã vòng) để đảm bảo không bị trừ tiền nhiều lần cho cùng một sự kiện (ngay cả khi mạng chập chờn).
-   **Atomic RPC**: Tiền được trừ và Log được ghi đồng thời thông qua các hàm Database tập trung.
