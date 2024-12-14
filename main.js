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
const CONSTANT = require("./utils/constants");
const { captureScreenshot24Store, captureScreenshotDiDongViet, captureScreenshotTheGioiDiDong, captureScreenshotHoangHa, captureScreenshotFPT } = require("./utils/screenshotUtils");
// Port của server
const PORT = 3000;

// Cấu hình multer để upload file Excel
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Thư mục lưu file upload
        cb(null, path.join(__dirname, 'uploads'));
    },
    filename: (req, file, cb) => {
        // Sử dụng tên file gốc
        cb(null, file.originalname);
    }
});

const upload = multer({ storage });

// Middleware và cấu hình EJS
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Trang chính
app.get('/', (req, res) => {
    res.render('index');
});
app.get('/screen_react', (req, res) => {
    res.render('screen_react');
});

// Hàm chụp màn hình từ link
async function captureScreenshot(url, imagePath) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    try {
        await page.goto(url, { waitUntil: 'networkidle2' });
        await page.screenshot({ path: imagePath, fullPage: true });
    } catch (err) {
        console.error(`Error capturing screenshot for ${url}:`, err.message);
    } finally {
        await browser.close();
    }
}

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
let isStopped = false; // Biến trạng thái theo dõi dừng chương trình
io.on('connection', (socket) => {
    console.log('User connected');

    // Lắng nghe sự kiện "stopProcess" từ client
    socket.on('stopProcess', () => {
        isStopped = true; // Đánh dấu quá trình đã dừng
        socket.emit('uploadStatus', { message: 'Process stopped!' });
        console.log('Processing stopped by user');
    });

    // Lắng nghe sự kiện "startProcess" để bắt đầu lại
    socket.on('startProcess', () => {
        isStopped = false; // Đặt lại trạng thái dừng
        socket.emit('uploadStatus', { message: 'Process started!' });
        console.log('Processing started');
    });
});

app.post('/upload', upload.single('fileUpload'), async (req, res) => {
    try {
        const filePath = req.file.path;
        const fileExt = path.extname(filePath).toLowerCase();
        let data = []; // Mảng lưu dữ liệu từ file (Excel hoặc TXT)

        // Đọc dữ liệu từ file
        if (fileExt === '.xlsx' || fileExt === '.xls') {
            // Đọc file Excel
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
        } else if (fileExt === '.txt') {
            // Đọc file TXT
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            // Tách các liên kết, loại bỏ dấu phẩy và khoảng trắng thừa
            const links = fileContent
                .split(',') // Tách qua dấu phẩy
                .map(link => link.trim()) // Xóa khoảng trắng thừa
                .filter(link => link.startsWith('https')); // Chỉ giữ các link hợp lệ bắt đầu bằng "http"

            if (links.length === 0) {
                return res.status(400).send('No valid links found in the TXT file.');
            }

            data = links.map((link, index) => ({ Link: link, Index: index + 1 }));
        } else {
            return res.status(400).send('Unsupported file format. Please upload an Excel or TXT file.');
        }

        // Tạo thư mục lưu ảnh chụp
        const outputDir = path.join(__dirname, 'public', 'screenshots');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Gửi thông báo bắt đầu xử lý
        io.emit('uploadStatus', { message: 'Processing started' });

        let processedImages = []; // Mảng lưu ảnh đã xử lý

        // Xử lý từng URL
        console.log('isStopper: ', isStopped)
        for (let i = 0; i < data.length; i++) {
            if (isStopped) {
                console.log('Processing stopped by user.');
                break; // Dừng vòng lặp nếu trạng thái dừng được kích hoạt
            }

            const link = data[i].Link; // Cột "Link" chứa URL
            if (link) {
                const currentDate = new Date().toISOString().replace(/[-T:.Z]/g, '');
                const imageName = `screenshot_${currentDate}_${i + 1}.png`;
                const imagePath = path.join(outputDir, imageName);

                try {
                    // Chụp ảnh từ URL
                    await captureScreenshot(link, imagePath);
                    data[i].Image = `/screenshots/${imageName}`; // Lưu đường dẫn ảnh
                    processedImages.push({ productLink: link, imagePath: data[i].Image });

                    // Gửi tiến độ đến client
                    io.emit('updateProgress', {
                        totalFiles: data.length,
                        processedFiles: {
                            imagePath: processedImages[processedImages.length - 1].imagePath,
                            productLink: processedImages[processedImages.length - 1].productLink
                        }
                    });
                } catch (err) {
                    console.error(`Error capturing screenshot for ${link}:`, err.message);

                    // Gửi thông báo lỗi nếu có sự cố
                    io.emit('updateProgress', {
                        totalFiles: data.length,
                        processedFiles: {
                            imagePath: '', // Gửi thông báo lỗi
                            productLink: link
                        }
                    });
                }
            }
        }

        // Tạo file ZIP chứa ảnh
        const zipPath = path.join(__dirname, 'public', 'screenshots.zip');
        await zipFolder(outputDir, zipPath);

        // Xóa file upload ban đầu
        await fs.promises.unlink(filePath);

        io.emit('success_render', { message: 'Processing completed. Download zip at /downloadFolder.' });
        res.status(200).send('Processing completed successfully.');
    } catch (err) {
        console.error('Error processing file:', err.message);
        res.status(500).send('Error processing file.');
    }
});

