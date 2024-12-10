const puppeteer = require('puppeteer');
const path = require('path');

/**
 * Generic function to capture screenshots of product elements on a webpage.
 * @param {string} url - The URL of the webpage to process.
 * @param {string} selector - The CSS selector for the product elements.
 * @param {string} outputDir - The directory to save screenshots.
 * @returns {Promise<Array>} - A list of results containing product links and image paths.
 */
async function captureScreenshots(url, selector, outputDir) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const results = [];

    try {
        // Navigate to the page
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });
        await page.waitForSelector(selector);

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
                        y: position.top,
                        width: position.width,
                        height: position.height,
                    },
                });

                results.push({
                    productLink: url,
                    imagePath: `/screenshots/${imageName}`,
                });
            } else {
                console.warn(`Invalid dimensions for element at position:`, position);
            }
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
    return captureScreenshots(url, '.item.ajaxed.__cate_42', outputDir);
}

async function captureScreenshotDiDongViet(url, outputDir) {
    return captureScreenshots(url, '.item-slider-mobile', outputDir);
}

async function captureScreenshot24Store(url, outputDir) {
    return captureScreenshots(url, '.frame_inner', outputDir);
}

async function captureScreenshotHoangHa(url, outputDir) {
    return captureScreenshots(url, '.v5-item', outputDir);
}

async function captureScreenshotFPT(url, outputDir) {
    return captureScreenshots(url, '.ProductCard_brandCard__VQQT8', outputDir);
}

module.exports = {
    captureScreenshotTheGioiDiDong,
    captureScreenshotDiDongViet,
    captureScreenshot24Store,
    captureScreenshotHoangHa,
    captureScreenshotFPT
};
