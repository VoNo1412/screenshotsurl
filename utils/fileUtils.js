const fs = require('fs');
const archiver = require('archiver');

// Đọc dữ liệu từ file Excel hoặc TXT
const readFileData = (filePath, fileExt) => {
    if (fileExt === '.xlsx' || fileExt === '.xls') {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    } else if (fileExt === '.txt') {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        return fileContent
            .split(',')
            .map((link) => link.trim())
            .filter((link) => link.startsWith('https'))
            .map((link, index) => ({ Link: link, Index: index + 1 }));
    }
    throw new Error('Unsupported file format');
};

// Tạo file ZIP từ thư mục
const zipFolder = async (folderPath, zipPath) => {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => resolve());
        archive.on('error', (err) => reject(err));

        archive.pipe(output);
        archive.directory(folderPath, false);
        archive.finalize();
    });
};

// Đảm bảo thư mục tồn tại
const ensureFolderExists = (folderPath) => {
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }
};

module.exports = {
    readFileData,
    zipFolder,
    ensureFolderExists,
};
