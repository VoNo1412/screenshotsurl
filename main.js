const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const http = require('http');
const socketIo = require('socket.io');

// Khởi tạo ứng dụng Express
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Port của server
const PORT = 3000;

// Cấu hình multer để upload file Excel
const upload = multer({ dest: 'uploads/' });

// Middleware và cấu hình EJS
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Trang chính
app.get('/', (req, res) => {
    res.render('index');
});

// Hàm chụp màn hình từ link
async function captureScreenshot(url, imagePath) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    try {
        await page.goto(url, { waitUntil: 'networkidle2' });
        await page.screenshot({ path: imagePath, fullPage: true });
        console.log(`Screenshot saved: ${imagePath}`);
    } catch (err) {
        console.error(`Error capturing screenshot for ${url}:`, err.message);
    } finally {
        await browser.close();
    }
}

// Hàm nén thư mục ảnh thành file ZIP
function zipFolder(sourceDir, outputPath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => resolve());
        archive.on('error', (err) => reject(err));

        archive.pipe(output);
        archive.directory(sourceDir, false);
        archive.finalize();
    });
}

// Xử lý upload file và export ảnh
app.post('/upload', upload.single('excelFile'), async (req, res) => {
    try {
        const filePath = req.file.path;
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        // Thư mục lưu ảnh chụp
        const outputDir = path.join(__dirname, 'public', 'screenshots');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Cập nhật số lượng file cần xử lý
        io.emit('uploadStatus', { message: 'Processing started' });

        let processedImages = []; // Mảng lưu trữ ảnh đã chụp

        // Xử lý dữ liệu và chụp ảnh
        for (let i = 0; i < data.length; i++) {
            const link = data[i].Link; // Cột Link chứa URL
            if (link) {
                const currentDate = new Date().toISOString().replace(/[-T:.Z]/g, ''); // Tạo chuỗi ngày tháng
                const imageName = `screenshot_${currentDate}_${i + 1}.png`; // Thêm ngày vào tên ảnh
                const imagePath = path.join(outputDir, imageName);

                try {
                    await captureScreenshot(link, imagePath);
                    data[i].Image = `/screenshots/${imageName}`;  // Lưu đường dẫn ảnh
                    processedImages.push({ productLink: link, imagePath: data[i].Image }); // Thêm ảnh và link vào mảng

                    // Gửi tiến độ đến client
                    io.emit('updateProgress', {
                        totalFiles: data.length,
                        processedFiles: {
                            imagePath: processedImages[processedImages.length - 1].imagePath, // latest image URL
                            productLink: processedImages[processedImages.length - 1].productLink // link for the last product
                        }
                    });
                } catch (err) {
                    console.error(`Error capturing screenshot for ${link}:`, err.message);
                    // Gửi thông báo lỗi nếu có sự cố
                    io.emit('updateProgress', {
                        totalFiles: data.length,
                        processedFiles: {
                            imagePath: '', // Có thể chỉ gửi thông báo lỗi
                            productLink: link
                        }
                    });
                }
            }
        }

        // Tạo file ZIP chứa ảnh
        const zipPath = path.join(__dirname, 'public', 'screenshots.zip');
        await zipFolder(outputDir, zipPath);

        // Xóa file Excel upload ban đầu
        fs.unlinkSync(filePath);

        io.emit('success_render', { message: 'Processing completed. Download zip at /downloadFolder.' });
    } catch (err) {
        console.error('Error processing file:', err.message);
        res.status(500).send('Error processing file.');
    }
});

// Tạo route download folder ảnh
app.get('/downloadFolder', (req, res) => {
    const folderPath = path.join(__dirname, 'public', 'screenshots');
    const zipPath = path.join(__dirname, 'public', 'screenshots.zip');

    // Kiểm tra nếu thư mục ảnh tồn tại
    if (!fs.existsSync(folderPath)) {
        return res.status(404).send('Folder not found');
    }

    // Kiểm tra nếu file zip tồn tại
    if (!fs.existsSync(zipPath)) {
        return res.status(404).send('ZIP file not found');
    }

    // Tạo file zip để chứa tất cả ảnh
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    // Cấu hình stream
    output.on('close', () => {
        console.log(`Folder has been zipped (${archive.pointer()} total bytes)`);
        res.download(zipPath, 'screenshots.zip', (err) => {
            if (err) {
                console.error('Error downloading file:', err);
            }
            // Xóa file zip và thư mục ảnh sau khi tải xong
            fs.unlinkSync(zipPath);
            fs.rmdirSync(folderPath, { recursive: true }); // Xóa thư mục 'screenshots' nếu cần
        });
    });

    archive.on('error', (err) => {
        res.status(500).send({ error: err.message });
    });

    archive.pipe(output);

    // Thêm tất cả ảnh từ folder vào file zip
    archive.directory(folderPath, false);

    // Finalize zip file
    archive.finalize();
});

// Hàm xóa file khi server tắt
function cleanUp() {
    const folderPath = path.join(__dirname, 'public', 'screenshots');
    const zipPath = path.join(__dirname, 'public', 'screenshots.zip');
    // Kiểm tra nếu thư mục ảnh tồn tại thì xóa
    if (fs.existsSync(folderPath)) {
        fs.rmdirSync(folderPath, { recursive: true });
    }
    // Kiểm tra nếu file zip tồn tại thì xóa
    if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
    }
}

// Xử lý sự kiện khi server tắt
process.on('exit', cleanUp);
process.on('SIGINT', () => {
    console.log('Server is shutting down...');
    cleanUp();
    process.exit();
});

// Khởi động server với Socket.IO
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