app.post('/upload_react', upload.single('fileUpload'), async (req, res) => {
    try {
        const filePath = req.file.path;
        const fileExt = path.extname(filePath).toLowerCase();
        let data = []; // Mảng lưu dữ liệu từ file (Excel hoặc TXT)

        // Đọc dữ liệu từ file
        if (fileExt === '.xlsx' || fileExt === '.xls') {
            // Đọc file Excel
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
        } else if (fileExt === '.txt') {
            // Đọc file TXT
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            // Tách các liên kết, loại bỏ dấu phẩy và khoảng trắng thừa
            const links = fileContent
                .split(',') // Tách qua dấu phẩy
                .map(link => link.trim()) // Xóa khoảng trắng thừa
                .filter(link => link.startsWith('https')); // Chỉ giữ các link hợp lệ bắt đầu bằng "http"

            if (links.length === 0) {
                return res.status(400).send('No valid links found in the TXT file.');
            }

            data = links.map((link, index) => ({ Link: link, Index: index + 1 }));
        } else {
            return res.status(400).send('Unsupported file format. Please upload an Excel or TXT file.');
        }

        // Tạo thư mục lưu ảnh chụp
        const outputDir = path.join(__dirname, 'public', 'screenshots');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Gửi thông báo bắt đầu xử lý
        io.emit('uploadStatus', { message: 'Processing started' });

        // Xử lý từng URL
        console.log('isStopper: ', isStopped)
        for (let i = 0; i < data.length; i++) {
            if (isStopped) {
                console.log('Processing stopped by user.');
                break; // Dừng vòng lặp nếu trạng thái dừng được kích hoạt
            }

            const link = data[i].Link; // Cột "Link" chứa URL
            console.log("this is link: ", link);
            if (link) {
                try {
                    let result = []
                    if (link.includes(CONSTANT.DI_DONG_VIET)) {
                        result = await captureScreenshotDiDongViet(link, outputDir); //result type array
                    }

                    if (link.includes(CONSTANT.THE_GIOI_DI_DONG)) {
                        result = await captureScreenshotTheGioiDiDong(link, outputDir); //result type array
                    }

                    if (link.includes(CONSTANT['24H_STORE'])) {
                        result = await captureScreenshot24Store(link, outputDir); //result type array
                    }

                    if (link.includes(CONSTANT.HOANG_HA)) {
                        result = await captureScreenshotHoangHa(link, outputDir); //result type array
                    }
                    
                    if (link.includes(CONSTANT.FPT)) {
                        result = await captureScreenshotFPT(link, outputDir); //result type array
                    }
                    console.log("result: ", result)
                    // Gửi tiến độ đến client
                    io.emit('updateProgressReact', {
                        totalFiles: data.length,
                        processed: i,
                        products: result,
                    });
                } catch (err) {
                    console.error(`Error capturing screenshot for ${link}:`, err.message);

                    // Gửi thông báo lỗi nếu có sự cố
                    io.emit('updateProgressReact', {
                        totalFiles: 0,
                        products: []
                    });
                }
            }
        }

        // Tạo file ZIP chứa ảnh
        const zipPath = path.join(__dirname, 'public', 'screenshots.zip');
        await zipFolder(outputDir, zipPath);

        // Xóa file upload ban đầu
        await fs.promises.unlink(filePath);

        io.emit('success_render', { message: 'Processing completed. Download zip at /downloadFolder.' });
        res.status(200).send('Processing completed successfully.');
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

app.get('/clean_up_folder', (req, res) => {
    cleanUp();
})

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

// Kiểm tra và tạo thư mục cần thiết
// const ensureFolderExists = (folderPath) => {
//     if (!fs.existsSync(folderPath)) {
//         fs.mkdirSync(folderPath, { recursive: true });
//         console.log(`Created folder: ${folderPath}`);
//     }
// };

// ensureFolderExists(path.join(__dirname, 'uploads'));
// ensureFolderExists(path.join(__dirname, 'public'));

// // Xử lý sự kiện khi server tắt
// process.on('exit', cleanUp);
// process.on('SIGINT', () => {
//     console.log('Server is shutting down...');
//     cleanUp();
//     process.exit();
// });

// Khởi động server với Socket.IO
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
