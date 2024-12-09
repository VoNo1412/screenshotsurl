const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // Mở trang web sản phẩm
    await page.goto('https://didongviet.vn/', { waitUntil: 'load', timeout: 0 });

    await page.waitForSelector('a'); // Chờ cho các thẻ <a> xuất hiện
    await page.waitForSelector('img'); // Chờ cho các thẻ <a> xuất hiện

    // Lọc các thẻ <a> có thuộc tính title chứa "iphone" (không phân biệt chữ hoa và chữ thường)
    const productPositions = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a')); // Lấy tất cả các thẻ <a>
        return links.filter(link => link.title && link.title.toLowerCase().includes('iphone'))
                    .map(link => {
                        const rect = link.getBoundingClientRect(); // Lấy tọa độ của thẻ
                        return {
                            href: link.href,
                            title: link.title,
                            top: rect.top,
                            left: rect.left,
                            right: rect.right,
                            bottom: rect.bottom,
                            width: rect.width,
                            height: rect.height
                        };
                    });
    });

    console.log('Các sản phẩm có title chứa "iphone" và tọa độ:', productPositions);

    // Cắt ảnh theo các tọa độ đã lấy
    for (let i = 0; i < productPositions.length; i++) {
        const position = productPositions[i];
        console.log(position)
        // Kiểm tra nếu width và height hợp lệ
        if (position.width > 0 && position.height > 0) {
            const imagePath = `./public/screenshot/product_${i + 1}.png`;

            // Chụp ảnh của phần tử theo tọa độ
            await page.screenshot({
                path: imagePath,
                clip: {
                    x: position.left,
                    y: position.top,
                    width: position.width,
                    height: position.height
                }
            });

            console.log(`Đã cắt ảnh cho sản phẩm: ${position.title} và lưu vào ${imagePath}`);
        } else {
            console.log(`Không thể cắt ảnh cho sản phẩm: ${position.title} vì kích thước không hợp lệ`);
        }
    }

    await browser.close();
})();
