const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { readFileData, zipFolder, ensureFolderExists } = require('../utils/fileUtils');
const { captureScreenshotClientReact } = require('../utils/screenshotUtils');

const router = express.Router();
const upload = multer({ dest: path.join(__dirname, '..', 'uploads') });

const outputDir = path.join(__dirname, '..', 'public', 'screenshots');
const zipPath = path.join(__dirname, '..', 'public', 'screenshots.zip');

// Đảm bảo thư mục tồn tại
ensureFolderExists(outputDir);

router.post('/upload', upload.single('fileUpload'), async (req, res) => {
    try {
        const filePath = req.file.path;
        const fileExt = path.extname(filePath).toLowerCase();

        // Đọc dữ liệu từ file
        const data = readFileData(filePath, fileExt);

        io.emit('uploadStatus', { message: 'Processing started' });

        for (let i = 0; i < data.length; i++) {
            const link = data[i].Link;
            if (!link) continue;

            try {
                const result = await captureScreenshotClientReact(link);
                io.emit('updateProgressReact', {
                    totalFiles: data.length,
                    processed: i,
                    products: result,
                });
            } catch (err) {
                console.error(`Error capturing screenshot for ${link}:`, err.message);
                io.emit('updateProgressReact', { totalFiles: 0, products: [] });
            }
        }

        // Tạo file ZIP chứa ảnh
        await zipFolder(outputDir, zipPath);
        await fs.promises.unlink(filePath);

        io.emit('success_render', { message: 'Processing completed. Download zip at /downloadFolder.' });
        res.status(200).send('Processing completed successfully.');
    } catch (err) {
        console.error('Error processing file:', err.message);
        res.status(500).send('Error processing file.');
    }
});

router.get('/downloadFolder', (req, res) => {
    if (!fs.existsSync(zipPath)) {
        return res.status(404).send('ZIP file not found');
    }
    res.download(zipPath, 'screenshots.zip', (err) => {
        if (err) console.error('Error downloading file:', err);
        fs.unlinkSync(zipPath);
        fs.rmdirSync(outputDir, { recursive: true });
    });
});

module.exports = router;
