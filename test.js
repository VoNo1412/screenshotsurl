const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function captureScreenshotsByProducts(url, buttonSelector, contentSelector, outputDir) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const results = [];

    try {
        // Truy cập vào trang web
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });

        // Chờ nội dung hiển thị
        await page.waitForSelector(contentSelector);

        // Lấy danh sách các phần tử contentSelector (từng sản phẩm)
        const contentElements = await page.$$(contentSelector);
        console.log(`Found special ${contentElements.length} products.`);


        // Lặp qua từng sản phẩm
        for (let i = 0; i < contentElements.length; i++) {
            // Lấy danh sách các nút trong sản phẩm
            const buttons = await contentElements[i].$$(`${buttonSelector}`);
            console.log(`Found ${buttons.length} buttons for product ${i + 1}.`);

            // Lặp qua từng nút trong sản phẩm
            for (let buttonIndex = 0; buttonIndex < buttons.length; buttonIndex++) {
                // Click vào nút
                await buttons[buttonIndex].click();

                // Tạo tên file ảnh
                const imageName = `product_${i + 1}_model_${buttonIndex + 1}_${Date.now()}.png`;
                const fullImagePath = path.join(outputDir, imageName);

                // Đảm bảo thư mục tồn tại
                if (!fs.existsSync(outputDir)) {
                    fs.mkdirSync(outputDir, { recursive: true });
                }

                const buttonHTML = await page.evaluate(button => button.textContent, buttons[buttonIndex]);
                console.log(`Button ${buttonIndex + 1} HTML content: ${buttonHTML}`);

                // Chụp ảnh màn hình vùng nội dung
                const contentElement = contentElements[i];
                if (contentElement) {
                    await contentElement.screenshot({ path: fullImagePath });
                    console.log(`Screenshot saved: ${fullImagePath}`);

                    // Lưu kết quả
                    results.push({
                        productIndex: i + 1,
                        buttonIndex: buttonIndex + 1,
                        imagePath: fullImagePath,
                    });
                } else {
                    console.warn(`Content not found for product ${i + 1}, button ${buttonIndex + 1}.`);
                }
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await browser.close();
    }

    return results;
}

// Example usage
async function FPTSpecial(url) {
    const buttonSelector = 'ul.flex li button'; // Selector cho các nút trong sản phẩm
    const contentSelector = '.ProductCard_brandCard__VQQT8'; // Selector của nội dung cần chụp
    const outputDir = path.join(__dirname, 'public', 'screenshots');

    const screenshots = await captureScreenshotsByProducts(url, buttonSelector, contentSelector, outputDir);
    console.log('Screenshots captured:', screenshots);
}
