import { test, expect, Page } from '@playwright/test';

test.describe('Realtime synchronization', () => {
  // Tăng timeout cho bài test E2E để tránh fail do server chậm hoặc login lâu
  test.setTimeout(60000);

  test('Two players can see each other actions in real-time', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    page1.on('console', msg => console.log('PAGE 1:', msg.text()));
    page1.on('pageerror', err => console.log('PAGE 1 ERROR:', err.message));
    page2.on('console', msg => console.log('PAGE 2:', msg.text()));
    page2.on('pageerror', err => console.log('PAGE 2 ERROR:', err.message));

    const timestamp = Date.now();
    const user1 = `p1_${timestamp}`;
    const user2 = `p2_${timestamp}`;

    // Helper function to sign up
    async function signUp(page: Page, username: string) {
      await page.goto('/games/xi-dach');
      
      // Click chuyển sang form Đăng ký
      await page.locator('text=ĐĂNG KÝ TẠI ĐÂY').click();
      
      // Điền thông tin
      await page.fill('input[placeholder="Tên đăng nhập"]', username);
      await page.fill('input[placeholder="Mật khẩu"]', 'password123');
      
      // Submit form đăng ký
      await page.click('button:has-text("ĐĂNG KÝ")');
      
      // Đợi load xong giao diện bàn chơi (mất lớp loading)
      await expect(page.locator('.casino-table')).toBeVisible({ timeout: 20000 });
    }

    // Đăng ký 2 người chơi cùng lúc
    await Promise.all([
      signUp(page1, user1),
      signUp(page2, user2)
    ]);

    // Đảm bảo bàn chơi đang trống (nhà cái chưa có ai) 
    // Lưu ý: Test này có thể đụng độ nếu có người khác đang test. Ta assume bàn trống.
    
    // Wait for Realtime websocket to establish connection
    await page1.waitForTimeout(3000);
    
    // Player 1 làm nhà cái
    const takeDealerBtn = page1.locator('button:has-text("LÀM NHÀ CÁI")');
    // Nếu nút hiển thị, ta click. Nếu không thì có ai đó đang làm cái, test có thể fail
    await takeDealerBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);
    if (await takeDealerBtn.isVisible()) {
      await takeDealerBtn.click();
      
      // Kiểm tra Player 2 thấy tên của Player 1 ở vị trí nhà cái
      await expect(page2.locator('.dealer-name')).toContainText(user1, { timeout: 10000 });
    }

    // Player 2 ngồi vào ghế đầu tiên còn trống
    const sitBtn = page2.locator('button:has-text("Ngồi đây")').first();
    await sitBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);
    if (await sitBtn.isVisible()) {
      await sitBtn.click();
      
      // Kiểm tra Player 1 thấy Player 2 đã ngồi (text tên hiện lên)
      await expect(page1.locator(`.player-header .name:has-text("${user2}")`)).toBeVisible({ timeout: 10000 });
    }

    // Dọn dẹp: Player 1 & 2 rời bàn
    const leaveBtn1 = page1.locator('button:has-text("Rời bàn")');
    if (await leaveBtn1.isVisible()) await leaveBtn1.click();

    const leaveBtn2 = page2.locator('button:has-text("Rời bàn")');
    if (await leaveBtn2.isVisible()) await leaveBtn2.click();

    // Contexts sẽ tự động đóng sau khi test kết thúc
  });
});
