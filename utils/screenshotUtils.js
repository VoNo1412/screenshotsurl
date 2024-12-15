const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const sharp = require("sharp");
const captureScreenshotsByProducts = require("./special_fpt")
const CONSTANTS = require('./constants');
const { ensureFolderExists } = require("./fileUtils");

/**
 * Generic function to capture screenshots of product elements on a webpage.
 * @param {string} url - The URL of the webpage to process.
 * @param {string} selector - The CSS selector for the product elements.
 * @param {string} outputDir - The directory to save screenshots.
 * @param {extra_number} extra_number - The directory to save screenshots.
 * @returns {Promise<Array>} - A list of results containing product links and image paths.
 */


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

async function captureScreenshots(url, selector, outputDir, extra_number = 0, nameWeb) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const results = [];
    const screenshotPaths = [];

    try {
        // Navigate to the page
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });
        await page.waitForSelector(selector);

        if (nameWeb == CONSTANTS.HOANG_HA) {
            await page.waitForSelector(".blocker");
            const overflowAds = await page.$(".blocker");
            await overflowAds.evaluate((el) => el.style.display = 'none');
        }

        // Get product positions
        const productPositions = await page.evaluate((selector) => {
            return Array.from(document.querySelectorAll(selector))
                .map((element) => {
                    const rect = element.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.left >= 0) {
                        return {
                            top: rect.top,
                            left: rect.left,
                            right: rect.right,
                            bottom: rect.bottom,
                            width: rect.width,
                            height: rect.height, // Adjust height as needed
                        };
                    }
                })
                .filter(Boolean); // Remove invalid elements
        }, selector);

        // Capture screenshots
        for (const position of productPositions) {
            if (position.width > 0 && position.height > 0) {
                const imageName = `product_${Date.now()}.png`;
                const fullImagePath = path.join(outputDir, imageName);

                await page.screenshot({
                    path: fullImagePath,
                    clip: {
                        x: position.left,
                        y: position.top + extra_number,
                        width: position.width,
                        height: position.height,
                    },
                });

                results.push({
                    productLink: url,
                    imagePath: `/screenshots/${imageName}`,
                });

                screenshotPaths.push(fullImagePath); // Save the screenshot path
            } else {
                console.warn(`Invalid dimensions for element at position:`, position);
            }
        }



        if (screenshotPaths.length > 0) {
            const groupDir = path.join(outputDir, nameWeb); // Thư mục ảnh đã ghép
            const oddDir = path.join(outputDir, 'group_old_images'); // Thư mục ảnh lẻ

            // Tạo hai thư mục
            ensureFolderExists(groupDir);
            ensureFolderExists(oddDir);

            // Duyệt qua mảng theo nhóm 3 ảnh
            for (let i = 0; i < screenshotPaths.length; i += 3) {
                const selectedImages = screenshotPaths.slice(i, i + 3); // Lấy nhóm 3 ảnh

                if (selectedImages.length === 3) {
                    // Nếu đủ 3 ảnh, ghép chúng lại
                    const mergedOutput = path.join(groupDir, `${nameWeb}${Date.now()}.png`);
                    await mergeImages(selectedImages, mergedOutput);
                } else {
                    // Nếu không đủ 3 ảnh, lưu từng ảnh vào thư mục ảnh lẻ
                    selectedImages.forEach((image, index) => {
                        const singleImageOutput = path.join(oddDir, `${nameWeb}${Date.now()}.png`);
                        // Copy ảnh sang file mới
                        fs.copyFileSync(image, singleImageOutput);
                        console.log(`Kept single image: ${singleImageOutput}`);
                    });
                }
            }
        } else {
            console.log('Không có ảnh nào để xử lý.');
        }
    } catch (error) {
        console.error('Error capturing screenshots:', error.message);
    } finally {
        await browser.close();
    }


    return results;
}


// Wrapper functions for different websites
async function captureScreenshotTheGioiDiDong(url, outputDir) {
    return captureScreenshots(url, '.item.ajaxed.__cate_42', outputDir, 170, CONSTANTS.THE_GIOI_DI_DONG);
}

async function captureScreenshotDiDongViet(url, outputDir) {
    return captureScreenshots(url, '.item-slider-mobile', outputDir, 0, CONSTANTS.DI_DONG_VIET);
}

async function captureScreenshot24Store(url, outputDir) {
    return captureScreenshots(url, '.frame_inner', outputDir, 0, CONSTANTS['24H_STORE']);
}

async function captureScreenshotHoangHa(url, outputDir) {
    return captureScreenshots(url, '.v5-item', outputDir, 0, CONSTANTS.HOANG_HA);
}

async function captureScreenshotFPT(url, outputDir) {
    const buttonSelector = 'ul.flex li button'; // Selector cho các nút trong sản phẩm
    const contentSelector = '.ProductCard_brandCard__VQQT8'; // Selector của nội dung cần chụp
    return captureScreenshotsByProducts(url, buttonSelector, contentSelector, outputDir, CONSTANTS.FPT);
}

module.exports = {
    captureScreenshotTheGioiDiDong,
    captureScreenshotDiDongViet,
    captureScreenshot24Store,
    captureScreenshotHoangHa,
    captureScreenshotFPT
};
