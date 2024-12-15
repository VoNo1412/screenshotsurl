const puppeteer = require('puppeteer');
const path = require('path');

async function captureScreenshots(url, selector, outputDir, extra_number = 0) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const results = [];

    try {
        // Navigate to the page
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });
        await page.waitForSelector(selector);
        await page.waitForSelector(".blocker");
        const contentElements = await page.$$(selector);
        const overflowAds = await page.$(".blocker");
        await overflowAds.evaluate((el) => el.style.display = 'none');

        console.log(`Found special ${contentElements.length} products.`);

        // Get product positions
        let count = 0;
        for (let i = 0; i < contentElements.length; i++) {
            // if (count == 2) {
                const imageName = `product_${Date.now()}.png`;
                const fullImagePath = path.join(outputDir, imageName);
                const contentElement = contentElements[i];
                const position = await contentElement.boundingBox(); // Get element's position and size
                console.log("position: ", + i, position);
                if (contentElement) {
                    await contentElement.screenshot({ path: fullImagePath
                        // path: fullImagePath, clip: {
                        //     x: 0,
                        //     y: 587,
                        //     width: 310 * 3,
                        //     height: 541,
                        // },
                    });
                } else {
                    console.warn(`Content not found for product ${i + 1}, button ${buttonIndex + 1}.`);
                }

                // count = 0;
            }
            count++;
        // }
    } catch (error) {
        console.error('Error capturing screenshots:', error.message);
    } finally {
        await browser.close();
    }

    return results;
}

async function captureScreenshotHoangHa(url) {
    const outputDir = path.join(__dirname, 'public');

    return captureScreenshots(url, '.v5-item', outputDir);
}

captureScreenshotHoangHa("https://hoanghamobile.com/dien-thoai-di-dong/iphone")

const sharp = require('sharp');
const path = require('path');

async function mergeImages(images, output) {
    try {
        // Đọc thông tin kích thước từng ảnh
        const metadataList = await Promise.all(images.map(image => sharp(image).metadata()));

        // Tính tổng chiều rộng và chọn chiều cao lớn nhất
        const totalWidth = metadataList.reduce((sum, metadata) => sum + metadata.width, 0);
        const maxHeight = Math.max(...metadataList.map(metadata => metadata.height));

        // Tạo một ảnh nền trắng với kích thước phù hợp
        const compositeImage = sharp({
            create: {
                width: totalWidth,
                height: maxHeight,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 },
            },
        });

        // Tạo danh sách các layer để ghép ảnh
        let left = 0;
        const layers = images.map((image, index) => {
            const layer = { input: image, top: 0, left }; // Vị trí ngang
            left += metadataList[index].width; // Tăng chiều ngang cho layer tiếp theo
            return layer;
        });

        // Ghép các ảnh vào ảnh nền
        await compositeImage
            .composite(layers)
            .toFile(output);

        console.log(`Đã ghép ảnh thành công: ${output}`);
    } catch (error) {
        console.error('Lỗi khi ghép ảnh:', error.message);
    }
}

// Đường dẫn đến các ảnh và ảnh đầu ra
const images = [
    path.join(__dirname, 'public/product_1734234646230.png'),
    path.join(__dirname, 'public/product_1734234647148.png'),
    path.join(__dirname, 'public/product_1734234646566.png'),
];
const output = path.join(__dirname, 'public/merged_horizontal.png');

// Gọi hàm ghép ảnh
mergeImages(images, output);
